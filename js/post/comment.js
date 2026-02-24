/**
 * Comment Module
 * Handles fetching, rendering, and interactions for comments
 */

const CommentModule = (function () {
  let commentPage = 1;
  const commentPageSize = window.APP_CONFIG?.COMMENTS_PAGE_SIZE || 10;
  let commentHasNext = false;
  let isCommentsLoading = false;
  let currentPostOwnerId = null;

  // Race condition prevention: Request ID validation
  let currentLoadRequestId = 0;

  function resolveStoryRingClass(storyRingState) {
    const normalizedState = (storyRingState ?? "")
      .toString()
      .trim()
      .toLowerCase();

    if (
      storyRingState === 2 ||
      normalizedState === "2" ||
      normalizedState === "unseen" ||
      normalizedState === "story-ring-unseen"
    ) {
      return "story-ring-unseen";
    }

    if (
      storyRingState === 1 ||
      normalizedState === "1" ||
      normalizedState === "seen" ||
      normalizedState === "story-ring-seen"
    ) {
      return "story-ring-seen";
    }

    return "";
  }

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function isCurrentViewerAccount(accountId) {
    const targetId = normalizeAccountId(accountId);
    if (!targetId) return false;
    const currentId =
      normalizeAccountId(APP_CONFIG.CURRENT_USER_ID) ||
      normalizeAccountId(localStorage.getItem("accountId"));
    return !!currentId && targetId === currentId;
  }

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildCommentAvatarHtml(owner, ringSizeClass = "") {
    const avatarUrl = owner?.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    const ringClass = isCurrentViewerAccount(owner?.accountId)
      ? ""
      : resolveStoryRingClass(owner?.storyRingState);
    const safeAvatarUrl = escapeAttr(avatarUrl);
    const profileHref = `#/profile/${owner?.username || ""}`;

    if (!ringClass) {
      return {
        hasRing: false,
        html: `
                    <a href="${profileHref}" style="text-decoration: none;" onclick="event.stopPropagation()">
                        <img class="comment-avatar post-avatar" src="${safeAvatarUrl}" alt="avatar" />
                    </a>
        `,
      };
    }

    const ringClassSuffix = ringSizeClass ? ` ${ringSizeClass}` : "";
    const storyAuthorAttr = owner?.accountId
      ? ` data-story-author-id="${escapeAttr(owner.accountId)}"`
      : "";
    return {
      hasRing: true,
      html: `
                    <a href="${profileHref}" class="post-avatar-ring ${ringClass}${ringClassSuffix}"${storyAuthorAttr} style="text-decoration: none;" onclick="event.stopPropagation()">
                        <img class="comment-avatar post-avatar" src="${safeAvatarUrl}" alt="avatar" />
                    </a>
      `,
    };
  }

  /**
   * Initialize or reset comment state for a new post
   */
  function resetState() {
    commentPage = 1;
    commentHasNext = false;
    isCommentsLoading = false;
    currentPostOwnerId = null;

    // Invalidate any in-flight requests
    currentLoadRequestId++;

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
        const res = await fetch("pages/post/comment.html");
        container.innerHTML = await res.text();
      } catch (err) {
        console.error("Failed to load comment.html", err);
      }
    }
  }

  /**
   * Fetch and render comments for a post
   */
  async function loadComments(postId, page = 1, postOwnerId = null) {
    if (isCommentsLoading) return;

    await ensureHtmlLoaded();

    const commentsList = document.getElementById("detailCommentsList");
    const loader = document.getElementById("detailCommentsLoader");

    if (!commentsList) return;

    if (page === 1) {
      commentsList.innerHTML = "";
      resetState();
      // Set owner AFTER reset
      if (postOwnerId) currentPostOwnerId = postOwnerId;
      setupScrollListener(postId);
    } else {
      // Update if provided on subsequent calls (rare but safe)
      if (postOwnerId) currentPostOwnerId = postOwnerId;
    }

    isCommentsLoading = true;

    // Capture request ID for race condition validation
    const requestId = currentLoadRequestId;

    if (page === 1) {
      showSkeletons(commentsList, 3);
    } else if (loader) {
      loader.style.display = "flex";
    }

    try {
      const res = await API.Comments.getByPostId(postId, page, commentPageSize);

      // RACE CONDITION FIX: Check if this request is still valid
      if (requestId !== currentLoadRequestId) {
        // Request is stale, another post was opened - ignore response
        return;
      }

      if (res.status === 403) {
        PostUtils.hidePost(postId);
        return;
      }
      if (!res.ok) throw new Error("Failed to load comments");

      const data = await res.json();
      const comments = data.items || [];

      // Final check before rendering
      if (requestId !== currentLoadRequestId) return;

      comments.forEach((comment) => {
        // Prevent duplicates (e.g. from SignalR)
        if (
          document.querySelector(
            `.comment-item[data-comment-id="${comment.commentId}"]`,
          )
        )
          return;

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
      // Only update loading state if this request is still current
      if (requestId === currentLoadRequestId) {
        isCommentsLoading = false;
        hideSkeletons(commentsList);
        if (loader) loader.style.display = "none";

        if (window.lucide) lucide.createIcons();
      }
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
      const nearBottom =
        detailBody.scrollTop + detailBody.clientHeight >=
        detailBody.scrollHeight - 50;
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

    const avatarView = buildCommentAvatarHtml(
      comment.owner,
      "comment-avatar-ring",
    );
    const timeDisplay = PostUtils.timeAgo(comment.createdAt, true);
    const myAccountId = localStorage.getItem("accountId");
    const canEdit = comment.owner.accountId === myAccountId;
    // canDelete: Owner of comment OR Owner of the post
    const canDelete = canEdit || currentPostOwnerId === myAccountId;

    const isReacted = comment.isCommentReactedByCurrentUser;
    item.innerHTML = `
        <div class="comment-content-wrapper">
            <div class="comment-header">
                <div class="post-user" data-account-id="${comment.owner.accountId}">
                    ${avatarView.html}
                    <a href="#/profile/${comment.owner.username}" style="text-decoration: none; color: inherit; display: flex; align-items: center;" onclick="event.stopPropagation()">
                        <span class="comment-username post-username" style="line-height: 1;">${PostUtils.truncateName(comment.owner.username || comment.owner.fullName)}</span>
                    </a>
                </div>
                <div class="comment-header-right">
                    <span class="comment-time" title="${PostUtils.formatFullDateTime(comment.createdAt)}">${timeDisplay}</span>
                    <button class="comment-more" onclick="CommentModule.showCommentOptions('${comment.commentId}', ${canDelete}, ${canEdit}, false)">
                        <i data-lucide="more-horizontal"></i>
                    </button>
                </div>
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
                ${getEditedHtml(comment)}
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
        event.stopPropagation();
        InteractionModule.openReactList(
          commentId,
          "comment",
          countEl.textContent,
        );
        return;
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
      icon.addEventListener(
        "animationend",
        () => icon.classList.remove("unreacting"),
        { once: true },
      );

      const nextCount = currentCount - 1;
      countEl.textContent = nextCount > 0 ? nextCount : "";
    } else {
      icon.classList.add("reacted");
      container.classList.add("active");

      const nextCount = currentCount + 1;
      countEl.textContent = nextCount;
    }

    try {
      const res = await API.Comments.toggleReact(commentId);
      if (res.status === 403) {
        PostUtils.hidePost(window.currentPostId);
        return;
      }
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
    const item = document.querySelector(
      `.comment-item[data-comment-id="${commentId}"]`,
    );
    if (!item) return;

    const repliesContainer = item.querySelector(".replies-list-container");
    const formContainer = item.querySelector(".reply-form-container");
    const isFormOpen = !!formContainer.querySelector(".reply-input-wrapper");
    const isListOpen =
      repliesContainer && repliesContainer.style.display === "flex";

    if (includeList) {
      // Toggle BOTH (Icon Count behavior)
      if (isListOpen || isFormOpen) {
        // Already open -> CLOSE IT (Tắt)
        formContainer.innerHTML = "";
        if (repliesContainer) {
          repliesContainer.style.display = "none";
          repliesContainer.classList.remove("loaded");
        }
      } else {
        // Close other input forms (both replies and edits)
        document.querySelectorAll(".reply-form-container").forEach((c) => {
          if (c !== formContainer) c.innerHTML = "";
        });
        document.querySelectorAll(".comment-edit-form").forEach((form) => {
          const cancelBtn = form.querySelector(".btn-cancel-edit");
          if (cancelBtn) cancelBtn.click();
        });

        renderReplyInput(commentId, formContainer);
        if (repliesContainer) {
          repliesContainer.style.display = "flex";
          loadReplies(commentId, 1);
        }
      }
    } else {
      // Icon click behavior (only toggle form)
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
    const emojiPickerContainer = container.querySelector(
      ".reply-emoji-picker-container",
    );

    input.focus({ preventScroll: true });

    // Auto-resize textarea
    const autoResize = () => {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
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
        const bodyRect = detailBody
          ? detailBody.getBoundingClientRect()
          : { top: 0 };

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

      const response = await API.Comments.create(postId, {
        content: content,
        parentCommentId: parentCommentId,
      });

      if (response.status === 403) {
        PostUtils.hidePost(postId);
        return;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to post reply");
      }

      if (window.toastSuccess) toastSuccess("Reply posted!");

      const result = await response.json();
      container.innerHTML = ""; // Close form

      const commentItem = container.closest(".comment-item");
      const repliesContainer = commentItem?.querySelector(
        ".replies-list-container",
      );

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
    skeletons.forEach((s) => s.remove());
  }

  /**
   * Toggle replies visibility
   */
  async function toggleReplies(commentId) {
    const item = document.querySelector(
      `.comment-item[data-comment-id="${commentId}"]`,
    );
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
    const item = document.querySelector(
      `.comment-item[data-comment-id="${commentId}"]`,
    );
    if (!item) return;

    const container = item.querySelector(".replies-list-container");
    const repliesList = item.querySelector(".replies-list");
    const pageSize = window.APP_CONFIG?.REPLIES_PAGE_SIZE || 3;

    container.style.display = "flex";

    if (page === 1)
      repliesList.innerHTML = `<div class="feed-loader replies-loading"><div class="spinner spinner-small"></div></div>`;

    try {
      const res = await API.Comments.getReplies(commentId, page, pageSize);
      if (res.status === 403) {
        PostUtils.hidePost(window.currentPostId);
        return;
      }
      if (!res.ok) throw new Error("Failed to load replies");

      const data = await res.json();
      const replies = data.items || [];

      if (page === 1) repliesList.innerHTML = "";
      else repliesList.querySelector(".replies-loading")?.remove();

      replies.forEach((reply) => {
        // Prevent duplicates (e.g. from SignalR)
        if (
          document.querySelector(
            `.reply-item[data-reply-id="${reply.commentId}"]`,
          )
        )
          return;

        const replyEl = renderReplyItem(reply);

        // Smart insert based on time
        const insertBefore = findInsertBeforeElement(
          repliesList,
          reply.createdAt,
        );

        if (insertBefore) {
          repliesList.insertBefore(replyEl, insertBefore);
        } else {
          // If it's the newest so far (or list empty), append it.
          // But ensure it goes BEFORE any "Hide" button if we are appending to end.
          // The loop runs before buttons are added in this function, but 'Hide' button might exist from prev pages?
          // Actually 'Hide' is added at end of flow.
          // If we are appending, we just append. The 'Hide' button, if exists, should theoretically be at bottom.
          // If 'Hide' button exists, we should insert before it.
          const hideBtn = repliesList.querySelector(".hide-replies-btn");
          if (hideBtn) {
            repliesList.insertBefore(replyEl, hideBtn);
          } else {
            repliesList.appendChild(replyEl);
          }
        }
      });

      container.classList.add("loaded");

      if (data.hasNextPage) {
        const moreBtn = document.createElement("div");
        moreBtn.className = "load-more-comments load-more-replies";
        const totalCount = data.totalCount;
        const countText =
          totalCount && totalCount > 0 ? ` (${totalCount})` : "";
        moreBtn.textContent = `View more replies${countText}`;
        moreBtn.onclick = (e) => {
          e.stopPropagation();
          moreBtn.remove();
          loadReplies(commentId, page + 1);
        };

        // Insert before session replies so it stays at the end of history
        const firstSessionReplyAfterBatch =
          repliesList.querySelector(".session-reply");
        if (firstSessionReplyAfterBatch) {
          repliesList.insertBefore(moreBtn, firstSessionReplyAfterBatch);
        } else {
          repliesList.appendChild(moreBtn);
        }
      } else if (page > 1 || replies.length > 0) {
        // If we've reached the end, show a "Hide" button
        const hideBtn = document.createElement("div");
        hideBtn.className = "load-more-comments hide-replies-btn";
        hideBtn.textContent = "Hide replies";
        hideBtn.onclick = (e) => {
          e.stopPropagation();
          handleReplyToggle(commentId, true); // Toggle closes it when open
        };

        // Hide button should always be at the absolute bottom
        repliesList.appendChild(hideBtn);
      }

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
      repliesList.querySelector(".replies-loading")?.remove();
      if (window.toastError) toastError("Failed to load replies");
    }
  }

  /**
   * Render a single reply item
   */
  function renderReplyItem(reply) {
    const item = document.createElement("div");
    item.className = "reply-item";
    item.dataset.replyId = reply.commentId;
    item.dataset.createdAt = reply.createdAt; // Store for sorting logic

    const avatarView = buildCommentAvatarHtml(reply.owner, "reply-avatar-ring");
    const timeDisplay = PostUtils.timeAgo(reply.createdAt, true);
    const isReacted = reply.isCommentReactedByCurrentUser;

    const myAccountId = localStorage.getItem("accountId");
    const canEdit = reply.owner.accountId === myAccountId;
    // canDelete: Owner of reply OR Owner of the post
    const canDelete = canEdit || currentPostOwnerId === myAccountId;
    item.innerHTML = `
        <div class="comment-content-wrapper">
            <div class="comment-header">
                <div class="post-user" data-account-id="${reply.owner.accountId}">
                    ${avatarView.html}
                    <a href="#/profile/${reply.owner.username}" style="text-decoration: none; color: inherit; display: flex; align-items: center;" onclick="event.stopPropagation()">
                        <span class="comment-username post-username" style="line-height: 1;">${PostUtils.truncateName(reply.owner.username || reply.owner.fullName)}</span>
                    </a>
                </div>
                <div class="comment-header-right">
                    <span class="comment-time" title="${PostUtils.formatFullDateTime(reply.createdAt)}">${timeDisplay}</span>
                    <button class="comment-more" onclick="CommentModule.showCommentOptions('${reply.commentId}', ${canDelete}, ${canEdit}, true)">
                        <i data-lucide="more-horizontal"></i>
                    </button>
                </div>
            </div>
            <div class="comment-body">
                <span class="comment-text"></span>
            </div>
            <div class="comment-footer">
                <div class="comment-action-item like-btn ${isReacted ? "active" : ""}" onclick="CommentModule.handleLikeComment('${reply.commentId}', this, event)">
                    <i data-lucide="heart" class="comment-react-icon react-icon ${isReacted ? "reacted" : ""} hover-scale-sm"></i>
                    <span class="comment-count react-count hover-scale-text">${reply.reactCount > 0 ? reply.reactCount : ""}</span>
                </div>
                ${getEditedHtml(reply)}
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
      const response = await API.Comments.create(postId, {
        content: content,
        parentCommentId: null,
      });

      if (response.status === 403) {
        PostUtils.hidePost(postId);
        return false;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to post comment");
      }

      const result = await response.json();

      // Inject the new comment immediately (Optimistic-ish)
      // SignalR will also broadcast this, but injectNewComment handles duplicates
      injectNewComment(result);

      // Clear main input
      const mainInput = document.getElementById("commentInput");
      if (mainInput) {
        mainInput.value = "";
        mainInput.style.height = "auto";
        const postBtn = document.getElementById("postCommentBtn");
        if (postBtn) postBtn.disabled = true;
      }

      // Show success toast
      if (window.toastSuccess) {
        window.toastSuccess("Comment posted successfully!");
      }

      return true;
    } catch (error) {
      console.error("Error posting comment:", error);
      if (window.toastError) {
        window.toastError(error.message || "Failed to post comment");
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
    if (
      document.querySelector(
        `.comment-item[data-comment-id="${comment.commentId}"]`,
      )
    )
      return;

    // Render item
    const item = renderCommentItem(comment);

    // Animation Slide Up
    item.classList.add("animate-slide-up");

    // Highlight effect
    item.style.backgroundColor = "var(--bg-active)";
    item.style.transition = "background-color 2s ease";

    list.prepend(item);

    // Fade out highlight
    setTimeout(() => {
      item.style.backgroundColor = "transparent";
    }, 100);

    if (window.lucide) lucide.createIcons();

    // If it's the current user's comment, we might want to scroll to it or just ensure it's visible
    // But since we prepend, it's at the top.
  }

  /**
   * Update an existing comment in the DOM (used by SignalR)
   */
  function injectUpdatedComment(comment, forceExpand = false) {
    const selector = comment.parentCommentId
      ? `.reply-item[data-reply-id="${comment.commentId}"]`
      : `.comment-item[data-comment-id="${comment.commentId}"]`;

    const el = document.querySelector(selector);
    if (!el) return;

    const textEl = el.querySelector(".comment-text");
    if (textEl && window.PostUtils) {
      PostUtils.setupCommentContent(
        textEl,
        comment.content,
        undefined,
        forceExpand,
      );

      const timeEl = el.querySelector(".comment-time");
      if (timeEl) {
        timeEl.title = PostUtils.formatFullDateTime(
          comment.updatedAt || comment.createdAt,
        );
      }

      // Update Edited label
      const footer = el.querySelector(".comment-footer");
      if (footer) {
        let editedEl = footer.querySelector(".comment-edited");
        if (comment.updatedAt && comment.updatedAt !== comment.createdAt) {
          if (!editedEl) {
            footer.insertAdjacentHTML("beforeend", getEditedHtml(comment));
          } else {
            editedEl.title =
              "Edited at " + PostUtils.formatFullDateTime(comment.updatedAt);
          }
        }
      }
    }

    // Highlight effect to show it was updated
    el.style.backgroundColor = "var(--bg-active)";
    el.style.transition = "background-color 2s ease";
    setTimeout(() => {
      el.style.backgroundColor = "transparent";
    }, 100);
  }

  /**
   * Show comment options popup
   */
  function showCommentOptions(commentId, canDelete, canEdit, isReply) {
    const overlay = document.createElement("div");
    overlay.className = "post-options-overlay";
    overlay.id = "commentOptionsOverlay";

    const popup = document.createElement("div");
    popup.className = "post-options-popup";

    let optionsHTML = "";

    if (canDelete) {
      optionsHTML += `
          <button class="post-option post-option-danger" onclick="CommentModule.deleteComment('${commentId}', ${isReply})">
            <i data-lucide="trash-2"></i><span>Delete</span>
          </button>
        `;
    }

    if (canEdit) {
      optionsHTML += `
          <button class="post-option" onclick="CommentModule.editComment('${commentId}', ${isReply})">
            <i data-lucide="edit"></i><span>Edit</span>
          </button>
        `;
    }

    // Always show Report unless it's my own comment (canEdit implies ownership)
    if (!canEdit) {
      optionsHTML += `
        <button class="post-option post-option-danger" onclick="CommentModule.reportComment('${commentId}', ${isReply})">
          <i data-lucide="flag"></i><span>Report</span>
        </button>
      `;
    }

    optionsHTML += `
      <button class="post-option post-option-cancel" onclick="document.getElementById('commentOptionsOverlay').remove()">
        Cancel
      </button>
    `;

    popup.innerHTML = optionsHTML;
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  }

  async function deleteComment(commentId, isReply) {
    document.getElementById("commentOptionsOverlay")?.remove();

    // Show custom confirmation popup instead of browser confirm
    showDeleteConfirm(commentId, isReply);
  }

  function showDeleteConfirm(commentId, isReply) {
    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay"; // Reusing existing styles
    overlay.style.zIndex = "31000";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";

    popup.innerHTML = `
          <div class="unfollow-content">
              <h3>Delete this comment?</h3>
              <p>This action cannot be undone.</p>
          </div>
          <div class="unfollow-actions">
              <button class="unfollow-btn unfollow-confirm" id="confirmDeleteBtn">Delete</button>
              <button class="unfollow-btn unfollow-cancel" id="cancelDeleteBtn">Cancel</button>
          </div>
      `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Trigger animation
    requestAnimationFrame(() => {
      overlay.classList.add("show");
    });

    const closePopup = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 300);
    };

    document.getElementById("confirmDeleteBtn").onclick = async () => {
      // Disable button to prevent double-click
      const btn = document.getElementById("confirmDeleteBtn");
      btn.disabled = true;
      btn.textContent = "Deleting...";

      try {
        const res = await API.Comments.delete(commentId);
        if (res.status === 403) {
          PostUtils.hidePost(window.currentPostId);
          closePopup();
          return;
        }
        if (!res.ok) throw new Error("Failed to delete comment");

        // Success feedback
        if (window.toastSuccess) toastSuccess("Comment deleted!");

        // Remove from DOM immediately
        const selector = isReply
          ? `[data-reply-id="${commentId}"]`
          : `[data-comment-id="${commentId}"]`;
        const el = document.querySelector(selector);
        if (el) {
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 300);
        }

        closePopup();
      } catch (err) {
        console.error(err);
        if (window.toastError) toastError("Failed to delete comment");
        closePopup();
      }
    };

    document.getElementById("cancelDeleteBtn").onclick = () => {
      closePopup();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) closePopup();
    };
  }

  function editComment(commentId, isReply) {
    document.getElementById("commentOptionsOverlay")?.remove();

    // Close other input forms (replies)
    document
      .querySelectorAll(".reply-form-container")
      .forEach((c) => (c.innerHTML = ""));
    // Close other edit forms
    document.querySelectorAll(".comment-edit-form").forEach((form) => {
      if (form.dataset.editingId !== commentId) {
        const cancelBtn = form.querySelector(".btn-cancel-edit");
        if (cancelBtn) cancelBtn.click();
      }
    });

    const selector = isReply
      ? `[data-reply-id="${commentId}"]`
      : `[data-comment-id="${commentId}"]`;
    const commentEl = document.querySelector(selector);
    if (!commentEl) return;

    const textEl = commentEl.querySelector(".comment-text");
    if (!textEl) return;

    const originalContent = textEl.dataset.fullContent || textEl.textContent;
    const body = commentEl.querySelector(".comment-body");
    const originalDisplay = body.innerHTML;

    // Check if already editing
    if (body.querySelector(".comment-edit-form")) return;

    body.classList.add("editing-body");

    // Reuse reply input wrapper structure for consistency
    body.innerHTML = `
      <div class="comment-edit-form" data-editing-id="${commentId}">
        <div class="reply-input-wrapper edit-mode">
          <div class="emoji-trigger edit-emoji-trigger">
            <i data-lucide="smile"></i>
          </div>
          <textarea class="reply-input edit-input" rows="1">${originalContent}</textarea>
          
          <button class="edit-cancel-btn btn-cancel-edit" title="Cancel">
               <i data-lucide="x"></i>
          </button>

          <div class="edit-actions">
            <button class="edit-save-btn btn-save-edit" disabled title="Save">
                <i data-lucide="check-circle"></i>
            </button>
          </div>
          <div class="edit-emoji-picker-container"></div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    const input = body.querySelector(".edit-input");
    const saveBtn = body.querySelector(".edit-save-btn");
    const cancelBtn = body.querySelector(".edit-cancel-btn");
    const emojiBtn = body.querySelector(".edit-emoji-trigger");
    const emojiPickerContainer = body.querySelector(
      ".edit-emoji-picker-container",
    );

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const autoResize = () => {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    };
    autoResize();

    input.oninput = () => {
      const newContent = input.value.trim();
      saveBtn.disabled =
        newContent === originalContent || newContent.length === 0;
      autoResize();
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !saveBtn.disabled) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === "Escape") cancelBtn.click();
    };

    emojiBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.EmojiUtils) {
        const btnRect = emojiBtn.getBoundingClientRect();
        const detailBody = document.getElementById("detailBody");
        const bodyRect = detailBody
          ? detailBody.getBoundingClientRect()
          : { top: 0 };

        const spaceAbove = btnRect.top - bodyRect.top;
        if (spaceAbove < 320) emojiPickerContainer.classList.add("show-below");
        else emojiPickerContainer.classList.remove("show-below");

        EmojiUtils.togglePicker(emojiPickerContainer, (emoji) => {
          EmojiUtils.insertAtCursor(input, emoji.native);
          input.dispatchEvent(new Event("input"));
        });
      }
    };

    cancelBtn.onclick = () => {
      body.classList.remove("editing-body");
      body.innerHTML = originalDisplay;
      const newTextEl = body.querySelector(".comment-text");
      // Force expand on cancel to avoid re-truncating
      if (newTextEl)
        PostUtils.setupCommentContent(
          newTextEl,
          originalContent,
          undefined,
          true,
        );
    };

    saveBtn.onclick = async () => {
      const newContent = input.value.trim();
      if (!newContent) return;

      saveBtn.disabled = true;
      input.disabled = true;

      try {
        const res = await API.Comments.update(commentId, {
          content: newContent,
        });
        if (res.status === 403) {
          PostUtils.hidePost(window.currentPostId);
          return;
        }
        if (!res.ok) throw new Error("Failed to update comment");

        const updatedComment = await res.json();

        // Restore UI first
        body.classList.remove("editing-body");
        body.innerHTML = originalDisplay;

        // Then update with new content (uses inject logic for consistency)
        injectUpdatedComment(updatedComment, true);

        if (window.toastSuccess) toastSuccess("Updated!");
      } catch (err) {
        console.error(err);
        if (window.toastError) toastError("Failed to update");
        saveBtn.disabled = false;
        input.disabled = false;
      }
    };
  }

  function reportComment(commentId, isReply) {
    document.getElementById("commentOptionsOverlay")?.remove();
    console.log("Report comment:", commentId, "isReply:", isReply);
    if (window.toastInfo) toastInfo("Thank you for reporting this comment");
  }

  /**
   * Helper to get edited label HTML
   */
  function getEditedHtml(comment) {
    if (!comment.updatedAt || comment.updatedAt === comment.createdAt)
      return "";
    const fullTime = PostUtils.formatFullDateTime(comment.updatedAt);
    return `<span class="comment-edited" title="Edited at ${fullTime}">• edited</span>`;
  }

  /**
   * Inject a new reply into the DOM (used by SignalR)
   */
  function injectNewReply(reply) {
    const repliesList = document.querySelector(
      `.replies-list[data-parent-id="${reply.parentCommentId}"]`,
    );
    if (!repliesList) return;

    // Only inject if the user is already viewing this section
    const container = repliesList.closest(".replies-list-container");
    if (!container || container.style.display !== "flex") return;

    // Check if it's already there (duplicates)
    if (
      document.querySelector(`.reply-item[data-reply-id="${reply.commentId}"]`)
    )
      return;

    // Render item
    const item = renderReplyItem(reply);

    // Animation Slide Up
    item.classList.add("animate-slide-up");

    // Effect
    item.style.backgroundColor = "var(--bg-active)";
    item.style.transition = "background-color 2s ease";

    // Mark as session reply to keep it at the bottom during pagination (buttons logic)
    item.classList.add("session-reply");

    const insertBefore = findInsertBeforeElement(repliesList, reply.createdAt);
    if (insertBefore) {
      repliesList.insertBefore(item, insertBefore);
    } else {
      const hideBtn = repliesList.querySelector(".hide-replies-btn");
      if (hideBtn) {
        repliesList.insertBefore(item, hideBtn);
      } else {
        repliesList.appendChild(item);
      }
    }

    setTimeout(() => {
      item.style.backgroundColor = "transparent";
    }, 100);

    if (window.lucide) lucide.createIcons();

    // Smooth scroll if it was the current user
    const myAccountId = localStorage.getItem("accountId");
    if (reply.owner.accountId === myAccountId) {
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (window.lucide) lucide.createIcons();
    // Smooth scroll if it was the current user (logic omitted for brevity or handled elsewhere)
  }

  /**
   * Report a comment
   */
  async function reportComment(commentId, isReply) {
    if (document.getElementById("commentOptionsOverlay")) {
      document.getElementById("commentOptionsOverlay").remove();
    }

    if (window.showReportReasons) {
      window.showReportReasons(commentId, "comment");
    } else {
      console.error("Report module not found");
      if (window.toastInfo) toastInfo("Report feature unavailable");
    }
  }

  /**
   * Handle real-time comment deletion
   */
  function handleDeletedComment(commentId, isReply) {
    const selector = isReply
      ? `[data-reply-id="${commentId}"]`
      : `[data-comment-id="${commentId}"]`;
    const el = document.querySelector(selector);
    if (el) {
      // Check if user was typing a reply to this comment
      const replyInput = el.querySelector(".reply-input");
      if (replyInput && replyInput.value.trim().length > 0) {
        if (window.toastInfo)
          toastInfo("The comment you were replying to has been deleted.");
      }

      // If it was a reply, check if parent list is now empty or only has the 'Hide' button
      if (isReply) {
        const repliesList = el.closest(".replies-list");
        if (repliesList) {
          // Wait for DOM update
          setTimeout(() => {
            const remainingItems = repliesList.querySelectorAll(".reply-item");
            if (remainingItems.length === 0) {
              // Hide the container if no replies left
              const container = repliesList.closest(".replies-list-container");
              if (container) {
                container.style.display = "none";
                container.classList.remove("loaded"); // Reset loaded state so it fetches again if new replies appear
                // Also clear contents (remove buttons)
                repliesList.innerHTML = "";
              }
            }
          }, 0);
        }
      }

      el.remove();
      console.log(
        `🗑️ Removed deleted ${isReply ? "reply" : "comment"} ${commentId} from UI`,
      );
    }
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
    injectNewReply,
    injectUpdatedComment,
    showCommentOptions,
    deleteComment,
    handleDeletedComment,
    editComment,
    reportComment,
  };

  /**
   * Helper to find the correct insertion point for chronological order (Oldest -> Newest)
   */
  function findInsertBeforeElement(container, newCreatedAt) {
    const newTime = new Date(newCreatedAt).getTime();
    const children = container.querySelectorAll(".reply-item");

    for (const child of children) {
      const childTime = new Date(child.dataset.createdAt).getTime();
      if (childTime > newTime) {
        return child;
      }
    }
    return null;
  }
})();

// Export globally
window.CommentModule = CommentModule;
