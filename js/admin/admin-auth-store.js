(function (global) {
  const TOKEN_KEY = "cm_admin_access_token";
  const PROFILE_KEY = "cm_admin_profile";
  let accessToken = null;
  let profile = null;

  function normalizeToken(token) {
    if (typeof token !== "string") {
      return null;
    }

    const trimmed = token.trim();
    return trimmed ? trimmed : null;
  }

  function readProfile(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch (_error) {
      return null;
    }
  }

  function setAccessToken(token) {
    accessToken = normalizeToken(token);

    try {
      if (accessToken) {
        global.sessionStorage?.setItem(TOKEN_KEY, accessToken);
      } else {
        global.sessionStorage?.removeItem(TOKEN_KEY);
      }
    } catch (_error) {
      // no-op
    }

    return accessToken;
  }

  function getAccessToken() {
    return accessToken;
  }

  function setProfile(nextProfile) {
    profile =
      nextProfile && typeof nextProfile === "object" ? nextProfile : null;

    try {
      if (profile) {
        global.sessionStorage?.setItem(PROFILE_KEY, JSON.stringify(profile));
      } else {
        global.sessionStorage?.removeItem(PROFILE_KEY);
      }
    } catch (_error) {
      // no-op
    }

    return profile;
  }

  function getProfile() {
    return profile;
  }

  function clear() {
    accessToken = null;
    profile = null;

    try {
      global.sessionStorage?.removeItem(TOKEN_KEY);
      global.sessionStorage?.removeItem(PROFILE_KEY);
    } catch (_error) {
      // no-op
    }
  }

  try {
    const sessionToken = global.sessionStorage?.getItem(TOKEN_KEY);
    const sessionProfile = global.sessionStorage?.getItem(PROFILE_KEY);

    accessToken = normalizeToken(sessionToken);
    profile = readProfile(sessionProfile);
  } catch (_error) {
    accessToken = null;
    profile = null;
  }

  global.AdminAuthStore = {
    setAccessToken,
    getAccessToken,
    setProfile,
    getProfile,
    clear,
  };
})(window);
