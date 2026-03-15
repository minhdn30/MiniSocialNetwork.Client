(function (global) {
  const currentHost = (global.location?.hostname || "").toLowerCase();
  const isLoopbackHost =
    currentHost === "127.0.0.1" || currentHost === "localhost";
  const isHttpsPage = global.location?.protocol === "https:";
  const resolvedHost = currentHost || "localhost";

  const preferredLoopbackHost =
    currentHost === "127.0.0.1" ? "127.0.0.1" : "localhost";
  const fallbackLoopbackHost =
    preferredLoopbackHost === "localhost" ? "127.0.0.1" : "localhost";
  const loopbackHosts = isLoopbackHost
    ? [preferredLoopbackHost, fallbackLoopbackHost]
    : [];

  const buildApiCandidatesForHost = (host) => {
    if (isHttpsPage) {
      return [
        `https://${host}:5000/api`,
        `https://${host}:5270/api`,
        `http://${host}:5000/api`,
        `http://${host}:5270/api`,
      ];
    }
    return [
      `http://${host}:5000/api`,
      `http://${host}:5270/api`,
      `https://${host}:5000/api`,
      `https://${host}:5270/api`,
    ];
  };

  const buildHubCandidatesForHost = (host) => {
    if (isHttpsPage) {
      return [
        `https://${host}:5000`,
        `https://${host}:5270`,
        `http://${host}:5000`,
        `http://${host}:5270`,
      ];
    }
    return [
      `http://${host}:5000`,
      `http://${host}:5270`,
      `https://${host}:5000`,
      `https://${host}:5270`,
    ];
  };

  const localApiBaseCandidates = [
    ...new Set(loopbackHosts.flatMap(buildApiCandidatesForHost)),
  ];
  const localHubBaseCandidates = [
    ...new Set(loopbackHosts.flatMap(buildHubCandidatesForHost)),
  ];

  const apiProtocol = isHttpsPage ? "https" : "http";
  const remoteApiBase = `${apiProtocol}://${resolvedHost}:5000/api`;
  const remoteHubBase = `${apiProtocol}://${resolvedHost}:5000`;

  const apiBaseCandidates = isLoopbackHost
    ? localApiBaseCandidates
    : [remoteApiBase];
  const hubBaseCandidates = isLoopbackHost
    ? localHubBaseCandidates
    : [remoteHubBase];
  const apiBase = apiBaseCandidates[0];
  const hubBase = hubBaseCandidates[0];
  const pagePaths = Object.freeze({
    HOME: "/",
    HOME_FILE: "/index.html",
    AUTH: "/auth",
    AUTH_FILE: "/auth.html",
    AUTH_INDEX_FILE: "/auth/index.html",
  });

  function normalizePathname(pathname) {
    let value = (pathname || "").toString().trim();
    if (!value) return pagePaths.HOME;

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1 && value.endsWith("/")) {
      value = value.slice(0, -1);
    }

    return value || pagePaths.HOME;
  }

  function getCanonicalPathname(pathname) {
    const normalizedPath = normalizePathname(pathname);
    if (normalizedPath === pagePaths.HOME_FILE) {
      return pagePaths.HOME;
    }
    if (
      normalizedPath === pagePaths.AUTH_FILE ||
      normalizedPath === pagePaths.AUTH_INDEX_FILE
    ) {
      return pagePaths.AUTH;
    }
    return normalizedPath;
  }

  function isAuthPage(pathname = global.location?.pathname || pagePaths.HOME) {
    return getCanonicalPathname(pathname) === pagePaths.AUTH;
  }

  function isHomePage(pathname = global.location?.pathname || pagePaths.HOME) {
    return getCanonicalPathname(pathname) === pagePaths.HOME;
  }

  function toSearchParams(query) {
    if (query instanceof URLSearchParams) {
      return new URLSearchParams(query.toString());
    }

    if (typeof query === "string") {
      return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    }

    const params = new URLSearchParams();
    if (!query || typeof query !== "object") {
      return params;
    }

    Object.entries(query).forEach(([key, value]) => {
      if (!key || value === undefined || value === null) return;
      params.set(key, String(value));
    });

    return params;
  }

  function buildPageUrl(pathname, query) {
    const normalizedPath = normalizePathname(pathname);
    const params = toSearchParams(query);
    const queryString = params.toString();
    return queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
  }

  function normalizeHash(hash) {
    const value = (hash || "").toString().trim();
    if (!value) return "";
    return value.startsWith("#") ? value : `#${value}`;
  }

  function getPreferredHomePath() {
    return pagePaths.HOME;
  }

  function getPreferredAuthPath() {
    return pagePaths.AUTH;
  }

  function getHomeUrl(query, hash) {
    return `${buildPageUrl(getPreferredHomePath(), query)}${normalizeHash(hash)}`;
  }

  function getAuthUrl(query, hash) {
    return `${buildPageUrl(getPreferredAuthPath(), query)}${normalizeHash(hash)}`;
  }

  function canonicalizeEntryPath() {
    if (!global.history?.replaceState) {
      return;
    }

    const rawPath = (global.location?.pathname || pagePaths.HOME).toString().trim();
    const currentPath = rawPath
      ? rawPath.startsWith("/")
        ? rawPath.replace(/\/{2,}/g, "/")
        : `/${rawPath}`.replace(/\/{2,}/g, "/")
      : pagePaths.HOME;
    const canonicalPath = getCanonicalPathname(currentPath);
    if (currentPath === canonicalPath) {
      return;
    }

    const nextUrl = `${canonicalPath}${global.location?.search || ""}${global.location?.hash || ""}`;
    global.history.replaceState(global.history.state, "", nextUrl);
  }

  global.PageRoutes = {
    PATHS: pagePaths,
    normalizePathname,
    getCanonicalPathname,
    isAuthPage,
    isHomePage,
    getHomeUrl,
    getAuthUrl,
  };

  canonicalizeEntryPath();
  const fallbackChatThemeOptions = [
    {
      key: "default",
      label: "Default",
      preview: "linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)",
      dark: {
        accent: "#ff416c",
        accentHover: "#e43c60",
        accentActive: "#d7335a",
        surface: "#0a1317",
        surfaceAlt: "#121d24",
        border: "#25323a",
        ownBubbleBg: "#ff416c",
        ownBubbleText: "#ffffff",
        otherBubbleBg: "#1a252d",
        otherBubbleText: "#f3f6f9",
        systemText: "#9ca7b0",
        actionColor: "#b7c2cb",
        actionHover: "#ffffff",
        actionHoverBg: "rgba(255,255,255,0.08)",
        scrollbarThumb: "rgba(255,255,255,0.24)",
        scrollbarHover: "#ff416c",
        inputWrapperBg: "rgba(255,255,255,0.08)",
        inputBorder: "rgba(255,255,255,0.14)",
      },
      light: {
        accent: "#f72567",
        accentHover: "#de1e5b",
        accentActive: "#c7184f",
        surface:
          "linear-gradient(160deg, #ffe3ec 0%, #ffd0df 52%, #ffd7c9 100%)",
        surfaceAlt: "#ffc6da",
        border: "#f58eb0",
        ownBubbleBg: "#f72567",
        ownBubbleText: "#ffffff",
        otherBubbleBg: "#ffb9d2",
        otherBubbleText: "#3d1123",
        systemText: "#7d2848",
        actionColor: "#6f1e3f",
        actionHover: "#3f1024",
        actionHoverBg: "rgba(0,0,0,0.06)",
        scrollbarThumb: "rgba(116,26,60,0.42)",
        scrollbarHover: "#f72567",
        inputWrapperBg: "#ffc6da",
        inputBorder: "#f58eb0",
      },
    },
  ];
  const chatThemeOptions =
    Array.isArray(global.CHAT_THEME_OPTIONS) && global.CHAT_THEME_OPTIONS.length
      ? global.CHAT_THEME_OPTIONS
      : fallbackChatThemeOptions;

  global.APP_CONFIG = {
    API_BASE: apiBase, // API
    API_BASE_CANDIDATES: apiBaseCandidates, // API fallback candidates (local dev)
    HUB_BASE: hubBase, // SignalR
    HUB_BASE_CANDIDATES: hubBaseCandidates, // SignalR fallback candidates (local dev)
    PAGE_PATHS: pagePaths,
    DEFAULT_AVATAR: "assets/images/default-avatar.jpg", // Default avatar image
    NEWSFEED_LIMIT: 5, // Max newsfeed limit/1 rq
    CAPTION_TRUNCATE_LENGTH: 150, // Chiều dài nội dung post tối đa trước khi bị cắt và hiện nút "more"
    MAX_UPLOAD_FILES: 7, // Số lượng file tối đa khi upload post mới
    MAX_UPLOAD_SIZE_MB: 5, // Dung lượng file tối đa (MB) cho mỗi ảnh/video
    MAX_POST_CONTENT_LENGTH: 3000, // Số ký tự tối đa cho caption của post
    MAX_POST_TAGS: 20, // Max tagged people per post
    POST_TAG_SEARCH_LIMIT: 5, // Max accounts returned per post-tag search request
    POST_TAG_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for post-tag search input
    POST_OWNER_NAME_MAX_LENGTH_WHEN_TAGGED: 16, // Owner name max length in header when post has tagged people
    POST_TAG_NAME_MAX_LENGTH_SINGLE: 14, // Max length of tag name when post has exactly 1 tagged account
    POST_TAG_NAME_MAX_LENGTH_PAIR: 10, // Max length of each tag name when post has exactly 2 tagged accounts
    POST_TAG_NAME_MAX_LENGTH_MULTI: 12, // Max length of first tag name when post has 3+ tagged accounts
    POST_TAG_NAME_MAX_LENGTH: 18, // Max display length for a tagged account name in post header summary
    POST_TAG_SUMMARY_MAX_LENGTH: 48, // Max display length for the whole "with ..." summary text in post header
    POST_TAG_PREVIEW_LIMIT: 2, // Max tagged accounts previewed in post header
    POST_TAG_ERROR_TOAST_MAX_LENGTH: 220, // Max length for post-tag related error messages displayed in toast
    POST_TAG_CACHE_TTL_MS: 10 * 60 * 1000, // TTL for in-memory tagged-accounts cache
    POST_TAG_CACHE_MAX_ENTRIES: 200, // Max tagged-accounts cache entries
    MAX_STORY_TEXT_LENGTH: 500, // Số ký tự tối đa cho text story
    MAX_NAME_DISPLAY_LENGTH: 25, // Độ dài tối đa của tên user khi hiển thị (được cắt thông minh theo từ)
    COMMENTS_PAGE_SIZE: 5, // Số lượng comment load mỗi lần
    REPLIES_PAGE_SIZE: 5, // Số lượng reply load mỗi lần
    COMMENT_CONTENT_TRUNCATE_LENGTH: 100, // Chiều dài nội dung comment tối đa trước khi bị cắt (tương tự post caption)
    MAX_COMMENT_INPUT_LENGTH: 500, // Số ký tự tối đa khi nhập comment/reply
    MENTION_SEARCH_LIMIT: 5, // Max accounts returned per mention search request in comment/reply
    MENTION_SEARCH_DEBOUNCE_MS: 250, // Debounce delay for mention search popup in comment/reply
    CHAT_GROUP_ALL_MENTION_KEYWORD: "all", // Keyword for group-wide mention in chat (without @)
    INTERACTIONS_PAGE_SIZE: 10, // Số lượng người react load mỗi lần
    PROFILE_POSTS_PAGE_SIZE: 12, // Số lượng post load mỗi lần ở trang cá nhân (nên là bội số của 3)
    PROFILE_TAGGED_POSTS_PAGE_SIZE: 12, // Số lượng tagged posts load mỗi lần ở tab Tagged
    PROFILE_SAVED_POSTS_PAGE_SIZE: 12, // Số lượng saved posts load mỗi lần ở tab Saved
    PROFILE_ARCHIVED_STORIES_PAGE_SIZE: 12, // Số lượng archived stories load mỗi lần ở trang profile
    PREVIEW_BIO_TRUNCATE_LENGTH: 80, // Chiều dài tối đa của bio trong thẻ preview trước khi bị cắt
    REGISTER_USERNAME_MIN_LENGTH: 6, // Số ký tự tối thiểu cho username khi đăng ký
    REGISTER_USERNAME_MAX_LENGTH: 30, // Số ký tự tối đa cho username khi đăng ký
    REGISTER_FULLNAME_MIN_LENGTH: 2, // Số ký tự tối thiểu cho full name khi đăng ký
    MAX_PROFILE_FULLNAME_LENGTH: 25, // Số ký tự tối đa cho Full Name
    GOOGLE_CLIENT_ID:
      "317334006143-4mtqfhphf2160g6egrvph749v8513m52.apps.googleusercontent.com", // Google OAuth client id for Google Identity Services (optional in local dev)
    MAX_PROFILE_BIO_LENGTH: 200, // Số ký tự tối đa cho Bio
    MAX_PROFILE_PHONE_LENGTH: 15, // Số ký tự tối đa cho Phone
    MAX_PROFILE_ADDRESS_LENGTH: 100, // Số ký tự tối đa cho Address
    FOLLOW_LIST_PAGE_SIZE: 15, // Số lượng người trong danh sách followers/following load mỗi lần
    FOLLOW_SUGGESTIONS_HOME_PAGE_SIZE: 8, // Số lượng gợi ý follow hiển thị trên home
    FOLLOW_SUGGESTIONS_PAGE_SIZE: 18, // Số lượng gợi ý follow tải mỗi lần ở trang suggestions
    FOLLOW_SUGGESTIONS_MAX_PAGES: 3, // Giới hạn số lần tải thêm từ FE ở trang suggestions
    BLOCKED_USERS_PAGE_SIZE: 20, // Số lượng tài khoản bị chặn load mỗi lần
    CONVERSATIONS_PAGE_SIZE: 20, // Số lượng cuộc trò chuyện load mỗi lần
    CHATPAGE_MESSAGES_PAGE_SIZE: 15, // Số lượng tin nhắn load mỗi lần tại trang Chat Page
    CHATWINDOW_MESSAGES_PAGE_SIZE: 10, // Số lượng tin nhắn load mỗi lần tại cửa sổ Chat nhỏ (Floating)
    NOTIFICATIONS_PAGE_SIZE: 20, // Number of notifications loaded per request
    NOTIFICATIONS_BADGE_CAP: 99, // Max unread number shown on sidebar badge (99+ when exceeded)
    NOTIFICATION_PANEL_WIDTH: 380, // Notifications panel width in px (slightly wider than chat sidebar)
    NOTIFICATION_RT_DEDUPE_TTL_MS: 6000, // Dedupe TTL for realtime notification update events
    NOTIFICATION_RT_DEDUPE_MAX_ENTRIES: 1000, // Max entries in realtime dedupe map
    NOTIFICATION_READ_STATE_FLUSH_DEBOUNCE_MS: 3000, // Debounce delay before flushing notification seen state
    NOTIFICATION_READ_STATE_DRAFT_TTL_MS: 72 * 60 * 60 * 1000, // TTL for pending notification seen-state draft in localStorage
    NOTIFICATION_RECENT_HIGHLIGHT_DURATION_MS: 4000, // Duration for temporary highlight of newly seen notification items
    DEFAULT_TOAST_DURATION_MS: 4000, // Default auto-close duration for non-persistent toasts
    CHAT_NOTIFICATION_DEDUPE_WINDOW_MS: 10000, // Dedupe window for incoming chat notification events per tab
    CHAT_NOTIFICATION_DEDUPE_MAX_ENTRIES: 500, // Hard cap for per-tab incoming chat notification dedupe keys
    NOTIFICATION_TOAST_DEDUPE_WINDOW_MS: 10000, // Dedupe window for realtime notification toasts per tab
    NOTIFICATION_TOAST_DEDUPE_MAX_ENTRIES: 500, // Hard cap for per-tab realtime notification toast dedupe keys
    NOTIFICATION_TOAST_RATE_LIMIT_WINDOW_MS: 5000, // Rate-limit window for stale notification toasts
    NOTIFICATION_TOAST_RATE_LIMIT_MAX: 2, // Max stale notification toasts shown per window
    SOUND_ENABLED_DEFAULT: true, // Default sound effects preference before server settings sync
    SOUND_VOLUME: 0.4, // Shared sound effects volume (0.0 - 1.0)
    SOUND_COOLDOWN_MS: 900, // Minimum gap between two sound plays on the leader tab
    SOUND_EVENT_DECISION_WINDOW_MS: 150, // Small decision window to collect suppress signals from other tabs
    SOUND_EVENT_DEDUPE_WINDOW_MS: 10000, // Dedupe window for cross-tab sound events
    SOUND_EVENT_DEDUPE_MAX_ENTRIES: 200, // Max finalized sound event keys kept in memory
    SOUND_LEADER_LEASE_TTL_MS: 6000, // Cross-tab leader lease TTL for sound playback ownership
    SOUND_LEADER_RENEW_INTERVAL_MS: 2500, // Only the leader tab renews the lease on this interval
    SOUND_FILES: {
      message: "assets/sounds/sound-basic.mp3",
      mention: "assets/sounds/sound-basic.mp3",
      notification: "assets/sounds/sound-basic.mp3",
    }, // Centralized sound assets so later replacements stay config-only
    SEARCH_PANEL_WIDTH: 400, // Search panel width in px
    SEARCH_PANEL_SEARCH_LIMIT: 10, // Max accounts returned per search panel request
    SEARCH_PANEL_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for search panel input
    SEARCH_PANEL_HISTORY_LIMIT: 10, // Max recent search accounts shown in search panel
    ACCOUNT_RELATIONSHIP_RECENT_MESSAGE_DAYS: 30, // Days to consider a direct conversation as recent for relationship labels
    MAX_CHAT_MESSAGE_LENGTH: 1000, // Số ký tự tối đa cho mỗi tin nhắn chat
    MAX_CHAT_NICKNAME_LENGTH: 50, // Số ký tự tối đa cho nickname trong chat
    MAX_CHAT_ATTACHMENT_SIZE_MB: 10, // Max size per chat attachment (image/video/file) in MB
    MAX_CHAT_ATTACHMENTS_PER_MESSAGE: 5, // Max number of attachments (image/video/file) per chat message
    MAX_CHAT_FILE_SIZE_MB: 10, // Legacy key (fallback)
    MAX_CHAT_MEDIA_FILES: 5, // Legacy key (fallback)
    CHAT_RECALLED_MESSAGE_TEXT: "Message was recalled", // Text shown when a message is recalled
    CHAT_TIME_SEPARATOR_GAP: 15 * 60 * 1000, // Gap (ms) to show time separator (15 mins)
    CHAT_GROUPING_GAP: 2 * 60 * 1000, // Gap (ms) to break message grouping (2 mins)
    PRESENCE_HEARTBEAT_INTERVAL_MS: 30 * 1000, // Interval gửi presence heartbeat (30 giây)
    CHAT_THEME_OPTIONS: chatThemeOptions, // Theme options per conversation (full palette per dark/light mode)
    MAX_OPEN_CHAT_WINDOWS: 3, // Số lượng cửa sổ chat được mở tối đa cùng lúc
    MAX_TOTAL_CHAT_WINDOWS: 8, // Tổng số lượng chat (cả cửa sổ và bong bóng) tối đa được phép duy trì
    CHAT_SEARCH_PAGE_SIZE: 20, // Số lượng kết quả tìm kiếm tin nhắn load mỗi lần
    CHAT_MEDIA_PAGE_SIZE: 20, // Number of media items loaded per request in chat media panel
    CHAT_FILES_PAGE_SIZE: 20, // Number of file/document items loaded per request in chat file panel
    CHAT_PINNED_MESSAGES_PAGE_SIZE: 20, // Number of pinned messages loaded per request in pinned popup
    GROUP_CHAT_MEMBER_LIMIT: 50, // Maximum total members in a group chat (including current user)
    GROUP_CHAT_MIN_SELECTED_MEMBERS: 2, // Minimum additional members to create a group (you + 2 others)
    GROUP_CHAT_MEMBERS_PAGE_SIZE: 20, // Number of members loaded per request in group members panel
    GROUP_CHAT_INVITE_SEARCH_LIMIT: 10, // Max accounts returned per invite search request
    GROUP_CHAT_INVITE_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for invite member search input
    GROUP_CHAT_ADD_MEMBER_SEARCH_LIMIT: 10, // Max accounts returned per add-member search request
    GROUP_CHAT_ADD_MEMBER_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for add-member search input
    POST_SHARE_CHAT_SEARCH_LIMIT: 20, // Max recipients returned per post-share search request
    GROUP_NAME_MIN_LENGTH: 3, // Minimum characters for group name
    GROUP_NAME_MAX_LENGTH: 50, // Maximum characters for group name
    GROUP_CHAT_AVATAR_MAX_SIZE_MB: 5, // Max allowed group avatar upload size (MB)
    STORY_VIDEO_MAX_DURATION_SEC: 20, // Thời lượng tối đa của story video (giây)
    STORY_VIDEO_MAX_SIZE_MB: 10, // Dung lượng tối đa của story video (MB)
    STORY_DEFAULT_DURATION_MS: 5000, // Thời gian mặc định hiển thị 1 story ảnh/text (ms)
    STORY_FEED_INITIAL_LOAD_COUNT: 8, // Tổng số ô story hiển thị tại 1 thời điểm ở home (đã gồm "Your Story" nếu có)
    STORY_FEED_LOAD_MORE_PAGE_SIZE: 3, // Bước dịch chuyển UI mỗi lần bấm next/prev ở story-section
    STORY_FEED_API_PAGE_SIZE: 15, // Kích thước page thực tế khi gọi API lấy author story
    STORY_FEED_MIN_SKELETON_MS: 300, // Thời gian tối thiểu giữ shimmer của story feed để tránh chớp quá nhanh
    STORY_FEED_NAV_SCROLL_STEP_PX: 0, // Bước cuộn khi bấm prev/next ở story-section (0 = tự tính theo chiều rộng container)
    STORY_HIGHLIGHT_GROUP_NAME_MAX_LENGTH: 50, // Max ký tự tên nhóm highlight
    STORY_HIGHLIGHT_MAX_GROUPS: 20, // Số lượng nhóm highlight tối đa mỗi user
    STORY_HIGHLIGHT_MAX_STORIES_PER_GROUP: 50, // Số lượng story tối đa trong 1 nhóm highlight
    STORY_HIGHLIGHT_ARCHIVE_PAGE_SIZE: 18, // Page size cho modal chọn story archive của highlight
  };
})(window);
