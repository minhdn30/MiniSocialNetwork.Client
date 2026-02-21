(function (global) {
  const currentHost = (global.location?.hostname || "").toLowerCase();
  const isLoopbackHost = currentHost === "127.0.0.1" || currentHost === "localhost";
  const isHttpsPage = global.location?.protocol === "https:";
  const resolvedHost = currentHost || "localhost";

  const preferredLoopbackHost = currentHost === "127.0.0.1" ? "127.0.0.1" : "localhost";
  const fallbackLoopbackHost = preferredLoopbackHost === "localhost" ? "127.0.0.1" : "localhost";
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

  const localApiBaseCandidates = [...new Set(loopbackHosts.flatMap(buildApiCandidatesForHost))];
  const localHubBaseCandidates = [...new Set(loopbackHosts.flatMap(buildHubCandidatesForHost))];

  const apiProtocol = isHttpsPage ? "https" : "http";
  const remoteApiBase = `${apiProtocol}://${resolvedHost}:5000/api`;
  const remoteHubBase = `${apiProtocol}://${resolvedHost}:5000`;

  const apiBaseCandidates = isLoopbackHost ? localApiBaseCandidates : [remoteApiBase];
  const hubBaseCandidates = isLoopbackHost ? localHubBaseCandidates : [remoteHubBase];
  const apiBase = apiBaseCandidates[0];
  const hubBase = hubBaseCandidates[0];
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
        inputBorder: "rgba(255,255,255,0.14)"
      },
      light: {
        accent: "#f72567",
        accentHover: "#de1e5b",
        accentActive: "#c7184f",
        surface: "linear-gradient(160deg, #ffe3ec 0%, #ffd0df 52%, #ffd7c9 100%)",
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
        inputBorder: "#f58eb0"
      }
    }
  ];
  const chatThemeOptions = (Array.isArray(global.CHAT_THEME_OPTIONS) && global.CHAT_THEME_OPTIONS.length)
    ? global.CHAT_THEME_OPTIONS
    : fallbackChatThemeOptions;

  global.APP_CONFIG = {
  API_BASE: apiBase, // API
  API_BASE_CANDIDATES: apiBaseCandidates, // API fallback candidates (local dev)
  HUB_BASE: hubBase, // SignalR
  HUB_BASE_CANDIDATES: hubBaseCandidates, // SignalR fallback candidates (local dev)
  DEFAULT_AVATAR: "assets/images/default-avatar.jpg", // Default avatar image
  NEWSFEED_LIMIT: 5, // Max newsfeed limit/1 rq
  CAPTION_TRUNCATE_LENGTH: 150, // Chiều dài nội dung post tối đa trước khi bị cắt và hiện nút "more"
  MAX_UPLOAD_FILES: 7, // Số lượng file tối đa khi upload post mới
  MAX_UPLOAD_SIZE_MB: 5, // Dung lượng file tối đa (MB) cho mỗi ảnh/video
  MAX_POST_CONTENT_LENGTH: 3000, // Số ký tự tối đa cho caption của post
  MAX_NAME_DISPLAY_LENGTH: 25, // Độ dài tối đa của tên user khi hiển thị (được cắt thông minh theo từ)
  COMMENTS_PAGE_SIZE: 3, // Số lượng comment load mỗi lần
  REPLIES_PAGE_SIZE: 3, // Số lượng reply load mỗi lần
  COMMENT_CONTENT_TRUNCATE_LENGTH: 100, // Chiều dài nội dung comment tối đa trước khi bị cắt (tương tự post caption)
  MAX_COMMENT_INPUT_LENGTH: 500, // Số ký tự tối đa khi nhập comment/reply
  INTERACTIONS_PAGE_SIZE: 10, // Số lượng người react load mỗi lần
  PROFILE_POSTS_PAGE_SIZE: 12, // Số lượng post load mỗi lần ở trang cá nhân (nên là bội số của 3)
  PREVIEW_BIO_TRUNCATE_LENGTH: 80, // Chiều dài tối đa của bio trong thẻ preview trước khi bị cắt
  REGISTER_USERNAME_MIN_LENGTH: 6, // Số ký tự tối thiểu cho username khi đăng ký
  REGISTER_USERNAME_MAX_LENGTH: 30, // Số ký tự tối đa cho username khi đăng ký
  REGISTER_FULLNAME_MIN_LENGTH: 2, // Số ký tự tối thiểu cho full name khi đăng ký
  MAX_PROFILE_FULLNAME_LENGTH: 25, // Số ký tự tối đa cho Full Name
  GOOGLE_CLIENT_ID: "317334006143-4mtqfhphf2160g6egrvph749v8513m52.apps.googleusercontent.com", // Google OAuth client id for Google Identity Services (optional in local dev)
  MAX_PROFILE_BIO_LENGTH: 200, // Số ký tự tối đa cho Bio
  MAX_PROFILE_PHONE_LENGTH: 15, // Số ký tự tối đa cho Phone
  MAX_PROFILE_ADDRESS_LENGTH: 100, // Số ký tự tối đa cho Address
  FOLLOW_LIST_PAGE_SIZE: 15, // Số lượng người trong danh sách followers/following load mỗi lần
  CONVERSATIONS_PAGE_SIZE: 20, // Số lượng cuộc trò chuyện load mỗi lần
  CHATPAGE_MESSAGES_PAGE_SIZE: 15, // Số lượng tin nhắn load mỗi lần tại trang Chat Page
  CHATWINDOW_MESSAGES_PAGE_SIZE: 10, // Số lượng tin nhắn load mỗi lần tại cửa sổ Chat nhỏ (Floating)
  MAX_CHAT_MESSAGE_LENGTH: 1000, // Số ký tự tối đa cho mỗi tin nhắn chat
  MAX_CHAT_NICKNAME_LENGTH: 50, // Số ký tự tối đa cho nickname trong chat
  MAX_CHAT_ATTACHMENT_SIZE_MB: 10, // Max size per chat attachment (image/video/file) in MB
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE: 5, // Max number of attachments (image/video/file) per chat message
  MAX_CHAT_FILE_SIZE_MB: 10, // Legacy key (fallback)
  MAX_CHAT_MEDIA_FILES: 5, // Legacy key (fallback)
  CHAT_RECALLED_MESSAGE_TEXT: "Message was recalled", // Text shown when a message is recalled
  CHAT_TIME_SEPARATOR_GAP: 15 * 60 * 1000, // Gap (ms) to show time separator (15 mins)
  CHAT_GROUPING_GAP: 2 * 60 * 1000, // Gap (ms) to break message grouping (2 mins)
  CHAT_THEME_OPTIONS: chatThemeOptions, // Theme options per conversation (full palette per dark/light mode)
  MAX_OPEN_CHAT_WINDOWS: 3, // Số lượng cửa sổ chat được mở tối đa cùng lúc
  MAX_TOTAL_CHAT_WINDOWS: 8, // Tổng số lượng chat (cả cửa sổ và bong bóng) tối đa được phép duy trì
  CHAT_SEARCH_PAGE_SIZE: 20, // Số lượng kết quả tìm kiếm tin nhắn load mỗi lần
  CHAT_MEDIA_PAGE_SIZE: 20, // Number of media items loaded per request in chat media panel
  CHAT_FILES_PAGE_SIZE: 20, // Number of file/document items loaded per request in chat file panel
  GROUP_CHAT_MEMBER_LIMIT: 50, // Maximum members selectable when creating a group chat
  GROUP_CHAT_MIN_SELECTED_MEMBERS: 2, // Minimum additional members to create a group (you + 2 others)
  GROUP_CHAT_MEMBERS_PAGE_SIZE: 20, // Number of members loaded per request in group members panel
  GROUP_CHAT_INVITE_SEARCH_LIMIT: 10, // Max accounts returned per invite search request
  GROUP_CHAT_INVITE_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for invite member search input
  GROUP_CHAT_ADD_MEMBER_SEARCH_LIMIT: 10, // Max accounts returned per add-member search request
  GROUP_CHAT_ADD_MEMBER_SEARCH_DEBOUNCE_MS: 300, // Debounce delay for add-member search input
  GROUP_NAME_MIN_LENGTH: 3, // Minimum characters for group name
  GROUP_NAME_MAX_LENGTH: 50, // Maximum characters for group name
  GROUP_CHAT_AVATAR_MAX_SIZE_MB: 5, // Max allowed group avatar upload size (MB)
  };
})(window);
