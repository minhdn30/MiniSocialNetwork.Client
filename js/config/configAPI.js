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
  let activeApiBase = null;

  function normalizeApiBase(baseUrl) {
    if (typeof baseUrl !== "string") return null;
    const trimmed = baseUrl.trim();
    if (!trimmed) return null;
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }

  function getApiBaseCandidates() {
    const configured = normalizeApiBase(window.APP_CONFIG?.API_BASE);
    const configuredCandidates = Array.isArray(window.APP_CONFIG?.API_BASE_CANDIDATES)
      ? window.APP_CONFIG.API_BASE_CANDIDATES.map(normalizeApiBase).filter(Boolean)
      : [];

    const host = (window.location?.hostname || "").toLowerCase();
    const isLoopbackHost = host === "localhost" || host === "127.0.0.1";
    const localDefaults = isLoopbackHost
      ? [
          "https://localhost:5000/api",
          "http://localhost:5000/api",
          "https://localhost:5270/api",
          "http://localhost:5270/api",
        ]
      : [];

    const allCandidates = [
      normalizeApiBase(activeApiBase),
      configured,
      ...configuredCandidates,
      ...localDefaults.map(normalizeApiBase),
      "http://localhost:5000/api",
    ].filter(Boolean);

    // De-duplicate while keeping order.
    return [...new Set(allCandidates)];
  }

  function setActiveApiBase(baseUrl) {
    const normalized = normalizeApiBase(baseUrl);
    if (!normalized) return;
    if (activeApiBase !== normalized) {
      console.info(`🌐 API base selected: ${normalized}`);
    }
    activeApiBase = normalized;
    if (window.APP_CONFIG) {
      window.APP_CONFIG.API_BASE = normalized;
    }
  }

  function getCurrentApiBase() {
    const candidates = getApiBaseCandidates();
    return normalizeApiBase(activeApiBase) || candidates[0] || "http://localhost:5000/api";
  }

  async function fetchWithApiBase(url, fetchOptions) {
    const candidates = getApiBaseCandidates();
    let lastError = null;

    for (const baseUrl of candidates) {
      try {
        const res = await fetch(`${baseUrl}${url}`, fetchOptions);
        setActiveApiBase(baseUrl);
        return { res, baseUrl };
      } catch (err) {
        lastError = err;
      }
    }

    console.error("❌ Unable to reach API. Tried bases:", candidates, "url:", url, "error:", lastError);
    throw lastError || new TypeError("Failed to fetch");
  }

  function getAccessToken() {
    return window.AuthStore?.getAccessToken?.() || null;
  }

  function setAccessToken(token) {
    if (window.AuthStore?.setAccessToken) {
      window.AuthStore.setAccessToken(token, "api");
    }
  }

  function syncAuthProfileFromResponse(data) {
    if (!data || typeof data !== "object") return;

    const accountId = data.accountId ?? data.AccountId;
    const fullname = data.fullname ?? data.Fullname;
    const username = data.username ?? data.Username;
    const avatarUrl = data.avatarUrl ?? data.AvatarUrl;

    if (accountId) {
      localStorage.setItem("accountId", accountId);
      if (window.APP_CONFIG) {
        window.APP_CONFIG.CURRENT_USER_ID = accountId;
      }
    }
    if (fullname !== undefined && fullname !== null) {
      localStorage.setItem("fullname", fullname);
    }
    if (username !== undefined && username !== null) {
      localStorage.setItem("username", username);
    }
    if (avatarUrl !== undefined && avatarUrl !== null) {
      localStorage.setItem("avatarUrl", avatarUrl);
    }
  }

  function clearClientSession() {
    if (window.AuthStore?.clearAccessToken) {
      window.AuthStore.clearAccessToken("logout");
    }
    // Backward compatibility cleanup for legacy storage keys
    localStorage.removeItem("accessToken");
    localStorage.removeItem("accountId");
    localStorage.removeItem("fullname");
    localStorage.removeItem("username");
    localStorage.removeItem("avatarUrl");
    localStorage.removeItem("defaultPostPrivacy");
    localStorage.removeItem("SOCIAL_NETWORK_OPEN_CHATS");
  }

  async function refreshAccessToken() {
    if (!refreshPromise) {
      console.warn("🔄 Token expired, attempting refresh...");
      refreshPromise = fetchWithApiBase("/Auths/refresh-token", {
        method: "POST",
        credentials: "include",
      })
        .then(({ res }) => res)
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
          setAccessToken(data.accessToken);
          syncAuthProfileFromResponse(data);
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
    const accessToken = getAccessToken();

    const headers = { ...options.headers };
    if (accessToken && !options.skipAuth) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const { res } = await fetchWithApiBase(url, {
      ...options,
      credentials: "include",
      headers: headers,
    });

    if (res.status === 403) {
        const clonedRes = res.clone();
        try {
            const data = await clonedRes.json();
            // If the message contains status info, it's likely our AccountStatusMiddleware
            if (data.message && (data.message.toLowerCase().includes("status") || data.message.toLowerCase().includes("reactivate"))) {
                console.warn("🚫 Account restricted, logging out...");
                clearClientSession();
                
                if (!window.location.pathname.includes("auth.html")) {
                    window.location.href = "auth.html?reason=restricted";
                }
            }
        } catch (e) {
            // Not JSON or no message
        }
    }

    if (res.status !== 401 || options.skipAuth) return res;

    // Unauthorized - try refresh
    try {
      const newToken = await refreshAccessToken();
      const { res: retryRes } = await fetchWithApiBase(url, {
        ...options,
        credentials: "include",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
      return retryRes;
    } catch (err) {
      console.error("❌ Auto-logout due to refresh failure:", err);
      // Refresh failed or expired
      clearClientSession();
      if (!window.location.pathname.includes("auth.html")) {
        window.location.href = "auth.html";
      }
      throw err;
    }
  }

  function uploadFormDataWithProgress(url, formData, onProgress, method = "POST") {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const baseUrl = getCurrentApiBase();
      // don't show global loader for chat messages (we use optimistic UI)
      const isChatMessage = url.includes('/Messages/');
      if (!isChatMessage && window.showGlobalLoader) window.showGlobalLoader(0);

      xhr.open(method, baseUrl + url);
      xhr.withCredentials = true;

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && typeof onProgress === "function") {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent);
        }
      };

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (!isChatMessage && window.hideGlobalLoader) window.hideGlobalLoader();
          const status = xhr.status;
          const text = xhr.responseText;
          const ok = status >= 200 && status < 300;
          
          if (status === 403) {
             try {
                 const data = JSON.parse(text);
                 if (data.message && (data.message.toLowerCase().includes("status") || data.message.toLowerCase().includes("reactivate"))) {
                     clearClientSession();
                     if (!window.location.pathname.includes("auth.html")) {
                        window.location.href = "auth.html?reason=restricted";
                     }
                 }
             } catch(e) {}
          }

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

      const sendRequest = async () => {
        let accessToken = getAccessToken();
        if (!accessToken) {
          try {
            accessToken = await refreshAccessToken();
          } catch (_) {
            accessToken = null;
          }
        }

        if (accessToken) {
          xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        }

        xhr.send(formData);
      };

      sendRequest().catch(reject);
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
      login: (email, password) =>
        apiFetch("/Auths/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          skipAuth: true,
        }),
      register: (data) =>
        apiFetch("/Auths/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          skipAuth: true,
        }),
      sendEmail: (email) =>
        apiFetch("/Auths/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(email),
          skipAuth: true,
        }),
      verifyCode: (email, code) =>
        apiFetch("/Auths/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
          skipAuth: true,
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
      getByPostCode: (postCode) => apiFetch(`/Posts/p/${postCode}`),
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
      getByAccountId: (accountId, page, pageSize) =>
        apiFetch(`/Posts/profile/${accountId}?page=${page}&pageSize=${pageSize}`),
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
      getProfile: (accountId) =>
        apiFetch(`/Accounts/profile/${accountId}`),
      getProfileByUsername: (username) =>
        apiFetch(`/Accounts/profile/username/${username}`),
      updateProfile: (formData) =>
        uploadFormDataWithProgress("/Accounts/profile", formData, null, "PATCH"),
      getSettings: () => apiFetch("/Accounts/settings"),
      updateSettings: (data) =>
        apiFetch("/Accounts/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      reactivate: () =>
        apiFetch(`/Accounts/reactivate`, { method: "POST" }),
    },

    Follows: {
      follow: (targetId) =>
        apiFetch(`/Follows/${targetId}`, { method: "POST" }),
      unfollow: (targetId) =>
        apiFetch(`/Follows/${targetId}`, { method: "DELETE" }),
      getFollowers: (accountId, request) => {
        let url = `/Follows/followers?accountId=${accountId}&page=${request.page}&pageSize=${request.pageSize}`;
        if (request.keyword) url += `&keyword=${encodeURIComponent(request.keyword)}`;
        if (request.sortByCreatedASC !== undefined && request.sortByCreatedASC !== null) url += `&sortByCreatedASC=${request.sortByCreatedASC}`;
        return apiFetch(url);
      },
      getFollowing: (accountId, request) => {
        let url = `/Follows/following?accountId=${accountId}&page=${request.page}&pageSize=${request.pageSize}`;
        if (request.keyword) url += `&keyword=${encodeURIComponent(request.keyword)}`;
        if (request.sortByCreatedASC !== undefined && request.sortByCreatedASC !== null) url += `&sortByCreatedASC=${request.sortByCreatedASC}`;
        return apiFetch(url);
      },
    },

    Conversations: {
      getConversations: (isPrivate, search, page = 1, pageSize = window.APP_CONFIG?.CONVERSATIONS_PAGE_SIZE || 20) => {
        let url = `/Conversations?page=${page}&pageSize=${pageSize}`;
        if (isPrivate !== undefined && isPrivate !== null) url += `&isPrivate=${isPrivate}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        return apiFetch(url);
      },
      getById: (conversationId) => apiFetch(`/Conversations/${conversationId}`),
      getMessages: (conversationId, page = 1, pageSize = window.APP_CONFIG?.CHATPAGE_MESSAGES_PAGE_SIZE || 20) => 
        apiFetch(`/Conversations/${conversationId}/messages?page=${page}&pageSize=${pageSize}`),
      getPrivateWithMessages: (otherId, page = 1, pageSize = window.APP_CONFIG?.CHATPAGE_MESSAGES_PAGE_SIZE || 20) =>
        apiFetch(`/Conversations/private/${otherId}?page=${page}&pageSize=${pageSize}`),
      deleteHistory: (conversationId) => apiFetch(`/Conversations/${conversationId}/history`, { method: "DELETE" }),
      getUnreadCount: () => apiFetch('/Conversations/unread-count'),
    },

    Messages: {
      // send message in private chat (1:1) - lazy creates conversation if needed
      sendPrivate: (formData, onProgress) => 
        uploadFormDataWithProgress("/Messages/private-chat", formData, onProgress),
      
      // send message in group chat - conversation must exist
      sendGroup: (conversationId, formData, onProgress) =>
        uploadFormDataWithProgress(`/Messages/group/${conversationId}`, formData, onProgress),

      hide: (messageId) => apiFetch(`/Messages/hide/${messageId}`, { method: "POST" }),
    },
  };

  // Global Reactivation Handler
  async function handleGlobalReactivation(message) {
      if (typeof showToast !== 'function') return;

      showToast(
          `<div>
            <p style="margin-bottom: 8px;">${message}</p>
            <div class="toast-actions">
              <button class="toast-btn" onclick="window.reactivateAccountAction()">Reactivate Now</button>
              <button class="toast-btn secondary" onclick="window.closeToast()">Later</button>
            </div>
          </div>`,
          "error",
          0,
          true
      );
  }

  window.reactivateAccountAction = async () => {
      try {
          const res = await window.API.Accounts.reactivate();
          if (res.ok) {
              if (typeof toastSuccess === 'function') toastSuccess("Account reactivated successfully!");
              setTimeout(() => {
                  window.closeToast();
                  if (window.location.pathname.includes("auth.html")) {
                      window.location.href = "index.html";
                  } else {
                      location.reload();
                  }
              }, 1000);
          } else {
              const data = await res.json();
              if (typeof toastError === 'function') toastError(data.message || "Reactivation failed");
          }
      } catch (err) {
          console.error(err);
          if (typeof toastError === 'function') toastError("Error during reactivation");
      }
  };

  // Export internal helpers for SignalR or other modules if they rely on window naming
  window.apiFetch = apiFetch;
  window.refreshAccessToken = refreshAccessToken;
  window.clearClientSession = clearClientSession;
  // Export
  window.uploadFormDataWithProgress = uploadFormDataWithProgress;
})();

