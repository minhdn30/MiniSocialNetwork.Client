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
      setupScrollListener(postId);
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

      // If no scrollbar appeared but we have more, load again automatically
      if (commentHasNext) {
        checkNeedsMoreComments(postId);
      }
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
   * Helper to ensure scrollbar appears if there's more content
   */
  function checkNeedsMoreComments(postId) {
    const detailBody = document.getElementById("detailBody");
    if (!detailBody) return;

    // Use a small delay to let DOM settle
    setTimeout(() => {
        if (!commentHasNext || isCommentsLoading) return;
        
        // If content height is less than or near container height, load more
        if (detailBody.scrollHeight <= detailBody.clientHeight + 100) {
            loadComments(postId, commentPage + 1);
        }
    }, 100);
  }

  /**
   * Setup infinite scroll for comments
   */
  function setupScrollListener(postId) {
    const detailBody = document.getElementById("detailBody");
    if (!detailBody) return;

    // Remove existing if any (prevent duplicates)
    detailBody.onscroll = null;

    detailBody.onscroll = () => {
        if (isCommentsLoading || !commentHasNext) return;

        // Check if near bottom
        const nearBottom = detailBody.scrollTop + detailBody.clientHeight >= detailBody.scrollHeight - 50;
        if (nearBottom) {
            loadComments(postId, commentPage + 1);
        }
    };
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
                <div class="comment-action-item like-btn ${isReacted ? "active" : ""}" onclick="CommentModule.handleLikeComment('${comment.commentId}', this, event)">
                    <i data-lucide="heart" class="comment-react-icon react-icon ${isReacted ? "reacted" : ""} hover-scale-sm"></i>
                    <span class="comment-count react-count hover-scale-text">${comment.reactCount > 0 ? comment.reactCount : ""}</span>
                </div>
                <div class="comment-action-item" onclick="CommentModule.handleReplyToggle('${comment.commentId}', false)">
                    <i data-lucide="reply" class="comment-action-icon hover-scale-sm"></i>
                    <span class="comment-count reply-count hover-scale-text" onclick="event.stopPropagation(); CommentModule.handleReplyToggle('${comment.commentId}', true)">${comment.replyCount > 0 ? comment.replyCount : ""}</span>
                </div>
            </div>
            <!-- Replies into separate list -->
            <div class="replies-list-container" style="display: none;">
                <div class="replies-list" data-parent-id="${comment.commentId}"></div>
            </div>
            <!-- Reply form -->
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
   * Handle liking a comment
   */
  async function handleLikeComment(commentId, container, event) {
    const icon = container.querySelector(".react-icon");
    let countEl = container.querySelector(".react-count");

    // Check if clicked the count specifically to open modal
    if (event) {
        const clickedCount = event.target.closest(".react-count");
        if (clickedCount && window.InteractionModule) {
            const currentCount = parseInt(countEl.textContent) || 0;
            if (currentCount > 0) {
                event.stopPropagation();
                InteractionModule.openReactList(commentId, 'comment');
                return;
            }
        }
    }

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
   * Consolidated toggle with mode selection
   * includeList = true (from count click): Toggles both
   * includeList = false (from icon click): Toggles only input
   */
  async function handleReplyToggle(commentId, includeList = false) {
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!item) return;

    const repliesContainer = item.querySelector(".replies-list-container");
    const formContainer = item.querySelector(".reply-form-container");
    const isFormOpen = !!formContainer.querySelector(".reply-input-wrapper");
    const isListOpen = repliesContainer && repliesContainer.style.display === "flex";

    // Close other input forms
    document.querySelectorAll(".reply-form-container").forEach(c => {
        if (c !== formContainer) c.innerHTML = "";
    });

    if (includeList) {
        // Toggle BOTH (Icon Count behavior)
        if (isFormOpen || isListOpen) {
            formContainer.innerHTML = "";
            if (repliesContainer) repliesContainer.style.display = "none";
        } else {
            renderReplyInput(commentId, formContainer);
            if (repliesContainer) {
                if (!repliesContainer.classList.contains("loaded")) {
                    loadReplies(commentId, 1);
                } else {
                    repliesContainer.style.display = "flex";
                }
            }
        }
    } else {
        // Toggle FORM ONLY (Icon Button behavior)
        if (isFormOpen) {
            formContainer.innerHTML = "";
            // If the user explicitly wants to close the form via the button, we keep the list as is (if it was open) or close list too? 
            // User said: "bấm phát nữa thì đóng cả 2", but that was for the combined view.
            // Let's make the reply icon toggle ONLY the form visibility for simplicity.
        } else {
            renderReplyInput(commentId, formContainer);
        }
    }
  }

  /**
   * Internal helper to render the reply form
   */
  function renderReplyInput(commentId, container) {
    const maxLength = window.APP_CONFIG?.MAX_COMMENT_INPUT_LENGTH || 500;
    
    container.innerHTML = `
        <div class="reply-input-wrapper">
            <div class="emoji-trigger reply-emoji-trigger">
                <i data-lucide="smile"></i>
            </div>
            <textarea class="reply-input" placeholder="Add a reply..." autocomplete="off" rows="1" maxlength="${maxLength}"></textarea>
            <button class="reply-post-btn" disabled>
                <i data-lucide="arrow-up-circle"></i>
            </button>
            <div class="reply-emoji-picker-container"></div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    const input = container.querySelector(".reply-input");
    const btn = container.querySelector(".reply-post-btn");
    const emojiBtn = container.querySelector(".reply-emoji-trigger");
    const emojiPickerContainer = container.querySelector(".reply-emoji-picker-container");

    input.focus({ preventScroll: true });

    // Auto-resize textarea
    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    };

    input.oninput = () => {
        btn.disabled = input.value.trim().length === 0;
        autoResize();
    };

    input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !btn.disabled) {
            e.preventDefault();
            submitReply(commentId, input.value.trim(), container);
        }
        if (e.key === "Escape") {
            const item = container.closest(".comment-item");
            const repliesContainer = item?.querySelector(".replies-list-container");
            container.innerHTML = "";
            if (repliesContainer) repliesContainer.style.display = "none";
        }
    };

    btn.onclick = () => {
        submitReply(commentId, input.value.trim(), container);
    };

    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.EmojiUtils) {
            const btnRect = emojiBtn.getBoundingClientRect();
            const detailBody = document.getElementById("detailBody");
            const bodyRect = detailBody ? detailBody.getBoundingClientRect() : { top: 0 };
            
            const spaceAbove = btnRect.top - bodyRect.top;
            if (spaceAbove < 320) emojiPickerContainer.classList.add("show-below");
            else emojiPickerContainer.classList.remove("show-below");

            EmojiUtils.togglePicker(emojiPickerContainer, (emoji) => {
                EmojiUtils.insertAtCursor(input, emoji.native);
                autoResize();
            });
        }
    };
  }


  /**
   * Submit the reply to API
   */
  async function submitReply(parentCommentId, content, container) {
    if (!content) return;

    const btn = container.querySelector(".reply-post-btn");
    const input = container.querySelector(".reply-input");
    
    if (!btn || !input) return;
    
    // Disable during submission
    btn.disabled = true;
    input.disabled = true;

    try {
      const postId = window.currentPostId;
      if (!postId) throw new Error("Post ID not found");
      
      const response = await apiFetch(`/Comments/${postId}`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content,
          parentCommentId: parentCommentId // Reply to this comment
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to post reply");
      }

      if (window.toastSuccess) toastSuccess("Reply posted!");
      
      const result = await response.json();
      container.innerHTML = ""; // Close form

      const commentItem = container.closest(".comment-item");
      const repliesContainer = commentItem?.querySelector(".replies-list-container");
      
      if (repliesContainer) {
        repliesContainer.style.display = "flex";
        injectNewReply(result);
      }
      
    } catch (err) {
      console.error(err);
      if (window.toastError) toastError(err.message || "Failed to post reply");
      btn.disabled = false;
      input.disabled = false;
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
   * Toggle replies visibility
   */
  async function toggleReplies(commentId) {
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!item) return;

    const container = item.querySelector(".replies-list-container");

    if (container.classList.contains("loaded")) {
        const isHidden = container.style.display === "none";
        container.style.display = isHidden ? "flex" : "none";
        return;
    }

    loadReplies(commentId, 1);
  }


  /**
   * Load replies for a comment
   */
  async function loadReplies(commentId, page = 1) {
    const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!item) return;

    const container = item.querySelector(".replies-list-container");
    const repliesList = item.querySelector(".replies-list");
    const pageSize = window.APP_CONFIG?.REPLIES_PAGE_SIZE || 3;

    container.style.display = "flex";

    if (page === 1) repliesList.innerHTML = `<div class="replies-loading">Loading...</div>`;

    try {
        const res = await apiFetch(`/Comments/replies/${commentId}?page=${page}&pageSize=${pageSize}`);
        if (!res.ok) throw new Error("Failed to load replies");

        const data = await res.json();
        const replies = data.items || [];

        if (page === 1) repliesList.innerHTML = "";
        else repliesList.querySelector(".replies-loading")?.remove();

        replies.forEach(reply => {
            repliesList.appendChild(renderReplyItem(reply));
        });

        container.classList.add("loaded");

        if (data.hasNextPage) {
            const moreBtn = document.createElement("div");
            moreBtn.className = "load-more-comments load-more-replies hover-scale-sm";
            moreBtn.innerHTML = `<i data-lucide="plus-circle"></i>`;
            moreBtn.title = "Show more replies";
            moreBtn.onclick = (e) => {
                e.stopPropagation();
                moreBtn.remove();
                loadReplies(commentId, page + 1);
            };
            repliesList.appendChild(moreBtn);
        }

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="error">Error loading replies</div>`;
    }
  }

  /**
   * Render a single reply item
   */
  function renderReplyItem(reply) {
    const item = document.createElement("div");
    item.className = "reply-item";
    item.dataset.replyId = reply.commentId;

    const avatarUrl = reply.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    const timeDisplay = PostUtils.timeAgo(reply.createdAt, true);
    const isReacted = reply.isCommentReactedByCurrentUser;

    item.innerHTML = `
        <div class="comment-content-wrapper">
            <div class="comment-header">
                <div class="post-user" data-account-id="${reply.owner.accountId}">
                    <img class="comment-avatar post-avatar" src="${avatarUrl}" alt="avatar" />
                    <span class="comment-username post-username">${PostUtils.truncateName(reply.owner.fullName || reply.owner.username)}</span>
                </div>
                <span class="comment-time" title="${PostUtils.formatFullDateTime(reply.createdAt)}">${timeDisplay}</span>
            </div>
            <div class="comment-body">
                <span class="comment-text"></span>
            </div>
            <div class="comment-footer">
                <div class="comment-action-item like-btn ${isReacted ? "active" : ""}" onclick="CommentModule.handleLikeComment('${reply.commentId}', this, event)">
                    <i data-lucide="heart" class="comment-react-icon react-icon ${isReacted ? "reacted" : ""} hover-scale-sm"></i>
                    <span class="comment-count react-count hover-scale-text">${reply.reactCount > 0 ? reply.reactCount : ""}</span>
                </div>
            </div>
        </div>
    `;

    const textEl = item.querySelector(".comment-text");
    if (textEl && window.PostUtils) {
      PostUtils.setupCommentContent(textEl, reply.content);
    }

    return item;
  }

  /**
   * Submit main comment (not a reply)
   */
  async function submitMainComment(postId, content) {
    if (!content || !postId) return false;
    
    try {
      const response = await apiFetch(`/Comments/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content,
          parentCommentId: null // Main comment, not a reply
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to post comment');
      }
      
      // Reload comments to show the new one
      await loadComments(postId, 1);
      
      // Show success toast
      if (window.toastSuccess) {
        window.toastSuccess('Comment posted successfully!');
      }
      
      return true;
    } catch (error) {
      console.error('Error posting comment:', error);
      if (window.toastError) {
        window.toastError(error.message || 'Failed to post comment');
      }
      return false;
    }
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

  /**
   * Inject a new comment into the DOM (used by SignalR)
   */
  function injectNewComment(comment) {
    const list = document.getElementById("detailCommentsList");
    if (!list) return;

    // Check if it's already there (to avoid duplicates if the poster receives it too)
    if (document.querySelector(`.comment-item[data-comment-id="${comment.commentId}"]`)) return;

    // Render item
    const item = renderCommentItem(comment);
    
    // Highlight effect
    item.style.backgroundColor = "var(--bg-active)";
    item.style.transition = "background-color 2s ease";
    
    list.prepend(item);
    
    // Fade out highlight
    setTimeout(() => {
      item.style.backgroundColor = "transparent";
    }, 100);

    if (window.lucide) lucide.createIcons();
  }

  /**
   * Inject a new reply into the DOM (used by SignalR)
   */
  function injectNewReply(reply) {
    const repliesList = document.querySelector(`.replies-list[data-parent-id="${reply.parentCommentId}"]`);
    if (!repliesList) return;

    const container = repliesList.closest(".replies-list-container");
    
    // Check if it's already there
    if (document.querySelector(`.reply-item[data-reply-id="${reply.commentId}"]`)) return;

    // Render item
    const item = renderReplyItem(reply);

    // Highlight effect
    item.style.backgroundColor = "var(--bg-active)";
    item.style.transition = "background-color 2s ease";

    // Show container if it was hidden
    if (container) {
        container.style.display = "flex";
    }

    repliesList.appendChild(item);

    // Fade out highlight
    setTimeout(() => {
        item.style.backgroundColor = "transparent";
    }, 100);

    if (window.lucide) lucide.createIcons();
  }

  // Public API
  return {
    loadComments,
    handleLikeComment,
    handleReplyToggle,
    toggleReplies,
    resetState,
    hasUnsavedReply,
    submitMainComment,
    injectNewComment,
    injectNewReply
  };

})();



// Export globally
window.CommentModule = CommentModule;
