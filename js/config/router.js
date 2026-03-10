(function (global) {
  const config = global.RouteConfig || {};

  const PATHS = Object.freeze({
    ROOT: "/",
    HOME: "/",
    ERROR_404: "/404",
    SEARCH: "/search",
    EXPLORE: "/explore",
    REELS: "/reels",
    CHAT: "/chat",
    MESSAGES: "/messages",
    NOTIFICATIONS: "/notifications",
    POSTS: "/posts",
    STORIES: "/stories",
    STORY: "/story",
    ACCOUNT_SETTINGS: "/account-settings",
    SETTINGS_SEGMENT: "settings",
    PROFILE: "/profile",
    PROFILE_ME: "/me",
    PROFILE_USER_PREFIX: "/u",
    ...(config.PATHS || {}),
  });

  const LEGACY_PATHS = Object.freeze({
    HOME: "/home",
    PROFILE: "/profile",
    PROFILE_ME: "/me",
    PROFILE_USER_PREFIX: "/u",
    ACCOUNT_SETTINGS: "/account-settings",
    POST_PREFIX: "/p/",
    STORY_PREFIX: "/story/",
    ...(config.LEGACY || {}),
  });

  const SEGMENTS = Object.freeze({
    FOLLOWER: "follower",
    FOLLOWERS: "followers",
    FOLLOWING: "following",
    REELS: "reels",
    TAGGED: "tagged",
    SAVED: "saved",
    ARCHIVED_STORIES: "archived-stories",
    HIGHLIGHT: "highlight",
    HIGHLIGHTS: "highlights",
    STORY: "story",
    STORIES: "stories",
    ...(config.SEGMENTS || {}),
  });

  const REGEX = Object.freeze({
    USERNAME: /^[A-Za-z0-9._-]{1,64}$/,
    UUID:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ...(config.REGEX || {}),
  });

  const ACCOUNT_SETTINGS_SUBPAGES = Object.freeze({
    PASSWORD: "password",
  });

  const RESERVED_PROFILE_ROOTS = Object.freeze(
    new Set([
      "",
      "home",
      "search",
      "explore",
      "reels",
      "chat",
      "messages",
      "notifications",
      "posts",
      "stories",
      "story",
      "p",
      "create",
      "account-settings",
      "settings",
      "profile",
      "u",
      "me",
      "404",
      "maintenance",
      "offline",
      "forgot-password",
      "reset-password",
      "verify-email",
      SEGMENTS.FOLLOWER,
      SEGMENTS.FOLLOWERS,
      SEGMENTS.FOLLOWING,
      SEGMENTS.HIGHLIGHT,
      SEGMENTS.HIGHLIGHTS,
      SEGMENTS.STORY,
      SEGMENTS.STORIES,
    ]),
  );

  function safeDecode(segment) {
    const value = (segment || "").toString();
    if (!value) return "";
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function normalizePath(rawPath, fallbackPath = PATHS.ROOT) {
    let value = (rawPath || "").toString().trim();
    if (!value) return fallbackPath;

    if (value.startsWith("#")) value = value.slice(1);

    const queryIndex = value.indexOf("?");
    if (queryIndex >= 0) {
      value = value.slice(0, queryIndex);
    }

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1 && value.endsWith("/")) {
      value = value.slice(0, -1);
    }

    return value || fallbackPath;
  }

  function parseHash(rawHash) {
    const hashValue = (rawHash || "").toString().trim();
    if (!hashValue) {
      return {
        hash: "#/",
        path: PATHS.ROOT,
        params: new URLSearchParams(),
      };
    }

    const normalizedHash = hashValue.startsWith("#")
      ? hashValue
      : `#${hashValue}`;
    const hashBody = normalizedHash.slice(1);
    const queryIndex = hashBody.indexOf("?");

    const rawPath = queryIndex >= 0 ? hashBody.slice(0, queryIndex) : hashBody;
    const rawQuery = queryIndex >= 0 ? hashBody.slice(queryIndex + 1) : "";

    return {
      hash: normalizedHash,
      path: normalizePath(rawPath),
      params: new URLSearchParams(rawQuery),
    };
  }

  function toUrlSearchParams(rawQuery) {
    if (rawQuery instanceof URLSearchParams) {
      return new URLSearchParams(rawQuery.toString());
    }

    if (typeof rawQuery === "string") {
      const normalized = rawQuery.startsWith("?")
        ? rawQuery.slice(1)
        : rawQuery;
      return new URLSearchParams(normalized);
    }

    const params = new URLSearchParams();
    if (!rawQuery || typeof rawQuery !== "object") return params;

    Object.entries(rawQuery).forEach(([key, value]) => {
      if (!key || value === undefined || value === null) return;
      const normalizedValue = String(value).trim();
      if (!normalizedValue) return;
      params.set(key, normalizedValue);
    });

    return params;
  }

  function buildHash(path, query) {
    const normalizedPath = normalizePath(path || PATHS.ROOT);
    const params = toUrlSearchParams(query);
    const qs = params.toString();
    return qs ? `#${normalizedPath}?${qs}` : `#${normalizedPath}`;
  }

  function getCurrentHash() {
    return global.location?.hash || "#/";
  }

  function getCurrentPath() {
    return parseHash(getCurrentHash()).path;
  }

  function isHomePath(rawPath) {
    const normalized = normalizePath(rawPath, "");
    return normalized === "" || normalized === PATHS.ROOT || normalized === LEGACY_PATHS.HOME;
  }

  function isHomeHash(rawHash) {
    return isHomePath(parseHash(rawHash).path);
  }

  function isPathPrefix(path, prefixPath) {
    const normalizedPath = normalizePath(path);
    const normalizedPrefix = normalizePath(prefixPath);

    if (normalizedPrefix === PATHS.ROOT) {
      return normalizedPath === PATHS.ROOT;
    }

    return (
      normalizedPath === normalizedPrefix ||
      normalizedPath.startsWith(`${normalizedPrefix}/`)
    );
  }

  function getPathSegments(path) {
    return normalizePath(path)
      .split("/")
      .filter(Boolean);
  }

  function isReservedProfileRootSegment(segment) {
    const normalized = (segment || "").toString().trim().toLowerCase();
    if (!normalized) return true;
    return RESERVED_PROFILE_ROOTS.has(normalized);
  }

  function isValidProfileTarget(target) {
    const normalized = (target || "").toString().trim();
    if (!normalized) return false;
    return REGEX.USERNAME.test(normalized) || REGEX.UUID.test(normalized);
  }

  function isProfilePath(rawPath) {
    const normalizedPath = normalizePath(rawPath);

    if (
      normalizedPath === PATHS.PROFILE ||
      normalizedPath.startsWith(`${PATHS.PROFILE}/`) ||
      normalizedPath === PATHS.PROFILE_ME ||
      normalizedPath.startsWith(`${PATHS.PROFILE_USER_PREFIX}/`)
    ) {
      return true;
    }

    const segments = getPathSegments(normalizedPath);
    if (!segments.length) return false;

    if (
      segments.length > 1 &&
      safeDecode(segments[1]).toLowerCase() ===
        String(PATHS.SETTINGS_SEGMENT || "settings").toLowerCase() &&
      !isAccountSettingsPath(normalizedPath)
    ) {
      return false;
    }

    const firstSegment = safeDecode(segments[0]);
    if (isReservedProfileRootSegment(firstSegment)) return false;
    return isValidProfileTarget(firstSegment);
  }

  function hashPathStartsWith(rawHash, prefixPath) {
    return isPathPrefix(parseHash(rawHash).path, prefixPath);
  }

  function resolveCurrentProfileTarget() {
    const username = (global.localStorage?.getItem("username") || "")
      .toString()
      .trim();
    return username;
  }

  function buildProfilePath(profileTarget) {
    const normalizedTarget = ((profileTarget || "").toString().trim() || resolveCurrentProfileTarget()).trim();
    if (!normalizedTarget) {
      return PATHS.PROFILE;
    }
    return `/${encodeURIComponent(normalizedTarget)}`;
  }

  function buildProfileHash(profileTarget, query) {
    return buildHash(buildProfilePath(profileTarget), query);
  }

  function normalizeProfileTabName(tabName) {
    const normalized = (tabName || "").toString().trim().toLowerCase();
    if (!normalized) return "";

    if (normalized === "posts") return "posts";
    if (normalized === SEGMENTS.REELS) return SEGMENTS.REELS;
    if (normalized === SEGMENTS.TAGGED) return SEGMENTS.TAGGED;
    if (normalized === SEGMENTS.SAVED) return SEGMENTS.SAVED;
    if (normalized === SEGMENTS.ARCHIVED_STORIES)
      return SEGMENTS.ARCHIVED_STORIES;

    return "";
  }

  function extractProfileTabFromPath(rawPath, options = {}) {
    const includeDefault = options.includeDefault === true;
    const normalizedPath = normalizePath(rawPath);
    const segments = getPathSegments(normalizedPath);
    if (!segments.length) return "";

    const profileTarget = safeDecode(segments[0]);
    if (
      !isValidProfileTarget(profileTarget) ||
      isReservedProfileRootSegment(profileTarget)
    ) {
      return "";
    }

    if (segments.length === 1) {
      return includeDefault ? "posts" : "";
    }

    if (segments.length !== 2) return "";

    const normalizedTab = normalizeProfileTabName(safeDecode(segments[1]));
    if (!normalizedTab) return "";
    return normalizedTab;
  }

  function isProfileTabPath(rawPath, options = {}) {
    const includeDefault = options.includeDefault === true;
    const tab = extractProfileTabFromPath(rawPath, { includeDefault });
    return !!tab;
  }

  function buildProfileTabPath(profileTarget, tabName) {
    const normalizedTab = normalizeProfileTabName(tabName) || "posts";
    const profilePath = normalizePath(buildProfilePath(profileTarget));
    if (normalizedTab === "posts") return profilePath;
    return `${profilePath}/${normalizedTab}`;
  }

  function buildProfileTabHash(profileTarget, tabName, query) {
    return buildHash(buildProfileTabPath(profileTarget, tabName), query);
  }

  function normalizeProfileFollowListType(type) {
    const normalized = (type || "").toString().trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === SEGMENTS.FOLLOWING) return SEGMENTS.FOLLOWING;
    if (
      normalized === SEGMENTS.FOLLOWERS ||
      normalized === SEGMENTS.FOLLOWER
    ) {
      return SEGMENTS.FOLLOWERS;
    }
    return "";
  }

  function extractProfileFollowListType(rawPath) {
    const normalizedPath = normalizePath(rawPath);
    const segments = getPathSegments(normalizedPath);
    if (segments.length < 2) return "";

    const profileTarget = safeDecode(segments[0]);
    if (
      !isValidProfileTarget(profileTarget) ||
      isReservedProfileRootSegment(profileTarget)
    ) {
      return "";
    }

    if (segments.length !== 2) return "";
    return normalizeProfileFollowListType(safeDecode(segments[1]));
  }

  function isProfileFollowListPath(rawPath) {
    return !!extractProfileFollowListType(rawPath);
  }

  function buildProfileFollowListPath(profileTarget, type) {
    const normalizedType = normalizeProfileFollowListType(type);
    const profilePath = buildProfilePath(profileTarget);
    if (!normalizedType) return profilePath;
    return `${normalizePath(profilePath)}/${normalizedType}`;
  }

  function buildProfileFollowListHash(profileTarget, type, query) {
    return buildHash(buildProfileFollowListPath(profileTarget, type), query);
  }

  function extractProfileHighlightContext(rawPath) {
    const normalizedPath = normalizePath(rawPath);
    const segments = getPathSegments(normalizedPath);
    if (segments.length < 4) return null;

    const profileTarget = safeDecode(segments[0]);
    if (
      !isValidProfileTarget(profileTarget) ||
      isReservedProfileRootSegment(profileTarget)
    ) {
      return null;
    }

    const secondSegment = safeDecode(segments[1]).toLowerCase();
    const thirdSegment = safeDecode(segments[2]).toLowerCase();
    const fourthSegment = safeDecode(segments[3]);

    if (
      secondSegment === SEGMENTS.STORIES &&
      thirdSegment === SEGMENTS.HIGHLIGHT &&
      fourthSegment
    ) {
      return {
        profileTarget,
        groupId: fourthSegment,
        storyId: "",
        isLegacy: false,
      };
    }

    // Legacy support: /{username}/highlight/{groupId}/story/{storyId}
    if (segments.length >= 5) {
      const legacyGroupId = safeDecode(segments[2]);
      const legacyStoryMarker = safeDecode(segments[3]).toLowerCase();
      const legacyStoryId = safeDecode(segments[4]);
      if (
        secondSegment === SEGMENTS.HIGHLIGHT &&
        legacyGroupId &&
        legacyStoryMarker === SEGMENTS.STORY &&
        legacyStoryId
      ) {
        return {
          profileTarget,
          groupId: legacyGroupId,
          storyId: legacyStoryId,
          isLegacy: true,
        };
      }
    }

    return null;
  }

  function isProfileHighlightPath(rawPath) {
    return !!extractProfileHighlightContext(rawPath);
  }

  function buildProfileHighlightPath(profileTarget, groupId) {
    const normalizedGroupId = (groupId || "").toString().trim();
    const profilePath = normalizePath(buildProfilePath(profileTarget));
    if (!normalizedGroupId) return profilePath;

    return `${profilePath}/${SEGMENTS.STORIES}/${SEGMENTS.HIGHLIGHT}/${encodeURIComponent(normalizedGroupId)}`;
  }

  function buildProfileHighlightHash(profileTarget, groupId, query) {
    return buildHash(buildProfileHighlightPath(profileTarget, groupId), query);
  }

  function normalizeAccountSettingsSubpage(rawSubpage) {
    const normalized = (rawSubpage || "").toString().trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === ACCOUNT_SETTINGS_SUBPAGES.PASSWORD) {
      return ACCOUNT_SETTINGS_SUBPAGES.PASSWORD;
    }
    return "";
  }

  function extractAccountSettingsContext(rawPath) {
    const normalizedPath = normalizePath(rawPath);

    if (normalizedPath === LEGACY_PATHS.ACCOUNT_SETTINGS) {
      return { username: "", subpage: "" };
    }

    if (normalizedPath.startsWith(`${LEGACY_PATHS.ACCOUNT_SETTINGS}/`)) {
      const subpage = normalizeAccountSettingsSubpage(
        normalizedPath.slice(LEGACY_PATHS.ACCOUNT_SETTINGS.length + 1),
      );
      if (!subpage) return null;
      return { username: "", subpage };
    }

    const segments = getPathSegments(normalizedPath);
    if (segments.length < 2) return null;

    const username = safeDecode(segments[0]);
    const trailing = safeDecode(segments[1]).toLowerCase();
    if (trailing !== String(PATHS.SETTINGS_SEGMENT || "settings").toLowerCase()) {
      return null;
    }

    if (!isValidProfileTarget(username) || isReservedProfileRootSegment(username)) {
      return null;
    }

    if (segments.length === 2) {
      return { username, subpage: "" };
    }

    const subpage = normalizeAccountSettingsSubpage(
      segments.slice(2).map((segment) => safeDecode(segment)).join("/"),
    );
    if (!subpage) return null;

    return { username, subpage };
  }

  function extractAccountSettingsUsername(rawPath) {
    return extractAccountSettingsContext(rawPath)?.username || "";
  }

  function extractAccountSettingsSubpage(rawPath) {
    return extractAccountSettingsContext(rawPath)?.subpage || "";
  }

  function isAccountSettingsPath(rawPath) {
    return !!extractAccountSettingsContext(rawPath);
  }

  function buildAccountSettingsPath(profileTarget) {
    const profilePath = buildProfilePath(profileTarget);
    const normalizedProfilePath = normalizePath(profilePath, "");
    if (!normalizedProfilePath || normalizedProfilePath === PATHS.PROFILE) {
      return LEGACY_PATHS.ACCOUNT_SETTINGS;
    }
    return `${normalizedProfilePath}/${PATHS.SETTINGS_SEGMENT}`;
  }

  function buildAccountSettingsHash(profileTarget, query) {
    return buildHash(buildAccountSettingsPath(profileTarget), query);
  }

  function buildAccountSettingsSubPath(profileTarget, subpage) {
    const normalizedSubpage = normalizeAccountSettingsSubpage(subpage);
    if (!normalizedSubpage) {
      return buildAccountSettingsPath(profileTarget);
    }

    const basePath = normalizePath(buildAccountSettingsPath(profileTarget));
    return `${basePath}/${normalizedSubpage}`;
  }

  function buildAccountSettingsSubHash(profileTarget, subpage, query) {
    return buildHash(buildAccountSettingsSubPath(profileTarget, subpage), query);
  }

  function extractProfileTargetFromHash(rawHash) {
    const path = parseHash(rawHash).path;

    if (!isProfilePath(path)) return "";

    if (path === PATHS.PROFILE_ME) return "";

    if (path === PATHS.PROFILE || path.startsWith(`${PATHS.PROFILE}/`)) {
      const tail = path.slice(PATHS.PROFILE.length);
      const segments = tail.split("/").filter(Boolean);
      if (!segments.length) return "";
      const first = safeDecode(segments[0]);
      return isValidProfileTarget(first) ? first : "";
    }

    if (path.startsWith(`${PATHS.PROFILE_USER_PREFIX}/`)) {
      const tail = path.slice(PATHS.PROFILE_USER_PREFIX.length);
      const segments = tail.split("/").filter(Boolean);
      if (!segments.length) return "";
      const first = safeDecode(segments[0]);
      return isValidProfileTarget(first) ? first : "";
    }

    const segments = getPathSegments(path);
    if (!segments.length) return "";

    const first = safeDecode(segments[0]);
    if (isReservedProfileRootSegment(first)) return "";

    return isValidProfileTarget(first) ? first : "";
  }

  function extractConversationIdFromHash(rawHash) {
    const parsed = parseHash(rawHash);
    const path = parsed.path;

    if (isPathPrefix(path, PATHS.CHAT)) {
      if (!path.startsWith(`${PATHS.CHAT}/`)) return "";
      const rawChatValue = path.slice(PATHS.CHAT.length + 1).split("/")[0];
      return safeDecode(rawChatValue || "");
    }

    if (!isPathPrefix(path, PATHS.MESSAGES)) return "";

    const queryId = (parsed.params.get("id") || "").toString().trim();
    if (queryId) return queryId;

    if (!path.startsWith(`${PATHS.MESSAGES}/`)) return "";

    const rawValue = path.slice(PATHS.MESSAGES.length + 1).split("/")[0];
    return safeDecode(rawValue || "");
  }

  function isPostDetailPath(rawPath) {
    const normalizedPath = normalizePath(rawPath, "");
    if (!normalizedPath) return false;
    return (
      normalizedPath.startsWith(`${PATHS.POSTS}/`) ||
      normalizedPath.startsWith(LEGACY_PATHS.POST_PREFIX)
    );
  }

  function extractPostCodeFromPath(rawPath) {
    const normalizedPath = normalizePath(rawPath, "");
    if (!normalizedPath) return "";

    if (normalizedPath.startsWith(`${PATHS.POSTS}/`)) {
      const rawValue = normalizedPath.slice(PATHS.POSTS.length + 1).split("/")[0];
      return safeDecode(rawValue || "").trim();
    }

    if (normalizedPath.startsWith(LEGACY_PATHS.POST_PREFIX)) {
      const rawValue = normalizedPath.slice(LEGACY_PATHS.POST_PREFIX.length).split("/")[0];
      return safeDecode(rawValue || "").trim();
    }

    return "";
  }

  function buildPostDetailPath(postCode) {
    const normalizedPostCode = (postCode || "").toString().trim();
    if (!normalizedPostCode) return PATHS.POSTS;
    return `${PATHS.POSTS}/${encodeURIComponent(normalizedPostCode)}`;
  }

  function isChatPath(rawPath) {
    const normalizedPath = normalizePath(rawPath, "");
    if (!normalizedPath) return false;
    return (
      isPathPrefix(normalizedPath, PATHS.CHAT) ||
      isPathPrefix(normalizedPath, PATHS.MESSAGES)
    );
  }

  function isChatConversationPath(rawPath) {
    const normalizedPath = normalizePath(rawPath, "");
    if (!normalizedPath) return false;
    return normalizedPath.startsWith(`${PATHS.CHAT}/`);
  }

  function setHash(path, query) {
    const nextHash = buildHash(path, query);
    if (global.location.hash !== nextHash) {
      global.location.hash = nextHash;
    } else {
      emitRouteChange("setHash:same");
    }
    return nextHash;
  }

  function replaceHash(path, query) {
    const nextHash = buildHash(path, query);
    const base = `${global.location.pathname || ""}${global.location.search || ""}`;
    global.history.replaceState(global.history.state, "", `${base}${nextHash}`);
    emitRouteChange("replaceHash");
    return nextHash;
  }

  function goTo(path, options = {}) {
    const normalizedPath = normalizePath(path || PATHS.ROOT);
    const replace = options.replace === true;
    const nextHash = buildHash(normalizedPath, options.query);

    if (replace) {
      replaceHash(normalizedPath, options.query);
      return nextHash;
    }

    if (global.location.hash !== nextHash) {
      global.location.hash = nextHash;
    } else {
      emitRouteChange("goto:same");
    }

    return nextHash;
  }

  function goBack(fallbackPath = PATHS.ROOT) {
    if (global.history && global.history.length > 1) {
      global.history.back();
      return;
    }
    replaceHash(fallbackPath);
  }

  const routeObservers = new Set();
  let routeObserverBound = false;

  function buildRouteSnapshot(source = "manual") {
    const hash = getCurrentHash();
    const parsed = parseHash(hash);
    return {
      source,
      hash,
      path: parsed.path,
      params: new URLSearchParams(parsed.params.toString()),
    };
  }

  function emitRouteChange(source = "manual") {
    const snapshot = buildRouteSnapshot(source);
    routeObservers.forEach((callback) => {
      try {
        callback(snapshot);
      } catch (error) {
        console.error("[RouteHelper] observer error", error);
      }
    });
    return snapshot;
  }

  function ensureRouteObserverBinding() {
    if (routeObserverBound || typeof global.addEventListener !== "function") {
      return;
    }

    routeObserverBound = true;
    global.addEventListener("hashchange", () => emitRouteChange("hashchange"));
    global.addEventListener("popstate", () => emitRouteChange("popstate"));
  }

  function observeRoute(callback, options = {}) {
    if (typeof callback !== "function") return () => {};

    ensureRouteObserverBinding();
    routeObservers.add(callback);

    if (options.immediate !== false) {
      callback(buildRouteSnapshot("observe:init"));
    }

    return () => routeObservers.delete(callback);
  }

  ensureRouteObserverBinding();

  const api = {
    PATHS,
    LEGACY_PATHS,
    SEGMENTS,
    REGEX,
    safeDecode,
    normalizePath,
    parseHash,
    buildHash,
    getCurrentHash,
    getCurrentPath,
    isHomePath,
    isHomeHash,
    isPathPrefix,
    isProfilePath,
    isValidProfileTarget,
    hashPathStartsWith,
    buildProfilePath,
    buildProfileHash,
    normalizeProfileTabName,
    extractProfileTabFromPath,
    isProfileTabPath,
    buildProfileTabPath,
    buildProfileTabHash,
    normalizeProfileFollowListType,
    extractProfileFollowListType,
    isProfileFollowListPath,
    buildProfileFollowListPath,
    buildProfileFollowListHash,
    extractProfileHighlightContext,
    isProfileHighlightPath,
    buildProfileHighlightPath,
    buildProfileHighlightHash,
    buildAccountSettingsPath,
    buildAccountSettingsHash,
    buildAccountSettingsSubPath,
    buildAccountSettingsSubHash,
    isAccountSettingsPath,
    extractAccountSettingsUsername,
    extractAccountSettingsSubpage,
    extractProfileTargetFromHash,
    extractConversationIdFromHash,
    isPostDetailPath,
    extractPostCodeFromPath,
    buildPostDetailPath,
    isChatPath,
    isChatConversationPath,
    isReservedProfileRootSegment,
    resolveCurrentProfileTarget,
    getPathSegments,
    setHash,
    replaceHash,
    goTo,
    goBack,
    observeRoute,
    emitRouteChange,
  };

  global.RouteHelper = api;
  global.buildRouteHash = buildHash;
  global.setRouteHash = setHash;
  global.goToRoute = goTo;
  global.navigateToRoute = goTo;
})(window);
