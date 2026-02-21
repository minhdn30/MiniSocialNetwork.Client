// ===== Theme Management =====
const THEME_KEY = "theme";
const THEME_CHANGED_EVENT = "app:theme-changed";

// Get saved theme or default to dark
function getTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  return savedTheme || "dark";
}

// Set theme and apply to entire system
function setTheme(theme) {
  const body = document.body;

  // Apply theme using class (more compatible with CSS)
  if (theme === "light") {
    body.classList.add("light-mode");
  } else {
    body.classList.remove("light-mode");
  }

  // Save to localStorage
  localStorage.setItem(THEME_KEY, theme);

  // Update UI elements (icons, toggle switch)
  updateThemeUI(theme);

  // Notify modules that depend on dark/light mode-specific tokens.
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, {
      detail: { theme },
    }),
  );
}

// Toggle between dark and light theme
function toggleTheme() {
  const currentTheme = getTheme();
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  setTheme(newTheme);
}

// Update theme UI elements (icons and toggle switch in sidebar)
function updateThemeUI(theme) {
  const themeIcon = document.getElementById("theme-icon");
  const themeToggle = document.getElementById("theme-toggle");

  if (themeIcon && themeToggle) {
    if (theme === "light") {
      themeIcon.setAttribute("data-lucide", "sun");
      themeToggle.classList.add("active");
    } else {
      themeIcon.setAttribute("data-lucide", "moon");
      themeToggle.classList.remove("active");
    }

    // Recreate lucide icons
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

// Attach event listener to sidebar theme toggle
function attachThemeToggle() {
  const themeToggleItem = document.getElementById("theme-toggle-item");

  if (themeToggleItem) {
    themeToggleItem.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTheme();
    });
  }
}

// Initialize theme on page load (before DOM renders to avoid flash)
function initTheme() {
  const theme = getTheme();
  const body = document.body;

  // Apply theme immediately
  if (theme === "light") {
    body.classList.add("light-mode");
  } else {
    body.classList.remove("light-mode");
  }

  // Don't save to localStorage here, already saved
}

// Auto-init theme IMMEDIATELY (prevent flash)
initTheme();

// Attach toggle after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    updateThemeUI(getTheme());
  });
} else {
  updateThemeUI(getTheme());
}

// Export for use in other scripts
window.themeManager = {
  EVENT: THEME_CHANGED_EVENT,
  getTheme,
  setTheme,
  toggleTheme,
  initTheme,
  updateThemeUI,
  attachThemeToggle,
};
