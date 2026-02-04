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
  // Normalize route to plain path if needed, but hash logic is simpler
  const currentHash = window.location.hash.slice(1).split("?")[0] || "/home";
  // If route is passed, use it, otherwise detect from hash
  const targetRoute = route || currentHash;

  document.querySelectorAll(".sidebar .menu-item").forEach((item) => {
      // Check both href and data-route
      const href = item.getAttribute("href");
      const isActive = href === `#${targetRoute}` || item.dataset.route === targetRoute;
      item.classList.toggle("active", isActive);
  });
}

// Global navigate function usually called by internal logic (deprecating direct usage in favor of href="#...")
function navigate(e, route) {
  // If it's a special action like create content, handle it specifically
  if (route === "/create/post") {
      e.preventDefault();
      openCreatePostModal();
      closeAllDropdowns();
      return;
  }
  
  // Special handling for Home (Refresh if already at Home)
  if (route === "/home" || route === "/") {
      const currentHash = window.location.hash;
      // Check if we are already at home (empty hash, #/, or #/home)
      const isAtHome = !currentHash || currentHash === "#/" || currentHash === "#/home";
      
      if (isAtHome) {
          e.preventDefault();
          if (window.reloadHome) window.reloadHome();
          closeAllDropdowns(); // Ensure sidebar closes on mobile/collapsed
          return;
      }
      // If not at home, standard href or hash change will handle it.
      // But if this was called via onclick (like Logo), we need to manually set hash if not prevented.
      // For Logo: onclick="navigate(event, '/home')"
      // If we are NOT at home, we should proceed navigation.
      // Since 'navigate' usually implies manual handling, let's set hash.
      if (!e.defaultPrevented && !e.target.getAttribute("href")) {
          window.location.hash = "#/home";
      }
  }
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
