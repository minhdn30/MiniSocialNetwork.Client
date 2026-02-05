async function loadSidebar() {
  const res = await fetch("pages/sidebar.html");
  document.getElementById("sidebar").innerHTML = await res.text();
  lucide.createIcons();

  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");

  const avatarElement = document.getElementById("sidebar-avatar");
  const nameElement = document.getElementById("sidebar-name");

  if (!avatarUrl || avatarUrl === "null" || avatarUrl.trim() === "") {
    avatarElement.src = APP_CONFIG.DEFAULT_AVATAR;
  } else {
    avatarElement.src = avatarUrl;
  }

  nameElement.textContent =
    fullname && fullname.trim() !== "" ? fullname : "User";

  // Load theme preference
  loadThemePreference();

  // Setup auto-close on mouse leave
  setupAutoClose();
  // Load create post modal
  await loadCreatePostModal();

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
}

// THÊM MỚI: Tự động collapse sidebar khi chuột rời khỏi
function setupAutoClose() {
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
    }
  });
}

// THÊM MỚI: Hàm đóng tất cả dropdown và collapse sidebar
function closeAllDropdowns() {
  const sidebar = document.querySelector(".sidebar");
  const moreDropdown = document.getElementById("moreDropdown");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const createDropdown = document.getElementById("createDropdown");

  moreDropdown?.classList.remove("show");
  settingsDropdown?.classList.remove("show");
  createDropdown?.classList.remove("show");
  sidebar?.classList.remove("expanded");
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
  } else {
    moreDropdown.classList.remove("show");
    sidebar.classList.remove("expanded");
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
  } else {
    createDropdown.classList.remove("show");
    sidebar.classList.remove("expanded");
  }

  // Recreate icons
  lucide.createIcons();
}
async function loadCreatePostModal() {
  const res = await fetch("pages/create-post-modal.html");
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

  // Helper for home route equivalence
  const isHome = (r) => r === "/" || r === "/home" || r === "";

  document.querySelectorAll(".sidebar .menu-item").forEach((item) => {
      const dataRoute = item.dataset.route;
      const href = item.getAttribute("href")?.replace("#", "");

      const isActive = (dataRoute === targetRoute) || 
                       (href === targetRoute) ||
                       (isHome(dataRoute) && isHome(targetRoute));

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
      if (window.reloadPage) window.reloadPage();
      closeAllDropdowns();
      return;
  }

  // 3. Different page: Navigate
  // If this element doesn't have a native href, we set the hash manually
  const hasHref = targetEl && targetEl.getAttribute("href");
  if (!hasHref) {
      window.location.hash = targetHash;
  }
  
  // Sidebar logic
  closeAllDropdowns();
}

// Theme toggle functionality
function toggleTheme(e) {
  e.stopPropagation();
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");

  // Toggle theme
  body.classList.toggle("light-mode");
  themeToggle.classList.toggle("active");

  // Update icon
  if (body.classList.contains("light-mode")) {
    themeIcon.setAttribute("data-lucide", "sun");
    localStorage.setItem("theme", "light");
  } else {
    themeIcon.setAttribute("data-lucide", "moon");
    localStorage.setItem("theme", "dark");
  }

  // Recreate icons
  lucide.createIcons();
}

function loadThemePreference() {
  const theme = localStorage.getItem("theme");
  const body = document.body;
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");

  if (theme === "light") {
    body.classList.add("light-mode");
    themeToggle.classList.add("active");
    themeIcon.setAttribute("data-lucide", "sun");
  } else {
    themeIcon.setAttribute("data-lucide", "moon");
  }

  lucide.createIcons();
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

function openAccountSettings(e) {
  e.stopPropagation();
  console.log("Open account settings");
  // TODO: Implement account settings
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
