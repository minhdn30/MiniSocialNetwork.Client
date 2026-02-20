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
    nameElement.textContent = name || localStorage.getItem("username") || localStorage.getItem("fullname") || "User";
  }
};

async function loadSidebar() {
  const res = await fetch("pages/core/sidebar.html");
  document.getElementById("sidebar").innerHTML = await res.text();
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
  const path = (window.location.hash || "#/home").slice(1).split("?")[0];
  setActiveSidebar(path);

  // Load unread message count for global badge
  loadGlobalMessageBadge();
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
    console.error('Failed to load global message badge:', err);
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
  const badge = document.getElementById('messages-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = '';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
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
  let targetRoute = route || (window.location.hash || "#/home").slice(1).split("?")[0];
  
  // Ensure targetRoute starts with /
  if (targetRoute && !targetRoute.startsWith("/")) {
      targetRoute = "/" + targetRoute;
  }

  const myId = localStorage.getItem("accountId")?.toLowerCase();
  const myUsername = localStorage.getItem("username")?.toLowerCase();

  // Helper inside to check if a route belongs to ME
  const isRouteMine = (r) => {
      if (r === "/profile") return true;
      if (!r.startsWith("/profile/")) return false;
      const param = r.replace("/profile/", "").toLowerCase();
      return param === myId || param === myUsername;
  };

  const hash = window.location.hash || "";
  const isViewingOtherProfile = (hash.includes("/profile/") || hash.includes("/profile?")) && !isRouteMine(targetRoute);

  // Helper for home route equivalence
  const isHome = (r) => r === "/" || r === "/home" || r === "";

  document.querySelectorAll(".sidebar .menu-item").forEach((item) => {
      const dataRoute = item.dataset.route;
      const href = item.getAttribute("href")?.replace("#", "");

      let isActive = (dataRoute === targetRoute) || 
                       (href === targetRoute) ||
                       (isHome(dataRoute) && isHome(targetRoute)) ||
                       (dataRoute === "/profile" && isRouteMine(targetRoute));

      // Special case: Profile button only active if it's our OWN profile (no params)
      if (dataRoute === "/profile" && isViewingOtherProfile) {
          isActive = false;
      }

      item.classList.toggle("active", isActive);
  });
}

// Global navigate function to handle page changes and reloads
function navigate(e, route, clickedEl = null) {
  const targetEl = clickedEl || e.currentTarget;
  
  // 1. Special actions
  if (route === "/create/post") {
      e.preventDefault();
      if (window.openCreatePostModal) openCreatePostModal();
      closeAllDropdowns();
      return;
  }

  if (route === "/messages") {
      e.preventDefault();
      if (window.toggleChatSidebar) window.toggleChatSidebar();
      closeAllDropdowns();
      return;
  }
  
  const currentHash = window.location.hash || "#/";
  const targetHash = route.startsWith("#") ? route : `#${route}`;

  // Helper to check if a hash is "Home"
  const isHome = (h) => h === "#/" || h === "#/home" || h === "";
  
  // 2. Check if clicking same page (ignoring parameters for reload check) -> Force Reload
  // Path-based same page check
  const currentPath = currentHash.split("?")[0];
  const targetPath = targetHash.split("?")[0];
  const isSamePath = (currentPath === targetPath) || (isHome(currentPath) && isHome(targetPath));

  if (isSamePath) {
      e.preventDefault();

      // Fix ReferenceError: Check if we are currently on a foreign profile
      const myId = localStorage.getItem("accountId")?.toLowerCase();
      const myUsername = localStorage.getItem("username")?.toLowerCase();
      const isRouteMine = (r) => {
          if (r === "/profile") return true;
          if (!r.startsWith("/profile/")) return false;
          const param = r.replace("/profile/", "").toLowerCase();
          return param === myId || param === myUsername;
      };
      
      const currentPathOnly = currentHash.slice(1).split("?")[0];
      const isViewingOtherProfile = (currentHash.includes("/profile/") || currentHash.includes("/profile?")) && !isRouteMine(currentPathOnly);

      if (route === "/profile" && isViewingOtherProfile) {
          window.location.hash = "#/profile";
          closeAllDropdowns();
          return;
      }
      
      if (window.reloadPage) window.reloadPage();
      closeAllDropdowns();
      return;
  }

  // 3. Different page: Navigate
  const hasHref = targetEl && targetEl.getAttribute("href");
  
  // NORMALIZE navigation function
  const executeFinalNavigation = () => {
    // Clear account settings cache if we are leaving it
    if (window.location.hash === "#/account-settings") {
        if (window.PageCache) PageCache.clear("#/account-settings");
    }
    
    // Manually update hash since we might have prevented default
    if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
    }
    
    window.onbeforeunload = null; // Clear guard
    closeAllDropdowns();
  };

  // INTERCEPT: Check for dirty Account Settings
  if (window.location.hash === "#/account-settings" && window.getAccountSettingsModified && window.getAccountSettingsModified()) {
      e.preventDefault(); // CHẶN NGAY việc trình duyệt tự thay đổi hash
      
      if (window.showDiscardAccountSettingsConfirmation) {
          window.showDiscardAccountSettingsConfirmation(
              () => executeFinalNavigation(), // On Discard: Go ahead
              () => { /* On Keep: Do nothing, already prevented default */ }
          );
          return;
      }
  }

  executeFinalNavigation();
}

// Theme toggle functionality
function toggleTheme(e) {
  e.stopPropagation();
  if (window.themeManager && typeof window.themeManager.toggleTheme === "function") {
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
  if (window.themeManager && typeof window.themeManager.getTheme === "function") {
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
