(function (global) {
  const currentHost = (global.location?.hostname || "").toLowerCase();
  const isLoopbackHost = currentHost === "127.0.0.1" || currentHost === "localhost";
  const isHttpsPage = global.location?.protocol === "https:";
  const resolvedHost = isLoopbackHost ? "localhost" : (currentHost || "localhost");

  const localApiBaseCandidates = [
    "https://localhost:5000/api",
    "http://localhost:5000/api",
    "https://localhost:5270/api",
    "http://localhost:5270/api",
  ];

  const localHubBaseCandidates = [
    "https://localhost:5000",
    "http://localhost:5000",
    "https://localhost:5270",
    "http://localhost:5270",
  ];

  const apiProtocol = isHttpsPage ? "https" : "http";
  const remoteApiBase = `${apiProtocol}://${resolvedHost}:5000/api`;
  const remoteHubBase = `${apiProtocol}://${resolvedHost}:5000`;

  const apiBaseCandidates = isLoopbackHost ? localApiBaseCandidates : [remoteApiBase];
  const hubBaseCandidates = isLoopbackHost ? localHubBaseCandidates : [remoteHubBase];
  const apiBase = apiBaseCandidates[0];
  const hubBase = hubBaseCandidates[0];

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
  MAX_PROFILE_FULLNAME_LENGTH: 25, // Số ký tự tối đa cho Full Name
  MAX_PROFILE_BIO_LENGTH: 200, // Số ký tự tối đa cho Bio
  MAX_PROFILE_PHONE_LENGTH: 15, // Số ký tự tối đa cho Phone
  MAX_PROFILE_ADDRESS_LENGTH: 100, // Số ký tự tối đa cho Address
  FOLLOW_LIST_PAGE_SIZE: 15, // Số lượng người trong danh sách followers/following load mỗi lần
  CONVERSATIONS_PAGE_SIZE: 20, // Số lượng cuộc trò chuyện load mỗi lần
  CHATPAGE_MESSAGES_PAGE_SIZE: 15, // Số lượng tin nhắn load mỗi lần tại trang Chat Page
  CHATWINDOW_MESSAGES_PAGE_SIZE: 10, // Số lượng tin nhắn load mỗi lần tại cửa sổ Chat nhỏ (Floating)
  MAX_CHAT_MESSAGE_LENGTH: 1000, // Số ký tự tối đa cho mỗi tin nhắn chat
  MAX_CHAT_FILE_SIZE_MB: 10, // Dung lượng tối đa mỗi file khi gửi chat (MB)
  MAX_CHAT_MEDIA_FILES: 5, // Số lượng ảnh/video tối đa có thể gửi trong 1 tin nhắn chat
  CHAT_TIME_SEPARATOR_GAP: 15 * 60 * 1000, // Gap (ms) to show time separator (15 mins)
  CHAT_GROUPING_GAP: 2 * 60 * 1000, // Gap (ms) to break message grouping (2 mins)
  MAX_OPEN_CHAT_WINDOWS: 3, // Số lượng cửa sổ chat được mở tối đa cùng lúc
  MAX_TOTAL_CHAT_WINDOWS: 8, // Tổng số lượng chat (cả cửa sổ và bong bóng) tối đa được phép duy trì
  };
})(window);
