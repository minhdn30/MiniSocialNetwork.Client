const SidebarRouteHelper = window.RouteHelper;
const SIDEBAR_ROUTE_PATHS = SidebarRouteHelper?.PATHS || {
  ROOT: "/",
  HOME: "/",
  SEARCH: "/search",
  EXPLORE: "/explore",
  REELS: "/reels",
  CHAT: "/chat",
  MESSAGES: "/messages",
  NOTIFICATIONS: "/notifications",
  ACCOUNT_SETTINGS: "/account-settings",
  SETTINGS_SEGMENT: "settings",
  PROFILE: "/profile",
};

function sidebarBuildHash(path, query) {
  if (SidebarRouteHelper?.buildHash) {
    return SidebarRouteHelper.buildHash(path, query);
  }
  const normalized = (path || SIDEBAR_ROUTE_PATHS.ROOT).toString().trim();
  const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `#${safePath}`;
}

function sidebarParseHash(rawHash) {
  if (SidebarRouteHelper?.parseHash) {
    return SidebarRouteHelper.parseHash(rawHash);
  }
  const normalizedHash = (rawHash || "").toString();
  const hashPath = (normalizedHash.split("?")[0] || "").replace(/^#/, "");
  const path = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  return { path };
}

function sidebarResolveSelfProfilePath() {
  if (SidebarRouteHelper?.buildProfilePath) {
    return SidebarRouteHelper.buildProfilePath("");
  }
  const username = (localStorage.getItem("username") || "").toString().trim();
  if (username) return `/${encodeURIComponent(username)}`;
  return SIDEBAR_ROUTE_PATHS.PROFILE;
}

function sidebarResolveSelfSettingsPath() {
  if (SidebarRouteHelper?.buildAccountSettingsPath) {
    return SidebarRouteHelper.buildAccountSettingsPath("");
  }
  const username = (localStorage.getItem("username") || "").toString().trim();
  if (!username) return SIDEBAR_ROUTE_PATHS.ACCOUNT_SETTINGS;
  return `/${encodeURIComponent(username)}/${SIDEBAR_ROUTE_PATHS.SETTINGS_SEGMENT}`;
}

function sidebarIsAccountSettingsPath(path) {
  if (SidebarRouteHelper?.isAccountSettingsPath) {
    return SidebarRouteHelper.isAccountSettingsPath(path);
  }
  return (
    (path || "").toString().trim() === SIDEBAR_ROUTE_PATHS.ACCOUNT_SETTINGS
  );
}

function sidebarGetAccountSettingsCacheKey(path) {
  const subpage = SidebarRouteHelper?.extractAccountSettingsSubpage
    ? SidebarRouteHelper.extractAccountSettingsSubpage(path)
    : "";
  return subpage ? `#/account-settings/${subpage}` : "#/account-settings";
}

function normalizeSidebarSoundEffectsEnabled(value, fallback = true) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return Boolean(fallback);
}

function applySidebarProfileRoutes() {
  const selfProfilePath = sidebarResolveSelfProfilePath();
  const selfSettingsPath = sidebarResolveSelfSettingsPath();
  const profileItem = document.querySelector(".sidebar .menu-item.profile");
  if (profileItem) {
    profileItem.dataset.route = selfProfilePath;
    profileItem.setAttribute("href", sidebarBuildHash(selfProfilePath));
  }

  document
    .querySelectorAll(".sidebar [data-route='/profile']")
    .forEach((el) => {
      el.dataset.route = selfProfilePath;
      if (el.tagName.toLowerCase() === "a") {
        el.setAttribute("href", sidebarBuildHash(selfProfilePath));
      }
    });

  document
    .querySelectorAll(".sidebar [data-route='/account-settings']")
    .forEach((el) => {
      el.dataset.route = selfSettingsPath;
      if (el.tagName.toLowerCase() === "a") {
        el.setAttribute("href", sidebarBuildHash(selfSettingsPath));
      }
    });
}

// EXPOSE: Function to update sidebar avatar and info from other scripts
window.updateSidebarInfo = function (url, name) {
  const avatarElement = document.getElementById("sidebar-avatar");
  const nameElement = document.getElementById("sidebar-name");

  if (avatarElement) {
    if (!url || url === "null" || url.trim() === "") {
      avatarElement.src = APP_CONFIG.DEFAULT_AVATAR;
    } else {
      avatarElement.src = url;
    }
  }

  if (nameElement) {
    nameElement.textContent =
      name ||
      localStorage.getItem("username") ||
      localStorage.getItem("fullname") ||
      window.I18n?.t?.("common.labels.user", {}, "User") ||
      "User";
  }

  applySidebarProfileRoutes();
};

async function loadSidebar() {
  const sidebarRoot = document.getElementById("sidebar");
  if (!sidebarRoot) return;

  const res = await fetch("pages/core/sidebar.html");
  const sidebarMarkup = await res.text();
  if (!sidebarRoot.isConnected) return;

  sidebarRoot.innerHTML = sidebarMarkup;
  applySidebarProfileRoutes();
  if (window.I18n?.translateDom) {
    window.I18n.translateDom(sidebarRoot);
  }
  updateSidebarLanguageValue();
  lucide.createIcons();

  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");
  const username = localStorage.getItem("username");

  const nameElement = document.getElementById("sidebar-name");
  if (!nameElement) return;

  // Initial update
  window.updateSidebarInfo(avatarUrl);

  // Display Username as primary identifier
  nameElement.textContent =
    username ||
    fullname ||
    window.I18n?.t?.("common.labels.user", {}, "User") ||
    "User";

  // Load theme preference
  loadThemePreference();
  loadSidebarSoundEffectsPreference();

  // Setup auto-close on mouse leave
  setupAutoClose();

  // Load create post modal
  await loadCreatePostModal();

  // Load create story modal
  await loadCreateStoryModal();

  // Load create group modal
  await loadCreateChatGroupModal();

  // Attach global navigation listener to sidebar routes
  sidebarRoot.addEventListener("click", (e) => {
    const menuItem = e.target.closest(
      ".menu-item, .dropdown-item, .sidebar-logo",
    );
    if (menuItem && menuItem.dataset.route) {
      if (!menuItem.getAttribute("onclick")) {
        navigate(e, menuItem.dataset.route, menuItem);
      }
    }
  });

  // Set initial active state based on current hash after sidebar HTML is in DOM
  const path = sidebarParseHash(
    window.location.hash || sidebarBuildHash(SIDEBAR_ROUTE_PATHS.HOME),
  ).path;
  setActiveSidebar(path);

  if (
    SidebarRouteHelper?.observeRoute &&
    !window.__sidebarRouteObserverUnsubscribe
  ) {
    window.__sidebarRouteObserverUnsubscribe = SidebarRouteHelper.observeRoute(
      ({ path: routePath }) => setActiveSidebar(routePath),
      { immediate: false },
    );
  }

  // Load unread message count for global badge
  loadGlobalMessageBadge();
  loadGlobalNotificationBadge();

  if (
    window.NotificationsPanel &&
    typeof window.NotificationsPanel.init === "function"
  ) {
    window.NotificationsPanel.init();
  }

  if (window.SearchPanel && typeof window.SearchPanel.init === "function") {
    window.SearchPanel.init();
  }

  if (window.I18n?.onChange && !window.__sidebarLanguageSyncUnsubscribe) {
    window.__sidebarLanguageSyncUnsubscribe = window.I18n.onChange(() => {
      updateSidebarLanguageValue();
      if (window.I18n?.translateDom) {
        window.I18n.translateDom(document.getElementById("sidebar"));
      }
      if (document.getElementById("languageDropdown")?.classList.contains("show")) {
        lucide.createIcons();
        positionLanguageMenu();
      }
    });
  }

  if (!window.__sidebarLanguageMenuResizeBound) {
    window.__sidebarLanguageMenuResizeBound = true;
    window.addEventListener("resize", () => {
      if (document.getElementById("languageDropdown")?.classList.contains("show")) {
        positionLanguageMenu();
      }
    });
  }
}

/**
 * Fetch unread conversation count from API and update the global Messages badge.
 */
async function loadGlobalMessageBadge() {
  try {
    const res = await window.API.Conversations.getUnreadCount();
    if (res.ok) {
      const data = await res.json();
      setGlobalMessageBadge(data.count);
    }
  } catch (err) {
    console.error("Failed to load global message badge:", err);
  }
}

// Debounced refresh to avoid spamming API
let globalUnreadRefreshTimer = null;
function scheduleGlobalUnreadRefresh(delay = 1000) {
  clearTimeout(globalUnreadRefreshTimer);
  globalUnreadRefreshTimer = setTimeout(() => {
    loadGlobalMessageBadge();
  }, delay);
}
window.scheduleGlobalUnreadRefresh = scheduleGlobalUnreadRefresh;

/**
 * Set the global Messages badge to an exact value.
 */
function setGlobalMessageBadge(count) {
  const badge = document.getElementById("messages-badge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
  }
  badge.dataset.count = count;
}

/**
 * Adjust the global Messages badge by a delta (+1 or -1).
 */
function updateGlobalMessageBadge(delta) {
  // Deprecated: use server-backed refresh for correctness
  scheduleGlobalUnreadRefresh();
}

const NOTIFICATION_UNREAD_SUMMARY_EVENT = "notifications:unread-summary-changed";
let globalNotificationUnreadSummary = {
  accountId: "",
  count: 0,
  notificationUnreadCount: 0,
  followRequestUnreadCount: 0,
  pendingFollowRequestCount: 0,
  lastNotificationsSeenAt: "",
  lastFollowRequestsSeenAt: "",
  loadedAt: 0,
};

function readNotificationSummaryNumber(source, ...keys) {
  if (!source || typeof source !== "object") return 0;
  for (let i = 0; i < keys.length; i += 1) {
    const value = source[keys[i]];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
}

function readNotificationSummaryString(source, ...keys) {
  if (!source || typeof source !== "object") return "";
  for (let i = 0; i < keys.length; i += 1) {
    const value = source[keys[i]];
    if (value === null || value === undefined) continue;
    const normalized = value.toString().trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeNotificationUnreadSummary(summary = {}, options = {}) {
  const accountId =
    readNotificationSummaryString(summary, "accountId", "AccountId") ||
    (localStorage.getItem("accountId") || "").toString().trim();
  const optimisticLoadedAt = readNotificationSummaryNumber(
    summary,
    "loadedAt",
    "LoadedAt",
  );
  const loadedAt =
    options.isOptimistic === true
      ? optimisticLoadedAt
      : Date.now();

  return {
    accountId,
    count: readNotificationSummaryNumber(summary, "count", "Count"),
    notificationUnreadCount: readNotificationSummaryNumber(
      summary,
      "notificationUnreadCount",
      "NotificationUnreadCount",
    ),
    followRequestUnreadCount: readNotificationSummaryNumber(
      summary,
      "followRequestUnreadCount",
      "FollowRequestUnreadCount",
    ),
    pendingFollowRequestCount: readNotificationSummaryNumber(
      summary,
      "pendingFollowRequestCount",
      "PendingFollowRequestCount",
      "followRequestCount",
      "FollowRequestCount",
    ),
    lastNotificationsSeenAt: readNotificationSummaryString(
      summary,
      "lastNotificationsSeenAt",
      "LastNotificationsSeenAt",
    ),
    lastFollowRequestsSeenAt: readNotificationSummaryString(
      summary,
      "lastFollowRequestsSeenAt",
      "LastFollowRequestsSeenAt",
    ),
    loadedAt,
  };
}

function applyGlobalNotificationUnreadSummary(summary = {}, options = {}) {
  const normalized = normalizeNotificationUnreadSummary(summary, options);
  let displayedSummary = normalized;
  if (
    window.NotificationsPanel &&
    typeof window.NotificationsPanel.adjustUnreadSummaryForVisibleState ===
      "function"
  ) {
    displayedSummary =
      window.NotificationsPanel.adjustUnreadSummaryForVisibleState(normalized) ||
      normalized;
  }
  const currentAccountId = (localStorage.getItem("accountId") || "").toString().trim();
  if (
    normalized.accountId &&
    currentAccountId &&
    normalized.accountId.toLowerCase() !== currentAccountId.toLowerCase()
  ) {
    return { ...globalNotificationUnreadSummary };
  }

  globalNotificationUnreadSummary = { ...normalized };
  setGlobalNotificationBadge(displayedSummary.count);

  try {
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_UNREAD_SUMMARY_EVENT, {
        detail: { ...normalized },
      }),
    );
  } catch (_error) {
    // no-op
  }

  return displayedSummary;
}

function getGlobalNotificationUnreadSummary() {
  return { ...globalNotificationUnreadSummary };
}

function getNotificationsBadgeCap() {
  const rawCap = Number(window.APP_CONFIG?.NOTIFICATIONS_BADGE_CAP);
  if (Number.isFinite(rawCap) && rawCap > 0) {
    return Math.floor(rawCap);
  }
  return 99;
}

async function loadGlobalNotificationBadge() {
  if (!window.API?.Notifications?.getUnreadCount) return;
  try {
    const res = await window.API.Notifications.getUnreadCount();
    if (res.ok) {
      const data = await res.json();
      applyGlobalNotificationUnreadSummary(data || {});
    }
  } catch (err) {
    console.error("Failed to load global notification badge:", err);
  }
}

let globalNotificationUnreadRefreshTimer = null;
function scheduleGlobalNotificationUnreadRefresh(delay = 1000) {
  clearTimeout(globalNotificationUnreadRefreshTimer);
  globalNotificationUnreadRefreshTimer = setTimeout(() => {
    loadGlobalNotificationBadge();
  }, Math.max(0, Number(delay) || 0));
}
window.scheduleGlobalNotificationUnreadRefresh =
  scheduleGlobalNotificationUnreadRefresh;

function setGlobalNotificationBadge(count) {
  const badge = document.getElementById("notifications-badge");
  const safeCount = Number.isFinite(Number(count))
    ? Math.max(0, Math.floor(Number(count)))
    : 0;
  if (!badge) return;

  if (safeCount > 0) {
    const cap = getNotificationsBadgeCap();
    badge.textContent = safeCount > cap ? `${cap}+` : `${safeCount}`;
    badge.style.display = "";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
  }
  badge.dataset.count = safeCount;
}
window.setGlobalNotificationBadge = setGlobalNotificationBadge;
window.loadGlobalNotificationBadge = loadGlobalNotificationBadge;
window.applyGlobalNotificationUnreadSummary = applyGlobalNotificationUnreadSummary;
window.getGlobalNotificationUnreadSummary = getGlobalNotificationUnreadSummary;

// THÊM MỚI: Tự động collapse sidebar khi chuột rời khỏi
function setupAutoClose() {
  const sidebarContainer = document.getElementById("sidebar");
  const sidebar = document.querySelector(".sidebar");

  sidebar.addEventListener("mouseleave", () => {
    const moreDropdown = document.getElementById("moreDropdown");
    const settingsDropdown = document.getElementById("settingsDropdown");
    const createDropdown = document.getElementById("createDropdown");
    const languageDropdown = document.getElementById("languageDropdown");

    // Kiểm tra có popup nào đang mở không
    const hasOpenPopup =
      moreDropdown?.classList.contains("show") ||
      settingsDropdown?.classList.contains("show") ||
      createDropdown?.classList.contains("show") ||
      languageDropdown?.classList.contains("show");

    // Nếu có popup mở, giữ sidebar expanded
    // Nếu không, cho phép sidebar tự thu gọn (CSS hover sẽ xử lý)
    if (!hasOpenPopup) {
      sidebar.classList.remove("expanded");
      sidebarContainer?.classList.remove("expanded");
    }
  });
}

// THÊM MỚI: Hàm đóng tất cả dropdown và collapse sidebar
function closeAllDropdowns() {
  const sidebarContainer = document.getElementById("sidebar");
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const createDropdown = document.getElementById("createDropdown");

  moreDropdown?.classList.remove("show");
  settingsDropdown?.classList.remove("show");
  createDropdown?.classList.remove("show");
  closeLanguageMenu();
  sidebar?.classList.remove("expanded");
  sidebarContainer?.classList.remove("expanded");
}

function toggleMoreMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const createDropdown = document.getElementById("createDropdown");

  // Close settings and create if open
  settingsDropdown.classList.remove("show");
  createDropdown?.classList.remove("show");
  closeLanguageMenu();

  // Toggle more menu
  const isOpening = !moreDropdown.classList.contains("show");

  if (isOpening) {
    // Reset animation by removing and re-adding the class
    moreDropdown.classList.remove("show");
    void moreDropdown.offsetWidth; // Force reflow to restart animation
    moreDropdown.classList.add("show");
    sidebar.classList.add("expanded");
    document.getElementById("sidebar")?.classList.add("expanded");
  } else {
    moreDropdown.classList.remove("show");
    sidebar.classList.remove("expanded");
    document.getElementById("sidebar")?.classList.remove("expanded");
  }
}

function toggleSettingsMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Hide more menu and show settings
  moreDropdown.classList.remove("show");
  closeLanguageMenu();

  // Reset animation by removing and re-adding the class
  settingsDropdown.classList.remove("show");
  void settingsDropdown.offsetWidth; // Force reflow to restart animation
  settingsDropdown.classList.add("show");

  // Keep sidebar expanded
  sidebar.classList.add("expanded");
  document.getElementById("sidebar")?.classList.add("expanded");

  loadSidebarSoundEffectsPreference();

  // Recreate icons for the settings menu
  lucide.createIcons();
}

function backToMoreMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Hide settings and show more menu
  settingsDropdown.classList.remove("show");
  closeLanguageMenu();

  // Reset animation by removing and re-adding the class
  moreDropdown.classList.remove("show");
  void moreDropdown.offsetWidth; // Force reflow to restart animation
  moreDropdown.classList.add("show");

  // Keep sidebar expanded
  sidebar.classList.add("expanded");
}

// Toggle Create Menu
function toggleCreateMenu(e) {
  e.stopPropagation();
  const sidebar = document.querySelector(".sidebar");
  const createDropdown = document.getElementById("createDropdown");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");

  // Close other menus
  moreDropdown?.classList.remove("show");
  settingsDropdown?.classList.remove("show");
  closeLanguageMenu();

  // Toggle create menu
  const isOpening = !createDropdown.classList.contains("show");

  if (isOpening) {
    // Reset animation by removing and re-adding the class
    createDropdown.classList.remove("show");
    void createDropdown.offsetWidth; // Force reflow to restart animation
    createDropdown.classList.add("show");
    sidebar.classList.add("expanded");
    document.getElementById("sidebar")?.classList.add("expanded");
  } else {
    createDropdown.classList.remove("show");
    sidebar.classList.remove("expanded");
    document.getElementById("sidebar")?.classList.remove("expanded");
  }

  // Recreate icons
  lucide.createIcons();
}
async function loadCreatePostModal() {
  const res = await fetch("pages/post/create-post-modal.html");
  const modalHTML = await res.text();

  // Append modal vào body
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHTML;
  const modalElement = tempDiv.firstElementChild;
  document.body.appendChild(modalElement);
  if (window.I18n?.translateDom && modalElement) {
    window.I18n.translateDom(modalElement);
  }

  // Recreate icons cho modal
  lucide.createIcons();
}

async function loadCreateStoryModal() {
  if (document.getElementById("createStoryModal")) return;

  const res = await fetch("pages/story/create-story-modal.html");
  const modalHTML = await res.text();

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHTML;
  const modalElement = tempDiv.firstElementChild;
  document.body.appendChild(modalElement);
  if (window.I18n?.translateDom && modalElement) {
    window.I18n.translateDom(modalElement);
  }

  lucide.createIcons();
}

document.addEventListener("click", (e) => {
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const createDropdown = document.getElementById("createDropdown");
  const languageDropdown = document.getElementById("languageDropdown");

  // Kiểm tra click có nằm trong sidebar hoặc popup không
  const clickedInside =
    sidebar?.contains(e.target) ||
    moreDropdown?.contains(e.target) ||
    settingsDropdown?.contains(e.target) ||
    createDropdown?.contains(e.target) ||
    languageDropdown?.contains(e.target);

  // Nếu click bên ngoài, đóng tất cả popup và collapse sidebar
  if (!clickedInside) {
    closeAllDropdowns();
  }
});

function setActiveSidebar(route) {
  // Normalize route to plain path
  let targetRoute =
    route ||
    sidebarParseHash(
      window.location.hash || sidebarBuildHash(SIDEBAR_ROUTE_PATHS.HOME),
    ).path;
  targetRoute = (targetRoute || "").toString().trim();
  if (!targetRoute.startsWith("/")) targetRoute = `/${targetRoute}`;

  const myId = localStorage.getItem("accountId")?.toLowerCase();
  const myUsername = localStorage.getItem("username")?.toLowerCase();
  const selfProfilePath = sidebarResolveSelfProfilePath();
  const selfSettingsPath = sidebarResolveSelfSettingsPath();

  if (sidebarIsAccountSettingsPath(targetRoute)) {
    targetRoute = selfProfilePath;
  }

  // Helper inside to check if a route belongs to ME
  const isRouteMine = (r) => {
    const routePath = (r || "").toString().trim();
    if (!routePath) return false;
    if (routePath === SIDEBAR_ROUTE_PATHS.PROFILE) return true;
    const isProfileRoute = SidebarRouteHelper?.isProfilePath
      ? SidebarRouteHelper.isProfilePath(routePath)
      : routePath === SIDEBAR_ROUTE_PATHS.PROFILE ||
        routePath.startsWith(`${SIDEBAR_ROUTE_PATHS.PROFILE}/`);
    if (!isProfileRoute) return false;

    const param = (
      SidebarRouteHelper?.extractProfileTargetFromHash
        ? SidebarRouteHelper.extractProfileTargetFromHash(
            sidebarBuildHash(routePath),
          )
        : routePath.replace("/profile/", "")
    )
      .toString()
      .toLowerCase();
    if (!param) return true;
    return param === myId || param === myUsername;
  };

  const currentPath = sidebarParseHash(window.location.hash || "").path;
  const isViewingOtherProfile =
    (SidebarRouteHelper?.isProfilePath
      ? SidebarRouteHelper.isProfilePath(currentPath)
      : currentPath === SIDEBAR_ROUTE_PATHS.PROFILE ||
        currentPath.startsWith(`${SIDEBAR_ROUTE_PATHS.PROFILE}/`)) &&
    !isRouteMine(currentPath);

  // Helper for home route equivalence
  const isHome = (r) =>
    SidebarRouteHelper?.isHomePath
      ? SidebarRouteHelper.isHomePath(r)
      : r === "/" || r === "/home" || r === "";

  const isChatRoute = (r) => {
    const routePath = (r || "").toString().trim();
    if (!routePath) return false;
    if (SidebarRouteHelper?.isPathPrefix) {
      return (
        SidebarRouteHelper.isPathPrefix(routePath, SIDEBAR_ROUTE_PATHS.CHAT) ||
        SidebarRouteHelper.isPathPrefix(routePath, SIDEBAR_ROUTE_PATHS.MESSAGES)
      );
    }
    return (
      routePath === SIDEBAR_ROUTE_PATHS.CHAT ||
      routePath.startsWith(`${SIDEBAR_ROUTE_PATHS.CHAT}/`) ||
      routePath === SIDEBAR_ROUTE_PATHS.MESSAGES ||
      routePath.startsWith(`${SIDEBAR_ROUTE_PATHS.MESSAGES}/`)
    );
  };

  document.querySelectorAll(".sidebar .menu-item").forEach((item) => {
    const dataRoute = item.dataset.route;
    const href = item.getAttribute("href")?.replace("#", "");

    if (!dataRoute && !href) {
      item.classList.remove("active");
      return;
    }

    let isActive =
      dataRoute === targetRoute ||
      href === targetRoute ||
      (isHome(dataRoute) && isHome(targetRoute)) ||
      (dataRoute === selfProfilePath && isRouteMine(targetRoute));

    if (dataRoute === SIDEBAR_ROUTE_PATHS.MESSAGES) {
      isActive = isChatRoute(targetRoute);
    }

    if (
      dataRoute === SIDEBAR_ROUTE_PATHS.SEARCH &&
      window.SearchPanel?.isOpen
    ) {
      isActive = true;
    }

    if (
      dataRoute === SIDEBAR_ROUTE_PATHS.NOTIFICATIONS &&
      window.NotificationsPanel?.isOpen
    ) {
      isActive = true;
    }

    // Special case: Profile button only active if it's our OWN profile (no params)
    if (dataRoute === selfProfilePath && isViewingOtherProfile) {
      isActive = false;
    }

    item.classList.toggle("active", isActive);
  });
}

// Global navigate function to handle page changes and reloads
function navigate(e, route, clickedEl = null) {
  const targetEl = clickedEl || e.currentTarget;
  const selfProfilePath = sidebarResolveSelfProfilePath();
  const selfSettingsPath = sidebarResolveSelfSettingsPath();
  const normalizedRoute = (route || "").toString().trim() || "/";
  const finalRoute =
    normalizedRoute === SIDEBAR_ROUTE_PATHS.PROFILE
      ? selfProfilePath
      : normalizedRoute === SIDEBAR_ROUTE_PATHS.ACCOUNT_SETTINGS
        ? selfSettingsPath
        : normalizedRoute;

  // 1. Special actions
  if (finalRoute === "/create/post") {
    e.preventDefault();
    if (window.openCreatePostModal) openCreatePostModal();
    closeAllDropdowns();
    return;
  }

  if (finalRoute === "/create/story") {
    e.preventDefault();
    if (window.openCreateStoryModal) openCreateStoryModal();
    closeAllDropdowns();
    return;
  }

  if (finalRoute === "/messages") {
    e.preventDefault();
    if (window.closeNotificationsPanel) {
      window.closeNotificationsPanel();
    }
    if (window.closeSearchPanel) {
      window.closeSearchPanel();
    }
    if (window.toggleChatSidebar) window.toggleChatSidebar();
    closeAllDropdowns();
    return;
  }

  if (finalRoute === SIDEBAR_ROUTE_PATHS.SEARCH) {
    e.preventDefault();
    if (window.closeNotificationsPanel) {
      window.closeNotificationsPanel();
    }
    if (window.closeChatSidebar) {
      window.closeChatSidebar(true);
    }
    if (window.toggleSearchPanel) {
      window.toggleSearchPanel();
    }
    closeAllDropdowns();
    return;
  }

  if (finalRoute === SIDEBAR_ROUTE_PATHS.NOTIFICATIONS) {
    e.preventDefault();
    if (window.closeSearchPanel) {
      window.closeSearchPanel();
    }
    if (window.toggleNotificationsPanel) {
      window.toggleNotificationsPanel();
    }
    closeAllDropdowns();
    return;
  }

  const currentHash =
    window.location.hash || sidebarBuildHash(SIDEBAR_ROUTE_PATHS.ROOT);
  const targetHash = finalRoute.startsWith("#")
    ? finalRoute
    : sidebarBuildHash(finalRoute);

  // Helper to check if a hash is "Home"
  const isHome = (rawPath) =>
    SidebarRouteHelper?.isHomePath
      ? SidebarRouteHelper.isHomePath(rawPath)
      : !rawPath || rawPath === "/" || rawPath === "/home";

  // 2. Check if clicking same page (ignoring parameters for reload check) -> Force Reload
  // Path-based same page check
  const currentPath = sidebarParseHash(currentHash).path;
  const targetPath = sidebarParseHash(targetHash).path;
  const isSamePath =
    currentPath === targetPath || (isHome(currentPath) && isHome(targetPath));

  if (isSamePath) {
    e.preventDefault();

    // Fix ReferenceError: Check if we are currently on a foreign profile
    const myId = localStorage.getItem("accountId")?.toLowerCase();
    const myUsername = localStorage.getItem("username")?.toLowerCase();
    const isRouteMine = (r) => {
      const routePath = (r || "").toString().trim();
      if (!routePath) return false;
      const isProfileRoute = SidebarRouteHelper?.isProfilePath
        ? SidebarRouteHelper.isProfilePath(routePath)
        : routePath === SIDEBAR_ROUTE_PATHS.PROFILE ||
          routePath.startsWith(`${SIDEBAR_ROUTE_PATHS.PROFILE}/`);
      if (!isProfileRoute) return false;
      const param = (
        SidebarRouteHelper?.extractProfileTargetFromHash
          ? SidebarRouteHelper.extractProfileTargetFromHash(
              sidebarBuildHash(routePath),
            )
          : routePath.replace("/profile/", "")
      )
        .toString()
        .toLowerCase();
      if (!param) return true;
      return param === myId || param === myUsername;
    };

    const currentPathOnly = sidebarParseHash(currentHash).path;
    const isViewingOtherProfile =
      (SidebarRouteHelper?.isProfilePath
        ? SidebarRouteHelper.isProfilePath(currentPathOnly)
        : currentPathOnly === SIDEBAR_ROUTE_PATHS.PROFILE ||
          currentPathOnly.startsWith(`${SIDEBAR_ROUTE_PATHS.PROFILE}/`)) &&
      !isRouteMine(currentPathOnly);

    if (finalRoute === selfProfilePath && isViewingOtherProfile) {
      if (SidebarRouteHelper?.goTo) {
        SidebarRouteHelper.goTo(selfProfilePath);
      } else {
        window.location.hash = sidebarBuildHash(selfProfilePath);
      }
      closeAllDropdowns();
      return;
    }

    if (window.reloadPage) window.reloadPage();
    closeAllDropdowns();
    return;
  }

  // 3. Different page: Navigate
  // NORMALIZE navigation function
  const executeFinalNavigation = () => {
    // Clear account settings cache if we are leaving it
    const currentPath = sidebarParseHash(window.location.hash || "").path;
    if (sidebarIsAccountSettingsPath(currentPath)) {
      if (window.PageCache) {
        PageCache.clear(sidebarGetAccountSettingsCacheKey(currentPath));
      }
    }

    // Manually update hash since we might have prevented default
    if (window.location.hash !== targetHash) {
      if (SidebarRouteHelper?.goTo) {
        SidebarRouteHelper.goTo(targetPath);
      } else {
        window.location.hash = targetHash;
      }
    }

    window.onbeforeunload = null; // Clear guard
    closeAllDropdowns();
  };

  // INTERCEPT: Check for dirty Account Settings
  if (
    sidebarIsAccountSettingsPath(
      sidebarParseHash(window.location.hash || "").path,
    ) &&
    window.getAccountSettingsModified &&
    window.getAccountSettingsModified()
  ) {
    e.preventDefault(); // CHẶN NGAY việc trình duyệt tự thay đổi hash

    if (window.showDiscardAccountSettingsConfirmation) {
      window.showDiscardAccountSettingsConfirmation(
        () => executeFinalNavigation(), // On Discard: Go ahead
        () => {
          /* On Keep: Do nothing, already prevented default */
        },
      );
      return;
    }
  }

  executeFinalNavigation();
}

// Theme toggle functionality
function toggleTheme(e) {
  e.stopPropagation();
  closeLanguageMenu();
  if (
    window.themeManager &&
    typeof window.themeManager.toggleTheme === "function"
  ) {
    window.themeManager.toggleTheme();
    return;
  }

  // Fallback (legacy behavior)
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");
  body.classList.toggle("light-mode");
  themeToggle?.classList.toggle("active");
  if (body.classList.contains("light-mode")) {
    themeIcon?.setAttribute("data-lucide", "sun");
    localStorage.setItem("theme", "light");
  } else {
    themeIcon?.setAttribute("data-lucide", "moon");
    localStorage.setItem("theme", "dark");
  }
  if (window.lucide) lucide.createIcons();
}

function loadThemePreference() {
  if (
    window.themeManager &&
    typeof window.themeManager.getTheme === "function"
  ) {
    const theme = window.themeManager.getTheme();
    if (window.themeManager.setTheme) {
      window.themeManager.setTheme(theme);
      return;
    }
  }

  // Fallback (legacy behavior)
  const theme = localStorage.getItem("theme");
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");
  if (theme === "light") {
    body.classList.add("light-mode");
    themeToggle?.classList.add("active");
    themeIcon?.setAttribute("data-lucide", "sun");
  } else {
    themeIcon?.setAttribute("data-lucide", "moon");
  }
  if (window.lucide) lucide.createIcons();
}

function updateSidebarSoundEffectsToggleState(isEnabled) {
  const normalizedEnabled = normalizeSidebarSoundEffectsEnabled(isEnabled, true);
  const soundToggle = document.getElementById("sidebar-sound-effects-toggle");
  const soundIcon = document.getElementById("sidebar-sound-effects-icon");

  soundToggle?.classList.toggle("active", normalizedEnabled);
  soundIcon?.setAttribute(
    "data-lucide",
    normalizedEnabled ? "volume-2" : "volume-x",
  );

  if (window.lucide) {
    lucide.createIcons();
  }
}

function loadSidebarSoundEffectsPreference() {
  const isEnabled = window.SoundManager?.getEnabled?.() ?? true;
  updateSidebarSoundEffectsToggleState(isEnabled);
}

async function toggleSidebarSoundEffects(e) {
  e.stopPropagation();
  closeLanguageMenu();

  if (window.__sidebarSoundEffectsChangeInFlight) {
    return;
  }

  const previousEnabled = normalizeSidebarSoundEffectsEnabled(
    window.SoundManager?.getEnabled?.(),
    true,
  );
  const nextEnabled = !previousEnabled;

  window.__sidebarSoundEffectsChangeInFlight = true;
  window.SoundManager?.setEnabled?.(nextEnabled);
  updateSidebarSoundEffectsToggleState(nextEnabled);

  try {
    if (!window.API?.Accounts?.updateSettings) {
      throw new Error("sound-settings-sync-unavailable");
    }

    const res = await window.API.Accounts.updateSettings({
      SoundEffectsEnabled: nextEnabled,
    });

    if (!res?.ok) {
      throw new Error("sound-settings-save-failed");
    }

    let appliedEnabled = nextEnabled;
    const contentType = (res.headers?.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const settings = await res.json();
      appliedEnabled = normalizeSidebarSoundEffectsEnabled(
        settings?.soundEffectsEnabled ?? settings?.SoundEffectsEnabled,
        nextEnabled,
      );
    }

    window.SoundManager?.setEnabled?.(appliedEnabled);
    updateSidebarSoundEffectsToggleState(appliedEnabled);
    window.AccountSettingsPage?.syncSoundEffectsSelection?.(appliedEnabled);
  } catch (error) {
    console.error("Failed to sync sound effects preference:", error);
    window.SoundManager?.setEnabled?.(previousEnabled);
    updateSidebarSoundEffectsToggleState(previousEnabled);
    if (window.toastErrorKey) {
      toastErrorKey(
        error?.message === "sound-settings-save-failed"
          ? "profile.settings.saveFailed"
          : "profile.settings.saveError",
      );
    }
  } finally {
    window.__sidebarSoundEffectsChangeInFlight = false;
  }
}

// Settings menu functions (placeholder)
function setLanguageMenuExpanded(isExpanded) {
  const languageItem = document.getElementById("sidebar-language-item");
  languageItem?.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  languageItem?.classList.toggle("is-submenu-open", Boolean(isExpanded));
}

function updateLanguageOptionSelection(language = "") {
  const normalizedLanguage = window.I18n?.normalizeLanguage
    ? window.I18n.normalizeLanguage(language)
    : (language || "").toString().trim().toLowerCase();

  document
    .querySelectorAll("#languageDropdown .dropdown-item[data-language]")
    .forEach((item) => {
      const isSelected =
        item.dataset.language?.toLowerCase() === normalizedLanguage;
      item.dataset.selected = isSelected ? "true" : "false";
      item.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
}

function closeLanguageMenu() {
  document.getElementById("languageDropdown")?.classList.remove("show");
  setLanguageMenuExpanded(false);
}

function positionLanguageMenu() {
  const dropdown = document.getElementById("languageDropdown");
  const languageItem = document.getElementById("sidebar-language-item");
  const settingsDropdown = document.getElementById("settingsDropdown");
  if (!dropdown || !languageItem || !settingsDropdown) return;

  dropdown.style.left = "";
  dropdown.style.right = "";
  dropdown.style.top = "";

  const gutter = 12;
  const settingsRect = settingsDropdown.getBoundingClientRect();
  const itemRect = languageItem.getBoundingClientRect();
  const dropdownRect = dropdown.getBoundingClientRect();
  const dropdownWidth = dropdownRect.width || 240;
  const dropdownHeight = dropdownRect.height || dropdown.offsetHeight || 0;

  const canOpenRight =
    settingsRect.right + gutter + dropdownWidth <= window.innerWidth - 8;
  const canOpenLeft = settingsRect.left - gutter - dropdownWidth >= 8;

  let left = settingsDropdown.offsetWidth + gutter;
  if (!canOpenRight && canOpenLeft) {
    left = -(dropdownWidth + gutter);
  } else if (!canOpenRight) {
    left = Math.max(8, settingsDropdown.offsetWidth - dropdownWidth);
  }

  let top = itemRect.top - settingsRect.top;
  const maxTop = Math.max(
    8,
    window.innerHeight - settingsRect.top - dropdownHeight - 8,
  );
  top = Math.max(8, Math.min(top, maxTop));

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
}

function openLanguageMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById("languageDropdown");
  if (!dropdown) return;

  const isOpening = !dropdown.classList.contains("show");
  if (!isOpening) {
    closeLanguageMenu();
    return;
  }

  updateLanguageOptionSelection(window.I18n?.getLanguage?.());
  dropdown.classList.remove("show");
  void dropdown.offsetWidth;
  dropdown.classList.add("show");
  setLanguageMenuExpanded(true);
  lucide.createIcons();
  positionLanguageMenu();
}

function updateSidebarLanguageValue() {
  const valueElement = document.getElementById("sidebar-language-value");
  if (!valueElement || !window.I18n) return;
  valueElement.textContent = window.I18n.formatLanguageLabel(
    window.I18n.getLanguage(),
  );
  updateLanguageOptionSelection(window.I18n.getLanguage());
}

function sidebarReloadAfterLanguageChange() {
  if (window.__languageChangeReloadInFlight) return;
  window.__languageChangeReloadInFlight = true;

  if (window.PageCache?.clearAll) {
    window.PageCache.clearAll();
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 0);
}

async function applySidebarLanguageSelection(language) {
  if (window.__sidebarLanguageChangeInFlight) return;
  window.__sidebarLanguageChangeInFlight = true;

  const nextLanguage = window.I18n?.setLanguage
    ? window.I18n.setLanguage(language)
    : language;
  updateSidebarLanguageValue();
  closeLanguageMenu();
  lucide.createIcons();

  try {
    window.I18n?.markPendingLanguageSync?.(nextLanguage);

    if (window.API?.Accounts?.updateLanguagePreference) {
      const res = await window.API.Accounts.updateLanguagePreference(
        nextLanguage,
      );
      if (!res?.ok) {
        throw new Error("language-sync-failed");
      }
    } else {
      throw new Error("language-sync-unavailable");
    }

    window.I18n?.clearPendingLanguageSync?.(nextLanguage);
    window.AccountSettingsPage?.syncLanguageSelection?.(nextLanguage);
  } catch (error) {
    console.error("Failed to sync language preference:", error);
  } finally {
    window.__sidebarLanguageChangeInFlight = false;
    sidebarReloadAfterLanguageChange();
  }
}

async function selectLanguageOption(e, language) {
  e.stopPropagation();

  const currentPath = sidebarParseHash(window.location.hash || "").path;
  const isDirtyAccountSettings =
    sidebarIsAccountSettingsPath(currentPath) &&
    window.getAccountSettingsModified &&
    window.getAccountSettingsModified();

  if (
    isDirtyAccountSettings &&
    typeof window.showDiscardAccountSettingsConfirmation === "function"
  ) {
    closeLanguageMenu();
    window.showDiscardAccountSettingsConfirmation(
      () => {
        applySidebarLanguageSelection(language);
      },
      () => {},
    );
    return;
  }

  await applySidebarLanguageSelection(language);
}

function openNotificationSettings(e) {
  e.stopPropagation();
  closeLanguageMenu();
  window.toastInfo?.(window.I18n?.t("sidebar.featureComingSoon") || "");
}

function openPrivacySettings(e) {
  e.stopPropagation();
  closeLanguageMenu();
  window.toastInfo?.(window.I18n?.t("sidebar.featureComingSoon") || "");
}

function openHelp(e) {
  e.stopPropagation();
  closeLanguageMenu();
  window.toastInfo?.(window.I18n?.t("sidebar.featureComingSoon") || "");
}

function openAbout(e) {
  e.stopPropagation();
  closeLanguageMenu();
  window.toastInfo?.(window.I18n?.t("sidebar.featureComingSoon") || "");
}
async function loadCreateChatGroupModal() {
  const res = await fetch("pages/chat/create-chat-group-modal.html");
  const modalHTML = await res.text();

  // Append modal to body
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHTML;
  const modalElement = tempDiv.firstElementChild;
  document.body.appendChild(modalElement);
  if (window.I18n?.translateDom && modalElement) {
    window.I18n.translateDom(modalElement);
  }

  // Recreate icons
  lucide.createIcons();
}
