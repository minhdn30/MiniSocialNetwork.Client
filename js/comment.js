/**
 * Comment Module
 * Handles fetching, rendering, and interactions for comments
 */

const CommentModule = (function () {
  let commentPage = 1;
  const commentPageSize = window.APP_CONFIG?.COMMENTS_PAGE_SIZE || 10;
  let commentHasNext = false;
  let isCommentsLoading = false;

  /**
   * Initialize or reset comment state for a new post
   */
  function resetState() {
    commentPage = 1;
    commentHasNext = false;
    isCommentsLoading = false;

    // Clear DOM if exists
    const list = document.getElementById("detailCommentsList");
    if (list) list.innerHTML = "";
  }

  /**
   * Ensure the comment section HTML is loaded
   */
  async function ensureHtmlLoaded() {
    const container = document.getElementById("commentSectionContainer");
    if (!container) return;

    if (!document.getElementById("detailCommentsList")) {
      try {
        const res = await fetch("pages/comment.html");
        container.innerHTML = await res.text();
      } catch (err) {
        console.error("Failed to load comment.html", err);
      }
    }
  }

  /**
   * Fetch and render comments for a post
   */
  async function loadComments(postId, page = 1) {
    if (isCommentsLoading) return;

    await ensureHtmlLoaded();

    const commentsList = document.getElementById("detailCommentsList");
    const loader = document.getElementById("detailCommentsLoader");

    if (!commentsList) return;

    if (page === 1) {
      commentsList.innerHTML = "";
      resetState();
    }

    isCommentsLoading = true;
    
    if (page === 1) {
        showSkeletons(commentsList, 3);
    } else if (loader) {
        loader.style.display = "flex";
    }

    try {

      const res = await apiFetch(`/Comments/post/${postId}?page=${page}&pageSize=${commentPageSize}`);
      if (!res.ok) throw new Error("Failed to load comments");

      const data = await res.json();
      const comments = data.items || [];

      comments.forEach((comment) => {
        const item = renderCommentItem(comment);
        commentsList.appendChild(item);
      });

      commentPage = data.page;
      commentHasNext = data.hasNextPage;

      renderLoadMoreButton(postId, commentsList);
    } catch (err) {
      console.error("Error loading comments:", err);
    } finally {
      isCommentsLoading = false;
      hideSkeletons(commentsList);
      if (loader) loader.style.display = "none";


      if (window.lucide) lucide.createIcons();
    }
  }

  /**
   * Render a single comment item
   */
  function renderCommentItem(comment) {
    const item = document.createElement("div");
    item.className = "comment-item";
    item.dataset.commentId = comment.commentId;

    const avatarUrl = comment.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    const timeDisplay = PostUtils.timeAgo(comment.createdAt, true);
    const isReacted = comment.isCommentReactedByCurrentUser;

    item.innerHTML = `
        <div class="comment-content-wrapper">
            <div class="comment-header">
                <div class="post-user" data-account-id="${comment.owner.accountId}">
                    <img class="comment-avatar post-avatar" src="${avatarUrl}" alt="avatar" />
                    <span class="comment-username post-username">${PostUtils.truncateName(comment.owner.fullName || comment.owner.username)}</span>
                </div>
                <span class="comment-time" title="${PostUtils.formatFullDateTime(comment.createdAt)}">${timeDisplay}</span>
            </div>
            <div class="comment-body">
                <span class="comment-text"></span>
            </div>
            <div class="comment-footer">
                <div class="comment-action-item like-btn ${isReacted ? "active" : ""}" onclick="CommentModule.handleLikeComment('${comment.commentId}', this)">
                    <i data-lucide="heart" class="comment-react-icon react-icon ${isReacted ? "reacted" : ""}"></i>
                    <span class="comment-count react-count">${comment.reactCount > 0 ? comment.reactCount : ""}</span>
                </div>
                <div class="comment-action-item" onclick="CommentModule.handleReplyComment('${comment.commentId}')">
                    <i data-lucide="reply" class="comment-action-icon"></i>
                    <span class="comment-count reply-count">${comment.replyCount > 0 ? comment.replyCount : ""}</span>
                </div>
                
                ${comment.replyCount > 0 ? `<button class="view-replies-btn">View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}</button>` : ""}
            </div>
            <!-- Reply form will be injected here -->
            <div class="reply-form-container"></div>
        </div>
    `;


    // Setup truncated content
    const textEl = item.querySelector(".comment-text");
    if (textEl && window.PostUtils) {
      PostUtils.setupCommentContent(textEl, comment.content);
    }

    return item;
  }

  /**
   * Render the "View more comments" button
   */
  function renderLoadMoreButton(postId, container) {
    const existingBtn = container.querySelector(".load-more-comments");
    if (existingBtn) existingBtn.remove();

    if (commentHasNext) {
      const btn = document.createElement("div");
      btn.className = "load-more-comments";
      btn.innerHTML = `<i data-lucide="plus-circle"></i>`;
      btn.title = "View more comments";
      btn.onclick = () => loadComments(postId, commentPage + 1);
      container.appendChild(btn);
    }
  }

  /**
   * Handle liking a comment
   */
  async function handleLikeComment(commentId, container) {
    const icon = container.querySelector(".react-icon");
    let countEl = container.querySelector(".react-count");

    const isLiked = icon.classList.contains("reacted");

    let currentCount = parseInt(countEl.textContent) || 0;

    // Toggle UI optimistically
    if (isLiked) {
      icon.classList.remove("reacted");
      container.classList.remove("active");
      
      // Add unreacting animation
      icon.classList.add("unreacting");
      icon.addEventListener("animationend", () => icon.classList.remove("unreacting"), { once: true });

      const nextCount = currentCount - 1;
      countEl.textContent = nextCount > 0 ? nextCount : "";
    } else {
      icon.classList.add("reacted");
      container.classList.add("active");

      const nextCount = currentCount + 1;
      countEl.textContent = nextCount;
    }

    try {
      const res = await apiFetch(`/Comments/${commentId}/react`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to react to comment");
    } catch (err) {
      // Revert
      icon.classList.toggle("reacted");
      container.classList.toggle("active");
      if (window.toastError) toastError("Failed to update reaction");
    }
  }

  /**
   * Handle clicking the reply button
   */
  function handleReplyComment(commentId) {
    // 1. Find target item
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!item) return;
    
    const container = item.querySelector(".reply-form-container");
    if (!container) return;

    // 2. Toggle: If already has a form, close it
    if (container.querySelector(".reply-input-wrapper")) {
        container.innerHTML = "";
        return;
    }

    // 3. Clear any other open reply forms
    document.querySelectorAll(".reply-form-container").forEach(c => {
        if (c !== container) c.innerHTML = "";
    });

    // 4. Render Form
    container.innerHTML = `
        <div class="reply-input-wrapper">
            <div class="emoji-trigger reply-emoji-trigger">
                <i data-lucide="smile"></i>
            </div>
            <input type="text" class="reply-input" placeholder="Add a reply..." autocomplete="off">
            <button class="reply-post-btn" disabled>Post</button>
            <div class="reply-emoji-picker-container"></div>
        </div>
    `;

    // Refresh icons
    if (window.lucide) lucide.createIcons();

    const input = container.querySelector(".reply-input");
    const btn = container.querySelector(".reply-post-btn");
    const emojiBtn = container.querySelector(".reply-emoji-trigger");
    const emojiPickerContainer = container.querySelector(".reply-emoji-picker-container");

    input.focus();

    input.oninput = () => {
        btn.disabled = input.value.trim().length === 0;
    };

    input.onkeydown = (e) => {
        if (e.key === "Enter" && !btn.disabled) {
            submitReply(commentId, input.value.trim(), container);
        }
        if (e.key === "Escape") {
            container.innerHTML = "";
        }
    };

    btn.onclick = () => {
        submitReply(commentId, input.value.trim(), container);
    };

    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.EmojiUtils) {
            // Smart positioning: check if there's enough space above
            const btnRect = emojiBtn.getBoundingClientRect();
            const detailBody = document.getElementById("detailBody");
            const bodyRect = detailBody ? detailBody.getBoundingClientRect() : { top: 0 };
            
            const spaceAbove = btnRect.top - bodyRect.top;
            const minSpaceNeeded = 320; // picker height is ~300px

            if (spaceAbove < minSpaceNeeded) {
                emojiPickerContainer.classList.add("show-below");
            } else {
                emojiPickerContainer.classList.remove("show-below");
            }

            EmojiUtils.togglePicker(emojiPickerContainer, (emoji) => {
                EmojiUtils.insertAtCursor(input, emoji.native);
            });
        }
    };

  }

  /**
   * Submit the reply to API
   */
  async function submitReply(parentId, content, container) {
    if (!content) return;

    const btn = container.querySelector(".reply-post-btn");
    btn.disabled = true;
    btn.textContent = "...";

    try {
      // Find the postId from current state or modal (Assuming it's stored or available)
      // Since CommentModule is usually within a post context, we can get it from detail view
      const postId = currentPostId; 
      // Wait, currentPostId is in post-detail.js. Let's assume it's global or we need to pass it.
      // Better: get from parent modal attribute if possible, or just use currentPostId if accessible.
      
      const payload = {
        content: content,
        postId: window.currentPostId, // Accessing from global scope
        parentId: parentId
      };

      const res = await apiFetch("/Comments", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to post reply");

      if (window.toastSuccess) toastSuccess("Reply posted!");
      
      container.innerHTML = ""; // Close form
      
      // Optionally: reload comments or inject the new reply
      // For now, let's just reload to see it
      loadComments(window.currentPostId, 1);
      
    } catch (err) {
      console.error(err);
      if (window.toastError) toastError("Failed to post reply");
      btn.disabled = false;
      btn.textContent = "Post";
    }
  }

  function showSkeletons(container, count = 3) {
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const skel = document.createElement("div");
        skel.className = "comment-item comment-skeleton";
        skel.innerHTML = `
            <div class="comment-content-wrapper">
                <div class="comment-header">
                    <div class="post-user">
                        <div class="skeleton-avatar skeleton"></div>
                        <div class="skeleton-name skeleton"></div>
                    </div>
                </div>
                <div class="comment-body">
                    <div class="skeleton-text skeleton"></div>
                    <div class="skeleton-text-short skeleton"></div>
                </div>
            </div>
        `;
        container.appendChild(skel);
    }
  }

  function hideSkeletons(container) {
    const skeletons = container.querySelectorAll(".comment-skeleton");
    skeletons.forEach(s => s.remove());
  }

  /**
   * Check if any inline reply form has pending content
   */
  function hasUnsavedReply() {
    const inputs = document.querySelectorAll(".reply-input");
    for (const input of inputs) {
        if (input.value.trim().length > 0) return true;
    }
    return false;
  }

  // Public API
  return {
    loadComments,
    handleLikeComment,
    handleReplyComment,
    resetState,
    hasUnsavedReply
  };
})();



// Export globally
window.CommentModule = CommentModule;
