(function (global) {
  function psT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback || key) : (fallback || key);
  }

  function psUiError(action, status, rawMessage, fallbackKey) {
    const featureAction = action === "forward" ? "share-forward" : action;
    const resolved = global.UIErrors?.format?.("post", featureAction, status, rawMessage);
    const resolvedKey = resolved?.key || "";
    const normalizedRaw = (rawMessage || "").toString().trim();

    if (
      normalizedRaw &&
      (!resolvedKey ||
        resolvedKey === "errors.generic" ||
        resolvedKey === "errors.post.shareChat" ||
        resolvedKey === "errors.post.shareForward")
    ) {
      return psTranslateServerText(normalizedRaw) || normalizedRaw;
    }

    return resolved?.message || psT(fallbackKey, {}, fallbackKey);
  }

  function psTranslateServerText(rawMessage = "") {
    const normalized = (rawMessage || "").toString().trim();
    if (!normalized) return "";
    if (global.I18n?.translateServerText) {
      return global.I18n.translateServerText(normalized);
    }
    if (global.I18n?.translateLiteral) {
      return global.I18n.translateLiteral(normalized);
    }
    return normalized;
  }

  const state = {
    modal: null,
    mode: "postShare",
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
    sourceMessageId: "",
    ownsScrollLock: false,
    isDiscardConfirmOpen: false,
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

  function isForwardMode() {
    return state.mode === "forward";
  }

  function getActionVerb() {
    return isForwardMode()
      ? psT("common.buttons.forward", {}, "Forward")
      : psT("common.buttons.send", {}, "Send");
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
      title: state.modal.querySelector("#postShareChatModalTitle"),
      selectedCount: state.modal.querySelector("#postShareChatSelectedCount"),
      selectedList: state.modal.querySelector("#postShareChatSelectedList"),
      selectedHint: state.modal.querySelector("#postShareChatSelectedHint"),
      searchInput: state.modal.querySelector("#postShareChatSearchInput"),
      contentInput: state.modal.querySelector("#postShareChatContentInput"),
      contentWrap: state.modal.querySelector("#postShareChatContentWrap"),
      contentEmojiBtn: state.modal.querySelector(
        "#postShareChatContentEmojiBtn",
      ),
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
    const cappedHeight =
      maxHeight > 0 ? Math.min(nextHeight, maxHeight) : nextHeight;
    input.style.height = `${cappedHeight}px`;
    if (maxHeight > 0) {
      input.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
    }
  }

  function normalizeContentForSend(rawValue) {
    const maxLength = getContentMaxLength();
    const chars = Array.from((rawValue || "").toString());
    const normalized =
      chars.length > maxLength
        ? chars.slice(0, maxLength).join("")
        : chars.join("");
    return normalized.trim();
  }

  function renderAvatarHtml(target, className = "post-share-chat-avatar") {
    const useGroupIcon = !!target.useGroupIcon;
    const groupAvatars = Array.isArray(target.groupAvatars)
      ? target.groupAvatars.filter((_, index) => index in target.groupAvatars)
      : [];

    if (useGroupIcon && groupAvatars.length > 0) {
      const fallbackAvatar = global.APP_CONFIG?.DEFAULT_AVATAR || "";
      const membersToShow = groupAvatars.slice(0, 4);
      let compositeHtml = `<div class="${className} composite-group-avatar count-${membersToShow.length}">`;
      membersToShow.forEach((url, i) => {
        const safeUrl =
          typeof url === "string" && url.trim().length > 0
            ? escapeAttr(url.trim())
            : escapeAttr(fallbackAvatar);
        compositeHtml += `<img src="${safeUrl}" alt="" class="composite-avatar-part item-${i}" onerror="this.src='${escapeAttr(fallbackAvatar)}';">`;
      });
      compositeHtml += `</div>`;
      return compositeHtml;
    }

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

    const targetType = (rawTarget.targetType || rawTarget.TargetType || "")
      .toString()
      .trim()
      .toLowerCase();

    const name = (rawTarget.name || rawTarget.Name || "").toString().trim();
    const subtitle = (rawTarget.subtitle || rawTarget.Subtitle || "")
      .toString()
      .trim();
    const avatarUrl = (rawTarget.avatarUrl || rawTarget.AvatarUrl || "")
      .toString()
      .trim();
    const useGroupIcon = !!(
      rawTarget.useGroupIcon ??
      rawTarget.UseGroupIcon ??
      false
    );

    if (
      targetType === "groupconversation" ||
      targetType === "group_conversation"
    ) {
      const conversationId = normalizeId(
        rawTarget.conversationId || rawTarget.ConversationId || "",
      );
      const rawGroupAvatars =
        rawTarget.groupAvatars || rawTarget.GroupAvatars || [];
      const normalizedGroupAvatars = Array.isArray(rawGroupAvatars)
        ? rawGroupAvatars
            .filter((_, index) => index in rawGroupAvatars)
            .map((url) => (typeof url === "string" ? url.trim() : ""))
        : [];
      const shouldUseGroupIcon =
        useGroupIcon ||
        (global.ChatCommon &&
        typeof global.ChatCommon.isDefaultGroupAvatar === "function"
          ? global.ChatCommon.isDefaultGroupAvatar(avatarUrl)
          : false);
      if (!conversationId) return null;
      return {
        key: `conversation:${conversationId}`,
        type: "conversation",
        id: conversationId,
        name: name || "Group chat",
        subtitle: subtitle || "Group conversation",
        avatarUrl,
        useGroupIcon: shouldUseGroupIcon,
        groupAvatars: normalizedGroupAvatars,
      };
    }

    const accountId = normalizeId(
      rawTarget.accountId || rawTarget.AccountId || "",
    );
    if (!accountId) return null;
    return {
      key: `receiver:${accountId}`,
      type: "receiver",
      id: accountId,
      name: name || psT("post.share.unknownUser", {}, "Unknown user"),
      subtitle,
      avatarUrl,
      useGroupIcon: false,
      groupAvatars: [],
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
    selectedCount.textContent = psT(
      "post.share.selectedCount",
      { count: selectedItems.length },
      `${selectedItems.length} selected`,
    );

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
          <span class="post-share-chat-chip-name">${escapeHtml(truncateSafe(target.name, 36) || psT("common.labels.user", {}, "User"))}</span>
          <button type="button" class="post-share-chat-chip-remove" data-target-key="${escapeAttr(target.key)}" aria-label="${escapeAttr(psT("post.share.removeRecipientAria", {}, "Remove recipient"))}">
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
    resultList.innerHTML = `<div class="post-share-chat-empty-state">${escapeHtml(message || psT("common.empty.noResults", {}, "No results."))}</div>`;
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
    const name = truncateSafe(target.name, 42) || psT("common.labels.user", {}, "User");
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

    const sectionsHtml = renderResultSection(
      psT("post.share.recipientsSection", {}, "Recipients"),
      state.targetResults,
    );

    if (!sectionsHtml) {
      const hasKeyword = state.searchKeyword.length > 0;
      renderResultsEmpty(
        hasKeyword
          ? psT("post.share.noMatchingRecipients", {}, "No matching users or groups")
          : psT("post.share.noRecentContacts", {}, "No recent contacts"),
      );
      return;
    }

    resultList.innerHTML = sectionsHtml;
    if (global.lucide) {
      global.lucide.createIcons({ container: resultList });
    }
  }

  function updateModalModeUi() {
    const {
      title,
      searchInput,
      contentWrap,
      contentInput,
      contentEmojiPicker,
      selectedHint,
      sendBtn,
    } = getModalElements();

    if (title) {
      title.textContent = isForwardMode()
        ? psT("post.share.forwardTitle", {}, "Forward message")
        : psT("post.share.shareTitle", {}, "Share post");
    }

    if (selectedHint) {
      selectedHint.textContent = isForwardMode()
        ? psT("post.share.selectedHintForward", {}, "Select one or more chats to forward to.")
        : psT("post.share.selectedHintShare", {}, "Select one or more users or groups.");
    }

    if (searchInput) {
      searchInput.placeholder = isForwardMode()
        ? psT("post.share.searchPlaceholderForward", {}, "Search chat recipients...")
        : psT("post.share.searchPlaceholderShare", {}, "Search username, full name, or group name...");
    }

    if (contentWrap) {
      contentWrap.classList.toggle("hidden", isForwardMode());
      contentWrap.style.display = isForwardMode() ? "none" : "";
    }

    if (isForwardMode() && contentInput) {
      contentInput.value = "";
      autoResizeContentInput(contentInput);
      if (contentEmojiPicker && global.EmojiUtils?.closePicker) {
        global.EmojiUtils.closePicker(contentEmojiPicker);
      }
    }

    if (sendBtn && !state.isSending) {
      sendBtn.textContent = getActionVerb();
    }
  }

  function updateSendButtonState() {
    const { sendBtn } = getModalElements();
    if (!sendBtn) return;

    const hasRecipients = state.selectedTargets.size > 0;
    sendBtn.disabled = !hasRecipients || state.isSending;
    sendBtn.textContent = state.isSending
      ? isForwardMode()
        ? psT("common.buttons.sending", {}, "Sending...")
        : psT("common.buttons.sending", {}, "Sending...")
      : getActionVerb();
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

  async function readApiError(res, action, fallbackKey) {
    let rawMessage = "";
    if (!res) return psUiError(action, 0, "", fallbackKey);

    try {
      const data = await res.clone().json();
      if (data && typeof data === "object") {
        rawMessage = (
          data.message ||
          data.Message ||
          data.title ||
          data.Title ||
          ""
        )
          .toString()
          .trim();
      }
    } catch (_) {}

    return psUiError(action, res.status, rawMessage, fallbackKey);
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
      errorMessage: rawResult.errorMessage || rawResult.ErrorMessage || "",
      conversationId,
      message,
    };
  }

  function extractSelectedRecipientIds() {
    const targets = Array.from(state.selectedTargets.values());
    const conversationIds = targets
      .filter((target) => target.type === "conversation")
      .map((target) => target.id);
    const receiverIds = targets
      .filter((target) => target.type === "receiver")
      .map((target) => target.id);
    return { targets, conversationIds, receiverIds };
  }

  function syncConversationListAfterSend(successResults) {
    const chatSidebar = global.ChatSidebar;
    if (!chatSidebar) return;

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
          const previewMeta =
            window.ChatCommon &&
            typeof ChatCommon.getLastMsgPreviewMeta === "function"
              ? ChatCommon.getLastMsgPreviewMeta(conversation, {
                  message: result.message,
                })
              : null;
          conversation.lastMessagePreview = previewMeta?.text || null;
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

  function handleSendResults(results, action) {
    const successResults = results.filter((result) => result.isSuccess);
    const failedResults = results.filter((result) => !result.isSuccess);

    syncConversationListAfterSend(successResults);

    const verbPast = action === "forward" ? "Forwarded" : "Shared";
    const fallbackError =
      action === "forward"
        ? psT("errors.post.shareForward", {}, "Could not forward this message right now.")
        : psT("errors.post.shareChat", {}, "Could not share this post right now.");

    if (successResults.length > 0 && failedResults.length === 0) {
      if (global.toastSuccess) {
        global.toastSuccess(
          psT(
            action === "forward"
              ? "post.share.forwardSuccess"
              : "post.share.shareSuccess",
            {
              count: successResults.length,
              suffix: successResults.length > 1 ? "s" : "",
            },
            `${verbPast} to ${successResults.length} chat${successResults.length > 1 ? "s" : ""}.`,
          ),
        );
      }
      closeModal({ force: true });
      return;
    }

    if (successResults.length > 0) {
      if (global.toastInfo) {
        global.toastInfo(
          psT(
            action === "forward"
              ? "post.share.forwardPartial"
              : "post.share.sharePartial",
            {
              successCount: successResults.length,
              successSuffix: successResults.length > 1 ? "s" : "",
              failedCount: failedResults.length,
            },
            `${verbPast} to ${successResults.length} chat${successResults.length > 1 ? "s" : ""}. ${failedResults.length} failed.`,
          ),
        );
      }
      closeModal({ force: true });
      return;
    }

    const firstErrorRaw =
      failedResults.find((result) => result.errorMessage)?.errorMessage || "";
    const firstError = psTranslateServerText(firstErrorRaw) || fallbackError;
    if (global.toastError) {
      global.toastError(firstError);
    }
  }

  async function sendPostShare() {
    if (state.isSending || !state.postId) return;

    const { targets, conversationIds, receiverIds } =
      extractSelectedRecipientIds();
    if (!targets.length) return;

    if (!conversationIds.length && !receiverIds.length) return;
    if (!global.API?.Messages?.sharePost) {
      if (global.toastError) {
        global.toastError(
          psT("post.share.shareUnavailable", {}, "Share API is unavailable."),
        );
      }
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
        tempId:
          global.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });

      if (!res.ok) {
        const errorMessage = await readApiError(
          res,
          "share-chat",
          "errors.post.shareChat",
        );
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
      handleSendResults(results, "share");
    } catch (error) {
      console.error("Failed to share post:", error);
      if (global.toastError) {
        global.toastError(psT("errors.post.shareChat", {}, "Could not share this post right now."));
      }
    } finally {
      state.isSending = false;
      updateSendButtonState();
    }
  }

  async function sendForwardMessage() {
    if (state.isSending || !state.sourceMessageId) return;

    const { targets, conversationIds, receiverIds } =
      extractSelectedRecipientIds();
    if (!targets.length) return;

    if (!conversationIds.length && !receiverIds.length) return;
    if (!global.API?.Messages?.forward) {
      if (global.toastError) {
        global.toastError(
          psT("post.share.forwardUnavailable", {}, "Forward API is unavailable."),
        );
      }
      return;
    }

    state.isSending = true;
    updateSendButtonState();

    try {
      const res = await global.API.Messages.forward({
        sourceMessageId: state.sourceMessageId,
        conversationIds,
        receiverIds,
        tempId:
          global.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });

      if (!res.ok) {
        const errorMessage = await readApiError(
          res,
          "share-forward",
          "errors.post.shareForward",
        );
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
      handleSendResults(results, "forward");
    } catch (error) {
      console.error("Failed to forward message:", error);
      if (global.toastError) {
        global.toastError(psT("errors.post.shareForward", {}, "Could not forward this message right now."));
      }
    } finally {
      state.isSending = false;
      updateSendButtonState();
    }
  }

  async function sendCurrentAction() {
    if (isForwardMode()) {
      await sendForwardMessage();
      return;
    }
    await sendPostShare();
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
      renderResultsEmpty(psT("post.share.searchUnavailable", {}, "Search is unavailable right now."));
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
          "share-chat",
          "post.share.searchFailed",
        );
        renderResultsEmpty(errorMessage);
        return;
      }

      const payload = await searchRes.json().catch(() => ({}));
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
      renderResultsEmpty(psT("post.share.serverUnavailable", {}, "Could not connect to server."));
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
    state.isDiscardConfirmOpen = false;

    if (state.searchDebounceTimer) {
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = null;
    }

    const { searchInput, contentInput, contentEmojiPicker } =
      getModalElements();
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

  function hasPendingChanges() {
    if (state.selectedTargets.size > 0) {
      return true;
    }

    const { contentInput } = getModalElements();
    const normalizedContent = normalizeContentForSend(
      contentInput?.value || "",
    );
    return normalizedContent.length > 0;
  }

  function showDiscardConfirmation(onConfirmDiscard) {
    if (state.isDiscardConfirmOpen) {
      return;
    }

    state.isDiscardConfirmOpen = true;

    const handleConfirm = () => {
      state.isDiscardConfirmOpen = false;
      if (typeof onConfirmDiscard === "function") {
        onConfirmDiscard();
      }
    };

    const handleCancel = () => {
      state.isDiscardConfirmOpen = false;
    };

    if (
      global.ChatCommon &&
      typeof global.ChatCommon.showConfirm === "function"
    ) {
      global.ChatCommon.showConfirm({
        title: psT("post.share.discardTitle", {}, "Discard changes?"),
        message: psT(
          "post.share.discardDescription",
          {},
          "You have unsent changes. Are you sure you want to discard them?",
        ),
        confirmText: psT("common.buttons.discard", {}, "Discard"),
        cancelText: psT("common.buttons.keep", {}, "Keep"),
        isDanger: true,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      });
      return;
    }

      const confirmed = global.confirm(
        psT("post.share.discardDescription", {}, "Discard unsent changes?"),
      );
    if (confirmed) {
      handleConfirm();
      return;
    }

    handleCancel();
  }

  function requestCloseModal(options = {}) {
    const force = options.force === true;
    if (force) {
      closeModal({ force: true });
      return;
    }

    if (state.isSending) {
      return;
    }

    if (!hasPendingChanges()) {
      closeModal();
      return;
    }

    showDiscardConfirmation(() => {
      closeModal({ force: true });
    });
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
    state.isDiscardConfirmOpen = false;
    const { contentEmojiPicker } = getModalElements();
    if (contentEmojiPicker && global.EmojiUtils?.closePicker) {
      global.EmojiUtils.closePicker(contentEmojiPicker);
    }

    state.modal.classList.remove("show");
    if (state.ownsScrollLock && typeof global.unlockScroll === "function") {
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
    const contentInput = state.modal.querySelector(
      "#postShareChatContentInput",
    );
    const contentEmojiBtn = state.modal.querySelector(
      "#postShareChatContentEmojiBtn",
    );
    const contentEmojiPicker = state.modal.querySelector(
      "#postShareChatContentEmojiPicker",
    );
    const resultList = state.modal.querySelector("#postShareChatResultList");
    const selectedList = state.modal.querySelector(
      "#postShareChatSelectedList",
    );
    const sendBtn = state.modal.querySelector("#postShareChatSendBtn");

    closeBtn?.addEventListener("click", () => requestCloseModal());
    cancelBtn?.addEventListener("click", () => requestCloseModal());
    sendBtn?.addEventListener("click", sendCurrentAction);

    state.modal.addEventListener("click", (event) => {
      if (event.target === state.modal) {
        requestCloseModal();
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
      contentInput.addEventListener("focus", () =>
        autoResizeContentInput(contentInput),
      );
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
          <h2 class="modal-title" id="postShareChatModalTitle">${escapeHtml(psT("post.share.shareTitle", {}, "Share post"))}</h2>
          <button type="button" class="modal-back-btn" id="postShareChatCloseBtn" aria-label="${escapeAttr(psT("common.buttons.close", {}, "Close"))}">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="post-share-chat-body">
          <div class="post-share-chat-selected">
            <div class="post-share-chat-selected-header">
              <span class="post-share-chat-label">${escapeHtml(psT("post.share.recipientsSection", {}, "Recipients"))}</span>
              <span class="post-share-chat-selected-count" id="postShareChatSelectedCount">${escapeHtml(psT("post.share.selectedCount", { count: 0 }, "0 selected"))}</span>
            </div>
            <div class="post-share-chat-selected-list hidden" id="postShareChatSelectedList"></div>
            <div class="post-share-chat-selected-hint" id="postShareChatSelectedHint">${escapeHtml(psT("post.share.selectedHintShare", {}, "Select one or more users or groups."))}</div>
          </div>

          <div class="post-share-chat-search-wrap" id="postShareChatSearchWrap">
            <i data-lucide="search" class="post-share-chat-search-icon"></i>
            <input
              type="text"
              class="post-share-chat-search-input"
              id="postShareChatSearchInput"
              placeholder="${escapeAttr(psT("post.share.searchPlaceholderShare", {}, "Search username, full name, or group name..."))}"
              autocomplete="off"
            />
          </div>

          <div class="post-share-chat-result-list" id="postShareChatResultList"></div>

          <div class="post-share-chat-content-wrap" id="postShareChatContentWrap">
            <div class="post-share-chat-content-input-wrapper">
              <textarea
                class="post-share-chat-content-input"
                id="postShareChatContentInput"
                placeholder="${escapeAttr(psT("post.share.addMessageOptional", {}, "Add a message (optional)"))}"
                rows="1"
              ></textarea>
              <button
                type="button"
                class="post-share-chat-content-emoji-btn"
                id="postShareChatContentEmojiBtn"
                aria-label="${escapeAttr(psT("post.share.openEmojiPickerAria", {}, "Open emoji picker"))}"
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
          <button type="button" class="post-share-chat-btn-cancel" id="postShareChatCancelBtn">${escapeHtml(psT("common.buttons.cancel", {}, "Cancel"))}</button>
          <button type="button" class="post-share-chat-btn-send" id="postShareChatSendBtn" disabled>${escapeHtml(psT("common.buttons.send", {}, "Send"))}</button>
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
      if (global.toastError) {
        global.toastError(
          psT("post.share.postUnavailable", {}, "Post is unavailable."),
        );
      }
      return;
    }

    ensureModal();
    state.mode = "postShare";
    state.postId = normalizedPostId;
    state.postCode = (options?.postCode || "").toString().trim();
    state.sourceMessageId = "";
    updateModalModeUi();
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

  function openForwardModal(messageId) {
    const normalizedMessageId = normalizeId(messageId);
    if (!normalizedMessageId) {
      if (global.toastError) {
        global.toastError(
          psT("post.share.messageUnavailable", {}, "Message is unavailable."),
        );
      }
      return;
    }

    ensureModal();
    state.mode = "forward";
    state.sourceMessageId = normalizedMessageId;
    state.postId = "";
    state.postCode = "";
    updateModalModeUi();
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
  global.openForwardMessageModal = openForwardModal;
  global.closePostShareChatModal = (options = {}) => requestCloseModal(options);
})(window);
