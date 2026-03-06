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
      "User";
  }

  applySidebarProfileRoutes();
};

async function loadSidebar() {
  const res = await fetch("pages/core/sidebar.html");
  document.getElementById("sidebar").innerHTML = await res.text();
  applySidebarProfileRoutes();
  lucide.createIcons();

  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");
  const username = localStorage.getItem("username");

  const nameElement = document.getElementById("sidebar-name");

  // Initial update
  window.updateSidebarInfo(avatarUrl);

  // Display Username as primary identifier
  nameElement.textContent = username || fullname || "User";

  // Load theme preference
  loadThemePreference();

  // Setup auto-close on mouse leave
  setupAutoClose();

  // Load create post modal
  await loadCreatePostModal();

  // Load create story modal
  await loadCreateStoryModal();

  // Load create group modal
  await loadCreateChatGroupModal();

  // Attach global navigation listener to sidebar menu items
  document.getElementById("sidebar").addEventListener("click", (e) => {
    const menuItem = e.target.closest(".menu-item, .dropdown-item");
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
      setGlobalNotificationBadge(data?.count ?? 0);
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
  if (!badge) return;

  const safeCount = Number.isFinite(Number(count))
    ? Math.max(0, Math.floor(Number(count)))
    : 0;
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

// THÊM MỚI: Tự động collapse sidebar khi chuột rời khỏi
function setupAutoClose() {
  const sidebarContainer = document.getElementById("sidebar");
  const sidebar = document.querySelector(".sidebar");

  sidebar.addEventListener("mouseleave", () => {
    const moreDropdown = document.getElementById("moreDropdown");
    const settingsDropdown = document.getElementById("settingsDropdown");
    const createDropdown = document.getElementById("createDropdown");

    // Kiểm tra có popup nào đang mở không
    const hasOpenPopup =
      moreDropdown?.classList.contains("show") ||
      settingsDropdown?.classList.contains("show") ||
      createDropdown?.classList.contains("show");

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

  // Reset animation by removing and re-adding the class
  settingsDropdown.classList.remove("show");
  void settingsDropdown.offsetWidth; // Force reflow to restart animation
  settingsDropdown.classList.add("show");

  // Keep sidebar expanded
  sidebar.classList.add("expanded");
  document.getElementById("sidebar")?.classList.add("expanded");

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
  document.body.appendChild(tempDiv.firstElementChild);

  // Recreate icons cho modal
  lucide.createIcons();
}

async function loadCreateStoryModal() {
  if (document.getElementById("createStoryModal")) return;

  const res = await fetch("pages/story/create-story-modal.html");
  const modalHTML = await res.text();

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHTML;
  document.body.appendChild(tempDiv.firstElementChild);

  lucide.createIcons();
}

document.addEventListener("click", (e) => {
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const createDropdown = document.getElementById("createDropdown");

  // Kiểm tra click có nằm trong sidebar hoặc popup không
  const clickedInside =
    sidebar?.contains(e.target) ||
    moreDropdown?.contains(e.target) ||
    settingsDropdown?.contains(e.target) ||
    createDropdown?.contains(e.target);

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
    if (window.toggleChatSidebar) window.toggleChatSidebar();
    closeAllDropdowns();
    return;
  }

  if (finalRoute === SIDEBAR_ROUTE_PATHS.NOTIFICATIONS) {
    e.preventDefault();
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
      if (window.PageCache) PageCache.clear("#/account-settings");
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

// Settings menu functions (placeholder)
function openLanguageMenu(e) {
  e.stopPropagation();
  console.log("Open language menu");
  // TODO: Implement language selection
}

function openNotificationSettings(e) {
  e.stopPropagation();
  console.log("Open notification settings");
  // TODO: Implement notification settings
}

function openPrivacySettings(e) {
  e.stopPropagation();
  console.log("Open privacy settings");
  // TODO: Implement privacy settings
}

function openHelp(e) {
  e.stopPropagation();
  console.log("Open help");
  // TODO: Implement help & support
}

function openAbout(e) {
  e.stopPropagation();
  console.log("Open about");
  // TODO: Implement about page
}
async function loadCreateChatGroupModal() {
  const res = await fetch("pages/chat/create-chat-group-modal.html");
  const modalHTML = await res.text();

  // Append modal to body
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHTML;
  document.body.appendChild(tempDiv.firstElementChild);

  // Recreate icons
  lucide.createIcons();
}
