/**
 * Chat Sidebar Component (formerly ChatPanel)
 * Handles the conversation list sidebar
 */
const ChatSidebar = {
  isOpen: false,
  conversations: [],
  currentFilter: null, // null = All, true = Private, false = Group
  searchTimeout: null,
  searchTerm: "",
  cursorLastMessageSentAt: null,
  cursorConversationId: null,
  isLoading: false,
  hasMore: true,
  pageSize: window.APP_CONFIG?.CONVERSATIONS_PAGE_SIZE || 20,
  currentActiveId: null, // ID of the currently active chat (for highlighting)
  _presenceUnsubscribe: null,
  _onResize: null,
  _dragScrollBlocker: null,
  _draggingConversationId: "",
  settingsPopupCleanup: null,
  _languageCleanup: null,
  settingsLevelMap: {
    onlineStatusVisibility: {
      0: {
        nameKey: "chat.sidebar.settings.no_one",
        name: "No One",
        icon: "lock",
        className: "neutral",
      },
      1: {
        nameKey: "chat.sidebar.settings.contacts_only",
        name: "Contacts Only",
        icon: "users",
        className: "neutral",
      },
    },
    groupChatInvitePermission: {
      0: {
        nameKey: "chat.sidebar.settings.no_one",
        name: "No One",
        icon: "lock",
        className: "neutral",
      },
      1: {
        nameKey: "chat.sidebar.settings.followers_or_following",
        name: "Followers or following",
        icon: "users",
        className: "neutral",
      },
      2: {
        nameKey: "chat.sidebar.settings.anyone",
        name: "Anyone",
        icon: "globe",
        className: "neutral",
      },
    },
  },

  normalizeId(value) {
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.normalizeAccountId === "function"
    ) {
      return window.PresenceUI.normalizeAccountId(value);
    }
    return (value || "").toString().toLowerCase();
  },

  t(key, fallback, params = {}) {
    if (window.ChatCommon && typeof window.ChatCommon.t === "function") {
      return window.ChatCommon.t(key, fallback, params);
    }

    if (typeof fallback !== "string") return key || "";
    return fallback.replace(/\{(\w+)\}/g, (_match, token) => {
      const value = params?.[token];
      return value === null || value === undefined ? "" : String(value);
    });
  },

  formatRelativeTime(value, short = false) {
    if (short) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";

      const diffSeconds = Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / 1000),
      );
      if (diffSeconds < 60) {
        return this.t("chat.sidebar.time.justNow", "just now");
      }

      const minutes = Math.floor(diffSeconds / 60);
      if (minutes < 60) {
        return this.t(
          minutes === 1
            ? "chat.sidebar.time.minuteOne"
            : "chat.sidebar.time.minuteOther",
          minutes === 1 ? "{count} min" : "{count} mins",
          { count: minutes },
        );
      }

      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return this.t(
          hours === 1
            ? "chat.sidebar.time.hourOne"
            : "chat.sidebar.time.hourOther",
          hours === 1 ? "{count} hour" : "{count} hours",
          { count: hours },
        );
      }

      const days = Math.floor(hours / 24);
      if (days < 7) {
        return this.t(
          days === 1
            ? "chat.sidebar.time.dayOne"
            : "chat.sidebar.time.dayOther",
          days === 1 ? "{count} day" : "{count} days",
          { count: days },
        );
      }

      const weeks = Math.floor(days / 7);
      const safeWeeks = Math.max(1, weeks);
      return this.t(
        safeWeeks === 1
          ? "chat.sidebar.time.weekOne"
          : "chat.sidebar.time.weekOther",
        safeWeeks === 1 ? "{count} week" : "{count} weeks",
        { count: safeWeeks },
      );
    }

    if (
      window.ChatCommon &&
      typeof window.ChatCommon.formatRelativeTime === "function"
    ) {
      return window.ChatCommon.formatRelativeTime(value, short);
    }

    return window.PostUtils?.timeAgo
      ? window.PostUtils.timeAgo(value, short)
      : "";
  },

  async readFriendlyApiError(res, options = {}) {
    const fallbackMessage =
      typeof options?.fallbackMessage === "string" &&
      options.fallbackMessage.trim().length > 0
        ? options.fallbackMessage
        : this.t(
            "errors.chat.generic",
            "Something went wrong. Please try again.",
          );

    if (
      window.ChatCommon &&
      typeof window.ChatCommon.readFriendlyApiError === "function"
    ) {
      return window.ChatCommon.readFriendlyApiError(res, {
        feature: "chat",
        ...options,
        fallbackMessage,
      });
    }

    return fallbackMessage;
  },

  createUiError(message) {
    const error = new Error(message);
    error.chatUiMessage = message;
    return error;
  },

  getFriendlyErrorMessage(error, fallbackKey, fallbackMessage, params = {}) {
    const uiMessage =
      typeof error?.chatUiMessage === "string"
        ? error.chatUiMessage.trim()
        : "";
    if (uiMessage) return uiMessage;
    return this.t(fallbackKey, fallbackMessage, params);
  },

  handleLanguageChange() {
    const panel = document.getElementById("chat-panel");
    if (!panel) return;

    const searchValue =
      this.searchTerm ||
      document.getElementById("chat-search-input")?.value?.trim() ||
      "";
    const hadSettingsPopup = !!document.getElementById(
      "chat-sidebar-settings-popup",
    );
    const hadMoreMenu = !!document.getElementById("chat-tabs-more-menu");

    this.renderLayout();

    const searchInput = document.getElementById("chat-search-input");
    if (searchInput) searchInput.value = searchValue;

    this.renderConversations(this.conversations, false);

    if (hadSettingsPopup) {
      const settingsBtn = document.getElementById("chat-sidebar-settings-btn");
      if (settingsBtn) {
        this.openSettingsPopup(settingsBtn);
      }
    }

    if (hadMoreMenu) {
      const moreBtn = document.getElementById("chat-tabs-more-btn");
      if (moreBtn) {
        this.toggleMoreMenu(moreBtn);
      }
    }
  },

  getCurrentPathFromHash() {
    if (
      window.RouteHelper &&
      typeof window.RouteHelper.parseHash === "function"
    ) {
      return (
        window.RouteHelper.parseHash(window.location.hash || "").path || ""
      );
    }

    const raw = (window.location.hash || "").replace(/^#/, "");
    const pathOnly = raw.split("?")[0] || "";
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  },

  isChatRoutePath(path) {
    const routePath = (path || "").toString().trim();
    if (!routePath) return false;

    if (
      window.RouteHelper &&
      typeof window.RouteHelper.isChatPath === "function"
    ) {
      return window.RouteHelper.isChatPath(routePath);
    }

    return (
      routePath === "/chat" ||
      routePath.startsWith("/chat/") ||
      routePath === "/messages" ||
      routePath.startsWith("/messages/")
    );
  },

  isChatRouteFromHash() {
    return this.isChatRoutePath(this.getCurrentPathFromHash());
  },

  shouldUseMobileFloatingMenuLayout() {
    return (
      window.innerWidth <= 768 ||
      document.body.classList.contains("is-mobile-layout")
    );
  },

  extractConversationIdFromHash() {
    if (
      window.RouteHelper &&
      typeof window.RouteHelper.extractConversationIdFromHash === "function"
    ) {
      return (
        window.RouteHelper.extractConversationIdFromHash(
          window.location.hash || "",
        ) || ""
      )
        .toString()
        .trim();
    }

    const hash = window.location.hash || "";
    if (!hash.includes("?id=")) return "";
    return hash.split("?id=")[1].split("&")[0] || "";
  },

  getPrivateOtherAccountId(conv = {}) {
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.getPrivateOtherAccountId === "function"
    ) {
      return window.PresenceUI.getPrivateOtherAccountId(conv);
    }
    const isGroup = !!(conv.isGroup ?? conv.IsGroup);
    if (isGroup) return "";
    return this.normalizeId(
      conv.otherMember?.accountId ||
        conv.otherMember?.AccountId ||
        conv.otherMemberId ||
        conv.OtherMemberId ||
        "",
    );
  },

  getPresenceStatusForConversation(conv = {}) {
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.resolveConversationStatus === "function"
    ) {
      return window.PresenceUI.resolveConversationStatus(conv, "");
    }

    const isGroup = !!(conv.isGroup ?? conv.IsGroup);
    if (isGroup) {
      return {
        canShowStatus: false,
        isOnline: false,
        showDot: false,
        text: "",
      };
    }

    const accountId = this.getPrivateOtherAccountId(conv);
    if (
      window.PresenceStore &&
      typeof window.PresenceStore.resolveStatus === "function"
    ) {
      return window.PresenceStore.resolveStatus({
        accountId,
      });
    }

    return {
      canShowStatus: false,
      isOnline: false,
      showDot: false,
      text: "",
    };
  },

  initPresenceTracking() {
    if (this._presenceUnsubscribe) return;
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.subscribe === "function"
    ) {
      this._presenceUnsubscribe = window.PresenceUI.subscribe((payload) => {
        this.refreshPresenceIndicators(payload?.changedAccountIds || []);
      });
      return;
    }
    if (
      !window.PresenceStore ||
      typeof window.PresenceStore.subscribe !== "function"
    )
      return;

    this._presenceUnsubscribe = window.PresenceStore.subscribe((payload) => {
      this.refreshPresenceIndicators(payload?.changedAccountIds || []);
    });
  },

  syncPresenceSnapshotForConversations(conversations, options = {}) {
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.ensureSnapshotForConversations === "function"
    ) {
      window.PresenceUI.ensureSnapshotForConversations(
        conversations,
        options,
      ).catch((error) => {
        console.warn("[ChatSidebar] Presence snapshot sync failed:", error);
      });
      return;
    }

    if (
      !window.PresenceStore ||
      typeof window.PresenceStore.ensureSnapshotForConversations !== "function"
    ) {
      return;
    }

    window.PresenceStore.ensureSnapshotForConversations(
      conversations,
      options,
    ).catch((error) => {
      console.warn("[ChatSidebar] Presence snapshot sync failed:", error);
    });
  },

  refreshPresenceIndicators(changedAccountIds = []) {
    const listContainer = document.getElementById("chat-conversation-list");
    if (!listContainer) return;

    const changedSet = new Set(
      (Array.isArray(changedAccountIds) ? changedAccountIds : [])
        .map((id) => this.normalizeId(id))
        .filter(Boolean),
    );

    const conversationMap = new Map(
      (Array.isArray(this.conversations) ? this.conversations : []).map(
        (conv) => [
          this.normalizeId(conv.conversationId || conv.ConversationId),
          conv,
        ],
      ),
    );

    listContainer
      .querySelectorAll(".chat-item[data-conversation-id]")
      .forEach((item) => {
        const conversationId = this.normalizeId(item.dataset.conversationId);
        const conv = conversationMap.get(conversationId);
        if (!conv) return;

        const accountId = this.getPrivateOtherAccountId(conv);
        if (changedSet.size > 0 && (!accountId || !changedSet.has(accountId))) {
          return;
        }

        const presenceStatus = this.getPresenceStatusForConversation(conv);
        const isGroupChat = !!(conv.isGroup ?? conv.IsGroup);
        const shouldShowOnlineDot = !isGroupChat && !!presenceStatus.showDot;
        const avatarWrapper = item.querySelector(".chat-avatar-wrapper");
        if (!avatarWrapper) return;

        const existingDot = avatarWrapper.querySelector(".chat-status-dot");
        if (shouldShowOnlineDot) {
          if (!existingDot) {
            avatarWrapper.insertAdjacentHTML(
              "beforeend",
              '<div class="chat-status-dot"></div>',
            );
          }
        } else if (existingDot) {
          existingDot.remove();
        }
      });
  },

  normalizeAccountSettings(raw = {}) {
    const onlineStatusVisibility = Number(
      raw.onlineStatusVisibility ?? raw.OnlineStatusVisibility ?? 1,
    );
    const groupChatInvitePermission = Number(
      raw.groupChatInvitePermission ?? raw.GroupChatInvitePermission ?? 2,
    );

    return {
      onlineStatusVisibility: Number.isFinite(onlineStatusVisibility)
        ? onlineStatusVisibility
        : 1,
      groupChatInvitePermission: Number.isFinite(groupChatInvitePermission)
        ? groupChatInvitePermission
        : 2,
    };
  },

  getSettingConfig(settingKey, value) {
    const options = this.settingsLevelMap[settingKey] || {};
    if (options[value]) return options[value];

    const fallback = Object.keys(options)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)[0];
    return options[fallback];
  },

  getNextSettingValue(settingKey, currentValue) {
    const options = this.settingsLevelMap[settingKey] || {};
    const values = Object.keys(options)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (!values.length) return currentValue;

    const currentIndex = values.indexOf(Number(currentValue));
    if (currentIndex < 0) return values[0];

    return values[(currentIndex + 1) % values.length];
  },

  applySettingsToggleUI(button, label, settingKey, value) {
    if (!button || !label) return;
    const config = this.getSettingConfig(settingKey, value);
    if (!config) return;

    button.className = `chat-settings-toggle-btn ${config.className}`;
    button.dataset.value = String(value);
    button.innerHTML = `<i data-lucide="${config.icon}" size="16"></i>`;
    label.textContent = this.t(config.nameKey, config.name);
  },

  getGroupSenderName(sender = {}, conv = null) {
    if (
      window.ChatCommon &&
      typeof ChatCommon.getPreferredSenderName === "function"
    ) {
      const resolved = ChatCommon.getPreferredSenderName(sender, {
        conversation: conv,
        conversationId: conv?.conversationId || conv?.ConversationId || "",
        fallback: this.t("common.labels.user", "User"),
      });
      if (resolved) return resolved;
    }

    const nickname = sender.nickname ?? sender.Nickname ?? null;
    if (typeof nickname === "string" && nickname.trim().length > 0) {
      return nickname.trim();
    }

    const username =
      sender.username ??
      sender.userName ??
      sender.Username ??
      sender.UserName ??
      null;
    if (typeof username === "string" && username.trim().length > 0) {
      return username.trim();
    }

    return this.t("common.labels.user", "User");
  },

  buildLastMessagePreviewDisplay(conv = {}, message = null) {
    const hasExplicitMessageOverride =
      message !== null && message !== undefined;
    let resolvedMessage =
      message || conv?.lastMessage || conv?.LastMessage || null;
    const meta =
      window.ChatCommon &&
      typeof ChatCommon.getLastMsgPreviewMeta === "function"
        ? hasExplicitMessageOverride
          ? ChatCommon.getLastMsgPreviewMeta(conv, { message: resolvedMessage })
          : ChatCommon.getLastMsgPreviewMeta(conv)
        : {
            text:
              window.ChatCommon &&
              typeof ChatCommon.getLastMsgPreview === "function"
                ? hasExplicitMessageOverride
                  ? ChatCommon.getLastMsgPreview(conv, {
                      message: resolvedMessage,
                    })
                  : ChatCommon.getLastMsgPreview(conv)
                : "",
            isDerived: false,
          };

    const isSystemLastMessage =
      window.ChatCommon && typeof ChatCommon.isSystemMessage === "function"
        ? ChatCommon.isSystemMessage(resolvedMessage)
        : false;

    const senderId = (
      resolvedMessage?.sender?.accountId ||
      resolvedMessage?.sender?.AccountId ||
      resolvedMessage?.Sender?.accountId ||
      resolvedMessage?.Sender?.AccountId ||
      ""
    ).toLowerCase();
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const isGroup = !!(conv?.isGroup ?? conv?.IsGroup ?? false);

    let prefix = "";
    if (senderId && !isSystemLastMessage) {
      if (senderId === myId) {
        prefix = `${this.t("common.labels.you", "You")}: `;
      } else if (isGroup) {
        const senderPayload =
          resolvedMessage?.sender || resolvedMessage?.Sender || {};
        const senderName = this.getGroupSenderName(senderPayload, conv);
        prefix = `${senderName}: `;
      }
    }

    return {
      prefix,
      text: meta?.text || "",
      isDerived: !!meta?.isDerived,
    };
  },

  buildLastMessagePreviewHtml(previewData = {}) {
    const prefixText = escapeHtml(previewData.prefix || "");
    const contentText = escapeHtml(previewData.text || "");
    const contentClass = previewData.isDerived
      ? "chat-last-msg-text chat-last-msg-derived"
      : "chat-last-msg-text";

    return `${prefixText ? `<span class="chat-last-msg-prefix">${prefixText}</span>` : ""}<span class="${contentClass}">${contentText}</span>`;
  },

  getMemberAvatarUrl(member = {}) {
    return (
      member.avatarUrl ||
      member.AvatarUrl ||
      member.avatar ||
      APP_CONFIG.DEFAULT_AVATAR
    );
  },

  getMemberDisplayName(member = {}) {
    const nickname = member.nickname ?? member.Nickname ?? null;
    if (typeof nickname === "string" && nickname.trim().length > 0) {
      return nickname.trim();
    }

    const username =
      member.username ??
      member.userName ??
      member.Username ??
      member.UserName ??
      null;
    if (typeof username === "string" && username.trim().length > 0) {
      return username.trim();
    }

    const displayName = member.displayName ?? member.DisplayName ?? null;
    if (typeof displayName === "string" && displayName.trim().length > 0) {
      return displayName.trim();
    }

    const fullName = member.fullName ?? member.FullName ?? null;
    if (typeof fullName === "string" && fullName.trim().length > 0) {
      return fullName.trim();
    }

    return this.t("common.labels.user", "User");
  },

  getOpenChatData(conversationId) {
    const openChats = window.ChatWindow?.openChats;
    if (!openChats || typeof openChats.entries !== "function") {
      return null;
    }

    const targetId = this.normalizeId(conversationId);
    if (!targetId) return null;

    for (const [openId, chat] of openChats.entries()) {
      if (this.normalizeId(openId) !== targetId) continue;
      return chat?.data || chat?.metaData || null;
    }

    return null;
  },

  resolveSeenMemberInfo(conv, accountId) {
    if (!conv) return null;

    const targetAccId = this.normalizeId(accountId);
    if (!targetAccId) return null;

    const candidates = [];
    const addCandidate = (member) => {
      if (!member || typeof member !== "object") return;
      const memberId = this.normalizeId(member.accountId || member.AccountId);
      if (!memberId || memberId !== targetAccId) return;
      candidates.push(member);
    };
    const addMany = (members) => {
      if (!Array.isArray(members)) return;
      members.forEach(addCandidate);
    };

    addCandidate(conv.otherMember);
    addCandidate(conv.lastMessage?.sender);
    addCandidate(conv.lastMessage?.Sender);
    addMany(conv.members);
    addMany(conv.memberSeenStatuses);
    addMany(conv.lastMessageSeenBy);

    const convIdNorm = this.normalizeId(
      conv.conversationId || conv.ConversationId,
    );
    const pageMeta = window.ChatPage?.currentMetaData;
    if (
      pageMeta &&
      this.normalizeId(pageMeta.conversationId || pageMeta.ConversationId) ===
        convIdNorm
    ) {
      addCandidate(pageMeta.otherMember);
      addMany(pageMeta.members);
      addMany(pageMeta.memberSeenStatuses);
    }

    const openChatData = this.getOpenChatData(
      conv.conversationId || conv.ConversationId,
    );
    if (openChatData) {
      addCandidate(openChatData.otherMember);
      addMany(openChatData.members);
      addMany(openChatData.memberSeenStatuses);
    }

    if (!candidates.length) return null;

    let best = null;
    let bestScore = -1;
    candidates.forEach((candidate) => {
      const avatarUrl = this.getMemberAvatarUrl(candidate);
      const displayName = this.getMemberDisplayName(candidate);

      let score = 0;
      if (avatarUrl && avatarUrl !== APP_CONFIG.DEFAULT_AVATAR) score += 2;
      if (displayName && displayName !== this.t("common.labels.user", "User"))
        score += 1;
      if (candidate === conv.otherMember) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = {
          accountId: targetAccId,
          avatarUrl: avatarUrl || APP_CONFIG.DEFAULT_AVATAR,
          displayName: displayName || this.t("common.labels.user", "User"),
        };
      }
    });

    return best;
  },

  normalizeSeenMembers(conv) {
    if (!conv || !Array.isArray(conv.lastMessageSeenBy)) return;

    const seenMap = new Map();
    conv.lastMessageSeenBy.forEach((member, idx) => {
      const rawId = member?.accountId || member?.AccountId || "";
      const normalizedId = this.normalizeId(rawId);
      const resolved = this.resolveSeenMemberInfo(conv, normalizedId || rawId);
      const fallback = {
        accountId: normalizedId || `${idx}`,
        avatarUrl: this.getMemberAvatarUrl(member),
        displayName: this.getMemberDisplayName(member),
      };
      const normalizedMember = resolved || fallback;
      if (!normalizedMember.accountId) return;
      seenMap.set(normalizedMember.accountId, normalizedMember);
    });

    conv.lastMessageSeenBy = Array.from(seenMap.values());
    const currentSeenCount = Number(conv.lastMessageSeenCount || 0);
    conv.lastMessageSeenCount = Math.max(
      Number.isFinite(currentSeenCount) ? currentSeenCount : 0,
      conv.lastMessageSeenBy.length,
    );
  },

  handleDragStart(e, conversationId) {
    // Disable drag-drop to open floating windows if we are on the dedicated Chat Page
    if (document.body.classList.contains("is-chat-page")) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData("text/plain", conversationId);
    e.dataTransfer.setData("application/x-social-chat-external", "true");
    e.dataTransfer.effectAllowed = "move";
    this._draggingConversationId = conversationId || "";

    document.body.classList.add("is-dragging-chat");
    if (
      window.ChatWindow &&
      typeof window.ChatWindow.setGlobalDragInteractionLock === "function"
    ) {
      window.ChatWindow.setGlobalDragInteractionLock(true);
    }
    if (!this._dragScrollBlocker) {
      this._dragScrollBlocker = (evt) => {
        evt.preventDefault();
      };
    }
    window.addEventListener("wheel", this._dragScrollBlocker, {
      passive: false,
    });
    window.addEventListener("touchmove", this._dragScrollBlocker, {
      passive: false,
    });

    // Better Drag Image (Ghost Card)
    const item = e.target.closest(".chat-item");
    const name =
      item?.querySelector(".chat-name")?.textContent?.trim() ||
      this.t("chat.page.chatFallback", "Chat");
    const avatarSrc =
      item?.querySelector(".chat-avatar")?.src ||
      window.APP_CONFIG?.DEFAULT_AVATAR;

    const ghost = document.createElement("div");
    ghost.className = "chat-drag-ghost";
    ghost.style.top = "-1000px";
    ghost.innerHTML = `
            <img src="${avatarSrc}" class="chat-drag-ghost-avatar">
              <div class="chat-drag-ghost-meta">
                <div class="chat-drag-ghost-name">${escapeHtml(name)}</div>
              <div class="chat-drag-ghost-sub">${escapeHtml(this.t("chat.sidebar.drag.open", "Drop to open chat"))}</div>
            </div>
        `;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => ghost.remove(), 0);

    // Background sync if it's already open
    const existing = document.getElementById(`chat-box-${conversationId}`);
    if (existing) existing.classList.add("is-dragging-external");
  },

  handleDragEnd() {
    document.body.classList.remove("is-dragging-chat");
    if (
      window.ChatWindow &&
      typeof window.ChatWindow.setGlobalDragInteractionLock === "function"
    ) {
      window.ChatWindow.setGlobalDragInteractionLock(false);
    }
    if (this._dragScrollBlocker) {
      window.removeEventListener("wheel", this._dragScrollBlocker);
      window.removeEventListener("touchmove", this._dragScrollBlocker);
    }
    const stack = document.getElementById("chat-windows-stack");
    if (stack) {
      stack.classList.remove("drag-over-stack");
    }
    if (
      window.ChatWindow &&
      typeof window.ChatWindow.clearDropIndicator === "function"
    ) {
      window.ChatWindow.clearDropIndicator();
    }
    document
      .querySelectorAll(".is-dragging-external")
      .forEach((el) => el.classList.remove("is-dragging-external"));
    this._draggingConversationId = "";
  },

  async init() {
    if (!document.getElementById("chat-panel")) {
      const panel = document.createElement("div");
      panel.id = "chat-panel";
      panel.className = "chat-sidebar-panel"; // Renamed class for clarity
      document.body.appendChild(panel);
      this.renderLayout();
      this.initScrollListener();
    }

    this.initPresenceTracking();

    // Removed: Auto-close on click outside.
    // Logic moved to explicit close button for better persistence.

    const initialConversationId = this.extractConversationIdFromHash();
    if (initialConversationId) {
      this.currentActiveId = this.normalizeId(initialConversationId);
    }

    if (this.isChatRouteFromHash()) {
      this.open();
    }

    // Auto-highlight based on URL change
    window.addEventListener("hashchange", () => {
      const isChatRoute = this.isChatRouteFromHash();
      const id = this.extractConversationIdFromHash();
      if (isChatRoute && id) {
        this.updateActiveId(id);
      } else if (!isChatRoute) {
        this.updateActiveId(null);
      } else {
        // Chat route without conversationId: keep panel state, clear active item.
        this.updateActiveId(null);
      }
    });

    if (!this._onResize) {
      this._onResize = () => {
        this.updateTabsIndicator();
        this.updateActiveItemIndicator();
      };
      window.addEventListener("resize", this._onResize);
    }

    if (
      !this._languageCleanup &&
      window.ChatCommon &&
      typeof window.ChatCommon.onLanguageChange === "function"
    ) {
      this._languageCleanup = window.ChatCommon.onLanguageChange(() => {
        this.handleLanguageChange();
      });
    }
  },

  renderLayout() {
    const panel = document.getElementById("chat-panel");
    const username =
      localStorage.getItem("username") || this.t("common.labels.user", "User");
    this.closeSettingsPopup();

    panel.innerHTML = `
            <div class="chat-sidebar-header">
                <div class="chat-header-title-area">
                    <h2>${username}</h2>
                    <button class="chat-icon-btn chat-sidebar-settings-btn" id="chat-sidebar-settings-btn" title="${this.t("chat.sidebar.settings.title", "Chat settings")}" aria-label="${this.t("chat.sidebar.settings.title", "Chat settings")}">
                        <i data-lucide="settings" size="18"></i>
                    </button>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-icon-btn chat-sidebar-close-btn" onclick="window.closeChatSidebar()" title="${this.t("common.buttons.close", "Close")}">
                        <i data-lucide="x" size="22"></i>
                    </button>
                </div>
            </div>
            
            <div class="chat-search-container">
                <div class="chat-search-wrapper">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="${this.t("chat.sidebar.searchPlaceholder", "Search")}" id="chat-search-input">
                </div>
            </div>

            <div class="chat-tabs">
                <div class="chat-tabs-list">
                    <div class="chat-tab ${this.currentFilter === null ? "active" : ""}" data-filter="null">${this.t("chat.sidebar.tabs.all", "All")}</div>
                    <div class="chat-tab ${this.currentFilter === true ? "active" : ""}" data-filter="true">${this.t("chat.sidebar.tabs.private", "Private")}</div>
                    <div class="chat-tab ${this.currentFilter === false ? "active" : ""}" data-filter="false">${this.t("chat.sidebar.tabs.group", "Group")}</div>
                    <div class="chat-tabs-indicator" id="chat-tabs-indicator" aria-hidden="true"></div>
                </div>
                <button class="chat-tabs-more-btn" id="chat-tabs-more-btn" title="${this.t("chat.sidebar.moreOptionsTitle", "More options")}">
                    <i data-lucide="ellipsis" size="18"></i>
                </button>
            </div>

            <div class="chat-list" id="chat-conversation-list">
                <div class="loading-conversations">
                    <div class="spinner spinner-medium" aria-hidden="true"></div>
                    <span>${this.t("chat.sidebar.loadingChats", "Loading chats...")}</span>
                </div>
            </div>
        `;

    this.initTabs();
    this.initSearch();
    this.initHeaderSettings();
    this.initMoreMenu();
    lucide.createIcons();
    requestAnimationFrame(() => this.updateTabsIndicator());
  },

  initHeaderSettings() {
    const settingsBtn = document.getElementById("chat-sidebar-settings-btn");
    if (!settingsBtn) return;

    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleSettingsPopup(settingsBtn);
    };
  },

  closeSettingsPopup() {
    const popup = document.getElementById("chat-sidebar-settings-popup");
    if (popup) popup.remove();

    if (typeof this.settingsPopupCleanup === "function") {
      this.settingsPopupCleanup();
      this.settingsPopupCleanup = null;
    }
  },

  toggleSettingsPopup(anchor) {
    const popup = document.getElementById("chat-sidebar-settings-popup");
    if (popup) {
      this.closeSettingsPopup();
      return;
    }
    this.openSettingsPopup(anchor);
  },

  positionSettingsPopup(popup, anchor) {
    if (!popup || !anchor) return;

    if (this.shouldUseMobileFloatingMenuLayout()) {
      popup.style.left = "";
      popup.style.top = "";
      return;
    }

    const margin = 10;
    const rect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    // Align popup top-left directly below the settings button.
    let left = rect.left;
    if (left + popupRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popupRect.width - margin);
    }
    if (left < margin) left = margin;

    let top = rect.bottom + 8;
    if (top + popupRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popupRect.height - margin);
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  },

  scheduleSettingsPopupPosition(popup, anchor) {
    if (!popup || !anchor) return;

    this.positionSettingsPopup(popup, anchor);
    requestAnimationFrame(() => {
      if (!popup.isConnected) return;
      this.positionSettingsPopup(popup, anchor);
    });
  },

  async fetchSidebarSettings() {
    if (!window.API?.Accounts?.getSettings) {
      throw new Error(
        this.t(
          "chat.sidebar.settings.apiUnavailable",
          "Chat settings aren't available right now",
        ),
      );
    }

    const res = await window.API.Accounts.getSettings();
    if (!res.ok) {
      const message = await this.readFriendlyApiError(res, {
        action: "load-sidebar-settings",
        fallbackKey: "errors.chat.settings_load_failed",
        fallbackMessage: "Couldn't load settings",
      });
      throw this.createUiError(message);
    }

    const data = await res.json();
    return this.normalizeAccountSettings(data || {});
  },

  async openSettingsPopup(anchor) {
    if (!anchor) return;

    this.closeSettingsPopup();

    const popup = document.createElement("div");
    popup.id = "chat-sidebar-settings-popup";
    popup.className = "chat-settings-popup";
    popup.innerHTML = `
            <div class="chat-settings-popup-header">
                <h3>${this.t("chat.sidebar.settings.title", "Chat settings")}</h3>
                <button type="button" class="chat-settings-close-btn" aria-label="${this.t("common.buttons.close", "Close")}">
                    <i data-lucide="x" size="16"></i>
                </button>
            </div>
            <div class="chat-settings-popup-body">
                <div class="chat-settings-loading">
                    <div class="spinner spinner-small" aria-hidden="true"></div>
                    <span>${this.t("chat.sidebar.settings.loading", "Loading settings...")}</span>
                </div>
            </div>
        `;

    document.body.appendChild(popup);
    this.scheduleSettingsPopupPosition(popup, anchor);
    lucide.createIcons({ container: popup });
    popup.addEventListener("click", (event) => event.stopPropagation());

    const onDocClick = (event) => {
      if (!popup.contains(event.target) && !anchor.contains(event.target)) {
        this.closeSettingsPopup();
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        this.closeSettingsPopup();
      }
    };
    const onResize = () => {
      const mounted = document.getElementById("chat-sidebar-settings-popup");
      if (mounted) {
        this.scheduleSettingsPopupPosition(mounted, anchor);
      }
    };

    setTimeout(() => document.addEventListener("click", onDocClick), 10);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onResize);

    this.settingsPopupCleanup = () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onResize);
    };

    const closeBtn = popup.querySelector(".chat-settings-close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => this.closeSettingsPopup();
    }

    try {
      const initialSettings = await this.fetchSidebarSettings();
      if (!document.getElementById("chat-sidebar-settings-popup")) return;
      this.renderSettingsPopupBody(popup, initialSettings);
      this.scheduleSettingsPopupPosition(popup, anchor);
    } catch (error) {
      const message = this.getFriendlyErrorMessage(
        error,
        "errors.chat.settings_load_failed",
        "Couldn't load settings",
      );
      const body = popup.querySelector(".chat-settings-popup-body");
      if (body) {
        body.innerHTML = `
                    <div class="chat-settings-error">
                        <i data-lucide="alert-triangle" size="16"></i>
                        <span>${escapeHtml(message)}</span>
                    </div>
        `;
        lucide.createIcons({ container: body });
        this.scheduleSettingsPopupPosition(popup, anchor);
      }
      if (window.toastError) {
        toastError(message);
      }
    }
  },

  renderSettingsPopupBody(popup, initialSettings) {
    const body = popup?.querySelector(".chat-settings-popup-body");
    if (!body) return;

    const draft = {
      onlineStatusVisibility: initialSettings.onlineStatusVisibility,
      groupChatInvitePermission: initialSettings.groupChatInvitePermission,
    };

    body.innerHTML = `
            <div class="chat-settings-item">
                    <div class="chat-settings-item-labels">
                    <div class="chat-settings-item-title">${this.t("chat.sidebar.settings.onlineStatusTitle", "Who can see my online status?")}</div>
                    <div class="chat-settings-item-value" id="chat-setting-online-status-value"></div>
                </div>
                <button type="button" class="chat-settings-toggle-btn" id="chat-setting-online-status-btn" aria-label="${this.t("chat.sidebar.settings.onlineStatusToggleAria", "Toggle online status visibility")}"></button>
            </div>
            <div class="chat-settings-item">
                <div class="chat-settings-item-labels">
                    <div class="chat-settings-item-title">${this.t("chat.sidebar.settings.groupInviteTitle", "Who can add me to group chats?")}</div>
                    <div class="chat-settings-item-value" id="chat-setting-group-invite-value"></div>
                </div>
                <button type="button" class="chat-settings-toggle-btn" id="chat-setting-group-invite-btn" aria-label="${this.t("chat.sidebar.settings.groupInviteToggleAria", "Toggle who can add you to group chats")}"></button>
            </div>
            <div class="chat-settings-actions">
                <button type="button" class="chat-settings-action-btn primary" id="chat-settings-save-btn">
                    <span>${this.t("common.buttons.save", "Save")}</span>
                </button>
            </div>
        `;

    const onlineBtn = body.querySelector("#chat-setting-online-status-btn");
    const onlineLabel = body.querySelector("#chat-setting-online-status-value");
    const groupBtn = body.querySelector("#chat-setting-group-invite-btn");
    const groupLabel = body.querySelector("#chat-setting-group-invite-value");
    const saveBtn = body.querySelector("#chat-settings-save-btn");

    const syncUI = () => {
      this.applySettingsToggleUI(
        onlineBtn,
        onlineLabel,
        "onlineStatusVisibility",
        draft.onlineStatusVisibility,
      );
      this.applySettingsToggleUI(
        groupBtn,
        groupLabel,
        "groupChatInvitePermission",
        draft.groupChatInvitePermission,
      );
      lucide.createIcons({ container: body });
    };

    syncUI();

    if (onlineBtn) {
      onlineBtn.onclick = (event) => {
        event.stopPropagation();
        draft.onlineStatusVisibility = this.getNextSettingValue(
          "onlineStatusVisibility",
          draft.onlineStatusVisibility,
        );
        syncUI();
      };
    }

    if (groupBtn) {
      groupBtn.onclick = (event) => {
        event.stopPropagation();
        draft.groupChatInvitePermission = this.getNextSettingValue(
          "groupChatInvitePermission",
          draft.groupChatInvitePermission,
        );
        syncUI();
      };
    }

    if (saveBtn) {
      saveBtn.onclick = (event) => {
        event.stopPropagation();
        this.saveSettingsFromPopup(draft, saveBtn);
      };
    }
  },

  async saveSettingsFromPopup(draft, saveBtn) {
    if (!saveBtn || saveBtn.disabled) return;

    const defaultHTML = saveBtn.dataset.defaultHtml || saveBtn.innerHTML;
    saveBtn.dataset.defaultHtml = defaultHTML;
    saveBtn.disabled = true;
    saveBtn.classList.add("is-loading");
    saveBtn.innerHTML = `
            <span>${this.t("chat.sidebar.settings.saving", "Saving...")}</span>
        `;

    try {
      const payload = {
        OnlineStatusVisibility: Number(draft.onlineStatusVisibility),
        GroupChatInvitePermission: Number(draft.groupChatInvitePermission),
      };

      const res = await window.API.Accounts.updateSettings(payload);
      if (!res.ok) {
        const message = await this.readFriendlyApiError(res, {
          action: "update-sidebar-settings",
          fallbackKey: "errors.chat.settings_update_failed",
          fallbackMessage: "Couldn't update settings",
        });
        throw this.createUiError(message);
      }

      if (window.toastSuccess) {
        toastSuccess(
          this.t("chat.sidebar.settings.updated", "Chat settings updated"),
        );
      }
      this.closeSettingsPopup();
    } catch (error) {
      const message = this.getFriendlyErrorMessage(
        error,
        "errors.chat.settings_update_failed",
        "Couldn't update settings",
      );
      if (window.toastError) {
        toastError(message);
      }

      if (document.getElementById("chat-sidebar-settings-popup")) {
        saveBtn.disabled = false;
        saveBtn.classList.remove("is-loading");
        saveBtn.innerHTML = saveBtn.dataset.defaultHtml || defaultHTML;
        lucide.createIcons({ container: saveBtn });
      }
    }
  },

  initMoreMenu() {
    const moreBtn = document.getElementById("chat-tabs-more-btn");
    if (!moreBtn) return;

    moreBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleMoreMenu(moreBtn);
    };
  },

  toggleMoreMenu(anchor) {
    let menu = document.getElementById("chat-tabs-more-menu");
    if (menu) {
      menu.remove();
      return;
    }

    menu = document.createElement("div");
    menu.id = "chat-tabs-more-menu";
    menu.className = "chat-tabs-popup-menu";
    menu.innerHTML = `
            <div class="chat-popup-item" id="chat-menu-create-group">
                <i data-lucide="users" size="16"></i>
                <span>${this.t("chat.sidebar.more.createGroup", "Create Group")}</span>
            </div>
            <div class="chat-popup-item" id="chat-menu-blocked-users">
                <i data-lucide="user-x" size="16"></i>
                <span>${this.t("chat.sidebar.more.blockedUsers", "Blocked Users")}</span>
            </div>
        `;

    document.body.appendChild(menu);
    lucide.createIcons({ container: menu });

    menu.style.position = "fixed";
    if (this.shouldUseMobileFloatingMenuLayout()) {
      menu.style.top = "auto";
      menu.style.bottom = "0";
      menu.style.left = "0";
      menu.style.right = "0";
    } else {
      const rect = anchor.getBoundingClientRect();
      menu.style.bottom = "auto";
      menu.style.right = "auto";
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = `${rect.right - menu.offsetWidth}px`;

      // Adjust if off-screen
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.left < 10) menu.style.left = "10px";
    }

    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };

    setTimeout(() => document.addEventListener("click", closeMenu), 10);

    // Menu item actions
    const createGroupBtn = menu.querySelector("#chat-menu-create-group");
    if (createGroupBtn) {
      createGroupBtn.onclick = () => {
        if (window.openCreateChatGroupModal) {
          window.openCreateChatGroupModal();
        } else {
          console.error("openCreateChatGroupModal not found");
          if (window.toastInfo)
            window.toastInfo(
              this.t(
                "chat.sidebar.more.createGroupComingSoon",
                "Create group is in progress",
              ),
            );
        }
        menu.remove();
      };
    }

    const blockedUsersBtn = menu.querySelector("#chat-menu-blocked-users");
    if (blockedUsersBtn) {
      blockedUsersBtn.onclick = () => {
        if (window.BlockUtils?.openBlockedUsersPage) {
          window.BlockUtils.openBlockedUsersPage();
        }
        menu.remove();
      };
    }
  },

  initTabs() {
    const tabs = document.querySelectorAll(".chat-tab");
    tabs.forEach((tab) => {
      tab.onclick = () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.updateTabsIndicator();

        const filterVal = tab.dataset.filter;
        this.currentFilter = filterVal === "null" ? null : filterVal === "true";
        this.cursorLastMessageSentAt = null;
        this.cursorConversationId = null;
        this.hasMore = true;
        this.loadConversations(false);
      };
    });
    this.updateTabsIndicator();
  },

  updateTabsIndicator() {
    const tabsList = document.querySelector(".chat-tabs-list");
    if (!tabsList) return;

    const indicator = tabsList.querySelector(".chat-tabs-indicator");
    if (!indicator) return;

    const activeTab = tabsList.querySelector(".chat-tab.active");
    if (!activeTab) {
      indicator.classList.remove("is-visible");
      return;
    }

    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    indicator.classList.add("is-visible");
  },

  ensureActiveItemIndicator() {
    const listContainer = document.getElementById("chat-conversation-list");
    if (!listContainer) return null;

    let indicator = listContainer.querySelector(".chat-item-active-indicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "chat-item-active-indicator";
      indicator.setAttribute("aria-hidden", "true");
      listContainer.prepend(indicator);
    }

    return indicator;
  },

  updateActiveItemIndicator() {
    const listContainer = document.getElementById("chat-conversation-list");
    if (!listContainer) return;

    const indicator = this.ensureActiveItemIndicator();
    if (!indicator) return;

    const activeItem = listContainer.querySelector(".chat-item.active");
    if (!activeItem) {
      indicator.classList.remove("is-visible");
      return;
    }

    indicator.style.transform = `translateY(${activeItem.offsetTop}px)`;
    indicator.style.height = `${activeItem.offsetHeight}px`;
    indicator.classList.add("is-visible");
  },

  initSearch() {
    const searchInput = document.getElementById("chat-search-input");
    if (!searchInput) return;

    searchInput.oninput = (e) => {
      this.searchTerm = e.target.value.trim();
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.cursorLastMessageSentAt = null;
        this.cursorConversationId = null;
        this.hasMore = true;
        this.loadConversations(false);
      }, 500);
    };
  },

  initScrollListener() {
    const listContainer = document.getElementById("chat-conversation-list");
    if (!listContainer) return;

    listContainer.onscroll = () => {
      if (this.isLoading || !this.hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = listContainer;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        this.loadConversations(true);
      }
    };
  },

  async toggle() {
    this.isOpen ? this.close() : await this.open();
  },

  async open() {
    const panel = document.getElementById("chat-panel");
    if (!panel) return;
    if (window.closeNotificationsPanel) {
      window.closeNotificationsPanel();
    }
    if (window.closeSearchPanel) {
      window.closeSearchPanel();
    }
    panel.classList.add("show");
    this.isOpen = true;
    document.body.classList.add("chat-sidebar-open");

    document.querySelectorAll(".sidebar .menu-item").forEach((item) => {
      if (item.dataset.route === "/messages") item.classList.add("active");
    });

    requestAnimationFrame(() => this.updateTabsIndicator());
    await this.loadConversations();
  },

  close(force = false) {
    if (!force && this.isChatRouteFromHash()) return;

    this.closeSettingsPopup();
    const panel = document.getElementById("chat-panel");
    panel?.classList.remove("show");
    this.isOpen = false;
    document.body.classList.remove("chat-sidebar-open");

    if (window.setActiveSidebar) window.setActiveSidebar();
  },

  async loadConversations(isLoadMore = false) {
    if (this.isLoading) return;
    if (isLoadMore && !this.hasMore) return;

    const listContainer = document.getElementById("chat-conversation-list");
    this.isLoading = true;

    if (!isLoadMore) {
      this.cursorLastMessageSentAt = null;
      this.cursorConversationId = null;
      this.hasMore = true;
      // Show skeleton or loader for fresh load
      listContainer.innerHTML = `
                <div class="chat-sidebar-loader">
                    <div class="spinner spinner-medium"></div>
                    <p>${this.t("chat.sidebar.loadingChats", "Loading chats...")}</p>
                </div>
            `;
    } else {
      // Append small loader at bottom
      const existingLoader = document.getElementById(
        "chat-sidebar-more-loader",
      );
      if (!existingLoader) {
        listContainer.insertAdjacentHTML(
          "beforeend",
          `
                    <div id="chat-sidebar-more-loader" class="chat-sidebar-more-loader">
                        <div class="spinner spinner-small"></div>
                    </div>
                `,
        );
      }
    }

    try {
      const res = await window.API.Conversations.getConversations(
        this.currentFilter,
        this.searchTerm,
        this.pageSize,
        this.cursorLastMessageSentAt,
        this.cursorConversationId,
      );

      if (res.ok) {
        const data = await res.json();
        const items = data.items || data.Items || [];
        const nextCursor = data.nextCursor || data.NextCursor || null;
        const nextCursorLastMessageSentAt = (
          nextCursor?.lastMessageSentAt ||
          nextCursor?.LastMessageSentAt ||
          ""
        )
          .toString()
          .trim();
        const nextCursorConversationId = (
          nextCursor?.conversationId ||
          nextCursor?.ConversationId ||
          ""
        )
          .toString()
          .trim();

        if (isLoadMore) {
          this.conversations = [...this.conversations, ...items];
        } else {
          this.conversations = items;
          listContainer.innerHTML = ""; // Clear loader
        }

        this.hasMore = Boolean(
          nextCursorLastMessageSentAt && nextCursorConversationId,
        );
        this.cursorLastMessageSentAt = this.hasMore
          ? nextCursorLastMessageSentAt
          : null;
        this.cursorConversationId = this.hasMore
          ? nextCursorConversationId
          : null;

        this.syncPresenceSnapshotForConversations(this.conversations);
        this.renderConversations(items, isLoadMore, {
          revealItems: !isLoadMore,
        });

        if (
          window.ChatWindow &&
          window.ChatWindow.openChats &&
          typeof window.ChatWindow.syncUnreadFromSidebar === "function"
        ) {
          for (const [openId] of window.ChatWindow.openChats.entries()) {
            window.ChatWindow.syncUnreadFromSidebar(openId);
          }
        }

        if (
          window.ChatPage &&
          typeof window.ChatPage.updateHeaderUnreadState === "function"
        ) {
          window.ChatPage.updateHeaderUnreadState(
            window.ChatPage.currentChatId,
          );
        }

        window.dispatchEvent(
          new CustomEvent("chat:sidebar-conversations-updated", {
            detail: {
              count: this.conversations.length,
              isLoadMore: !!isLoadMore,
            },
          }),
        );
      } else {
        throw this.createUiError(
          await this.readFriendlyApiError(res, {
            action: "load-conversations",
            fallbackKey: "errors.chat.load_conversations_failed",
            fallbackMessage: "Error loading chats",
          }),
        );
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
      if (!isLoadMore) {
        const message = this.getFriendlyErrorMessage(
          error,
          "errors.chat.load_conversations_failed",
          "Error loading chats",
        );
        listContainer.innerHTML = `
                    <div class="chat-sidebar-loader">
                        <i data-lucide="alert-circle" style="width:24px; height:24px; color:var(--text-tertiary);"></i>
                        <p>${escapeHtml(message)}</p>
                    </div>
                `;
        if (window.lucide) lucide.createIcons({ container: listContainer });
      }
    } finally {
      this.isLoading = false;
    }
  },

  renderConversations(items, isAppend = false, options = {}) {
    const listContainer = document.getElementById("chat-conversation-list");

    if (!isAppend && items.length === 0) {
      listContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-tertiary);">${this.t("chat.sidebar.noMessagesYet", "No messages yet")}</div>`;
      this.updateActiveItemIndicator();
      return;
    }

    const myId = (localStorage.getItem("accountId") || "").toLowerCase();

    const shouldRevealItems = !isAppend && options?.revealItems === true;
    let revealOrder = 0;

    const html = items
      .map((conv) => {
        const name = escapeHtml(ChatCommon.getDisplayName(conv));

        const previewData = this.buildLastMessagePreviewDisplay(conv);
        const lastMsgHtml = this.buildLastMessagePreviewHtml(previewData);
        const lastMsgSenderId = (
          conv.lastMessage?.sender?.accountId ||
          conv.lastMessage?.sender?.AccountId ||
          conv.lastMessage?.Sender?.accountId ||
          conv.lastMessage?.Sender?.AccountId ||
          ""
        ).toLowerCase();

        const time = conv.lastMessageSentAt
          ? this.formatRelativeTime(conv.lastMessageSentAt, true)
          : "";
        const unread = conv.unreadCount > 0;
        const presenceStatus = this.getPresenceStatusForConversation(conv);
        const isGroupChat = !!(conv.isGroup ?? conv.IsGroup);
        const showOnlineDot = !isGroupChat && !!presenceStatus.showDot;
        const isMuted = conv.isMuted ?? conv.IsMuted ?? false;

        const isChatPage = this.isChatRouteFromHash();
        const isActive =
          isChatPage &&
          this.currentActiveId &&
          this.normalizeId(conv.conversationId) ===
            this.normalizeId(this.currentActiveId);
        const revealClass =
          shouldRevealItems && revealOrder < 8 ? " chat-item-reveal" : "";
        const revealStyle = revealClass
          ? ` style="--chat-sidebar-item-reveal-delay:${revealOrder++ * 36}ms"`
          : "";

        // --- Seen Avatars Logic ---
        let seenHtml = "";
        if (
          !unread &&
          lastMsgSenderId === myId &&
          conv.lastMessageSeenBy &&
          conv.lastMessageSeenBy.length > 0
        ) {
          this.normalizeSeenMembers(conv);
          const seenCount =
            conv.lastMessageSeenCount || conv.lastMessageSeenBy.length;
          const extraCount = Math.max(
            0,
            seenCount - conv.lastMessageSeenBy.length,
          );
          seenHtml = `
                    <div class="chat-seen-avatars">
                        ${conv.lastMessageSeenBy
                          .map(
                            (m) => `
                            <img src="${m.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}" 
                                 title="${this.t("chat.message.seen_by", "Seen by {name}", { name: m.displayName })}" 
                                 class="chat-mini-seen-avatar">
                        `,
                          )
                          .join("")}
                        ${extraCount > 0 ? `<span class="chat-seen-more">+${extraCount}</span>` : ""}
                    </div>
                `;
        }

        return `
                <div class="chat-item ${unread ? "unread" : ""} ${isActive ? "active" : ""}${revealClass}" 
                     data-conversation-id="${conv.conversationId}"
                     ${revealStyle}
                     draggable="true"
                     onclick="ChatSidebar.openConversation('${conv.conversationId}')"
                    ondragstart="ChatSidebar.handleDragStart(event, '${conv.conversationId}')"
                    ondragend="ChatSidebar.handleDragEnd()">
                    <div class="chat-avatar-wrapper">
                        ${ChatCommon.renderAvatar(conv, {
                          name,
                          className: "chat-avatar",
                          enableStoryRing: true,
                          storyRingClass: "chat-sidebar-avatar-ring",
                        })}
                        ${showOnlineDot ? '<div class="chat-status-dot"></div>' : ""}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${name}</span>
                            ${isMuted ? '<i data-lucide="bell-off" class="chat-muted-icon"></i>' : ""}
                        </div>
                        <div class="chat-msg-row">
                            <span class="chat-last-msg">${lastMsgHtml}</span>
                            ${time ? `<span class="chat-msg-dot">·</span><span class="chat-meta">${time}</span>` : ""}
                        </div>
                    </div>
                    <div class="chat-item-end">
                        ${unread ? `<div class="chat-unread-badge">${conv.unreadCount > 99 ? "99+" : conv.unreadCount}</div>` : seenHtml}
                    </div>
                </div>
            `;
      })
      .join("");

    if (isAppend) {
      // Remove previous "load more" loader if exists
      const existingLoader = document.getElementById(
        "chat-sidebar-more-loader",
      );
      if (existingLoader) existingLoader.remove();

      listContainer.insertAdjacentHTML("beforeend", html);
    } else {
      listContainer.innerHTML = html;
    }

    lucide.createIcons();
    this.updateActiveItemIndicator();
  },

  openConversation(id) {
    const normalizedId = (id || "").toString().trim();
    if (!normalizedId) return;

    const targetPath = `/chat/${encodeURIComponent(normalizedId)}`;
    const targetHash =
      window.RouteHelper && typeof window.RouteHelper.buildHash === "function"
        ? window.RouteHelper.buildHash(targetPath)
        : `#${targetPath}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
      // The router (app.js) will handle the navigation/update
    } else {
      // Already on this specific conversation hash, just ensure UI is updated
      if (
        window.ChatPage &&
        typeof window.ChatPage.loadConversation === "function"
      ) {
        window.ChatPage.loadConversation(normalizedId);
      }
      this.updateActiveId(normalizedId);
    }
  },

  /**
   * Clear unread badge for a specific conversation.
   * Called after SeenConversation succeeds.
   */
  clearUnread(conversationId) {
    // Update in-memory data
    const conv = this.conversations.find(
      (c) => c.conversationId === conversationId,
    );
    if (conv) {
      conv.unreadCount = 0;
    }

    // Update DOM: find the chat-item and remove unread styling + badge
    const item = document.querySelector(
      `.chat-item[data-conversation-id="${conversationId}"]`,
    );
    if (item) {
      item.classList.remove("unread");
      const badge = item.querySelector(".chat-unread-badge");
      if (badge) badge.remove();
    }
  },

  setMuteStatus(conversationId, isMuted, options = {}) {
    const target = (conversationId || "").toLowerCase();
    if (!target) return false;

    let changed = false;
    this.conversations.forEach((conv) => {
      if ((conv.conversationId || "").toLowerCase() !== target) return;
      const nextMuted = !!isMuted;
      if ((conv.isMuted ?? false) !== nextMuted) {
        conv.isMuted = nextMuted;
        changed = true;
      }
    });

    if (changed || options.forceRender) {
      this.renderConversations(this.conversations, false);
    }
    return changed;
  },

  applyThemeUpdate(conversationId, theme, options = {}) {
    const target = (conversationId || "").toLowerCase();
    if (!target) return false;

    const normalizeTheme = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.resolveConversationTheme === "function"
      ) {
        return window.ChatCommon.resolveConversationTheme(value);
      }
      if (typeof value !== "string") return null;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length ? trimmed : null;
    };
    const normalizedTheme = normalizeTheme(theme);

    let changed = false;
    this.conversations.forEach((conv) => {
      if ((conv.conversationId || "").toLowerCase() !== target) return;
      if ((conv.theme ?? null) === normalizedTheme) return;
      conv.theme = normalizedTheme;
      changed = true;
    });

    if (options.forceRender && changed) {
      this.renderConversations(this.conversations, false);
    }

    return changed;
  },

  applyGroupConversationInfoUpdate(conversationId, payload = {}, options = {}) {
    const target = (conversationId || "").toLowerCase();
    if (!target) return false;

    const hasNameInput =
      typeof payload?.conversationName === "string" &&
      payload.conversationName.trim().length > 0;
    const nextConversationName = hasNameInput
      ? payload.conversationName.trim()
      : null;
    const hasAvatarInput = !!(
      payload?.hasConversationAvatarField ||
      Object.prototype.hasOwnProperty.call(
        payload || {},
        "conversationAvatar",
      ) ||
      Object.prototype.hasOwnProperty.call(payload || {}, "ConversationAvatar")
    );
    const nextConversationAvatar = hasAvatarInput
      ? typeof payload?.conversationAvatar === "string" &&
        payload.conversationAvatar.trim().length > 0
        ? payload.conversationAvatar.trim()
        : null
      : null;
    const hasOwnerInput = !!(
      payload?.hasOwnerField ||
      Object.prototype.hasOwnProperty.call(payload || {}, "owner") ||
      Object.prototype.hasOwnProperty.call(payload || {}, "Owner")
    );
    const nextOwner = hasOwnerInput
      ? (payload?.owner || "").toString().trim().toLowerCase() || null
      : null;

    let changed = false;
    this.conversations.forEach((conv) => {
      if ((conv.conversationId || "").toLowerCase() !== target) return;
      if (!(conv?.isGroup ?? conv?.IsGroup)) return;

      if (hasNameInput) {
        const currentDisplayName = conv.displayName ?? conv.DisplayName ?? null;
        const currentConversationName =
          conv.conversationName ?? conv.ConversationName ?? null;
        if (
          currentDisplayName !== nextConversationName ||
          currentConversationName !== nextConversationName
        ) {
          conv.conversationName = nextConversationName;
          conv.ConversationName = nextConversationName;
          conv.displayName = nextConversationName;
          conv.DisplayName = nextConversationName;
          changed = true;
        }
      }

      if (hasAvatarInput) {
        const currentDisplayAvatar =
          conv.displayAvatar ?? conv.DisplayAvatar ?? null;
        const currentConversationAvatar =
          conv.conversationAvatar ?? conv.ConversationAvatar ?? null;
        if (
          currentDisplayAvatar !== nextConversationAvatar ||
          currentConversationAvatar !== nextConversationAvatar
        ) {
          conv.conversationAvatar = nextConversationAvatar;
          conv.ConversationAvatar = nextConversationAvatar;
          conv.displayAvatar = nextConversationAvatar;
          conv.DisplayAvatar = nextConversationAvatar;
          changed = true;
        }
      }

      if (hasOwnerInput) {
        const currentOwner = conv.owner ?? conv.Owner ?? null;
        if ((currentOwner || null) !== nextOwner) {
          conv.owner = nextOwner;
          conv.Owner = nextOwner;
          changed = true;
        }
      }
    });

    if (changed || options.forceRender) {
      this.renderConversations(this.conversations, false);
    }
    return changed;
  },

  removeConversation(conversationId) {
    const target = (conversationId || "").toLowerCase();
    if (!target) return false;

    const originalLength = this.conversations.length;
    this.conversations = this.conversations.filter(
      (c) => (c.conversationId || "").toLowerCase() !== target,
    );
    const changed = this.conversations.length !== originalLength;

    if (!changed) return false;
    this.renderConversations(this.conversations, false);
    return true;
  },

  applyNicknameUpdate(conversationId, accountId, nickname) {
    const convTarget = (conversationId || "").toLowerCase();
    const accTarget = (accountId || "").toLowerCase();
    if (!convTarget || !accTarget) return false;

    const normalizeNickname = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.normalizeNickname === "function"
      ) {
        return window.ChatCommon.normalizeNickname(value);
      }
      if (typeof value !== "string") return value ?? null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };
    const normalizedNickname = normalizeNickname(nickname);

    let changed = false;
    this.conversations.forEach((conv) => {
      if ((conv.conversationId || "").toLowerCase() !== convTarget) return;

      const fallbackDisplayName = () => {
        if (
          conv.otherMember &&
          (conv.otherMember.accountId || "").toLowerCase() === accTarget
        ) {
          return (
            conv.otherMember.username ||
            conv.otherMember.Username ||
            conv.otherMember.fullName ||
            conv.otherMember.FullName ||
            this.t("common.labels.user", "User")
          );
        }
        return this.t("common.labels.user", "User");
      };

      if (
        conv.otherMember &&
        (conv.otherMember.accountId || "").toLowerCase() === accTarget
      ) {
        conv.otherMember.nickname = normalizedNickname;
        changed = true;
      }

      const sender = conv.lastMessage?.sender;
      if (sender && (sender.accountId || "").toLowerCase() === accTarget) {
        sender.nickname = normalizedNickname;
        changed = true;
      }

      if (Array.isArray(conv.lastMessageSeenBy)) {
        conv.lastMessageSeenBy.forEach((seen) => {
          if ((seen.accountId || "").toLowerCase() !== accTarget) return;
          seen.displayName = normalizedNickname || fallbackDisplayName();
          changed = true;
        });
      }
    });

    if (changed) {
      this.renderConversations(this.conversations, false);
    }
    return changed;
  },

  renderConversationLastMessage(conv) {
    if (!conv) return false;
    const item = document.querySelector(
      `.chat-item[data-conversation-id="${conv.conversationId}"]`,
    );
    if (!item) return true;

    const previewData = this.buildLastMessagePreviewDisplay(conv);

    const preview = item.querySelector(".chat-last-msg");
    if (preview) {
      preview.innerHTML = this.buildLastMessagePreviewHtml(previewData);
    }

    const msgRow = item.querySelector(".chat-msg-row");
    if (!msgRow) return true;

    msgRow
      .querySelectorAll(".chat-msg-dot, .chat-meta")
      .forEach((el) => el.remove());
    const sentAt =
      conv.lastMessageSentAt ||
      conv.lastMessage?.sentAt ||
      conv.lastMessage?.SentAt ||
      null;
    if (sentAt) {
      const dot = document.createElement("span");
      dot.className = "chat-msg-dot";
      dot.textContent = "·";
      const time = document.createElement("span");
      time.className = "chat-meta";
      time.textContent = this.formatRelativeTime(sentAt, true);
      msgRow.appendChild(dot);
      msgRow.appendChild(time);
    }

    return true;
  },

  getMessageIdentity(message) {
    if (!message || typeof message !== "object") return "";
    return (
      message.messageId ||
      message.MessageId ||
      message.id ||
      message.Id ||
      message.tempId ||
      message.TempId ||
      ""
    )
      .toString()
      .toLowerCase();
  },

  applyMessageHidden(conversationId, messageId, replacementMessage = null) {
    const convTarget = (conversationId || "").toLowerCase();
    const msgTarget = (messageId || "").toString().toLowerCase();
    if (!convTarget || !msgTarget) return false;

    const conv = this.conversations.find(
      (c) => (c.conversationId || "").toLowerCase() === convTarget,
    );
    if (!conv) return false;

    const lastMessageId = this.getMessageIdentity(conv.lastMessage);
    if (conv.lastMessage && lastMessageId && lastMessageId !== msgTarget)
      return false;

    if (replacementMessage) {
      conv.lastMessage = replacementMessage;
      conv.lastMessageSentAt =
        replacementMessage.sentAt || replacementMessage.SentAt || null;
      conv.lastMessagePreview = null;
    } else {
      conv.lastMessage = null;
      conv.lastMessageSentAt = null;
      conv.lastMessagePreview = conv.isGroup
        ? this.t("chat.sidebar.preview.groupCreated", "Group created.")
        : this.t(
            "chat.sidebar.preview.startedConversation",
            "Conversation started.",
          );
    }

    conv.lastMessageSeenBy = [];
    conv.lastMessageSeenCount = 0;
    const rendered = this.renderConversationLastMessage(conv);
    const item = document.querySelector(
      `.chat-item[data-conversation-id="${conv.conversationId}"]`,
    );
    item?.querySelector(".chat-item-end .chat-seen-avatars")?.remove();
    return rendered;
  },

  applyMessageRecalled(conversationId, messageId) {
    const convTarget = (conversationId || "").toLowerCase();
    const msgTarget = (messageId || "").toString().toLowerCase();
    if (!convTarget || !msgTarget) return false;

    const conv = this.conversations.find(
      (c) => (c.conversationId || "").toLowerCase() === convTarget,
    );
    if (!conv || !conv.lastMessage) return false;

    const lastMessageId = this.getMessageIdentity(conv.lastMessage);
    if (lastMessageId && lastMessageId !== msgTarget) return false;

    conv.lastMessage.isRecalled = true;
    conv.lastMessage.IsRecalled = true;
    conv.lastMessage.content = null;
    conv.lastMessage.Content = null;
    conv.lastMessagePreview = this.t(
      "chat.sidebar.preview.recalledMessage",
      "Message was recalled",
    );
    return this.renderConversationLastMessage(conv);
  },

  /**
   * Increment unread badge for a specific conversation.
   * Updates preview text, time, moves item to top. Like Facebook/Instagram.
   */
  incrementUnread(conversationId, message, skipBadgeIncrement = false) {
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const senderId = (
      message?.sender?.accountId ||
      message?.Sender?.AccountId ||
      ""
    ).toLowerCase();
    const isMe = senderId === myId;

    // Update in-memory data
    const conv = this.conversations.find(
      (c) => c.conversationId === conversationId,
    );
    if (conv) {
      if (!isMe && !skipBadgeIncrement) {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
      }
      if (message) {
        const maskedMessage = message;
        conv.lastMessage = maskedMessage;
        conv.lastMessageSentAt =
          maskedMessage.sentAt ||
          maskedMessage.SentAt ||
          new Date().toISOString();
        const previewMeta =
          window.ChatCommon &&
          typeof ChatCommon.getLastMsgPreviewMeta === "function"
            ? ChatCommon.getLastMsgPreviewMeta(conv, { message: maskedMessage })
            : null;
        conv.lastMessagePreview = previewMeta?.text || null;
        // Reset seen-by since it's a new message
        conv.lastMessageSeenBy = [];
        conv.lastMessageSeenCount = 0;
      }
    }

    const listContainer = document.getElementById("chat-conversation-list");
    if (!listContainer) return;

    // Find existing DOM item
    let item = document.querySelector(
      `.chat-item[data-conversation-id="${conversationId}"]`,
    );

    if (item) {
      // Update unread styling
      if (!isMe && !skipBadgeIncrement) {
        item.classList.add("unread");
      }

      // Update or create badge
      let badge = item.querySelector(".chat-unread-badge");
      const newCount = conv ? conv.unreadCount : 0;
      if (newCount > 0) {
        if (badge) {
          badge.textContent = newCount > 99 ? "99+" : newCount;
        } else {
          badge = document.createElement("div");
          badge.className = "chat-unread-badge";
          badge.textContent = newCount > 99 ? "99+" : newCount;
          item.appendChild(badge);
        }
      } else if (badge && !isMe) {
        // If count is zero but badge exists, remove it (sender is not me, so it was unread)
        badge.remove();
        item.classList.remove("unread");
      }

      // Update preview text
      if (message) {
        const previewData = this.buildLastMessagePreviewDisplay(
          conv || {},
          conv?.lastMessage || message,
        );
        const preview = item.querySelector(".chat-last-msg");
        if (preview) {
          preview.innerHTML = this.buildLastMessagePreviewHtml(previewData);
        }

        // Clear any seen avatars when new message arrives
        const endArea = item.querySelector(".chat-item-end");
        const existingSeen = endArea?.querySelector(".chat-seen-avatars");
        if (existingSeen) existingSeen.remove();

        // Update time
        const timeMeta = item.querySelector(".chat-meta");
        if (timeMeta) {
          timeMeta.textContent = this.t("common.time.now", "now");
        } else {
          const msgRow = item.querySelector(".chat-msg-row");
          if (msgRow) {
            const dot = document.createElement("span");
            dot.className = "chat-msg-dot";
            dot.textContent = "·";
            const time = document.createElement("span");
            time.className = "chat-meta";
            time.textContent = this.t("common.time.now", "now");
            msgRow.appendChild(dot);
            msgRow.appendChild(time);
          }
        }
      }

      // Move to top of list
      listContainer.prepend(item);
      this.updateActiveItemIndicator();
    }
    // If item not in DOM (e.g. new conversation), do a reload IF it matches filter
    else {
      // Simple logic: if searching, don't auto-add.
      if (this.searchTerm) return;

      // If filtering by type, we should ideally check if the message matches the filter
      // For simplicity, we just reload effectively.
      this.cursorLastMessageSentAt = null;
      this.cursorConversationId = null;
      this.hasMore = true;
      this.loadConversations(false);
    }
  },

  /**
   * Update the active ID using data-conversation-id attribute.
   */
  updateActiveId(id) {
    this.currentActiveId = this.normalizeId(id || "");

    const items = document.querySelectorAll(".chat-item");
    if (items.length === 0) {
      this.updateActiveItemIndicator();
      return;
    }

    const isChatPage = this.isChatRouteFromHash();
    const routeConversationId = this.normalizeId(
      this.extractConversationIdFromHash(),
    );
    const targetId = this.normalizeId(
      routeConversationId || this.currentActiveId || "",
    );

    items.forEach((item) => {
      const convId = this.normalizeId(item.dataset.conversationId);
      const isTarget = isChatPage && targetId && convId === targetId;
      item.classList.toggle("active", !!isTarget);
    });

    this.updateActiveItemIndicator();
  },

  /**
   * Called by ChatWindow/ChatPage when a MemberSeen event is received.
   * Updates the seen indicator in the sidebar for the given conversation.
   */
  updateSeenInSidebar(conversationId, accountId) {
    const convIdNorm = (conversationId || "").toLowerCase();
    const accIdNorm = (accountId || "").toLowerCase();
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();

    if (accIdNorm === myId) {
      return;
    }

    const conv = this.conversations.find(
      (c) => (c.conversationId || "").toLowerCase() === convIdNorm,
    );
    if (!conv) {
      return;
    }

    // Only update if the last message was sent by us
    const lastMsgSenderId = (
      conv.lastMessage?.sender?.accountId ||
      conv.lastMessage?.sender?.AccountId ||
      conv.lastMessage?.Sender?.AccountId ||
      conv.lastMessage?.Sender?.accountId ||
      ""
    ).toLowerCase();
    if (lastMsgSenderId !== myId) {
      return;
    }

    // Initialize array if needed
    if (!Array.isArray(conv.lastMessageSeenBy)) conv.lastMessageSeenBy = [];
    this.normalizeSeenMembers(conv);

    const alreadySeenIndex = conv.lastMessageSeenBy.findIndex(
      (m) => this.normalizeId(m.accountId || m.AccountId) === accIdNorm,
    );
    const resolvedMemberInfo = this.resolveSeenMemberInfo(conv, accIdNorm);

    if (alreadySeenIndex >= 0) {
      if (resolvedMemberInfo) {
        conv.lastMessageSeenBy[alreadySeenIndex] = {
          ...conv.lastMessageSeenBy[alreadySeenIndex],
          ...resolvedMemberInfo,
        };
      }
    } else {
      const memberInfo = resolvedMemberInfo || {
        accountId: accIdNorm || accountId,
        avatarUrl: APP_CONFIG.DEFAULT_AVATAR,
        displayName: this.t("common.labels.user", "User"),
      };
      conv.lastMessageSeenBy.push(memberInfo);

      const currentSeenCount = Number(conv.lastMessageSeenCount || 0);
      conv.lastMessageSeenCount = Math.max(
        (Number.isFinite(currentSeenCount) ? currentSeenCount : 0) + 1,
        conv.lastMessageSeenBy.length,
      );
    }

    // Update DOM
    const item = document.querySelector(
      `.chat-item[data-conversation-id="${conv.conversationId}"]`,
    );
    if (!item) {
      return;
    }

    const endArea = item.querySelector(".chat-item-end");
    if (!endArea) {
      return;
    }

    const unread = conv.unreadCount > 0 || item.classList.contains("unread");
    if (unread) {
      return;
    }

    this.normalizeSeenMembers(conv);
    const seenCount =
      conv.lastMessageSeenCount || conv.lastMessageSeenBy.length;
    const extraCount = Math.max(0, seenCount - conv.lastMessageSeenBy.length);

    endArea.innerHTML = `
            <div class="chat-seen-avatars">
                ${conv.lastMessageSeenBy
                  .map(
                    (m) => `
                    <img src="${m.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}" 
                         title="${this.t("chat.message.seen_by", "Seen by {name}", { name: m.displayName })}" 
                         class="chat-mini-seen-avatar">
                `,
                  )
                  .join("")}
                ${extraCount > 0 ? `<span class="chat-seen-more">+${extraCount}</span>` : ""}
            </div>
        `;
  },
};

document.addEventListener("DOMContentLoaded", () => ChatSidebar.init());

window.toggleChatSidebar = () => ChatSidebar.toggle();
window.closeChatSidebar = (force = false) => ChatSidebar.close(force);
window.ChatSidebar = ChatSidebar;

// For backward compatibility during migration
window.toggleChatPanel = window.toggleChatSidebar;
window.closeChatPanel = window.closeChatSidebar;
