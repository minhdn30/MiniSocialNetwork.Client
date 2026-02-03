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
   REFRESH TOKEN (LOCK)
   ========================= */
async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${APP_CONFIG.API_BASE}/Auths/refresh-token`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error("REFRESH_EXPIRED");
        }
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
   API FETCH
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

  // OK
  if (res.status !== 401) return res;

  // Try refresh
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
    // ❗ CHỈ logout khi refresh-token thật sự hết hạn
    clearSessionAndRedirect();
    throw err;
  }
}

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

// Upload FormData with XHR to track progress and include auth
function uploadFormDataWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", APP_CONFIG.API_BASE + url);
    xhr.withCredentials = true;

    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable && typeof onProgress === "function") {
        const percent = (e.loaded / e.total) * 100;
        onProgress(percent);
      }
    };

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        const status = xhr.status;
        const text = xhr.responseText;
        const ok = status >= 200 && status < 300;
        resolve({
          status: status,
          ok: ok,
          text: () => Promise.resolve(text),
          json: () => {
            try {
              return Promise.resolve(JSON.parse(text));
            } catch (e) {
              return Promise.resolve(null);
            }
          },
        });
      }
    };

    xhr.onerror = function (e) {
      reject(e);
    };

    xhr.send(formData);
  });
}

// Export refreshAccessToken globally for reuse (e.g., SignalR)
window.refreshAccessToken = refreshAccessToken;
