/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");

if (window.APP_CONFIG) {
  APP_CONFIG.CURRENT_USER_ID = localStorage.getItem("accountId");
}

/* =========================
   SCROLL HELPERS
   ========================= */
function lockScroll() {
  const mc = document.querySelector('.main-content');
  if (mc) mc.style.overflow = "hidden";
}
window.lockScroll = lockScroll;

function unlockScroll() {
  const mc = document.querySelector('.main-content');
  if (mc) mc.style.overflow = "auto";
}
window.unlockScroll = unlockScroll;

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
  // Post Detail
  const postDetailModal = document.getElementById("postDetailModal");
  if (postDetailModal && postDetailModal.classList.contains("show")) {
      if (typeof window.closePostDetailModal === 'function') {
          window.closePostDetailModal();
      } else {
          postDetailModal.classList.remove("show");
      }
  }

  // Profile Preview
  if (typeof hidePreview === 'function') hidePreview();
  else {
      const previewEl = document.getElementById("profile-preview");
      if (previewEl) previewEl.classList.add("hidden");
  }

  // Create Post
  const createModal = document.getElementById("createPostModal");
  if (createModal && createModal.classList.contains("show")) {
       if (window.closeCreatePostModal) window.closeCreatePostModal();
       else createModal.classList.remove("show");
  }

  // React List
  if (window.InteractionModule && typeof window.InteractionModule.closeReactList === 'function') {
      const interactModal = document.getElementById("interactionModal");
      if (interactModal && interactModal.classList.contains("show")) {
          window.InteractionModule.closeReactList();
      }
  }

  // Follow List
  if (window.FollowListModule && typeof window.FollowListModule.closeFollowList === 'function') {
      const followModal = document.getElementById("followListModal");
      if (followModal && followModal.classList.contains("show")) {
          window.FollowListModule.closeFollowList();
      }
  }

  // Chat Sidebar
  if (window.closeChatSidebar && !window.location.hash.startsWith('#/messages')) {
      window.closeChatSidebar();
  }

  // Chat Windows (Floating) - Close all if entering Chat Page
  if (window.location.hash.startsWith('#/messages') && window.ChatWindow && typeof window.ChatWindow.closeAll === 'function') {
      window.ChatWindow.closeAll();
  }

  // SignalR Cleanup (Leave groups when navigating away)
  if (!window.location.hash.startsWith('#/messages')) {
      if (window.ChatPage && typeof window.ChatPage.leaveCurrentConversation === 'function') {
          window.ChatPage.leaveCurrentConversation();
      }
  }

  if (!window.location.hash.startsWith('#/profile')) {
      if (typeof window.leaveCurrentProfileGroup === 'function') {
          window.leaveCurrentProfileGroup();
      }
  }
  
  unlockScroll();
}
window.closeAllOverlayModals = closeAllOverlayModals;

function getCacheKey(hash) {
    if (!hash || hash === "#/" || hash === "#/home") return "home";
    if (hash.startsWith("#/messages")) return "#/messages";
    return hash;
}

let lastHash = null;

function router() {
  const hash = window.location.hash || "#/";
  const path = hash.slice(1).split("?")[0];
  
  if (!path.startsWith("/p/")) {
      window._lastSafeHash = hash;
  }
  
  const prevKey = getCacheKey(lastHash);
  const nextKey = getCacheKey(hash);

  if (lastHash && prevKey !== nextKey) {
      if (prevKey !== "#/account-settings") {
          const pageData = window.getPageData ? window.getPageData() : null;
          PageCache.save(prevKey, app, pageData);
      }
  }

  window.getPageData = null;
  window.setPageData = null;

  lastHash = hash;

  // IMPORTANT: Close overlays first, which calls unlockScroll()
  closeAllOverlayModals();

  if (path.startsWith("/profile")) {
      const myId = localStorage.getItem("accountId");
      const myUsername = localStorage.getItem("username");
      let targetId = null;
      
      if (hash.includes("?id=")) {
          targetId = hash.split("?id=")[1].split("&")[0];
      } else if (hash.includes("?u=")) {
          targetId = hash.split("?u=")[1].split("&")[0];
      } else if (hash.includes("/profile/") && hash.split("/profile/")[1]) {
          targetId = hash.split("/profile/")[1].split("?")[0];
      }

      const isMe = !targetId || 
                   (myId && targetId.toLowerCase() === myId.toLowerCase()) || 
                   (myUsername && targetId.toLowerCase() === myUsername.toLowerCase());

      if (!isMe) {
          PageCache.clear(nextKey);
      }
  }

  if (PageCache.has(nextKey)) {
      if (prevKey === nextKey) {
          if (path === "/messages" && window.ChatPage && typeof window.ChatPage.handleUrlNavigation === 'function') {
              window.ChatPage.handleUrlNavigation();
          }
          setActiveSidebar(path);
          return;
      }

      const cached = PageCache.get(nextKey);
      
      if (path.startsWith("/profile") && window.ProfileState && cached.data) {
          window.ProfileState.setPageData(cached.data);
      } 
      else if (window.setPageData && cached.data) {
          window.setPageData(cached.data);
      }
      
      PageCache.restore(nextKey, app);
      
      // Fix: If returning to messages page, ensure we handle the URL (switch conversation if needed)
      if (path === "/messages" && window.ChatPage && typeof window.ChatPage.handleUrlNavigation === 'function') {
          window.ChatPage.handleUrlNavigation();
      }

      if (path.startsWith("/profile") && window.triggerProfileSilentUpdate) {
          window.triggerProfileSilentUpdate();
      }

      setActiveSidebar(path);
      return;
  }

  app.innerHTML = '<div class="page-loader-container"><div class="spinner spinner-large"></div></div>';
  const mc = document.querySelector('.main-content');
  if (mc) mc.scrollTop = 0;
  
  if (path.startsWith("/profile")) {
      loadProfilePage();
      setActiveSidebar(path); 
      return; 
  }

  if (path.startsWith("/p/")) {
      const postCode = path.split("/p/")[1];
      if (postCode) {
          loadHome().then(() => {
              if (window.openPostDetailByCode) {
                  window.openPostDetailByCode(postCode);
              }
          });
          return;
      }
  }

  switch (path) {
    case "/":
    case "/home":
      loadHome();
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
      loadChatPage();
      break;

    case "/notifications":
      loadPlaceholder("Notifications", "bell");
      break;

    case "/account-settings":
      loadAccountSettings();
      break;

    default:
      showErrorPage("404", "Sorry, the page you are looking for doesn't exist or has been removed.");
  }
  
  setActiveSidebar(path);
}

async function showErrorPage(title, message) {
    app.innerHTML = ""; 
    await loadPage("error");
    
    const titleEl = document.getElementById("error-title");
    const msgEl = document.getElementById("error-message");
    
    if (titleEl) titleEl.innerText = title === "404" ? "Page not found" : title;
    if (msgEl) msgEl.innerText = message;
    
    if (window.lucide) lucide.createIcons();
}
window.showErrorPage = showErrorPage;

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
    await loadPage("profile");
    if (window.initProfilePage) {
        window.initProfilePage();
    }
}

async function loadChatPage() {
    await loadPage("chat-page");
    if (window.initChatPage) {
        window.initChatPage();
    }
}

async function loadAccountSettings() {
    PageCache.clear("#/account-settings");
    await loadPage("account-settings");
    if (window.initAccountSettings) {
        window.initAccountSettings();
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

document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link) {
        const href = link.getAttribute("href");
        if (href && href.startsWith("#")) {
             if (window.PageCache && typeof window.PageCache.snapshot === 'function') {
                  window.PageCache.snapshot();
             }
        }
    }
}, true);

/* =========================
   LOGOUT
   ========================= */
function clearSessionAndRedirect() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");
  localStorage.removeItem("accountId");
  PageCache.clearAll();
  window.location.href = "auth.html";
}

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
