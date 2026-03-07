/* =========================
   GLOBAL
   ========================= */
const app = document.getElementById("app");
const AppRouteHelper = window.RouteHelper;
const APP_ROUTE_PATHS = AppRouteHelper?.PATHS || {
  ROOT: "/",
  HOME: "/",
  ERROR_404: "/404",
  SEARCH: "/search",
  EXPLORE: "/explore",
  REELS: "/reels",
  CHAT: "/chat",
  POSTS: "/posts",
  STORIES: "/stories",
  STORY: "/story",
  MESSAGES: "/messages",
  NOTIFICATIONS: "/notifications",
  PROFILE: "/profile",
  PROFILE_ME: "/me",
  PROFILE_USER_PREFIX: "/u",
  ACCOUNT_SETTINGS: "/account-settings",
  SETTINGS_SEGMENT: "settings",
};

function appBuildHash(path, query) {
  if (AppRouteHelper?.buildHash) {
    return AppRouteHelper.buildHash(path, query);
  }
  const normalizedPath = (path || APP_ROUTE_PATHS.ROOT).toString().trim();
  const safePath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `#${safePath}`;
}

function appParseHash(rawHash) {
  if (AppRouteHelper?.parseHash) {
    return AppRouteHelper.parseHash(rawHash);
  }
  const normalizedHash = (rawHash || "").toString().trim();
  const hashBody = normalizedHash.startsWith("#")
    ? normalizedHash.slice(1)
    : normalizedHash;
  const queryIndex = hashBody.indexOf("?");
  const path = queryIndex >= 0 ? hashBody.slice(0, queryIndex) : hashBody;
  const query = queryIndex >= 0 ? hashBody.slice(queryIndex + 1) : "";
  return {
    path: path.startsWith("/") ? path : `/${path}`,
    params: new URLSearchParams(query),
  };
}

function appIsProfilePath(path) {
  if (AppRouteHelper?.isProfilePath) {
    return AppRouteHelper.isProfilePath(path);
  }
  return (path || "").toString().startsWith(APP_ROUTE_PATHS.PROFILE);
}

function appExtractProfileTarget(hash) {
  if (AppRouteHelper?.extractProfileTargetFromHash) {
    return AppRouteHelper.extractProfileTargetFromHash(hash);
  }
  return "";
}

function appBuildCanonicalProfileHash(target) {
  const normalizedTarget = (target || "").toString().trim();
  if (AppRouteHelper?.buildProfileHash) {
    return AppRouteHelper.buildProfileHash(normalizedTarget);
  }
  if (!normalizedTarget) return appBuildHash(APP_ROUTE_PATHS.PROFILE);
  return appBuildHash(`/${encodeURIComponent(normalizedTarget)}`);
}

function appResolveSelfSettingsPath() {
  if (AppRouteHelper?.buildAccountSettingsPath) {
    return AppRouteHelper.buildAccountSettingsPath("");
  }
  const me = (localStorage.getItem("username") || "").toString().trim();
  if (!me) return APP_ROUTE_PATHS.ACCOUNT_SETTINGS;
  return `/${encodeURIComponent(me)}/${APP_ROUTE_PATHS.SETTINGS_SEGMENT || "settings"}`;
}

function appIsAccountSettingsPath(path) {
  if (AppRouteHelper?.isAccountSettingsPath) {
    return AppRouteHelper.isAccountSettingsPath(path);
  }
  return (path || "").toString().trim() === APP_ROUTE_PATHS.ACCOUNT_SETTINGS;
}

function appExtractAccountSettingsUsername(path) {
  if (AppRouteHelper?.extractAccountSettingsUsername) {
    return AppRouteHelper.extractAccountSettingsUsername(path);
  }
  return "";
}

function appGoToNotFound(options = {}) {
  const replace = options.replace !== false;
  if (AppRouteHelper?.goTo) {
    AppRouteHelper.goTo(APP_ROUTE_PATHS.ERROR_404, { replace });
  } else {
    if (replace && window.history?.replaceState) {
      const base = `${window.location.pathname || ""}${window.location.search || ""}`;
      window.history.replaceState(
        window.history.state,
        "",
        `${base}#${APP_ROUTE_PATHS.ERROR_404}`,
      );
    } else {
      window.location.hash = `#${APP_ROUTE_PATHS.ERROR_404}`;
    }
  }
}

function appBuildProfileCacheKey(hash) {
  if (!appIsProfilePath(appParseHash(hash || "").path)) return "";
  const target = (appExtractProfileTarget(hash) || "")
    .toString()
    .trim()
    .toLowerCase();
  if (!target) return "profile:me";
  return `profile:${target}`;
}

function appIsStoryViewerRoute(path) {
  const normalizedPath = (path || "").toString().trim();
  if (!normalizedPath) return false;

  if (
    normalizedPath === APP_ROUTE_PATHS.STORIES ||
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.STORIES}/`) ||
    normalizedPath === APP_ROUTE_PATHS.STORY ||
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.STORY}/`)
  ) {
    return true;
  }

  if (AppRouteHelper?.isProfileHighlightPath) {
    return AppRouteHelper.isProfileHighlightPath(normalizedPath);
  }

  return (
    normalizedPath.includes("/stories/highlight/") ||
    normalizedPath.startsWith("/story/highlight/")
  );
}

function appIsChatPath(path) {
  const normalizedPath = (path || "").toString().trim();
  if (!normalizedPath) return false;

  if (AppRouteHelper?.isChatPath) {
    return AppRouteHelper.isChatPath(normalizedPath);
  }

  return (
    normalizedPath === APP_ROUTE_PATHS.CHAT ||
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.CHAT}/`) ||
    normalizedPath === APP_ROUTE_PATHS.MESSAGES ||
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.MESSAGES}/`)
  );
}

function appIsChatConversationPath(path) {
  const normalizedPath = (path || "").toString().trim();
  if (!normalizedPath) return false;

  if (AppRouteHelper?.isChatConversationPath) {
    return AppRouteHelper.isChatConversationPath(normalizedPath);
  }

  return normalizedPath.startsWith(`${APP_ROUTE_PATHS.CHAT}/`);
}

function appExtractConversationIdFromHash(hash) {
  if (AppRouteHelper?.extractConversationIdFromHash) {
    return (
      AppRouteHelper.extractConversationIdFromHash(hash || "") || ""
    )
      .toString()
      .trim();
  }

  return "";
}

function appIsPostDetailPath(path) {
  const normalizedPath = (path || "").toString().trim();
  if (!normalizedPath) return false;

  if (AppRouteHelper?.isPostDetailPath) {
    return AppRouteHelper.isPostDetailPath(normalizedPath);
  }

  return (
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.POSTS || "/posts"}/`) ||
    normalizedPath.startsWith("/p/")
  );
}

function appExtractPostCodeFromPath(path) {
  const normalizedPath = (path || "").toString().trim();
  if (!normalizedPath) return "";

  if (AppRouteHelper?.extractPostCodeFromPath) {
    return (
      AppRouteHelper.extractPostCodeFromPath(normalizedPath) || ""
    )
      .toString()
      .trim();
  }

  const canonicalPrefix = `${APP_ROUTE_PATHS.POSTS || "/posts"}/`;
  if (normalizedPath.startsWith(canonicalPrefix)) {
    const rawValue = normalizedPath.slice(canonicalPrefix.length).split("/")[0];
    try {
      return decodeURIComponent(rawValue || "").trim();
    } catch (_) {
      return (rawValue || "").toString().trim();
    }
  }

  if (normalizedPath.startsWith("/p/")) {
    const rawValue = normalizedPath.slice(3).split("/")[0];
    try {
      return decodeURIComponent(rawValue || "").trim();
    } catch (_) {
      return (rawValue || "").toString().trim();
    }
  }

  return "";
}

function appBuildPostDetailPath(postCode) {
  const normalizedPostCode = (postCode || "").toString().trim();
  if (!normalizedPostCode) return APP_ROUTE_PATHS.POSTS || "/posts";

  if (AppRouteHelper?.buildPostDetailPath) {
    return AppRouteHelper.buildPostDetailPath(normalizedPostCode);
  }

  return `${APP_ROUTE_PATHS.POSTS || "/posts"}/${encodeURIComponent(normalizedPostCode)}`;
}

function appTryRedirectLegacyProfile(hash, path, params) {
  const normalizedPath = (path || "").toString().trim();
  const currentUsername = (localStorage.getItem("username") || "").toString().trim();

  if (normalizedPath === "/home") {
    const nextHash = appBuildHash(APP_ROUTE_PATHS.ROOT);
    if (nextHash !== hash) {
      window.location.hash = nextHash;
      return true;
    }
    return false;
  }

  if (normalizedPath === APP_ROUTE_PATHS.PROFILE_ME) {
    const nextHash = appBuildCanonicalProfileHash(currentUsername);
    if (nextHash && nextHash !== hash) {
      window.location.hash = nextHash;
      return true;
    }
    return false;
  }

  if (normalizedPath === APP_ROUTE_PATHS.ACCOUNT_SETTINGS) {
    const nextHash = appBuildHash(appResolveSelfSettingsPath());
    if (nextHash !== hash) {
      window.location.hash = nextHash;
      return true;
    }
    return false;
  }

  if (normalizedPath.startsWith(`${APP_ROUTE_PATHS.PROFILE_USER_PREFIX}/`)) {
    const segments = normalizedPath
      .slice(APP_ROUTE_PATHS.PROFILE_USER_PREFIX.length)
      .split("/")
      .filter(Boolean);
    const target = (segments[0] || "").toString().trim();
    if (!target) return false;
    const nextPath = `/${encodeURIComponent(target)}${
      segments.length > 1
        ? `/${segments
            .slice(1)
            .map((segment) => encodeURIComponent(segment))
            .join("/")}`
        : ""
    }`;
    const nextHash = appBuildHash(nextPath);
    if (nextHash !== hash) {
      window.location.hash = nextHash;
      return true;
    }
    return false;
  }

  if (
    normalizedPath === APP_ROUTE_PATHS.PROFILE ||
    normalizedPath.startsWith(`${APP_ROUTE_PATHS.PROFILE}/`)
  ) {
    const fromQuery =
      (params.get("u") || "").toString().trim() ||
      (params.get("id") || "").toString().trim();
    const segments = normalizedPath
      .slice(APP_ROUTE_PATHS.PROFILE.length)
      .split("/")
      .filter(Boolean);

    const firstSegment = (segments[0] || "").toString().trim();
    const hasLegacyTargetInPath =
      firstSegment &&
      ![
        "highlight",
        "highlights",
        "story",
        "stories",
        "follower",
        "followers",
        "following",
        "posts",
        "reels",
        "chat",
        "tagged",
        "saved",
        "archived-stories",
        "settings",
      ].includes(
        firstSegment.toLowerCase(),
      );
    const target = fromQuery || (hasLegacyTargetInPath ? firstSegment : "");

    if (target) {
      const tail = hasLegacyTargetInPath ? segments.slice(1) : segments;
      const nextPath = `/${encodeURIComponent(target)}${
        tail.length
          ? `/${tail.map((segment) => encodeURIComponent(segment)).join("/")}`
          : ""
      }`;
      const nextHash = appBuildHash(nextPath);
      if (nextHash !== hash) {
        window.location.hash = nextHash;
        return true;
      }
      return false;
    }

    if (currentUsername) {
      const nextHash = appBuildCanonicalProfileHash(currentUsername);
      if (nextHash && nextHash !== hash) {
        window.location.hash = nextHash;
        return true;
      }
    }
  }

  return false;
}

function appTryRedirectLegacyStory(hash, path, params) {
  const normalizedPath = (path || "").toString().trim();
  const legacyPrefix = `${APP_ROUTE_PATHS.STORY}/`;

  const isLegacyStoryDetail =
    normalizedPath.startsWith(legacyPrefix) &&
    !normalizedPath.startsWith(`${APP_ROUTE_PATHS.STORY}/highlight/`);

  if (!isLegacyStoryDetail) {
    return false;
  }

  const remainder = normalizedPath.slice(legacyPrefix.length);
  if (!remainder) {
    return false;
  }

  const nextPath = `${APP_ROUTE_PATHS.STORIES}/${remainder}`;
  const nextHash = appBuildHash(nextPath, params);
  if (nextHash !== hash) {
    window.location.hash = nextHash;
    return true;
  }

  return false;
}

function appTryRedirectLegacyChat(hash, path, params) {
  const normalizedPath = (path || "").toString().trim();
  const legacyMessagesRoot = APP_ROUTE_PATHS.MESSAGES || "/messages";
  if (
    normalizedPath !== legacyMessagesRoot &&
    !normalizedPath.startsWith(`${legacyMessagesRoot}/`)
  ) {
    return false;
  }

  let conversationId = (params.get("id") || "").toString().trim();
  if (!conversationId && normalizedPath.startsWith(`${legacyMessagesRoot}/`)) {
    const rawLegacyConversationId =
      normalizedPath.slice(legacyMessagesRoot.length + 1).split("/")[0] || "";
    try {
      conversationId = decodeURIComponent(rawLegacyConversationId);
    } catch (_) {
      conversationId = rawLegacyConversationId;
    }
  }

  const nextPath = conversationId
    ? `${APP_ROUTE_PATHS.CHAT}/${encodeURIComponent(conversationId)}`
    : APP_ROUTE_PATHS.CHAT;
  const nextHash = appBuildHash(nextPath);
  if (nextHash !== hash) {
    if (AppRouteHelper?.replaceHash) {
      AppRouteHelper.replaceHash(nextPath);
    } else {
      window.location.hash = nextHash;
    }
    return true;
  }

  return false;
}

function appTryRedirectLegacyPost(hash, path, params) {
  const normalizedPath = (path || "").toString().trim();
  const legacyPrefix = "/p/";
  if (!normalizedPath.startsWith(legacyPrefix)) {
    return false;
  }

  const postCode = appExtractPostCodeFromPath(normalizedPath);
  if (!postCode) {
    appGoToNotFound({ replace: true });
    return true;
  }

  const nextPath = appBuildPostDetailPath(postCode);
  const nextHash = appBuildHash(nextPath, params);
  if (nextHash !== hash) {
    if (AppRouteHelper?.replaceHash) {
      AppRouteHelper.replaceHash(nextPath, params);
    } else {
      window.location.hash = nextHash;
    }
    return true;
  }

  return false;
}

function appTryOpenNotificationsPanelRoute(hash, path) {
  const normalizedPath = (path || "").toString().trim();
  if (normalizedPath !== APP_ROUTE_PATHS.NOTIFICATIONS) {
    return false;
  }

  const candidateHashes = [
    window._lastAcceptedHashForRouter,
    window._lastSafeHash,
    appBuildHash(APP_ROUTE_PATHS.ROOT),
  ];

  let fallbackHash = appBuildHash(APP_ROUTE_PATHS.ROOT);
  for (let i = 0; i < candidateHashes.length; i += 1) {
    const candidate = (candidateHashes[i] || "").toString().trim();
    if (!candidate) continue;
    const parsedCandidate = appParseHash(candidate);
    if (parsedCandidate.path === APP_ROUTE_PATHS.NOTIFICATIONS) continue;
    fallbackHash = appBuildHash(parsedCandidate.path, parsedCandidate.params);
    break;
  }

  const openNotificationsPanel = () => {
    if (
      window.NotificationsPanel &&
      typeof window.NotificationsPanel.open === "function"
    ) {
      Promise.resolve(window.NotificationsPanel.open()).catch(() => {});
    }
  };

  if (AppRouteHelper?.replaceHash) {
    const parsedFallback = appParseHash(fallbackHash);
    AppRouteHelper.replaceHash(parsedFallback.path, parsedFallback.params);
  } else {
    const base = `${window.location.pathname || ""}${window.location.search || ""}`;
    window.history.replaceState(window.history.state, "", `${base}${fallbackHash}`);
  }

  setTimeout(openNotificationsPanel, 0);
  return true;
}

async function appReadApiMessage(res, fallbackMessage) {
  if (!res) return fallbackMessage;
  try {
    const json = await res.clone().json();
    const message = (json?.message || json?.Message || "").toString().trim();
    if (message) return message;
  } catch (_) {
    // Ignore JSON parse failure and fallback to text.
  }

  try {
    const text = (await res.clone().text()).toString().trim();
    if (text) return text;
  } catch (_) {
    // Ignore read failure.
  }

  return fallbackMessage;
}

function appRestoreAcceptedHashAfterChatDenied(currentHash) {
  const current = (currentHash || "").toString().trim();
  const accepted =
    (window._lastAcceptedHashForRouter || "").toString().trim() ||
    appBuildHash(APP_ROUTE_PATHS.ROOT);
  const fallbackHash =
    accepted && accepted !== current ? accepted : appBuildHash(APP_ROUTE_PATHS.ROOT);

  const parsed = appParseHash(fallbackHash);
  if (AppRouteHelper?.replaceHash) {
    AppRouteHelper.replaceHash(parsed.path, parsed.params);
  } else {
    const base = `${window.location.pathname || ""}${window.location.search || ""}`;
    window.history.replaceState(window.history.state, "", `${base}${fallbackHash}`);
    runRouter();
  }
}

function appResolvePostDetailReturnHash() {
  const fallbackHash = appBuildHash(APP_ROUTE_PATHS.ROOT);
  const candidates = [
    window._lastAcceptedHashForRouter,
    window._lastSafeHash,
    lastHash,
    window._returnToHash,
    fallbackHash,
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = (candidates[i] || "").toString().trim();
    if (!candidate) continue;
    const candidatePath = appParseHash(candidate).path;
    if (!appIsPostDetailPath(candidatePath)) {
      return candidate;
    }
  }

  return fallbackHash;
}

async function appGuardChatConversationRoute(hash, path) {
  if (!appIsChatConversationPath(path)) {
    return true;
  }

  const conversationId = appExtractConversationIdFromHash(hash);
  if (!conversationId) {
    appGoToNotFound({ replace: true });
    return false;
  }

  const currentConversationId = (window.ChatPage?.currentChatId || "").toString().trim().toLowerCase();
  if (currentConversationId && currentConversationId === conversationId.toLowerCase()) {
    return true;
  }

  if (!AppRouteHelper?.REGEX?.UUID?.test(conversationId)) {
    appGoToNotFound({ replace: true });
    return false;
  }

  if (!window.API?.Conversations?.getMessages) {
    return true;
  }

  let res = null;
  try {
    res = await window.API.Conversations.getMessages(conversationId, null, 1);
  } catch (_) {
    appRestoreAcceptedHashAfterChatDenied(hash);
    if (window.toastError) {
      window.toastError("failed to verify this conversation");
    }
    return false;
  }

  if (res?.ok) return true;

  const status = Number(res?.status);
  if (status === 404) {
    appGoToNotFound({ replace: true });
    return false;
  }

  if (status === 400 || status === 403) {
    const message = await appReadApiMessage(
      res,
      "you don't have permission to view this conversation",
    );
    appRestoreAcceptedHashAfterChatDenied(hash);
    if (window.toastInfo) window.toastInfo(message);
    else if (window.toastError) window.toastError(message);
    return false;
  }

  // Unknown server status: keep current page unchanged for safety.
  appRestoreAcceptedHashAfterChatDenied(hash);
  if (window.toastError) window.toastError("failed to open conversation");
  return false;
}

if (window.APP_CONFIG) {
  APP_CONFIG.CURRENT_USER_ID = localStorage.getItem("accountId");
}

/* =========================
   SCROLL HELPERS
   ========================= */
function lockScroll() {
  const mc = document.querySelector('.main-content');
  if (!mc) return;
  mc.style.overflowY = "hidden";
}
window.lockScroll = lockScroll;

function unlockScroll() {
  const mc = document.querySelector('.main-content');
  if (!mc) return;
  mc.style.overflowY = "auto";
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

function appEnsureChatSidebarOpen() {
  if (!window.ChatSidebar || typeof window.ChatSidebar.open !== "function") {
    return;
  }

  const ensureOpenAsync = async () => {
    let panel = document.getElementById("chat-panel");
    if (!panel && typeof window.ChatSidebar.init === "function") {
      await window.ChatSidebar.init();
      panel = document.getElementById("chat-panel");
    }

    if (!panel) return;

    if (window.ChatSidebar.isOpen && panel.classList.contains("show")) {
      return;
    }

    await window.ChatSidebar.open();
  };

  // Fire-and-forget: sidebar open is independent from route render completion.
  Promise.resolve(ensureOpenAsync()).catch(() => {});
}

function closeAllOverlayModals(options = {}) {
  const keepChatSidebar =
    options.keepChatSidebar === true || options.keepChatSurface === true;
  const keepNotificationsPanel =
    options.keepNotificationsPanel === true ||
    !!window.__keepNotificationsPanelOnNextRoute;
  const currentPath = appParseHash(window.location.hash || "").path;
  const shouldKeepStoryViewer = appIsStoryViewerRoute(currentPath);

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

  // Create Story
  const createStoryModal = document.getElementById("createStoryModal");
  if (createStoryModal && createStoryModal.classList.contains("show")) {
      if (window.closeCreateStoryModal) window.closeCreateStoryModal();
      else createStoryModal.classList.remove("show");
  }

  // Story Viewer
  const storyViewerModal = document.getElementById("storyViewerModal");
  if (
      !shouldKeepStoryViewer &&
      storyViewerModal &&
      !storyViewerModal.classList.contains("sn-story-viewer-hidden")
  ) {
      if (window.closeStoryViewer) window.closeStoryViewer();
      else storyViewerModal.classList.add("sn-story-viewer-hidden");
  }

  if (typeof window.closeProfileHighlightModal === "function") {
      window.closeProfileHighlightModal();
  }

  if (typeof window.closePostShareChatModal === "function") {
      window.closePostShareChatModal({ force: true });
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

  // Tagged Accounts List
  if (window.PostUtils && typeof window.PostUtils.closePostTaggedAccountsModal === "function") {
      const taggedAccountsModal = document.getElementById("postTaggedAccountsModal");
      if (taggedAccountsModal && taggedAccountsModal.classList.contains("show")) {
          window.PostUtils.closePostTaggedAccountsModal();
      }
  }

  const isMessagesRoute = appIsChatPath(currentPath);

  // Chat Sidebar
  if (window.closeChatSidebar && !keepChatSidebar && !isMessagesRoute) {
      window.closeChatSidebar();
  }

  if (!keepNotificationsPanel && window.closeNotificationsPanel) {
      window.closeNotificationsPanel();
  }

  // Chat Windows (Floating) logic is now handled in router() via CSS hiding
  // and ChatWindow.minimizeAll().

  // SignalR Cleanup (Leave groups when navigating away)
  if (!isMessagesRoute) {
      if (window.ChatPage && typeof window.ChatPage.leaveCurrentConversation === 'function') {
          window.ChatPage.leaveCurrentConversation();
      }
      // Clear chat theme from .main-content when leaving chat page
      var mcEl = document.querySelector('.main-content');
      if (mcEl && window.ChatCommon && typeof window.ChatCommon._clearConversationThemeVars === 'function') {
          window.ChatCommon._clearConversationThemeVars(mcEl);
      }
  }

  if (!appIsProfilePath(currentPath)) {
      if (typeof window.leaveCurrentProfileGroup === 'function') {
          window.leaveCurrentProfileGroup();
      }
  }
  
  unlockScroll();
}
window.closeAllOverlayModals = closeAllOverlayModals;

function restoreNotificationsPanelAfterRouteIfNeeded() {
  const preserveToken = window.__keepNotificationsPanelOnNextRoute;
  const shouldRestoreNotificationsPanel = !!preserveToken;
  if (
    !shouldRestoreNotificationsPanel ||
    !window.NotificationsPanel ||
    typeof window.NotificationsPanel.open !== "function"
  ) {
    return;
  }

  const attemptRestore = () => {
    if (!window.__keepNotificationsPanelOnNextRoute) return;
    if (window.NotificationsPanel?.isOpen) return;
    Promise.resolve(window.NotificationsPanel.open()).catch(() => {});
  };

  attemptRestore();
  setTimeout(attemptRestore, 120);
  setTimeout(attemptRestore, 320);
  setTimeout(attemptRestore, 700);
}

function getCacheKey(hash) {
    const parsed = appParseHash(hash || "");
    if (!hash || parsed.path === APP_ROUTE_PATHS.ROOT || parsed.path === "/home") return "home";
    if (appIsAccountSettingsPath(parsed.path)) return "#/account-settings";
    if (appIsProfilePath(parsed.path)) return appBuildProfileCacheKey(hash);
    if (appIsChatPath(parsed.path)) return "#/chat";
    return hash;
}

let lastHash = null;
let routerExecutionToken = 0;

async function router() {
  const executionToken = ++routerExecutionToken;
  const hash = window.location.hash || appBuildHash(APP_ROUTE_PATHS.ROOT);
  const parsed = appParseHash(hash);
  const path = parsed.path;
  const prevPath = appParseHash(lastHash || "").path;
  const hasActiveChatSurface =
    document.body.classList.contains("is-chat-page") &&
    !!document.getElementById("chat-view");
  const shouldPreserveChatSurfaceForStoryRoute =
    appIsStoryViewerRoute(path) &&
    (appIsChatPath(prevPath) || hasActiveChatSurface);
  const isProfileHighlightRoute = AppRouteHelper?.isProfileHighlightPath
    ? AppRouteHelper.isProfileHighlightPath(path)
    : path.toLowerCase().includes("/stories/highlight/");

  const followRouteType = AppRouteHelper?.extractProfileFollowListType
    ? AppRouteHelper.extractProfileFollowListType(path)
    : "";
  if (
    followRouteType === "followers" &&
    AppRouteHelper?.buildProfileFollowListPath &&
    AppRouteHelper?.extractProfileTargetFromHash
  ) {
    const canonicalTarget = AppRouteHelper.extractProfileTargetFromHash(hash);
    if (canonicalTarget) {
      const canonicalPath = AppRouteHelper.buildProfileFollowListPath(
        canonicalTarget,
        "followers",
      );
      if (canonicalPath !== path) {
        const canonicalHash = appBuildHash(canonicalPath);
        if (canonicalHash !== hash) {
          window.location.hash = canonicalHash;
          return;
        }
      }
    }
  }

  if (appTryRedirectLegacyProfile(hash, path, parsed.params)) {
    return;
  }

  if (appTryRedirectLegacyStory(hash, path, parsed.params)) {
    return;
  }

  if (appTryRedirectLegacyChat(hash, path, parsed.params)) {
    return;
  }

  if (appTryRedirectLegacyPost(hash, path, parsed.params)) {
    return;
  }

  if (appTryOpenNotificationsPanelRoute(hash, path)) {
    return;
  }

  const routeTabExplicit = AppRouteHelper?.extractProfileTabFromPath
    ? AppRouteHelper.extractProfileTabFromPath(path, { includeDefault: false })
    : "";
  if (routeTabExplicit === "posts") {
    const profileTarget = appExtractProfileTarget(hash);
    if (profileTarget) {
      const canonicalProfileHash = appBuildHash(
        `/${encodeURIComponent(profileTarget)}`,
      );
      if (canonicalProfileHash !== hash) {
        window.location.hash = canonicalProfileHash;
        return;
      }
    }
  }

  if (appIsAccountSettingsPath(path)) {
    const routeUsername = (appExtractAccountSettingsUsername(path) || "")
      .toString()
      .trim()
      .toLowerCase();
    const currentUsername = (localStorage.getItem("username") || "")
      .toString()
      .trim()
      .toLowerCase();

    if (routeUsername && currentUsername && routeUsername !== currentUsername) {
      if (window.toastError) {
        toastError("you can only access your own settings");
      }
      const selfSettingsPath = appResolveSelfSettingsPath();
      if (AppRouteHelper?.goTo) {
        AppRouteHelper.goTo(selfSettingsPath, { replace: true });
      } else {
        window.location.hash = appBuildHash(selfSettingsPath);
      }
      return;
    }
  }

  if (!(await appGuardChatConversationRoute(hash, path))) {
    return;
  }

  if (executionToken !== routerExecutionToken) {
    return;
  }

  // Story deep-link opened while user is already on chat-page should behave
  // like opening story from ring: keep chat surface mounted, only open overlay.
  if (shouldPreserveChatSurfaceForStoryRoute) {
    appEnsureChatSidebarOpen();
    document.body.classList.add("is-chat-page");
    setActiveSidebar(prevPath || APP_ROUTE_PATHS.CHAT);
    return;
  }

  const isPostDetailRoute = appIsPostDetailPath(path);
  if (!isPostDetailRoute) {
    window._lastAcceptedHashForRouter = hash;
  }

  if (
    !isPostDetailRoute &&
    !path.startsWith("/stories") &&
    !path.startsWith("/story") &&
    !isProfileHighlightRoute
  ) {
    window._lastSafeHash = hash;
  }

  if (isPostDetailRoute) {
    const postCode = appExtractPostCodeFromPath(path);
    if (!postCode) {
      appGoToNotFound({ replace: true });
      return;
    }

    if (!lastHash) {
      app.innerHTML = '<div class="page-loader-container"><div class="spinner spinner-large"></div></div>';
      await loadHome();
      if (executionToken !== routerExecutionToken) {
        return;
      }
    }

    if (typeof window.openPostDetailByCode === "function") {
      const returnHash = appResolvePostDetailReturnHash();
      await window.openPostDetailByCode(postCode, {
        fromRoute: true,
        returnHash,
      });

      if (executionToken !== routerExecutionToken) {
        return;
      }

      const basePath = appParseHash(returnHash).path || APP_ROUTE_PATHS.ROOT;
      setActiveSidebar(basePath);
      return;
    }

    appGoToNotFound({ replace: true });
    return;
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
  closeAllOverlayModals({
    keepChatSidebar: !!window.ChatSidebar?.isOpen,
    keepNotificationsPanel: !!window.NotificationsPanel?.isOpen,
  });

  // Keep profile surface stable when switching sub-routes in the same profile
  // (tabs/follow-lists/highlight, etc.) to avoid full page rerender flicker.
  if (
    lastHash &&
    appIsProfilePath(path) &&
    appIsProfilePath(prevPath) &&
    !appIsAccountSettingsPath(path) &&
    !appIsAccountSettingsPath(prevPath) &&
    prevKey === nextKey &&
    typeof window.syncProfileRouteState === "function"
  ) {
    window.syncProfileRouteState();
    setActiveSidebar(path);
    return;
  }

  if (appIsProfilePath(path)) {
      const myId = localStorage.getItem("accountId");
      const myUsername = localStorage.getItem("username");
      const targetId = appExtractProfileTarget(hash) || null;

      const isMe = !targetId || 
                   (myId && targetId.toLowerCase() === myId.toLowerCase()) || 
                   (myUsername && targetId.toLowerCase() === myUsername.toLowerCase());

      if (!isMe && prevKey !== nextKey) {
          PageCache.clear(nextKey);
      }
  }

  // Update body class for chat-page UI hiding roaming windows
  if (appIsChatPath(path)) {
      document.body.classList.add('is-chat-page');
      if (window.ChatWindow && typeof window.ChatWindow.minimizeAll === 'function') {
          window.ChatWindow.minimizeAll();
      }
  } else {
      document.body.classList.remove('is-chat-page');
  }

  // Hide horizontal page scrollbar only on profile surface
  const profileScrollContainer = document.querySelector('.main-content');
  if (appIsProfilePath(path)) {
      document.body.classList.add('is-profile-page');
      if (profileScrollContainer) {
          profileScrollContainer.style.overflowX = "hidden";
      }
  } else {
      document.body.classList.remove('is-profile-page');
      if (profileScrollContainer) {
          profileScrollContainer.style.overflowX = "";
      }
  }

  if (PageCache.has(nextKey)) {
      if (prevKey === nextKey) {
          if (appIsChatPath(path) && window.ChatPage && typeof window.ChatPage.handleUrlNavigation === 'function') {
              window.ChatPage.handleUrlNavigation();
              appEnsureChatSidebarOpen();
          }
          if (appIsProfilePath(path) && typeof window.syncProfileRouteState === "function") {
              window.syncProfileRouteState();
          }
          setActiveSidebar(path);
          return;
      }

      const cached = PageCache.get(nextKey);
      
      if (appIsProfilePath(path) && window.ProfileState && cached.data) {
          window.ProfileState.setPageData(cached.data);
      } 
      else if (window.setPageData && cached.data) {
          window.setPageData(cached.data);
      }
      
      PageCache.restore(nextKey, app);
      if (window.lucide && typeof lucide.createIcons === "function") {
          lucide.createIcons();
      }
      
      if (appIsChatPath(path) && window.ChatPage && typeof window.ChatPage.handleUrlNavigation === 'function') {
          window.ChatPage.handleUrlNavigation();
          appEnsureChatSidebarOpen();
      }

      if (appIsProfilePath(path) && window.triggerProfileSilentUpdate) {
          window.triggerProfileSilentUpdate();
      }
      if (appIsProfilePath(path) && typeof window.syncProfileRouteState === "function") {
          window.syncProfileRouteState();
      }

      setActiveSidebar(path);
      return;
  }

  app.innerHTML = '<div class="page-loader-container"><div class="spinner spinner-large"></div></div>';
  const mc = document.querySelector('.main-content');
  if (mc) mc.scrollTop = 0;

  if (appIsAccountSettingsPath(path)) {
      loadAccountSettings();
      setActiveSidebar(path);
      return;
  }
  
  if (appIsProfilePath(path)) {
      loadProfilePage();
      setActiveSidebar(path); 
      return; 
  }

  // Story deep-link route (e.g. #/stories/{storyId}) should render home surface,
  // then story viewer module will open from URL.
  if (
    path === APP_ROUTE_PATHS.STORIES ||
    path.startsWith(`${APP_ROUTE_PATHS.STORIES}/`) ||
    path === APP_ROUTE_PATHS.STORY ||
    path.startsWith(`${APP_ROUTE_PATHS.STORY}/`)
  ) {
      loadHome();
      setActiveSidebar(APP_ROUTE_PATHS.ROOT);
      return;
  }

  if (appIsChatPath(path)) {
      appEnsureChatSidebarOpen();
      loadChatPage();
      setActiveSidebar(path);
      return;
  }

  switch (path) {
    case APP_ROUTE_PATHS.ERROR_404:
      showErrorPage("404", "Sorry, the page you are looking for doesn't exist or has been removed.");
      break;

    case APP_ROUTE_PATHS.ROOT:
    case "/home":
      loadHome();
      break;

    case APP_ROUTE_PATHS.SEARCH:
      loadPlaceholder("Search", "search");
      break;

    case APP_ROUTE_PATHS.EXPLORE:
      loadPlaceholder("Explore", "compass");
      break;

    case APP_ROUTE_PATHS.REELS:
      loadPlaceholder("Reels", "clapperboard");
      break;

    case APP_ROUTE_PATHS.NOTIFICATIONS:
      loadPlaceholder("Notifications", "bell");
      break;

    default:
      appGoToNotFound({ replace: true });
      return;
  }
  
  setActiveSidebar(path);
}

async function showErrorPage(title, message) {
    app.innerHTML = ""; 
    await loadPage("core/error");
    
    const titleEl = document.getElementById("error-title");
    const msgEl = document.getElementById("error-message");
    
    if (titleEl) titleEl.innerText = title === "404" ? "Page not found" : title;
    if (msgEl) msgEl.innerText = message;
    
    if (window.lucide) lucide.createIcons();
}
window.showErrorPage = showErrorPage;

function loadPlaceholder(title, iconName) {
    const homeHash = appBuildHash(APP_ROUTE_PATHS.ROOT);
    app.innerHTML = `
        <div class="placeholder-container">
            <div class="placeholder-content">
                <div class="placeholder-icon">
                    <i data-lucide="${iconName}"></i>
                </div>
                <h1>${title} coming soon</h1>
                <p>We're working hard to bring this feature to you. Stay tuned!</p>
                <button class="placeholder-btn" onclick="window.location.hash='${homeHash}'">Go back Home</button>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

async function loadProfilePage() {
    await loadPage("profile/profile");
    if (window.initProfilePage) {
        window.initProfilePage();
    }
}

async function loadChatPage() {
    await loadPage("chat/chat-page");
    if (window.initChatPage) {
        window.initChatPage();
    }
}

async function loadAccountSettings() {
    PageCache.clear("#/account-settings");
    await loadPage("profile/account-settings");
    if (window.initAccountSettings) {
        window.initAccountSettings();
    }
}

async function reloadPage() {
    console.log("Forcing Page Reload...");
    const key = getCacheKey(window.location.hash);
    PageCache.clear(key);
    // Force router to bypass same-route short-circuit (especially profile surface preserve).
    lastHash = null;
    runRouter();
}
window.reloadPage = reloadPage;
window.reloadHome = reloadPage;

function runRouter() {
  return router()
    .catch((error) => {
      console.error("Router error:", error);
    })
    .finally(() => {
      restoreNotificationsPanelAfterRouteIfNeeded();
    });
}

if (AppRouteHelper?.observeRoute) {
  AppRouteHelper.observeRoute(
    () => {
      runRouter();
    },
    { immediate: false },
  );
} else {
  window.addEventListener("hashchange", runRouter);
}
window.addEventListener("DOMContentLoaded", runRouter);

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
  if (typeof window.clearClientSession === "function") {
    window.clearClientSession();
  } else {
    if (window.AuthStore?.clearAccessToken) {
      window.AuthStore.clearAccessToken("logout");
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("avatarUrl");
    localStorage.removeItem("fullname");
    localStorage.removeItem("username");
    localStorage.removeItem("accountId");
    localStorage.removeItem("defaultPostPrivacy");
    localStorage.removeItem("SOCIAL_NETWORK_OPEN_CHATS");
  }
  
  PageCache.clearAll();
  window.location.href = "auth.html";
}

let logoutInFlight = false;

window.logout = async function() {
  if (logoutInFlight) return;
  logoutInFlight = true;

  try {
    if (window.API?.Auth?.logout) {
      await window.API.Auth.logout();
    }
  } catch (err) {
    console.warn("Logout API failed. Clearing local session anyway.", err);
  } finally {
    clearSessionAndRedirect();
  }
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
