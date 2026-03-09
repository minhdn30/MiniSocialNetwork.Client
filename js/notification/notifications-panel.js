(function (global) {
  const NOTIFICATION_FILTER = Object.freeze({
    ALL: "all",
    UNREAD: "unread",
    REQUESTS: "requests",
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
    listLoadSequence: 0,
    activeListLoadToken: 0,
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
    hasFollowRequestDirty: false,
    followRequestRefreshTimer: null,
    followRequestSyncPlaceholderTimer: null,
    followRequestSyncToken: 0,
    isFollowRequestSyncing: false,
    isFollowRequestSkeletonVisible: false,
    followRequestCount: 0,
    dedupeCleanupTimer: null,
    listScrollAnimationFrame: null,
    followRequestLastLoadedAt: 0,
    cursorRequestCreatedAt: "",
    cursorRequesterId: "",
    dom: {
      panel: null,
      tabs: null,
      tabsList: null,
      tabsIndicator: null,
      requestsTab: null,
      requestsTabBadge: null,
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

  function npT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback) : fallback;
  }

  function npTranslateLiteral(value) {
    const raw = (value || "").toString().trim();
    if (!raw) return "";
    return global.I18n?.translateServerText
      ? global.I18n.translateServerText(raw)
      : global.I18n?.translateLiteral
        ? global.I18n.translateLiteral(raw)
      : raw;
  }

  function isRequestsFilter(filter = state.filter) {
    return (filter || "").toString().trim().toLowerCase() === NOTIFICATION_FILTER.REQUESTS;
  }

  function isSupportedFilter(filter) {
    const normalized = (filter || "").toString().trim().toLowerCase();
    return (
      normalized === NOTIFICATION_FILTER.ALL ||
      normalized === NOTIFICATION_FILTER.UNREAD ||
      normalized === NOTIFICATION_FILTER.REQUESTS
    );
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const lang = (
      global.I18n?.getLanguage?.() ||
      localStorage.getItem("appLanguage") ||
      "en"
    )
      .toString()
      .trim()
      .toLowerCase();
    if (diffMs < 60 * 1000) {
      return npT("notifications.time.justNow", {}, "just now");
    }
    if (diffMs < 60 * 60 * 1000) {
      const minutes = Math.floor(diffMs / (60 * 1000));
      return npT("notifications.time.minuteShort", { count: minutes }, "{count}m");
    }
    if (diffMs < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diffMs / (60 * 60 * 1000));
      return npT("notifications.time.hourShort", { count: hours }, "{count}h");
    }
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return npT("notifications.time.dayShort", { count: days }, "{count}d");
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
          <h2>${escapeHtml(npT("notification.panel.title"))}</h2>
          <button class="chat-icon-btn notifications-panel-settings-btn" id="notifications-panel-settings-btn" title="${escapeHtml(npT("notification.panel.settingsTitle"))}">
            <i data-lucide="settings" size="19"></i>
          </button>
        </div>
        <button class="chat-icon-btn notifications-panel-close-btn" id="notifications-panel-close-btn" title="${escapeHtml(npT("notification.panel.closeTitle"))}">
          <i data-lucide="x" size="22"></i>
        </button>
      </div>
      <div class="notifications-panel-tabs" id="notifications-panel-tabs">
        <div class="notifications-tabs-list">
          <button type="button" class="notifications-tab active" data-filter="${NOTIFICATION_FILTER.ALL}">${escapeHtml(npT("notification.panel.tabAll"))}</button>
          <button type="button" class="notifications-tab" data-filter="${NOTIFICATION_FILTER.UNREAD}">${escapeHtml(npT("notification.panel.tabUnread"))}</button>
          <button type="button" class="notifications-tab" data-filter="${NOTIFICATION_FILTER.REQUESTS}">
            <span class="notifications-tab-label">${escapeHtml(npT("notification.panel.tabRequests"))}</span>
            <span class="notifications-tab-badge" data-tab-badge="requests" hidden></span>
          </button>
          <div class="notifications-tabs-indicator" id="notifications-tabs-indicator" aria-hidden="true"></div>
        </div>
      </div>
      <div class="notifications-panel-list" id="notifications-panel-list">
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>${escapeHtml(npT("notification.panel.loadingNotifications"))}</p>
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
    state.dom.requestsTab = panel.querySelector(
      `.notifications-tab[data-filter="${NOTIFICATION_FILTER.REQUESTS}"]`,
    );
    state.dom.requestsTabBadge = panel.querySelector(
      '.notifications-tab-badge[data-tab-badge="requests"]',
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

    updateFollowRequestTabBadge();
  }

  function refreshPanelLocalization() {
    if (!state.dom.panel) return;

    const previousScrollTop = state.dom.list ? Number(state.dom.list.scrollTop) || 0 : 0;
    state.dom.panel.innerHTML = buildPanelHtml();
    ensurePanel();
    updateTabUi();

    if (state.dom.list) {
      state.dom.list.scrollTop = Math.max(0, previousScrollTop);
    }

    if (state.isLoading && !state.items.length && state.dom.list) {
      state.dom.list.innerHTML = `
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>${escapeHtml(getLoadingLabel())}</p>
        </div>
      `;
    } else {
      renderItems();
    }

    setMoreLoaderVisible(state.isLoading && state.hasMore);
  }

  function bindPanelEvents() {
    if (state.dom.settingsBtn && !state.dom.settingsBtn.dataset.bound) {
      state.dom.settingsBtn.dataset.bound = "1";
      state.dom.settingsBtn.addEventListener("click", () => {
        if (global.toastInfo) {
          global.toastInfo(npT("notification.settingsComingSoon"));
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
        if (!isSupportedFilter(nextFilter)) {
          return;
        }
        if (state.filter === nextFilter) {
          scrollNotificationsListToTop();
          return;
        }
        const wasRequestsFilter = isRequestsFilter();
        state.filter = nextFilter;
        if (wasRequestsFilter && !isRequestsFilter(nextFilter)) {
          cancelFollowRequestSyncVisual();
        }
        updateTabUi();
        resetCursorAndItems();
        loadCurrentFilter(false, { forceReplace: true, refreshBadge: false });
      });
    }

    if (state.dom.list && !state.dom.list.dataset.scrollBound) {
      state.dom.list.dataset.scrollBound = "1";
      state.dom.list.addEventListener("scroll", () => {
        if (!state.isOpen || state.isLoading || !state.hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = state.dom.list;
        if (scrollTop + clientHeight >= scrollHeight - 80) {
          loadCurrentFilter(true);
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
    updateFollowRequestTabBadge();
    requestAnimationFrame(updateTabsIndicator);
  }

  function formatFollowRequestCountBadge(count) {
    const safeCount = Math.max(0, parseIntSafe(count, 0));
    if (safeCount <= 0) return "";
    if (safeCount > 99) return "99+";
    return String(safeCount);
  }

  function updateFollowRequestTabBadge() {
    const badgeEl = state.dom.requestsTabBadge;
    if (!badgeEl) return;

    const label = formatFollowRequestCountBadge(state.followRequestCount);
    if (!label) {
      badgeEl.textContent = "";
      badgeEl.hidden = true;
      requestAnimationFrame(updateTabsIndicator);
      return;
    }

    badgeEl.hidden = false;
    badgeEl.textContent = label;
    requestAnimationFrame(updateTabsIndicator);
  }

  function setFollowRequestCount(count) {
    const safeCount = Math.max(0, parseIntSafe(count, 0));
    state.followRequestCount = safeCount;
    updateFollowRequestTabBadge();
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
    state.cursorRequestCreatedAt = "";
    state.cursorRequesterId = "";
    state.hasMore = true;
    state.items = [];
    state.itemMap.clear();
  }

  function getLoadingLabel() {
    return isRequestsFilter()
      ? npT("notification.panel.loadingRequests")
      : npT("notification.panel.loadingNotifications");
  }

  function getEmptyLabel() {
    if (state.filter === NOTIFICATION_FILTER.UNREAD) {
      return npT("notification.panel.emptyUnread");
    }
    if (isRequestsFilter()) {
      return npT("notification.panel.emptyRequests");
    }
    return npT("notification.panel.emptyAll");
  }

  function loadCurrentFilter(isLoadMore = false, options = {}) {
    return isRequestsFilter()
      ? loadFollowRequests(isLoadMore, options)
      : loadNotifications(isLoadMore, options);
  }

  function beginListLoad(isLoadMore = false, options = {}) {
    const forceReplace = !isLoadMore && options.forceReplace === true;
    if (isLoadMore && !state.hasMore) return null;
    if (state.isLoading && !forceReplace) return null;

    const requestToken = ++state.listLoadSequence;
    state.activeListLoadToken = requestToken;
    state.isLoading = true;

    if (!isLoadMore) {
      setMoreLoaderVisible(false);
    }

    return {
      requestToken,
      requestFilter: state.filter,
    };
  }

  function isActiveListLoad(requestToken, requestFilter) {
    return (
      requestToken === state.activeListLoadToken &&
      requestFilter === state.filter
    );
  }

  function clearFollowRequestSyncPlaceholderTimer() {
    if (state.followRequestSyncPlaceholderTimer) {
      clearTimeout(state.followRequestSyncPlaceholderTimer);
      state.followRequestSyncPlaceholderTimer = null;
    }
  }

  function setFollowRequestSyncing(active) {
    state.isFollowRequestSyncing = !!active;
    if (state.dom.list) {
      state.dom.list.classList.toggle(
        "is-follow-requests-syncing",
        !!active && isRequestsFilter(),
      );
    }
  }

  function buildFollowRequestSkeletonHtml(count = 3) {
    const safeCount = Math.min(4, Math.max(2, Number(count) || 3));
    const rows = Array.from({ length: safeCount })
      .map(
        () => `
          <div class="notifications-request-skeleton">
            <div class="notifications-request-skeleton-avatar"></div>
            <div class="notifications-request-skeleton-body">
              <div class="notifications-request-skeleton-line primary"></div>
              <div class="notifications-request-skeleton-line secondary"></div>
              <div class="notifications-request-skeleton-actions">
                <div class="notifications-request-skeleton-pill accent"></div>
                <div class="notifications-request-skeleton-pill muted"></div>
              </div>
            </div>
          </div>
        `,
      )
      .join("");

    return `
      <div class="notifications-request-skeleton-list" aria-hidden="true">
        ${rows}
      </div>
    `;
  }

  function beginFollowRequestSyncVisual(options = {}) {
    if (!isRequestsFilter() || !state.isOpen || !state.dom.list) return null;
    if (options.showLoader !== false || !state.items.length) return null;

    const token = ++state.followRequestSyncToken;
    state.isFollowRequestSkeletonVisible = false;
    setFollowRequestSyncing(true);
    clearFollowRequestSyncPlaceholderTimer();

    state.followRequestSyncPlaceholderTimer = setTimeout(() => {
      if (
        !state.isFollowRequestSyncing ||
        !isRequestsFilter() ||
        !state.isOpen ||
        state.followRequestSyncToken !== token ||
        !state.dom.list
      ) {
        return;
      }

      state.isFollowRequestSkeletonVisible = true;
      state.dom.list.innerHTML = buildFollowRequestSkeletonHtml(state.items.length);
    }, 220);

    return token;
  }

  function endFollowRequestSyncVisual(token, shouldRestoreItems = false) {
    if (token !== null && token !== undefined && token !== state.followRequestSyncToken) {
      return;
    }

    clearFollowRequestSyncPlaceholderTimer();
    const shouldRenderItems = shouldRestoreItems && state.isFollowRequestSkeletonVisible;
    state.isFollowRequestSkeletonVisible = false;
    setFollowRequestSyncing(false);

    if (shouldRenderItems) {
      renderItems();
    }
  }

  function cancelFollowRequestSyncVisual() {
    state.followRequestSyncToken += 1;
    clearFollowRequestSyncPlaceholderTimer();
    state.isFollowRequestSkeletonVisible = false;
    setFollowRequestSyncing(false);
  }

  function preservePanelOnNextRouteChange() {
    const preserveToken = Date.now();
    global.__keepNotificationsPanelOnNextRoute = preserveToken;
    setTimeout(() => {
      if (global.__keepNotificationsPanelOnNextRoute === preserveToken) {
        global.__keepNotificationsPanelOnNextRoute = false;
      }
    }, 1500);
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
      text:
        readString(raw, "text", "Text") || npT("notification.fallback.newNotification"),
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

  function normalizeFollowRequestItem(raw = {}) {
    const requesterId = readString(raw, "requesterId", "RequesterId");
    if (!isGuidLike(requesterId)) return null;

    return {
      notificationId: `follow-request:${requesterId}`,
      type: NOTIFICATION_TYPE.FOLLOW_REQUEST,
      state: NOTIFICATION_STATE.ACTIVE,
      isRead: true,
      actorCount: 1,
      eventCount: 1,
      text: npT("notification.fallback.followRequestAction"),
      targetKind: NOTIFICATION_TARGET_KIND.ACCOUNT,
      targetId: requesterId,
      targetPostCode: "",
      thumbnailUrl: "",
      thumbnailMediaType: -1,
      thumbnailMediaKind: "",
      createdAt: readString(raw, "createdAt", "CreatedAt"),
      lastEventAt: readString(raw, "createdAt", "CreatedAt"),
      canOpen: true,
      actor: {
        accountId: requesterId,
        username: readString(raw, "username", "Username"),
        fullName: readString(raw, "fullName", "FullName"),
        avatarUrl: readString(raw, "avatarUrl", "AvatarUrl"),
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
    return (
      item.actor.username ||
      item.actor.fullName ||
      npT("notification.actorFallback")
    );
  }

  function truncateActorName(name) {
    const raw = (name || "").toString().trim();
    if (!raw) return npT("notification.actorFallback");

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
          ? otherCount === 1
            ? npT("notification.panel.actorOthers.one")
            : npT("notification.panel.actorOthers.many", { count: otherCount })
          : "",
    };
  }

  function buildNotificationActionText(item) {
    const actionFromType = buildActionTextFromType(item?.type);
    if (actionFromType && actionFromType !== npT("notification.actions.generic")) {
      return actionFromType;
    }

    const rawText = (item?.text || "").toString().trim();
    if (!rawText) return npT("notification.fallback.newNotification");

    const translatedLiteral = npTranslateLiteral(rawText);
    if (translatedLiteral && translatedLiteral !== rawText) {
      return translatedLiteral;
    }

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

    return npTranslateLiteral(rawText) || rawText;
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

  function shouldSilentlyIgnoreUnavailableItem(item) {
    return (
      parseIntSafe(item?.type, -1) === NOTIFICATION_TYPE.FOLLOW &&
      parseIntSafe(item?.actorCount, 0) > 1 &&
      item?.targetKind === NOTIFICATION_TARGET_KIND.ACCOUNT
    );
  }

  function buildActionTextFromType(type) {
    const normalizedType = parseIntSafe(type, -1);
    switch (normalizedType) {
      case NOTIFICATION_TYPE.FOLLOW:
        return npT("notification.actions.followedYou");
      case NOTIFICATION_TYPE.POST_COMMENT:
        return npT("notification.actions.commentedPost");
      case NOTIFICATION_TYPE.COMMENT_REPLY:
        return npT("notification.actions.repliedComment");
      case NOTIFICATION_TYPE.POST_TAG:
        return npT("notification.actions.taggedPost");
      case NOTIFICATION_TYPE.COMMENT_MENTION:
        return npT("notification.actions.mentionedComment");
      case NOTIFICATION_TYPE.STORY_REPLY:
        return npT("notification.actions.repliedStory");
      case NOTIFICATION_TYPE.POST_REACT:
        return npT("notification.actions.reactedPost");
      case NOTIFICATION_TYPE.STORY_REACT:
        return npT("notification.actions.reactedStory");
      case NOTIFICATION_TYPE.FOLLOW_REQUEST:
        return npT("notification.actions.followRequest");
      case NOTIFICATION_TYPE.FOLLOW_REQUEST_ACCEPTED:
        return npT("notification.actions.followRequestAccepted");
      default:
        return npT("notification.actions.generic");
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
    if (status === 401) return npT("notification.requests.sessionExpired");
    if (status === 403) {
      return isAccept
        ? npT("notification.requests.permissionAccept")
        : npT("notification.requests.permissionRemove");
    }
    if (status === 404 || status === 410) {
      return npT("notification.requests.unavailable");
    }
    if (status === 409) {
      return npT("notification.requests.stateChanged");
    }
    if (status === 400) {
      return isAccept
        ? npT("notification.requests.acceptUnavailable")
        : npT("notification.requests.removeUnavailable");
    }
    return isAccept
      ? npT("notification.requests.acceptFailed")
      : npT("notification.requests.removeFailed");
  }

  async function readFollowRequestActionResponseMessage(res) {
    if (!res || typeof res.clone !== "function") return "";
    try {
      const data = await res.clone().json();
      return readString(data, "message", "Message", "error", "Error");
    } catch (_) {
      return "";
    }
  }

  function shouldSilentlyRefreshResolvedFollowRequest(status, message) {
    if (status === 404 || status === 410) return true;
    if (status !== 400) return false;

    const normalizedMessage = (message || "").toString().trim().toLowerCase();
    if (!normalizedMessage) return false;

    return (
      normalizedMessage.includes("already processed") ||
      normalizedMessage.includes("not found") ||
      normalizedMessage.includes("no longer available")
    );
  }

  async function handleFollowRequestAction(itemEl, item, action) {
    if (!itemEl || !item) return;
    if (itemEl.dataset.requestPending === "1") return;

    const requesterId = getFollowRequestActorId(item);
    if (!requesterId) {
      if (global.toastError) global.toastError(npT("notification.requests.invalid"));
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
      if (global.toastError)
        global.toastError(npT("notification.requests.apiUnavailable"));
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
        const responseMessage =
          await readFollowRequestActionResponseMessage(res);
        if (
          shouldSilentlyRefreshResolvedFollowRequest(
            res.status,
            responseMessage,
          )
        ) {
          await loadCurrentFilter(false, {
            showLoader: false,
            patchDom: true,
            animateNewItems: true,
            silent: true,
          });
          if (!isRequestsFilter()) {
            refreshUnreadBadge(40);
          }
          return;
        }

        throw new Error(
          resolveFollowRequestActionErrorMessage(res.status, isAccept),
        );
      }

      if (isAccept) {
        if (global.toastSuccess) {
          global.toastSuccess(npT("notification.requests.accepted"));
        } else if (global.toastInfo) {
          global.toastInfo(npT("notification.requests.accepted"));
        }
      } else if (global.toastInfo) {
        global.toastInfo(npT("notification.requests.removed"));
      }

      await loadCurrentFilter(false, {
        showLoader: false,
        patchDom: true,
        animateNewItems: true,
        silent: true,
      });
      if (!isRequestsFilter()) {
        refreshUnreadBadge(40);
      }
    } catch (error) {
      if (global.toastError) {
        const messageRaw =
          error instanceof Error && error.message
            ? error.message
            : resolveFollowRequestActionErrorMessage(0, isAccept);
        const message = npTranslateLiteral(messageRaw) || messageRaw;
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
    const actionText = buildDisplayActionText(item, isUnavailable);
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
          <button type="button" class="notifications-request-btn accept" data-request-action="accept">${escapeHtml(npT("common.buttons.accept", {}, "Accept"))}</button>
          <button type="button" class="notifications-request-btn remove" data-request-action="remove">${escapeHtml(npT("common.buttons.remove", {}, "Remove"))}</button>
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
                ? `<img class="notifications-item-thumbnail" src="${escapeHtml(item.thumbnailUrl)}" alt="${escapeHtml(npT("notification.panel.thumbnailAlt"))}" data-media-kind="${thumbnailMediaKind}" data-media-fallback-ignore="true">`
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
      state.dom.list.innerHTML = `
        <div class="notifications-panel-empty">
          <i data-lucide="bell"></i>
          <p>${escapeHtml(getEmptyLabel())}</p>
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
    const loadContext = beginListLoad(isLoadMore, options);
    if (!loadContext) return;
    const { requestToken, requestFilter } = loadContext;

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

    if (isLoadMore) {
      setMoreLoaderVisible(true);
    } else if (showLoader && state.dom.list) {
      state.dom.list.innerHTML = `
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>${escapeHtml(getLoadingLabel())}</p>
        </div>
      `;
    }

    try {
      const res = await global.API.Notifications.getNotifications({
        limit: state.pageSize,
        cursorLastEventAt: isLoadMore ? state.cursorLastEventAt : null,
        cursorNotificationId: isLoadMore ? state.cursorNotificationId : null,
        filter: requestFilter,
      });
      if (!isActiveListLoad(requestToken, requestFilter)) return;

      if (!res?.ok) {
        if (!isLoadMore && !silentMode && global.toastError) {
          global.toastError(npT("notification.panel.loadNotificationsFailed"));
        }
        return;
      }

      const data = await res.json().catch(() => null);
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      const followRequestCount = readNumber(
        data,
        ["followRequestCount", "FollowRequestCount"],
        -1,
      );
      if (followRequestCount >= 0) {
        setFollowRequestCount(followRequestCount);
      }
      const rawItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.Items)
          ? data.Items
          : [];
      const normalizedItems = rawItems
        .map((item) => normalizeNotificationItem(item))
        .filter(Boolean)
        .filter(
          (item) =>
            parseIntSafe(item?.type, -1) !== NOTIFICATION_TYPE.FOLLOW_REQUEST,
        );

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
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      if (!isLoadMore && !silentMode && global.toastError) {
        global.toastError(npT("notification.panel.loadNotificationsFailed"));
      }
    } finally {
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      state.isLoading = false;
      setMoreLoaderVisible(false);
      if (options.refreshBadge === true) {
        refreshUnreadBadge(0);
      }
    }
  }

  async function loadFollowRequests(isLoadMore = false, options = {}) {
    if (!global.API?.Follows?.getRequests) return;
    const loadContext = beginListLoad(isLoadMore, options);
    if (!loadContext) return;
    const { requestToken, requestFilter } = loadContext;

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
    const syncVisualToken =
      !isLoadMore && !showLoader ? beginFollowRequestSyncVisual(options) : null;
    let shouldRestoreItems = false;
    state.hasFollowRequestDirty = false;

    if (isLoadMore) {
      setMoreLoaderVisible(true);
    } else if (showLoader && state.dom.list) {
      state.dom.list.innerHTML = `
        <div class="notifications-panel-loader">
          <div class="spinner spinner-medium"></div>
          <p>${escapeHtml(getLoadingLabel())}</p>
        </div>
      `;
    }

    try {
      const res = await global.API.Follows.getRequests({
        limit: state.pageSize,
        cursorCreatedAt: isLoadMore ? state.cursorRequestCreatedAt : null,
        cursorRequesterId: isLoadMore ? state.cursorRequesterId : null,
      });
      if (!isActiveListLoad(requestToken, requestFilter)) return;

      if (!res?.ok) {
        if (!isLoadMore && !silentMode && global.toastError) {
          global.toastError(npT("notification.panel.loadRequestsFailed"));
        }
        return;
      }

      const data = await res.json().catch(() => null);
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      const totalCount = readNumber(data, ["totalCount", "TotalCount"], -1);
      if (totalCount >= 0) {
        setFollowRequestCount(totalCount);
      }
      const rawItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.Items)
          ? data.Items
          : [];
      const normalizedItems = rawItems
        .map((item) => normalizeFollowRequestItem(item))
        .filter(Boolean);

      if (isLoadMore) {
        state.items = mergeUniqueByNotificationId(state.items, normalizedItems);
      } else {
        state.items = mergeUniqueByNotificationId([], normalizedItems);
      }

      const nextCursor = data?.nextCursor || data?.NextCursor || null;
      state.cursorRequestCreatedAt = readString(
        nextCursor || {},
        "createdAt",
        "CreatedAt",
      );
      state.cursorRequesterId = readString(
        nextCursor || {},
        "requesterId",
        "RequesterId",
      );
      state.hasMore = !!(state.cursorRequestCreatedAt && state.cursorRequesterId);
      state.followRequestLastLoadedAt = Date.now();

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
      state.hasFollowRequestDirty = false;
    } catch (_) {
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      shouldRestoreItems = true;
      if (!isLoadMore && !silentMode && global.toastError) {
        global.toastError(npT("notification.panel.loadRequestsFailed"));
      }
    } finally {
      if (!isActiveListLoad(requestToken, requestFilter)) return;
      endFollowRequestSyncVisual(syncVisualToken, shouldRestoreItems);
      state.isLoading = false;
      setMoreLoaderVisible(false);
      if (state.hasFollowRequestDirty && state.isOpen && isRequestsFilter()) {
        scheduleFollowRequestRefresh();
      }
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
      const translated = npTranslateLiteral(message);
      global.toastInfo(translated || npT("notification.fallback.unavailable"));
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

    const translated = npTranslateLiteral(message);
    if (global.toastError) {
      global.toastError(translated || npT("notification.fallback.openFailed"));
      return;
    }
    if (global.toastInfo) {
      global.toastInfo(translated || npT("notification.fallback.openFailed"));
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
      return npT("notification.fallback.noPermission");
    }
    if (status === 400 || status === 404 || status === 410) {
      return npT("notification.fallback.unavailable");
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
        message: npT("notification.fallback.unavailable"),
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
            message: npT("notification.fallback.unavailable"),
          };
        }

        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          return { ok: false, message: unavailableMessage };
        }
        fallbackMessage = npT("notification.fallback.profileOpenFailed");
      } catch (_) {
        fallbackMessage = npT("notification.fallback.profileOpenFailed");
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
            message: npT("notification.fallback.unavailable"),
          };
        }

        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          return { ok: false, message: unavailableMessage };
        }
        fallbackMessage = npT("notification.fallback.profileOpenFailed");
      } catch (_) {
        fallbackMessage = npT("notification.fallback.profileOpenFailed");
      }
    }

    return {
      ok: false,
      message: fallbackMessage || npT("notification.fallback.unavailable"),
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
          resolved?.message || npT("notification.fallback.unavailable"),
        );
      }
      return false;
    }

    const profileTarget = resolved.profileTarget;
    if (global.RouteHelper?.buildProfilePath && global.RouteHelper?.goTo) {
      preservePanelOnNextRouteChange();
      global.RouteHelper.goTo(
        global.RouteHelper.buildProfilePath(profileTarget),
      );
      return true;
    }

    preservePanelOnNextRouteChange();
    global.location.hash = `#/${encodeURIComponent(profileTarget)}`;
    return true;
  }

  async function openPostTarget(item) {
    const postCode = (item.targetPostCode || "").toString().trim();
    if (!postCode) {
      showRateLimitedUnavailableToast(npT("notification.fallback.unavailable"));
      return false;
    }

    if (typeof global.openPostDetailByCode === "function") {
      preservePanelOnNextRouteChange();
      const openResult = await global.openPostDetailByCode(postCode);
      if (openResult === false) {
        global.__keepNotificationsPanelOnNextRoute = false;
        return false;
      }
      return true;
    }

    if (!global.API?.Posts?.getByPostCode) {
      showRateLimitedOpenFailedToast(npT("notification.fallback.postOpenFailed"));
      return false;
    }

    try {
      const res = await global.API.Posts.getByPostCode(postCode);
      if (!res?.ok) {
        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          showRateLimitedUnavailableToast(unavailableMessage);
        } else {
          showRateLimitedOpenFailedToast(npT("notification.fallback.postOpenFailed"));
        }
        return false;
      }
    } catch (_) {
      showRateLimitedOpenFailedToast(npT("notification.fallback.postOpenFailed"));
      return false;
    }

    if (global.RouteHelper?.buildPostDetailPath && global.RouteHelper?.goTo) {
      const path = global.RouteHelper.buildPostDetailPath(postCode);
      preservePanelOnNextRouteChange();
      global.RouteHelper.goTo(path);
      return true;
    }

    preservePanelOnNextRouteChange();
    global.location.hash = `#/posts/${encodeURIComponent(postCode)}`;
    return true;
  }

  async function openStoryTarget(item) {
    const storyId = (item.targetId || "").toString().trim();
    if (!storyId) {
      showRateLimitedUnavailableToast(npT("notification.fallback.unavailable"));
      return false;
    }

    if (typeof global.openStoryViewerByStoryId === "function") {
      preservePanelOnNextRouteChange();
      const status = await global.openStoryViewerByStoryId(storyId, {
        syncUrl: true,
        redirectOnNotFound: false,
        redirectOnForbidden: false,
      });
      if (status !== STORY_OPEN_STATUS.SUCCESS) {
        global.__keepNotificationsPanelOnNextRoute = false;
        return false;
      }
      return true;
    }

    if (!global.API?.Stories?.resolveByStoryId) {
      showRateLimitedOpenFailedToast(npT("notification.fallback.storyOpenFailed"));
      return false;
    }

    try {
      const res = await global.API.Stories.resolveByStoryId(storyId);
      if (!res?.ok) {
        const unavailableMessage = getUnavailableMessageByStatus(res?.status);
        if (unavailableMessage) {
          showRateLimitedUnavailableToast(unavailableMessage);
        } else {
          showRateLimitedOpenFailedToast(npT("notification.fallback.storyOpenFailed"));
        }
        return false;
      }
    } catch (_) {
      showRateLimitedOpenFailedToast(npT("notification.fallback.storyOpenFailed"));
      return false;
    }

    if (global.RouteHelper?.goTo) {
      preservePanelOnNextRouteChange();
      global.RouteHelper.goTo(`/stories/${encodeURIComponent(storyId)}`);
      return true;
    }

    preservePanelOnNextRouteChange();
    global.location.hash = `#/stories/${encodeURIComponent(storyId)}`;
    return true;
  }

  async function handleItemNavigation(item) {
    if (!item) return;
    if (isItemUnavailable(item)) {
      if (shouldSilentlyIgnoreUnavailableItem(item)) {
        return;
      }
      const message = hasUnavailableMessage(item)
        ? item.text
        : npT("notification.fallback.unavailable");
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
      showRateLimitedUnavailableToast(npT("notification.fallback.unavailable"));
      return;
    }

    return opened;
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
    if (isRequestsFilter()) return;
    if (state.realtimeRefreshTimer) return;
    state.realtimeRefreshTimer = setTimeout(() => {
      state.realtimeRefreshTimer = null;
      if (!state.isOpen) return;
      if (isRequestsFilter()) return;
      if (state.isLoading) {
        scheduleRealtimeRefresh();
        return;
      }
      loadNotifications(false, {
        showLoader: false,
        animateNewItems: true,
        patchDom: true,
        silent: true,
        refreshBadge: false,
      });
    }, 180);
  }

  function scheduleFollowRequestRefresh() {
    if (!state.isOpen) return;
    if (!isRequestsFilter()) return;
    if (state.followRequestRefreshTimer) return;
    state.followRequestRefreshTimer = setTimeout(() => {
      state.followRequestRefreshTimer = null;
      if (!state.isOpen || !isRequestsFilter()) return;
      if (state.isLoading) {
        scheduleFollowRequestRefresh();
        return;
      }
      loadFollowRequests(false, {
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

  function handleFollowRequestQueueChanged(payload = {}) {
    const myId = normalizeId(localStorage.getItem("accountId"));
    const targetAccountId = normalizeId(
      readString(payload, "targetAccountId", "TargetAccountId"),
    );
    if (targetAccountId && myId && targetAccountId !== myId) return;

    const action = (
      readString(payload, "action", "Action") || "refresh"
    ).toLowerCase();
    const requesterId = normalizeId(
      readString(payload, "requesterId", "RequesterId"),
    );
    const eventId = normalizeId(readString(payload, "eventId", "EventId"));
    const occurredAt = readString(payload, "occurredAt", "OccurredAt");
    const eventKey =
      eventId ||
      `requests:${action}:${requesterId || "all"}:${occurredAt || ""}`;
    if (isDuplicateRealtimeEvent(eventKey)) return;

    state.hasFollowRequestDirty = true;
    state.hasRealtimeDirty = true;
    if (state.isOpen && !isRequestsFilter()) {
      scheduleRealtimeRefresh();
    }
    scheduleFollowRequestRefresh();
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

    const shouldReload = isRequestsFilter()
      ? state.hasFollowRequestDirty ||
        !state.followRequestLastLoadedAt ||
        Date.now() - state.followRequestLastLoadedAt > 15000
      : state.hasRealtimeDirty ||
        !state.lastLoadedAt ||
        Date.now() - state.lastLoadedAt > 15000;
    if (shouldReload) {
      resetCursorAndItems();
      await loadCurrentFilter(false, { refreshBadge: false });
    } else {
      renderItems();
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
    updateFollowRequestTabBadge();

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

  if (global.I18n?.onChange) {
    global.I18n.onChange(() => {
      if (!state.initialized) return;
      applyPanelWidthVariable();
      refreshPanelLocalization();
    });
  }

  global.NotificationsPanel = {
    init,
    open,
    close,
    toggle,
    reload: () => {
      resetCursorAndItems();
      return loadCurrentFilter(false, { refreshBadge: false });
    },
    handleRealtimeChanged,
    handleFollowRequestQueueChanged,
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
