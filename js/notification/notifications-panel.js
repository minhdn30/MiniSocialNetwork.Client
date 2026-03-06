(function (global) {
  const NOTIFICATION_FILTER = Object.freeze({
    ALL: "all",
    UNREAD: "unread",
  });

  const NOTIFICATION_STATE = Object.freeze({
    ACTIVE: 0,
    UNAVAILABLE: 1,
  });

  const NOTIFICATION_TYPE = Object.freeze({
    FOLLOW: 0,
    POST_COMMENT: 1,
    COMMENT_REPLY: 2,
    POST_TAG: 3,
    COMMENT_MENTION: 4,
    STORY_REPLY: 5,
    POST_REACT: 6,
    STORY_REACT: 7,
    FOLLOW_REQUEST: 8,
    FOLLOW_REQUEST_ACCEPTED: 9,
  });

  const NOTIFICATION_TARGET_KIND = Object.freeze({
    NONE: 0,
    ACCOUNT: 1,
    POST: 2,
    STORY: 3,
  });

  const STORY_OPEN_STATUS = Object.freeze({
    SUCCESS: "success",
    UNAVAILABLE: "unavailable",
    ERROR: "error",
  });

  const state = {
    initialized: false,
    isOpen: false,
    isLoading: false,
    hasMore: true,
    filter: NOTIFICATION_FILTER.ALL,
    pageSize: 20,
    cursorLastEventAt: "",
    cursorNotificationId: "",
    items: [],
    itemMap: new Map(),
    lastLoadedAt: 0,
    dedupeMap: new Map(),
    dedupeTtlMs: 6000,
    dedupeMaxEntries: 1000,
    staleToastWindowMs: 5000,
    staleToastMax: 2,
    staleToastWindowStart: 0,
    staleToastCount: 0,
    hasRealtimeDirty: false,
    realtimeRefreshTimer: null,
    dedupeCleanupTimer: null,
    listScrollAnimationFrame: null,
    dom: {
      panel: null,
      tabs: null,
      tabsList: null,
      tabsIndicator: null,
      list: null,
      loader: null,
      settingsBtn: null,
      closeBtn: null,
    },
    onResize: null,
  };

  function parseIntSafe(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.floor(parsed);
  }

  function normalizeId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function pickValue(source, ...keys) {
    if (!source || typeof source !== "object") return undefined;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        return source[key];
      }
    }
    return undefined;
  }

  function readString(source, ...keys) {
    const value = pickValue(source, ...keys);
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function readNumber(source, keys, fallback = 0) {
    const value = pickValue(source, ...(Array.isArray(keys) ? keys : [keys]));
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readBoolean(source, keys, fallback = false) {
    const value = pickValue(source, ...(Array.isArray(keys) ? keys : [keys]));
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
    return fallback;
  }

  function escapeHtml(input) {
    return (input || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveDefaultAvatarUrl() {
    const configured = (global.APP_CONFIG?.DEFAULT_AVATAR || "")
      .toString()
      .trim();
    return configured || "assets/images/default-avatar.jpg";
  }

  function getTimeAgoDisplay(value) {
    if (!value) return "";
    if (global.PostUtils && typeof global.PostUtils.timeAgo === "function") {
      return global.PostUtils.timeAgo(value, true);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60 * 1000) return "just now";
    if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))}m`;
    if (diffMs < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diffMs / (60 * 60 * 1000))}h`;
    }
    return `${Math.floor(diffMs / (24 * 60 * 60 * 1000))}d`;
  }

  function resolvePanelWidthPx() {
    const configured = parseIntSafe(
      global.APP_CONFIG?.NOTIFICATION_PANEL_WIDTH,
      380,
    );
    return Math.max(320, configured || 380);
  }

  function applyPanelWidthVariable() {
    const widthPx = resolvePanelWidthPx();
    document.documentElement.style.setProperty(
      "--notifications-panel-width",
      `${widthPx}px`,
    );
  }

  function setupConfigFromApp() {
    state.pageSize = Math.max(
      1,
      parseIntSafe(global.APP_CONFIG?.NOTIFICATIONS_PAGE_SIZE, 20),
    );
    state.dedupeTtlMs = Math.max(
      1000,
      parseIntSafe(global.APP_CONFIG?.NOTIFICATION_RT_DEDUPE_TTL_MS, 6000),
    );
    state.dedupeMaxEntries = Math.max(
      50,
      parseIntSafe(global.APP_CONFIG?.NOTIFICATION_RT_DEDUPE_MAX_ENTRIES, 1000),
    );
    state.staleToastWindowMs = Math.max(
      1000,
      parseIntSafe(
        global.APP_CONFIG?.NOTIFICATION_TOAST_RATE_LIMIT_WINDOW_MS,
        5000,
      ),
    );
    state.staleToastMax = Math.max(
      1,
      parseIntSafe(global.APP_CONFIG?.NOTIFICATION_TOAST_RATE_LIMIT_MAX, 2),
    );
    applyPanelWidthVariable();
  }

  function buildPanelHtml() {
    return `
      <div class="notifications-panel-header">
        <div class="notifications-header-title-area">
          <h2>Notifications</h2>
          <button class="chat-icon-btn notifications-panel-settings-btn" id="notifications-panel-settings-btn" title="Notification settings">
            <i data-lucide="settings" size="19"></i>
          </button>
        </div>
        <button class="chat-icon-btn notifications-panel-close-btn" id="notifications-panel-close-btn" title="Close notifications">
          <i data-lucide="x" size="22"></i>
        </button>
      </div>
      <div class="notifications-panel-tabs" id="notifications-panel-tabs">
        <div class="notifications-tabs-list">
          <button type="button" class="notifications-tab active" data-filter="${NOTIFICATION_FILTER.ALL}">All</button>
          <button type="button" class="notifications-tab" data-filter="${NOTIFICATION_FILTER.UNREAD}">Unread</button>
          <div class="notifications-tabs-indicator" id="notifications-tabs-indicator" aria-hidden="true"></div>
        </div>
      </div>
      <div class="notifications-panel-list" id="notifications-panel-list">
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>Loading notifications...</p>
        </div>
      </div>
      <div class="notifications-panel-more-loader" id="notifications-panel-more-loader" style="display:none;">
        <div class="spinner spinner-small"></div>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById("notifications-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "notifications-panel";
      panel.className = "notifications-panel";
      panel.innerHTML = buildPanelHtml();
      document.body.appendChild(panel);
    }

    state.dom.panel = panel;
    state.dom.tabs = panel.querySelector("#notifications-panel-tabs");
    state.dom.tabsList = panel.querySelector(".notifications-tabs-list");
    state.dom.tabsIndicator = panel.querySelector(
      "#notifications-tabs-indicator",
    );
    state.dom.list = panel.querySelector("#notifications-panel-list");
    state.dom.loader = panel.querySelector("#notifications-panel-more-loader");
    state.dom.settingsBtn = panel.querySelector(
      "#notifications-panel-settings-btn",
    );
    state.dom.closeBtn = panel.querySelector("#notifications-panel-close-btn");

    bindPanelEvents();

    if (global.lucide && typeof global.lucide.createIcons === "function") {
      global.lucide.createIcons();
    }
  }

  function bindPanelEvents() {
    if (state.dom.settingsBtn && !state.dom.settingsBtn.dataset.bound) {
      state.dom.settingsBtn.dataset.bound = "1";
      state.dom.settingsBtn.addEventListener("click", () => {
        if (global.toastInfo) {
          global.toastInfo("Notification settings coming soon");
        }
      });
    }

    if (state.dom.closeBtn && !state.dom.closeBtn.dataset.bound) {
      state.dom.closeBtn.dataset.bound = "1";
      state.dom.closeBtn.addEventListener("click", () => close());
    }

    if (state.dom.tabs && !state.dom.tabs.dataset.bound) {
      state.dom.tabs.dataset.bound = "1";
      state.dom.tabs.addEventListener("click", (event) => {
        const tabBtn = event.target.closest(".notifications-tab[data-filter]");
        if (!tabBtn) return;
        const nextFilter = tabBtn.dataset.filter;
        if (
          nextFilter !== NOTIFICATION_FILTER.ALL &&
          nextFilter !== NOTIFICATION_FILTER.UNREAD
        ) {
          return;
        }
        if (state.filter === nextFilter) {
          scrollNotificationsListToTop();
          return;
        }
        state.filter = nextFilter;
        updateTabUi();
        resetCursorAndItems();
        loadNotifications(false);
      });
    }

    if (state.dom.list && !state.dom.list.dataset.scrollBound) {
      state.dom.list.dataset.scrollBound = "1";
      state.dom.list.addEventListener("scroll", () => {
        if (!state.isOpen || state.isLoading || !state.hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = state.dom.list;
        if (scrollTop + clientHeight >= scrollHeight - 80) {
          loadNotifications(true);
        }
      });
    }

    if (state.dom.list && !state.dom.list.dataset.clickBound) {
      state.dom.list.dataset.clickBound = "1";
      state.dom.list.addEventListener("click", async (event) => {
        const actionBtn = event.target.closest(
          ".notifications-request-btn[data-request-action]",
        );
        if (actionBtn && state.dom.list.contains(actionBtn)) {
          event.preventDefault();
          event.stopPropagation();

          const itemEl = actionBtn.closest(".notifications-item");
          if (!itemEl) return;
          const notificationId = normalizeId(itemEl.dataset.notificationId);
          if (!notificationId) return;
          const item = state.itemMap.get(notificationId);
          if (!item) return;

          const action = (actionBtn.dataset.requestAction || "")
            .toString()
            .trim()
            .toLowerCase();
          if (!action) return;

          await handleFollowRequestAction(itemEl, item, action);
          return;
        }

        const itemEl = event.target.closest(".notifications-item");
        if (!itemEl || !state.dom.list.contains(itemEl)) return;
        const notificationId = normalizeId(itemEl.dataset.notificationId);
        if (!notificationId) return;
        const item = state.itemMap.get(notificationId);
        if (!item) return;
        await handleItemNavigation(item);
      });
    }

    if (state.dom.list && !state.dom.list.dataset.keydownBound) {
      state.dom.list.dataset.keydownBound = "1";
      state.dom.list.addEventListener("keydown", async (event) => {
        const key = (event.key || "").toLowerCase();
        if (key !== "enter" && key !== " ") return;

        const actionBtn = event.target.closest(
          ".notifications-request-btn[data-request-action]",
        );
        if (actionBtn && state.dom.list.contains(actionBtn)) {
          event.preventDefault();
          actionBtn.click();
          return;
        }

        const itemEl = event.target.closest(".notifications-item");
        if (!itemEl || !state.dom.list.contains(itemEl)) return;
        event.preventDefault();
        const notificationId = normalizeId(itemEl.dataset.notificationId);
        if (!notificationId) return;
        const item = state.itemMap.get(notificationId);
        if (!item) return;
        await handleItemNavigation(item);
      });
    }
  }

  function updateTabUi() {
    if (!state.dom.tabs) return;
    state.dom.tabs
      .querySelectorAll(".notifications-tab[data-filter]")
      .forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.filter === state.filter);
      });
    requestAnimationFrame(updateTabsIndicator);
  }

  function scrollNotificationsListToTop() {
    const listEl = state.dom.list;
    if (!listEl) return;
    const currentTop = Number(listEl.scrollTop) || 0;
    if (currentTop <= 0) return;

    if (state.listScrollAnimationFrame) {
      cancelAnimationFrame(state.listScrollAnimationFrame);
      state.listScrollAnimationFrame = null;
    }

    try {
      listEl.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    } catch (_) {
      // fallback below
    }

    const startTop = currentTop;
    const startTime = performance.now();
    const durationMs = 260;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = easeOutCubic(progress);
      listEl.scrollTop = Math.round(startTop * (1 - eased));

      if (progress < 1) {
        state.listScrollAnimationFrame = requestAnimationFrame(animate);
      } else {
        state.listScrollAnimationFrame = null;
      }
    };

    state.listScrollAnimationFrame = requestAnimationFrame(animate);
  }

  function updateTabsIndicator() {
    const tabsList = state.dom.tabsList;
    const indicator = state.dom.tabsIndicator;
    if (!tabsList || !indicator) return;

    const activeTab = tabsList.querySelector(".notifications-tab.active");
    if (!activeTab) {
      indicator.classList.remove("is-visible");
      return;
    }

    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    indicator.classList.add("is-visible");
  }

  function setSidebarNotificationsActive(isActive) {
    const item = document.querySelector(
      ".sidebar .menu-item[data-route='/notifications']",
    );
    if (!item) return;
    item.classList.toggle("active", !!isActive);
  }

  function isChatRouteActive() {
    const isChatPageByClass = document.body.classList.contains("is-chat-page");
    const parsedPath = global.RouteHelper?.parseHash
      ? global.RouteHelper.parseHash(global.location.hash || "").path || ""
      : "";
    const path = (parsedPath || "").toString().trim();

    if (path && global.RouteHelper?.isChatPath) {
      return !!global.RouteHelper.isChatPath(path) || isChatPageByClass;
    }

    if (path) {
      return (
        path === "/chat" ||
        path.startsWith("/chat/") ||
        path === "/messages" ||
        path.startsWith("/messages/") ||
        isChatPageByClass
      );
    }

    return isChatPageByClass;
  }

  function resetCursorAndItems() {
    state.cursorLastEventAt = "";
    state.cursorNotificationId = "";
    state.hasMore = true;
    state.items = [];
    state.itemMap.clear();
  }

  function normalizeNotificationItem(raw = {}) {
    const notificationId = readString(raw, "notificationId", "NotificationId");
    if (!notificationId) return null;

    const actorRaw = pickValue(raw, "actor", "Actor") || {};
    const actorAccountId = readString(actorRaw, "accountId", "AccountId");
    const actorUsername = readString(actorRaw, "username", "Username");
    const actorFullName = readString(actorRaw, "fullName", "FullName");
    const actorAvatarUrl = readString(actorRaw, "avatarUrl", "AvatarUrl");

    const type = parseIntSafe(readNumber(raw, ["type", "Type"], 0), 0);
    const notificationState = parseIntSafe(
      readNumber(raw, ["state", "State"], 0),
      0,
    );

    const canOpen =
      readBoolean(raw, ["canOpen", "CanOpen"], notificationState !== 1) &&
      notificationState !== NOTIFICATION_STATE.UNAVAILABLE;
    const thumbnailMediaType = parseIntSafe(
      readNumber(raw, ["thumbnailMediaType", "ThumbnailMediaType"], -1),
      -1,
    );
    const thumbnailMediaKind = readString(
      raw,
      "thumbnailMediaKind",
      "ThumbnailMediaKind",
      "thumbnailKind",
      "ThumbnailKind",
    ).toLowerCase();

    return {
      notificationId,
      type,
      state: notificationState,
      isRead: readBoolean(raw, ["isRead", "IsRead"], false),
      actorCount: parseIntSafe(
        readNumber(raw, ["actorCount", "ActorCount"], 0),
        0,
      ),
      eventCount: parseIntSafe(
        readNumber(raw, ["eventCount", "EventCount"], 0),
        0,
      ),
      text: readString(raw, "text", "Text") || "You have a new notification",
      targetKind: parseIntSafe(
        readNumber(raw, ["targetKind", "TargetKind"], 0),
        0,
      ),
      targetId: readString(raw, "targetId", "TargetId"),
      targetPostCode: readString(raw, "targetPostCode", "TargetPostCode"),
      thumbnailUrl: readString(raw, "thumbnailUrl", "ThumbnailUrl"),
      thumbnailMediaType,
      thumbnailMediaKind,
      createdAt: readString(raw, "createdAt", "CreatedAt"),
      lastEventAt: readString(raw, "lastEventAt", "LastEventAt"),
      canOpen,
      actor: {
        accountId: actorAccountId,
        username: actorUsername,
        fullName: actorFullName,
        avatarUrl: actorAvatarUrl,
      },
    };
  }

  function mergeUniqueByNotificationId(baseItems = [], incomingItems = []) {
    const seen = new Set();
    const result = [];
    const pushUnique = (item) => {
      const id = normalizeId(item?.notificationId);
      if (!id || seen.has(id)) return;
      seen.add(id);
      result.push(item);
    };

    baseItems.forEach(pushUnique);
    incomingItems.forEach(pushUnique);
    return result;
  }

  function getActorDisplayUsername(item) {
    return item.actor.username || item.actor.fullName || "Someone";
  }

  function truncateActorName(name) {
    const raw = (name || "").toString().trim();
    if (!raw) return "Someone";

    const truncateThreshold = 15;
    const visibleLength = 14;
    if (raw.length < truncateThreshold) return raw;
    return `${raw.slice(0, visibleLength).trimEnd()}...`;
  }

  function getActorTitleParts(item) {
    const rawPrimaryName = getActorDisplayUsername(item);
    const actorCount = Math.max(0, parseIntSafe(item?.actorCount, 0));
    const otherCount = actorCount > 1 ? actorCount - 1 : 0;
    const primaryName = truncateActorName(rawPrimaryName);
    return {
      primaryName,
      othersText:
        otherCount > 0
          ? `and ${otherCount} ${otherCount === 1 ? "other" : "others"}`
          : "",
    };
  }

  function buildNotificationActionText(item) {
    const rawText = (item?.text || "").toString().trim();
    if (!rawText) return "You have a new notification";

    // remove duplicated actor phrase; keep only action sentence
    const actionMatch = rawText.match(
      /\b(followed|commented|replied|tagged|mentioned|reacted|shared|wants|accepted)\b/i,
    );
    if (
      actionMatch &&
      typeof actionMatch.index === "number" &&
      actionMatch.index > 0
    ) {
      return rawText.slice(actionMatch.index).trim();
    }

    const primaryName = getActorDisplayUsername(item);
    if (primaryName) {
      const normalizedRaw = rawText.toLowerCase();
      const normalizedPrimary = primaryName.toLowerCase();
      if (normalizedRaw.startsWith(normalizedPrimary)) {
        const stripped = rawText.slice(primaryName.length).trim();
        if (stripped) return stripped;
      }
    }

    return rawText;
  }

  function hasUnavailableMessage(item) {
    const rawText = (item?.text || "").toString().trim().toLowerCase();
    if (!rawText) return false;
    return (
      rawText.includes("no longer available") ||
      rawText.includes("no longer have permission")
    );
  }

  function hasMissingTargetAccessInfo(item) {
    return (
      (item?.targetKind === NOTIFICATION_TARGET_KIND.POST &&
        !readString(item, "targetPostCode")) ||
      (item?.targetKind === NOTIFICATION_TARGET_KIND.STORY &&
        !readString(item, "targetId"))
    );
  }

  function isItemUnavailable(item) {
    return (
      item?.state === NOTIFICATION_STATE.UNAVAILABLE ||
      !item?.canOpen ||
      hasUnavailableMessage(item) ||
      hasMissingTargetAccessInfo(item)
    );
  }

  function buildActionTextFromType(type) {
    const normalizedType = parseIntSafe(type, -1);
    switch (normalizedType) {
      case NOTIFICATION_TYPE.FOLLOW:
        return "followed you";
      case NOTIFICATION_TYPE.POST_COMMENT:
        return "commented on your post";
      case NOTIFICATION_TYPE.COMMENT_REPLY:
        return "replied to your comment";
      case NOTIFICATION_TYPE.POST_TAG:
        return "tagged you in a post";
      case NOTIFICATION_TYPE.COMMENT_MENTION:
        return "mentioned you in a comment";
      case NOTIFICATION_TYPE.STORY_REPLY:
        return "replied to your story";
      case NOTIFICATION_TYPE.POST_REACT:
        return "reacted to your post";
      case NOTIFICATION_TYPE.STORY_REACT:
        return "reacted to your story";
      case NOTIFICATION_TYPE.FOLLOW_REQUEST:
        return "wants to follow you";
      case NOTIFICATION_TYPE.FOLLOW_REQUEST_ACCEPTED:
        return "accepted your follow request";
      default:
        return "sent a notification";
    }
  }

  function buildDisplayActionText(item, isUnavailable) {
    const parsedAction = buildNotificationActionText(item);
    if (!isUnavailable) return parsedAction;

    // unavailable item must still show action text, never unavailable placeholder text
    if (hasUnavailableMessage(item)) {
      return buildActionTextFromType(item?.type);
    }

    const normalizedParsed = (parsedAction || "")
      .toString()
      .trim()
      .toLowerCase();
    if (
      !normalizedParsed ||
      normalizedParsed.includes("no longer available") ||
      normalizedParsed.includes("no longer have permission")
    ) {
      return buildActionTextFromType(item?.type);
    }

    return parsedAction;
  }

  function ensureSentencePunctuation(text) {
    const raw = (text || "").toString().trim();
    if (!raw) return raw;
    if (/[.!?]$/.test(raw)) return raw;
    return `${raw}.`;
  }

  function getFollowRequestActorId(item) {
    const actor = item?.actor || {};
    const actorId = readString(actor, "accountId", "AccountId");
    return isGuidLike(actorId) ? actorId : "";
  }

  function canRenderFollowRequestActions(item) {
    if (!item || typeof item !== "object") return false;
    if (parseIntSafe(item.type, -1) !== NOTIFICATION_TYPE.FOLLOW_REQUEST) {
      return false;
    }
    if (isItemUnavailable(item)) return false;
    if (parseIntSafe(item.actorCount, 0) !== 1) return false;
    return !!getFollowRequestActorId(item);
  }

  function resolveFollowRequestActionErrorMessage(status, isAccept) {
    if (status === 401) return "Your session has expired. Please sign in again.";
    if (status === 403) {
      return isAccept
        ? "You do not have permission to accept this follow request."
        : "You do not have permission to remove this follow request.";
    }
    if (status === 404 || status === 410) {
      return "This follow request is no longer available.";
    }
    if (status === 409) {
      return "Follow request state changed. Please refresh and try again.";
    }
    if (status === 400) {
      return isAccept
        ? "Could not accept this follow request right now."
        : "Could not remove this follow request right now.";
    }
    return isAccept
      ? "Could not accept this follow request. Please try again."
      : "Could not remove this follow request. Please try again.";
  }

  async function handleFollowRequestAction(itemEl, item, action) {
    if (!itemEl || !item) return;
    if (itemEl.dataset.requestPending === "1") return;

    const requesterId = getFollowRequestActorId(item);
    if (!requesterId) {
      if (global.toastError) global.toastError("Invalid follow request.");
      return;
    }

    const normalizedAction = (action || "").toString().trim().toLowerCase();
    const isAccept = normalizedAction === "accept";
    const isRemove = normalizedAction === "remove";
    if (!isAccept && !isRemove) return;

    const actionApi = isAccept
      ? global.API?.Follows?.acceptRequest
      : global.API?.Follows?.removeRequest;
    if (typeof actionApi !== "function") {
      if (global.toastError) global.toastError("Follow request API is unavailable.");
      return;
    }

    itemEl.dataset.requestPending = "1";
    const actionButtons = itemEl.querySelectorAll(".notifications-request-btn");
    actionButtons.forEach((btn) => {
      btn.disabled = true;
      btn.classList.add("is-disabled");
      btn.setAttribute("aria-disabled", "true");
    });

    try {
      const res = await actionApi(requesterId);
      if (!res?.ok) {
        throw new Error(
          resolveFollowRequestActionErrorMessage(res.status, isAccept),
        );
      }

      if (isAccept) {
        if (global.toastSuccess) {
          global.toastSuccess("Follow request accepted.");
        } else if (global.toastInfo) {
          global.toastInfo("Follow request accepted.");
        }
      } else if (global.toastInfo) {
        global.toastInfo("Follow request removed.");
      }

      await loadNotifications(false, {
        showLoader: false,
        patchDom: true,
        animateNewItems: true,
        silent: true,
      });
      refreshUnreadBadge(40);
    } catch (error) {
      if (global.toastError) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : resolveFollowRequestActionErrorMessage(0, isAccept);
        global.toastError(message);
      }
    } finally {
      delete itemEl.dataset.requestPending;
      actionButtons.forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("is-disabled");
        btn.removeAttribute("aria-disabled");
      });
    }
  }

  function isLikelyVideoUrl(url) {
    const raw = (url || "").toString().trim();
    if (!raw) return false;
    if (/\.(mp4|webm|mov|m4v|avi|mkv)(\?|#|$)/i.test(raw)) return true;
    if (/[?&](format|ext|fm|f)=mp4([&#]|$)/i.test(raw)) return true;
    if (/[?&](resource_type|type)=video([&#]|$)/i.test(raw)) return true;
    if (/\/video\//i.test(raw)) return true;
    return false;
  }

  function resolveThumbnailMediaKind(item) {
    const explicitKind = (item?.thumbnailMediaKind || "").toLowerCase();
    if (explicitKind === "video" || explicitKind === "image") {
      return explicitKind;
    }

    const mediaType = parseIntSafe(item?.thumbnailMediaType, -1);
    if (mediaType === 1) return "video";
    if (mediaType === 0) return "image";

    return isLikelyVideoUrl(item?.thumbnailUrl) ? "video" : "image";
  }

  function removeBrokenThumbnail(imgEl) {
    if (!imgEl) return;
    if (imgEl.parentNode) {
      imgEl.parentNode.removeChild(imgEl);
    }
  }

  function createElementFromHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = (html || "").toString().trim();
    return template.content.firstElementChild;
  }

  function getItemRenderSignature(item) {
    if (!item || typeof item !== "object") return "";
    const actor = item.actor || {};
    return [
      item.type,
      item.state,
      item.isRead ? 1 : 0,
      item.actorCount,
      item.eventCount,
      item.text,
      item.targetKind,
      item.targetId,
      item.targetPostCode,
      item.thumbnailUrl,
      item.thumbnailMediaType,
      item.thumbnailMediaKind,
      item.canOpen ? 1 : 0,
      actor.accountId,
      actor.username,
      actor.fullName,
      actor.avatarUrl,
    ]
      .map((x) => (x ?? "").toString())
      .join("|");
  }

  function applyImageFallbackHandlers() {
    if (!state.dom.list) return;
    const defaultAvatar = resolveDefaultAvatarUrl();

    state.dom.list
      .querySelectorAll(".notifications-item-avatar")
      .forEach((img) => {
        if (!img.dataset.fallbackBound) {
          img.dataset.fallbackBound = "1";
          img.addEventListener("error", () => {
            if (img.dataset.avatarFallbackApplied === "1") return;
            img.dataset.avatarFallbackApplied = "1";
            img.src = defaultAvatar;
          });
        }

        if (
          img.complete &&
          img.naturalWidth === 0 &&
          img.dataset.avatarFallbackApplied !== "1"
        ) {
          img.dataset.avatarFallbackApplied = "1";
          img.src = defaultAvatar;
        }
      });

    state.dom.list
      .querySelectorAll(".notifications-item-thumbnail")
      .forEach((img) => {
        if (!img.dataset.fallbackBound) {
          img.dataset.fallbackBound = "1";
          img.addEventListener("error", () => removeBrokenThumbnail(img));
        }

        if (img.complete && img.naturalWidth === 0) {
          removeBrokenThumbnail(img);
        }
      });
  }

  function buildNotificationItemHtml(item, enterIdSet = null) {
    const isUnavailable = isItemUnavailable(item);
    const showThumbnail =
      !isUnavailable &&
      !!item.thumbnailUrl &&
      (item.targetKind === NOTIFICATION_TARGET_KIND.POST ||
        item.targetKind === NOTIFICATION_TARGET_KIND.STORY);

    const actorAvatar = item.actor.avatarUrl || resolveDefaultAvatarUrl();
    const actorUsername = getActorDisplayUsername(item);
    const actorTitle = getActorTitleParts(item);
    const actionText = ensureSentencePunctuation(
      buildDisplayActionText(item, isUnavailable),
    );
    const thumbnailMediaKind = resolveThumbnailMediaKind(item);
    const timeLabel = getTimeAgoDisplay(item.lastEventAt || item.createdAt);
    const unreadClass = item.isRead ? "" : " unread";
    const unavailableClass = isUnavailable ? " unavailable" : "";
    const enterClass =
      enterIdSet && enterIdSet.has(normalizeId(item.notificationId))
        ? " notifications-item-enter"
        : "";
    const typeClass = `type-${item.type}`;
    const showFollowRequestActions = canRenderFollowRequestActions(item);
    const followRequestActionsHtml = showFollowRequestActions
      ? `
        <div class="notifications-item-actions">
          <button type="button" class="notifications-request-btn accept" data-request-action="accept">Accept</button>
          <button type="button" class="notifications-request-btn remove" data-request-action="remove">Remove</button>
        </div>
      `
      : "";

    return `
      <div
        role="button"
        tabindex="0"
        class="notifications-item${unreadClass}${unavailableClass}${enterClass} ${typeClass}"
        data-notification-id="${escapeHtml(item.notificationId)}"
      >
        <div class="notifications-item-avatar-wrap">
          <img class="notifications-item-avatar" src="${escapeHtml(actorAvatar)}" alt="${escapeHtml(actorUsername)}" data-media-fallback-ignore="true">
        </div>
        <div class="notifications-item-body">
          <div class="notifications-item-top-row">
            <span class="notifications-item-sentence">
              <span class="notifications-item-sentence-actor">${escapeHtml(actorTitle.primaryName)}</span>${
                actorTitle.othersText
                  ? ` <span class="notifications-item-sentence-others">${escapeHtml(actorTitle.othersText)}</span>`
                  : ""
              }
              <span class="notifications-item-sentence-action"> ${escapeHtml(actionText)}</span>
            </span>
            ${
              showThumbnail
                ? `<img class="notifications-item-thumbnail" src="${escapeHtml(item.thumbnailUrl)}" alt="thumbnail" data-media-kind="${thumbnailMediaKind}" data-media-fallback-ignore="true">`
                : ""
            }
            <span class="notifications-item-time">${escapeHtml(timeLabel)}</span>
          </div>
          ${followRequestActionsHtml}
        </div>
      </div>
    `;
  }

  function renderItems(options = {}) {
    if (!state.dom.list) return;
    const enterIdSet =
      options.enterIdSet instanceof Set ? options.enterIdSet : null;
    state.itemMap.clear();
    state.items.forEach((item) => {
      state.itemMap.set(normalizeId(item.notificationId), item);
    });

    if (!state.items.length) {
      const emptyText =
        state.filter === NOTIFICATION_FILTER.UNREAD
          ? "No unread notifications."
          : "No notifications yet.";
      state.dom.list.innerHTML = `
        <div class="notifications-panel-empty">
          <i data-lucide="bell"></i>
          <p>${escapeHtml(emptyText)}</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === "function") {
        global.lucide.createIcons();
      }
      return;
    }

    state.dom.list.innerHTML = state.items
      .map((item) => buildNotificationItemHtml(item, enterIdSet))
      .join("");
    applyImageFallbackHandlers();
  }

  function renderItemsPatched(options = {}) {
    if (!state.dom.list) return;
    if (!state.items.length) {
      renderItems(options);
      return;
    }

    const enterIdSet =
      options.enterIdSet instanceof Set ? options.enterIdSet : null;
    const previousItemsById =
      options.previousItemsById instanceof Map
        ? options.previousItemsById
        : null;

    state.itemMap.clear();
    state.items.forEach((item) => {
      state.itemMap.set(normalizeId(item.notificationId), item);
    });

    const listEl = state.dom.list;
    listEl
      .querySelectorAll(":scope > :not(.notifications-item)")
      .forEach((node) => node.remove());

    const existingById = new Map();
    listEl.querySelectorAll(".notifications-item").forEach((node) => {
      const id = normalizeId(node.dataset.notificationId);
      if (!id) return;
      existingById.set(id, node);
    });

    const desiredNodes = [];
    const desiredIdSet = new Set();

    state.items.forEach((item) => {
      const id = normalizeId(item.notificationId);
      if (!id) return;
      desiredIdSet.add(id);

      const existingNode = existingById.get(id) || null;
      const previousItem = previousItemsById ? previousItemsById.get(id) : null;
      const shouldReplace =
        !existingNode ||
        !previousItem ||
        getItemRenderSignature(previousItem) !== getItemRenderSignature(item);

      if (shouldReplace) {
        const nextNode = createElementFromHtml(
          buildNotificationItemHtml(item, enterIdSet),
        );
        if (!nextNode) return;

        if (existingNode && existingNode.parentElement === listEl) {
          existingNode.replaceWith(nextNode);
        }

        existingById.set(id, nextNode);
        desiredNodes.push(nextNode);
        return;
      }

      desiredNodes.push(existingNode);
    });

    existingById.forEach((node, id) => {
      if (!desiredIdSet.has(id) && node.parentElement === listEl) {
        node.remove();
      }
    });

    let cursor = listEl.firstElementChild;
    desiredNodes.forEach((node) => {
      if (!node) return;
      if (node.parentElement !== listEl) {
        listEl.insertBefore(node, cursor);
        return;
      }
      if (node !== cursor) {
        listEl.insertBefore(node, cursor);
        return;
      }
      cursor = cursor ? cursor.nextElementSibling : null;
    });

    let extra = listEl.firstElementChild;
    while (extra) {
      const next = extra.nextElementSibling;
      const extraId = normalizeId(extra.dataset?.notificationId);
      if (!extraId || !desiredIdSet.has(extraId)) {
        extra.remove();
      }
      extra = next;
    }

    applyImageFallbackHandlers();
  }

  function setMoreLoaderVisible(visible) {
    if (!state.dom.loader) return;
    state.dom.loader.style.display = visible ? "flex" : "none";
  }

  async function loadNotifications(isLoadMore = false, options = {}) {
    if (!global.API?.Notifications?.getNotifications) return;
    if (state.isLoading) return;
    if (isLoadMore && !state.hasMore) return;

    const silentMode = options.silent === true;
    const showLoader = !isLoadMore && options.showLoader !== false;
    const animateNewItems = !isLoadMore && options.animateNewItems === true;
    const patchDom = !isLoadMore && options.patchDom === true;
    const previousItemIdSet = animateNewItems
      ? new Set(state.items.map((item) => normalizeId(item.notificationId)))
      : null;
    const previousItemsById = patchDom
      ? new Map(
          state.items.map((item) => [normalizeId(item.notificationId), item]),
        )
      : null;

    state.isLoading = true;
    if (isLoadMore) {
      setMoreLoaderVisible(true);
    } else if (showLoader && state.dom.list) {
      state.dom.list.innerHTML = `
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>Loading notifications...</p>
        </div>
      `;
    }

    try {
      const res = await global.API.Notifications.getNotifications({
        limit: state.pageSize,
        cursorLastEventAt: isLoadMore ? state.cursorLastEventAt : null,
        cursorNotificationId: isLoadMore ? state.cursorNotificationId : null,
        filter: state.filter,
      });

      if (!res?.ok) {
        if (!isLoadMore && !silentMode && global.toastError) {
          global.toastError("Failed to load notifications.");
        }
        return;
      }

      const data = await res.json().catch(() => null);
      const rawItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.Items)
          ? data.Items
          : [];
      const normalizedItems = rawItems
        .map((item) => normalizeNotificationItem(item))
        .filter(Boolean);

      if (isLoadMore) {
        state.items = mergeUniqueByNotificationId(state.items, normalizedItems);
      } else {
        state.items = mergeUniqueByNotificationId([], normalizedItems);
      }

      const nextCursor = data?.nextCursor || data?.NextCursor || null;
      state.cursorLastEventAt = readString(
        nextCursor || {},
        "lastEventAt",
        "LastEventAt",
      );
      state.cursorNotificationId = readString(
        nextCursor || {},
        "notificationId",
        "NotificationId",
      );
      state.hasMore = !!(state.cursorLastEventAt && state.cursorNotificationId);
      state.lastLoadedAt = Date.now();

      let enterIdSet = null;
      if (animateNewItems && previousItemIdSet instanceof Set) {
        enterIdSet = new Set();
        state.items.forEach((item) => {
          const id = normalizeId(item.notificationId);
          if (!id || previousItemIdSet.has(id)) return;
          enterIdSet.add(id);
        });
      }

      if (patchDom) {
        renderItemsPatched({ enterIdSet, previousItemsById });
      } else {
        renderItems({ enterIdSet });
      }
      state.hasRealtimeDirty = false;
    } catch (_) {
      if (!isLoadMore && !silentMode && global.toastError) {
        global.toastError("Failed to load notifications.");
      }
    } finally {
      state.isLoading = false;
      setMoreLoaderVisible(false);
      refreshUnreadBadge(0);
    }
  }

  function refreshUnreadBadge(delay = 0) {
    if (typeof global.scheduleGlobalNotificationUnreadRefresh === "function") {
      global.scheduleGlobalNotificationUnreadRefresh(delay);
      return;
    }
    if (typeof global.loadGlobalNotificationBadge === "function") {
      global.loadGlobalNotificationBadge();
    }
  }

  function showRateLimitedUnavailableToast(message) {
    const now = Date.now();
    if (now - state.staleToastWindowStart > state.staleToastWindowMs) {
      state.staleToastWindowStart = now;
      state.staleToastCount = 0;
    }

    if (state.staleToastCount >= state.staleToastMax) return;
    state.staleToastCount += 1;

    if (global.toastInfo) {
      global.toastInfo(message || "This content is no longer available");
    }
  }

  function showRateLimitedOpenFailedToast(message) {
    const now = Date.now();
    if (now - state.staleToastWindowStart > state.staleToastWindowMs) {
      state.staleToastWindowStart = now;
      state.staleToastCount = 0;
    }

    if (state.staleToastCount >= state.staleToastMax) return;
    state.staleToastCount += 1;

    if (global.toastError) {
      global.toastError(message || "Failed to open this content.");
      return;
    }
    if (global.toastInfo) {
      global.toastInfo(message || "Failed to open this content.");
    }
  }

  function isGuidLike(value) {
    const raw = (value || "").toString().trim();
    if (!raw) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    );
  }

  function getUnavailableMessageByStatus(status) {
    if (status === 401 || status === 403) {
      return "You no longer have permission to view this content";
    }
    if (status === 400 || status === 404 || status === 410) {
      return "This content is no longer available";
    }
    return "";
  }

  function readAccountInfoFromPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    return (
      payload.accountInfo ||
      payload.AccountInfo ||
      payload.account ||
      payload.Account ||
      {}
    );
  }

  function readAccountId(accountInfo) {
    return (
      accountInfo.accountId ??
      accountInfo.AccountId ??
      accountInfo.id ??
      accountInfo.Id ??
      ""
    )
      .toString()
      .trim();
  }

  function readAccountUsername(accountInfo) {
    return (accountInfo.username ?? accountInfo.Username ?? "")
      .toString()
      .trim();
  }

  async function resolveProfileNavigationTarget(item) {
    const targetIdRaw = (item?.targetId || "").toString().trim();
    const actorAccountIdRaw = (item?.actor?.accountId || "").toString().trim();
    const actorUsernameRaw = (item?.actor?.username || "").toString().trim();

    const accountIdCandidate = isGuidLike(targetIdRaw)
      ? targetIdRaw
      : actorAccountIdRaw;
    const usernameCandidate = !isGuidLike(targetIdRaw)
      ? targetIdRaw || actorUsernameRaw
      : actorUsernameRaw;

    if (!global.API?.Accounts) {
      return {
        ok: false,
        message: "This content is no longer available",
      };
    }

    const accountApi = global.API.Accounts;
    let fallbackMessage = "";

    if (accountIdCandidate && typeof accountApi.getProfile === "function") {
      try {
        const res = await accountApi.getProfile(accountIdCandidate);
        if (res?.ok) {
          const payload = await res.json().catch(() => null);
          const accountInfo = readAccountInfoFromPayload(payload);
          const username =
            readAccountUsername(accountInfo) || usernameCandidate;
          const accountId = readAccountId(accountInfo) || accountIdCandidate;
          const profileTarget = username || accountId;
          if (profileTarget) {
            return { ok: true, profileTarget };
          }
          return {
            ok: false,
            message: "This content is no longer available",
          };
        }

        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          return { ok: false, message: unavailableMessage };
        }
        fallbackMessage = "Failed to open this profile.";
      } catch (_) {
        fallbackMessage = "Failed to open this profile.";
      }
    }

    if (
      usernameCandidate &&
      typeof accountApi.getProfileByUsername === "function"
    ) {
      try {
        const res = await accountApi.getProfileByUsername(usernameCandidate);
        if (res?.ok) {
          const payload = await res.json().catch(() => null);
          const accountInfo = readAccountInfoFromPayload(payload);
          const username =
            readAccountUsername(accountInfo) || usernameCandidate;
          const accountId = readAccountId(accountInfo) || accountIdCandidate;
          const profileTarget = username || accountId;
          if (profileTarget) {
            return { ok: true, profileTarget };
          }
          return {
            ok: false,
            message: "This content is no longer available",
          };
        }

        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          return { ok: false, message: unavailableMessage };
        }
        fallbackMessage = "Failed to open this profile.";
      } catch (_) {
        fallbackMessage = "Failed to open this profile.";
      }
    }

    return {
      ok: false,
      message: fallbackMessage || "This content is no longer available",
    };
  }

  async function openProfileTarget(item) {
    const resolved = await resolveProfileNavigationTarget(item);
    if (!resolved?.ok || !resolved.profileTarget) {
      const message = (resolved?.message || "").toString().toLowerCase();
      if (message.includes("failed to open")) {
        showRateLimitedOpenFailedToast(resolved.message);
      } else {
        showRateLimitedUnavailableToast(
          resolved?.message || "This content is no longer available",
        );
      }
      return false;
    }

    const profileTarget = resolved.profileTarget;
    if (global.RouteHelper?.buildProfilePath && global.RouteHelper?.goTo) {
      global.RouteHelper.goTo(
        global.RouteHelper.buildProfilePath(profileTarget),
      );
      return true;
    }

    global.location.hash = `#/${encodeURIComponent(profileTarget)}`;
    return true;
  }

  async function openPostTarget(item) {
    const postCode = (item.targetPostCode || "").toString().trim();
    if (!postCode) {
      showRateLimitedUnavailableToast("This content is no longer available");
      return false;
    }

    if (typeof global.openPostDetailByCode === "function") {
      const openResult = await global.openPostDetailByCode(postCode);
      return openResult !== false;
    }

    if (!global.API?.Posts?.getByPostCode) {
      showRateLimitedOpenFailedToast("Failed to open this post.");
      return false;
    }

    try {
      const res = await global.API.Posts.getByPostCode(postCode);
      if (!res?.ok) {
        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          showRateLimitedUnavailableToast(unavailableMessage);
        } else {
          showRateLimitedOpenFailedToast("Failed to open this post.");
        }
        return false;
      }
    } catch (_) {
      showRateLimitedOpenFailedToast("Failed to open this post.");
      return false;
    }

    if (global.RouteHelper?.buildPostDetailPath && global.RouteHelper?.goTo) {
      const path = global.RouteHelper.buildPostDetailPath(postCode);
      global.RouteHelper.goTo(path);
      return true;
    }

    global.location.hash = `#/posts/${encodeURIComponent(postCode)}`;
    return true;
  }

  async function openStoryTarget(item) {
    const storyId = (item.targetId || "").toString().trim();
    if (!storyId) {
      showRateLimitedUnavailableToast("This content is no longer available");
      return false;
    }

    if (typeof global.openStoryViewerByStoryId === "function") {
      const status = await global.openStoryViewerByStoryId(storyId, {
        syncUrl: true,
        redirectOnNotFound: false,
        redirectOnForbidden: false,
      });
      return status === STORY_OPEN_STATUS.SUCCESS;
    }

    if (!global.API?.Stories?.resolveByStoryId) {
      showRateLimitedOpenFailedToast("Failed to open this story.");
      return false;
    }

    try {
      const res = await global.API.Stories.resolveByStoryId(storyId);
      if (!res?.ok) {
        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          showRateLimitedUnavailableToast(unavailableMessage);
        } else {
          showRateLimitedOpenFailedToast("Failed to open this story.");
        }
        return false;
      }
    } catch (_) {
      showRateLimitedOpenFailedToast("Failed to open this story.");
      return false;
    }

    if (global.RouteHelper?.goTo) {
      global.RouteHelper.goTo(`/stories/${encodeURIComponent(storyId)}`);
      return true;
    }

    global.location.hash = `#/stories/${encodeURIComponent(storyId)}`;
    return true;
  }

  async function handleItemNavigation(item) {
    if (!item) return;
    if (isItemUnavailable(item)) {
      const message = hasUnavailableMessage(item)
        ? item.text
        : "This content is no longer available";
      showRateLimitedUnavailableToast(message);
      return;
    }

    let opened = false;
    if (item.targetKind === NOTIFICATION_TARGET_KIND.ACCOUNT) {
      opened = await openProfileTarget(item);
    } else if (item.targetKind === NOTIFICATION_TARGET_KIND.POST) {
      opened = await openPostTarget(item);
    } else if (item.targetKind === NOTIFICATION_TARGET_KIND.STORY) {
      opened = await openStoryTarget(item);
    } else {
      showRateLimitedUnavailableToast("This content is no longer available");
      return;
    }

    if (opened) {
      close();
    }
  }

  function cleanupRealtimeDedupeMap(force = false) {
    const now = Date.now();
    for (const [key, ts] of state.dedupeMap.entries()) {
      if (force || now - ts > state.dedupeTtlMs) {
        state.dedupeMap.delete(key);
      }
    }

    while (state.dedupeMap.size > state.dedupeMaxEntries) {
      const firstKey = state.dedupeMap.keys().next().value;
      if (!firstKey) break;
      state.dedupeMap.delete(firstKey);
    }
  }

  function isDuplicateRealtimeEvent(eventKey) {
    if (!eventKey) return false;

    cleanupRealtimeDedupeMap(false);
    const now = Date.now();
    const previousTs = state.dedupeMap.get(eventKey);
    if (
      typeof previousTs === "number" &&
      now - previousTs < state.dedupeTtlMs
    ) {
      return true;
    }

    state.dedupeMap.set(eventKey, now);
    cleanupRealtimeDedupeMap(false);
    return false;
  }

  function scheduleRealtimeRefresh() {
    if (!state.isOpen) return;
    if (state.realtimeRefreshTimer) return;
    state.realtimeRefreshTimer = setTimeout(() => {
      state.realtimeRefreshTimer = null;
      if (!state.isOpen) return;
      if (state.isLoading) {
        scheduleRealtimeRefresh();
        return;
      }
      loadNotifications(false, {
        showLoader: false,
        animateNewItems: true,
        patchDom: true,
        silent: true,
      });
    }, 180);
  }

  function removeItemLocally(notificationId) {
    const normalizedId = normalizeId(notificationId);
    if (!normalizedId || !state.items.length) return;
    const nextItems = state.items.filter(
      (item) => normalizeId(item.notificationId) !== normalizedId,
    );
    if (nextItems.length === state.items.length) return;
    state.items = nextItems;
    renderItems();
  }

  function handleRealtimeChanged(payload = {}) {
    const myId = normalizeId(localStorage.getItem("accountId"));
    const targetAccountId = normalizeId(
      readString(payload, "targetAccountId", "TargetAccountId"),
    );
    if (targetAccountId && myId && targetAccountId !== myId) return;

    const action = (
      readString(payload, "action", "Action") || "upsert"
    ).toLowerCase();
    const notificationId = readString(
      payload,
      "notificationId",
      "NotificationId",
    );
    const eventKey = `${action}:${normalizeId(notificationId)}`;
    if (isDuplicateRealtimeEvent(eventKey)) return;
    state.hasRealtimeDirty = true;

    if (action === "remove" && notificationId) {
      removeItemLocally(notificationId);
    }

    scheduleRealtimeRefresh();
    refreshUnreadBadge(80);
  }

  async function open() {
    init();

    if (state.isOpen) {
      return;
    }

    if (typeof global.closeChatSidebar === "function") {
      global.closeChatSidebar(true);
    }

    state.dom.panel?.classList.add("show");
    document.body.classList.add("notifications-panel-open");
    state.isOpen = true;
    setSidebarNotificationsActive(true);

    updateTabUi();

    const shouldReload =
      state.hasRealtimeDirty ||
      !state.lastLoadedAt ||
      Date.now() - state.lastLoadedAt > 15000;
    if (shouldReload) {
      resetCursorAndItems();
      await loadNotifications(false);
    } else {
      renderItems();
      refreshUnreadBadge(0);
    }
  }

  function close() {
    if (!state.isOpen) return;
    const shouldRestoreChatSidebar = isChatRouteActive();

    state.dom.panel?.classList.remove("show");
    document.body.classList.remove("notifications-panel-open");
    state.isOpen = false;
    setSidebarNotificationsActive(false);

    if (typeof global.setActiveSidebar === "function") {
      const path = global.RouteHelper?.parseHash
        ? global.RouteHelper.parseHash(global.location.hash || "").path
        : "";
      global.setActiveSidebar(path);
    }

    if (
      shouldRestoreChatSidebar &&
      global.ChatSidebar &&
      !global.ChatSidebar.isOpen &&
      typeof global.ChatSidebar.open === "function"
    ) {
      Promise.resolve(global.ChatSidebar.open()).catch(() => {
        // no-op
      });
    }
  }

  async function toggle() {
    if (state.isOpen) {
      close();
      return;
    }
    await open();
  }

  function init() {
    if (state.initialized) return;
    setupConfigFromApp();
    ensurePanel();
    updateTabUi();
    refreshUnreadBadge(0);

    if (!state.onResize) {
      state.onResize = () => updateTabsIndicator();
      global.addEventListener("resize", state.onResize);
    }

    if (!state.dedupeCleanupTimer) {
      state.dedupeCleanupTimer = setInterval(
        () => cleanupRealtimeDedupeMap(false),
        Math.max(2000, Math.floor(state.dedupeTtlMs / 2)),
      );
    }

    state.initialized = true;
  }

  global.NotificationsPanel = {
    init,
    open,
    close,
    toggle,
    reload: () => {
      resetCursorAndItems();
      return loadNotifications(false);
    },
    handleRealtimeChanged,
    get isOpen() {
      return state.isOpen;
    },
  };

  global.toggleNotificationsPanel = () => global.NotificationsPanel.toggle();
  global.closeNotificationsPanel = () => global.NotificationsPanel.close();

  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
})(window);
