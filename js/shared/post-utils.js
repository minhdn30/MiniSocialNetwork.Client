/**
 * Shared Post Utilities used by both Newfeed and Post Detail
 * namespace: window.PostUtils
 */

(function(global) {
    const PostUtils = {};

    /**
     * Convert date string to relative time (e.g. "2 hours ago")
     * @param {string} dateStr 
     * @returns {string} Relative time string
     */
    PostUtils.timeAgo = function(dateStr, short = false) {
        const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
      
        if (diff < 60) return short ? "now" : "just now";
      
        const minutes = Math.floor(diff / 60);
        if (minutes < 60) return short ? `${minutes}m` : `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
      
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return short ? `${hours}h` : `${hours} hour${hours > 1 ? "s" : ""} ago`;
      
        const days = Math.floor(hours / 24);
        if (days < 7) return short ? `${days}d` : `${days} day${days > 1 ? "s" : ""} ago`;
        
        const weeks = Math.floor(days / 7);
        return short ? `${weeks}w` : `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    };

    /**
     * Setup comment content with truncation logic (similar to setupCaption)
     * @param {HTMLElement} el 
     * @param {string} fullContent 
     * @param {number} maxLen 
     */
    PostUtils.setupCommentContent = function(el, fullContent, maxLen = APP_CONFIG.COMMENT_CONTENT_TRUNCATE_LENGTH) {
        if (!fullContent || fullContent.length <= maxLen) {
            el.textContent = fullContent || "";
            return;
        }

        const truncatedContent = fullContent.substring(0, maxLen) + "...";
        
        el.innerHTML = "";
        const textNode = document.createTextNode(truncatedContent);
        el.appendChild(textNode);

        const btn = document.createElement("span");
        btn.className = "caption-toggle comment-toggle";
        btn.textContent = "more";
        btn.style.marginLeft = "4px";
        
        btn.onclick = (e) => {
            e.stopPropagation();
            const isMore = btn.textContent === "more";
            if (isMore) {
                 textNode.textContent = fullContent;
                 btn.textContent = "less";
            } else {
                 textNode.textContent = truncatedContent;
                 btn.textContent = "more";
            }
        };

        el.appendChild(btn);
    };


    /**
     * Truncate name without cutting in the middle of a word
     * @param {string} name - Full user name
     * @param {number} maxLen - Max length before truncation
     * @returns {string} Truncated name
     */
    PostUtils.truncateName = function(name, maxLen = window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25) {
        if (typeof truncateSmart === 'function') {
            return truncateSmart(name, maxLen);
        }
        
        // Fallback if text-utils.js not loaded
        if (!name || name.length <= maxLen) return name;
        let truncated = name.substring(0, maxLen);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 0) {
            truncated = truncated.substring(0, lastSpace);
        }
        return truncated + "...";
    };

    /**
     * Format full date for tooltip
     * @param {string} dateStr 
     * @returns {string} Formatted date (e.g. "February 2, 2026, 09:07 PM")
     */
    PostUtils.formatFullDateTime = function(dateStr) {
        const date = new Date(dateStr);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options);
    };

    /**
     * Setup caption truncation with more/less toggle
     * @param {HTMLElement} el - The caption text element
     * @param {string} fullContent - Full caption text
     * @param {number} maxLen - Max length before truncation (default 150)
     */
    PostUtils.setupCaption = function(el, fullContent, maxLen = APP_CONFIG.CAPTION_TRUNCATE_LENGTH) {
        if (!fullContent || fullContent.length <= maxLen) {
            el.textContent = fullContent || "";
            return;
        }

        const truncatedContent = fullContent.substring(0, maxLen) + "...";
        
        // Clear and create text node for caption text
        el.innerHTML = "";
        const textNode = document.createTextNode(truncatedContent);
        el.appendChild(textNode);

        // Create line break to force toggle button to new line
        const br = document.createElement("br");
        el.appendChild(br);

        // Create Toggle Btn
        const btn = document.createElement("span");
        btn.className = "caption-toggle";
        btn.textContent = "more";
        
        btn.onclick = (e) => {
            e.stopPropagation(); // prevent post click
            const isMore = btn.textContent === "more";
            if (isMore) {
                 textNode.textContent = fullContent;
                 btn.textContent = "less";
            } else {
                 textNode.textContent = truncatedContent;
                 btn.textContent = "more";
            }
        };

        el.appendChild(btn);
    };

    /**
     * Sync post data from detail view back to feed/list view
     * @param {string} postId 
     * @param {number|string} reactCount 
     * @param {boolean} isReacted 
     * @param {number|string} commentCount 
     * @param {string} [createdAt] - Optional, to update timeago
     */
    PostUtils.syncPostFromDetail = function(postId, reactCount, isReacted, commentCount, createdAt) {
        // 1. Update React Button
        const reactBtn = document.querySelector(`.react-btn[data-post-id="${postId}"]`);
        if (reactBtn) {
            reactBtn.dataset.reacted = isReacted.toString();
            const icon = reactBtn.querySelector(".react-icon");
            const countEl = reactBtn.querySelector(".count");
            
            if (icon) icon.classList.toggle("reacted", isReacted);
            if (countEl) countEl.textContent = reactCount;
        }
    
        // 2. Update Comment Button
        // Find the element that opens the detail modal for this specific post
        const commentBtn = document.querySelector(`div.action-item[onclick*="openPostDetail('${postId}')"]`);
        if (commentBtn) {
            const countEl = commentBtn.querySelector(".count");
            if (countEl) countEl.textContent = commentCount;
        }
        
        // 3. Update Time Ago
        if (createdAt && reactBtn) {
            // Find the post element (parent of react button)
            const postEl = reactBtn.closest('.post');
            if (postEl) {
                const timeEl = postEl.querySelector('.post-time');
                // Only update if timeEl exists and PostUtils is available
                if (timeEl && PostUtils.timeAgo) {
                    timeEl.textContent = "• " + PostUtils.timeAgo(createdAt);
                    timeEl.title = PostUtils.formatFullDateTime(createdAt);
                }
            }
        }
    };

    // Export to global scope
    global.PostUtils = PostUtils;

})(window);
