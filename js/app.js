/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");

if (window.APP_CONFIG) {
  APP_CONFIG.CURRENT_USER_ID = localStorage.getItem("accountId");
}

/* =========================
   ROUTER
   ========================= */
async function loadPage(pageName) {
  const res = await fetch(`pages/${pageName}.html`);
  if (!res.ok) return;
  app.innerHTML = await res.text();
  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeAllOverlayModals() {
  if (window.closePostDetailModal) {
      const modal = document.getElementById("postDetailModal");
      if (modal && modal.classList.contains("show")) {
          if (window.forceClosePostDetail) window.forceClosePostDetail();
          else window.closePostDetailModal();
      }
  }

  if (typeof hidePreview === 'function') hidePreview();
  else {
      const previewEl = document.getElementById("profile-preview");
      if (previewEl) previewEl.classList.add("hidden");
  }

  const createModal = document.getElementById("createPostModal");
  if (createModal && createModal.classList.contains("show")) {
       if (window.closeCreatePostModal) window.closeCreatePostModal();
  }

  if (window.InteractionModule && typeof window.InteractionModule.closeReactList === 'function') {
      const interactModal = document.getElementById("interactionModal");
      if (interactModal && interactModal.classList.contains("show")) {
          window.InteractionModule.closeReactList();
      }
  }
  
  document.body.style.overflow = "";
}
window.closeAllOverlayModals = closeAllOverlayModals;

function getCacheKey(hash) {
    if (!hash || hash === "#/" || hash === "#/home") return "home";
    return hash;
}

let lastHash = null;

function router() {
  const hash = window.location.hash || "#/";
  const path = hash.slice(1).split("?")[0];
  
  const prevKey = getCacheKey(lastHash);
  const nextKey = getCacheKey(hash);

  // 1. Save previous page state
  if (lastHash && prevKey !== nextKey) {
      const pageData = window.getPageData ? window.getPageData() : null;
      PageCache.save(prevKey, app, pageData);
  }

  // 2. Clear current hooks for next page
  window.getPageData = null;
  window.setPageData = null;

  // 3. Update tracking
  lastHash = hash;

  // 4. Close Overlays
  closeAllOverlayModals();

  // SPECIAL RULE: Do not cache/restore other people's profiles. 
  // Always force fresh load (reset scroll) for them. Keep cache only for MY profile.
  if (path === "/profile") {
      const myId = localStorage.getItem("accountId");
      let targetId = null;
      
      if (hash.includes("?id=")) {
          targetId = hash.split("?id=")[1].split("&")[0];
      } else if (hash.includes("/profile/") && hash.split("/profile/")[1]) {
          targetId = hash.split("/profile/")[1].split("?")[0];
      }

      // If targetId exists (not empty) and is different from myId -> Update Strategy: CLEAR CACHE
      if (targetId && myId && targetId.toLowerCase() !== myId.toLowerCase()) {
          // console.log("[Router] Clearing cache for foreign profile to reset scroll");
          PageCache.clear(nextKey);
      }
  }

  // 5. Try Restore
  if (PageCache.has(nextKey)) {
      const cached = PageCache.get(nextKey);
      
      // CRITICAL FIX: Restore JS state data BEFORE restoring DOM.
      // Restoring DOM triggers scroll events immediately, so state (currentProfileId) MUST be ready.
      
      // For Profile page, rely on the Permanent State Accessor because global hooks are cleared
      if (path === "/profile" && window.ProfileState && cached.data) {
          window.ProfileState.setPageData(cached.data);
      } 
      // Fallback for other pages or if setPageData is somehow available
      else if (window.setPageData && cached.data) {
          window.setPageData(cached.data);
      }
      
      // RESTORE DOM (PageCache.restore handles clearing and appending correctly)
      PageCache.restore(nextKey, app);
      
      // If we are on profile page, we might need to manually trigger initiation logic 
      // because initProfile() isn't called during restore.
      if (path === "/profile" && window.initProfilePage && cached.data) {
           // We might need to ensure listeners are re-attached or silent updates run
           // But wait, initProfilePage calls restore() again? NO.
           // Can we expose a function like window.onProfileRestored()?
      }
      
      // But wait! If we just restore DOM, the listeners in initProfile (like event listeners) are goners?
      // Actually, listeners attached to elements in DocumentFragment are PRESERVED! 
      // That's the beauty of DocumentFragment.
      // But global listeners (like window.scroll) are... well, window.scroll logic in profile.js is global.
      
      // One thing missing: Silent Update (fetching new stats).
      // Profile.js has no way to know it was restored unless we tell it.
      if (path === "/profile" && window.triggerProfileSilentUpdate) {
          window.triggerProfileSilentUpdate();
      }

      setActiveSidebar(path);
      return;
  }

  // 6. Fresh Load
  app.innerHTML = "";
  window.scrollTo(0, 0);

  switch (path) {
    case "/":
    case "/home":
      loadHome();
      break;

    case "/profile":
      loadProfilePage();
      break;

    case "/search":
      loadPlaceholder("Search", "search");
      break;

    case "/explore":
      loadPlaceholder("Explore", "compass");
      break;

    case "/reels":
      loadPlaceholder("Reels", "clapperboard");
      break;

    case "/messages":
      loadPlaceholder("Messages", "send");
      break;

    case "/notifications":
      loadPlaceholder("Notifications", "bell");
      break;

    default:
      loadHome();
  }
  
  setActiveSidebar(path);
}

function loadPlaceholder(title, iconName) {
    app.innerHTML = `
        <div class="placeholder-container">
            <div class="placeholder-content">
                <div class="placeholder-icon">
                    <i data-lucide="${iconName}"></i>
                </div>
                <h1>${title} coming soon</h1>
                <p>We're working hard to bring this feature to you. Stay tuned!</p>
                <button class="placeholder-btn" onclick="window.location.hash='#/home'">Go back Home</button>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

async function loadProfilePage() {
    const hash = window.location.hash;
    const key = getCacheKey(hash);

    // REMOVED: Do not clear cache here, let initProfilePage handle restore & silent update
    // if (hash === "#/profile" || hash === "#/profile/") {
    //     PageCache.clear(key);
    // }

    await loadPage("profile");
    if (window.initProfilePage) {
        window.initProfilePage();
    }
}

async function reloadPage() {
    console.log("Forcing Page Reload...");
    const key = getCacheKey(window.location.hash);
    PageCache.clear(key);
    router();
}
window.reloadPage = reloadPage;
window.reloadHome = reloadPage;

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);

// CAPTURE SCROLL BEFORE NAVIGATION
// This prevents the browser from resetting scroll to 0 during hashchange before we can save it.
document.addEventListener("click", (e) => {
    // Find closest anchor tag
    const link = e.target.closest("a");
    if (link) {
        const href = link.getAttribute("href");
        // Only snapshot for internal hash links
        if (href && href.startsWith("#")) {
             if (window.PageCache && typeof window.PageCache.snapshot === 'function') {
                 window.PageCache.snapshot();
             }
        }
    }
}, true); // Use capture phase to run before other handlers

/* =========================
   LOGOUT
   ========================= */
function clearSessionAndRedirect() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");
  localStorage.removeItem("accountId");
  PageCache.clearAll();
  window.location.href = "/auth.html";
}

// Global logout function callable from sidebar or elsewhere
window.logout = function() {
    clearSessionAndRedirect();
};

/* =========================
   BOOTSTRAP
   ========================= */
(async function bootstrap() {
  try {
    await loadSidebar();
    if (typeof initProfilePreview === "function") await initProfilePreview();
  } catch (err) {
    console.error("Bootstrap failed", err);
  }
})();
