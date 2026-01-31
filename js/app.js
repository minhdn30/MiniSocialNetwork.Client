/* =========================
   AUTH GUARD (SAFE)
   ========================= */
(function authGuard() {
  // Chỉ redirect nếu đã logout thật sự
  const forceLoggedOut = sessionStorage.getItem("forceLogout");
  if (forceLoggedOut) {
    window.location.href = "/auth.html";
  }
})();

/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");
let refreshPromise = null;

/* =========================
   ROUTER
   ========================= */
async function loadPage(page) {
  const res = await fetch(`pages/${page}.html`);
  app.innerHTML = await res.text();
  if (window.lucide) {
    lucide.createIcons();
  }
}

function router() {
  const path = window.location.pathname;

  switch (path) {
    case "/":
    case "/home":
      loadHome();
      break;
    case "/chat":
      loadPage("chat");
      break;
    case "/profile":
      loadPage("profile");
      break;
    default:
      loadHome();
  }
}

window.onpopstate = router;
router();

/* =========================
   LOGOUT
   ========================= */
async function logout() {
  try {
    await apiFetch("/Auths/logout", { method: "POST" });
    showToast("Logged out successfully", "success");
  } catch (error) {
    console.warn("Logout API failed, force logout");
    showToast("Session cleared", "warning");
  } finally {
    forceLogout();
  }
}

function forceLogout() {
  sessionStorage.setItem("forceLogout", "true");

  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");

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

/* =========================
   REFRESH TOKEN (LOCKED)
   ========================= */
async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${APP_CONFIG.API_BASE}/Auths/refresh-token`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Refresh token expired");
        return res.json();
      })
      .then((data) => {
        localStorage.setItem("accessToken", data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/* =========================
   API FETCH (AUTO REFRESH)
   ========================= */
async function apiFetch(url, options = {}) {
  const accessToken = localStorage.getItem("accessToken");

  const res = await fetch(`${APP_CONFIG.API_BASE}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    },
  });

  // ✅ Request OK
  if (res.status !== 401) return res;

  // ⛔ AccessToken hết hạn → thử refresh
  try {
    const newToken = await refreshAccessToken();

    return fetch(`${APP_CONFIG.API_BASE}${url}`, {
      ...options,
      credentials: "include",
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newToken}`,
      },
    });
  } catch (err) {
    // ❌ Refresh token cũng hết hạn → logout thật
    forceLogout();
    throw err;
  }
}
