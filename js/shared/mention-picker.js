(function (global) {
  const mentionPickerStateMap = new WeakMap();
  const mentionOpenStateSet = new Set();
  const mentionDropdownClass = "mention-picker-dropdown";
  const mentionDropdownShowClass = "show";
  const mentionDropdownBelowClass = "show-below";
  const mentionDropdownChatThemeClass = "mention-picker-chat-theme";
  const mentionInputHandlerFlag = "mentionPickerBound";
  const mentionChatThemeVars = [
    "--chat-theme-surface",
    "--chat-theme-surface-alt",
    "--chat-theme-border",
    "--chat-theme-action-color",
    "--chat-theme-action-hover-bg",
    "--chat-theme-system-text",
    "--chat-theme-scrollbar-thumb",
    "--chat-theme-scrollbar-hover",
    "--chat-theme-input-wrapper-bg",
    "--chat-theme-input-border",
    "--chat-theme-accent",
  ];
  let mentionCleanupTimerId = 0;

  function normalizeUsername(value) {
    return (value || "").toString().trim().replace(/^@+/, "");
  }

  function normalizeAccountId(value) {
    return (value || "").toString().trim();
  }

  function getSearchLimit() {
    const parsedLimit = Number(global.APP_CONFIG?.MENTION_SEARCH_LIMIT);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return Number(global.APP_CONFIG?.POST_TAG_SEARCH_LIMIT) || 5;
    }
    return Math.floor(parsedLimit);
  }

  function getSearchDebounceMs() {
    const parsedDebounce = Number(global.APP_CONFIG?.MENTION_SEARCH_DEBOUNCE_MS);
    if (!Number.isFinite(parsedDebounce) || parsedDebounce < 0) {
      return Number(global.APP_CONFIG?.POST_TAG_SEARCH_DEBOUNCE_MS) || 250;
    }
    return Math.floor(parsedDebounce);
  }

  function getMentionCandidates(inputValue, cursorIndex) {
    const safeValue = (inputValue || "").toString();
    const safeCursorRaw = Number.isFinite(cursorIndex) ? cursorIndex : safeValue.length;
    const safeCursor = Math.max(0, Math.min(safeCursorRaw, safeValue.length));
    if (safeCursor < 0) return null;

    let tokenStart = safeCursor;
    while (tokenStart > 0) {
      const previousChar = safeValue.charAt(tokenStart - 1);
      if (/\s/.test(previousChar)) {
        break;
      }
      tokenStart -= 1;
    }

    const token = safeValue.slice(tokenStart, safeCursor);
    if (!token.startsWith("@")) {
      return null;
    }

    const prefixChar = tokenStart > 0 ? safeValue.charAt(tokenStart - 1) : "";
    if (prefixChar && /[A-Za-z0-9._]/.test(prefixChar)) {
      return null;
    }

    const query = token.slice(1);
    if (!/^[A-Za-z0-9._]{0,30}$/.test(query)) {
      return null;
    }

    return {
      start: tokenStart,
      end: safeCursor,
      query,
    };
  }

  function getMentionSearchContext(getSearchContext) {
    if (typeof getSearchContext !== "function") {
      return { privacy: null, ownerId: null };
    }

    const context = getSearchContext() || {};
    return {
      privacy:
        context.privacy === null || context.privacy === undefined
          ? null
          : Number(context.privacy),
      ownerId: normalizeAccountId(context.ownerId),
    };
  }

  function buildSearchSignature(query, searchContext) {
    const safeQuery = (query || "").toString().trim().toLowerCase();
    const safePrivacy =
      searchContext?.privacy === null || searchContext?.privacy === undefined
        ? ""
        : String(searchContext.privacy);
    const safeOwnerId = normalizeAccountId(searchContext?.ownerId || "");
    return `${safeQuery}|${safePrivacy}|${safeOwnerId}`;
  }

  function buildMentionItemHtml(item, state) {
    const customRenderItem = state?.options?.renderItem;
    if (typeof customRenderItem === "function") {
      try {
        const customHtml = customRenderItem(item, {
          escapeHtml,
          normalizeUsername,
          normalizeAccountId,
        });
        if (typeof customHtml === "string" && customHtml.trim().length > 0) {
          return customHtml;
        }
      } catch (_) {
        // fallback to default renderer
      }
    }

    const username = normalizeUsername(item?.username || item?.userName || "");
    const fullName = (item?.fullName || item?.FullName || "").toString().trim();
    const nickname = (item?.nickname || item?.Nickname || "").toString().trim();
    const avatarUrl =
      (item?.avatarUrl || item?.AvatarUrl || global.APP_CONFIG?.DEFAULT_AVATAR || "")
        .toString()
        .trim();

    const nameForDisplay = username || "unknown";
    const secondaryLabel = nickname || fullName || username || "";
    const safeAvatar = escapeHtml(avatarUrl);
    const safePrimary = escapeHtml(nameForDisplay);
    const safeSecondary = escapeHtml(secondaryLabel);

    return `
      <div class="mention-picker-item-main">
        <img class="mention-picker-avatar" src="${safeAvatar}" alt="avatar" />
        <div class="mention-picker-meta">
          <span class="mention-picker-primary">${safePrimary}</span>
          <span class="mention-picker-secondary">${safeSecondary}</span>
        </div>
      </div>
    `;
  }

  function normalizeSearchItems(payload) {
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.Items)
          ? payload.Items
          : [];

    const normalized = source
      .map((item) => ({
        accountId: normalizeAccountId(item?.accountId || item?.AccountId),
        username: normalizeUsername(item?.username || item?.userName || ""),
        fullName: (item?.fullName || item?.FullName || "").toString().trim(),
        nickname: (item?.nickname || item?.Nickname || "").toString().trim(),
        avatarUrl:
          (item?.avatarUrl || item?.AvatarUrl || global.APP_CONFIG?.DEFAULT_AVATAR || "")
            .toString()
            .trim(),
      }))
      .filter((item) => item.accountId && item.username);

    const deduped = [];
    const seenAccountIds = new Set();
    normalized.forEach((item) => {
      const key = item.accountId.toLowerCase();
      if (seenAccountIds.has(key)) return;
      seenAccountIds.add(key);
      deduped.push(item);
    });

    return deduped;
  }

  function normalizeMatchText(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function itemMatchesQuery(item, query, state) {
    const customMatcher = state?.options?.isItemMatch;
    if (typeof customMatcher === "function") {
      try {
        const customResult = customMatcher(item, {
          query,
          normalizeText: normalizeMatchText,
        });
        if (typeof customResult === "boolean") {
          return customResult;
        }
      } catch (_) {
        // fallback to default matcher
      }
    }

    if (!state?.options?.strictQueryMatch) {
      return true;
    }

    const keyword = normalizeMatchText(query);
    if (!keyword) {
      return true;
    }

    const username = normalizeMatchText(item?.username || item?.userName || "");
    const nickname = normalizeMatchText(item?.nickname || item?.Nickname || "");
    const fullName = normalizeMatchText(item?.fullName || item?.FullName || "");

    return [username, nickname, fullName].some(
      (fieldValue) => fieldValue && fieldValue.includes(keyword),
    );
  }

  function filterSearchItemsByQuery(items, query, state) {
    const source = Array.isArray(items) ? items : [];
    if (source.length === 0) {
      return [];
    }

    const hasCustomMatcher = typeof state?.options?.isItemMatch === "function";
    const strictQueryMatch = !!state?.options?.strictQueryMatch;
    if (!hasCustomMatcher && !strictQueryMatch) {
      return source;
    }

    return source.filter((item) => itemMatchesQuery(item, query, state));
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveThemeTarget(state) {
    if (!state || !state.input) return null;

    const customResolver = state.options?.getThemeTarget;
    if (typeof customResolver === "function") {
      try {
        const customTarget = customResolver({
          input: state.input,
          mountElement: state.mountElement,
          state,
        });
        if (customTarget instanceof Element) {
          return customTarget;
        }
      } catch (_) {
        // fall back to auto resolver
      }
    }

    const mount = state.mountElement || state.input;
    if (!(mount instanceof Element) || !mount.closest) return null;

    return (
      mount.closest(".chat-box, .chat-view, .chat-panel-container") ||
      mount.closest(".main-content") ||
      null
    );
  }

  function syncDropdownTheme(state, dropdown = null) {
    if (!state) return;
    const targetDropdown = dropdown || state.dropdown;
    if (!targetDropdown) return;

    mentionChatThemeVars.forEach((varName) => {
      targetDropdown.style.removeProperty(varName);
    });
    [...targetDropdown.classList]
      .filter((className) => className.startsWith("chat-theme-"))
      .forEach((className) => targetDropdown.classList.remove(className));

    const themeTarget = resolveThemeTarget(state);
    if (!themeTarget) {
      targetDropdown.classList.remove(mentionDropdownChatThemeClass);
      return;
    }

    targetDropdown.classList.add(mentionDropdownChatThemeClass);
    const computed = getComputedStyle(themeTarget);
    mentionChatThemeVars.forEach((varName) => {
      const value = computed.getPropertyValue(varName);
      if (value && value.trim()) {
        targetDropdown.style.setProperty(varName, value.trim());
      }
    });

    const themeClass = [...themeTarget.classList].find((className) =>
      className.startsWith("chat-theme-"),
    );
    if (themeClass) {
      targetDropdown.classList.add(themeClass);
    }
  }

  function ensureDropdownElement(state) {
    if (!state) return null;
    if (state.dropdown && document.body.contains(state.dropdown)) {
      syncDropdownTheme(state, state.dropdown);
      return state.dropdown;
    }

    const dropdown = document.createElement("div");
    dropdown.className = `${mentionDropdownClass} custom-scrollbar`;

    dropdown.addEventListener("mousedown", () => {
      state.isMouseDownOnDropdown = true;
    });
    dropdown.addEventListener("mouseup", () => {
      state.isMouseDownOnDropdown = false;
    });
    dropdown.addEventListener("mouseleave", () => {
      state.isMouseDownOnDropdown = false;
    });

    document.body.appendChild(dropdown);
    state.dropdown = dropdown;
    syncDropdownTheme(state, dropdown);
    return dropdown;
  }

  function ensureState(input, options) {
    if (!input) return null;

    const existing = mentionPickerStateMap.get(input);
    if (existing) {
      existing.options = options || existing.options || {};
      return existing;
    }

    const mountElement =
      options?.mountElement ||
      input.closest(".reply-input-wrapper") ||
      input.parentElement;
    if (!mountElement) return null;

    const state = {
      input,
      mountElement,
      options: options || {},
      dropdown: null,
      rawItems: [],
      items: [],
      activeIndex: -1,
      mentionContext: null,
      debounceTimer: null,
      requestId: 0,
      isOpen: false,
      isDropdownAbove: false,
      isMouseDownOnDropdown: false,
      lastSearchSignature: "",
      lastResultItems: [],
      isSelecting: false,
      inputEventWindowStartMs: 0,
      inputEventCount: 0,
      suspendUntilMs: 0,
      lastInputSnapshot: "",
    };

    mentionPickerStateMap.set(input, state);
    return state;
  }

  function readInputValue(state) {
    if (!state || !state.input) return "";

    const customGetter = state.options?.getValue;
    if (typeof customGetter === "function") {
      try {
        return (customGetter(state.input, state) ?? "").toString();
      } catch (_) {
        // fallback to default getter
      }
    }

    const input = state.input;
    if (typeof input.value === "string") {
      return input.value;
    }
    if (input.isContentEditable) {
      return (input.innerText || input.textContent || "").toString();
    }
    return "";
  }

  function writeInputValue(state, nextValue) {
    if (!state || !state.input) return;
    const value = (nextValue ?? "").toString();

    const customSetter = state.options?.setValue;
    if (typeof customSetter === "function") {
      try {
        customSetter(state.input, value, state);
        return;
      } catch (_) {
        // fallback to default setter
      }
    }

    const input = state.input;
    if (typeof input.value === "string") {
      input.value = value;
      return;
    }
    if (input.isContentEditable) {
      input.textContent = value;
    }
  }

  function readCursorIndex(state) {
    if (!state || !state.input) return 0;

    const customGetter = state.options?.getCursor;
    if (typeof customGetter === "function") {
      try {
        const cursorIndex = customGetter(state.input, state);
        if (Number.isFinite(cursorIndex)) {
          return Math.max(0, Number(cursorIndex));
        }
      } catch (_) {
        // fallback to default getter
      }
    }

    const input = state.input;
    if (Number.isFinite(input.selectionStart)) {
      return Math.max(0, Number(input.selectionStart));
    }
    return readInputValue(state).length;
  }

  function writeCursorIndex(state, cursorIndex) {
    if (!state || !state.input) return;

    const valueLength = readInputValue(state).length;
    const safeCursor = Math.max(0, Math.min(Number(cursorIndex) || 0, valueLength));

    const customSetter = state.options?.setCursor;
    if (typeof customSetter === "function") {
      try {
        customSetter(state.input, safeCursor, state);
        return;
      } catch (_) {
        // fallback to default setter
      }
    }

    const input = state.input;
    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(safeCursor, safeCursor);
      return;
    }

    if (input.isContentEditable && window.getSelection) {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function focusInput(state) {
    if (!state?.input) return;

    const customFocus = state.options?.focus;
    if (typeof customFocus === "function") {
      try {
        customFocus(state.input, state);
        return;
      } catch (_) {
        // fallback to default focus
      }
    }

    try {
      state.input.focus({ preventScroll: true });
    } catch (_) {
      state.input.focus();
    }
  }

  function destroyState(state) {
    if (!state) return;

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    state.requestId += 1;
    state.isOpen = false;
    mentionOpenStateSet.delete(state);

    if (state.dropdown) {
      state.dropdown.remove();
      state.dropdown = null;
    }

    if (state.input) {
      mentionPickerStateMap.delete(state.input);
      if (state.input.dataset) {
        delete state.input.dataset[mentionInputHandlerFlag];
      }
    }

  }

  function cleanupDetachedStates() {
    mentionOpenStateSet.forEach((state) => {
      if (!state.input || !state.input.isConnected) {
        destroyState(state);
      }
    });
  }

  function scheduleDetachedStateCleanup() {
    if (mentionCleanupTimerId || mentionOpenStateSet.size <= 0) {
      return;
    }

    mentionCleanupTimerId = window.setTimeout(() => {
      mentionCleanupTimerId = 0;
      cleanupDetachedStates();
      if (mentionOpenStateSet.size > 0) {
        scheduleDetachedStateCleanup();
      }
    }, 1200);
  }

  function openDropdown(state) {
    if (!state || !state.input || !state.input.isConnected) return;
    const dropdown = ensureDropdownElement(state);
    if (!dropdown) return;
    syncDropdownTheme(state, dropdown);
    dropdown.classList.add(mentionDropdownShowClass);
    state.isOpen = true;
    mentionOpenStateSet.add(state);
    scheduleDetachedStateCleanup();
    positionDropdown(state);
  }

  function closeDropdown(state) {
    if (!state) return;

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    state.requestId += 1;
    state.rawItems = [];
    state.items = [];
    state.activeIndex = -1;
    state.mentionContext = null;
    state.isMouseDownOnDropdown = false;
    state.isOpen = false;
    mentionOpenStateSet.delete(state);

    if (!state.dropdown) return;

    state.dropdown.classList.remove(mentionDropdownShowClass);
    state.dropdown.classList.remove(mentionDropdownBelowClass);
    state.dropdown.style.left = "";
    state.dropdown.style.top = "";
    state.dropdown.style.width = "";
    state.dropdown.style.maxHeight = "";
    state.dropdown.innerHTML = "";
  }

  function resolveDropdownPlacement(state) {
    if (!state || !state.input || !state.input.isConnected) {
      return null;
    }

    const inputRect = state.input.getBoundingClientRect();
    if (inputRect.width <= 0 || inputRect.height <= 0) {
      return null;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const verticalGap = 6;
    const viewportPadding = 8;
    const preferredHeight = 260;
    const minHeight = 120;

    const availableSpaceBelow = Math.max(
      0,
      viewportHeight - inputRect.bottom - verticalGap - viewportPadding,
    );
    const availableSpaceAbove = Math.max(
      0,
      inputRect.top - verticalGap - viewportPadding,
    );
    const shouldShowAbove =
      availableSpaceAbove >= minHeight &&
      (availableSpaceBelow < minHeight || availableSpaceAbove > availableSpaceBelow);

    const dropdownWidth = Math.max(Math.floor(inputRect.width), 220);
    const maxLeft = Math.max(8, viewportWidth - dropdownWidth - 8);
    const left = Math.min(Math.max(8, Math.floor(inputRect.left)), maxLeft);

    const maxHeight = Math.max(
      minHeight,
      Math.min(
        preferredHeight,
        shouldShowAbove ? availableSpaceAbove : availableSpaceBelow,
      ),
    );

    return {
      isAbove: shouldShowAbove,
      left,
      width: dropdownWidth,
      maxHeight,
      inputTop: Math.floor(inputRect.top),
      inputBottom: Math.floor(inputRect.bottom),
      viewportHeight,
      viewportPadding,
      verticalGap,
    };
  }

  function applyDropdownPlacement(state, placement) {
    if (!state || !placement) return;
    const dropdown = ensureDropdownElement(state);
    if (!dropdown) return;
    syncDropdownTheme(state, dropdown);

    state.isDropdownAbove = !!placement.isAbove;
    dropdown.classList.toggle(mentionDropdownBelowClass, !state.isDropdownAbove);
    dropdown.style.left = `${placement.left}px`;
    dropdown.style.width = `${placement.width}px`;
    dropdown.style.maxHeight = `${placement.maxHeight}px`;

    const renderedHeight = Math.min(
      placement.maxHeight,
      Math.floor(dropdown.getBoundingClientRect().height || 0),
    );
    const fallbackHeight = placement.maxHeight;
    const dropdownHeight = renderedHeight > 0 ? renderedHeight : fallbackHeight;

    const top = state.isDropdownAbove
      ? Math.max(
          placement.viewportPadding,
          placement.inputTop - dropdownHeight - placement.verticalGap,
        )
      : Math.min(
          placement.viewportHeight - placement.viewportPadding - dropdownHeight,
          placement.inputBottom + placement.verticalGap,
        );

    dropdown.style.top = `${Math.floor(top)}px`;
  }

  function positionDropdown(state) {
    if (!state || !state.input) return;
    if (!state.input.isConnected) {
      closeDropdown(state);
      return;
    }

    const placement = resolveDropdownPlacement(state);
    if (!placement) {
      closeDropdown(state);
      return;
    }

    applyDropdownPlacement(state, placement);
  }

  function refreshDisplayItems(state, resetActiveIndex = false) {
    if (!state) return;

    const previousActiveAccountId =
      !resetActiveIndex &&
      state.items[state.activeIndex] &&
      state.items[state.activeIndex].accountId
        ? state.items[state.activeIndex].accountId
        : "";

    const orderedItems = state.isDropdownAbove
      ? [...state.rawItems].reverse()
      : [...state.rawItems];

    state.items = orderedItems;

    if (state.items.length <= 0) {
      state.activeIndex = -1;
      return;
    }

    if (resetActiveIndex) {
      state.activeIndex = state.isDropdownAbove ? state.items.length - 1 : 0;
      return;
    }

    if (!previousActiveAccountId) {
      state.activeIndex = state.isDropdownAbove ? state.items.length - 1 : 0;
      return;
    }

    const matchedIndex = state.items.findIndex(
      (item) => item.accountId === previousActiveAccountId,
    );
    if (matchedIndex >= 0) {
      state.activeIndex = matchedIndex;
      return;
    }

    state.activeIndex = state.isDropdownAbove ? state.items.length - 1 : 0;
  }

  function renderItems(state, resetActiveIndex = false) {
    if (!state) return;
    const dropdown = ensureDropdownElement(state);
    if (!dropdown) return;

    const placement = resolveDropdownPlacement(state);
    if (!placement) {
      closeDropdown(state);
      return;
    }

    state.isDropdownAbove = !!placement.isAbove;
    refreshDisplayItems(state, resetActiveIndex);

    if (!state.items.length) {
      dropdown.innerHTML = "";
      closeDropdown(state);
      return;
    }

    dropdown.innerHTML = "";
    state.items.forEach((item, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "mention-picker-item";
      if (index === state.activeIndex) {
        row.classList.add("active");
      }
      row.innerHTML = buildMentionItemHtml(item, state);
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectItem(state, index);
      });
      dropdown.appendChild(row);
    });

    openDropdown(state);
  }

  function updateActiveItem(state, nextIndex) {
    if (!state || !state.items.length || !state.dropdown) return;

    const maxIndex = state.items.length - 1;
    const safeIndex = Math.max(0, Math.min(nextIndex, maxIndex));
    state.activeIndex = safeIndex;

    const rows = state.dropdown.querySelectorAll(".mention-picker-item");
    rows.forEach((row, index) => {
      if (index === safeIndex) row.classList.add("active");
      else row.classList.remove("active");
    });
  }

  function selectItem(state, index) {
    if (!state || !state.items.length || !state.input) return;
    if (!state.input.isConnected) {
      closeDropdown(state);
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, state.items.length - 1));
    const selected = state.items[safeIndex];
    const username = normalizeUsername(selected?.username || selected?.userName || "");
    if (!username || !state.mentionContext) {
      closeDropdown(state);
      return;
    }

    const input = state.input;
    const mentionText = `@${username} `;
    const inputValue = readInputValue(state);
    const before = inputValue.slice(0, state.mentionContext.start);
    const after = inputValue.slice(state.mentionContext.end);
    const nextValue = `${before}${mentionText}${after}`;

    state.isSelecting = true;
    writeInputValue(state, nextValue);

    const cursor = before.length + mentionText.length;
    writeCursorIndex(state, cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    closeDropdown(state);
    window.setTimeout(() => {
      state.isSelecting = false;
    }, 0);
    focusInput(state);
  }

  function shouldSuspendByInputEventRate(state) {
    const now = Date.now();
    const windowSizeMs = 1000;
    const maxEventsPerWindow = 40;

    if (now - state.inputEventWindowStartMs > windowSizeMs) {
      state.inputEventWindowStartMs = now;
      state.inputEventCount = 1;
      return false;
    }

    state.inputEventCount += 1;
    if (state.inputEventCount > maxEventsPerWindow) {
      state.suspendUntilMs = now + 1200;
      return true;
    }

    return false;
  }

  function shouldSkipDuplicateInputSnapshot(state, mentionContext) {
    const currentValue = readInputValue(state);
    const currentCursor = readCursorIndex(state);
    const mentionStart = Number.isFinite(mentionContext?.start)
      ? mentionContext.start
      : -1;
    const mentionEnd = Number.isFinite(mentionContext?.end)
      ? mentionContext.end
      : -1;
    const mentionQuery = (mentionContext?.query || "").toString();
    const snapshot = `${currentCursor}|${currentValue.length}|${mentionStart}|${mentionEnd}|${mentionQuery}`;
    if (state.lastInputSnapshot === snapshot) {
      return true;
    }
    state.lastInputSnapshot = snapshot;
    return false;
  }

  function scheduleSearch(state, nextMentionContext = null) {
    if (!state || !state.input || !state.input.isConnected) return;
    if (document.activeElement !== state.input) {
      closeDropdown(state);
      return;
    }

    const mentionContext =
      nextMentionContext ||
      getMentionCandidates(readInputValue(state), readCursorIndex(state));
    state.mentionContext = mentionContext;

    if (!mentionContext || mentionContext.query.length < 1) {
      closeDropdown(state);
      return;
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    state.debounceTimer = setTimeout(() => {
      executeSearch(state).catch(() => {
        closeDropdown(state);
      });
    }, getSearchDebounceMs());
  }

  async function executeSearch(state) {
    if (!state || !state.mentionContext || !state.input || !state.input.isConnected) return;

    const mentionContext = state.mentionContext;
    const query = mentionContext.query.trim();
    if (!query) {
      closeDropdown(state);
      return;
    }

    const searchContext = getMentionSearchContext(state.options?.getSearchContext);
    const searchSignature = buildSearchSignature(query, searchContext);

    if (state.lastSearchSignature === searchSignature && state.lastResultItems.length) {
      state.rawItems = [...state.lastResultItems];
      renderItems(state, true);
      return;
    }

    const requestId = ++state.requestId;

    const customSearchFn = state.options?.searchFn;
    if (typeof customSearchFn === "function") {
      let customPayload = null;
      try {
        customPayload = await customSearchFn({
          query,
          limit: getSearchLimit(),
          searchContext,
          mentionContext: state.mentionContext,
          input: state.input,
        });
      } catch (_) {
        closeDropdown(state);
        return;
      }

      if (requestId !== state.requestId || !state.input.isConnected) {
        return;
      }

      if (customPayload === null) {
        closeDropdown(state);
        return;
      }

      const normalizedCustomItems = filterSearchItemsByQuery(
        normalizeSearchItems(customPayload),
        query,
        state,
      ).slice(0, getSearchLimit());
      state.lastSearchSignature = searchSignature;
      state.lastResultItems = [...normalizedCustomItems];
      state.rawItems = normalizedCustomItems;
      renderItems(state, true);
      return;
    }

    const searchFn = global.API?.Accounts?.searchPostTagAccounts;
    if (typeof searchFn !== "function") {
      closeDropdown(state);
      return;
    }

    let response = null;
    try {
      response = await searchFn(
        query,
        getSearchLimit(),
        [],
        searchContext.privacy,
        searchContext.ownerId,
      );
    } catch (_) {
      closeDropdown(state);
      return;
    }

    if (requestId !== state.requestId || !state.input.isConnected) {
      return;
    }

    if (!response || !response.ok) {
      closeDropdown(state);
      return;
    }

    let payload = [];
    try {
      payload = await response.json();
    } catch (_) {
      payload = [];
    }

    if (requestId !== state.requestId || !state.input.isConnected) {
      return;
    }

    const normalizedItems = filterSearchItemsByQuery(
      normalizeSearchItems(payload),
      query,
      state,
    ).slice(0, getSearchLimit());

    state.lastSearchSignature = searchSignature;
    state.lastResultItems = [...normalizedItems];
    state.rawItems = normalizedItems;
    renderItems(state, true);
  }

  function bindInput(input, options = {}) {
    if (!input) return;

    const state = ensureState(input, options);
    if (!state) return;
    state.options = options || state.options;

    if (input.dataset[mentionInputHandlerFlag] === "true") {
      return;
    }

    input.dataset[mentionInputHandlerFlag] = "true";

    input.addEventListener("input", () => {
      if (state.isSelecting) {
        return;
      }

      const mentionContext = getMentionCandidates(
        readInputValue(state),
        readCursorIndex(state),
      );
      if (!mentionContext || mentionContext.query.length < 1) {
        closeDropdown(state);
        state.lastInputSnapshot = "";
        return;
      }

      if (Date.now() < state.suspendUntilMs) {
        return;
      }
      if (shouldSuspendByInputEventRate(state)) {
        closeDropdown(state);
        return;
      }
      if (shouldSkipDuplicateInputSnapshot(state, mentionContext)) {
        return;
      }
      scheduleSearch(state, mentionContext);
    });

    input.addEventListener("click", () => {
      const mentionContext = getMentionCandidates(
        readInputValue(state),
        readCursorIndex(state),
      );
      if (!mentionContext || mentionContext.query.length < 1) {
        closeDropdown(state);
        return;
      }

      scheduleSearch(state, mentionContext);
    });

    input.addEventListener(
      "keydown",
      (event) => {
        if (!state.isOpen) return;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          updateActiveItem(state, state.activeIndex + 1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          updateActiveItem(state, state.activeIndex - 1);
          return;
        }

        if (event.key === "Enter") {
          if (state.activeIndex >= 0) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            const selectedIndex = state.activeIndex;
            window.setTimeout(() => {
              if (!state.isOpen) return;
              selectItem(state, selectedIndex);
            }, 0);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          closeDropdown(state);
        }
      },
      true,
    );

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (state.isMouseDownOnDropdown) {
          return;
        }
        closeDropdown(state);
      }, 100);
    });
  }

  document.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    cleanupDetachedStates();

    mentionOpenStateSet.forEach((state) => {
      if (!state.isOpen || !state.input || !state.input.isConnected) return;

      const clickedInsideInput = state.input.contains(target);
      const clickedInsideDropdown =
        state.dropdown instanceof Element && state.dropdown.contains(target);
      if (!clickedInsideInput && !clickedInsideDropdown) {
        closeDropdown(state);
      }
    });
  });

  global.MentionPicker = {
    attach(input, options = {}) {
      bindInput(input, options);
    },
    isOpenFor(input) {
      if (!input) return false;
      const state = mentionPickerStateMap.get(input);
      return !!state?.isOpen;
    },
    hasSelectableItemFor(input) {
      if (!input) return false;
      const state = mentionPickerStateMap.get(input);
      if (!state?.isOpen) return false;
      if (!Array.isArray(state.items) || state.items.length === 0) return false;
      return state.activeIndex >= 0 && state.activeIndex < state.items.length;
    },
  };
})(window);
