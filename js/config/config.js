window.APP_CONFIG = {
  API_BASE: "http://localhost:5000/api", // API
  HUB_BASE: "http://localhost:5000", // SignalR
  DEFAULT_AVATAR: "/assets/images/default-avatar.jpg", // Default avatar image
  NEWSFEED_LIMIT: 5, // Max newsfeed limit/1 rq
  CAPTION_TRUNCATE_LENGTH: 150, // Chiều dài nội dung post tối đa trước khi bị cắt và hiện nút "more"
  MAX_UPLOAD_FILES: 7, // Số lượng file tối đa khi upload post mới
  MAX_UPLOAD_SIZE_MB: 5, // Dung lượng file tối đa (MB) cho mỗi ảnh/video
  MAX_POST_CONTENT_LENGTH: 3000, // Số ký tự tối đa cho caption của post
  MAX_NAME_DISPLAY_LENGTH: 25, // Độ dài tối đa của tên user khi hiển thị (được cắt thông minh theo từ)
  COMMENTS_PAGE_SIZE: 3, // Số lượng comment load mỗi lần
  REPLIES_PAGE_SIZE: 1, // Số lượng reply load mỗi lần
  COMMENT_CONTENT_TRUNCATE_LENGTH: 100, // Chiều dài nội dung comment tối đa trước khi bị cắt (tương tự post caption)
  MAX_COMMENT_INPUT_LENGTH: 500, // Số ký tự tối đa khi nhập comment/reply
  INTERACTIONS_PAGE_SIZE: 10, // Số lượng người react load mỗi lần
};


