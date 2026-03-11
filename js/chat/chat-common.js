/**
 * Chat Common Utilities
 * Reusable functions for chat components (Sidebar, Windows, Full Page)
 */
const ChatCommon = {
  /**
   * Helper to get avatar URL with fallback
   */
  getAvatar(conv) {
    const explicitAvatarRaw = conv?.displayAvatar || conv?.DisplayAvatar || "";
    const explicitAvatar = (explicitAvatarRaw || "").toString().trim();
    const isGroup = !!(conv?.isGroup ?? conv?.IsGroup);

    if (!isGroup) {
      return explicitAvatar || APP_CONFIG.DEFAULT_AVATAR;
    }

    if (explicitAvatar && !this.isDefaultGroupAvatar(explicitAvatar)) {
      return explicitAvatar;
    }

    // Return a marker for default group icons
    return "ICON:users";
  },

  resolveStoryRingClass(storyRingState) {
    const normalizedState = (storyRingState ?? "")
      .toString()
      .trim()
      .toLowerCase();

    if (
      storyRingState === 2 ||
      normalizedState === "2" ||
      normalizedState === "unseen" ||
      normalizedState === "story-ring-unseen"
    ) {
      return "story-ring-unseen";
    }

    if (
      storyRingState === 1 ||
      normalizedState === "1" ||
      normalizedState === "seen" ||
      normalizedState === "story-ring-seen"
    ) {
      return "story-ring-seen";
    }

    return "";
  },

  getConversationStoryRingState(conv = {}) {
    if (!conv || typeof conv !== "object") return null;

    const otherMember = conv.otherMember || conv.OtherMember || null;
    if (otherMember && typeof otherMember === "object") {
      const memberState =
        otherMember.storyRingState ?? otherMember.StoryRingState ?? null;
      if (memberState !== null && memberState !== undefined) return memberState;
    }

    return conv.storyRingState ?? conv.StoryRingState ?? null;
  },

  getStoryAccentCssMap() {
    if (!window.getComputedStyle || !document?.documentElement) return null;

    const themeKey = document.body?.classList.contains("light-mode")
      ? "light"
      : "dark";
    if (
      this._storyAccentCssCache &&
      this._storyAccentCssCache.themeKey === themeKey
    ) {
      return this._storyAccentCssCache.map;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);
    if (!rootStyles) return null;

    const accentMap = {
      "--accent-primary": (
        rootStyles.getPropertyValue("--accent-primary") || ""
      ).trim(),
      "--accent-hover": (
        rootStyles.getPropertyValue("--accent-hover") || ""
      ).trim(),
      "--accent-active": (
        rootStyles.getPropertyValue("--accent-active") || ""
      ).trim(),
    };

    this._storyAccentCssCache = {
      themeKey,
      map: accentMap,
    };

    return accentMap;
  },

  resolveStoryTextBackgroundCss(cssValue) {
    if (typeof cssValue !== "string" || !cssValue.includes("var(--accent-")) {
      return cssValue;
    }

    const accentMap = this.getStoryAccentCssMap();
    if (!accentMap) return cssValue;

    return cssValue.replace(
      /var\(\s*(--accent-(?:primary|hover|active))\s*(?:,\s*([^)]+))?\)/gi,
      (match, variableName, fallbackValue) => {
        const key = String(variableName || "")
          .trim()
          .toLowerCase();
        const resolved = accentMap[key];
        if (resolved) return resolved;

        const fallback =
          typeof fallbackValue === "string" ? fallbackValue.trim() : "";
        return fallback || match;
      },
    );
  },

  /**
   * Helper to render avatar HTML (supports both img and Lucide icons)
   */
  renderAvatar(conv, options = {}) {
    const avatar = this.getAvatar(conv);
    const name = options.name || this.getDisplayName(conv);
    const className = options.className || "chat-avatar";
    const onError =
      options.onError || `this.src='${APP_CONFIG.DEFAULT_AVATAR}'`;
    const skipTitle = !!options.skipTitle;
    const titleAttr = skipTitle ? "" : ` title="${escapeHtml(name)}"`;

    if (avatar === "ICON:users") {
      // Handle array of avatars fallback (from GroupAvatars)
      const groupAvatars = conv?.groupAvatars || conv?.GroupAvatars || [];
      // Remove sparse-array holes to keep count/layout in sync, but keep explicit null/empty
      // entries so they can fallback to default avatar.
      const normalizedGroupAvatars = Array.isArray(groupAvatars)
        ? groupAvatars.filter((_, index) => index in groupAvatars)
        : [];
      const membersToShow = normalizedGroupAvatars.slice(0, 4);

      if (membersToShow.length > 0) {
        // Build composite avatar UI for members
        const memberAvatarAlt = this.escapeAttribute(
          this.t("chat.avatar.member_alt", "Member avatar"),
        );
        let compositeHtml = `<div class="${className} composite-group-avatar count-${membersToShow.length}"${titleAttr}>`;

        membersToShow.forEach((url, i) => {
          const fallbackAvatar = APP_CONFIG.DEFAULT_AVATAR;
          const safeUrl =
            url && typeof url === "string" && url.trim().length > 0
              ? escapeHtml(url)
              : fallbackAvatar;
          compositeHtml += `<img src="${safeUrl}" alt="${memberAvatarAlt}" class="composite-avatar-part item-${i}" onerror="this.src='${fallbackAvatar}';">`;
        });

        compositeHtml += `</div>`;
        return compositeHtml;
      }

      return `<div class="${className} default-group-avatar"${titleAttr}><i data-lucide="users"></i></div>`;
    }

    const shouldEnableStoryRing = !!options.enableStoryRing;
    const storyRingClass = shouldEnableStoryRing
      ? this.resolveStoryRingClass(
          options.storyRingState ?? this.getConversationStoryRingState(conv),
        )
      : "";
    const storyRingExtraClass = options.storyRingClass
      ? ` ${options.storyRingClass}`
      : "";
    const storyRingStyleAttr = options.storyRingStyle
      ? ` style="${options.storyRingStyle}"`
      : "";

    if (storyRingClass) {
      const otherMember = conv?.otherMember || conv?.OtherMember || null;
      const storyAuthorId =
        otherMember?.accountId || otherMember?.AccountId || "";
      const storyAuthorAttr = storyAuthorId
        ? ` data-story-author-id="${escapeHtml(storyAuthorId)}"`
        : "";
      return `<span class="post-avatar-ring ${storyRingClass}${storyRingExtraClass}"${storyRingStyleAttr}${storyAuthorAttr}><img src="${avatar}" alt="${escapeHtml(name)}"${titleAttr} class="${className} post-avatar" onerror="${onError}"></span>`;
    }

    return `<img src="${avatar}" alt="${escapeHtml(name)}"${titleAttr} class="${className}" onerror="${onError}">`;
  },

  isDefaultGroupAvatar(value) {
    const raw = (value || "").toString().trim();
    if (!raw) return true;

    const normalized = raw.toLowerCase();
    if (
      normalized === "null" ||
      normalized === "undefined" ||
      normalized === "icon:users"
    )
      return true;
    const defaultAvatar = (APP_CONFIG.DEFAULT_AVATAR || "").toLowerCase();
    if (defaultAvatar && normalized === defaultAvatar) return true;

    const defaultMarkers = [
      "data:image/svg+xml",
      "default-group-avatar",
      "group-avatar-default",
      "group-default-avatar",
      "group_default_avatar",
      "default-group",
      "group-default",
      "chat-group-default",
      "default_chat_group",
      "defaultchatgroup",
      "default-avatar.jpg",
      "default-avatar.png",
      "/users.svg",
      "/user-group.svg",
      "lucide/users",
      "ICON:users",
    ];
    return defaultMarkers.some((marker) => normalized.includes(marker));
  },

  getDefaultGroupAvatar() {
    return "ICON:users";
  },

  _languageChangeEventNames: [
    "app-language-changed",
    "app:language-changed",
    "i18n:language-changed",
    "languagechange",
  ],

  getI18n() {
    const i18n = window.I18n;
    return i18n && typeof i18n === "object" ? i18n : null;
  },

  getCurrentLanguage() {
    const i18n = this.getI18n();
    if (i18n && typeof i18n.getLanguage === "function") {
      try {
        const language = i18n.getLanguage();
        if (typeof language === "string" && language.trim().length > 0) {
          return language.trim().toLowerCase();
        }
      } catch (_err) {
        // ignore i18n runtime errors and fall back below
      }
    }

    const storedLanguage = localStorage.getItem("appLanguage");
    if (
      typeof storedLanguage === "string" &&
      storedLanguage.trim().length > 0
    ) {
      return storedLanguage.trim().toLowerCase();
    }

    const browserLanguage =
      navigator.language ||
      navigator.userLanguage ||
      navigator.languages?.[0] ||
      "en";
    return /^vi/i.test(browserLanguage) ? "vi" : "en";
  },

  interpolateText(template, params = {}) {
    const source =
      template === null || template === undefined ? "" : String(template);
    return source.replace(/\{(\w+)\}/g, (_match, key) => {
      const raw = params?.[key];
      return raw === null || raw === undefined ? "" : String(raw);
    });
  },

  t(key, fallback = "", params = {}) {
    const i18n = this.getI18n();
    if (i18n && typeof i18n.t === "function") {
      try {
        const translated = i18n.t(key, params);
        if (
          typeof translated === "string" &&
          translated.trim().length > 0 &&
          translated !== key
        ) {
          return translated;
        }
      } catch (_err) {
        // fall back to the provided English copy
      }
    }

    return this.interpolateText(fallback || key, params);
  },

  translateServerText(value) {
    const raw = (value || "").toString().trim();
    if (!raw) return "";

    const i18n = this.getI18n();
    if (i18n && typeof i18n.translateLiteral === "function") {
      const translatedLiteral = i18n.translateLiteral(raw);
      if (translatedLiteral && translatedLiteral !== raw) {
        return translatedLiteral;
      }
    }

    return raw;
  },

  translateDom(root = document) {
    const i18n = this.getI18n();
    if (!i18n || typeof i18n.translateDom !== "function") return;

    try {
      i18n.translateDom(root);
    } catch (_err) {
      // ignore translation refresh failures in chat helpers
    }
  },

  onLanguageChange(callback, options = {}) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const handlers = this._languageChangeEventNames.map((eventName) => {
      const handler = (event) => callback(event);
      window.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    if (options.invokeImmediately) {
      callback();
    }

    return () => {
      handlers.forEach(({ eventName, handler }) => {
        window.removeEventListener(eventName, handler);
      });
    };
  },

  escapeAttribute(value) {
    const raw = value === null || value === undefined ? "" : String(value);
    if (typeof escapeHtml === "function") {
      return escapeHtml(raw).replace(/`/g, "&#96;");
    }

    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/`/g, "&#96;");
  },

  getUnknownUserLabel() {
    return this.t("chat.common.user", "User");
  },

  getUnknownUsernameLabel() {
    return this.t("chat.common.username_unknown", "unknown");
  },

  getChatFallbackLabel() {
    return this.t("chat.common.chat", "Chat");
  },

  getGroupChatFallbackLabel() {
    return this.t("chat.common.group_chat", "Group chat");
  },

  getYouLabel() {
    return this.t("chat.common.you", "You");
  },

  formatCount(value) {
    try {
      return new Intl.NumberFormat(this.getCurrentLanguage()).format(
        Number(value) || 0,
      );
    } catch (_err) {
      return String(Number(value) || 0);
    }
  },

  getUiErrorsHelper() {
    return (
      window.UIErrors ||
      window.UiErrors ||
      window.uiErrors ||
      window.UIErrorMapper ||
      null
    );
  },

  async readFriendlyApiError(response, options = {}) {
    const {
      feature = "chat",
      action = "generic",
      fallbackKey = "errors.chat.generic",
      fallbackMessage = "Something went wrong. Please try again.",
      context = {},
    } = options;

    if (!response) {
      return this.t(fallbackKey, fallbackMessage, context);
    }

    const status = Number(response.status || 0);
    let rawServerMessage = "";
    let validationErrors = null;

    const parseSource =
      typeof response.clone === "function" ? response.clone() : null;
    const jsonSource = parseSource || response;

    try {
      const data = await jsonSource.json();
      const messageCandidate =
        data?.message || data?.Message || data?.title || data?.Title || "";
      rawServerMessage =
        typeof messageCandidate === "string" ? messageCandidate.trim() : "";
      validationErrors =
        data?.errors && typeof data.errors === "object" ? data.errors : null;
    } catch (_err) {
      // ignore malformed or empty error payloads
    }

    if (!rawServerMessage && parseSource) {
      try {
        const text = await response.text();
        rawServerMessage = typeof text === "string" ? text.trim() : "";
      } catch (_err) {
        // ignore plain-text parsing issues
      }
    }

    const uiErrors = this.getUiErrorsHelper();
    if (uiErrors) {
      const resolverCandidates = [
        () =>
          typeof uiErrors.resolve === "function"
            ? uiErrors.resolve({
                feature,
                action,
                status,
                rawServerMessage,
                validationErrors,
                context,
              })
            : null,
        () =>
          typeof uiErrors.getMessage === "function"
            ? uiErrors.getMessage({
                feature,
                action,
                status,
                rawServerMessage,
                validationErrors,
                context,
              })
            : null,
        () =>
          typeof uiErrors.map === "function"
            ? uiErrors.map({
                feature,
                action,
                status,
                rawServerMessage,
                validationErrors,
                context,
              })
            : null,
      ];

      for (const resolveMessage of resolverCandidates) {
        try {
          const resolved = resolveMessage();
          if (
            typeof resolved === "string" &&
            resolved.trim().length > 0 &&
            resolved !== rawServerMessage
          ) {
            return resolved.trim();
          }

          if (
            resolved &&
            typeof resolved === "object" &&
            typeof resolved.message === "string" &&
            resolved.message.trim().length > 0 &&
            resolved.message !== rawServerMessage
          ) {
            return resolved.message.trim();
          }

          if (
            resolved &&
            typeof resolved === "object" &&
            typeof resolved.key === "string" &&
            resolved.key.trim().length > 0
          ) {
            return this.t(resolved.key, fallbackMessage, context);
          }
        } catch (_err) {
          // ignore UI error mapper failures and fall back safely
        }
      }
    }

    if (status === 413) {
      return this.t(
        "errors.chat.payload_too_large",
        "The selected attachment is too large.",
      );
    }

    if (status === 401 || status === 403) {
      return this.t(
        "errors.chat.permission_denied",
        "You do not have permission to do that.",
      );
    }

    if (status >= 500) {
      return this.t(
        "errors.chat.server_busy",
        "The server is busy right now. Please try again.",
      );
    }

    return this.t(fallbackKey, fallbackMessage, context);
  },

  formatRelativeTime(dateVal, short = false) {
    if (!dateVal) return "";

    const i18n = this.getI18n();
    const normalizedShort = !!short;
    const candidates = [
      () =>
        typeof i18n?.formatRelativeTime === "function"
          ? i18n.formatRelativeTime(dateVal, { short: normalizedShort })
          : null,
      () =>
        typeof i18n?.formatTimeAgo === "function"
          ? i18n.formatTimeAgo(dateVal, { short: normalizedShort })
          : null,
      () =>
        typeof i18n?.timeAgo === "function"
          ? i18n.timeAgo(dateVal, normalizedShort)
          : null,
    ];

    for (const resolveValue of candidates) {
      try {
        const resolved = resolveValue();
        if (typeof resolved === "string" && resolved.trim().length > 0) {
          return resolved.trim();
        }
      } catch (_err) {
        // ignore i18n formatter failures and fall back below
      }
    }

    if (window.PostUtils && typeof window.PostUtils.timeAgo === "function") {
      return window.PostUtils.timeAgo(dateVal, normalizedShort);
    }

    const date = new Date(dateVal);
    if (Number.isNaN(date.getTime())) return "";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) {
      return this.t("common.time.now", "now");
    }
    if (diffMinutes < 60) {
      return normalizedShort
        ? this.t("common.time.minutes_short", "{count}m", {
            count: diffMinutes,
          })
        : this.t("common.time.minutes_ago", "{count} minutes ago", {
            count: this.formatCount(diffMinutes),
          });
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return normalizedShort
        ? this.t("common.time.hours_short", "{count}h", {
            count: diffHours,
          })
        : this.t("common.time.hours_ago", "{count} hours ago", {
            count: this.formatCount(diffHours),
          });
    }

    const diffDays = Math.floor(diffHours / 24);
    return normalizedShort
      ? this.t("common.time.days_short", "{count}d", { count: diffDays })
      : this.t("common.time.days_ago", "{count} days ago", {
          count: this.formatCount(diffDays),
        });
  },

  normalizeEntityId(value) {
    return (value || "").toString().trim().toLowerCase();
  },

  getEntityUsername(entity = {}) {
    if (!entity || typeof entity !== "object") return "";
    const usernameRaw =
      entity.username ??
      entity.userName ??
      entity.Username ??
      entity.UserName ??
      "";
    if (typeof usernameRaw !== "string") return "";
    const username = usernameRaw.trim();
    return username.length > 0 ? username : "";
  },

  getEntityAccountId(entity = {}) {
    if (!entity || typeof entity !== "object") return "";
    return this.normalizeEntityId(
      entity.accountId ??
        entity.AccountId ??
        entity.senderId ??
        entity.SenderId ??
        "",
    );
  },

  findMemberInConversationByAccountId(conversation, accountId) {
    if (!conversation || typeof conversation !== "object") return null;
    const targetId = this.normalizeEntityId(accountId);
    if (!targetId) return null;

    const candidates = [];
    const addCandidate = (member, sourceWeight = 0) => {
      if (!member || typeof member !== "object") return;
      const memberId = this.getEntityAccountId(member);
      if (!memberId || memberId !== targetId) return;
      candidates.push({ member, sourceWeight });
    };
    const addMany = (members, sourceWeight = 0) => {
      if (!Array.isArray(members)) return;
      members.forEach((member) => addCandidate(member, sourceWeight));
    };

    addCandidate(conversation.otherMember, 5);
    addMany(conversation.members, 4);
    addMany(conversation.memberSeenStatuses, 3);
    addMany(conversation.lastMessageSeenBy, 2);
    addCandidate(
      conversation.lastMessage?.sender || conversation.lastMessage?.Sender,
      2,
    );

    if (!candidates.length) return null;

    let bestCandidate = null;
    let bestScore = -1;
    candidates.forEach(({ member, sourceWeight }) => {
      const nickname = this.normalizeNickname(
        member.nickname ?? member.Nickname ?? null,
      );
      const username = this.getEntityUsername(member);
      const avatarUrl =
        member.avatarUrl || member.AvatarUrl || member.avatar || "";

      let score = sourceWeight;
      if (nickname) score += 10;
      if (username) score += 4;
      if (avatarUrl && avatarUrl !== APP_CONFIG.DEFAULT_AVATAR) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = member;
      }
    });

    return bestCandidate;
  },

  getOpenChatMetaByConversationId(conversationId) {
    const targetConversationId = this.normalizeEntityId(conversationId);
    if (!targetConversationId) return null;

    const openChats = window.ChatWindow?.openChats;
    if (!openChats || typeof openChats.entries !== "function") return null;

    for (const [openId, chat] of openChats.entries()) {
      if (this.normalizeEntityId(openId) !== targetConversationId) continue;
      return chat?.data || chat?.metaData || null;
    }

    return null;
  },

  resolveSenderReference(senderAccountId, options = {}) {
    const senderId = this.normalizeEntityId(senderAccountId);
    if (!senderId) return null;

    const conversationId = this.normalizeEntityId(
      options.conversationId ||
        options.conversation?.conversationId ||
        options.conversation?.ConversationId ||
        "",
    );

    const contexts = [];
    const addContext = (context, priority) => {
      if (!context || typeof context !== "object") return;
      contexts.push({ context, priority });
    };

    addContext(options.conversation, 4);

    const pageMeta = window.ChatPage?.currentMetaData || null;
    if (
      pageMeta &&
      (!conversationId ||
        this.normalizeEntityId(
          pageMeta.conversationId || pageMeta.ConversationId,
        ) === conversationId)
    ) {
      addContext(pageMeta, 3);
    }

    const openChatMeta = this.getOpenChatMetaByConversationId(conversationId);
    if (openChatMeta) {
      addContext(openChatMeta, 2);
    }

    if (!contexts.length) return null;

    let bestRef = null;
    let bestScore = -1;
    contexts.forEach(({ context, priority }) => {
      const candidate = this.findMemberInConversationByAccountId(
        context,
        senderId,
      );
      if (!candidate) return;

      const nickname = this.normalizeNickname(
        candidate.nickname ?? candidate.Nickname ?? null,
      );
      const username = this.getEntityUsername(candidate);

      let score = priority;
      if (nickname) score += 10;
      if (username) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestRef = candidate;
      }
    });

    return bestRef;
  },

  getPreferredSenderName(sender = {}, options = {}) {
    const resolvedOptions =
      typeof options === "string" ? { fallback: options } : options || {};
    const fallback = resolvedOptions.fallback || "";

    if (!sender || typeof sender !== "object") {
      return fallback;
    }

    const nickname = this.normalizeNickname(
      sender.nickname ?? sender.Nickname ?? null,
    );
    if (nickname) return nickname;

    const senderId = this.getEntityAccountId(sender);
    if (senderId) {
      const senderRef = this.resolveSenderReference(senderId, resolvedOptions);
      if (senderRef) {
        const refNickname = this.normalizeNickname(
          senderRef.nickname ?? senderRef.Nickname ?? null,
        );
        if (refNickname) return refNickname;

        const refUsername = this.getEntityUsername(senderRef);
        if (refUsername) return refUsername;
      }
    }

    const username = this.getEntityUsername(sender);
    if (username) return username;

    return fallback;
  },

  getDisplayName(conv) {
    if (!conv) return this.getChatFallbackLabel();
    if (conv.isGroup)
      return conv.displayName || this.getGroupChatFallbackLabel();

    // Defensive check: ensure we prioritize the OTHER member's info
    const other = conv.otherMember;
    if (other) {
      return (
        other.nickname ||
        other.username ||
        other.fullName ||
        this.getChatFallbackLabel()
      );
    }

    // Fallback for cases where otherMember might be temporarily missing from the object
    return conv.displayName || this.getChatFallbackLabel();
  },

  getConversationThemeOptions() {
    const raw = window.APP_CONFIG?.CHAT_THEME_OPTIONS;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [
        {
          key: "default",
          label: this.t("chat.theme.default", "Default"),
          preview: "linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)",
          dark: {
            accent: "#ff416c",
            accentHover: "#e43c60",
            accentActive: "#d7335a",
            surface: "#0a1317",
            surfaceAlt: "#121d24",
            border: "#25323a",
            ownBubbleBg: "#ff416c",
            ownBubbleText: "#ffffff",
            otherBubbleBg: "#1a252d",
            otherBubbleText: "#f3f6f9",
            systemText: "#9ca7b0",
            actionColor: "#b7c2cb",
            actionHover: "#ffffff",
            actionHoverBg: "rgba(255,255,255,0.08)",
            scrollbarThumb: "rgba(255,255,255,0.24)",
            scrollbarHover: "#ff416c",
            inputWrapperBg: "rgba(255,255,255,0.08)",
            inputBorder: "rgba(255,255,255,0.14)",
          },
          light: {
            accent: "#f72567",
            accentHover: "#de1e5b",
            accentActive: "#c7184f",
            surface:
              "linear-gradient(160deg, #ffe3ec 0%, #ffd0df 52%, #ffd7c9 100%)",
            surfaceAlt: "#ffc6da",
            border: "#f58eb0",
            ownBubbleBg: "#f72567",
            ownBubbleText: "#ffffff",
            otherBubbleBg: "#ffb9d2",
            otherBubbleText: "#3d1123",
            systemText: "#7d2848",
            actionColor: "#6f1e3f",
            actionHover: "#3f1024",
            actionHoverBg: "rgba(0,0,0,0.06)",
            scrollbarThumb: "rgba(116,26,60,0.42)",
            scrollbarHover: "#f72567",
            inputWrapperBg: "#ffc6da",
            inputBorder: "#f58eb0",
          },
        },
      ];
    }

    return raw
      .map((opt) => {
        const key = (opt?.key || "").toString().trim().toLowerCase();
        if (!key) return null;

        const label = (
          opt?.label ||
          opt?.name ||
          opt?.key ||
          this.t("chat.theme.label", "Theme")
        )
          .toString()
          .trim();
        const legacyAccent = (opt?.color || opt?.accent || "")
          .toString()
          .trim();
        const legacyHover = (opt?.hover || opt?.accentHover || "")
          .toString()
          .trim();
        const legacyActive = (opt?.active || opt?.accentActive || "")
          .toString()
          .trim();
        const legacySurface = (opt?.bg || opt?.surface || "").toString().trim();
        const darkRaw = opt?.dark || opt?.modes?.dark || null;
        const lightRaw = opt?.light || opt?.modes?.light || null;
        const preview = (opt?.preview || opt?.previewGradient || "")
          .toString()
          .trim();
        const aliasesRaw = Array.isArray(opt?.aliases)
          ? opt.aliases
          : typeof opt?.alias === "string"
            ? [opt.alias]
            : [];
        const aliases = aliasesRaw
          .map((a) => (a || "").toString().trim().toLowerCase())
          .filter(Boolean);

        const normalizeMode = (modeRaw) => {
          const mode = modeRaw || {};
          const accent = (mode?.accent || mode?.color || legacyAccent || "")
            .toString()
            .trim();
          const accentHover = (
            mode?.accentHover ||
            mode?.hover ||
            legacyHover ||
            ""
          )
            .toString()
            .trim();
          const accentActive = (
            mode?.accentActive ||
            mode?.active ||
            legacyActive ||
            ""
          )
            .toString()
            .trim();
          const surface = (mode?.surface || mode?.bg || legacySurface || "")
            .toString()
            .trim();
          const surfaceAlt = (
            mode?.surfaceAlt ||
            mode?.panel ||
            mode?.panelBg ||
            ""
          )
            .toString()
            .trim();
          const border = (mode?.border || mode?.borderColor || "")
            .toString()
            .trim();
          const ownBubbleBg = (
            mode?.ownBubbleBg ||
            mode?.bubbleOwn ||
            accent ||
            ""
          )
            .toString()
            .trim();
          const ownBubbleText = (
            mode?.ownBubbleText ||
            mode?.bubbleOwnText ||
            ""
          )
            .toString()
            .trim();
          const otherBubbleBg = (mode?.otherBubbleBg || mode?.bubbleOther || "")
            .toString()
            .trim();
          const otherBubbleText = (
            mode?.otherBubbleText ||
            mode?.bubbleOtherText ||
            ""
          )
            .toString()
            .trim();
          const systemText = (mode?.systemText || mode?.mutedText || "")
            .toString()
            .trim();
          const actionColor = (mode?.actionColor || mode?.buttonColor || "")
            .toString()
            .trim();
          const actionHover = (mode?.actionHover || mode?.buttonHover || "")
            .toString()
            .trim();
          const actionHoverBg = (
            mode?.actionHoverBg ||
            mode?.buttonHoverBg ||
            ""
          )
            .toString()
            .trim();
          const scrollbarThumb = (mode?.scrollbarThumb || mode?.scrollbar || "")
            .toString()
            .trim();
          const scrollbarHover = (
            mode?.scrollbarHover ||
            ownBubbleBg ||
            accent ||
            ""
          )
            .toString()
            .trim();
          const inputWrapperBg = (
            mode?.inputWrapperBg ||
            mode?.composerBg ||
            ""
          )
            .toString()
            .trim();
          const inputBorder = (mode?.inputBorder || mode?.composerBorder || "")
            .toString()
            .trim();

          return {
            accent,
            accentHover,
            accentActive,
            surface,
            surfaceAlt,
            border,
            ownBubbleBg,
            ownBubbleText,
            otherBubbleBg,
            otherBubbleText,
            systemText,
            actionColor,
            actionHover,
            actionHoverBg,
            scrollbarThumb,
            scrollbarHover,
            inputWrapperBg,
            inputBorder,
          };
        };

        const dark = normalizeMode(darkRaw);
        const light = normalizeMode(lightRaw);
        const hasPalette =
          !!dark.accent ||
          !!light.accent ||
          !!legacyAccent ||
          key === "default";
        if (!hasPalette) return null;

        return {
          key,
          label,
          aliases,
          preview,
          dark,
          light,
        };
      })
      .filter(Boolean);
  },

  normalizeConversationTheme(theme) {
    if (typeof theme !== "string") return null;
    const normalized = theme.trim().toLowerCase();
    if (!normalized.length || normalized === "default") return null;
    return normalized;
  },

  resolveConversationTheme(theme) {
    const normalized = this.normalizeConversationTheme(theme);
    if (!normalized) return null;

    const options = this.getConversationThemeOptions();
    const matched = options.find(
      (opt) =>
        opt.key === normalized ||
        (Array.isArray(opt.aliases) && opt.aliases.includes(normalized)),
    );
    return matched ? matched.key : null;
  },

  getConversationThemeByKey(theme) {
    const options = this.getConversationThemeOptions();
    const normalized = this.resolveConversationTheme(theme);
    if (!normalized) return null;
    return options.find((opt) => opt.key === normalized) || null;
  },

  getConversationThemeLabel(theme, options = {}) {
    const fallbackToDefault = !!options.fallbackToDefault;
    const normalized = this.normalizeConversationTheme(theme);
    if (!normalized) return this.t("chat.theme.default", "Default");

    const option = this.getConversationThemeByKey(normalized);
    if (option?.label) return option.label;
    if (fallbackToDefault) return this.t("chat.theme.default", "Default");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  },

  getCurrentAppThemeMode() {
    return document.body?.classList?.contains("light-mode") ? "light" : "dark";
  },

  getConversationThemePreview(option, mode = null) {
    if (!option) return "";
    const activeMode = mode || this.getCurrentAppThemeMode();
    const palette =
      option?.[activeMode] || option?.dark || option?.light || null;
    if (option.preview) return option.preview;
    if (palette?.accent) return palette.accent;
    return "";
  },

  _hexToRgbString(hexColor) {
    const raw = (hexColor || "").toString().trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : raw;
    const intVal = parseInt(normalized, 16);
    if (!Number.isFinite(intVal)) return null;
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return `${r}, ${g}, ${b}`;
  },

  _extractFirstGradientColorStop(gradientValue) {
    const raw = (gradientValue || "").toString().trim();
    if (!/^linear-gradient\(/i.test(raw)) return "";

    const start = raw.indexOf("(");
    if (start < 0 || !raw.endsWith(")")) return "";
    const inner = raw.slice(start + 1, -1).trim();
    if (!inner) return "";

    const parts = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (ch === "(") depth += 1;
      if (ch === ")" && depth > 0) depth -= 1;

      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    if (!parts.length) return "";

    const firstPart = parts[0] || "";
    const hasDirection = /^(to\s+.+|[-+]?\d*\.?\d+(deg|rad|turn|grad))$/i.test(
      firstPart,
    );
    const firstStop = hasDirection ? parts[1] || "" : firstPart;
    if (!firstStop) return "";

    let token = "";
    depth = 0;
    for (let i = 0; i < firstStop.length; i += 1) {
      const ch = firstStop[i];
      if (ch === "(") depth += 1;
      if (ch === ")" && depth > 0) depth -= 1;

      if (depth === 0 && /\s/.test(ch)) break;
      token += ch;
    }
    return token.trim();
  },

  _normalizeThemeColorValue(colorValue) {
    let raw = (colorValue || "").toString().trim();
    if (!raw) return "";
    const gradientColor = this._extractFirstGradientColorStop(raw);
    if (gradientColor) raw = gradientColor;
    return raw;
  },

  _toOpaqueThemeColor(colorValue) {
    let raw = this._normalizeThemeColorValue(colorValue);
    if (!raw) return "";

    const rgbaMatch = raw.match(
      /^rgba\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*[^)]+\)$/i,
    );
    if (rgbaMatch) {
      return `rgb(${rgbaMatch[1].trim()}, ${rgbaMatch[2].trim()}, ${rgbaMatch[3].trim()})`;
    }

    const hslaMatch = raw.match(
      /^hsla\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*[^)]+\)$/i,
    );
    if (hslaMatch) {
      return `hsl(${hslaMatch[1].trim()}, ${hslaMatch[2].trim()}, ${hslaMatch[3].trim()})`;
    }

    const hex = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`;
    if (/^[0-9a-fA-F]{4}$/.test(hex)) return `#${hex.slice(0, 3)}`;

    return raw;
  },

  _hslToRgb(h, s, l) {
    const hue = (((h % 360) + 360) % 360) / 360;
    const sat = Math.max(0, Math.min(1, s));
    const light = Math.max(0, Math.min(1, l));

    if (sat === 0) {
      const gray = Math.round(light * 255);
      return { r: gray, g: gray, b: gray };
    }

    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const toRgb = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };

    return {
      r: Math.round(toRgb(hue + 1 / 3) * 255),
      g: Math.round(toRgb(hue) * 255),
      b: Math.round(toRgb(hue - 1 / 3) * 255),
    };
  },

  _parseColorToRgb(colorValue) {
    const raw = (colorValue || "").toString().trim();
    if (!raw) return null;

    const hex = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }

    const rgbMatch =
      raw.match(
        /^rgb\(\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*\)$/i,
      ) ||
      raw.match(
        /^rgba\(\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([^)]+)\)$/i,
      );
    if (rgbMatch) {
      const r = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1]))));
      const g = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2]))));
      const b = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3]))));
      if ([r, g, b].every(Number.isFinite)) return { r, g, b };
    }

    const hslMatch =
      raw.match(
        /^hsl\(\s*([+\-.\d]+)(deg)?\s*,\s*([+\-.\d]+)%\s*,\s*([+\-.\d]+)%\s*\)$/i,
      ) ||
      raw.match(
        /^hsla\(\s*([+\-.\d]+)(deg)?\s*,\s*([+\-.\d]+)%\s*,\s*([+\-.\d]+)%\s*,\s*([^)]+)\)$/i,
      );
    if (hslMatch) {
      const h = Number(hslMatch[1]);
      const s = Number(hslMatch[3]) / 100;
      const l = Number(hslMatch[4]) / 100;
      if ([h, s, l].every(Number.isFinite)) {
        return this._hslToRgb(h, s, l);
      }
    }

    return null;
  },

  _normalizeAlphaChannel(alphaValue) {
    const alpha = Number(alphaValue);
    if (!Number.isFinite(alpha)) return 1;
    return Math.max(0, Math.min(1, alpha));
  },

  _parseColorToRgba(colorValue) {
    const raw = this._normalizeThemeColorValue(colorValue);
    if (!raw) return null;

    const hex = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const rgb = this._parseColorToRgb(`#${hex}`);
      if (!rgb) return null;
      return {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      const rgb = this._parseColorToRgb(`#${hex}`);
      if (!rgb) return null;
      return {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }

    const rgbaMatch = raw.match(
      /^rgba\(\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([^)]+)\)$/i,
    );
    if (rgbaMatch) {
      const r = Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[1]))));
      const g = Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[2]))));
      const b = Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[3]))));
      const a = this._normalizeAlphaChannel(rgbaMatch[4]);
      if ([r, g, b].every(Number.isFinite)) {
        return { r, g, b, a };
      }
      return null;
    }

    const hslaMatch = raw.match(
      /^hsla\(\s*([+\-.\d]+)(deg)?\s*,\s*([+\-.\d]+)%\s*,\s*([+\-.\d]+)%\s*,\s*([^)]+)\)$/i,
    );
    if (hslaMatch) {
      const h = Number(hslaMatch[1]);
      const s = Number(hslaMatch[3]) / 100;
      const l = Number(hslaMatch[4]) / 100;
      const a = this._normalizeAlphaChannel(hslaMatch[5]);
      if ([h, s, l].every(Number.isFinite)) {
        const rgb = this._hslToRgb(h, s, l);
        return { r: rgb.r, g: rgb.g, b: rgb.b, a };
      }
      return null;
    }

    const rgb = this._parseColorToRgb(raw);
    if (!rgb) return null;
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
  },

  _blendRgb(foreground, background, alpha) {
    const safeAlpha = this._normalizeAlphaChannel(alpha);
    if (!foreground || !background) return null;
    return {
      r: Math.max(
        0,
        Math.min(
          255,
          Math.round(foreground.r * safeAlpha + background.r * (1 - safeAlpha)),
        ),
      ),
      g: Math.max(
        0,
        Math.min(
          255,
          Math.round(foreground.g * safeAlpha + background.g * (1 - safeAlpha)),
        ),
      ),
      b: Math.max(
        0,
        Math.min(
          255,
          Math.round(foreground.b * safeAlpha + background.b * (1 - safeAlpha)),
        ),
      ),
    };
  },

  _isDarkRgb(rgb) {
    if (!rgb) return true;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 0.58;
  },

  _reverseGradientDirection(direction) {
    const rawDirection = (direction || "").toString().trim();
    if (!rawDirection.length) return "";

    const normalized = rawDirection.toLowerCase();
    if (normalized.startsWith("to ")) {
      const oppositeMap = {
        top: "bottom",
        bottom: "top",
        left: "right",
        right: "left",
      };

      const reversedParts = normalized
        .slice(3)
        .trim()
        .split(/\s+/)
        .map((part) => oppositeMap[part] || part);

      return `to ${reversedParts.join(" ")}`;
    }

    const angleMatch = normalized.match(
      /^([-+]?\d*\.?\d+)(deg|rad|turn|grad)$/i,
    );
    if (!angleMatch) {
      return rawDirection;
    }

    const angleValue = Number(angleMatch[1]);
    const angleUnit = angleMatch[2].toLowerCase();
    if (!Number.isFinite(angleValue)) {
      return rawDirection;
    }

    let reversedValue = angleValue;
    if (angleUnit === "deg") {
      reversedValue = (((angleValue + 180) % 360) + 360) % 360;
    } else if (angleUnit === "turn") {
      reversedValue = (((angleValue + 0.5) % 1) + 1) % 1;
    } else if (angleUnit === "rad") {
      const full = Math.PI * 2;
      reversedValue = (((angleValue + Math.PI) % full) + full) % full;
    } else if (angleUnit === "grad") {
      reversedValue = (((angleValue + 200) % 400) + 400) % 400;
    }

    const roundedValue = Math.round(reversedValue * 1000) / 1000;
    return `${roundedValue}${angleUnit}`;
  },

  _getReversedLinearGradient(gradientValue) {
    const rawGradient = (gradientValue || "").toString().trim();
    if (!rawGradient.length) return "";
    if (!/^linear-gradient\(/i.test(rawGradient)) return rawGradient;

    const startIndex = rawGradient.indexOf("(");
    if (startIndex < 0 || !rawGradient.endsWith(")")) return rawGradient;
    const inner = rawGradient.slice(startIndex + 1, -1).trim();
    if (!inner.length) return rawGradient;

    let commaIndex = -1;
    let depth = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (ch === "(") depth += 1;
      else if (ch === ")" && depth > 0) depth -= 1;
      else if (ch === "," && depth === 0) {
        commaIndex = i;
        break;
      }
    }

    if (commaIndex < 0) return rawGradient;

    const firstPart = inner.slice(0, commaIndex).trim();
    const restParts = inner.slice(commaIndex + 1).trim();
    if (!restParts.length) return rawGradient;

    const hasExplicitDirection =
      /^(to\s+.+|[-+]?\d*\.?\d+(deg|rad|turn|grad))$/i.test(firstPart);
    if (!hasExplicitDirection) {
      return `linear-gradient(to top, ${inner})`;
    }

    const reversedDirection = this._reverseGradientDirection(firstPart);
    if (!reversedDirection) return rawGradient;
    return `linear-gradient(${reversedDirection}, ${restParts})`;
  },

  _clearConversationThemeVars(targetElement) {
    if (!targetElement || !targetElement.style) return;
    [
      "--accent-primary",
      "--accent-hover",
      "--accent-active",
      "--accent-primary-rgb",
      "--chat-theme-bg",
      "--chat-theme-surface",
      "--chat-theme-footer-surface",
      "--chat-theme-surface-alt",
      "--chat-theme-tooltip-bg",
      "--chat-theme-tooltip-text",
      "--chat-theme-tooltip-border",
      "--chat-theme-border",
      "--chat-theme-own-bubble-bg",
      "--chat-theme-own-bubble-text",
      "--chat-theme-other-bubble-bg",
      "--chat-theme-other-bubble-text",
      "--chat-theme-system-text",
      "--chat-theme-action-color",
      "--chat-theme-action-hover",
      "--chat-theme-action-hover-bg",
      "--chat-theme-scrollbar-thumb",
      "--chat-theme-scrollbar-hover",
      "--chat-theme-header-unread-bg",
      "--chat-theme-input-wrapper-bg",
      "--chat-theme-input-border",
    ].forEach((prop) => targetElement.style.removeProperty(prop));
  },

  applyConversationTheme(targetElement, theme) {
    if (!targetElement || !targetElement.style) return null;

    const option = this.getConversationThemeByKey(theme);
    if (!option) {
      this._clearConversationThemeVars(targetElement);
      return null;
    }

    const mode = this.getCurrentAppThemeMode();
    const palette = option?.[mode] || option?.dark || option?.light || null;
    if (!palette) {
      this._clearConversationThemeVars(targetElement);
      return null;
    }

    this._clearConversationThemeVars(targetElement);

    const accent = palette.accent || "";
    if (accent) targetElement.style.setProperty("--accent-primary", accent);
    if (palette.accentHover)
      targetElement.style.setProperty("--accent-hover", palette.accentHover);
    if (palette.accentActive)
      targetElement.style.setProperty("--accent-active", palette.accentActive);

    const rgb = this._hexToRgbString(accent);
    if (rgb) {
      targetElement.style.setProperty("--accent-primary-rgb", rgb);
    }

    if (palette.surface) {
      targetElement.style.setProperty("--chat-theme-bg", palette.surface);
      targetElement.style.setProperty("--chat-theme-surface", palette.surface);
      const footerSurface =
        palette.surfaceReverse ||
        this._getReversedLinearGradient(palette.surface);
      if (footerSurface) {
        targetElement.style.setProperty(
          "--chat-theme-footer-surface",
          footerSurface,
        );
      }
    }
    if (palette.surfaceAlt)
      targetElement.style.setProperty(
        "--chat-theme-surface-alt",
        palette.surfaceAlt,
      );
    const fallbackTooltipBg = mode === "light" ? "#ffffff" : "#111827";
    const tooltipBaseColor = this._normalizeThemeColorValue(
      palette.surface ||
        palette.otherBubbleBg ||
        palette.ownBubbleBg ||
        fallbackTooltipBg,
    );
    const tooltipLayerColor = this._normalizeThemeColorValue(
      palette.surfaceAlt || palette.surface || "",
    );
    const tooltipBaseRgb =
      this._parseColorToRgb(
        this._toOpaqueThemeColor(tooltipBaseColor || fallbackTooltipBg),
      ) || this._parseColorToRgb(fallbackTooltipBg);
    const tooltipLayerRgba = this._parseColorToRgba(tooltipLayerColor);

    let tooltipRgb = null;
    if (tooltipLayerRgba) {
      if (tooltipLayerRgba.a < 1 && tooltipBaseRgb) {
        tooltipRgb = this._blendRgb(
          tooltipLayerRgba,
          tooltipBaseRgb,
          tooltipLayerRgba.a,
        );
      } else {
        tooltipRgb = {
          r: tooltipLayerRgba.r,
          g: tooltipLayerRgba.g,
          b: tooltipLayerRgba.b,
        };
      }
    }

    if (!tooltipRgb && tooltipBaseRgb) {
      tooltipRgb = tooltipBaseRgb;
    }
    if (!tooltipRgb) {
      tooltipRgb =
        mode === "light" ? { r: 248, g: 250, b: 252 } : { r: 17, g: 24, b: 39 };
    }
    let tooltipBg = `rgb(${tooltipRgb.r}, ${tooltipRgb.g}, ${tooltipRgb.b})`;

    // Keep tooltips readable without flattening every theme into one color.
    if (tooltipRgb) {
      const brightness = (tooltipRgb.r + tooltipRgb.g + tooltipRgb.b) / 3;
      if (mode === "dark" && brightness > 128) {
        const scale = 128 / brightness;
        tooltipRgb = {
          r: Math.max(0, Math.min(255, Math.round(tooltipRgb.r * scale))),
          g: Math.max(0, Math.min(255, Math.round(tooltipRgb.g * scale))),
          b: Math.max(0, Math.min(255, Math.round(tooltipRgb.b * scale))),
        };
        tooltipBg = `rgb(${tooltipRgb.r}, ${tooltipRgb.g}, ${tooltipRgb.b})`;
      } else if (mode === "light" && brightness < 168) {
        const liftRatio = (168 - brightness) / 168;
        const mix = Math.max(0.2, Math.min(0.86, liftRatio * 0.86));
        tooltipRgb = {
          r: Math.max(
            0,
            Math.min(
              255,
              Math.round(tooltipRgb.r + (255 - tooltipRgb.r) * mix),
            ),
          ),
          g: Math.max(
            0,
            Math.min(
              255,
              Math.round(tooltipRgb.g + (255 - tooltipRgb.g) * mix),
            ),
          ),
          b: Math.max(
            0,
            Math.min(
              255,
              Math.round(tooltipRgb.b + (255 - tooltipRgb.b) * mix),
            ),
          ),
        };
        tooltipBg = `rgb(${tooltipRgb.r}, ${tooltipRgb.g}, ${tooltipRgb.b})`;
      }
    }

    const darkBg = this._isDarkRgb(tooltipRgb);
    const tooltipText = darkBg ? "#f8fafc" : "#0f172a";
    let tooltipBorder = darkBg
      ? "rgba(148, 163, 184, 0.34)"
      : "rgba(15, 23, 42, 0.22)";
    const paletteBorderRgb = this._parseColorToRgb(
      this._toOpaqueThemeColor(palette.border || ""),
    );
    if (paletteBorderRgb) {
      const borderAlpha = darkBg ? 0.52 : 0.3;
      tooltipBorder = `rgba(${paletteBorderRgb.r}, ${paletteBorderRgb.g}, ${paletteBorderRgb.b}, ${borderAlpha})`;
    }

    targetElement.style.setProperty("--chat-theme-tooltip-bg", tooltipBg);
    targetElement.style.setProperty("--chat-theme-tooltip-text", tooltipText);
    targetElement.style.setProperty(
      "--chat-theme-tooltip-border",
      tooltipBorder,
    );
    if (palette.border)
      targetElement.style.setProperty("--chat-theme-border", palette.border);
    if (palette.ownBubbleBg) {
      targetElement.style.setProperty(
        "--chat-theme-own-bubble-bg",
        palette.ownBubbleBg,
      );
      targetElement.style.setProperty(
        "--chat-theme-header-unread-bg",
        palette.ownBubbleBg,
      );
      targetElement.style.setProperty(
        "--chat-theme-scrollbar-hover",
        palette.ownBubbleBg,
      );
    }
    if (palette.ownBubbleText)
      targetElement.style.setProperty(
        "--chat-theme-own-bubble-text",
        palette.ownBubbleText,
      );
    if (palette.otherBubbleBg)
      targetElement.style.setProperty(
        "--chat-theme-other-bubble-bg",
        palette.otherBubbleBg,
      );
    if (palette.otherBubbleText)
      targetElement.style.setProperty(
        "--chat-theme-other-bubble-text",
        palette.otherBubbleText,
      );
    if (palette.systemText)
      targetElement.style.setProperty(
        "--chat-theme-system-text",
        palette.systemText,
      );
    if (palette.actionColor)
      targetElement.style.setProperty(
        "--chat-theme-action-color",
        palette.actionColor,
      );
    if (palette.actionHover)
      targetElement.style.setProperty(
        "--chat-theme-action-hover",
        palette.actionHover,
      );
    // Keep hover clean: no background flash on icon/buttons.
    targetElement.style.setProperty(
      "--chat-theme-action-hover-bg",
      palette.actionHoverBg || "transparent",
    );
    if (palette.scrollbarThumb)
      targetElement.style.setProperty(
        "--chat-theme-scrollbar-thumb",
        palette.scrollbarThumb,
      );
    if (palette.scrollbarHover)
      targetElement.style.setProperty(
        "--chat-theme-scrollbar-hover",
        palette.scrollbarHover,
      );
    if (palette.inputWrapperBg)
      targetElement.style.setProperty(
        "--chat-theme-input-wrapper-bg",
        palette.inputWrapperBg,
      );
    if (palette.inputBorder)
      targetElement.style.setProperty(
        "--chat-theme-input-border",
        palette.inputBorder,
      );

    // Add theme class for CSS targeting
    [...targetElement.classList].forEach((c) => {
      if (c.startsWith("chat-theme-")) targetElement.classList.remove(c);
    });
    targetElement.classList.add(`chat-theme-${option.key}`);
    targetElement.dataset.theme = option.key;

    return option.key;
  },

  getMessageType(msg) {
    if (!msg) return null;

    const rawType =
      msg.messageType ??
      msg.MessageType ??
      msg.message_type ??
      msg.Type ??
      null;

    if (rawType === null || rawType === undefined || rawType === "") {
      return null;
    }

    if (typeof rawType === "number" && Number.isFinite(rawType)) {
      return rawType;
    }

    if (typeof rawType === "string") {
      const normalized = rawType.trim().toLowerCase();
      if (!normalized.length) return null;

      const numericType = Number(normalized);
      if (Number.isFinite(numericType)) {
        return numericType;
      }

      if (normalized === "text") return 1;
      if (normalized === "media") return 2;
      if (normalized === "system") return 3;
      if (normalized === "storyreply") return 4;
      if (normalized === "postshare") return 5;
    }

    return rawType;
  },

  isSystemMessage(msg) {
    return this.getMessageType(msg) === 3;
  },

  isSystemMessageElement(el) {
    if (!el || !el.classList || !el.classList.contains("msg-bubble-wrapper")) {
      return false;
    }

    if (el.classList.contains("msg-system")) {
      return true;
    }

    const typeRaw = (el.dataset?.messageType || "").toString().toLowerCase();
    return typeRaw === "system" || typeRaw === "3";
  },

  toMentionUsername(value) {
    const normalized =
      value === null || value === undefined ? "" : String(value).trim();
    if (!normalized.length) return "";
    return normalized.startsWith("@") ? normalized : `@${normalized}`;
  },

  parseSystemMessageData(msg) {
    const systemDataRaw =
      msg?.systemMessageDataJson ?? msg?.SystemMessageDataJson ?? "";
    if (typeof systemDataRaw !== "string" || !systemDataRaw.trim().length) {
      return null;
    }

    try {
      const parsed = JSON.parse(systemDataRaw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  },

  isVietnameseLanguage() {
    return /^vi\b/i.test(this.getCurrentLanguage());
  },

  chatSystemT(key, englishFallback, params = {}) {
    return this.t(key, englishFallback, params);
  },

  buildSystemMentionList(values) {
    if (!Array.isArray(values) || values.length === 0) return "";
    return values
      .map((value) => this.toMentionUsername(value))
      .filter(Boolean)
      .join(", ");
  },

  getSystemMessageText(msg) {
    const parsed = this.parseSystemMessageData(msg);
    if (parsed) {
      const actor = this.toMentionUsername(
        parsed?.actorUsername || parsed?.actorDisplayName || "",
      );
      const target = this.toMentionUsername(
        parsed?.targetUsername || parsed?.targetDisplayName || "",
      );
      const actionRaw = parsed?.action ?? parsed?.Action;
      const action = Number(actionRaw);
      const hasNicknameField = Object.prototype.hasOwnProperty.call(
        parsed || {},
        "nickname",
      );
      const nickname = this.normalizeNickname(parsed?.nickname);

      if (actor && Number.isFinite(action) && action === 9) {
        const normalizedTheme = this.normalizeConversationTheme(parsed?.theme);
        if (normalizedTheme) {
          return this.t(
            "chat.system.theme_changed",
            '{actor} changed the chat theme to "{theme}".',
            {
              actor,
              theme: this.getConversationThemeLabel(normalizedTheme),
            },
          );
        }
        return this.t(
          "chat.system.theme_reset",
          "{actor} reset the chat theme.",
          { actor },
        );
      }

      if (actor && Number.isFinite(action) && action === 10) {
        return this.t(
          "chat.system.message_pinned",
          "{actor} pinned a message.",
          { actor },
        );
      }

      if (actor && Number.isFinite(action) && action === 11) {
        return this.t(
          "chat.system.message_unpinned",
          "{actor} unpinned a message.",
          { actor },
        );
      }

      if (actor && Number.isFinite(action) && action === 7) {
        return this.chatSystemT(
          "chat.system.group_created",
          "{actor} created this group.",
          { actor },
        );
      }

      if (actor && Number.isFinite(action) && action === 1) {
        const targets = this.buildSystemMentionList(
          parsed?.targetUsernames || parsed?.TargetUsernames || [],
        );
        return targets
          ? this.chatSystemT(
              "chat.system.member_added",
              "{actor} added {targets} to the group.",
              {
                actor,
                targets,
              },
            )
          : this.chatSystemT(
              "chat.system.member_added_generic",
              "{actor} added new members to the group.",
              { actor },
            );
      }

      if (actor && target && Number.isFinite(action) && action === 3) {
        return this.chatSystemT(
          "chat.system.member_kicked",
          "{actor} removed {target} from the group.",
          {
            actor,
            target,
          },
        );
      }

      if (actor && target && Number.isFinite(action) && action === 5) {
        return this.chatSystemT(
          "chat.system.admin_granted",
          "{actor} made {target} an admin.",
          {
            actor,
            target,
          },
        );
      }

      if (actor && target && Number.isFinite(action) && action === 6) {
        return this.chatSystemT(
          "chat.system.admin_revoked",
          "{actor} removed admin role from {target}.",
          {
            actor,
            target,
          },
        );
      }

      if (actor && Number.isFinite(action) && action === 2) {
        return this.chatSystemT(
          "chat.system.member_left",
          "{actor} left the group.",
          { actor },
        );
      }

      if (actor && target && Number.isFinite(action) && action === 14) {
        return this.chatSystemT(
          "chat.system.owner_transferred",
          "{actor} transferred group ownership to {target}.",
          {
            actor,
            target,
          },
        );
      }

      if (actor && Number.isFinite(action) && action === 4) {
        const conversationName = (parsed?.conversationName || "")
          .toString()
          .trim();
        if (conversationName) {
          return this.chatSystemT(
            "chat.system.group_renamed",
            '{actor} changed the group name to "{conversationName}".',
            {
              actor,
              conversationName,
            },
          );
        }
      }

      if (actor && Number.isFinite(action) && action === 12) {
        const avatarRemoved = !!(
          parsed?.avatarRemoved ?? parsed?.AvatarRemoved
        );
        return avatarRemoved
          ? this.chatSystemT(
              "chat.system.group_avatar_removed",
              "{actor} removed the group avatar.",
              { actor },
            )
          : this.chatSystemT(
              "chat.system.group_avatar_updated",
              "{actor} updated the group avatar.",
              { actor },
            );
      }

      if (actor && Number.isFinite(action) && action === 13) {
        const conversationName = (parsed?.conversationName || "")
          .toString()
          .trim();
        const avatarRemoved = !!(
          parsed?.avatarRemoved ?? parsed?.AvatarRemoved
        );
        const hasConversationNameChanged = !!(
          parsed?.hasConversationNameChanged ??
          parsed?.HasConversationNameChanged
        );
        const hasConversationAvatarChanged = !!(
          parsed?.hasConversationAvatarChanged ??
          parsed?.HasConversationAvatarChanged
        );

        if (hasConversationNameChanged && hasConversationAvatarChanged) {
          return avatarRemoved
            ? this.chatSystemT(
                "chat.system.group_info_updated_removed_avatar",
                '{actor} changed the group name to "{conversationName}" and removed the group avatar.',
                {
                  actor,
                  conversationName,
                },
              )
            : this.chatSystemT(
                "chat.system.group_info_updated",
                '{actor} changed the group name to "{conversationName}" and updated the group avatar.',
                {
                  actor,
                  conversationName,
                },
              );
        }
      }

      if (actor && target && hasNicknameField) {
        return nickname
          ? this.t(
              "chat.system.nickname_set",
              '{actor} set nickname for {target} to "{nickname}".',
              {
                actor,
                target,
                nickname,
              },
            )
          : this.t(
              "chat.system.nickname_removed",
              "{actor} removed nickname for {target}.",
              {
                actor,
                target,
              },
            );
      }
    }

    const contentRaw = msg?.content ?? msg?.Content ?? "";
    if (typeof contentRaw === "string" && contentRaw.trim().length) {
      const content = contentRaw.trim();

      const setNicknameMatch = content.match(
        /^@?([^\s@]+)\s+set nickname for\s+@?([^\s@]+)\s+to\s+"([\s\S]*)"\.$/i,
      );
      if (setNicknameMatch) {
        const actor = this.toMentionUsername(setNicknameMatch[1]);
        const target = this.toMentionUsername(setNicknameMatch[2]);
        const nickname = setNicknameMatch[3];
        return this.t(
          "chat.system.nickname_set",
          '{actor} set nickname for {target} to "{nickname}".',
          {
            actor,
            target,
            nickname,
          },
        );
      }

      const removeNicknameMatch = content.match(
        /^@?([^\s@]+)\s+removed nickname for\s+@?([^\s@]+)\.$/i,
      );
      if (removeNicknameMatch) {
        const actor = this.toMentionUsername(removeNicknameMatch[1]);
        const target = this.toMentionUsername(removeNicknameMatch[2]);
        return this.t(
          "chat.system.nickname_removed",
          "{actor} removed nickname for {target}.",
          {
            actor,
            target,
          },
        );
      }

      const themeChangedMatch = content.match(
        /^@?([^\s@]+)\s+changed the chat theme to\s+"([\s\S]*)"\.$/i,
      );
      if (themeChangedMatch) {
        const actor = this.toMentionUsername(themeChangedMatch[1]);
        const themeLabel = this.getConversationThemeLabel(themeChangedMatch[2]);
        return this.t(
          "chat.system.theme_changed",
          '{actor} changed the chat theme to "{theme}".',
          {
            actor,
            theme: themeLabel,
          },
        );
      }

      const themeResetMatch = content.match(
        /^@?([^\s@]+)\s+reset the chat theme\.$/i,
      );
      if (themeResetMatch) {
        const actor = this.toMentionUsername(themeResetMatch[1]);
        return this.t(
          "chat.system.theme_reset",
          "{actor} reset the chat theme.",
          { actor },
        );
      }

      const groupCreatedMatch = content.match(
        /^@?([^\s@]+)\s+created this group\.$/i,
      );
      if (groupCreatedMatch) {
        const actor = this.toMentionUsername(groupCreatedMatch[1]);
        return this.chatSystemT(
          "chat.system.group_created",
          "{actor} created this group.",
          { actor },
        );
      }

      const memberAddedMatch = content.match(
        /^@?([^\s@]+)\s+added\s+([\s\S]+)\s+to the group\.$/i,
      );
      if (memberAddedMatch) {
        const actor = this.toMentionUsername(memberAddedMatch[1]);
        const targets = this.buildSystemMentionList(
          memberAddedMatch[2]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        );
        return targets
          ? this.chatSystemT(
              "chat.system.member_added",
              "{actor} added {targets} to the group.",
              {
                actor,
                targets,
              },
            )
          : this.chatSystemT(
              "chat.system.member_added_generic",
              "{actor} added new members to the group.",
              { actor },
            );
      }

      const memberAddedGenericMatch = content.match(
        /^@?([^\s@]+)\s+added new members to the group\.$/i,
      );
      if (memberAddedGenericMatch) {
        const actor = this.toMentionUsername(memberAddedGenericMatch[1]);
        return this.chatSystemT(
          "chat.system.member_added_generic",
          "{actor} added new members to the group.",
          { actor },
        );
      }

      const memberKickedMatch = content.match(
        /^@?([^\s@]+)\s+removed\s+@?([^\s@]+)\s+from the group\.$/i,
      );
      if (memberKickedMatch) {
        const actor = this.toMentionUsername(memberKickedMatch[1]);
        const target = this.toMentionUsername(memberKickedMatch[2]);
        return this.chatSystemT(
          "chat.system.member_kicked",
          "{actor} removed {target} from the group.",
          {
            actor,
            target,
          },
        );
      }

      const memberLeftMatch = content.match(
        /^@?([^\s@]+)\s+left the group\.$/i,
      );
      if (memberLeftMatch) {
        const actor = this.toMentionUsername(memberLeftMatch[1]);
        return this.chatSystemT(
          "chat.system.member_left",
          "{actor} left the group.",
          { actor },
        );
      }

      const adminGrantedMatch = content.match(
        /^@?([^\s@]+)\s+made\s+@?([^\s@]+)\s+an admin\.$/i,
      );
      if (adminGrantedMatch) {
        const actor = this.toMentionUsername(adminGrantedMatch[1]);
        const target = this.toMentionUsername(adminGrantedMatch[2]);
        return this.chatSystemT(
          "chat.system.admin_granted",
          "{actor} made {target} an admin.",
          {
            actor,
            target,
          },
        );
      }

      const adminRevokedMatch = content.match(
        /^@?([^\s@]+)\s+removed admin role from\s+@?([^\s@]+)\.$/i,
      );
      if (adminRevokedMatch) {
        const actor = this.toMentionUsername(adminRevokedMatch[1]);
        const target = this.toMentionUsername(adminRevokedMatch[2]);
        return this.chatSystemT(
          "chat.system.admin_revoked",
          "{actor} removed admin role from {target}.",
          {
            actor,
            target,
          },
        );
      }

      const ownerTransferredMatch = content.match(
        /^@?([^\s@]+)\s+transferred group ownership to\s+@?([^\s@]+)\.$/i,
      );
      if (ownerTransferredMatch) {
        const actor = this.toMentionUsername(ownerTransferredMatch[1]);
        const target = this.toMentionUsername(ownerTransferredMatch[2]);
        return this.chatSystemT(
          "chat.system.owner_transferred",
          "{actor} transferred group ownership to {target}.",
          {
            actor,
            target,
          },
        );
      }

      const groupInfoRemovedAvatarMatch = content.match(
        /^@?([^\s@]+)\s+changed the group name to\s+"([\s\S]*)"\s+and removed the group avatar\.$/i,
      );
      if (groupInfoRemovedAvatarMatch) {
        const actor = this.toMentionUsername(groupInfoRemovedAvatarMatch[1]);
        const conversationName = groupInfoRemovedAvatarMatch[2];
        return this.chatSystemT(
          "chat.system.group_info_updated_removed_avatar",
          '{actor} changed the group name to "{conversationName}" and removed the group avatar.',
          {
            actor,
            conversationName,
          },
        );
      }

      const groupInfoUpdatedMatch = content.match(
        /^@?([^\s@]+)\s+changed the group name to\s+"([\s\S]*)"\s+and updated the group avatar\.$/i,
      );
      if (groupInfoUpdatedMatch) {
        const actor = this.toMentionUsername(groupInfoUpdatedMatch[1]);
        const conversationName = groupInfoUpdatedMatch[2];
        return this.chatSystemT(
          "chat.system.group_info_updated",
          '{actor} changed the group name to "{conversationName}" and updated the group avatar.',
          {
            actor,
            conversationName,
          },
        );
      }

      const groupRenamedMatch = content.match(
        /^@?([^\s@]+)\s+changed the group name to\s+"([\s\S]*)"\.$/i,
      );
      if (groupRenamedMatch) {
        const actor = this.toMentionUsername(groupRenamedMatch[1]);
        const conversationName = groupRenamedMatch[2];
        return this.chatSystemT(
          "chat.system.group_renamed",
          '{actor} changed the group name to "{conversationName}".',
          {
            actor,
            conversationName,
          },
        );
      }

      const groupAvatarRemovedMatch = content.match(
        /^@?([^\s@]+)\s+removed the group avatar\.$/i,
      );
      if (groupAvatarRemovedMatch) {
        const actor = this.toMentionUsername(groupAvatarRemovedMatch[1]);
        return this.chatSystemT(
          "chat.system.group_avatar_removed",
          "{actor} removed the group avatar.",
          { actor },
        );
      }

      const groupAvatarUpdatedMatch = content.match(
        /^@?([^\s@]+)\s+updated the group avatar\.$/i,
      );
      if (groupAvatarUpdatedMatch) {
        const actor = this.toMentionUsername(groupAvatarUpdatedMatch[1]);
        return this.chatSystemT(
          "chat.system.group_avatar_updated",
          "{actor} updated the group avatar.",
          { actor },
        );
      }

      const normalizedContent =
        typeof this.normalizeMessageContentForPreview === "function"
          ? this.normalizeMessageContentForPreview(content)
          : content;
      return normalizedContent;
    }

    return this.t("chat.system.fallback", "System message");
  },

  showAddGroupMembersModal(options = {}) {
    const conversationId = this.normalizeEntityId(options.conversationId || "");
    if (!conversationId) return;

    if (
      !window.API?.Conversations?.searchAccountsForAddGroupMembers ||
      !window.API?.Conversations?.addMembers
    ) {
      if (window.toastError) {
        window.toastError(
          this.t(
            "errors.chat.add_members_api_unavailable",
            "Add member API is unavailable",
          ),
        );
      }
      return;
    }

    const existingOverlay = document.querySelector(".chat-add-members-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
      if (window.unlockScroll) window.unlockScroll();
    }

    const toSafeHtml = (value) => {
      const raw = value === null || value === undefined ? "" : String(value);
      if (typeof escapeHtml === "function") return escapeHtml(raw);
      return raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const toSafeAttr = (value) => toSafeHtml(value).replace(/`/g, "&#96;");

    const normalizeAccount = (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const accountId = this.normalizeEntityId(
        raw.accountId || raw.AccountId || "",
      );
      if (!accountId) return null;

      const username = (
        raw.username ||
        raw.userName ||
        raw.Username ||
        raw.UserName ||
        ""
      )
        .toString()
        .trim();
      const fullName = (raw.fullName || raw.FullName || "").toString().trim();
      const avatarUrl = (
        raw.avatarUrl ||
        raw.AvatarUrl ||
        raw.avatar ||
        raw.Avatar ||
        ""
      )
        .toString()
        .trim();

      return {
        id: accountId,
        username: username || this.getUnknownUsernameLabel(),
        fullName:
          fullName ||
          username ||
          this.t("chat.common.unknown_user", "Unknown user"),
        avatarUrl: avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR,
      };
    };

    const searchLimit =
      Number(window.APP_CONFIG?.GROUP_CHAT_ADD_MEMBER_SEARCH_LIMIT) ||
      Number(window.APP_CONFIG?.GROUP_CHAT_INVITE_SEARCH_LIMIT) ||
      10;
    const searchDebounceMs =
      Number(window.APP_CONFIG?.GROUP_CHAT_ADD_MEMBER_SEARCH_DEBOUNCE_MS) ||
      Number(window.APP_CONFIG?.GROUP_CHAT_INVITE_SEARCH_DEBOUNCE_MS) ||
      300;

    const initialExcludeIds = new Set(
      (Array.isArray(options.excludeAccountIds)
        ? options.excludeAccountIds
        : []
      )
        .map((id) => this.normalizeEntityId(id))
        .filter(Boolean),
    );

    let selectedMembers = [];
    let searchResults = [];
    let searchDebounceTimer = null;
    let searchRequestSequence = 0;
    let isSubmitting = false;
    let isClosed = false;

    const overlay = document.createElement("div");
    overlay.className = "chat-common-confirm-overlay chat-add-members-overlay";

    const popup = document.createElement("div");
    popup.className = "chat-common-confirm-popup chat-add-members-popup";
    popup.innerHTML = `
      <div class="chat-add-members-shell">
        <div class="chat-add-members-header">
          <h3>${toSafeHtml(this.t("chat.members.add_title", "Add members"))}</h3>
          <button type="button" class="chat-add-members-close-btn" title="${toSafeAttr(this.t("common.buttons.close", "Close"))}">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="chat-add-members-selected">
          <div class="chat-add-members-selected-header">
            <span class="cg-label">${toSafeHtml(this.t("chat.members.selected", "Selected members"))}</span>
            <span class="chat-add-members-selected-count">${toSafeHtml(this.t("chat.members.selected_count", "{count} selected", { count: 0 }))}</span>
          </div>
          <div class="cg-selected-chips hidden chat-add-members-selected-chips"></div>
          <div class="cg-no-members-hint chat-add-members-selected-hint">
            <i data-lucide="user-plus" size="20"></i>
            <span>${toSafeHtml(this.t("chat.members.select_from_list", "Select members from the list below"))}</span>
          </div>
        </div>
        <div class="cg-field cg-search-field chat-add-members-search-field">
          <i data-lucide="search" size="16" class="cg-search-icon"></i>
          <input type="text" class="cg-input cg-search-input chat-add-members-search-input" placeholder="${toSafeAttr(this.t("chat.members.search_placeholder", "Search users to add..."))}">
        </div>
        <div class="cg-friend-list chat-add-members-list"></div>
        <div class="chat-add-members-footer">
          <button type="button" class="cg-btn-cancel chat-add-members-cancel-btn">${toSafeHtml(this.t("common.buttons.cancel", "Cancel"))}</button>
          <button type="button" class="cg-btn-create chat-add-members-submit-btn" disabled>${toSafeHtml(this.t("chat.members.add_action", "Add members"))}</button>
        </div>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lockScroll) window.lockScroll();
    if (window.lucide) lucide.createIcons({ container: popup });
    requestAnimationFrame(() => overlay.classList.add("show"));

    const closeBtn = popup.querySelector(".chat-add-members-close-btn");
    const cancelBtn = popup.querySelector(".chat-add-members-cancel-btn");
    const submitBtn = popup.querySelector(".chat-add-members-submit-btn");
    const countEl = popup.querySelector(".chat-add-members-selected-count");
    const chipsEl = popup.querySelector(".chat-add-members-selected-chips");
    const hintEl = popup.querySelector(".chat-add-members-selected-hint");
    const searchInput = popup.querySelector(".chat-add-members-search-input");
    const listEl = popup.querySelector(".chat-add-members-list");

    const closeModal = () => {
      if (isClosed) return;
      isClosed = true;

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }

      overlay.classList.remove("show");
      if (window.unlockScroll) window.unlockScroll();
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    };

    const mergeAccounts = (priorityAccounts, apiAccounts) => {
      const merged = [];
      const seen = new Set();
      [...(priorityAccounts || []), ...(apiAccounts || [])].forEach(
        (account) => {
          if (!account || !account.id) return;
          if (seen.has(account.id)) return;
          seen.add(account.id);
          merged.push(account);
        },
      );
      return merged;
    };

    const accountMatchesKeyword = (account, keyword) => {
      const normalizedKeyword = (keyword || "").toString().trim().toLowerCase();
      if (!normalizedKeyword) return true;

      return (
        (account?.username || "").toLowerCase().includes(normalizedKeyword) ||
        (account?.fullName || "").toLowerCase().includes(normalizedKeyword)
      );
    };

    const renderSelectedMembers = () => {
      if (countEl) {
        countEl.textContent = this.t(
          "chat.members.selected_count",
          "{count} selected",
          { count: this.formatCount(selectedMembers.length) },
        );
      }

      if (!chipsEl || !hintEl || !submitBtn) return;

      submitBtn.disabled = isSubmitting || selectedMembers.length === 0;
      submitBtn.textContent = isSubmitting
        ? this.t("chat.members.adding", "Adding...")
        : this.t("chat.members.add_action", "Add members");

      if (!selectedMembers.length) {
        chipsEl.classList.add("hidden");
        chipsEl.innerHTML = "";
        hintEl.classList.remove("hidden");
        return;
      }

      hintEl.classList.add("hidden");
      chipsEl.classList.remove("hidden");
      chipsEl.innerHTML = selectedMembers
        .map(
          (member) => `
            <div class="cg-chip">
              <span class="cg-chip-username">${toSafeHtml(member.username)}</span>
              <button type="button" class="cg-chip-remove" data-account-id="${toSafeAttr(member.id)}">
                <i data-lucide="x" size="10"></i>
              </button>
            </div>
          `,
        )
        .join("");

      if (window.lucide) lucide.createIcons({ container: chipsEl });
      setTimeout(() => {
        chipsEl.scrollLeft = chipsEl.scrollWidth;
      }, 40);
    };

    const renderLoadingState = () => {
      if (!listEl) return;
      listEl.innerHTML = `
        <div class="cg-skeleton-item"></div>
        <div class="cg-skeleton-item"></div>
        <div class="cg-skeleton-item"></div>
      `;
    };

    const renderEmptyState = (message) => {
      if (!listEl) return;
      listEl.innerHTML = `<div class="cg-empty-state">${toSafeHtml(message || this.t("common.empty.no_results", "No results"))}</div>`;
    };

    const renderSearchResults = (accounts, keyword) => {
      if (!listEl) return;

      if (!Array.isArray(accounts) || accounts.length === 0) {
        if ((keyword || "").trim().length === 1) {
          renderEmptyState(
            this.t(
              "chat.members.search_min_chars",
              "Type at least 2 characters to search",
            ),
          );
          return;
        }

        if ((keyword || "").trim().length === 0) {
          renderEmptyState(
            this.t(
              "chat.members.no_recent_contacts",
              "No recent contacts available",
            ),
          );
          return;
        }

        renderEmptyState(
          this.t("chat.members.no_matching_users", "No matching users found"),
        );
        return;
      }

      listEl.innerHTML = accounts
        .map((account) => {
          const isSelected = selectedMembers.some(
            (member) => member.id === account.id,
          );
          const avatar = account.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;

          return `
            <div class="cg-friend-item ${isSelected ? "selected" : ""}"
                 data-account-id="${toSafeAttr(account.id)}"
                 data-username="${toSafeAttr(account.username)}"
                 data-fullname="${toSafeAttr(account.fullName)}"
                 data-avatar="${toSafeAttr(account.avatarUrl || "")}">
              <img src="${toSafeAttr(avatar)}" alt="" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
              <div class="cg-friend-info">
                <div class="cg-friend-username">${toSafeHtml(account.username)}</div>
                <div class="cg-friend-name">${toSafeHtml(account.fullName)}</div>
              </div>
              <div class="cg-checkbox">
                <i data-lucide="check" size="14"></i>
              </div>
            </div>
          `;
        })
        .join("");

      if (window.lucide) lucide.createIcons({ container: listEl });
    };

    const toggleSelectedMember = (account) => {
      if (!account?.id) return;
      const existingIndex = selectedMembers.findIndex(
        (member) => member.id === account.id,
      );
      if (existingIndex >= 0) {
        selectedMembers.splice(existingIndex, 1);
      } else {
        selectedMembers.push(account);
      }

      renderSelectedMembers();
      renderSearchResults(searchResults, searchInput?.value || "");
    };

    const searchAccounts = async (keyword, { showLoading = true } = {}) => {
      const normalizedKeyword = (keyword || "").toString().trim();
      if (!listEl) return;

      if (normalizedKeyword.length === 1) {
        renderEmptyState(
          this.t(
            "chat.members.search_min_chars",
            "Type at least 2 characters to search",
          ),
        );
        return;
      }

      const requestSequence = ++searchRequestSequence;
      if (showLoading) renderLoadingState();

      try {
        const excludeAccountIds = Array.from(
          new Set([
            ...Array.from(initialExcludeIds),
            ...selectedMembers.map((member) => member.id),
          ]),
        );

        const res =
          await window.API.Conversations.searchAccountsForAddGroupMembers(
            conversationId,
            normalizedKeyword,
            excludeAccountIds,
            searchLimit,
          );

        if (requestSequence !== searchRequestSequence) return;

        if (!res.ok) {
          const message = await this.readFriendlyApiError(res, {
            feature: "chat",
            action: "search-group-members",
            fallbackKey: "errors.chat.members_search_failed",
            fallbackMessage: "Failed to search members",
          });
          renderEmptyState(message);
          return;
        }

        const data = await res.json();
        const apiAccounts = (Array.isArray(data) ? data : [])
          .map((item) => normalizeAccount(item))
          .filter(Boolean);

        const selectedMatches = selectedMembers.filter((account) =>
          accountMatchesKeyword(account, normalizedKeyword),
        );

        searchResults = mergeAccounts(selectedMatches, apiAccounts);
        renderSearchResults(searchResults, normalizedKeyword);
      } catch (error) {
        if (requestSequence !== searchRequestSequence) return;
        console.error("Failed to search group add-member accounts:", error);
        renderEmptyState(
          this.t(
            "errors.chat.connection_failed",
            "Could not connect to server",
          ),
        );
      }
    };

    const submitAddMembers = async () => {
      if (isSubmitting || !submitBtn) return;
      const selectedIds = Array.from(
        new Set(selectedMembers.map((member) => member.id).filter(Boolean)),
      );
      if (!selectedIds.length) {
        if (window.toastWarning)
          window.toastWarning(
            this.t(
              "chat.members.select_at_least_one",
              "Please select at least one member",
            ),
          );
        return;
      }

      isSubmitting = true;
      renderSelectedMembers();

      try {
        const res = await window.API.Conversations.addMembers(
          conversationId,
          selectedIds,
        );
        if (!res.ok) {
          const message = await this.readFriendlyApiError(res, {
            feature: "chat",
            action: "add-group-members",
            fallbackKey: "errors.chat.add_members_failed",
            fallbackMessage: "Failed to add members",
          });
          if (window.toastError) window.toastError(message);
          return;
        }

        if (typeof options.onSuccess === "function") {
          await options.onSuccess({
            conversationId,
            memberIds: selectedIds,
            members: selectedMembers.slice(),
          });
        }

        if (window.toastSuccess) {
          const count = selectedIds.length;
          window.toastSuccess(
            count === 1
              ? this.t("chat.members.add_success_one", "Member added to group")
              : this.t(
                  "chat.members.add_success_many",
                  "{count} members added to group",
                  { count: this.formatCount(count) },
                ),
          );
        }

        closeModal();
      } catch (error) {
        console.error("Failed to add group members:", error);
        if (window.toastError) {
          window.toastError(
            this.t("errors.chat.add_members_failed", "Failed to add members"),
          );
        }
      } finally {
        isSubmitting = false;
        renderSelectedMembers();
      }
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (submitBtn) submitBtn.onclick = submitAddMembers;

    overlay.onclick = (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    };

    if (chipsEl) {
      chipsEl.onclick = (event) => {
        const removeBtn = event.target.closest(".cg-chip-remove");
        if (!removeBtn) return;

        const accountId = this.normalizeEntityId(
          removeBtn.dataset.accountId || "",
        );
        if (!accountId) return;
        const member = selectedMembers.find((item) => item.id === accountId);
        if (!member) return;
        toggleSelectedMember(member);
      };
    }

    if (listEl) {
      listEl.onclick = (event) => {
        const item = event.target.closest(".cg-friend-item");
        if (!item) return;

        const account = normalizeAccount({
          accountId: item.dataset.accountId || "",
          username: item.dataset.username || "",
          fullName: item.dataset.fullname || "",
          avatarUrl: item.dataset.avatar || "",
        });
        if (!account) return;
        toggleSelectedMember(account);
      };
    }

    if (searchInput) {
      searchInput.oninput = () => {
        const keyword = (searchInput.value || "").trim();
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }

        if (keyword.length === 1) {
          renderEmptyState(
            this.t(
              "chat.members.search_min_chars",
              "Type at least 2 characters to search",
            ),
          );
          return;
        }

        const waitMs = keyword.length === 0 ? 0 : searchDebounceMs;
        searchDebounceTimer = setTimeout(() => {
          searchAccounts(keyword, { showLoading: true });
        }, waitMs);
      };
    }

    renderSelectedMembers();
    renderLoadingState();
    searchAccounts("", { showLoading: true });
    setTimeout(() => searchInput?.focus(), 80);
  },

  /**
   * Normalize a conversation member object to one consistent shape.
   * @param {Object} member
   * @param {Object} options
   * @param {boolean} options.fallbackUsernameToDisplayName - Use displayName as username only when nickname is empty.
   */
  normalizeConversationMember(member = {}, options = {}) {
    const { fallbackUsernameToDisplayName = false } = options;
    const normalized = member || {};
    const accountId = (normalized.accountId || normalized.AccountId || "")
      .toString()
      .toLowerCase();
    const fullName = (normalized.fullName || normalized.FullName || "")
      .toString()
      .trim();
    const displayName =
      normalized.displayName || normalized.DisplayName || fullName || "";
    const nickname = this.normalizeNickname(
      normalized.nickname ?? normalized.Nickname ?? null,
    );
    const usernameRaw =
      normalized.username ||
      normalized.userName ||
      normalized.Username ||
      normalized.UserName ||
      "";
    const username =
      usernameRaw ||
      (fallbackUsernameToDisplayName && displayName && !nickname
        ? displayName
        : "");
    const avatarUrl =
      normalized.avatarUrl ||
      normalized.AvatarUrl ||
      window.APP_CONFIG?.DEFAULT_AVATAR;

    return {
      accountId,
      displayName,
      username,
      fullName,
      avatarUrl,
      storyRingState:
        normalized.storyRingState ?? normalized.StoryRingState ?? null,
      nickname,
    };
  },

  getNicknameMaxLength() {
    const configured = Number(window.APP_CONFIG?.MAX_CHAT_NICKNAME_LENGTH);
    if (!Number.isFinite(configured) || configured <= 0) {
      return 50;
    }
    return Math.floor(configured);
  },

  truncateDisplayText(text, maxLength = 50) {
    if (text === null || text === undefined) return "";
    const rawText = String(text);
    const configured = Number(maxLength);
    if (
      !Number.isFinite(configured) ||
      configured <= 0 ||
      rawText.length <= configured
    ) {
      return rawText;
    }

    if (typeof truncateSmart === "function") {
      return truncateSmart(rawText, Math.floor(configured));
    }
    if (typeof truncateText === "function") {
      return truncateText(rawText, Math.floor(configured));
    }
    return rawText.substring(0, Math.floor(configured)) + "...";
  },

  normalizeNickname(value) {
    if (typeof value !== "string") {
      return value ?? null;
    }
    const trimmed = value.trim();
    if (!trimmed.length) return null;

    const maxLength = this.getNicknameMaxLength();
    return trimmed.length > maxLength
      ? trimmed.substring(0, maxLength)
      : trimmed;
  },

  parseReactType(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  },

  getReactEmoji(reactType) {
    const normalized = this.parseReactType(reactType);
    const emojiMap = {
      0: "👍",
      1: "❤️",
      2: "😆",
      3: "😮",
      4: "😢",
      5: "😡",
    };
    return emojiMap[normalized] || "👍";
  },

  normalizeMessageReactSummaries(rawReacts) {
    if (!Array.isArray(rawReacts)) return [];

    return rawReacts
      .map((item) => {
        const reactType = this.parseReactType(
          item?.reactType ?? item?.ReactType,
        );
        const count = Number(item?.count ?? item?.Count ?? 0);
        if (reactType === null || !Number.isFinite(count) || count <= 0) {
          return null;
        }
        return {
          reactType,
          count,
        };
      })
      .filter(Boolean);
  },

  normalizeMessageReactedBy(rawReactedBy) {
    if (!Array.isArray(rawReactedBy)) return [];

    return rawReactedBy
      .map((item) => {
        const accountId = (item?.accountId || item?.AccountId || "")
          .toString()
          .toLowerCase();
        const reactType = this.parseReactType(
          item?.reactType ?? item?.ReactType,
        );
        if (!accountId || reactType === null) return null;

        return {
          accountId,
          username: item?.username || item?.Username || "",
          fullName: item?.fullName || item?.FullName || "",
          avatarUrl: item?.avatarUrl || item?.AvatarUrl || "",
          nickname: this.normalizeNickname(
            item?.nickname ?? item?.Nickname ?? null,
          ),
          reactType,
          createdAt: item?.createdAt || item?.CreatedAt || null,
        };
      })
      .filter(Boolean);
  },

  buildReactSummariesFromReactedBy(reactedBy) {
    if (!Array.isArray(reactedBy) || reactedBy.length === 0) return [];
    const grouped = new Map();

    reactedBy.forEach((reactor) => {
      const reactType = this.parseReactType(reactor?.reactType);
      if (reactType === null) return;
      grouped.set(reactType, (grouped.get(reactType) || 0) + 1);
    });

    return Array.from(grouped.entries())
      .map(([reactType, count]) => ({ reactType, count }))
      .sort((a, b) => a.reactType - b.reactType);
  },

  getMessageReactionDisplayName(reactor) {
    if (!reactor) return "Unknown";
    const nickname = this.normalizeNickname(
      reactor.nickname ?? reactor.Nickname ?? null,
    );
    if (nickname) return nickname;
    return (
      reactor.username ||
      reactor.Username ||
      reactor.fullName ||
      reactor.FullName ||
      "Unknown"
    );
  },

  getMessageReactionHoverText(reactedBy, maxNames = 3) {
    if (!Array.isArray(reactedBy) || reactedBy.length === 0) return "";
    const names = reactedBy
      .map((reactor) => {
        const name = this.getMessageReactionDisplayName(reactor);
        // Increased length for page chat
        const isPage = document.body.classList.contains("is-chat-page");
        const truncatedLength = isPage ? 22 : 16;
        return this.truncateDisplayText(name, truncatedLength);
      })
      .filter(Boolean);

    if (names.length === 0) return "";

    const visibleNames = names.slice(0, maxNames);
    if (names.length <= maxNames) {
      return visibleNames.join("\n");
    }

    return `${visibleNames.join("\n")}\n+${names.length - maxNames} others`;
  },

  getMessageReactionData(msg) {
    const reactedByRaw = msg?.reactedBy || msg?.ReactedBy;
    const reactsRaw = msg?.reacts || msg?.Reacts;

    const reactedBy = this.normalizeMessageReactedBy(reactedByRaw);
    let reacts = this.normalizeMessageReactSummaries(reactsRaw);
    if (reacts.length === 0 && reactedBy.length > 0) {
      reacts = this.buildReactSummariesFromReactedBy(reactedBy);
    }

    const summaryTotal = reacts.reduce(
      (sum, item) => sum + Number(item?.count || 0),
      0,
    );
    const totalReacts = summaryTotal > 0 ? summaryTotal : reactedBy.length;

    const sortedReacts = [...reacts].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.reactType - b.reactType;
    });

    const dominantReactTypes = sortedReacts
      .slice(0, 3)
      .map((item) => item.reactType);

    return {
      reacts,
      sortedReacts,
      reactedBy,
      totalReacts,
      dominantReactTypes,
      hoverText: this.getMessageReactionHoverText(reactedBy),
    };
  },

  buildMessageReactionBadgeLayout(reactionData) {
    const sortedReacts = Array.isArray(reactionData?.sortedReacts)
      ? reactionData.sortedReacts
      : [];
    const totalReacts = Number(reactionData?.totalReacts || 0);

    if (!sortedReacts.length || totalReacts <= 0) {
      return { items: [], extraCount: 0 };
    }

    // > 3 reacts: show 3 representative reactions + n others
    if (totalReacts > 3) {
      const representativeTypes = [];
      for (
        let i = 0;
        i < sortedReacts.length && representativeTypes.length < 3;
        i += 1
      ) {
        const item = sortedReacts[i];
        const count = Math.max(0, Number(item?.count || 0));
        const reactType = this.parseReactType(item?.reactType);
        if (reactType === null || count <= 0) continue;
        for (let j = 0; j < count && representativeTypes.length < 3; j += 1) {
          representativeTypes.push(reactType);
        }
      }

      return {
        items: representativeTypes.map((reactType) => ({
          reactType,
          count: null,
        })),
        extraCount: Math.max(0, totalReacts - representativeTypes.length),
      };
    }

    // <= 3 reacts:
    // - single: icon only
    // - duplicates: show count only for duplicated react type
    // - different: icon(s) only
    return {
      items: sortedReacts.map((item) => ({
        reactType: item.reactType,
        count: Number(item.count) > 1 ? Number(item.count) : null,
      })),
      extraCount: 0,
    };
  },

  renderMessageReactionBadge(msg, messageId = "") {
    const normalizedMessageId = (
      messageId ||
      msg?.messageId ||
      msg?.MessageId ||
      ""
    )
      .toString()
      .toLowerCase();
    if (!normalizedMessageId) return "";

    const reactionData = this.getMessageReactionData(msg);
    if (reactionData.totalReacts <= 0) return "";
    const badgeLayout = this.buildMessageReactionBadgeLayout(reactionData);
    if (!badgeLayout.items.length && badgeLayout.extraCount <= 0) return "";

    const safeHoverText = (
      typeof escapeHtml === "function"
        ? escapeHtml(reactionData.hoverText || "")
        : reactionData.hoverText || ""
    )
      .replace(/"/g, "&quot;")
      .replace(/\r?\n/g, "&#10;");

    const iconsHtml = badgeLayout.items
      .map(
        (item) =>
          `<span class="msg-reactions-item${item.count ? " has-count" : ""}" data-react-type="${item.reactType}"><span class="msg-reactions-icon">${this.getReactEmoji(item.reactType)}</span>${item.count ? `<span class="msg-reactions-item-count">${item.count}</span>` : ""}</span>`,
      )
      .join("");
    const extraHtml =
      badgeLayout.extraCount > 0
        ? `<span class="msg-reactions-extra">+${badgeLayout.extraCount}</span>`
        : "";

    return `<button type="button" class="msg-reactions-summary" data-action="view-reactors" data-message-id="${normalizedMessageId}" ${safeHoverText ? `data-react-tooltip="${safeHoverText}" aria-label="${safeHoverText}"` : ""} onclick="window.ChatActions && ChatActions.openReactorsModal('${normalizedMessageId}', event)"><span class="msg-reactions-icons">${iconsHtml}</span>${extraHtml}</button>`;
  },

  getReactionBadgeAnchor(contentContainer) {
    if (!contentContainer || !(contentContainer instanceof Element))
      return null;

    let anchor = null;
    Array.from(contentContainer.children || []).forEach((child) => {
      if (!(child instanceof Element)) return;
      if (
        child.classList.contains("msg-bubble") ||
        child.classList.contains("msg-media-anchor") ||
        child.classList.contains("msg-file-anchor") ||
        child.classList.contains("msg-post-share-preview") ||
        child.classList.contains("msg-story-reply-preview")
      ) {
        anchor = child;
      }
    });

    return anchor || contentContainer;
  },

  ensureReactionBadgeAnchor(contentContainer, badge = null) {
    if (!contentContainer || !(contentContainer instanceof Element))
      return null;

    const targetBadge =
      badge && badge.classList?.contains("msg-reactions-summary")
        ? badge
        : contentContainer.querySelector(".msg-reactions-summary");

    if (targetBadge && targetBadge.parentElement !== contentContainer) {
      contentContainer.appendChild(targetBadge);
    }
    return this.getReactionBadgeAnchor(contentContainer) || contentContainer;
  },

  bindReactionBadgeMediaSync(contentContainer) {
    if (!contentContainer || !(contentContainer instanceof Element)) return;

    const mediaNodes = contentContainer.querySelectorAll(
      ".msg-media-item img, .msg-media-item video",
    );
    if (!mediaNodes.length) return;

    mediaNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.dataset?.reactionSyncBound === "1") return;
      node.dataset.reactionSyncBound = "1";

      const scheduleSync = () => {
        requestAnimationFrame(() =>
          this.syncReactionBadgeOverflow(contentContainer, true),
        );
      };

      const tag = node.tagName.toLowerCase();
      if (tag === "img") {
        const img = /** @type {HTMLImageElement} */ (node);
        if (!img.complete || img.naturalWidth <= 0) {
          img.addEventListener("load", scheduleSync, { once: true });
          img.addEventListener("error", scheduleSync, { once: true });
        }
        return;
      }

      if (tag === "video") {
        const video = /** @type {HTMLVideoElement} */ (node);
        if (video.readyState < 1) {
          video.addEventListener("loadedmetadata", scheduleSync, {
            once: true,
          });
          video.addEventListener("loadeddata", scheduleSync, { once: true });
          video.addEventListener("error", scheduleSync, { once: true });
        }
      }
    });
  },

  queueReactionBadgeResync(contentContainer) {
    if (!contentContainer || !(contentContainer instanceof Element)) return;

    const currentAttempt = Number(contentContainer.dataset.reactSyncRetry || 0);
    if (currentAttempt >= 8) return;

    const nextAttempt = currentAttempt + 1;
    contentContainer.dataset.reactSyncRetry = String(nextAttempt);

    if (contentContainer._reactionBadgeRetryTimer) {
      clearTimeout(contentContainer._reactionBadgeRetryTimer);
    }

    const delay = nextAttempt <= 2 ? 16 : nextAttempt <= 5 ? 60 : 120;
    contentContainer._reactionBadgeRetryTimer = setTimeout(() => {
      this.syncReactionBadgeOverflow(contentContainer, true);
    }, delay);
  },

  positionReactionBadge(contentContainer, badge, anchor) {
    if (!contentContainer || !badge || !anchor) return false;

    const anchorHeight = anchor.offsetHeight || 0;
    const containerWidth = contentContainer.offsetWidth || 0;
    if (anchorHeight <= 1 || containerWidth <= 1) {
      return false;
    }

    const anchorTop = Math.max(0, anchor.offsetTop + anchorHeight);
    const anchorWidth = anchor.offsetWidth || contentContainer.offsetWidth || 0;
    const badgeWidth = badge.offsetWidth || 0;
    const overflow = anchorWidth > 0 && badgeWidth > anchorWidth;
    badge.classList.toggle("msg-reactions-overflow", overflow);

    const leftOffset = Math.max(0, anchor.offsetLeft || 0);
    const rightOffset = Math.max(
      0,
      (contentContainer.offsetWidth || 0) -
        leftOffset -
        (anchor.offsetWidth || 0),
    );

    const wrapper = contentContainer.closest(".msg-bubble-wrapper");
    const isSent = !!wrapper?.classList?.contains("sent");

    badge.style.top = `${anchorTop}px`;
    if (isSent) {
      if (overflow) {
        badge.style.left = "auto";
        badge.style.right = `${rightOffset}px`;
      } else {
        badge.style.left = `${leftOffset}px`;
        badge.style.right = "auto";
      }
    } else {
      if (overflow) {
        badge.style.left = `${leftOffset}px`;
        badge.style.right = "auto";
      } else {
        badge.style.left = "auto";
        badge.style.right = `${rightOffset}px`;
      }
    }
    return true;
  },

  applyMessageReactionStateToBubble(bubble, state = {}) {
    if (!bubble || !bubble.classList?.contains("msg-bubble-wrapper")) return;

    const messageId = (
      state?.messageId ||
      state?.MessageId ||
      bubble.dataset?.messageId ||
      ""
    )
      .toString()
      .toLowerCase();
    const currentReactType = this.parseReactType(
      state?.currentUserReactType ?? state?.CurrentUserReactType,
    );

    const reacts = this.normalizeMessageReactSummaries(
      state?.reacts || state?.Reacts,
    );
    const reactedBy = this.normalizeMessageReactedBy(
      state?.reactedBy || state?.ReactedBy,
    );
    const reactionData = this.getMessageReactionData({ reacts, reactedBy });

    bubble.dataset.currentReactType =
      currentReactType === null ? "" : String(currentReactType);
    bubble.dataset.reacts = JSON.stringify(reactionData.reacts || []);
    bubble.dataset.reactedBy = JSON.stringify(reactionData.reactedBy || []);
    bubble.dataset.totalReacts = String(reactionData.totalReacts || 0);

    const contentContainer = bubble.querySelector(".msg-content-container");
    if (!contentContainer) return;

    const existingBadges = contentContainer.querySelectorAll(
      ".msg-reactions-summary",
    );
    existingBadges.forEach((badge) => badge.remove());

    const isRecalled =
      (bubble.dataset?.isRecalled || "").toString().toLowerCase() === "true";
    if (isRecalled || reactionData.totalReacts <= 0) return;

    const reactionBadgeHtml = this.renderMessageReactionBadge(
      {
        reacts: reactionData.reacts,
        reactedBy: reactionData.reactedBy,
      },
      messageId,
    );
    if (!reactionBadgeHtml) return;

    contentContainer.insertAdjacentHTML("beforeend", reactionBadgeHtml);

    // After insertion, check if badge overflows the container and toggle class
    requestAnimationFrame(() =>
      this.syncReactionBadgeOverflow(contentContainer),
    );
  },

  /**
   * Check if a reaction badge inside a container is wider than the container.
   * If so, add msg-reactions-overflow class to flip the anchor edge.
   * @param {HTMLElement} contentContainer - The .msg-content-container element
   */
  syncReactionBadgeOverflow(contentContainer, fromRetry = false) {
    if (!contentContainer) return;
    const badge = contentContainer.querySelector(".msg-reactions-summary");
    if (!badge) return;

    this.bindReactionBadgeMediaSync(contentContainer);
    const anchor = this.ensureReactionBadgeAnchor(contentContainer, badge);
    if (!anchor) return;

    const positioned = this.positionReactionBadge(
      contentContainer,
      badge,
      anchor,
    );
    if (positioned) {
      contentContainer.dataset.reactSyncRetry = "0";
      return;
    }

    if (!fromRetry) {
      contentContainer.dataset.reactSyncRetry = "0";
    }
    this.queueReactionBadgeResync(contentContainer);
  },

  /**
   * Batch sync all reaction badge overflow states inside a container.
   * Call this after rendering a batch of messages (initial load, prepend, etc.)
   * @param {HTMLElement} container - Parent container holding message bubbles
   */
  syncAllReactionBadgeOverflows(container) {
    if (!container) return;
    const badges = container.querySelectorAll(".msg-reactions-summary");
    if (!badges.length) return;
    requestAnimationFrame(() => {
      badges.forEach((badge) => {
        const cc = badge.closest(".msg-content-container");
        if (!cc) return;
        const anchor = this.ensureReactionBadgeAnchor(cc, badge);
        if (!anchor) return;
        this.positionReactionBadge(cc, badge, anchor);
      });
    });
  },

  /**
   * Normalize message object to have consistent property names and casing.
   */
  normalizeMessage(m, myId) {
    if (!m) return null;

    // IDs
    if (!m.messageId && m.MessageId)
      m.messageId = m.MessageId.toString().toLowerCase();
    if (m.messageId) m.messageId = m.messageId.toString().toLowerCase();

    // Timestamps
    if (!m.sentAt && m.SentAt) m.sentAt = m.SentAt;

    // Content
    if (
      (m.content === undefined || m.content === null) &&
      m.Content !== undefined
    ) {
      m.content = m.Content;
    }

    // Medias
    const rawMedias = m.medias || m.Medias;
    if (Array.isArray(rawMedias)) {
      m.medias = rawMedias.map((item) => ({
        messageMediaId: (item.messageMediaId || item.MessageMediaId || "")
          .toString()
          .toLowerCase(),
        mediaUrl: item.mediaUrl || item.MediaUrl || "",
        mediaType:
          item.mediaType !== undefined
            ? item.mediaType
            : item.MediaType !== undefined
              ? item.MediaType
              : 0,
        thumbnailUrl: item.thumbnailUrl || item.ThumbnailUrl || null,
        fileName: item.fileName || item.FileName || "",
        fileSize: item.fileSize || item.FileSize || 0,
      }));
    } else {
      m.medias = [];
    }

    m.reacts = this.normalizeMessageReactSummaries(m.reacts || m.Reacts);
    m.reactedBy = this.normalizeMessageReactedBy(m.reactedBy || m.ReactedBy);
    if (m.reacts.length === 0 && m.reactedBy.length > 0) {
      m.reacts = this.buildReactSummariesFromReactedBy(m.reactedBy);
    }

    // Message type / system payload
    const messageType = this.getMessageType(m);
    if (
      messageType !== null &&
      messageType !== undefined &&
      messageType !== ""
    ) {
      m.messageType = messageType;
    }
    const recalledRaw =
      m.isRecalled !== undefined ? m.isRecalled : m.IsRecalled;
    if (typeof recalledRaw === "boolean") {
      m.isRecalled = recalledRaw;
    } else if (typeof recalledRaw === "string") {
      m.isRecalled = recalledRaw.toLowerCase() === "true";
    } else {
      m.isRecalled = !!recalledRaw;
    }
    const pinnedRaw = m.isPinned !== undefined ? m.isPinned : m.IsPinned;
    if (typeof pinnedRaw === "boolean") {
      m.isPinned = pinnedRaw;
    } else if (typeof pinnedRaw === "string") {
      m.isPinned = pinnedRaw.toLowerCase() === "true";
    } else {
      m.isPinned = !!pinnedRaw;
    }
    const reactRaw =
      m.currentUserReactType !== undefined
        ? m.currentUserReactType
        : m.CurrentUserReactType;
    if (reactRaw === null || reactRaw === undefined || reactRaw === "") {
      m.currentUserReactType = null;
    } else {
      m.currentUserReactType = this.parseReactType(reactRaw);
    }
    if (m.currentUserReactType === null && myId && Array.isArray(m.reactedBy)) {
      const currentReact = m.reactedBy.find(
        (r) => r.accountId === myId.toLowerCase(),
      );
      m.currentUserReactType = currentReact
        ? this.parseReactType(currentReact.reactType)
        : null;
    }
    if (!m.systemMessageDataJson && m.SystemMessageDataJson) {
      m.systemMessageDataJson = m.SystemMessageDataJson;
    }

    // Sender/Ownership
    const senderId = (
      m.sender?.accountId ||
      m.sender?.AccountId ||
      m.Sender?.accountId ||
      m.Sender?.AccountId ||
      m.SenderId ||
      m.senderId ||
      ""
    )
      .toString()
      .toLowerCase();
    if (myId && typeof m.isOwn !== "boolean") {
      m.isOwn = senderId === myId.toLowerCase();
    }

    // Ensure sender object exists with at least accountId
    if (!m.sender && m.Sender) {
      m.sender = {
        accountId: senderId,
        username: m.Sender.username || m.Sender.Username || "",
        fullName: m.Sender.fullName || m.Sender.FullName || "",
        nickname: this.normalizeNickname(
          m.Sender.nickname ?? m.Sender.Nickname ?? null,
        ),
        avatarUrl: m.Sender.avatarUrl || m.Sender.AvatarUrl || "",
      };
    } else if (!m.sender) {
      m.sender = { accountId: senderId };
    } else {
      if (!m.sender.accountId && m.sender.AccountId) {
        m.sender.accountId = m.sender.AccountId.toString().toLowerCase();
      } else if (m.sender.accountId) {
        m.sender.accountId = m.sender.accountId.toString().toLowerCase();
      } else if (senderId) {
        m.sender.accountId = senderId;
      }
      // Normalize sender fields to camelCase
      if (!m.sender.username && m.sender.Username)
        m.sender.username = m.sender.Username;
      if (!m.sender.fullName && m.sender.FullName)
        m.sender.fullName = m.sender.FullName;
      if (m.sender.nickname === undefined)
        m.sender.nickname = this.normalizeNickname(m.sender.Nickname ?? null);
      if (!m.sender.avatarUrl && m.sender.AvatarUrl)
        m.sender.avatarUrl = m.sender.AvatarUrl;
    }

    if (!m.senderId && senderId) {
      m.senderId = senderId;
    }

    // Reply-to info
    const rawReplyTo = m.replyTo || m.ReplyTo || null;
    if (rawReplyTo && typeof rawReplyTo === "object") {
      const rawReplySender = rawReplyTo.sender || rawReplyTo.Sender || null;
      const replySenderId = (
        rawReplyTo.replySenderId ||
        rawReplyTo.ReplySenderId ||
        rawReplySender?.accountId ||
        rawReplySender?.AccountId ||
        ""
      )
        .toString()
        .toLowerCase();
      m.replyTo = {
        messageId: (rawReplyTo.messageId || rawReplyTo.MessageId || "")
          .toString()
          .toLowerCase(),
        content: rawReplyTo.content ?? rawReplyTo.Content ?? null,
        isRecalled: !!(rawReplyTo.isRecalled ?? rawReplyTo.IsRecalled),
        isHidden: !!(rawReplyTo.isHidden ?? rawReplyTo.IsHidden),
        messageType: rawReplyTo.messageType ?? rawReplyTo.MessageType ?? 0,
        replySenderId,
        sender: rawReplySender
          ? {
              accountId: (
                rawReplySender?.accountId ||
                rawReplySender?.AccountId ||
                replySenderId ||
                ""
              )
                .toString()
                .toLowerCase(),
              username:
                rawReplySender?.username || rawReplySender?.Username || "",
              displayName:
                rawReplySender?.displayName ||
                rawReplySender?.DisplayName ||
                "",
            }
          : null,
      };
    } else {
      m.replyTo = null;
    }

    return m;
  },

  getMediaTypeLabel(mediaType) {
    const normalized = Number(mediaType);
    if (normalized === 1) return "[Video]";
    if (normalized === 3) return "[File]";
    return "[Image]";
  },

  formatAttachmentSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const display =
      size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
    return `${display} ${units[unitIndex]}`;
  },

  buildPostDetailPath(postCode) {
    const normalizedPostCode = (postCode || "").toString().trim();
    if (!normalizedPostCode) return "/posts";
    if (window.RouteHelper?.buildPostDetailPath) {
      return window.RouteHelper.buildPostDetailPath(normalizedPostCode);
    }
    return `/posts/${encodeURIComponent(normalizedPostCode)}`;
  },

  openPostShareTarget(postCode, postId = "") {
    const normalizedPostCode = (postCode || "").toString().trim();
    const normalizedPostId = (postId || "").toString().trim();

    if (!normalizedPostCode && normalizedPostId) {
      if (typeof window.openPostDetail === "function") {
        window.openPostDetail(normalizedPostId, "");
      }
      return;
    }
    if (!normalizedPostCode) return;

    if (typeof window.openPostDetailByCode === "function") {
      window.openPostDetailByCode(normalizedPostCode);
      return;
    }

    const path = this.buildPostDetailPath(normalizedPostCode);
    if (window.RouteHelper?.goTo) {
      window.RouteHelper.goTo(path);
      return;
    }

    if (window.RouteHelper?.buildHash) {
      window.location.hash = window.RouteHelper.buildHash(path);
      return;
    }

    window.location.hash = `#${path}`;
  },

  handlePostSharePreviewClick(el) {
    const postCode = (el?.dataset?.postCode || "").toString().trim();
    const postId = (el?.dataset?.postId || "").toString().trim();
    if (!postCode && !postId) return;
    this.openPostShareTarget(postCode, postId);
  },

  toSafeText(value) {
    if (value === null || value === undefined) return "";
    try {
      return String(value);
    } catch (_) {
      return "";
    }
  },

  truncateTextSafe(value, maxChars) {
    const normalized = this.toSafeText(value).trim();
    if (!normalized) return "";
    const max = Number(maxChars);
    if (!Number.isFinite(max) || max <= 0) return "";
    const chars = Array.from(normalized);
    if (chars.length <= max) return normalized;
    return `${chars.slice(0, Math.max(1, max - 1)).join("")}\u2026`;
  },

  normalizePostShareInfo(rawInfo) {
    const info =
      rawInfo && typeof rawInfo === "object"
        ? rawInfo
        : rawInfo === null || rawInfo === undefined
          ? null
          : {};
    if (!info) return null;

    const parseBoolean = (value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string")
        return value.trim().toLowerCase() === "true";
      return !!value;
    };

    const parseNullableNumber = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const postId = (info.postId ?? info.PostId ?? "").toString().trim();
    const postCode = (info.postCode ?? info.PostCode ?? "").toString().trim();
    const ownerUsername = (info.ownerUsername ?? info.OwnerUsername ?? "")
      .toString()
      .trim();
    const ownerDisplayName = (
      info.ownerDisplayName ??
      info.OwnerDisplayName ??
      ""
    )
      .toString()
      .trim();
    const thumbnailUrl = (info.thumbnailUrl ?? info.ThumbnailUrl ?? "")
      .toString()
      .trim();
    const contentSnippet = (info.contentSnippet ?? info.ContentSnippet ?? "")
      .toString()
      .trim();

    const thumbnailMediaType = parseNullableNumber(
      info.thumbnailMediaType ?? info.ThumbnailMediaType,
    );
    const isPostUnavailable = parseBoolean(
      info.isPostUnavailable ?? info.IsPostUnavailable,
    );

    return {
      postCode,
      postId,
      ownerUsername,
      ownerDisplayName,
      thumbnailUrl,
      thumbnailMediaType,
      contentSnippet,
      isPostUnavailable,
    };
  },

  renderPostSharePreview(msg) {
    const info = this.normalizePostShareInfo(
      msg?.postShareInfo || msg?.PostShareInfo,
    );
    if (!info) return "";

    const safeOwnerUsername = this.truncateTextSafe(info.ownerUsername, 40);
    const safeOwnerDisplayName = this.truncateTextSafe(
      info.ownerDisplayName,
      52,
    );
    const safeSnippet = this.truncateTextSafe(info.contentSnippet, 140);
    const ownerPrimary = safeOwnerUsername
      ? `@${safeOwnerUsername}`
      : safeOwnerDisplayName || this.t("chat.post_share.post", "Post");
    const canOpenPost =
      !info.isPostUnavailable && (!!info.postCode || !!info.postId);
    const rootAttrs = canOpenPost
      ? ` data-post-code="${escapeHtml(info.postCode)}" data-post-id="${escapeHtml(info.postId)}" onclick="ChatCommon.handlePostSharePreviewClick(this)" style="cursor: pointer;"`
      : "";

    let thumbHtml = `<div class="msg-post-share-thumb-placeholder"><i data-lucide="image"></i></div>`;
    if (info.isPostUnavailable) {
      thumbHtml = `<div class="msg-post-share-thumb-placeholder msg-post-share-thumb-placeholder-unavailable"><i data-lucide="image-off"></i></div>`;
    } else if (info.thumbnailUrl) {
      if (info.thumbnailMediaType === 1) {
        thumbHtml = `<video src="${escapeHtml(info.thumbnailUrl)}" muted playsinline preload="metadata"></video>
          <div class="msg-post-share-thumb-play"><i data-lucide="play"></i></div>`;
      } else {
        thumbHtml = `<img src="${escapeHtml(info.thumbnailUrl)}" alt="${this.escapeAttribute(this.t("chat.post_share.thumbnail_alt", "Post thumbnail"))}" loading="lazy">`;
      }
    }

    const statusText = info.isPostUnavailable
      ? this.t("chat.post_share.unavailable", "Post is no longer available")
      : this.t("chat.post_share.tap_to_view", "Tap to view post");
    const snippetHtml = safeSnippet
      ? `<div class="msg-post-share-snippet">${escapeHtml(safeSnippet)}</div>`
      : "";

    return `
      <div class="msg-post-share-preview ${info.isPostUnavailable ? "msg-post-share-unavailable" : ""}"${rootAttrs}>
        <div class="msg-post-share-label"><i data-lucide="send"></i> ${escapeHtml(this.t("chat.post_share.shared", "Shared a post"))}</div>
        <div class="msg-post-share-card">
          <div class="msg-post-share-thumb">
            ${thumbHtml}
          </div>
          <div class="msg-post-share-meta">
            <div class="msg-post-share-owner">${escapeHtml(ownerPrimary)}</div>
            ${snippetHtml}
            <div class="msg-post-share-status">${escapeHtml(statusText)}</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Normalize text for comparison by stripping whitespace and standardizing newlines.
   */
  normalizeContent(text) {
    if (!text) return "";
    return text
      .trim()
      .replace(/\r\n/g, "\n") // Standardize newlines
      .replace(/\s+/g, " "); // Collapse all whitespace (including newlines) to a single space for maximum robustness
  },

  /**
   * Determine grouping position for a message within a consecutive group.
   * Returns: 'single' | 'first' | 'middle' | 'last'
   *
   * @param {Object} msg - Current message
   * @param {Object|null} prevMsg - Previous message (above in display order)
   * @param {Object|null} nextMsg - Next message (below in display order)
   */
  getGroupPosition(msg, prevMsg, nextMsg) {
    if (this.isSystemMessage(msg)) {
      return "single";
    }

    const msgId = msg.sender?.accountId;
    const prevId = prevMsg?.sender?.accountId;
    const nextId = nextMsg?.sender?.accountId;
    const prevIsSystem = this.isSystemMessage(prevMsg);
    const nextIsSystem = this.isSystemMessage(nextMsg);

    const sameSenderAsPrev = prevMsg && !prevIsSystem && prevId === msgId;
    const sameSenderAsNext = nextMsg && !nextIsSystem && nextId === msgId;

    // Also break grouping if time gap > configured threshold (default 2 mins)
    const gap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
    const diffPrev = prevMsg
      ? new Date(msg.sentAt) - new Date(prevMsg.sentAt)
      : Number.POSITIVE_INFINITY;
    const diffNext = nextMsg
      ? new Date(nextMsg.sentAt) - new Date(msg.sentAt)
      : Number.POSITIVE_INFINITY;
    const closeTimePrev =
      prevMsg &&
      !prevIsSystem &&
      Number.isFinite(diffPrev) &&
      diffPrev >= 0 &&
      diffPrev < gap;
    const closeTimeNext =
      nextMsg &&
      !nextIsSystem &&
      Number.isFinite(diffNext) &&
      diffNext >= 0 &&
      diffNext < gap;

    const groupedWithPrev = sameSenderAsPrev && closeTimePrev;
    const groupedWithNext = sameSenderAsNext && closeTimeNext;

    if (groupedWithPrev && groupedWithNext) return "middle";
    if (groupedWithPrev && !groupedWithNext) return "last";
    if (!groupedWithPrev && groupedWithNext) return "first";
    return "single";
  },

  /**
   * Generate HTML for a message bubble with grouping, avatar, and author name support.
   *
   * @param {Object} msg - Message object (must have .isOwn set)
   * @param {Object} options
   * @param {boolean} options.isGroup - Is this a group conversation?
   * @param {string}  options.groupPos - 'single' | 'first' | 'middle' | 'last'
   * @param {string}  options.senderAvatar - Avatar URL (for 1:1 received messages)
   * @param {string}  options.authorName - Display name (for group received messages)
   */
  renderMessageBubble(msg, options = {}) {
    const {
      isGroup = false,
      groupPos = "single",
      senderAvatar = "",
      authorName = "",
    } = options;

    const isOwn = msg.isOwn;
    const isReceived = !isOwn;
    const wrapperClass = isOwn ? "sent" : "received";
    const rawMessageId = msg.messageId || msg.MessageId || "";
    const messageId = rawMessageId ? rawMessageId.toString().toLowerCase() : "";
    const messageType = this.getMessageType(msg);
    const isSystemMessage = this.isSystemMessage(msg);
    const isRecalled = !!(msg.isRecalled ?? msg.IsRecalled);
    const isPinnedRaw = !!(msg.isPinned ?? msg.IsPinned);
    const isPinned = isPinnedRaw && !isRecalled;
    const reactionData = this.getMessageReactionData(msg);
    const currentReactRaw =
      msg.currentUserReactType !== undefined
        ? msg.currentUserReactType
        : msg.CurrentUserReactType;
    const parsedCurrentReact = this.parseReactType(currentReactRaw);
    const hasCurrentReact = parsedCurrentReact !== null;
    const currentReactType = hasCurrentReact ? parsedCurrentReact : null;
    const safeReactsJson = JSON.stringify(reactionData.reacts || []).replace(
      /"/g,
      "&quot;",
    );
    const safeReactedByJson = JSON.stringify(
      reactionData.reactedBy || [],
    ).replace(/"/g, "&quot;");
    const reactionBadgeHtml = !isRecalled
      ? this.renderMessageReactionBadge(
          {
            reacts: reactionData.reacts,
            reactedBy: reactionData.reactedBy,
          },
          messageId,
        )
      : "";
    const recalledText =
      window.I18n?.translateServerText &&
      window.APP_CONFIG?.CHAT_RECALLED_MESSAGE_TEXT
        ? window.I18n.translateServerText(
            window.APP_CONFIG.CHAT_RECALLED_MESSAGE_TEXT,
            {},
            this.t("chat.message.recalled", "Message was recalled"),
          )
        : this.t("chat.message.recalled", "Message was recalled");

    const dataMessageIdAttr = messageId
      ? ` data-message-id="${messageId}"`
      : "";
    const dataMessageTypeAttr =
      messageType !== null && messageType !== undefined && messageType !== ""
        ? ` data-message-type="${String(messageType).replace(/"/g, "&quot;")}"`
        : "";

    if (isSystemMessage) {
      const senderId = msg.sender?.accountId || msg.senderId || "";
      const systemText = this.getSystemMessageText(msg);
      const rawSystemContent = msg?.content ?? msg?.Content ?? "";
      const rawSystemData =
        msg?.systemMessageDataJson ?? msg?.SystemMessageDataJson ?? "";
      return `
                <div class="msg-bubble-wrapper msg-system msg-group-single"
                     data-sent-at="${msg.sentAt || ""}"
                     data-sender-id="${senderId}"
                     data-message-type="system"
                     data-system-content="${this.escapeAttribute(rawSystemContent)}"
                     data-system-message-data="${this.escapeAttribute(rawSystemData)}"
                     ${dataMessageIdAttr}>
                    <div class="msg-system-text">${linkify(escapeHtml(systemText))}</div>
                </div>
            `;
    }

    // --- Media ---
    const allMedias = Array.isArray(msg.medias) ? msg.medias : [];
    const indexedMedias = allMedias.map((media, index) => ({
      media,
      index,
      mediaType: Number(media?.mediaType ?? media?.MediaType ?? 0),
    }));
    const visualMedias = indexedMedias.filter(
      (item) => item.mediaType === 0 || item.mediaType === 1,
    );
    const documentMedias = indexedMedias.filter((item) => item.mediaType === 3);

    const hasAnyMedia = visualMedias.length > 0 || documentMedias.length > 0;
    const shouldPinOnMedia = isPinned && !isRecalled && hasAnyMedia;
    const pinHostType = shouldPinOnMedia
      ? visualMedias.length > 0
        ? "visual"
        : documentMedias.length > 0
          ? "file"
          : "none"
      : "none";

    let mediaHtml = "";
    if (!isRecalled && visualMedias.length > 0) {
      const displayMedias = visualMedias.slice(0, 4);
      const remainingCount = visualMedias.length - 4;
      const gridClass = `count-${Math.min(visualMedias.length, 4)}`;
      const mediaListJson = JSON.stringify(
        visualMedias.map((item) => item.media),
      ).replace(/"/g, "&quot;");
      const pinBadgeHtml =
        pinHostType === "visual"
          ? `<div class="msg-pinned-badge msg-pinned-badge-media-anchor" title="${this.escapeAttribute(this.t("chat.message.pinned", "Pinned message"))}"><i data-lucide="pin"></i></div>`
          : "";

      mediaHtml += `
                <div class="msg-media-anchor">
                    ${pinBadgeHtml}
                    <div class="msg-media-grid ${gridClass}" data-medias="${mediaListJson}">
                        ${displayMedias
                          .map((entry, idx) => {
                            const m = entry.media || {};
                            const isLast = idx === 3 && remainingCount > 0;
                            const safeMediaUrl = (m.mediaUrl || "").replace(
                              /"/g,
                              "&quot;",
                            );
                            let inner = "";
                            let onclickStr = "";
                            let dblclickStr = `ondblclick="ChatCommon.previewGridMedia(this, ${idx}, event)"`;

                            if (entry.mediaType === 0) {
                              inner = `<img src="${safeMediaUrl}" alt="${this.escapeAttribute(this.t("chat.message.media_alt", "media"))}" loading="lazy">`;
                              onclickStr = `onclick="ChatCommon.previewGridMedia(this, ${idx}, event)"`;
                              dblclickStr = "";
                            } else {
                              inner = `
                                <div class="msg-video-container">
                                    <video src="${safeMediaUrl}" loop muted playsinline></video>
                                    <div class="msg-video-overlay" onclick="ChatCommon.toggleChatVideo(event, this)">
                                        <div class="play-button-wrapper">
                                            <i data-lucide="play" class="play-icon"></i>
                                        </div>
                                    </div>
                                </div>
                            `;
                            }

                            return `
                            <div class="msg-media-item" data-media-index="${entry.index}" ${onclickStr} ${dblclickStr}>
                                ${inner}
                                ${isLast ? `<div class="msg-media-more-overlay" onclick="event.stopPropagation(); ChatCommon.previewGridMedia(this, 3, event)">+${remainingCount}</div>` : ""}
                            </div>
                        `;
                          })
                          .join("")}
                    </div>
                </div>
            `;
    }

    if (!isRecalled && documentMedias.length > 0) {
      const pinBadgeHtml =
        pinHostType === "file"
          ? `<div class="msg-pinned-badge msg-pinned-badge-media-anchor" title="${this.escapeAttribute(this.t("chat.message.pinned", "Pinned message"))}"><i data-lucide="pin"></i></div>`
          : "";

      mediaHtml += `
                <div class="msg-file-anchor">
                    ${pinBadgeHtml}
                    <div class="msg-file-list">
                        ${documentMedias
                          .map((entry) => {
                            const m = entry.media || {};
                            const mediaUrl = (m.mediaUrl || "").toString();
                            const safeMediaUrl = mediaUrl.replace(
                              /"/g,
                              "&quot;",
                            );
                            const mediaId = (
                              m.messageMediaId ||
                              m.MessageMediaId ||
                              ""
                            )
                              .toString()
                              .toLowerCase();
                            const safeMediaId = mediaId.replace(/"/g, "&quot;");
                            const rawFileName = (
                              m.fileName ||
                              m.FileName ||
                              mediaUrl.split("/").pop()?.split("?")[0] ||
                              `File ${entry.index + 1}`
                            ).toString();
                            const safeFileName = escapeHtml(rawFileName);
                            const safeDownloadName = rawFileName.replace(
                              /"/g,
                              "&quot;",
                            );
                            const sizeText = this.formatAttachmentSize(
                              m.fileSize || m.FileSize,
                            );
                            const safeSize = escapeHtml(sizeText || "File");
                            const defaultFileLabel = escapeHtml(
                              this.t("chat.message.file", "File"),
                            );

                            return `
                            <div class="msg-file-item" data-media-index="${entry.index}">
                                <a class="msg-file-link" href="${safeMediaUrl}" download="${safeDownloadName}" data-message-media-id="${safeMediaId}" onclick="return ChatCommon.handleFileLinkClick(event, this)">
                                    <span class="msg-file-icon"><i data-lucide="file-text"></i></span>
                                    <span class="msg-file-meta">
                                        <span class="msg-file-name" title="${safeFileName}">${safeFileName}</span>
                                        <span class="msg-file-size">${safeSize || defaultFileLabel}</span>
                                    </span>
                                </a>
                            </div>
                        `;
                          })
                          .join("")}
                    </div>
                </div>
            `;
    }

    // --- Author name (Group chat only, received only, first or single in group) ---
    const senderId = msg.sender?.accountId || msg.senderId || "";
    const senderUsername = msg.sender?.username || msg.sender?.Username || "";
    const showAuthor =
      isGroup && isReceived && (groupPos === "first" || groupPos === "single");
    const authorHtml =
      showAuthor && authorName
        ? `<div class="msg-author">${escapeHtml(authorName)}</div>`
        : "";

    // --- Avatar (Received messages only) ---
    // Show avatar on 'last' or 'single' position (bottom of group) like Messenger
    const showAvatar =
      isReceived && (groupPos === "last" || groupPos === "single");

    let avatarSrc =
      senderAvatar ||
      msg.sender?.avatarUrl ||
      msg.sender?.AvatarUrl ||
      APP_CONFIG.DEFAULT_AVATAR;
    const avatarHtml = isReceived
      ? `<div class="msg-avatar ${showAvatar ? "" : "msg-avatar-spacer"}">
                ${showAvatar ? `<img src="${avatarSrc}" alt="" onclick="window.ChatCommon.goToProfile('${senderId}', '${senderUsername}')" style="cursor: pointer;" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">` : ""}
               </div>`
      : "";

    // --- Build Actions (Messenger Style) ---
    const isPage = !!options.isPage;
    const isWindow = !!options.isWindow;
    const showReactAction = !!(isPage || isWindow);
    const pinnedBadgeHtml = isPinned
      ? `<div class="msg-pinned-badge" title="${this.escapeAttribute(this.t("chat.message.pinned", "Pinned message"))}"><i data-lucide="pin"></i></div>`
      : "";
    const pinnedInlineBadgeHtml = shouldPinOnMedia ? "" : pinnedBadgeHtml;
    const msgActionsHtml = `
            <div class="msg-actions">
                ${
                  showReactAction && !isRecalled
                    ? `
                    <button class="msg-action-btn react${hasCurrentReact ? " is-reacted" : ""}" title="${this.escapeAttribute(this.t("chat.message.actions.react", "React"))}" data-action="react" data-react-type="${hasCurrentReact ? currentReactType : ""}" onclick="var mid=this.closest('.msg-bubble-wrapper')?.dataset?.messageId||''; if(mid) window.ChatActions && ChatActions.openReactMenu(event, mid)">
                        <i data-lucide="smile"></i>
                    </button>
                `
                    : ""
                }
                ${
                  (isPage || isWindow) && !isRecalled
                    ? `
                    <button class="msg-action-btn" title="${this.escapeAttribute(this.t("chat.message.actions.reply", "Reply"))}" onclick="var mid=this.closest('.msg-bubble-wrapper')?.dataset?.messageId||''; if(mid) window.ChatActions && ChatActions.replyTo(mid)">
                        <i data-lucide="reply"></i>
                    </button>
                `
                    : ""
                }
                <button class="msg-action-btn more" title="${this.escapeAttribute(this.t("chat.message.actions.more", "More"))}" onclick="var mid=this.closest('.msg-bubble-wrapper')?.dataset?.messageId||''; if(mid) window.ChatActions && ChatActions.openMoreMenu(event, mid, ${isOwn})">
                    <i data-lucide="more-horizontal"></i>
                </button>
            </div>
        `;

    // --- Build HTML ---
    const seenRowHtml = isOwn
      ? `<div class="msg-seen-row"${messageId ? ` id="seen-row-${messageId}"` : ""}></div>`
      : "";
    const senderDisplayName = this.getPreferredSenderName(
      msg.sender,
      authorName || "",
    );

    return `
            <div class="msg-bubble-wrapper ${wrapperClass} msg-group-${groupPos}" 
                 data-sent-at="${msg.sentAt || ""}" 
                 data-sender-id="${msg.sender?.accountId || msg.senderId || ""}"
                 data-avatar-url="${avatarSrc}"
                 data-author-name="${(authorName || "").replace(/"/g, "&quot;")}"
                 data-sender-name="${(senderDisplayName || "").replace(/"/g, "&quot;")}"
                 data-is-recalled="${isRecalled ? "true" : "false"}"
                 data-is-pinned="${isPinned ? "true" : "false"}"
                 data-current-react-type="${hasCurrentReact ? currentReactType : ""}"
                 data-reacts="${safeReactsJson}"
                 data-reacted-by="${safeReactedByJson}"
                 data-total-reacts="${reactionData.totalReacts}"
                 ${dataMessageIdAttr}
                 ${dataMessageTypeAttr}
                 ${msg.status ? `data-status="${msg.status}"` : ""}>
                ${authorHtml}
                <div class="msg-row">
                    ${avatarHtml}
                    <div class="msg-content-container">
                        ${pinnedInlineBadgeHtml}
                        ${(() => {
                          if (!msg.replyTo) return "";
                          const rt = msg.replyTo;
                          const currentAccountId = (
                            localStorage.getItem("accountId") ||
                            sessionStorage.getItem("accountId") ||
                            window.APP_CONFIG?.CURRENT_USER_ID ||
                            ""
                          )
                            .toString()
                            .toLowerCase();
                          const rtSenderId = (
                            rt.replySenderId ||
                            rt.sender?.accountId ||
                            ""
                          )
                            .toString()
                            .toLowerCase();
                          const isOwnReplyAuthor = !!(
                            rtSenderId &&
                            currentAccountId &&
                            rtSenderId === currentAccountId
                          );
                          const rtSenderBase =
                            rt.sender?.username || this.getUnknownUserLabel();
                          const rtSenderName = isOwnReplyAuthor
                            ? this.getYouLabel()
                            : rt.sender?.displayName ||
                              rtSenderBase ||
                              this.getUnknownUserLabel();
                          const isReplyHiddenByCurrentUser = !!(
                            window.ChatActions &&
                            typeof window.ChatActions
                              .isMessageHiddenForCurrentUser === "function" &&
                            window.ChatActions.isMessageHiddenForCurrentUser(
                              rt.messageId,
                            )
                          );
                          const isHiddenReplyParent =
                            !!rt.isHidden || isReplyHiddenByCurrentUser;
                          let rtPreview = "";
                          if (isHiddenReplyParent) {
                            rtPreview = `<em>${escapeHtml(
                              window.I18n?.translateServerText &&
                                window.APP_CONFIG?.CHAT_HIDDEN_MESSAGE_TEXT
                                ? window.I18n.translateServerText(
                                    window.APP_CONFIG.CHAT_HIDDEN_MESSAGE_TEXT,
                                    {},
                                    this.t(
                                      "chat.message.hidden",
                                      "Message hidden",
                                    ),
                                  )
                                : this.t(
                                    "chat.message.hidden",
                                    "Message hidden",
                                  ),
                            )}</em>`;
                          } else if (rt.isRecalled) {
                            rtPreview = `<em>${escapeHtml(
                              this.t(
                                "chat.message.recalled",
                                "Message was recalled",
                              ),
                            )}</em>`;
                          } else if (rt.content) {
                            const maxLen = 60;
                            const replyPreviewText =
                              this.normalizeMessageContentForPreview(
                                rt.content,
                              );
                            const trimmed =
                              replyPreviewText.length > maxLen
                                ? replyPreviewText.substring(0, maxLen) + "..."
                                : replyPreviewText;
                            rtPreview = escapeHtml(trimmed);
                          } else {
                            const replyMessageType = this.getMessageType(rt);
                            rtPreview =
                              replyMessageType === 5
                                ? `<em>${escapeHtml(
                                    this.t(
                                      "chat.preview.shared_post",
                                      "Shared a post",
                                    ),
                                  )}</em>`
                                : `<em>${escapeHtml(
                                    this.t(
                                      "chat.preview.media.generic",
                                      "Media",
                                    ),
                                  )}</em>`;
                          }
                          return `<div class="msg-reply-preview"
                                data-reply-id="${rt.messageId}"
                                data-reply-sender-id="${escapeHtml(rtSenderId)}"
                                data-reply-sender-base="${escapeHtml(rtSenderBase || this.getUnknownUserLabel())}"
                                data-reply-is-own="${isOwnReplyAuthor ? "true" : "false"}"
                                data-reply-parent-hidden="${isHiddenReplyParent ? "true" : "false"}"
                                data-reply-parent-recalled="${rt.isRecalled ? "true" : "false"}"
                                onclick="window.ChatActions && ChatActions.handleReplyClick(this, '${rt.messageId}')">
                                <div class="msg-reply-author">${escapeHtml(rtSenderName)}</div>
                                <div class="msg-reply-text">${rtPreview}</div>
                            </div>`;
                        })()}
                        ${(() => {
                          const textBubbleHtml =
                            isRecalled || msg.content
                              ? `<div class="msg-bubble${isRecalled ? " msg-bubble-recalled" : ""}">${isRecalled ? escapeHtml(recalledText) : this.renderMessageRichContent(msg.content)}</div>`
                              : "";

                          // --- Post Share Preview ---
                          if (!isRecalled && messageType === 5) {
                            return `${textBubbleHtml}${this.renderPostSharePreview(msg)}`;
                          }

                          // --- Story Reply Preview ---
                          if (!isRecalled && messageType === 4) {
                            const sri =
                              msg.storyReplyInfo || msg.StoryReplyInfo;
                            if (!sri || sri.isStoryExpired) {
                              return `${textBubbleHtml}<div class="msg-story-reply-preview msg-story-reply-expired">
                                <div class="msg-story-reply-expired-icon"><i data-lucide="image-off"></i></div>
                                <span>${escapeHtml(this.t("chat.story_reply.unavailable", "Story is no longer available"))}</span>
                              </div>`;
                            }
                            if (sri) {
                              const ct = Number(sri.contentType ?? 0);
                              let thumbHtml = "";
                              if (ct === 2) {
                                const bgKeyRaw = (
                                  sri.backgroundColorKey ||
                                  sri.BackgroundColorKey ||
                                  "accent"
                                ).toLowerCase();
                                const txtColorKeyRaw = (
                                  sri.textColorKey ||
                                  sri.TextColorKey ||
                                  "light"
                                ).toLowerCase();
                                const fontKeyRaw = (
                                  sri.fontTextKey ||
                                  sri.FontTextKey ||
                                  "modern"
                                ).toLowerCase();
                                const fontSizeRaw = parseInt(
                                  sri.fontSizeKey || sri.FontSizeKey || "32",
                                  10,
                                );

                                const thumbFontSizePx = Math.round(
                                  fontSizeRaw * 0.38,
                                );

                                let bgCss =
                                  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
                                let colorCss = "#fff";
                                let fontCss = "inherit";

                                if (
                                  window.STORY_TEXT_EDITOR_CONFIG &&
                                  window.STORY_TEXT_EDITOR_CONFIG.options
                                ) {
                                  let opts =
                                    window.STORY_TEXT_EDITOR_CONFIG.options;

                                  const getIgnoreCase = (obj, key) => {
                                    if (!obj || !key) return null;
                                    const lk = key.toLowerCase();
                                    const foundKey = Object.keys(obj).find(
                                      (k) => k.toLowerCase() === lk,
                                    );
                                    return foundKey ? obj[foundKey] : null;
                                  };

                                  const getCssValue = (optsObj, keyRaw) => {
                                    const matched = getIgnoreCase(
                                      optsObj,
                                      keyRaw,
                                    );
                                    return matched ? matched.css : null;
                                  };

                                  const matchedBg = getCssValue(
                                    opts.backgrounds,
                                    bgKeyRaw,
                                  );
                                  if (matchedBg) {
                                    bgCss =
                                      ChatCommon.resolveStoryTextBackgroundCss(
                                        matchedBg,
                                      );
                                  }

                                  const matchedColor = getCssValue(
                                    opts.textColors,
                                    txtColorKeyRaw,
                                  );
                                  if (matchedColor) colorCss = matchedColor;

                                  const matchedFont = getCssValue(
                                    opts.fonts,
                                    fontKeyRaw,
                                  );
                                  if (matchedFont) fontCss = matchedFont;
                                }

                                const txt =
                                  sri.textContent || sri.TextContent || "";
                                const truncated =
                                  txt.length > 50
                                    ? txt.substring(0, 50) + "\u2026"
                                    : txt;
                                thumbHtml = `<div class="msg-story-reply-thumb msg-story-reply-text-thumb" style="background:${bgCss};color:${colorCss};font-family:${fontCss};font-size:${thumbFontSizePx}px;">
                                  <span>${escapeHtml(truncated)}</span>
                                </div>`;
                              } else if (ct === 1 && sri.mediaUrl) {
                                // Video story
                                thumbHtml = `<div class="msg-story-reply-thumb">
                                  <video src="${escapeHtml(sri.mediaUrl)}" muted></video>
                                  <div class="msg-story-reply-play"><i data-lucide="play"></i></div>
                                </div>`;
                              } else if (sri.mediaUrl) {
                                // Image story
                                thumbHtml = `<div class="msg-story-reply-thumb">
                                  <img src="${escapeHtml(sri.mediaUrl)}" alt="${this.escapeAttribute(this.t("chat.story_reply.story_alt", "Story"))}" loading="lazy">
                                </div>`;
                              }
                              return `${textBubbleHtml}<div class="msg-story-reply-preview" data-story-id="${escapeHtml(sri.storyId)}" onclick="if(window.openStoryViewerByStoryId) window.openStoryViewerByStoryId('${sri.storyId}')" style="cursor: pointer;">
                                <div class="msg-story-reply-label"><i data-lucide="reply"></i> ${escapeHtml(this.t("chat.story_reply.replied", "Replied to story"))}</div>
                                ${thumbHtml}
                              </div>`;
                            }
                          }
                          return textBubbleHtml;
                        })()}
                        ${mediaHtml}
                        ${reactionBadgeHtml}
                    </div>
                    <span class="msg-time-tooltip">${this.formatTime(msg.sentAt)}</span>
                    ${msgActionsHtml}
                </div>
                ${seenRowHtml}
                ${
                  msg.status
                    ? `
                    <div class="msg-status ${msg.status === "pending" ? "msg-status-sending" : msg.status === "sent" ? "msg-status-sent" : "msg-status-failed"}">
                        ${msg.status === "pending" ? '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>' : msg.status === "sent" ? escapeHtml(this.t("chat.message.status.sent", "Sent")) : escapeHtml(this.t("chat.message.status.failed_retry", "Send failed, tap to retry"))}
                    </div>
                `
                    : ""
                }
            </div>
        `;
  },

  /**
   * Preview media from a grid (reads JSON from data-medias attribute)
   */
  previewGridMedia(el, index, event) {
    if (event) event.stopPropagation();
    if (!el || typeof index !== "number") return;
    const grid = el.closest(".msg-media-grid");
    if (!grid) return;

    try {
      const raw = grid.dataset.medias;
      if (!raw) return;
      const messageWrapper = grid.closest(".msg-bubble-wrapper");
      const messageId = (messageWrapper?.dataset?.messageId || "")
        .toString()
        .toLowerCase();
      const container = grid.closest(
        '[id^="chat-messages-"], #chat-view-messages',
      );
      const containerId = (container?.id || "").toString();
      const conversationId = containerId.startsWith("chat-messages-")
        ? containerId.substring("chat-messages-".length).toLowerCase()
        : "";

      const medias = JSON.parse(raw);
      const enrichedMedias = Array.isArray(medias)
        ? medias.map((m) => ({
            ...m,
            messageId: (m?.messageId || m?.MessageId || messageId || "")
              .toString()
              .toLowerCase(),
          }))
        : [];
      if (window.previewMedia) {
        window.previewMedia("", index, enrichedMedias, {
          source: "message-media-grid",
          messageId,
          conversationId,
        });
      }
    } catch (e) {
      console.error("Failed to preview grid media:", e);
    }
  },

  handleFileLinkClick(event, linkEl) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const href = (linkEl?.getAttribute("href") || "").trim();
    if (!href) return false;

    const fileName = (linkEl?.getAttribute("download") || "").trim();
    this.downloadAttachmentFromLink(linkEl, href, fileName);
    return false;
  },

  async downloadAttachmentFromLink(linkEl, fallbackUrl, fileName = "") {
    const messageMediaId = (linkEl?.dataset?.messageMediaId || "")
      .trim()
      .toLowerCase();
    let downloadUrl = fallbackUrl;

    if (messageMediaId && window.API?.Messages?.getMediaDownloadUrl) {
      try {
        const res =
          await window.API.Messages.getMediaDownloadUrl(messageMediaId);
        if (res?.ok) {
          const payload = await res.json();
          const signedUrl = (payload?.url || payload?.Url || "")
            .toString()
            .trim();
          if (signedUrl) {
            downloadUrl = signedUrl;
          }
        } else if (window.toastError) {
          window.toastError(
            this.t(
              "errors.chat.download_link_unavailable",
              "Unable to get download link for this file.",
            ),
          );
        }
      } catch (error) {
        console.error("Failed to request download URL:", error);
        if (window.toastError) {
          window.toastError(
            this.t(
              "errors.chat.download_link_request_failed",
              "Failed to request file download link.",
            ),
          );
        }
      }
    }

    const success = await this.downloadAttachment(downloadUrl, fileName);
    if (!success && downloadUrl !== fallbackUrl) {
      await this.downloadAttachment(fallbackUrl, fileName);
    }
  },

  async downloadAttachment(url, fileName = "") {
    const targetUrl = (url || "").toString().trim();
    if (!targetUrl) return false;

    const fallbackName = targetUrl.split("/").pop()?.split("?")[0] || "file";
    const safeName = (fileName || fallbackName || "file").toString().trim();

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const fileBlob = await response.blob();
      if (!fileBlob || fileBlob.size <= 0) {
        throw new Error("Downloaded file is empty.");
      }

      const blobUrl = URL.createObjectURL(fileBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = safeName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);

      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        a.remove();
      }, 1000);
      return true;
    } catch (error) {
      console.error("File download failed:", error);
      if (window.toastError) {
        window.toastError(
          this.t(
            "errors.chat.download_failed",
            "Failed to start file download.",
          ),
        );
      }
      return false;
    }
  },

  /**
   * Toggle video play/pause in chat bubble
   */
  toggleChatVideo(e, overlay) {
    if (e) e.stopPropagation();
    const container = overlay.closest(".msg-video-container");
    const video = container.querySelector("video");
    const icon = overlay.querySelector("i");

    if (video.paused) {
      video.play();
      container.classList.add("playing");
      if (icon) icon.setAttribute("data-lucide", "pause");
    } else {
      video.pause();
      container.classList.remove("playing");
      if (icon) icon.setAttribute("data-lucide", "play");
    }

    if (window.lucide) lucide.createIcons();
  },

  /**
   * Format time for chat separators (e.g. "13:58", "13:58 Yesterday", "Feb 12, 10:35")
   */
  formatTime(dateVal) {
    if (!dateVal) return "";
    const date = new Date(dateVal);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const language = this.getCurrentLanguage();
    const formatTimeValue = (value) => {
      try {
        return new Intl.DateTimeFormat(language, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(value);
      } catch (_err) {
        const pad = (num) => num.toString().padStart(2, "0");
        return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
      }
    };
    const timeStr = formatTimeValue(date);

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return timeStr;
    if (isYesterday) {
      return this.t("chat.time.yesterday_with_time", "{time} Yesterday", {
        time: timeStr,
      });
    }

    const isSameYear = date.getFullYear() === now.getFullYear();
    const monthDay = (() => {
      try {
        return new Intl.DateTimeFormat(language, {
          month: "short",
          day: "numeric",
        }).format(date);
      } catch (_err) {
        return date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      }
    })();

    if (isSameYear) {
      return `${monthDay}, ${timeStr}`;
    }

    const fullDate = (() => {
      try {
        return new Intl.DateTimeFormat(language, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(date);
      } catch (_err) {
        return `${monthDay}, ${date.getFullYear()}`;
      }
    })();

    return `${fullDate}, ${timeStr}`;
  },

  /**
   * Render a centered time separator
   * @param {string|Date} date
   */
  renderChatSeparator(date) {
    const timeStr = this.formatTime(date);
    return `<div class="chat-time-separator" data-separator-date="${this.escapeAttribute(date)}">${timeStr}</div>`;
  },

  findPreviousMessageBubble(el) {
    let cursor = el?.previousElementSibling || null;
    while (cursor) {
      if (cursor.classList?.contains("msg-bubble-wrapper")) return cursor;
      cursor = cursor.previousElementSibling;
    }
    return null;
  },

  findNextMessageBubble(el) {
    let cursor = el?.nextElementSibling || null;
    while (cursor) {
      if (cursor.classList?.contains("msg-bubble-wrapper")) return cursor;
      cursor = cursor.nextElementSibling;
    }
    return null;
  },

  cleanTimeSeparators(container) {
    if (!container) return;

    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
    const separators = Array.from(container.children).filter((child) =>
      child.classList?.contains("chat-time-separator"),
    );
    if (!separators.length) return;

    const messageBubbles = Array.from(container.children).filter((child) =>
      child.classList?.contains("msg-bubble-wrapper"),
    );
    if (!messageBubbles.length) {
      separators.forEach((sep) => sep.remove());
      return;
    }

    let keptLeadingSeparator = false;
    const keptBoundaryKeys = new Set();
    separators.forEach((sep) => {
      const prevMsg = this.findPreviousMessageBubble(sep);
      const nextMsg = this.findNextMessageBubble(sep);

      // Separator without any following message is always orphaned.
      if (!nextMsg) {
        sep.remove();
        return;
      }

      // Keep only one leading separator before first message.
      if (!prevMsg) {
        if (keptLeadingSeparator) {
          sep.remove();
        } else {
          keptLeadingSeparator = true;
        }
        return;
      }

      const prevTime = new Date(prevMsg.dataset.sentAt || 0);
      const nextTime = new Date(nextMsg.dataset.sentAt || 0);
      const prevValid = Number.isFinite(prevTime.getTime());
      const nextValid = Number.isFinite(nextTime.getTime());
      const shouldKeep = prevValid && nextValid && nextTime - prevTime > gap;

      if (!shouldKeep) {
        sep.remove();
        return;
      }

      // Keep at most one separator per message boundary.
      const prevKey =
        prevMsg.dataset.messageId ||
        prevMsg.dataset.sentAt ||
        `prev-${prevTime.getTime()}`;
      const nextKey =
        nextMsg.dataset.messageId ||
        nextMsg.dataset.sentAt ||
        `next-${nextTime.getTime()}`;
      const boundaryKey = `${prevKey}|${nextKey}`;
      if (keptBoundaryKeys.has(boundaryKey)) {
        sep.remove();
        return;
      }
      keptBoundaryKeys.add(boundaryKey);
    });

    // Safety pass: never allow 2 adjacent separators after cleanup.
    let lastKeptSeparator = null;
    Array.from(container.children).forEach((child) => {
      if (!child.classList?.contains("chat-time-separator")) {
        if (child.classList?.contains("msg-bubble-wrapper")) {
          lastKeptSeparator = null;
        }
        return;
      }

      if (lastKeptSeparator) {
        child.remove();
        return;
      }
      lastKeptSeparator = child;
    });

    // After cleaning separators, sync reaction badge overflow state
    this.syncAllReactionBadgeOverflows(container);
  },

  buildProfileHash(profileTarget) {
    const safe = (profileTarget || "").toString().trim();
    if (window.RouteHelper?.buildProfileHash) {
      return window.RouteHelper.buildProfileHash(safe);
    }
    if (!safe) return "#/";
    return `#/${encodeURIComponent(safe)}`;
  },

  goToProfile(accountId, username) {
    if (!accountId && !username) return;

    // If we are leaving chat-page, ensure we minimize the current chat session
    if (
      window.ChatPage &&
      typeof window.ChatPage.minimizeToBubble === "function"
    ) {
      window.ChatPage.minimizeToBubble();
    }

    // Prefer username for profile URL (clean/SEO-friendly); fallback to accountId
    const profileParam = (username || accountId || "").toString().trim();
    if (!profileParam) return;

    if (window.RouteHelper?.buildProfilePath && window.RouteHelper?.goTo) {
      const path = window.RouteHelper.buildProfilePath(profileParam);
      window.RouteHelper.goTo(path);
      return;
    }

    window.location.hash = this.buildProfileHash(profileParam);
  },

  resolveGroupAllMentionKeyword() {
    const normalized = (
      window.APP_CONFIG?.CHAT_GROUP_ALL_MENTION_KEYWORD || "all"
    )
      .toString()
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    return normalized || "all";
  },

  escapeRegex(value) {
    return (value || "").toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  buildMentionLabel(username) {
    const safeUsername = (username || "").toString().trim().replace(/^@+/, "");
    return `<span class="chat-mention-prefix">@</span><span class="chat-mention-name">${escapeHtml(safeUsername)}</span>`;
  },

  renderTextWithSpecialMentions(rawText) {
    const text = (rawText ?? "").toString();
    if (!text) return "";

    const groupAllKeyword = this.resolveGroupAllMentionKeyword();
    if (!groupAllKeyword) {
      return linkify(escapeHtml(text));
    }

    const allMentionRegex = new RegExp(
      `(^|[^A-Za-z0-9._])@(${this.escapeRegex(groupAllKeyword)})(?![A-Za-z0-9._-])`,
      "gi",
    );

    let output = "";
    let lastIndex = 0;
    let match = allMentionRegex.exec(text);

    while (match) {
      const prefix = match[1] || "";
      const mentionBody = match[2] || "";
      const mentionStart = match.index + prefix.length;
      const mentionText = `@${mentionBody}`;

      if (mentionStart > lastIndex) {
        output += linkify(escapeHtml(text.slice(lastIndex, mentionStart)));
      }

      output += `<span class="chat-mention-link chat-mention-link-static" data-mention-type="all">${this.buildMentionLabel(mentionBody)}</span>`;
      lastIndex = mentionStart + mentionText.length;
      match = allMentionRegex.exec(text);
    }

    if (lastIndex < text.length) {
      output += linkify(escapeHtml(text.slice(lastIndex)));
    }

    return output || linkify(escapeHtml(text));
  },

  parseMentionSegments(rawContent) {
    const safeContent = (rawContent ?? "").toString();
    if (!safeContent) return [];

    const mentionRegex =
      /@\[(?<username>[A-Za-z0-9._]{1,30})\]\((?<accountId>[0-9a-fA-F-]{36})\)/g;
    const segments = [];
    let lastIndex = 0;
    mentionRegex.lastIndex = 0;
    let match = mentionRegex.exec(safeContent);

    while (match) {
      const startIndex = match.index;
      const matchText = match[0] || "";
      const endIndex = startIndex + matchText.length;

      if (startIndex > lastIndex) {
        segments.push({
          type: "text",
          text: safeContent.slice(lastIndex, startIndex),
        });
      }

      const mentionUsername = (match.groups?.username || "").toString().trim();
      const mentionAccountId = (match.groups?.accountId || "")
        .toString()
        .trim();

      if (mentionUsername && mentionAccountId) {
        segments.push({
          type: "mention",
          username: mentionUsername,
          accountId: mentionAccountId,
          text: `@${mentionUsername}`,
        });
      } else {
        segments.push({
          type: "text",
          text: matchText,
        });
      }

      lastIndex = endIndex;
      match = mentionRegex.exec(safeContent);
    }

    if (lastIndex < safeContent.length) {
      segments.push({
        type: "text",
        text: safeContent.slice(lastIndex),
      });
    }

    return segments;
  },

  renderMessageRichContent(rawContent) {
    const segments = this.parseMentionSegments(rawContent);
    if (segments.length === 0) {
      return this.renderTextWithSpecialMentions(rawContent);
    }

    return segments
      .map((segment) => {
        if (segment.type !== "mention") {
          return this.renderTextWithSpecialMentions(segment.text || "");
        }

        const profileTarget = segment.username || segment.accountId || "";
        const mentionHref = this.buildProfileHash(profileTarget);
        return `<a class="chat-mention-link" href="${escapeHtml(mentionHref)}" data-account-id="${escapeHtml(segment.accountId || "")}" data-username="${escapeHtml(segment.username || "")}" onclick="event.stopPropagation()">${this.buildMentionLabel(segment.username || "")}</a>`;
      })
      .join("");
  },

  normalizeMessageContentForPreview(rawContent) {
    const segments = this.parseMentionSegments(rawContent);
    if (segments.length === 0) {
      return (rawContent ?? "").toString().trim();
    }

    return segments
      .map((segment) => segment.text || "")
      .join("")
      .trim();
  },

  buildLastMsgMediaSummary(medias) {
    const items = Array.isArray(medias) ? medias : [];
    if (!items.length) {
      return {
        sentText: this.t("chat.preview.media.sent_file", "Sent a media file"),
        replyWithText: this.t("chat.preview.media.reply_file", "a media file"),
      };
    }

    const counts = new Map();
    let total = 0;
    items.forEach((media) => {
      const mediaType = Number(media?.mediaType ?? media?.MediaType ?? 3);
      const normalizedType = Number.isFinite(mediaType) ? mediaType : 3;
      counts.set(normalizedType, (counts.get(normalizedType) || 0) + 1);
      total += 1;
    });

    if (counts.size === 1) {
      const [[mediaType, count]] = Array.from(counts.entries());
      if (mediaType === 0) {
        if (count === 1) {
          return {
            sentText: this.t("chat.preview.media.sent_photo", "Sent a photo"),
            replyWithText: this.t("chat.preview.media.reply_photo", "a photo"),
          };
        }
        return {
          sentText: this.t(
            "chat.preview.media.sent_photos",
            "Sent {count} photos",
            { count: this.formatCount(count) },
          ),
          replyWithText: this.t(
            "chat.preview.media.reply_photos",
            "{count} photos",
            { count: this.formatCount(count) },
          ),
        };
      }
      if (mediaType === 1) {
        if (count === 1) {
          return {
            sentText: this.t("chat.preview.media.sent_video", "Sent a video"),
            replyWithText: this.t("chat.preview.media.reply_video", "a video"),
          };
        }
        return {
          sentText: this.t(
            "chat.preview.media.sent_videos",
            "Sent {count} videos",
            { count: this.formatCount(count) },
          ),
          replyWithText: this.t(
            "chat.preview.media.reply_videos",
            "{count} videos",
            { count: this.formatCount(count) },
          ),
        };
      }
      if (mediaType === 2) {
        if (count === 1) {
          return {
            sentText: this.t("chat.preview.media.sent_audio", "Sent an audio"),
            replyWithText: this.t("chat.preview.media.reply_audio", "an audio"),
          };
        }
        return {
          sentText: this.t(
            "chat.preview.media.sent_audio_files",
            "Sent {count} audio files",
            { count: this.formatCount(count) },
          ),
          replyWithText: this.t(
            "chat.preview.media.reply_audio_files",
            "{count} audio files",
            { count: this.formatCount(count) },
          ),
        };
      }
      if (count === 1) {
        return {
          sentText: this.t("chat.preview.media.sent_file", "Sent a file"),
          replyWithText: this.t("chat.preview.media.reply_file", "a file"),
        };
      }
      return {
        sentText: this.t(
          "chat.preview.media.sent_files",
          "Sent {count} files",
          { count: this.formatCount(count) },
        ),
        replyWithText: this.t(
          "chat.preview.media.reply_files",
          "{count} files",
          { count: this.formatCount(count) },
        ),
      };
    }

    if (total === 1) {
      return {
        sentText: this.t(
          "chat.preview.media.sent_attachment",
          "Sent an attachment",
        ),
        replyWithText: this.t(
          "chat.preview.media.reply_attachment",
          "an attachment",
        ),
      };
    }

    return {
      sentText: this.t(
        "chat.preview.media.sent_attachments",
        "Sent attachments",
      ),
      replyWithText: this.t(
        "chat.preview.media.reply_attachments",
        "attachments",
      ),
    };
  },

  translateLegacyServerPreview(previewText = "") {
    const raw = this.normalizeMessageContentForPreview(previewText);
    if (!raw) return "";
    const normalized = raw.replace(/[.!]+$/g, "").trim();

    const repliedStoryWithTextMatch = normalized.match(
      /^Replied to your story:\s+([\s\S]+)$/i,
    );
    if (repliedStoryWithTextMatch) {
      return this.t(
        "chat.preview.reply_story_with_text",
        "Replied to your story: {content}",
        {
          content: repliedStoryWithTextMatch[1].trim(),
        },
      );
    }

    if (/^Message(?: was)? recalled$/i.test(normalized)) {
      return this.t("chat.preview.message_recalled", "Message was recalled");
    }

    if (/^Replied to your story$/i.test(normalized)) {
      return this.t("chat.preview.reply_story", "Replied to your story");
    }

    if (/^Replied with a shared post$/i.test(normalized)) {
      return this.t(
        "chat.preview.reply_shared_post",
        "Replied with a shared post",
      );
    }

    if (/^Replied with (?:a )?photo$/i.test(normalized)) {
      return this.t("chat.preview.reply_media", "Replied with {content}", {
        content: this.t("chat.preview.media.sent_photo", "Sent a photo"),
      });
    }

    if (/^Replied with (?:a )?video$/i.test(normalized)) {
      return this.t("chat.preview.reply_media", "Replied with {content}", {
        content: this.t("chat.preview.media.sent_video", "Sent a video"),
      });
    }

    if (/^Replied with (?:an )?audio$/i.test(normalized)) {
      return this.t("chat.preview.reply_media", "Replied with {content}", {
        content: this.t("chat.preview.media.sent_audio", "Sent an audio"),
      });
    }

    if (/^Shared a post$/i.test(normalized)) {
      return this.t("chat.preview.shared_post", "Shared a post");
    }

    const repliedTextMatch = normalized.match(/^Replied:\s+([\s\S]+)$/i);
    if (repliedTextMatch) {
      return this.t("chat.preview.reply_text", "Replied: {content}", {
        content: repliedTextMatch[1].trim(),
      });
    }

    const repliedWithTextMatch = normalized.match(
      /^Replied with\s+([\s\S]+)$/i,
    );
    if (repliedWithTextMatch) {
      const replyContent = repliedWithTextMatch[1].trim();
      return this.t("chat.preview.reply_media", "Replied with {content}", {
        content:
          this.translateServerText(replyContent) ||
          this.t("chat.preview.media.generic", "Media"),
      });
    }

    if (/^Replied to a message$/i.test(normalized)) {
      return this.t("chat.preview.reply_message", "Replied to a message");
    }

    if (/^Replied$/i.test(normalized)) {
      return this.t("chat.preview.reply_message", "Replied to a message");
    }

    if (/^Sent a photo$/i.test(normalized)) {
      return this.t("chat.preview.media.sent_photo", "Sent a photo");
    }

    if (/^Sent a video$/i.test(normalized)) {
      return this.t("chat.preview.media.sent_video", "Sent a video");
    }

    if (/^Sent an audio$/i.test(normalized)) {
      return this.t("chat.preview.media.sent_audio", "Sent an audio");
    }

    if (/^Sent (?:a )?(?:file|media file)$/i.test(normalized)) {
      return this.t("chat.preview.media.sent_file", "Sent a media file");
    }

    const sentCountMatch = normalized.match(
      /^Sent\s+(\d+)\s+(photos|videos|audio files|files)$/i,
    );
    if (sentCountMatch) {
      const count = sentCountMatch[1];
      const unit = sentCountMatch[2].toLowerCase();
      if (unit === "photos") {
        return this.t("chat.preview.media.sent_photos", "Sent {count} photos", {
          count,
        });
      }
      if (unit === "videos") {
        return this.t("chat.preview.media.sent_videos", "Sent {count} videos", {
          count,
        });
      }
      if (unit === "audio files") {
        return this.t(
          "chat.preview.media.sent_audio_files",
          "Sent {count} audio files",
          { count },
        );
      }
      return this.t("chat.preview.media.sent_files", "Sent {count} files", {
        count,
      });
    }

    return "";
  },

  getLastMsgPreviewMeta(conv, options = {}) {
    const messageOverride = options?.message || null;
    const lastMessage =
      messageOverride || conv?.lastMessage || conv?.LastMessage || null;
    const rawServerPreview = !messageOverride
      ? (conv?.lastMessagePreview ?? conv?.LastMessagePreview ?? "")
      : "";
    const serverPreview =
      typeof rawServerPreview === "string" ? rawServerPreview.trim() : "";
    const normalizedServerPreview =
      this.normalizeMessageContentForPreview(serverPreview);
    const messageType = this.getMessageType(lastMessage);
    const hasReplyFromPayload = !!(
      lastMessage?.replyTo || lastMessage?.ReplyTo
    );
    const hasReplyFromFlag = !!(lastMessage?.hasReply ?? lastMessage?.HasReply);
    const hasReplyFromServerPreview =
      !messageOverride && /^replied\b/i.test(normalizedServerPreview);
    const hasReply =
      hasReplyFromPayload || hasReplyFromFlag || hasReplyFromServerPreview;
    const rawContent = lastMessage?.content ?? lastMessage?.Content ?? "";
    const contentText = this.normalizeMessageContentForPreview(rawContent);

    if (lastMessage?.isRecalled || lastMessage?.IsRecalled) {
      return {
        text: this.t("chat.preview.message_recalled", "Message was recalled"),
        isDerived: true,
      };
    }

    if (lastMessage && this.isSystemMessage(lastMessage)) {
      return {
        text: this.getSystemMessageText(lastMessage),
        isDerived: true,
      };
    }

    if (!messageOverride && normalizedServerPreview.length > 0) {
      const isLegacyReplyPreviewMissingPrefix =
        hasReply &&
        contentText.length > 0 &&
        normalizedServerPreview === contentText;
      if (isLegacyReplyPreviewMissingPrefix) {
        // Skip stale server preview and rebuild from current message + reply flag
      } else {
        const isRawContentText =
          (messageType === 1 || messageType === 2 || messageType === null) &&
          !hasReply &&
          contentText.length > 0 &&
          normalizedServerPreview === contentText;
        const translatedLegacyPreview = this.translateLegacyServerPreview(
          normalizedServerPreview,
        );

        return {
          text:
            translatedLegacyPreview ||
            this.translateServerText(normalizedServerPreview) ||
            this.t("chat.preview.sent_message", "Sent a message"),
          isDerived: !isRawContentText,
        };
      }
    }

    if (messageType === 5) {
      return {
        text: hasReply
          ? this.t(
              "chat.preview.reply_shared_post",
              "Replied with a shared post",
            )
          : this.t("chat.preview.shared_post", "Shared a post"),
        isDerived: true,
      };
    }

    if (messageType === 4) {
      if (contentText.length > 0) {
        return {
          text: this.t(
            "chat.preview.reply_story_with_text",
            "Replied to your story: {content}",
            { content: contentText },
          ),
          isDerived: true,
        };
      }
      return {
        text: this.t("chat.preview.reply_story", "Replied to your story"),
        isDerived: true,
      };
    }

    if (messageType === 2) {
      if (contentText.length > 0) {
        return {
          text: hasReply
            ? this.t("chat.preview.reply_text", "Replied: {content}", {
                content: contentText,
              })
            : contentText,
          isDerived: hasReply,
        };
      }

      const mediaSummary = this.buildLastMsgMediaSummary(
        lastMessage?.medias || lastMessage?.Medias || [],
      );
      return {
        text: hasReply
          ? this.t("chat.preview.reply_media", "Replied with {content}", {
              content: mediaSummary.replyWithText,
            })
          : mediaSummary.sentText,
        isDerived: true,
      };
    }

    if (messageType === 1 || messageType === null) {
      if (contentText.length > 0) {
        return {
          text: hasReply
            ? this.t("chat.preview.reply_text", "Replied: {content}", {
                content: contentText,
              })
            : contentText,
          isDerived: hasReply,
        };
      }
      if (hasReply) {
        return {
          text: this.t("chat.preview.reply_message", "Replied to a message"),
          isDerived: true,
        };
      }
      if (messageType === 1) {
        return {
          text: this.t("chat.preview.sent_message", "Sent a message"),
          isDerived: true,
        };
      }
    }

    if (contentText.length > 0) {
      return {
        text: hasReply
          ? this.t("chat.preview.reply_text", "Replied: {content}", {
              content: contentText,
            })
          : contentText,
        isDerived: hasReply,
      };
    }

    if (hasReply) {
      return {
        text: this.t("chat.preview.reply_message", "Replied to a message"),
        isDerived: true,
      };
    }

    if (conv?.lastMessagePreview) {
      return {
        text:
          this.translateServerText(conv.lastMessagePreview) ||
          this.t("chat.preview.sent_message", "Sent a message"),
        isDerived: true,
      };
    }

    const isGroup = !!(conv?.isGroup ?? conv?.IsGroup ?? false);
    return {
      text: isGroup
        ? this.t("chat.preview.group_created", "Group created.")
        : this.t("chat.preview.conversation_started", "Conversation started."),
      isDerived: true,
    };
  },

  /**
   * Format last message preview
   */
  getLastMsgPreview(conv, options = {}) {
    const meta = this.getLastMsgPreviewMeta(conv, options);
    return meta?.text || "";
  },

  /**
   * Sync the boundary between two consecutive message bubbles in the DOM.
   * Use this when prepending or appending messages to ensure correct grouping (border-radius, avatars).
   *
   * @param {HTMLElement} msgAbove - The message element above
   * @param {HTMLElement} msgBelow - The message element below
   */
  syncMessageBoundary(msgAbove, msgBelow) {
    if (
      !msgAbove ||
      !msgBelow ||
      !msgAbove.classList.contains("msg-bubble-wrapper") ||
      !msgBelow.classList.contains("msg-bubble-wrapper")
    )
      return;
    if (
      this.isSystemMessageElement(msgAbove) ||
      this.isSystemMessageElement(msgBelow)
    )
      return;

    const senderAbove = msgAbove.dataset.senderId;
    const senderBelow = msgBelow.dataset.senderId;
    const timeAbove = new Date(msgAbove.dataset.sentAt);
    const timeBelow = new Date(msgBelow.dataset.sentAt);

    const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
    const sameSender = senderAbove && senderAbove === senderBelow;
    const closeTime = timeBelow - timeAbove < groupGap;

    if (sameSender && closeTime) {
      // --- Update Classes ---
      // Above: single -> first, last -> middle
      if (msgAbove.classList.contains("msg-group-single")) {
        msgAbove.classList.replace("msg-group-single", "msg-group-first");
      } else if (msgAbove.classList.contains("msg-group-last")) {
        msgAbove.classList.replace("msg-group-last", "msg-group-middle");
      }

      // Below: single -> last, first -> middle
      if (msgBelow.classList.contains("msg-group-single")) {
        msgBelow.classList.replace("msg-group-single", "msg-group-last");
      } else if (msgBelow.classList.contains("msg-group-first")) {
        msgBelow.classList.replace("msg-group-first", "msg-group-middle");
      }

      // --- Update UI (Avatar/Author) ---
      // If grouped, 'Above' message is NEVER 'last' or 'single', so it should NOT have avatar
      const avatarAbove = msgAbove.querySelector(".msg-avatar");
      if (avatarAbove && !avatarAbove.classList.contains("msg-avatar-spacer")) {
        avatarAbove.classList.add("msg-avatar-spacer");
        avatarAbove.innerHTML = "";
      }

      // If grouped, 'Below' message is NEVER 'first' or 'single', so it should NOT have author name (group chat)
      const authorBelow = msgBelow.querySelector(".msg-author");
      if (authorBelow) {
        authorBelow.remove();
      }
    }
  },

  updateMessageAuthorDisplay(container, accountId, authorName) {
    if (!container || !(container instanceof Element)) return 0;

    const targetId = this.normalizeEntityId(accountId);
    if (!targetId) return 0;

    const nextAuthorName = (authorName || "").toString().trim();
    if (!nextAuthorName) return 0;

    let updatedCount = 0;
    container.querySelectorAll(".msg-bubble-wrapper").forEach((bubble) => {
      if (!(bubble instanceof Element)) return;
      if (bubble.classList.contains("sent")) return;
      if (this.isSystemMessageElement(bubble)) return;

      const senderId = this.normalizeEntityId(bubble.dataset.senderId || "");
      if (!senderId || senderId !== targetId) return;

      bubble.dataset.authorName = nextAuthorName;
      bubble.dataset.senderName = nextAuthorName;

      const authorEl = bubble.querySelector(".msg-author");
      if (authorEl) {
        authorEl.textContent = nextAuthorName;
        authorEl.removeAttribute("onclick");
      }

      updatedCount += 1;
    });

    return updatedCount;
  },

  /**
   * Show a generic chat confirmation modal (Specific classes to avoid overlap)
   * @param {Object} options - { title, message, confirmText, cancelText, onConfirm, onCancel, isDanger }
   */
  showConfirm(options = {}) {
    const {
      title = this.t("common.confirm.title", "Are you sure?"),
      message = "",
      confirmText = this.t("common.buttons.confirm", "Confirm"),
      cancelText = this.t("common.buttons.cancel", "Cancel"),
      onConfirm = null,
      onCancel = null,
      isDanger = false,
    } = options;

    const overlay = document.createElement("div");
    overlay.className = "chat-common-confirm-overlay";

    const popup = document.createElement("div");
    popup.className = "chat-common-confirm-popup";

    popup.innerHTML = `
            <div class="chat-common-confirm-content">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
            </div>
            <div class="chat-common-confirm-actions">
                <button class="chat-common-confirm-btn chat-common-confirm-cancel" id="genericCancelBtn">${escapeHtml(cancelText)}</button>
                <button class="chat-common-confirm-btn chat-common-confirm-confirm ${isDanger ? "danger" : ""}" id="genericConfirmBtn">${escapeHtml(confirmText)}</button>
            </div>
        `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lockScroll) lockScroll();

    requestAnimationFrame(() => overlay.classList.add("show"));

    const close = () => {
      overlay.classList.remove("show");
      if (window.unlockScroll) unlockScroll();
      setTimeout(() => overlay.remove(), 200);
    };

    const confirmBtn = document.getElementById("genericConfirmBtn");
    const cancelBtn = document.getElementById("genericCancelBtn");

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (onConfirm) onConfirm();
        close();
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        if (onCancel) onCancel();
        close();
      };
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        if (onCancel) onCancel();
        close();
      }
    };
  },

  /**
   * Show a generic chat prompt modal (Specific classes to avoid overlap)
   * @param {Object} options - { title, message, placeholder, value, confirmText, cancelText, onConfirm, onCancel }
   */
  showPrompt(options = {}) {
    const {
      title = this.t("common.prompt.title", "Input required"),
      message = "",
      placeholder = "",
      value = "",
      confirmText = this.t("common.buttons.save", "Save"),
      cancelText = this.t("common.buttons.cancel", "Cancel"),
      onConfirm = null,
      onCancel = null,
      maxLength = null,
      validate = null,
    } = options;

    const resolvedMaxLength = Number(maxLength);
    const normalizedMaxLength =
      Number.isFinite(resolvedMaxLength) && resolvedMaxLength > 0
        ? Math.floor(resolvedMaxLength)
        : null;
    const normalizedValue = normalizedMaxLength
      ? String(value || "").substring(0, normalizedMaxLength)
      : String(value || "");
    const maxLengthAttr = normalizedMaxLength
      ? ` maxlength="${normalizedMaxLength}"`
      : "";

    const overlay = document.createElement("div");
    overlay.className = "chat-common-confirm-overlay";

    const popup = document.createElement("div");
    popup.className = "chat-common-confirm-popup";

    popup.innerHTML = `
            <div class="chat-common-confirm-content">
                <h3>${escapeHtml(title)}</h3>
                ${message ? `<p>${escapeHtml(message)}</p>` : ""}
                <div class="chat-common-confirm-input-wrapper">
                    <input type="text" id="genericPromptInput" class="chat-common-confirm-input" placeholder="${this.escapeAttribute(placeholder)}" value="${this.escapeAttribute(normalizedValue)}" autocomplete="off"${maxLengthAttr}>
                </div>
            </div>
            <div class="chat-common-confirm-actions">
                <button class="chat-common-confirm-btn chat-common-confirm-cancel" id="genericCancelBtn">${escapeHtml(cancelText)}</button>
                <button class="chat-common-confirm-btn chat-common-confirm-confirm" id="genericConfirmBtn">${escapeHtml(confirmText)}</button>
            </div>
        `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lockScroll) lockScroll();

    const input = document.getElementById("genericPromptInput");
    const confirmBtn = document.getElementById("genericConfirmBtn");
    const cancelBtn = document.getElementById("genericCancelBtn");

    const updateBtnState = () => {
      if (typeof validate === "function") {
        const isValid = validate(input.value);
        if (confirmBtn) confirmBtn.disabled = !isValid;
      }
    };

    requestAnimationFrame(() => {
      overlay.classList.add("show");
      if (input) {
        input.focus();
        // Move cursor to the end instead of selecting all
        const val = input.value;
        input.value = "";
        input.value = val;

        updateBtnState();
      }
    });

    const close = () => {
      overlay.classList.remove("show");
      if (window.unlockScroll) unlockScroll();
      setTimeout(() => overlay.remove(), 200);
    };

    const handleConfirm = () => {
      if (confirmBtn && confirmBtn.disabled) return;
      if (onConfirm) onConfirm(input.value);
      close();
    };

    if (confirmBtn) confirmBtn.onclick = handleConfirm;

    if (input) {
      input.oninput = updateBtnState;
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          if (confirmBtn && confirmBtn.disabled) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          handleConfirm();
        } else if (e.key === "Escape") {
          close();
        }
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        if (onCancel) onCancel();
        close();
      };
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        if (onCancel) onCancel();
        close();
      }
    };
  },

  showThemePicker(options = {}) {
    const {
      title = this.t("chat.theme.change_title", "Change theme"),
      currentTheme = null,
      onSelect = null,
      onCancel = null,
    } = options;

    const themeOptions = this.getConversationThemeOptions();
    const currentKey = this.resolveConversationTheme(currentTheme);
    const selectedTheme = currentKey || "default";
    const currentMode = this.getCurrentAppThemeMode();

    const overlay = document.createElement("div");
    overlay.className = "chat-common-confirm-overlay";

    const popup = document.createElement("div");
    popup.className = "chat-common-confirm-popup chat-theme-picker-popup";

    popup.innerHTML = `
            <div class="chat-nicknames-header">
                <h3>${escapeHtml(title)}</h3>
                <div class="chat-nicknames-close" id="themePickerCloseBtn">
                    <i data-lucide="x"></i>
                </div>
            </div>
            <div class="chat-theme-picker-list">
                ${themeOptions
                  .map((opt) => {
                    const key = opt.key || "default";
                    const isActive = selectedTheme === key;
                    const swatchBackground =
                      this.getConversationThemePreview(opt, currentMode) ||
                      "var(--accent-primary)";
                    return `
                        <button class="chat-theme-option ${isActive ? "active" : ""}" data-theme-key="${key}">
                            <span class="chat-theme-swatch" style="background:${escapeHtml(swatchBackground)}"></span>
                            <span class="chat-theme-label">${escapeHtml(opt.label || key)}</span>
                        </button>
                    `;
                  })
                  .join("")}
            </div>
        `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lockScroll) lockScroll();
    if (window.lucide)
      lucide.createIcons({ props: { size: 18 }, container: popup });
    requestAnimationFrame(() => overlay.classList.add("show"));

    const close = () => {
      overlay.classList.remove("show");
      if (window.unlockScroll) unlockScroll();
      setTimeout(() => overlay.remove(), 200);
    };

    const closeBtn = popup.querySelector("#themePickerCloseBtn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (onCancel) onCancel();
        close();
      };
    }

    popup.querySelectorAll(".chat-theme-option").forEach((btn) => {
      btn.onclick = () => {
        const rawKey = (btn.dataset.themeKey || "").toLowerCase();
        const nextTheme = rawKey === "default" ? null : rawKey;
        if (onSelect) onSelect(nextTheme);
        close();
      };
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        if (onCancel) onCancel();
        close();
      }
    };
  },

  /**
   * Show a modal to manage nicknames of all members in a conversation.
   * @param {Object} options - { title, members, conversationId, onNicknameUpdated }
   */
  showNicknamesModal(options = {}) {
    const {
      title = this.t("chat.nickname.modal_title", "Nicknames"),
      members = [],
      conversationId = "",
      onNicknameUpdated = null,
    } = options;

    const normalizedMembers = (members || []).map((m) =>
      this.normalizeConversationMember(m, {
        fallbackUsernameToDisplayName: true,
      }),
    );
    const nicknameMaxLength = this.getNicknameMaxLength();

    if (!conversationId || !normalizedMembers.length) return;

    const overlay = document.createElement("div");
    overlay.className = "chat-common-confirm-overlay chat-nicknames-overlay";
    overlay.dataset.conversationId = conversationId;

    const popup = document.createElement("div");
    popup.className = "chat-common-confirm-popup chat-nicknames-popup";
    popup.innerHTML = `
            <div class="chat-nicknames-header">
                <h3>${title}</h3>
                <div class="chat-nicknames-close" id="nicknamesCloseBtn">
                    <i data-lucide="x"></i>
                </div>
            </div>
            <div class="chat-nicknames-list" id="nicknamesList">
                <!-- List items will be rendered here -->
            </div>
        `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lockScroll) lockScroll();
    if (window.lucide)
      lucide.createIcons({ props: { size: 18 }, container: popup });

    requestAnimationFrame(() => overlay.classList.add("show"));

    const close = () => {
      overlay.classList.remove("show");
      if (window.unlockScroll) unlockScroll();
      setTimeout(() => overlay.remove(), 200);
    };

    const findMemberById = (accountId) => {
      const normalizedAccountId = (accountId || "").toString().toLowerCase();
      return (
        normalizedMembers.find((m) => m.accountId === normalizedAccountId) ||
        null
      );
    };

    const renderNicknameItem = (member) => {
      const usernameRawLabel =
        member.username || this.getUnknownUsernameLabel();
      const usernameLabel = ChatCommon.truncateDisplayText(
        usernameRawLabel,
        window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25,
      );
      const nicknameRawLabel =
        member.nickname ||
        this.t("chat.nickname.set_placeholder", "Set nickname");
      const nicknameLabel = member.nickname
        ? ChatCommon.truncateDisplayText(member.nickname, nicknameMaxLength)
        : nicknameRawLabel;
      const nicknameEmptyClass = member.nickname ? "" : "empty";
      const avatarUrl = member.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;

      return `
                <div class="chat-nickname-item" data-account-id="${member.accountId}">
                    <img src="${avatarUrl}" class="chat-nickname-avatar" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                    <div class="chat-nickname-info">
                        <div class="chat-nickname-name" title="@${escapeHtml(usernameRawLabel)}">@${escapeHtml(usernameLabel)}</div>
                        <div class="chat-nickname-label ${nicknameEmptyClass}" title="${escapeHtml(nicknameRawLabel)}">${escapeHtml(nicknameLabel)}</div>
                    </div>
                    <div class="chat-nickname-edit-btn" onclick="ChatCommon._toggleNicknameEdit('${member.accountId}')">
                        <i data-lucide="pencil"></i>
                    </div>
                </div>
            `;
    };

    const updateNicknameInfoArea = (infoArea, member) => {
      if (!infoArea) return;
      const nameEl = infoArea.querySelector(".chat-nickname-name");
      const labelEl = infoArea.querySelector(".chat-nickname-label");
      const usernameRawLabel =
        member.username || this.getUnknownUsernameLabel();
      const usernameLabel = ChatCommon.truncateDisplayText(
        usernameRawLabel,
        window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25,
      );
      if (nameEl) {
        nameEl.textContent = `@${usernameLabel}`;
        nameEl.title = `@${usernameRawLabel}`;
      }
      if (labelEl) {
        const nicknameRawLabel =
          member.nickname ||
          this.t("chat.nickname.set_placeholder", "Set nickname");
        const nicknameLabel = member.nickname
          ? ChatCommon.truncateDisplayText(member.nickname, nicknameMaxLength)
          : nicknameRawLabel;
        labelEl.textContent = nicknameLabel;
        labelEl.title = nicknameRawLabel;
        labelEl.classList.toggle("empty", !member.nickname);
      }
    };

    const renderList = () => {
      const list = document.getElementById("nicknamesList");
      if (!list) return;

      list.innerHTML = normalizedMembers.map(renderNicknameItem).join("");

      if (window.lucide)
        lucide.createIcons({ props: { size: 18 }, container: list });
    };

    // Internal helper to handle the toggle
    ChatCommon._toggleNicknameEdit = (accountId) => {
      const normalizedAccountId = (accountId || "").toString().toLowerCase();
      const item = document.querySelector(
        `.chat-nickname-item[data-account-id="${normalizedAccountId}"]`,
      );
      if (!item || item.classList.contains("is-editing")) return;

      const member = findMemberById(normalizedAccountId);
      if (!member) return;

      const infoArea = item.querySelector(".chat-nickname-info");
      const editBtn = item.querySelector(".chat-nickname-edit-btn");
      const currentNickname = ChatCommon.normalizeNickname(member.nickname);
      const currentNicknameValue = currentNickname || "";

      item.classList.add("is-editing");

      // Replace info area with input
      infoArea.style.display = "none";
      const inputWrapper = document.createElement("div");
      inputWrapper.className = "chat-nickname-input-wrapper";
      inputWrapper.innerHTML = `<input type="text" class="chat-nickname-input" value="${escapeHtml(currentNicknameValue)}" placeholder="${this.escapeAttribute(this.t("chat.nickname.input_placeholder", "Set nickname..."))}" maxlength="${nicknameMaxLength}">`;
      item.insertBefore(inputWrapper, editBtn);

      const input = inputWrapper.querySelector("input");
      input.focus();
      const valLen = input.value.length;
      input.setSelectionRange(valLen, valLen);

      // Replace pencil with checkmark
      editBtn.innerHTML = '<i data-lucide="check"></i>';
      editBtn.classList.add("chat-nickname-save-btn");
      if (window.lucide)
        lucide.createIcons({ props: { size: 18 }, container: editBtn });

      const handleSave = async () => {
        const nicknameToSave = ChatCommon.normalizeNickname(input.value);

        if (nicknameToSave === currentNickname) {
          cancelEdit();
          return;
        }

        // Call API
        try {
          const payload = {
            accountId: normalizedAccountId,
            nickname: nicknameToSave,
          };
          const res = await window.API.Conversations.updateNickname(
            conversationId,
            payload,
          );

          if (res.ok) {
            member.nickname = nicknameToSave;
            if (onNicknameUpdated)
              onNicknameUpdated(normalizedAccountId, nicknameToSave);
            cancelEdit({ applyUpdatedData: true });
          } else {
            const message = await this.readFriendlyApiError(res, {
              feature: "chat",
              action: "update-nickname",
              fallbackKey: "errors.chat.nickname_update_failed",
              fallbackMessage: "Failed to update nickname",
            });
            if (window.toastError) window.toastError(message);
            cancelEdit();
          }
        } catch (err) {
          console.error("Nickname update error:", err);
          if (window.toastError)
            window.toastError(
              this.t(
                "errors.chat.nickname_update_failed",
                "Failed to update nickname",
              ),
            );
          cancelEdit();
        }
      };

      const cancelEdit = ({ applyUpdatedData = false } = {}) => {
        inputWrapper.remove();
        infoArea.style.display = "";
        if (applyUpdatedData) {
          updateNicknameInfoArea(infoArea, member);
        }
        editBtn.innerHTML = '<i data-lucide="pencil"></i>';
        editBtn.classList.remove("chat-nickname-save-btn");
        item.classList.remove("is-editing");
        editBtn.onclick = (e) => {
          e.stopPropagation();
          ChatCommon._toggleNicknameEdit(normalizedAccountId);
        };
        if (window.lucide)
          lucide.createIcons({ props: { size: 18 }, container: editBtn });
      };

      editBtn.onclick = (e) => {
        e.stopPropagation();
        handleSave();
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") cancelEdit();
      };
    };

    const closeBtn = document.getElementById("nicknamesCloseBtn");
    if (closeBtn) closeBtn.onclick = close;

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    renderList();
  },

  // ─── Shared Context Mode Utilities (Jump to Message) ──────────────────
  // ctx adapter shape:
  //   getState()           → { isLoading, page, hasMore, _isContextMode, _contextPage, _newerPage, _hasMoreNewer }
  //   setState(patch)      → merges patch into state
  //   getContainerId()     → the message container DOM id (e.g. 'chat-view-messages' or 'chat-messages-{id}')
  //   getPageSize()        → page size number
  //   getConversationId()  → conversation id string
  //   isGroup()            → boolean
  //   getMyId()            → current user id (lowercase)
  //   renderMessages(items, container) → render reversed items into container (module-specific)
  //   reloadLatest()       → reload latest messages (cursor = null)
  //   getBtnParent()       → DOM element to append jump-to-bottom button
  //   getBtnId()           → unique button id string
  //   getMetaData()        → current metaData or null
  //   setMetaData(meta)    → store metaData

  /**
   * Load a cursor-based message slice around a target message, clear and re-render.
   */
  contextFindMessageElement(msgContainer, normalizedMessageId) {
    if (!msgContainer || !normalizedMessageId) return null;

    const exact = msgContainer.querySelector(
      `.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`,
    );
    if (exact) return exact;

    const all = msgContainer.querySelectorAll(
      ".msg-bubble-wrapper[data-message-id]",
    );
    for (const bubble of all) {
      const currentId = (bubble?.dataset?.messageId || "")
        .toString()
        .toLowerCase();
      if (currentId && currentId === normalizedMessageId) return bubble;
    }

    return null;
  },

  async contextFocusTargetMessage(msgContainer, messageId, options = {}) {
    const normalizedMessageId = (messageId || "").toString().toLowerCase();
    if (!normalizedMessageId || !msgContainer) return false;

    const maxAttempts =
      Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 12;
    const delayMs = Number(options.delayMs) > 0 ? Number(options.delayMs) : 90;
    let target = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      target = this.contextFindMessageElement(
        msgContainer,
        normalizedMessageId,
      );
      if (target) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (!target) return false;

    const centerTarget = () => {
      if (!target || !target.isConnected) return;
      try {
        target.scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "nearest",
        });
      } catch {
        target.scrollIntoView();
      }
    };

    centerTarget();
    [90, 220].forEach((waitMs) => {
      setTimeout(() => centerTarget(), waitMs);
    });
    window.ChatActions?.highlightMessage(target);
    return true;
  },

  async contextLoadMessageContext(ctx, messageId) {
    const state = ctx.getState();
    if (state.isLoading) return;
    ctx.setState({ isLoading: true });
    const normalizedMessageId = (messageId || "").toString().toLowerCase();

    const pageSize = ctx.getPageSize();
    const conversationId = ctx.getConversationId();
    const preJumpContainer = document.getElementById(ctx.getContainerId());
    const prefersReducedMotion = !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const shouldAnimateContextJump =
      !!preJumpContainer &&
      !prefersReducedMotion &&
      preJumpContainer.scrollHeight - preJumpContainer.clientHeight > 8 &&
      preJumpContainer.scrollTop > 4;

    try {
      const preJumpAnimation = shouldAnimateContextJump
        ? ChatCommon.contextAnimateScrollToTop(preJumpContainer, 320)
        : Promise.resolve();
      const resPromise = window.API.Conversations.getMessageContext(
        conversationId,
        messageId,
        pageSize,
      );
      const [res] = await Promise.all([resPromise, preJumpAnimation]);
      if (!res.ok) {
        const message = await this.readFriendlyApiError(res, {
          feature: "chat",
          action: "jump-to-message",
          fallbackKey: "errors.chat.jump_to_message_failed",
          fallbackMessage: "Failed to jump to message",
        });
        window.toastError && window.toastError(message);
        ctx.setState({ isLoading: false });
        return;
      }

      const data = await res.json();
      const pageInfo = data?.messages || data?.Messages || {};
      const items = pageInfo?.items || pageInfo?.Items || [];
      const olderCursor =
        pageInfo?.olderCursor ?? pageInfo?.OlderCursor ?? null;
      const newerCursor =
        pageInfo?.newerCursor ?? pageInfo?.NewerCursor ?? null;
      const hasMoreOlder = !!(pageInfo?.hasMoreOlder ?? pageInfo?.HasMoreOlder);
      const hasMoreNewer = !!(pageInfo?.hasMoreNewer ?? pageInfo?.HasMoreNewer);

      // Store metadata
      const metaData = data?.metaData || data?.MetaData;
      if (metaData) ctx.setMetaData(metaData);

      // Enter context mode
      ctx.setState({
        _isContextMode: true,
        _contextPage: null,
        page: olderCursor,
        hasMore: hasMoreOlder,
        _newerPage: newerCursor,
        _hasMoreNewer: hasMoreNewer,
      });

      // Clear and render
      const msgContainer = document.getElementById(ctx.getContainerId());
      if (!msgContainer) {
        ctx.setState({ isLoading: false });
        return;
      }
      msgContainer.innerHTML = "";

      const reversed = [...items].reverse();
      ctx.renderMessages(reversed, msgContainer);
      ChatCommon.cleanTimeSeparators(msgContainer);

      if (window.lucide) lucide.createIcons({ container: msgContainer });
      if (typeof window.initializeChatEmojiElements === "function")
        window.initializeChatEmojiElements(msgContainer);
      if (typeof window.replaceSVGEmojis === "function")
        window.replaceSVGEmojis(msgContainer);

      // Show jump-to-bottom
      ChatCommon.contextShowJumpBtn(ctx);

      ctx.setState({ isLoading: false });

      // Focus target with retries to keep jump position stable after async rendering/layout.
      await ChatCommon.contextFocusTargetMessage(
        msgContainer,
        normalizedMessageId,
      );
    } catch (err) {
      console.error("contextLoadMessageContext error:", err);
      window.toastError &&
        window.toastError(
          this.t(
            "errors.chat.jump_to_message_failed",
            "Failed to jump to message",
          ),
        );
      ctx.setState({ isLoading: false });
    }
  },

  /**
   * Load newer messages (scrolling down in context mode).
   */
  async contextLoadNewerMessages(ctx) {
    const state = ctx.getState();
    if (state.isLoading || !state._isContextMode || !state._hasMoreNewer)
      return;
    if (!state._newerPage) {
      ctx.setState({ _hasMoreNewer: false });
      return;
    }

    ctx.setState({ isLoading: true });
    const conversationId = ctx.getConversationId();
    const pageSize = ctx.getPageSize();

    try {
      const res = await window.API.Conversations.getMessages(
        conversationId,
        state._newerPage,
        pageSize,
      );
      if (!res.ok) {
        ctx.setState({ isLoading: false });
        return;
      }

      const data = await res.json();
      const pageInfo = data?.messages || data?.Messages || data || {};
      const items = pageInfo?.items || pageInfo?.Items || [];
      const nextNewerCursor =
        pageInfo?.newerCursor ?? pageInfo?.NewerCursor ?? null;
      const hasMoreNewer = !!(pageInfo?.hasMoreNewer ?? pageInfo?.HasMoreNewer);

      if (!items.length) {
        ctx.setState({ _hasMoreNewer: false, isLoading: false });
        ChatCommon.contextResetMode(ctx);
        return;
      }

      const msgContainer = document.getElementById(ctx.getContainerId());
      if (!msgContainer) {
        ctx.setState({ isLoading: false });
        return;
      }

      const reversed = [...items].reverse();
      ctx.renderMessages(reversed, msgContainer);
      ChatCommon.cleanTimeSeparators(msgContainer);

      if (window.lucide) lucide.createIcons({ container: msgContainer });
      if (typeof window.initializeChatEmojiElements === "function")
        window.initializeChatEmojiElements(msgContainer);
      if (typeof window.replaceSVGEmojis === "function")
        window.replaceSVGEmojis(msgContainer);

      if (!hasMoreNewer) {
        ctx.setState({
          _newerPage: nextNewerCursor,
          _hasMoreNewer: false,
          isLoading: false,
        });
        ChatCommon.contextResetMode(ctx);
      } else {
        ctx.setState({
          _newerPage: nextNewerCursor,
          _hasMoreNewer: true,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error("contextLoadNewerMessages error:", err);
      ctx.setState({ isLoading: false });
    }
  },

  /**
   * Jump to bottom — exit context mode and reload latest.
   */
  contextAnimateScrollToTop(msgContainer, maxDurationMs = 320) {
    return new Promise((resolve) => {
      if (!msgContainer) {
        resolve();
        return;
      }

      const currentTop = msgContainer.scrollTop || 0;
      if (currentTop <= 4) {
        resolve();
        return;
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      try {
        msgContainer.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        msgContainer.scrollTop = 0;
        finish();
        return;
      }

      const startedAt = Date.now();
      let rafId = 0;
      const tick = () => {
        if (!msgContainer.isConnected) {
          finish();
          return;
        }

        const nearTop = (msgContainer.scrollTop || 0) <= 6;
        const timedOut = Date.now() - startedAt >= maxDurationMs;
        if (nearTop || timedOut) {
          finish();
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      setTimeout(() => {
        if (rafId) cancelAnimationFrame(rafId);
        finish();
      }, maxDurationMs + 24);
    });
  },

  contextAnimateScrollToBottom(msgContainer, maxDurationMs = 420) {
    return new Promise((resolve) => {
      if (!msgContainer) {
        resolve();
        return;
      }

      const targetTop = Math.max(
        0,
        msgContainer.scrollHeight - msgContainer.clientHeight,
      );
      const distance = targetTop - (msgContainer.scrollTop || 0);
      if (distance <= 4) {
        resolve();
        return;
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      try {
        msgContainer.scrollTo({ top: targetTop, behavior: "smooth" });
      } catch {
        msgContainer.scrollTop = targetTop;
        finish();
        return;
      }

      const startedAt = Date.now();
      let rafId = 0;
      const tick = () => {
        if (!msgContainer.isConnected) {
          finish();
          return;
        }

        const nearBottom =
          msgContainer.scrollHeight -
            msgContainer.scrollTop -
            msgContainer.clientHeight <=
          6;
        const timedOut = Date.now() - startedAt >= maxDurationMs;
        if (nearBottom || timedOut) {
          finish();
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      setTimeout(() => {
        if (rafId) cancelAnimationFrame(rafId);
        finish();
      }, maxDurationMs + 24);
    });
  },

  contextJumpToBottom(ctx, options = {}) {
    const shouldAnimate = !!options.animate;
    const msgContainer = document.getElementById(ctx.getContainerId());

    ChatCommon.contextRemoveJumpBtn(ctx, true);
    if (shouldAnimate && msgContainer) {
      ChatCommon.contextAnimateScrollToBottom(msgContainer).finally(() => {
        ChatCommon.contextResetMode(ctx);
        ctx.setState({ page: null, hasMore: true, isLoading: false });
        if (msgContainer) msgContainer.innerHTML = "";
        ctx.reloadLatest();
      });
      return;
    }

    ChatCommon.contextResetMode(ctx);
    ctx.setState({ page: null, hasMore: true, isLoading: false });
    if (msgContainer) msgContainer.innerHTML = "";
    ctx.reloadLatest();
  },

  /**
   * Reset context mode state.
   */
  contextResetMode(ctx) {
    ctx.setState({
      _isContextMode: false,
      _contextPage: null,
      _hasMoreNewer: false,
      _newerPage: null,
    });
    // Don't remove the button here — it may still be needed for normal scroll-up
  },

  /**
   * Show the jump-to-bottom floating button.
   * Smart click handler: context mode → reload page 1, normal → scroll to bottom.
   */
  contextShowJumpBtn(ctx) {
    ChatCommon.contextRemoveJumpBtn(ctx);
    const parent = ctx.getBtnParent();
    if (!parent) return;

    const btn = document.createElement("button");
    btn.className = "chat-jump-bottom-btn";
    btn.id = ctx.getBtnId();
    btn.title = this.t("chat.message.jump_to_bottom", "Jump to bottom");
    btn.innerHTML = '<i data-lucide="chevrons-down"></i>';
    btn.onclick = () => {
      const state = ctx.getState();
      if (state._isContextMode) {
        ChatCommon.contextJumpToBottom(ctx, { animate: true });
      } else {
        ChatCommon.contextRemoveJumpBtn(ctx, true);
        ctx.scrollToBottom("smooth");
      }
    };

    parent.appendChild(btn);
    if (window.lucide) lucide.createIcons({ container: btn });
  },

  /**
   * Remove the jump-to-bottom button with an optional exit animation.
   */
  contextRemoveJumpBtn(ctx, useAnimation = false) {
    const btn = document.getElementById(ctx.getBtnId());
    if (!btn) return;

    if (useAnimation) {
      btn.classList.add("is-exiting");
      setTimeout(() => {
        if (btn.parentNode) btn.remove();
      }, 200); // Matches CSS animation duration
    } else {
      btn.remove();
    }
  },

  /**
   * Show/hide the jump button based on scroll position.
   * Call this inside the onscroll handler for both normal and context mode.
   */
  updateJumpBtnOnScroll(ctx, msgContainer, threshold = 200) {
    if (!msgContainer) return;
    const nearBottom =
      msgContainer.scrollHeight -
        msgContainer.scrollTop -
        msgContainer.clientHeight <=
      threshold;

    if (nearBottom) {
      // At bottom + not in context mode → hide button
      const state = ctx.getState();
      if (!state._isContextMode) {
        ChatCommon.contextRemoveJumpBtn(ctx, true);
      }
    } else {
      // Scrolled up → show button if not already present
      const existing = document.getElementById(ctx.getBtnId());
      if (!existing) {
        ChatCommon.contextShowJumpBtn(ctx);
      }
    }
  },

  /**
   * Handle context-mode scroll (load newer pages when scrolling down).
   * Call this INSIDE the onscroll handler.
   * Returns true if a context-mode load was triggered.
   */
  contextHandleScroll(ctx, msgContainer) {
    const state = ctx.getState();
    if (!state._isContextMode || !state._hasMoreNewer || state.isLoading)
      return false;

    const nearBottom =
      msgContainer.scrollHeight -
        msgContainer.scrollTop -
        msgContainer.clientHeight <=
      50;
    if (nearBottom) {
      ChatCommon.contextLoadNewerMessages(ctx);
      return true;
    }
    return false;
  },
};

window.ChatCommon = ChatCommon;
