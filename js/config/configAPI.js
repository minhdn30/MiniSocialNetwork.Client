/**
 * configAPI.js
 * Centralized API management for the application.
 * Contains both the core fetch logic and endpoint definitions.
 */

(function () {
  /* =========================
     CORE API CLIENT
     ========================= */

  let refreshPromise = null;

  async function refreshAccessToken() {
    if (!refreshPromise) {
      console.warn("🔄 Token expired, attempting refresh...");
      refreshPromise = fetch(`${window.APP_CONFIG.API_BASE}/Auths/refresh-token`, {
        method: "POST",
        credentials: "include",
      })
        .then(async (res) => {
          console.log("🔄 Refresh response status:", res.status);
          if (res.status === 401 || res.status === 403) {
            throw new Error("REFRESH_EXPIRED_OR_FORBIDDEN");
          }
          if (!res.ok) {
             const text = await res.text();
             throw new Error(`REFRESH_FAILED_STATUS_${res.status}: ${text}`);
          }
          return res.json();
        })
        .then((data) => {
          console.log("✅ Refresh successful, new token received.");
          if (!data.accessToken) {
             throw new Error("REFRESH_NO_ACCESS_TOKEN_IN_RESPONSE");
          }
          localStorage.setItem("accessToken", data.accessToken);
          return data.accessToken;
        })
        .catch((err) => {
           console.error("❌ Error inside refreshAccessToken:", err);
           throw err;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async function apiFetch(url, options = {}) {
    const accessToken = localStorage.getItem("accessToken");
    const baseUrl = window.APP_CONFIG?.API_BASE || "http://localhost:5000/api";

    const res = await fetch(`${baseUrl}${url}`, {
      ...options,
      credentials: "include",
      headers: {
        ...options.headers,
        Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
      },
    });

    if (res.status !== 401) return res;

    // Unauthorized - try refresh
    try {
      const newToken = await refreshAccessToken();
      return fetch(`${baseUrl}${url}`, {
        ...options,
        credentials: "include",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
    } catch (err) {
      console.error("❌ Auto-logout due to refresh failure:", err);
      // Refresh failed or expired
      localStorage.removeItem("accessToken");
      if (!window.location.pathname.includes("auth.html")) {
        window.location.href = "/auth.html";
      }
      throw err;
    }
  }

  function uploadFormDataWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const baseUrl = window.APP_CONFIG?.API_BASE || "http://localhost:5000/api";
      xhr.open("POST", baseUrl + url);
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

      xhr.onerror = (e) => reject(e);
      xhr.send(formData);
    });
  }

  /* =========================
     API ENDPOINTS
     ========================= */

  window.API = {
    // Core Fetch methods (exposed if needed)
    fetch: apiFetch,
    upload: uploadFormDataWithProgress,

    Auth: {
      login: (username, password) =>
        apiFetch("/Auths/login-with-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        }),
      register: (data) =>
        apiFetch("/Auths/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      sendEmail: (email) =>
        apiFetch("/Auths/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(email),
        }),
      verifyCode: (email, code) =>
        apiFetch("/Auths/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        }),
      logout: () => apiFetch("/Auths/logout", { method: "POST" }),
      refresh: () => refreshAccessToken(),
    },

    Posts: {
      getFeed: (limit, cursorCreatedAt, cursorPostId) => {
        let url = `/Posts/feed?limit=${limit}`;
        if (cursorCreatedAt && cursorPostId) {
          url += `&cursorCreatedAt=${encodeURIComponent(cursorCreatedAt)}&cursorPostId=${cursorPostId}`;
        }
        return apiFetch(url);
      },
      getById: (postId) => apiFetch(`/Posts/${postId}`),
      create: (formData, onProgress) =>
        uploadFormDataWithProgress("/Posts", formData, onProgress),
      delete: (postId) => apiFetch(`/Posts/${postId}`, { method: "DELETE" }),
      toggleReact: (postId) =>
        apiFetch(`/Posts/${postId}/react`, { method: "POST" }),
      getReacts: (postId, page, pageSize) =>
        apiFetch(`/Posts/${postId}/reacts?page=${page}&pageSize=${pageSize}`),
      updateContent: (postId, data) =>
        apiFetch(`/Posts/${postId}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
    },

    Comments: {
      getByPostId: (postId, page, pageSize) =>
        apiFetch(
          `/Comments/post/${postId}?page=${page}&pageSize=${pageSize}`,
        ),
      getReplies: (commentId, page, pageSize) =>
        apiFetch(
          `/Comments/replies/${commentId}?page=${page}&pageSize=${pageSize}`,
        ),
      create: (postId, data) =>
        apiFetch(`/Comments/${postId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      update: (commentId, data) =>
        apiFetch(`/Comments/${commentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      delete: (commentId) =>
        apiFetch(`/Comments/${commentId}`, { method: "DELETE" }),
      toggleReact: (commentId) =>
        apiFetch(`/Comments/${commentId}/react`, { method: "POST" }),
      getReacts: (commentId, page, pageSize) =>
        apiFetch(
          `/Comments/${commentId}/reacts?page=${page}&pageSize=${pageSize}`,
        ),
    },

    Accounts: {
      getProfilePreview: (accountId) =>
        apiFetch(`/Accounts/profile-preview/${accountId}`),
    },

    Follows: {
      follow: (targetId) =>
        apiFetch(`/Follows/${targetId}`, { method: "POST" }),
      unfollow: (targetId) =>
        apiFetch(`/Follows/${targetId}`, { method: "DELETE" }),
    },
  };

  // Export internal helpers for SignalR or other modules if they rely on window naming
  window.apiFetch = apiFetch;
  window.refreshAccessToken = refreshAccessToken;
})();
