/**
 * Post Hub - SignalR for Post Detail Realtime Updates
 * 
 * Features:
 * - Join/Leave post group when opening/closing post detail
 * - Receive realtime react count updates
 * 
 * This is an EXPERIMENTAL feature - can be removed without affecting other code
 */

let postHubConnection = null;
let currentPostGroup = null;
let joinInFlightPromise = null;
let joinInFlightPostId = null;

function postHubT(key, params = {}, fallback = '') {
    return window.I18n?.t ? window.I18n.t(key, params, fallback || key) : (fallback || key);
}

function postHubEscapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPostHubBase() {
  if (window.API?.getCurrentHubBase) {
    const currentHubBase = window.API.getCurrentHubBase();
    if (currentHubBase) {
      return currentHubBase;
    }
  }

  return window.APP_CONFIG?.HUB_BASE || "http://localhost:5000";
}

/* =========================
   CONNECTION MANAGEMENT
========================= */

/**
 * Initialize PostHub connection (call once on app load)
 */
async function initPostHub() {
  if (postHubConnection) return; // Already initialized

  try {
    if (window.AuthStore?.ensureAccessToken) {
      await window.AuthStore.ensureAccessToken();
    }

    postHubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${getPostHubBase()}/postHub`, {
        accessTokenFactory: () => window.AuthStore?.getAccessToken?.() || "",
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    // Setup event handlers
    setupPostHubHandlers();

    // Start connection
    await postHubConnection.start();
    console.log("PostHub connected");

    // Export globally
    window.postHubConnection = postHubConnection;
  } catch (error) {
    console.error("PostHub connection failed:", error);
    
    // Retry on 401 (token expired)
    if (error?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
        await initPostHub(); // Retry after refresh
      } catch {
        console.warn("Refresh token failed - PostHub disabled");
      }
    }
  }
}

/**
 * Setup PostHub event handlers
 */
function setupPostHubHandlers() {
  if (!postHubConnection) return;

  // Handle reconnecting
  postHubConnection.onreconnecting(() => {
    console.warn("PostHub reconnecting...");
  });

  // Handle reconnected - rejoin current group if any
  postHubConnection.onreconnected(async () => {
    console.log("PostHub reconnected");
    
    // Rejoin current post group if we were in one
    if (currentPostGroup) {
      try {
        await postHubConnection.invoke("JoinPostGroup", currentPostGroup);
        console.log(`Rejoined Post-${currentPostGroup}`);
      } catch (error) {
        console.error("Failed to rejoin post group:", error);
      }
    }
  });

  // Handle connection closed
  postHubConnection.onclose(async (error) => {
    console.error("PostHub closed", error);
    
    // Try to refresh token and reconnect
    if (error?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
        await initPostHub();
      } catch {
        console.warn("PostHub disabled due to auth failure");
      }
    }
  });

  // Listen for react count updates
  postHubConnection.on("ReceiveReactUpdate", (postId, newReactCount) => {
    console.log(`React update for post ${postId}: ${newReactCount}`);
    updatePostReactCount(postId, newReactCount);
  });

  // Listen for comment count updates
  postHubConnection.on("ReceiveCommentUpdate", (postId, newCommentCount) => {
    console.log(`Comment update for post ${postId}: ${newCommentCount}`);
    updatePostCommentCount(postId, newCommentCount);
  });

  // Listen for real-time new comments (Consolidated)
  postHubConnection.on("ReceiveNewComment", (comment, parentReplyCount) => {
    console.log(`New comment/reply received:`, comment);
    
    // 1. Update total post comment count (info is inside comment object)
    updatePostCommentCount(comment.postId, comment.totalCommentCount);

    // 2. If it's a reply, update parent's reply count
    if (comment.parentCommentId && parentReplyCount !== undefined) {
      updateCommentReplyCount(comment.parentCommentId, parentReplyCount);
    }

    // 3. Inject into UI
    if (window.CommentModule) {
      if (comment.parentCommentId) {
        window.CommentModule.injectNewReply(comment);
      } else {
        window.CommentModule.injectNewComment(comment);
      }
    }
  });

  // Listen for comment react updates
  postHubConnection.on("ReceiveCommentReactUpdate", (commentId, newReactCount) => {
    console.log(`Comment react update ${commentId}: ${newReactCount}`);
    updateCommentReactCount(commentId, newReactCount);
  });

  // Listen for updated comments
  postHubConnection.on("ReceiveUpdatedComment", (comment) => {
    console.log(`Comment updated:`, comment);
    if (window.CommentModule) {
      window.CommentModule.injectUpdatedComment(comment);
    }
  });

  // Listen for deleted comments
  postHubConnection.on("ReceiveDeletedComment", (commentId, parentCommentId, totalCommentCount, parentReplyCount, postId) => {
      console.log(`Comment deleted:`, commentId);

      // 1. Update total post comment count
      if (totalCommentCount !== undefined && totalCommentCount !== null) {
         updatePostCommentCount(postId || currentPostGroup || window.currentPostId, totalCommentCount);
      }

      // 2. If it's a reply, update parent's reply count
      if (parentCommentId && parentReplyCount !== undefined) {
         updateCommentReplyCount(parentCommentId, parentReplyCount);
      }

      // 3. Remove from UI
      if (window.CommentModule) {
         window.CommentModule.handleDeletedComment(commentId, !!parentCommentId);
      }
  });

  // Listen for post content updates (Caption & Privacy)
  postHubConnection.on("ReceiveUpdatedPostContent", (updatedPost) => {
      console.log("Post Content Updated:", updatedPost);
      handlePostUpdate(updatedPost);
  });

  // Listen for full post updates
  postHubConnection.on("ReceiveUpdatedPost", (updatedPost) => {
      console.log("Post Updated:", updatedPost);
      handlePostUpdate(updatedPost);
  });

  // Listen for deleted posts
  postHubConnection.on("ReceiveDeletedPost", (postId) => {
      console.log("Post Deleted:", postId);
      // Wait a bit to ensure smooth UX if user is the one deleting (race condition)
      // Actually PostUtils.hidePost handles it gracefully if already closed
      if (window.PostUtils) {
          PostUtils.hidePost(postId);
      }
  });
}

/**
 * Handle Post Update (Common logic)
 */
function handlePostUpdate(updatedPost) {
    if (window.currentPostId !== updatedPost.postId) return;

    // 1. Check Privacy First
    if (!checkPrivacyAccess(updatedPost.privacy)) {
        console.warn("Access lost due to privacy change");
        // PostUtils.hidePost handles closing modal, hiding from feed, and showing toast
        PostUtils.hidePost(updatedPost.postId);
        return;
    }

    // 2. Update UI
    
    // Caption
    const captionText = document.getElementById("detailCaptionText");
    const captionItem = document.getElementById("detailCaptionItem");
    
    if (updatedPost.content) {
        if (captionItem) captionItem.style.display = "block";
        if (captionText) {
             // Use PostUtils to setup caption (handles see more etc)
             PostUtils.setupCaption(captionText, updatedPost.content);
        }
    } else {
        // If content became empty (rare for updateContent but possible)
        if (captionText) captionText.textContent = "";
        if (captionItem) captionItem.style.display = "none";
    }

    // 3. Update Header (Time + Privacy + Edited)
    const timeEl = document.getElementById("detailTime");
    if (timeEl && window.PostUtils) {
         const createdAt = timeEl.dataset.createdAt;
         
         if (createdAt) {
             let timeHTML = `${PostUtils.timeAgo(createdAt)} <span>&middot;</span> ${PostUtils.renderPrivacyBadge(updatedPost.privacy)}`;
             
             if (updatedPost.updatedAt) {
                 const editedTime = PostUtils.formatFullDateTime(updatedPost.updatedAt);
                 const editedTitle = postHubEscapeHtml(
                     postHubT("post.comments.editedAt", { time: editedTime }, "Edited at {time}"),
                 );
                 const editedLabel = postHubEscapeHtml(
                     postHubT("post.comments.editedLabel", {}, "edited"),
                 );
                 timeHTML += ` <span>&middot;</span> <span class="post-edited-indicator" title="${editedTitle}">${editedLabel}</span>`;
             }
             
             timeEl.innerHTML = timeHTML;
             if (window.lucide) window.lucide.createIcons();
         }
    }
}

/**
 * Check if current user still has access based on new privacy
 */
function checkPrivacyAccess(newPrivacy) {
    // 0 = Public, 1 = FollowOnly, 2 = Private
    if (newPrivacy === 0) return true; // Public is always ok

    const ownerId = window.currentPostOwnerId;
    const isFollowed = window.currentIsFollowed === true; // Ensure boolean
    const currentUserId = window.APP_CONFIG.CURRENT_USER_ID;

    // Owner always has access (Case insensitive check)
    if (String(currentUserId).toLowerCase() === String(ownerId).toLowerCase()) return true;

    if (newPrivacy === 2) { // Private
        // Only owner allowed (handled above)
        return false; 
    }

    if (newPrivacy === 1) { // FollowOnly
        // Must be following
        return isFollowed;
    }

    return true;
}

/* =========================
   GROUP MANAGEMENT
========================= */

/**
 * Join a post group when opening post detail
 * @param {string} postId - GUID of the post
 */
async function joinPostGroup(postId) {
  const targetPostId = (postId || "").toString().trim();
  if (!targetPostId) return false;

  if (!postHubConnection || postHubConnection.state !== signalR.HubConnectionState.Connected) {
    console.warn("PostHub not connected, cannot join group");
    return false;
  }

  if (currentPostGroup === targetPostId && !joinInFlightPromise) {
    return true;
  }

  if (joinInFlightPromise && joinInFlightPostId === targetPostId) {
    return joinInFlightPromise;
  }

  const joinTask = (async () => {
    try {
      if (currentPostGroup && currentPostGroup !== targetPostId) {
        await leavePostGroup(currentPostGroup);
      }

      await postHubConnection.invoke("JoinPostGroup", targetPostId);
      currentPostGroup = targetPostId;
      console.log(`Joined Post-${targetPostId} group`);
      return true;
    } catch (error) {
      console.error("Failed to join post group:", error);
      return false;
    } finally {
      if (joinInFlightPromise === joinTask) {
        joinInFlightPromise = null;
        joinInFlightPostId = null;
      }
    }
  })();

  joinInFlightPromise = joinTask;
  joinInFlightPostId = targetPostId;
  return joinTask;
}

/**
 * Leave a post group when closing post detail
 * @param {string} postId - GUID of the post
 */
async function leavePostGroup(postId) {
  const targetPostId = (postId || "").toString().trim();
  if (!targetPostId) return;

  if (joinInFlightPromise && joinInFlightPostId === targetPostId) {
    try {
      await joinInFlightPromise;
    } catch (_) {
      // Ignore join failure and continue leave flow.
    }
  }

  if (currentPostGroup !== targetPostId) {
    return;
  }

  if (!postHubConnection || postHubConnection.state !== signalR.HubConnectionState.Connected) {
    currentPostGroup = null;
    return;
  }

  try {
    await postHubConnection.invoke("LeavePostGroup", targetPostId);

    if (currentPostGroup === targetPostId) {
      currentPostGroup = null;
    }

    console.log(`Left Post-${targetPostId} group`);
  } catch (error) {
    console.error("Failed to leave post group:", error);
  }
}

/* =========================
   UI UPDATE HANDLERS
========================= */

/**
 * Update react count in UI when receiving SignalR update
 * @param {string} postId - GUID of the post
 * @param {number} newReactCount - New react count
 */
function updatePostReactCount(postId, newReactCount) {
  // 1. Update in post detail modal if open
  const detailModal = document.getElementById("postDetailModal");
  if (detailModal && detailModal.classList.contains("show")) {
    if (window.currentPostId === postId) {
      animateValue(document.getElementById("detailLikeCount"), newReactCount);
    }
  }


  // 2. Also update in newsfeed if visible
  const feedPost = document.querySelector(`.post[data-post-id="${postId}"]`);
  if (feedPost) {
    animateValue(feedPost.querySelector(".react-btn .count"), newReactCount);
  }
}

/**
 * Update comment count in UI when receiving SignalR update
 * @param {string} postId - GUID of the post
 * @param {number} newCommentCount - New total comment count
 */
function updatePostCommentCount(postId, newCommentCount) {
  // 1. Update in post detail modal if open
  const detailModal = document.getElementById("postDetailModal");
  if (detailModal && detailModal.classList.contains("show")) {
    if (window.currentPostId === postId) {
      animateValue(document.getElementById("detailCommentCount"), newCommentCount);
    }
  }

  // 2. Also update in newsfeed if visible (the message-circle action item)
  const feedPost = document.querySelector(`.post[data-post-id="${postId}"]`);
  if (feedPost) {
    // Find the comment count span (next to message-circle icon)
    const commentCountEl = feedPost.querySelector(".action-item i[data-lucide='message-circle'] + .count");
    if (commentCountEl) {
      animateValue(commentCountEl, newCommentCount);
    }
  }
}

/**
 * Update comment react count in UI when receiving SignalR update
 * @param {string} commentId - GUID of the comment
 * @param {number} newReactCount - New react count
 */
function updateCommentReactCount(commentId, newReactCount) {
  // Support both Main Comments (data-comment-id) and Replies (data-reply-id)
  const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"], .reply-item[data-reply-id="${commentId}"]`);
  if (commentEl) {
    console.log(`Updating react count for ${commentEl.classList.contains('reply-item') ? 'reply' : 'comment'}: ${commentId}`);
    const reactCountEl = commentEl.querySelector(".react-count");
    if (reactCountEl) {
        const displayValue = newReactCount > 0 ? newReactCount : "";
        animateValue(reactCountEl, displayValue);
    }
  }
}

/**
 * Update comment reply count in UI when receiving SignalR update
 * @param {string} commentId - GUID of the comment
 * @param {number} newReplyCount - New total reply count
 */
function updateCommentReplyCount(commentId, newReplyCount) {
  const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
  if (commentEl) {
    const replyCountEl = commentEl.querySelector(".reply-count");
    if (replyCountEl) {
        const displayValue = newReplyCount > 0 ? newReplyCount : "";
        animateValue(replyCountEl, displayValue);
    }
  }
}

/**
 * Helpler to animate value change with sliding effect
 */
function animateValue(element, newValue) {
  if (!element) return;
  
  const oldValueText = element.textContent.trim();
  const oldValue = parseInt(oldValueText) || 0;
  
  // Normalize newValue for comparison (handle empty strings)
  const newValueInt = parseInt(newValue) || 0;
  if (oldValue === newValueInt) return;

  const direction = newValueInt > oldValue ? "up" : "down";
  
  // 1. Slide out old value
  element.classList.remove("slide-up-out", "slide-up-in", "slide-down-out", "slide-down-in");
  element.classList.add(`slide-${direction}-out`);
  
  // 2. Mid-animation: swap text and slide in
  setTimeout(() => {
    element.textContent = newValue;
    element.classList.remove(`slide-${direction}-out`);
    element.classList.add(`slide-${direction}-in`);
    
    // 3. Cleanup
    setTimeout(() => {
      element.classList.remove(`slide-${direction}-in`);
    }, 200);
  }, 150);
}

/* =========================
   PUBLIC API
========================= */

// Export functions globally
window.PostHub = {
  init: initPostHub,
  joinPostGroup,
  leavePostGroup,
  animateValue, // Export globally for other hubs to use
};

// Also export animateValue directly for convenience
window.animateValue = animateValue;

// Auto-initialize when script loads (if SignalR library is available)
if (typeof signalR !== "undefined") {
  initPostHub();
} else {
  console.warn("SignalR library not loaded - PostHub disabled");
}
