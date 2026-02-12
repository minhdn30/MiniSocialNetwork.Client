(function (global) {
  const TOKEN_CHANGED_EVENT = "auth:token-changed";
  const SESSION_TOKEN_KEY = "sn_access_token";
  let accessToken = null;

  function normalizeToken(token) {
    if (typeof token !== "string") return null;
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function emitTokenChanged(source) {
    try {
      global.dispatchEvent(
        new CustomEvent(TOKEN_CHANGED_EVENT, {
          detail: { hasToken: !!accessToken, source },
        }),
      );
    } catch (_) {
      // no-op
    }
  }

  function setAccessToken(token, source = "set") {
    accessToken = normalizeToken(token);
    try {
      if (accessToken) {
        global.sessionStorage?.setItem(SESSION_TOKEN_KEY, accessToken);
      } else {
        global.sessionStorage?.removeItem(SESSION_TOKEN_KEY);
      }
    } catch (_) {
      // no-op
    }
    emitTokenChanged(source);
    return accessToken;
  }

  function getAccessToken() {
    return accessToken;
  }

  function hasAccessToken() {
    return !!accessToken;
  }

  function clearAccessToken(source = "clear") {
    accessToken = null;
    try {
      global.sessionStorage?.removeItem(SESSION_TOKEN_KEY);
    } catch (_) {
      // no-op
    }
    emitTokenChanged(source);
  }

  async function ensureAccessToken() {
    if (accessToken) return accessToken;
    if (typeof global.refreshAccessToken !== "function") return null;

    try {
      const refreshed = normalizeToken(await global.refreshAccessToken());
      if (refreshed && !accessToken) {
        setAccessToken(refreshed, "ensure");
      }
      return refreshed;
    } catch (_) {
      return null;
    }
  }

  // Legacy migration: keep current login sessions working after deploy.
  try {
    const sessionToken = global.sessionStorage?.getItem(SESSION_TOKEN_KEY);
    if (sessionToken) {
      setAccessToken(sessionToken, "session-restore");
    }

    const legacyToken = global.localStorage?.getItem("accessToken");
    if (!accessToken && legacyToken) {
      setAccessToken(legacyToken, "legacy-migrate");
    }
    global.localStorage?.removeItem("accessToken");
  } catch (_) {
    // no-op
  }

  global.AuthStore = {
    EVENT: TOKEN_CHANGED_EVENT,
    setAccessToken,
    getAccessToken,
    hasAccessToken,
    clearAccessToken,
    ensureAccessToken,
  };
})(window);
