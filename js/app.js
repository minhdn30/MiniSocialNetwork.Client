/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");
let refreshPromise = null;

// Initialize global config from local storage
if (window.APP_CONFIG) {
  APP_CONFIG.CURRENT_USER_ID = localStorage.getItem("accountId");
}

/* =========================
   ROUTER
   ========================= */
/* =========================
   ROUTER
   ========================= */
async function loadPage(page) {
  const res = await fetch(`pages/${page}.html`);
  if (!res.ok) {
        // Fallback or error handling
        return;
  }
  app.innerHTML = await res.text();
  if (window.lucide) {
    lucide.createIcons();
  }
}

// NEW: Helper to close all floating modals/previews when navigating
function closeAllOverlayModals() {
  // 1. Post Detail Modal
  if (window.closePostDetailModal) {
      // Force close if it's open
      const modal = document.getElementById("postDetailModal");
      if (modal && modal.classList.contains("show")) {
          // If forced, bypass checks? Or better to use the proper closer
          // Use forceClose to avoid "discard changes" alerts during navigation
          if (window.forceClosePostDetail) {
              window.forceClosePostDetail();
          } else {
              window.closePostDetailModal();
          }
      }
  }

  // 2. Profile Preview
  if (typeof hidePreview === 'function') {
      hidePreview();
  } else {
      const previewEl = document.getElementById("profile-preview");
      if (previewEl) previewEl.classList.add("hidden");
  }

  // 3. Create Post Modal (if open)
  const createModal = document.getElementById("createPostModal");
  if (createModal && createModal.classList.contains("show")) {
       if (window.closeCreatePostModal) window.closeCreatePostModal();
  }

  // 4. Interaction/Reacts List
  if (window.InteractionModule && typeof window.InteractionModule.closeReactList === 'function') {
      const interactModal = document.getElementById("interactionModal");
      if (interactModal && interactModal.classList.contains("show")) {
          window.InteractionModule.closeReactList();
      }
  }
  
  // Ensure background scrolling is restored
  document.body.style.overflow = "";
}
window.closeAllOverlayModals = closeAllOverlayModals;

// Cache State
let cachedHomeFragment = null;
let cachedHomeScrollY = 0;
let lastPath = null;

function router() {
  const hash = window.location.hash || "#/";
  const path = hash.slice(1).split("?")[0];

  // 1. Handle LEAVING Home -> Cache it
  // Only cache if we are strictly leaving Home (not refreshing Home)
  const isLeavingHome = (lastPath === "/home" || lastPath === "/") && (path !== "/home" && path !== "/");
  
  if (isLeavingHome) {
      cachedHomeScrollY = window.scrollY;
      cachedHomeFragment = document.createDocumentFragment();
      // Move all nodes to fragment (preserving event listeners and state)
      while (app.firstChild) {
          cachedHomeFragment.appendChild(app.firstChild);
      }
  }

  // 2. Close Overlays (always)
  closeAllOverlayModals();

  // 3. Routing Logic
  
  // If we cached home, app is empty. If we didn't cache home but are changing pages, we normally clear app.
  // BUT loadPage() executes asynchronously, so clearing now is good practice (except for Restore case).
  
  const previousPath = lastPath;
  lastPath = path; // Update for next time

  switch (path) {
    case "/":
    case "/home":
      // If we have a cache AND we are coming from a different page (Restoring)
      if (cachedHomeFragment && (previousPath !== "/home" && previousPath !== "/")) {
          // Restore
          app.innerHTML = ""; // Ensure empty
          app.appendChild(cachedHomeFragment);
          window.scrollTo(0, cachedHomeScrollY);
      } else {
          // Reset / Fresh Load
          cachedHomeFragment = null; // clear cache on fresh load
          if (app.children.length > 0) app.innerHTML = ""; // Clear old content
          window.scrollTo(0, 0);
          loadHome();
      }
      break;

    case "/chat":
      app.innerHTML = "";
      window.scrollTo(0, 0);
      loadPage("chat");
      break;

    case "/profile":
      app.innerHTML = "";
      window.scrollTo(0, 0);
      loadProfilePage();
      break;

    default:
      app.innerHTML = "";
      window.scrollTo(0, 0);
      loadHome();
  }
  
  setActiveSidebar(path);
}

async function loadProfilePage() {
    await loadPage("profile");
    if (window.initProfilePage) {
        window.initProfilePage();
    }
}
// Helper to force reload home (e.g. when clicking Home while on Home)
async function reloadHome() {
    console.log("Forcing Home Reload...");
    cachedHomeFragment = null;
    cachedHomeScrollY = 0;
    app.innerHTML = "";
    window.scrollTo(0, 0);
    closeAllOverlayModals();
    await loadHome();
}
window.reloadHome = reloadHome;

// Listen to hash changes
window.addEventListener("hashchange", router);
// Initial load
window.addEventListener("DOMContentLoaded", () => {
    // Set initial lastPath to avoid weird caching on first run
    // actually router() handles it fine as lastPath is null
    router();
});

/* =========================
   LOGOUT
   ========================= */
async function logout() {
  try {
    await API.Auth.logout();
  } catch (_) {
    // ignore
  } finally {
    clearSessionAndRedirect();
  }
}

function clearSessionAndRedirect() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");

  // Clear Cache to free memory
  cachedHomeFragment = null;
  cachedHomeScrollY = 0;

  window.location.href = "/auth.html";
}

/* =========================
   BOOTSTRAP
   ========================= */
(async function bootstrap() {
  try {
    await loadSidebar();

    if (typeof initProfilePreview === "function") {
      await initProfilePreview();
    }
  } catch (err) {
    console.error("Bootstrap failed", err);
  }
})();

// Redundant API fetch logic removed - moved to configAPI.js
// Export refreshAccessToken globally if needed (already handled in configAPI.js)

/* =========================
   GLOBAL UPLOAD HELPERS
   These helpers provide a global full-screen upload overlay and
   an XHR FormData uploader with progress reporting. They were
   moved here so all modules can reuse them.
   ========================= */

// Create / manage global upload overlay (Instagram Style)
function createGlobalLoader() {
  if (document.getElementById("globalUploadOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "globalUploadOverlay";
  overlay.className = "global-upload-overlay";

  const card = document.createElement("div");
  card.className = "global-upload-card";

  // Instagram-style spinner (no percentage)
  const spinner = document.createElement("div");
  spinner.className = "upload-spinner";

  const label = document.createElement("div");
  label.className = "upload-text";
  label.textContent = "Uploading...";

  card.appendChild(spinner);
  card.appendChild(label);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function showGlobalLoader(percent) {
  createGlobalLoader();
  const overlay = document.getElementById("globalUploadOverlay");
  if (!overlay) return;

  // Just show the overlay - no need to update percentage
  overlay.classList.add("show");
}

function hideGlobalLoader() {
  const overlay = document.getElementById("globalUploadOverlay");
  if (overlay) overlay.classList.remove("show");
}

// uploadFormDataWithProgress has been moved to configAPI.js


