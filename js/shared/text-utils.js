/**
 * Text Processing Utilities
 * Global functions for text manipulation
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m]
  );
}

/**
 * Unescape HTML entities
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
function unescapeHtml(text) {
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Truncate text with ellipsis (basic)
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Truncate text without cutting in the middle of a word (smart)
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateSmart(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Take a substring of maxLength
  let truncated = text.substring(0, maxLength);

  // Find the last space within this substring
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space, truncate at the space to avoid cutting a word
  if (lastSpace > 0) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + "...";
}

/**
 * Sanitize input by removing dangerous characters
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (!input) return "";
  // Remove script tags and event handlers
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Convert newlines to <br> tags
 * @param {string} text - Text with newlines
 * @returns {string} Text with <br> tags
 */
function nl2br(text) {
  if (!text) return "";
  return text.replace(/\n/g, "<br>");
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Automatically convert URLs in text to clickable <a> tags
 * @param {string} text - The text to process
 * @returns {string} Text with clickable links
 */
function linkify(text) {
  if (!text) return "";
  
  // URL regex: supports http, https, and www.
  const urlPattern = /(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  
  return text.replace(urlPattern, (url) => {
    let href = url;
    // Add http:// if it starts with www.
    if (url.toLowerCase().startsWith('www.')) {
        href = 'http://' + url;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${url}</a>`;
  });
}

