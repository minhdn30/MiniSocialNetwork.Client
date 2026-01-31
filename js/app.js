(function authGuard() {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    window.location.href = "auth.html";
  }
})();

const app = document.getElementById("app");

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

//logout
async function logout() {
  try {
    await apiFetch("/Auths/logout", {
      method: "POST",
    });

    showToast("Logged out successfully", "success");
  } catch (error) {
    console.warn("Logout API failed, force logout");
    showToast("Session cleared", "warning");
  } finally {
    forceLogout();
  }
}

function forceLogout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("fullname");

  window.location.href = "/auth.html";
}

(async function bootstrap() {
  await loadSidebar();

  if (typeof initProfilePreview === "function") {
    await initProfilePreview();
  }
})();
async function apiFetch(url, options = {}) {
  const accessToken = localStorage.getItem("accessToken");

  const res = await fetch(`${APP_CONFIG.API_BASE}${url}`, {
    ...options,
    credentials: "include", // 🔥 cho refresh-token cookie
    headers: {
      ...options.headers,
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    },
  });

  // OK
  if (res.status !== 401) return res;

  // ⛔ Access token hết hạn → refresh
  const refreshRes = await fetch(`${APP_CONFIG.API_BASE}/Auths/refresh-token`, {
    method: "POST",
    credentials: "include",
  });

  if (!refreshRes.ok) {
    forceLogout();
    throw new Error("Session expired");
  }

  const data = await refreshRes.json();
  localStorage.setItem("accessToken", data.accessToken);

  // 🔁 retry request ban đầu
  return fetch(`${APP_CONFIG.API_BASE}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      Authorization: `Bearer ${data.accessToken}`,
    },
  });
}
