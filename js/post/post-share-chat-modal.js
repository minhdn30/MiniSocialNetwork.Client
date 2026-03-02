(function (global) {
  const state = {
    modal: null,
    selectedTargets: new Map(),
    targetResults: [],
    searchKeyword: "",
    lastSearchKeyword: "",
    searchDebounceTimer: null,
    searchRequestSequence: 0,
    searchCache: new Map(),
    isSending: false,
    postId: "",
    postCode: "",
    ownsScrollLock: false,
  };

  function normalizeId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function escapeHtml(value) {
    const raw = value === null || value === undefined ? "" : String(value);
    if (typeof global.escapeHtml === "function") {
      return global.escapeHtml(raw);
    }
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function toSafeText(value) {
    if (value === null || value === undefined) return "";
    try {
      return String(value);
    } catch (_) {
      return "";
    }
  }

  function truncateSafe(value, maxChars) {
    const normalized = toSafeText(value).trim();
    if (!normalized) return "";
    const max = Number(maxChars);
    if (!Number.isFinite(max) || max <= 0) return "";
    const chars = Array.from(normalized);
    if (chars.length <= max) return normalized;
    return `${chars.slice(0, Math.max(1, max - 1)).join("")}\u2026`;
  }

  function getSearchDebounceMs() {
    return global.APP_CONFIG?.GROUP_CHAT_INVITE_SEARCH_DEBOUNCE_MS || 250;
  }

  function getContentMaxLength() {
    const configured = Number(global.APP_CONFIG?.MAX_CHAT_MESSAGE_LENGTH);
    return Number.isFinite(configured) && configured > 0 ? configured : 1000;
  }

  function getPostShareSearchLimit() {
    const configured = Number(global.APP_CONFIG?.POST_SHARE_CHAT_SEARCH_LIMIT);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(1, Math.floor(configured));
    }
    return 20;
  }

  function isMainContentScrollLocked() {
    const mainContent = document.querySelector(".main-content");
    if (!mainContent) return false;

    const inlineOverflow = (mainContent.style.overflow || "")
      .toString()
      .trim()
      .toLowerCase();
    if (inlineOverflow === "hidden" || inlineOverflow === "clip") return true;

    if (typeof global.getComputedStyle !== "function") return false;
    const computed = global.getComputedStyle(mainContent);
    if (!computed) return false;
    const overflow = (computed.overflow || "").toString().trim().toLowerCase();
    const overflowY = (computed.overflowY || "")
      .toString()
      .trim()
      .toLowerCase();
    return (
      overflow === "hidden" ||
      overflow === "clip" ||
      overflowY === "hidden" ||
      overflowY === "clip"
    );
  }

  function getModalElements() {
    if (!state.modal) return {};
    return {
      selectedCount: state.modal.querySelector("#postShareChatSelectedCount"),
      selectedList: state.modal.querySelector("#postShareChatSelectedList"),
      selectedHint: state.modal.querySelector("#postShareChatSelectedHint"),
      searchInput: state.modal.querySelector("#postShareChatSearchInput"),
      contentInput: state.modal.querySelector("#postShareChatContentInput"),
      contentEmojiBtn: state.modal.querySelector("#postShareChatContentEmojiBtn"),
      contentEmojiPicker: state.modal.querySelector(
        "#postShareChatContentEmojiPicker",
      ),
      resultList: state.modal.querySelector("#postShareChatResultList"),
      sendBtn: state.modal.querySelector("#postShareChatSendBtn"),
    };
  }

  function enforceContentMaxLength(input) {
    if (!input) return;
    const maxLength = getContentMaxLength();
    const chars = Array.from((input.value || "").toString());
    if (chars.length <= maxLength) return;
    input.value = chars.slice(0, maxLength).join("");
  }

  function autoResizeContentInput(input) {
    if (!input) return;
    input.style.height = "auto";

    const computed =
      typeof global.getComputedStyle === "function"
        ? global.getComputedStyle(input)
        : null;
    const minHeight = computed ? parseFloat(computed.minHeight) || 0 : 0;
    const maxHeight = computed ? parseFloat(computed.maxHeight) || 0 : 0;
    const nextHeight = Math.max(input.scrollHeight, minHeight || 0);
    const cappedHeight = maxHeight > 0 ? Math.min(nextHeight, maxHeight) : nextHeight;
    input.style.height = `${cappedHeight}px`;
    if (maxHeight > 0) {
      input.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
    }
  }

  function normalizeContentForSend(rawValue) {
    const maxLength = getContentMaxLength();
    const chars = Array.from((rawValue || "").toString());
    const normalized =
      chars.length > maxLength ? chars.slice(0, maxLength).join("") : chars.join("");
    return normalized.trim();
  }

  function renderAvatarHtml(target, className = "post-share-chat-avatar") {
    const useGroupIcon = !!target.useGroupIcon;
    if (useGroupIcon) {
      return `<div class="${className} ${className}-icon"><i data-lucide="users"></i></div>`;
    }

    const avatarUrl =
      (target.avatarUrl || "").toString().trim() ||
      global.APP_CONFIG?.DEFAULT_AVATAR ||
      "";
    return `<img class="${className}" src="${escapeAttr(avatarUrl)}" alt="" onerror="this.src='${escapeAttr(global.APP_CONFIG?.DEFAULT_AVATAR || "")}'">`;
  }

  function normalizeSearchTarget(rawTarget) {
    if (!rawTarget || typeof rawTarget !== "object") return null;

    const targetType = (
      rawTarget.targetType ||
      rawTarget.TargetType ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    const name = (
      rawTarget.name ||
      rawTarget.Name ||
      ""
    )
      .toString()
      .trim();
    const subtitle = (
      rawTarget.subtitle ||
      rawTarget.Subtitle ||
      ""
    )
      .toString()
      .trim();
    const avatarUrl = (
      rawTarget.avatarUrl ||
      rawTarget.AvatarUrl ||
      ""
    )
      .toString()
      .trim();
    const useGroupIcon = !!(
      rawTarget.useGroupIcon ?? rawTarget.UseGroupIcon ?? false
    );

    if (targetType === "groupconversation" || targetType === "group_conversation") {
      const conversationId = normalizeId(
        rawTarget.conversationId || rawTarget.ConversationId || "",
      );
      if (!conversationId) return null;
      return {
        key: `conversation:${conversationId}`,
        type: "conversation",
        id: conversationId,
        name: name || "Group chat",
        subtitle: subtitle || "Group conversation",
        avatarUrl,
        useGroupIcon,
      };
    }

    const accountId = normalizeId(rawTarget.accountId || rawTarget.AccountId || "");
    if (!accountId) return null;
    return {
      key: `receiver:${accountId}`,
      type: "receiver",
      id: accountId,
      name: name || "Unknown user",
      subtitle,
      avatarUrl,
      useGroupIcon: false,
    };
  }

  function getTargetByKey(key) {
    const normalizedKey = (key || "").toString().trim();
    if (!normalizedKey) return null;
    return (
      state.targetResults.find((item) => item.key === normalizedKey) ||
      state.selectedTargets.get(normalizedKey) ||
      null
    );
  }

  function renderSelectedTargets() {
    const { selectedCount, selectedList, selectedHint } = getModalElements();
    if (!selectedCount || !selectedList || !selectedHint) return;

    const selectedItems = Array.from(state.selectedTargets.values());
    selectedCount.textContent = `${selectedItems.length} selected`;

    if (!selectedItems.length) {
      selectedList.innerHTML = "";
      selectedList.classList.add("hidden");
      selectedHint.classList.remove("hidden");
      return;
    }

    selectedHint.classList.add("hidden");
    selectedList.classList.remove("hidden");
    selectedList.innerHTML = selectedItems
      .map(
        (target) => `
        <div class="post-share-chat-chip" data-target-key="${escapeAttr(target.key)}">
          ${renderAvatarHtml(target, "post-share-chat-chip-avatar")}
          <span class="post-share-chat-chip-name">${escapeHtml(truncateSafe(target.name, 36) || "Unknown")}</span>
          <button type="button" class="post-share-chat-chip-remove" data-target-key="${escapeAttr(target.key)}" aria-label="Remove recipient">
            <i data-lucide="x"></i>
          </button>
        </div>
      `,
      )
      .join("");

    if (global.lucide) {
      global.lucide.createIcons({ container: selectedList });
    }
  }

  function renderResultsEmpty(message) {
    const { resultList } = getModalElements();
    if (!resultList) return;
    resultList.innerHTML = `<div class="post-share-chat-empty-state">${escapeHtml(message || "No results")}</div>`;
  }

  function renderLoadingSkeleton() {
    const { resultList } = getModalElements();
    if (!resultList) return;
    resultList.innerHTML = `
      <div class="post-share-chat-skeleton-item"></div>
      <div class="post-share-chat-skeleton-item"></div>
      <div class="post-share-chat-skeleton-item"></div>
    `;
  }

  function renderTargetItemHtml(target) {
    const isSelected = state.selectedTargets.has(target.key);
    const name = truncateSafe(target.name, 42) || "Unknown";
    const subtitle = truncateSafe(target.subtitle, 64);
    return `
      <div class="post-share-chat-item ${isSelected ? "selected" : ""}" data-target-key="${escapeAttr(target.key)}">
        ${renderAvatarHtml(target)}
        <div class="post-share-chat-item-info">
          <div class="post-share-chat-item-name">${escapeHtml(name)}</div>
          <div class="post-share-chat-item-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="post-share-chat-item-check">
          <i data-lucide="check"></i>
        </div>
      </div>
    `;
  }

  function renderResultSection(title, items) {
    if (!items.length) return "";
    return `
      <div class="post-share-chat-section">
        <div class="post-share-chat-section-title">${escapeHtml(title)}</div>
        ${items.map(renderTargetItemHtml).join("")}
      </div>
    `;
  }

  function renderResults() {
    const { resultList } = getModalElements();
    if (!resultList) return;

    const sectionsHtml = renderResultSection("Recipients", state.targetResults);

    if (!sectionsHtml) {
      const hasKeyword = state.searchKeyword.length > 0;
      renderResultsEmpty(
        hasKeyword ? "No matching users or groups" : "No recent contacts",
      );
      return;
    }

    resultList.innerHTML = sectionsHtml;
    if (global.lucide) {
      global.lucide.createIcons({ container: resultList });
    }
  }

  function updateSendButtonState() {
    const { sendBtn } = getModalElements();
    if (!sendBtn) return;

    const hasRecipients = state.selectedTargets.size > 0;
    sendBtn.disabled = !hasRecipients || state.isSending;
    sendBtn.textContent = state.isSending ? "Sending..." : "Send";
  }

  function toggleTarget(key) {
    const target = getTargetByKey(key);
    if (!target) return;

    if (state.selectedTargets.has(target.key)) {
      state.selectedTargets.delete(target.key);
    } else {
      state.selectedTargets.set(target.key, target);
    }

    renderSelectedTargets();
    renderResults();
    updateSendButtonState();
  }

  async function readApiError(res, fallbackMessage) {
    let message = fallbackMessage || "Request failed";
    if (!res) return message;

    try {
      const data = await res.clone().json();
      if (data && typeof data === "object") {
        const msg = (data.message || data.Message || data.title || data.Title || "")
          .toString()
          .trim();
        if (msg) return msg;
      }
    } catch (_) {}

    try {
      const text = (await res.clone().text()).toString().trim();
      if (text) return text;
    } catch (_) {}

    return message;
  }

  function normalizeSendResult(rawResult) {
    if (!rawResult || typeof rawResult !== "object") return null;
    const message = rawResult.message || rawResult.Message || null;
    const conversationId = normalizeId(
      rawResult.conversationId ||
        rawResult.ConversationId ||
        message?.conversationId ||
        message?.ConversationId ||
        "",
    );
    return {
      isSuccess: !!(rawResult.isSuccess ?? rawResult.IsSuccess),
      errorMessage:
        rawResult.errorMessage ||
        rawResult.ErrorMessage ||
        "",
      conversationId,
      message,
    };
  }

  async function sendPostShare() {
    if (state.isSending || !state.postId) return;

    const targets = Array.from(state.selectedTargets.values());
    if (!targets.length) return;

    const conversationIds = targets
      .filter((target) => target.type === "conversation")
      .map((target) => target.id);
    const receiverIds = targets
      .filter((target) => target.type === "receiver")
      .map((target) => target.id);

    if (!conversationIds.length && !receiverIds.length) return;
    if (!global.API?.Messages?.sharePost) {
      if (global.toastError) global.toastError("Share API is unavailable.");
      return;
    }

    state.isSending = true;
    updateSendButtonState();

    const { contentInput } = getModalElements();
    const content = normalizeContentForSend(contentInput?.value || "");

    try {
      const res = await global.API.Messages.sharePost({
        postId: state.postId,
        conversationIds,
        receiverIds,
        content: content || null,
        tempId: global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });

      if (!res.ok) {
        const errorMessage = await readApiError(res, "Failed to share post.");
        if (global.toastError) global.toastError(errorMessage);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      const rawResults = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.Results)
          ? payload.Results
          : [];
      const results = rawResults.map(normalizeSendResult).filter(Boolean);
      const successResults = results.filter((result) => result.isSuccess);
      const failedResults = results.filter((result) => !result.isSuccess);

      const chatSidebar = global.ChatSidebar;
      if (chatSidebar) {
        const processedConversationIds = new Set();
        let shouldReloadConversationList = false;

        successResults.forEach((result) => {
          const conversationId = normalizeId(result.conversationId);
          if (!conversationId || processedConversationIds.has(conversationId)) {
            return;
          }
          processedConversationIds.add(conversationId);
          if (!result.message) return;

          const hasRenderedConversationItem = !!document.querySelector(
            `.chat-item[data-conversation-id="${conversationId}"]`,
          );

          if (
            hasRenderedConversationItem &&
            typeof chatSidebar.incrementUnread === "function"
          ) {
            chatSidebar.incrementUnread(conversationId, result.message, true);
            return;
          }

          if (Array.isArray(chatSidebar.conversations)) {
            const conversation = chatSidebar.conversations.find(
              (item) => normalizeId(item?.conversationId) === conversationId,
            );
            if (conversation) {
              conversation.lastMessage = result.message;
              conversation.lastMessageSentAt =
                result.message.sentAt ||
                result.message.SentAt ||
                new Date().toISOString();
            }
          }

          shouldReloadConversationList = true;
        });

        if (
          shouldReloadConversationList &&
          !chatSidebar.searchTerm &&
          typeof chatSidebar.loadConversations === "function" &&
          document.getElementById("chat-conversation-list")
        ) {
          chatSidebar.page = 1;
          chatSidebar.hasMore = true;
          chatSidebar.loadConversations(false);
        }
      }

      if (successResults.length > 0 && failedResults.length === 0) {
        if (global.toastSuccess) {
          global.toastSuccess(
            `Shared to ${successResults.length} chat${successResults.length > 1 ? "s" : ""}.`,
          );
        }
        closeModal({ force: true });
        return;
      }

      if (successResults.length > 0) {
        if (global.toastInfo) {
          global.toastInfo(
            `Shared to ${successResults.length} chat${successResults.length > 1 ? "s" : ""}. ${failedResults.length} failed.`,
          );
        }
        closeModal({ force: true });
        return;
      }

      const firstError =
        failedResults.find((result) => result.errorMessage)?.errorMessage ||
        "Failed to share post.";
      if (global.toastError) {
        global.toastError(firstError);
      }
    } catch (error) {
      console.error("Failed to share post:", error);
      if (global.toastError) {
        global.toastError("Failed to share post.");
      }
    } finally {
      state.isSending = false;
      updateSendButtonState();
    }
  }

  async function searchTargets(keyword, { showLoading = true } = {}) {
    const normalizedKeyword = (keyword || "").trim();
    if (state.searchCache.has(normalizedKeyword)) {
      state.searchKeyword = normalizedKeyword;
      state.lastSearchKeyword = normalizedKeyword;
      state.targetResults = state.searchCache.get(normalizedKeyword) || [];
      renderResults();
      return;
    }

    state.searchKeyword = normalizedKeyword;
    state.lastSearchKeyword = normalizedKeyword;
    const requestSequence = ++state.searchRequestSequence;

    if (showLoading) {
      renderLoadingSkeleton();
    }

    if (!global.API?.Messages?.searchPostShareTargets) {
      renderResultsEmpty("Search API is unavailable");
      return;
    }

    try {
      const searchRes = await global.API.Messages.searchPostShareTargets(
        normalizedKeyword,
        getPostShareSearchLimit(),
      );

      if (requestSequence !== state.searchRequestSequence) return;

      if (!searchRes?.ok) {
        const errorMessage = await readApiError(
          searchRes,
          "Failed to search recipients.",
        );
        renderResultsEmpty(errorMessage);
        return;
      }

      const payload = await searchRes
        .json()
        .catch(() => ({}));
      const rawItems = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.Items)
          ? payload.Items
          : [];

      const normalizedTargets = rawItems
        .map(normalizeSearchTarget)
        .filter(Boolean);

      state.targetResults = normalizedTargets;
      state.searchCache.set(normalizedKeyword, normalizedTargets);

      renderResults();
    } catch (error) {
      if (requestSequence !== state.searchRequestSequence) return;
      console.error("Failed to search post share recipients:", error);
      renderResultsEmpty("Could not connect to server");
    }
  }

  function resetModalState() {
    state.selectedTargets = new Map();
    state.targetResults = [];
    state.searchKeyword = "";
    state.lastSearchKeyword = "";
    state.searchRequestSequence += 1;
    state.searchCache = new Map();
    state.isSending = false;

    if (state.searchDebounceTimer) {
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = null;
    }

    const { searchInput, contentInput, contentEmojiPicker } = getModalElements();
    if (searchInput) searchInput.value = "";
    if (contentInput) {
      contentInput.value = "";
      contentInput.maxLength = getContentMaxLength();
      enforceContentMaxLength(contentInput);
      autoResizeContentInput(contentInput);
    }
    if (contentEmojiPicker && global.EmojiUtils?.closePicker) {
      global.EmojiUtils.closePicker(contentEmojiPicker);
    }

    renderSelectedTargets();
    renderLoadingSkeleton();
    updateSendButtonState();
  }

  function closeModal(options = {}) {
    const force = options.force === true;
    if (state.isSending && !force) {
      return;
    }

    if (!state.modal) return;
    if (state.searchDebounceTimer) {
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = null;
    }
    state.searchRequestSequence += 1;
    state.searchKeyword = "";
    state.lastSearchKeyword = "";
    state.searchCache = new Map();
    const { contentEmojiPicker } = getModalElements();
    if (contentEmojiPicker && global.EmojiUtils?.closePicker) {
      global.EmojiUtils.closePicker(contentEmojiPicker);
    }

    state.modal.classList.remove("show");
    if (
      state.ownsScrollLock &&
      typeof global.unlockScroll === "function"
    ) {
      global.unlockScroll();
    }
    state.ownsScrollLock = false;
  }

  function bindModalEvents() {
    if (!state.modal) return;
    if (state.modal.dataset.bound === "true") return;

    const closeBtn = state.modal.querySelector("#postShareChatCloseBtn");
    const cancelBtn = state.modal.querySelector("#postShareChatCancelBtn");
    const searchInput = state.modal.querySelector("#postShareChatSearchInput");
    const contentInput = state.modal.querySelector("#postShareChatContentInput");
    const contentEmojiBtn = state.modal.querySelector(
      "#postShareChatContentEmojiBtn",
    );
    const contentEmojiPicker = state.modal.querySelector(
      "#postShareChatContentEmojiPicker",
    );
    const resultList = state.modal.querySelector("#postShareChatResultList");
    const selectedList = state.modal.querySelector("#postShareChatSelectedList");
    const sendBtn = state.modal.querySelector("#postShareChatSendBtn");

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    sendBtn?.addEventListener("click", sendPostShare);

    state.modal.addEventListener("click", (event) => {
      if (event.target === state.modal) {
        closeModal();
      }
    });

    searchInput?.addEventListener("input", () => {
      const keyword = (searchInput.value || "").trim();
      if (state.searchDebounceTimer) {
        clearTimeout(state.searchDebounceTimer);
      }
      const delay = keyword.length === 0 ? 0 : getSearchDebounceMs();
      state.searchDebounceTimer = setTimeout(() => {
        searchTargets(keyword, { showLoading: true });
      }, delay);
    });

    if (contentInput) {
      contentInput.maxLength = getContentMaxLength();
      const handleContentInput = () => {
        enforceContentMaxLength(contentInput);
        autoResizeContentInput(contentInput);
      };
      contentInput.addEventListener("input", handleContentInput);
      contentInput.addEventListener("focus", () => autoResizeContentInput(contentInput));
      handleContentInput();
    }

    if (contentEmojiBtn && contentEmojiPicker && global.EmojiUtils) {
      contentEmojiBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await global.EmojiUtils.togglePicker(contentEmojiPicker, (emoji) => {
          if (!contentInput || !global.EmojiUtils?.insertAtCursor) return;
          global.EmojiUtils.insertAtCursor(contentInput, emoji.native);
          enforceContentMaxLength(contentInput);
          autoResizeContentInput(contentInput);
        });
      });
      global.EmojiUtils.setupClickOutsideHandler(
        "#postShareChatContentEmojiPicker",
        "#postShareChatContentEmojiBtn",
      );
    }

    resultList?.addEventListener("click", (event) => {
      const item = event.target.closest(".post-share-chat-item");
      if (!item || !resultList.contains(item)) return;
      toggleTarget(item.dataset.targetKey || "");
    });

    selectedList?.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".post-share-chat-chip-remove");
      if (!removeBtn || !selectedList.contains(removeBtn)) return;
      event.stopPropagation();
      toggleTarget(removeBtn.dataset.targetKey || "");
    });

    state.modal.dataset.bound = "true";
  }

  function ensureModal() {
    if (state.modal) return state.modal;

    const modal = document.createElement("div");
    modal.id = "postShareChatModal";
    modal.className = "modal-overlay post-share-chat-overlay";
    modal.innerHTML = `
      <div class="modal-container post-share-chat-modal">
        <div class="modal-header post-share-chat-header">
          <h2 class="modal-title">Share post</h2>
          <button type="button" class="modal-back-btn" id="postShareChatCloseBtn" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="post-share-chat-body">
          <div class="post-share-chat-selected">
            <div class="post-share-chat-selected-header">
              <span class="post-share-chat-label">Recipients</span>
              <span class="post-share-chat-selected-count" id="postShareChatSelectedCount">0 selected</span>
            </div>
            <div class="post-share-chat-selected-list hidden" id="postShareChatSelectedList"></div>
            <div class="post-share-chat-selected-hint" id="postShareChatSelectedHint">Select one or more users or groups.</div>
          </div>

          <div class="post-share-chat-search-wrap">
            <i data-lucide="search" class="post-share-chat-search-icon"></i>
            <input
              type="text"
              class="post-share-chat-search-input"
              id="postShareChatSearchInput"
              placeholder="Search username, full name, or group name..."
              autocomplete="off"
            />
          </div>

          <div class="post-share-chat-result-list" id="postShareChatResultList"></div>

          <div class="post-share-chat-content-wrap">
            <div class="post-share-chat-content-input-wrapper">
              <textarea
                class="post-share-chat-content-input"
                id="postShareChatContentInput"
                placeholder="Add a message (optional)"
                rows="1"
              ></textarea>
              <button
                type="button"
                class="post-share-chat-content-emoji-btn"
                id="postShareChatContentEmojiBtn"
                aria-label="Open emoji picker"
              >
                <i data-lucide="smile"></i>
              </button>
              <div
                class="post-share-chat-content-emoji-picker"
                id="postShareChatContentEmojiPicker"
              ></div>
            </div>
          </div>
        </div>

        <div class="post-share-chat-footer">
          <button type="button" class="post-share-chat-btn-cancel" id="postShareChatCancelBtn">Cancel</button>
          <button type="button" class="post-share-chat-btn-send" id="postShareChatSendBtn" disabled>Send</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    state.modal = modal;
    bindModalEvents();

    if (global.lucide) {
      global.lucide.createIcons({ container: modal });
    }

    return modal;
  }

  function openModal(postId, options = {}) {
    const normalizedPostId = normalizeId(postId);
    if (!normalizedPostId) {
      if (global.toastError) global.toastError("Post is unavailable.");
      return;
    }

    ensureModal();
    state.postId = normalizedPostId;
    state.postCode = (options?.postCode || "").toString().trim();
    resetModalState();

    const isAlreadyOpen = state.modal.classList.contains("show");
    if (!isAlreadyOpen) {
      const wasLockedBeforeOpen = isMainContentScrollLocked();
      if (!wasLockedBeforeOpen && typeof global.lockScroll === "function") {
        global.lockScroll();
        state.ownsScrollLock = true;
      } else {
        state.ownsScrollLock = false;
      }
    }

    state.modal.classList.add("show");

    searchTargets("", { showLoading: true });

    const { searchInput } = getModalElements();
    setTimeout(() => {
      searchInput?.focus();
    }, 120);
  }

  global.openPostShareChatModal = openModal;
  global.closePostShareChatModal = (options = {}) => closeModal(options);
})(window);
