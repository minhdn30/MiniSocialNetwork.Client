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

/* =========================
   CONNECTION MANAGEMENT
========================= */

/**
 * Initialize PostHub connection (call once on app load)
 */
async function initPostHub() {
  if (postHubConnection) return; // Already initialized

  try {
    postHubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${window.APP_CONFIG.HUB_BASE}/postHub`, {
        accessTokenFactory: () => localStorage.getItem("accessToken"),
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    // Setup event handlers
    setupPostHubHandlers();

    // Start connection
    await postHubConnection.start();
    console.log("✅ PostHub connected");

    // Export globally
    window.postHubConnection = postHubConnection;
  } catch (error) {
    console.error("❌ PostHub connection failed:", error);
    
    // Retry on 401 (token expired)
    if (error?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
        await initPostHub(); // Retry after refresh
      } catch {
        console.warn("🔐 Refresh token failed - PostHub disabled");
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
    console.warn("🔄 PostHub reconnecting...");
  });

  // Handle reconnected - rejoin current group if any
  postHubConnection.onreconnected(async () => {
    console.log("✅ PostHub reconnected");
    
    // Rejoin current post group if we were in one
    if (currentPostGroup) {
      try {
        await postHubConnection.invoke("JoinPostGroup", currentPostGroup);
        console.log(`🔄 Rejoined Post-${currentPostGroup}`);
      } catch (error) {
        console.error("Failed to rejoin post group:", error);
      }
    }
  });

  // Handle connection closed
  postHubConnection.onclose(async (error) => {
    console.error("❌ PostHub closed", error);
    
    // Try to refresh token and reconnect
    if (error?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
        await initPostHub();
      } catch {
        console.warn("🔐 PostHub disabled due to auth failure");
      }
    }
  });

  // Listen for react count updates
  postHubConnection.on("ReceiveReactUpdate", (postId, newReactCount) => {
    console.log(`📊 React update for post ${postId}: ${newReactCount}`);
    updatePostReactCount(postId, newReactCount);
  });

  // Listen for comment count updates
  postHubConnection.on("ReceiveCommentUpdate", (postId, newCommentCount) => {
    console.log(`💬 Comment update for post ${postId}: ${newCommentCount}`);
    updatePostCommentCount(postId, newCommentCount);
  });

  // Listen for real-time new comments (Consolidated)
  postHubConnection.on("ReceiveNewComment", (comment, parentReplyCount) => {
    console.log(`🆕 New comment/reply received:`, comment);
    
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
    console.log(`❤️ Comment react update ${commentId}: ${newReactCount}`);
    updateCommentReactCount(commentId, newReactCount);
  });
}

/* =========================
   GROUP MANAGEMENT
========================= */

/**
 * Join a post group when opening post detail
 * @param {string} postId - GUID of the post
 */
async function joinPostGroup(postId) {
  if (!postHubConnection || postHubConnection.state !== signalR.HubConnectionState.Connected) {
    console.warn("⚠️ PostHub not connected, cannot join group");
    return false;
  }

  try {
    // Leave previous group if any
    if (currentPostGroup && currentPostGroup !== postId) {
      await leavePostGroup(currentPostGroup);
    }

    await postHubConnection.invoke("JoinPostGroup", postId);
    currentPostGroup = postId;
    console.log(`✅ Joined Post-${postId} group`);
    return true;
  } catch (error) {
    console.error("Failed to join post group:", error);
    return false;
  }
}

/**
 * Leave a post group when closing post detail
 * @param {string} postId - GUID of the post
 */
async function leavePostGroup(postId) {
  if (!postHubConnection || postHubConnection.state !== signalR.HubConnectionState.Connected) {
    return;
  }

  try {
    await postHubConnection.invoke("LeavePostGroup", postId);
    
    if (currentPostGroup === postId) {
      currentPostGroup = null;
    }
    
    console.log(`👋 Left Post-${postId} group`);
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

  // 1.1 Update in interaction (react list) modal if open
  const interactModal = document.getElementById("interactionModal");
  if (interactModal && interactModal.classList.contains("show")) {
    // We need to check if this modal is for the right post
    // InteractionModule usually stores currentPostId in its closure, 
    // but we can check the window.InteractionModule if it's exposed or just checkpostId
    if (window.InteractionModule && window.InteractionModule.getCurrentPostId() === postId) {
        animateValue(document.getElementById("interactionTotalCount"), newReactCount);
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
  const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"], .reply-item[data-comment-id="${commentId}"]`);
  if (commentEl) {
    console.log(`✨ Updating react count for ${commentEl.classList.contains('reply-item') ? 'reply' : 'comment'}: ${commentId}`);
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
};

// Auto-initialize when script loads (if SignalR library is available)
if (typeof signalR !== "undefined") {
  initPostHub();
} else {
  console.warn("⚠️ SignalR library not loaded - PostHub disabled");
}
