const POST_DETAIL_MODAL_ID = "postDetailModal";
let currentPostId = null;
let currentPostCreatedAt = null;

// Navigation context for profile post navigation (next/prev)
let navigationContext = null; // { source, postList, currentIndex, accountId, hasMore }

// Track state of all posts viewed during navigation session (for profile sync)
let viewedPostsState = new Map(); // postId -> { reactCount, isReacted, commentCount, createdAt, fullContent, privacyVal }



function resolveStoryRingClass(storyRingState) {
    const normalizedState = (storyRingState ?? "").toString().trim().toLowerCase();

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

function escapeHtmlAttr(value) {
    return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
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

function renderDetailAvatar(avatarLink, avatarUrl, storyRingState, isCurrentUserAvatar = false, accountId = "") {
    if (!avatarLink) return;

    const ringClass = isCurrentUserAvatar ? "" : resolveStoryRingClass(storyRingState);
    avatarLink.classList.remove("post-avatar-ring", "story-ring-unseen", "story-ring-seen", "post-detail-avatar-ring");
    avatarLink.style.removeProperty("--_avatar");
    avatarLink.style.removeProperty("--_ring");
    avatarLink.style.removeProperty("--_gap");
    avatarLink.removeAttribute("data-story-author-id");

    if (ringClass) {
        avatarLink.classList.add("post-avatar-ring", ringClass, "post-detail-avatar-ring");
        if (accountId) {
            avatarLink.setAttribute("data-story-author-id", accountId);
        }
    }

    const safeAvatarUrl = escapeHtmlAttr(avatarUrl || APP_CONFIG.DEFAULT_AVATAR);
    avatarLink.innerHTML = `<img id="detailAvatar" src="${safeAvatarUrl}" alt="" class="user-avatar post-avatar">`;
}

/* formatFullDateTime moved to shared/post-utils.js */

// Load PostEdit module dynamically
if (!window.PostEdit) {
    const script = document.createElement('script');
    script.src = 'js/post/post-edit.js';
    document.head.appendChild(script);
}

// Open Modal
// navigateDirection: 'next' | 'prev' | null - used for auto-skip when post is invalid
async function openPostDetail(postId, postCode = null, navContext = null, navigateDirection = null) {
    // Store navigation context if provided (from profile grid)
    navigationContext = navContext;
    // Capture the current safe hash before we mess with the URL
    // This allows us to restore exactly where the user was (Profile, Home, etc.)
    if (!window.location.hash.includes("/p/")) {
        window._returnToHash = window.location.hash || "#/home";
    }

    // If postCode is provided (from UI), push URL immediately for better UX
    if (postCode && !window.location.hash.includes("/p/")) {
        history.pushState({ postCode: postCode }, "", `#/p/${postCode}`);
    }
    
    // 1. Check if modal exists
    let modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (!modal) {
        await loadPostDetailHTML();
        modal = document.getElementById(POST_DETAIL_MODAL_ID);
    }

    resetPostDetailView();
    if (modal) modal.classList.add("show");
    if (window.lockScroll) lockScroll();

    const mainLoader = document.getElementById("detailMainLoader");
    if (mainLoader) mainLoader.style.display = "flex";

    try {
        // Prefer getByPostCode if available and valid, fallback to getById
        const res = (postCode && postCode.trim() !== '')
            ? await API.Posts.getByPostCode(postCode)
            : await API.Posts.getById(postId);
        
        if (!res.ok) {
            // Handle permission/not found errors gracefully
            if (res.status === 403 || res.status === 404 || res.status === 400) {
                // Hide post from UI (feed/profile grid)
                if (window.PostUtils) PostUtils.hidePost(postId);
                
                // AUTO-SKIP: If navigating from profile, try to skip to next/prev post
                if (navigationContext && navigationContext.source === 'profile' && navigateDirection) {
                    if (window.toastInfo) toastInfo("Post unavailable, skipping...");
                    
                    // Remove invalid post from list
                    const invalidIndex = navigationContext.currentIndex;
                    navigationContext.postList.splice(invalidIndex, 1);
                    
                    // Also remove from profile.js profilePostIds if possible
                    if (window.removeProfilePostId) {
                        window.removeProfilePostId(postId);
                    }
                    
                    // Adjust currentIndex based on direction
                    if (navigateDirection === 'prev') {
                        // Going backwards: index stays same (next item shifted down)
                        navigationContext.currentIndex = Math.max(0, invalidIndex - 1);
                    } else {
                        // Going forward: index stays same (we removed item, next item now at same index)
                        // But if we're at end, go back
                        if (invalidIndex >= navigationContext.postList.length) {
                            navigationContext.currentIndex = navigationContext.postList.length - 1;
                        }
                    }
                    
                    // Try next post if list not empty
                    if (navigationContext.postList.length > 0 && navigationContext.currentIndex >= 0) {
                        const nextPost = navigationContext.postList[navigationContext.currentIndex];
                        if (mainLoader) mainLoader.style.display = "none";
                        // Recursively try next post
                        openPostDetail(nextPost.postId, nextPost.postCode, navigationContext, navigateDirection);
                        return;
                    }
                    
                    // No more posts, close modal
                    if (window.toastInfo) toastInfo("No more posts available");
                }
                
                if (mainLoader) mainLoader.style.display = "none";
                closePostDetailModal();
                return;
            }
            if (mainLoader) mainLoader.style.display = "none";
            closePostDetailModal();
            return;
        }

        
        const data = await res.json();
        
        // Update current ID
        currentPostId = data.postId;
        window.currentPostId = data.postId;

        // Push History with PostCode (if not already done or if different)
        if (!window.location.hash.includes(`/p/${data.postCode}`)) {
             history.replaceState({ postCode: data.postCode }, "", `#/p/${data.postCode}`);
        }
        
        renderPostDetail(data, navigateDirection);        
        if (mainLoader) mainLoader.style.display = "none";

        if (window.CommentModule) {
            CommentModule.loadComments(data.postId, 1, data.owner.accountId);
        }

        if (window.PostHub) await window.PostHub.joinPostGroup(data.postId);

        // Update navigation buttons if context exists
        updateNavigationButtons();

    } catch (err) {
        if (mainLoader) mainLoader.style.display = "none";
        console.error(err);
        closePostDetailModal();
    }

}

async function openPostDetailByCode(postCode) {
    let modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (!modal) {
        await loadPostDetailHTML();
        modal = document.getElementById(POST_DETAIL_MODAL_ID);
    }

    resetPostDetailView();
    modal.classList.add("show");
    if (window.lockScroll) lockScroll();

    const mainLoader = document.getElementById("detailMainLoader");
    if (mainLoader) mainLoader.style.display = "flex";

    try {
        const res = await API.Posts.getByPostCode(postCode);
        if (!res.ok) {
            if (mainLoader) mainLoader.style.display = "none";
            // Handle permission/not found errors gracefully
            if (res.status === 403 || res.status === 404 || res.status === 400) {
                if (window.location.hash.startsWith("#/p/")) {
                    window.showErrorPage("Post not found", "The post you are looking for doesn't exist or you don't have permission to view it.");
                } else {
                    if (window.toastInfo) toastInfo("This post is no longer available or you don't have permission to view it.");
                    closePostDetailModal();
                }
                return;
            }
            closePostDetailModal();
            return;
        }
        
        const data = await res.json();
        currentPostId = data.postId;
        window.currentPostId = data.postId;

        renderPostDetail(data);        
        if (mainLoader) mainLoader.style.display = "none";

        if (window.CommentModule) {
            CommentModule.loadComments(data.postId, 1, data.owner.accountId);
        }

        if (window.PostHub) await window.PostHub.joinPostGroup(data.postId);
    } catch (err) {
        if (mainLoader) mainLoader.style.display = "none";
        console.error(err);
        
        // If it's a direct link to a post, show error page
        if (window.location.hash.startsWith("#/p/")) {
             window.showErrorPage("Post not found", "The post you are looking for doesn't exist or you don't have permission to view it.");
        }
        
        closePostDetailModal();
    }
}
// Dynamic HTML Loader
async function loadPostDetailHTML() {
    try {
        const response = await fetch('pages/post/post-detail.html');
        if (!response.ok) throw new Error("Failed to load template");
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Initialize icons for the new content
        if(window.lucide) lucide.createIcons();
        
        // Setup comment input
        setupCommentInput();
    } catch (error) {
        console.error("Error loading post detail template:", error);
    }
}

// Close Modal
function closePostDetailModal() {
    // Check if comment input has content
    const commentInput = document.getElementById('detailCommentInput');
    const hasUnsavedMain = commentInput && commentInput.value.trim().length > 0;
    const hasUnsavedInline = window.CommentModule?.hasUnsavedReply();

    if (hasUnsavedMain || hasUnsavedInline) {
        showDiscardCommentConfirmation();
        return;
    }

    // Check if editing and has changes
    if (window.PostEdit && window.PostEdit.currentEditingPostId && window.PostEdit.hasChanges()) {
        showDiscardEditConfirmation();
        return;
    }
    
    // Actually close the modal
    performClosePostDetail();
}

// Show discard comment confirmation
function showDiscardCommentConfirmation() {
    const overlay = document.createElement("div");
    overlay.className = "post-options-overlay";
    overlay.id = "discardCommentOverlay";

    const popup = document.createElement("div");
    popup.className = "post-options-popup";

    popup.innerHTML = `
        <div class="post-options-header">
            <h3>Discard comment?</h3>
            <p>If you leave, your comment won't be saved.</p>
        </div>
        <button class="post-option post-option-danger" onclick="confirmDiscardComment()">
            Discard
        </button>
        <button class="post-option post-option-cancel" onclick="cancelDiscardComment()">
            Cancel
        </button>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.onclick = (e) => {
        if (e.target === overlay) cancelDiscardComment();
    };
}

// Confirm discard comment
function confirmDiscardComment() {
    const overlay = document.getElementById("discardCommentOverlay");
    if (overlay) overlay.remove();
    
    performClosePostDetail();
}

// Show discard edit confirmation
function showDiscardEditConfirmation() {
    const overlay = document.createElement("div");
    overlay.className = "post-options-overlay";
    overlay.id = "discardEditOverlay";

    const popup = document.createElement("div");
    popup.className = "post-options-popup";

    popup.innerHTML = `
        <div class="post-options-header">
            <h3>Discard changes?</h3>
            <p>If you leave, your changes won't be saved.</p>
        </div>
        <button class="post-option post-option-danger" onclick="confirmDiscardEdit()">
            Discard
        </button>
        <button class="post-option post-option-cancel" onclick="cancelDiscardEdit()">
            Cancel
        </button>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (window.lucide) lucide.createIcons();
    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.onclick = (e) => {
        if (e.target === overlay) cancelDiscardEdit();
    };
}

// Confirm discard edit
function confirmDiscardEdit() {
    const overlay = document.getElementById("discardEditOverlay");
    if (overlay) overlay.remove();
    
    // Reset edit state then close
    if (window.PostEdit) window.PostEdit.currentEditingPostId = null;
    performClosePostDetail();
}

// Cancel discard edit
function cancelDiscardEdit() {
    const overlay = document.getElementById("discardEditOverlay");
    if (overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
    }
}

// Cancel discard comment
function cancelDiscardComment() {
    const overlay = document.getElementById("discardCommentOverlay");
    if (overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
    }
}

// Captures the current post's state from the DOM and stores it in viewedPostsState
function captureCurrentPostState() {
    if (!currentPostId || !window.PostUtils || !window.PostUtils.syncPostFromDetail) return;

    const likeIcon = document.getElementById("detailLikeIcon");
    const likeCountEl = document.getElementById("detailLikeCount");
    const commentCountEl = document.getElementById("detailCommentCount");
    const captionTextEl = document.getElementById("detailCaptionText");
    const timeEl = document.getElementById("detailTime");

    if (likeIcon && likeCountEl && commentCountEl && timeEl) {
        const isReacted = likeIcon.classList.contains("reacted");
        const reactCount = likeCountEl.textContent;
        const commentCount = commentCountEl.textContent;
        const createdAt = timeEl.dataset.createdAt;
        const fullContent = captionTextEl?.dataset.fullContent || captionTextEl?.textContent;

        const privacyBadge = document.querySelector("#detailTime .privacy-selector");
        let privacyVal = undefined;
        if (privacyBadge) {
            const title = privacyBadge.getAttribute("title");
            if (title === "Public") privacyVal = 0;
            else if (title.includes("Follower")) privacyVal = 1; // "Followers Only" or "Followers"
            else if (title === "Private") privacyVal = 2;
        }

        viewedPostsState.set(currentPostId, {
            reactCount,
            isReacted,
            commentCount,
            createdAt,
            fullContent,
            privacyVal
        });
    }
}

// Syncs all captured post states to the profile grid
function syncAllViewedPosts() {
    if (!window.PostUtils || !window.PostUtils.syncPostFromDetail) return;

    viewedPostsState.forEach((state, postId) => {
        window.PostUtils.syncPostFromDetail(
            postId,
            state.reactCount,
            state.isReacted,
            state.commentCount,
            state.createdAt,
            state.fullContent,
            state.privacyVal
        );
    });
}

// Actually perform the close action
function performClosePostDetail() {
    // Capture current post state before closing
    captureCurrentPostState();
    
    // Sync ALL viewed posts back to profile grid (if navigating from profile)
    if (navigationContext && navigationContext.source === 'profile') {
        syncAllViewedPosts();
    } else {
        // Fallback: sync single post for non-profile sources (newsfeed, etc)
        if (currentPostId && window.PostUtils && window.PostUtils.syncPostFromDetail) {
            const likeIcon = document.getElementById("detailLikeIcon");
            const likeCount = document.getElementById("detailLikeCount");
            const commentCount = document.getElementById("detailCommentCount");
            const captionText = document.getElementById("detailCaptionText");
            
            if (likeIcon && likeCount && commentCount) {
                 const isReacted = likeIcon.classList.contains("reacted");
                 const rCount = likeCount.textContent;
                 const cCount = commentCount.textContent;
                 
                 const fullContent = captionText?.dataset.fullContent || captionText?.textContent;
                 const privacyBadge = document.querySelector("#detailTime .privacy-selector");
                 let privacyVal = undefined;
                 if (privacyBadge) {
                     const title = privacyBadge.getAttribute("title");
                     if (title === "Public") privacyVal = 0;
                     else if (title.includes("Follower")) privacyVal = 1;
                     else if (title === "Private") privacyVal = 2;
                 }
                 
                 window.PostUtils.syncPostFromDetail(currentPostId, rCount, isReacted, cCount, currentPostCreatedAt, fullContent, privacyVal);
            }
        }
    }
    
    // Clear navigation session data
    viewedPostsState.clear();
    navigationContext = null;

    const postIdToClean = currentPostId;
    currentPostId = null;
    window.currentPostId = null;

    // Leave SignalR post group (experimental feature)
    if (postIdToClean && window.PostHub) {
        window.PostHub.leavePostGroup(postIdToClean);
    }

    const modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (modal) {
        modal.classList.remove("show");
        if (window.unlockScroll) unlockScroll(); // Restore scroll

        // Reset URL if it's currently on a post
        if (window.location.hash.startsWith("#/p/")) {
             // Use replaceState to change URL WITHOUT triggering router/reload
             // This keeps the current view (Home/Profile) intact while fixing the URL bar
             // Prefer the explicitly captured return hash, fallback to safeHash, then home
             const targetHash = window._returnToHash || window._lastSafeHash || "#/home";
             history.replaceState(null, "", targetHash);
        }
        
        // Close emoji picker if open
        const emojiContainer = document.querySelector('.detail-emoji-picker');
        if (emojiContainer && window.EmojiUtils) {
            window.EmojiUtils.closePicker(emojiContainer);
        }
        
        // Stop videos
        const videos = modal.querySelectorAll("video");
        videos.forEach(v => v.pause());
        
        // Clear comment input
        const commentInput = document.getElementById('detailCommentInput');
        const postBtn = document.getElementById('postCommentBtn');
        if (commentInput) {
            commentInput.value = '';
            commentInput.style.height = 'auto';
        }
        if (postBtn) postBtn.disabled = true;
    }
}

// Forced close (Privacy violation) - Bypass confirmations
function forceClosePostDetail() {
    // If discard overlays exist, remove them
    document.getElementById("discardCommentOverlay")?.remove();
    document.getElementById("discardEditOverlay")?.remove();
    
    performClosePostDetail();
}

// Export for global access (needed by PostUtils)
window.forceClosePostDetail = forceClosePostDetail;

// ================= POST NAVIGATION (Profile Only) =================
// Update visibility of navigation buttons based on context
function updateNavigationButtons() {
    const prevBtn = document.getElementById('postNavPrev');
    const nextBtn = document.getElementById('postNavNext');
    
    // Hide both buttons if no navigation context or not from profile
    if (!navigationContext || navigationContext.source !== 'profile') {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        return;
    }
    
    const { postList, currentIndex, hasMore } = navigationContext;
    
    // Show/hide based on position in list
    if (prevBtn) {
        prevBtn.style.display = currentIndex > 0 ? 'flex' : 'none';
    }
    if (nextBtn) {
        // Show Next if: not at end of list OR there are more posts to load
        const canGoNext = currentIndex < postList.length - 1 || hasMore;
        nextBtn.style.display = canGoNext ? 'flex' : 'none';
    }
    
    // Re-render icons
    if (window.lucide) lucide.createIcons();
}

// Navigate to next or previous post
async function navigateToPost(direction) {
    if (!navigationContext || navigationContext.source !== 'profile') return;
    
    const { postList, currentIndex, hasMore } = navigationContext;
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    // Bounds check for previous
    if (newIndex < 0) return;
    
    // If trying to go beyond loaded list but hasMore is true, load more first
    if (newIndex >= postList.length) {
        if (hasMore && window.loadMoreProfilePosts) {
            // Load more posts and retry
            const newPosts = await window.loadMoreProfilePosts();
            if (newPosts && newPosts.length > 0) {
                // postList is already updated inside loadMoreProfilePosts()
                // (renderPosts pushes into profilePostIds). Just refresh reference.
                navigationContext.postList = postList;
                // Sync hasMore from profile state
                if (window.getProfileHasMore) {
                    navigationContext.hasMore = window.getProfileHasMore();
                }
                // Retry navigation
                navigateToPost(direction);
            } else {
                // No more posts available, update hasMore
                navigationContext.hasMore = false;
                updateNavigationButtons();
            }
            return;
        }
        return; // No more posts to load
    }
    
    // PRE-LOAD: When approaching end of current list (3 posts remaining), load more in background
    const remainingPosts = postList.length - newIndex - 1;
    if (remainingPosts <= 3 && hasMore && window.loadMoreProfilePosts) {
        // Fire and forget - don't await
        window.loadMoreProfilePosts().then(newPosts => {
            if (newPosts && newPosts.length > 0) {
                // postList already appended in profile state; just refresh reference
                navigationContext.postList = postList;
                if (window.getProfileHasMore) {
                    navigationContext.hasMore = window.getProfileHasMore();
                }
                // Update buttons in case we're now at a different position
                updateNavigationButtons();
            }
        });
    }
    
    // Capture current post state BEFORE navigating away
    captureCurrentPostState();
    
    // Clear comment input before navigating (skip discard confirmation)
    const commentInput = document.getElementById('detailCommentInput');
    const postBtn = document.getElementById('postCommentBtn');
    if (commentInput) {
        commentInput.value = '';
        commentInput.style.height = 'auto';
    }
    if (postBtn) postBtn.disabled = true;
    
    // Also clear any inline reply inputs
    document.querySelectorAll('.reply-input').forEach(input => {
        input.value = '';
    });
    
    // Get new post info
    const newPost = postList[newIndex];
    if (!newPost) return;

    // Update context
    navigationContext.currentIndex = newIndex;
    
    // Trigger transition animation
    const layout = document.querySelector('.post-detail-layout');
    if (layout) {
        layout.classList.add(`nav-slide-out-${direction}`);
    }

    // Delay slightly to let animation finish before loading next
    setTimeout(() => {
        // Open new post with updated context and direction for auto-skip
        openPostDetail(newPost.postId, newPost.postCode, navigationContext, direction);
    }, 250);
}

// Export for HTML onclick
window.navigateToPost = navigateToPost;

// Reset View
function resetPostDetailView() {
    // Hide navigation buttons on reset
    const prevBtn = document.getElementById('postNavPrev');
    const nextBtn = document.getElementById('postNavNext');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    
    const detailAvatarLink = document.getElementById("detailAvatarLink");
    if (detailAvatarLink) {
        detailAvatarLink.href = "#";
        renderDetailAvatar(detailAvatarLink, APP_CONFIG.DEFAULT_AVATAR, null);
    }
    document.getElementById("detailUsername").textContent = "";
    document.getElementById("detailSliderWrapper").innerHTML = "";
    
    // Clear Caption
    const captionText = document.getElementById("detailCaptionText");
    if (captionText) {
        captionText.textContent = "";
        delete captionText.dataset.fullContent;
    }
    
    // Remove existing toggle button if any
    const captionItem = document.getElementById("detailCaptionItem");
    const existingToggle = captionItem.querySelector(".caption-toggle");
    if (existingToggle) existingToggle.remove();


    // Clear time and privacy
    const timeEl = document.getElementById("detailTime");
    if (timeEl) timeEl.innerHTML = "";
    
    // Reset comment module state
    if (window.CommentModule) {
        CommentModule.resetState();
    }
    
    // Hide media container initially
    document.getElementById("detailMediaContainer").style.display = "flex"; 

    // Clear navigation transitions
    const layout = document.querySelector('.post-detail-layout');
    if (layout) {
        layout.classList.remove('nav-slide-out-next', 'nav-slide-out-prev', 'nav-slide-in-next', 'nav-slide-in-prev');
    }

    // Reset to View Mode Panel
    const viewPanel = document.getElementById("detailViewPanel");
    const editPanel = document.getElementById("detailEditPanel");
    if (viewPanel) viewPanel.style.display = "flex";
    if (editPanel) editPanel.style.display = "none";
}


// Render Post
function renderPostDetail(post, navigateDirection = null) {
    const layout = document.querySelector('.post-detail-layout');
    if (layout && navigateDirection) {
        // Clean up any old animation classes
        layout.classList.remove('nav-slide-out-next', 'nav-slide-out-prev');
        
        // Setup the "in" position instantly
        layout.classList.add(`nav-slide-in-${navigateDirection}`);
    }

    // 1. Header Info
    const username = document.getElementById("detailUsername");
    const location = document.getElementById("detailLocation"); // Not in API, placeholder
    const avatarLink = document.getElementById("detailAvatarLink");
    const usernameLink = document.getElementById("detailUsernameLink");
    const avatarUrl = post.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    const isCurrentUserAvatar = isCurrentViewerAccount(post.owner?.accountId);

    if (avatarLink) {
        avatarLink.href = `#/profile/${post.owner.username}`;
        renderDetailAvatar(avatarLink, avatarUrl, post.owner?.storyRingState, isCurrentUserAvatar, post.owner?.accountId);
    }
    if (usernameLink) usernameLink.href = `#/profile/${post.owner.username}`;

    // Enable Profile Preview
    const avatar = document.getElementById("detailAvatar");
    if (avatar) avatar.classList.add("post-avatar");
    username.classList.add("post-username");
    
    const userInfo = document.querySelector("#postDetailModal .detail-header .user-info");
    if (userInfo) {
        userInfo.classList.add("post-user");
        userInfo.dataset.accountId = post.owner.accountId;
    }

    username.textContent = PostUtils.truncateName(post.owner.username || post.owner.fullName);
    
    // Header Options Button
    const moreBtn = document.querySelector("#postDetailModal .more-options-btn");
    if (moreBtn) {
        moreBtn.onclick = () => {
             const isOwner = post.isOwner !== undefined ? post.isOwner : (post.owner.accountId === APP_CONFIG.CURRENT_USER_ID); 
             // Note: APP_CONFIG.CURRENT_USER_ID might not be avail, fallback false. 
             // Better: post.isOwner is standard in this app's DTOs.
             
             const isFollowed = post.owner?.isFollowedByCurrentUser || false;
             
             if (window.showPostOptions) {
                 showPostOptions(post.postId, post.owner.accountId, isOwner, isFollowed);
             } else {
                 console.error("showPostOptions not found");
             }
        };
    }
    
    // 2. Caption
    const captionItem = document.getElementById("detailCaptionItem");
    const captionText = document.getElementById("detailCaptionText");

    if (!post.content) {
        captionItem.style.display = "none";
        if (captionText) {
            captionText.textContent = "";
            delete captionText.dataset.fullContent;
        }
    } else {
        captionItem.style.display = "block";
        PostUtils.setupCaption(captionText, post.content);
    }
    
    // Update timeago with privacy badge in header
    const timeEl = document.getElementById("detailTime");
    if (timeEl) {
        timeEl.style.display = "flex";
        timeEl.style.alignItems = "center";
        timeEl.style.gap = "6px";
        timeEl.innerHTML = `${PostUtils.timeAgo(post.createdAt)} <span>•</span> ${PostUtils.renderPrivacyBadge(post.privacy)}`;
        
        // Edited Indicator
        if (post.updatedAt) {
            const editedTime = PostUtils.formatFullDateTime(post.updatedAt);
            timeEl.innerHTML += ` <span>•</span> <span class="post-edited-indicator" title="Edited: ${editedTime}">edited</span>`;
        }

        timeEl.title = `Posted: ${PostUtils.formatFullDateTime(post.createdAt)}`;
        timeEl.dataset.createdAt = post.createdAt;
    }
    
    // Store createdAt for sync
    currentPostCreatedAt = post.createdAt;
    
    // Store privacy info for realtime checks
    window.currentPostOwnerId = post.owner.accountId;
    window.currentIsFollowed = post.isFollowedByCurrentUser;


    // 3. Media Layout
    const mediaContainer = document.getElementById("detailMediaContainer");
    const sliderWrapper = document.getElementById("detailSliderWrapper");
    
    mediaContainer.className = "detail-media-container custom-scrollbar"; // Reset classes

    if (!post.medias || post.medias.length === 0) {
        mediaContainer.style.display = "none";
        // Card width will shrink to info container width
    } else {
        mediaContainer.style.display = "flex";
        
        // Aspect Ratio Logic
        // 0: Original (Square container, contain)
        // 1: 1:1 (Square container, cover)
        // 2: 16:9 (Square container, contain) (User logic)
        // 3: 4:5 (Portrait container, cover)
        
        const ratio = post.feedAspectRatio;
        let objectFitClass = "contain"; // Default
        
        if (ratio === 2) { // 2 = Portrait 4:5
            mediaContainer.classList.add("ratio-portrait");
            objectFitClass = "cover";
        } else {
            mediaContainer.classList.add("ratio-square");
            if (ratio === 1) objectFitClass = "cover";
        }

        // Render Medias
        post.medias.forEach(media => {
            const item = document.createElement("div");
            item.className = `detail-media-item ${objectFitClass} skeleton`; // Add skeleton initially
            
            if (media.type === 1) { // Video
                 const video = document.createElement("video");
                 video.src = media.mediaUrl;
                 video.controls = true;
                 video.className = "img-loaded";
                 
                 video.onloadeddata = () => {
                     item.classList.remove("skeleton");
                     video.classList.add("show");
                 };
                 
                 item.appendChild(video);
            } else { // Image
                const img = document.createElement("img");
                img.className = "img-loaded";
                img.src = media.mediaUrl;
                
                img.onload = () => {
                    item.classList.remove("skeleton");
                    img.classList.add("show");
                };
                
                item.appendChild(img);

                
                // Dominant Color BG if contain
                if (objectFitClass === "contain" && window.extractDominantColor) {
                    // Async
                    extractDominantColor(media.mediaUrl).then(color => {
                        item.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
                    });
                }
            }
            sliderWrapper.appendChild(item);
        });
        
        initDetailSlider(post.medias.length);
    }

    // 4. Footer Actions
    const likeBtn = document.getElementById("detailLikeBtn");
    const likeIcon = document.getElementById("detailLikeIcon");
    const likeCount = document.getElementById("detailLikeCount");
    const commentCount = document.getElementById("detailCommentCount");

    likeBtn.onclick = (e) => {
        const clickedIcon = e.target.closest(".react-icon");
        const clickedCount = e.target.closest(".count");

        if (clickedIcon) {
            handleLikePost(post.postId, likeBtn, likeIcon, likeCount);
        } else if (clickedCount) {
            if (window.InteractionModule) {
                InteractionModule.openReactList(post.postId, 'post', clickedCount.textContent);
            }
        }
    };
    
    // Set initial state
    if (post.isReactedByCurrentUser) {
        likeIcon.classList.add("reacted");
    } else {
        likeIcon.classList.remove("reacted");
    }
    
    likeCount.textContent = post.totalReacts || 0;
    commentCount.textContent = post.totalComments || post.commentCount || 0;
    
    // Lucide icons
    if(window.lucide) lucide.createIcons();

    // Final step for navigation animation (slide in to center)
    if (layout && navigateDirection) {
        // Double RAF ensures the "in" position is applied before we trigger the transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                layout.classList.remove(`nav-slide-in-${navigateDirection}`);
            });
        });
    }
}

// Slider Logic
let currentSlide = 0;
function initDetailSlider(total) {
    const wrapper = document.getElementById("detailSliderWrapper");
    const prev = document.getElementById("detailNavPrev");
    const next = document.getElementById("detailNavNext");
    const dots = document.getElementById("detailSliderDots");
    
    currentSlide = 0;
    wrapper.style.transform = `translateX(0)`;
    dots.innerHTML = "";

    if (total <= 1) {
        prev.style.display = "none";
        next.style.display = "none";
        return;
    }
    
    prev.style.display = "flex";
    next.style.display = "flex";

    // Create dots
    for (let i = 0; i < total; i++) {
        const dot = document.createElement("span");
        dot.className = i === 0 ? "active" : "";
        dot.onclick = () => goToSlide(i);
        dots.appendChild(dot);
    }

    prev.onclick = () => goToSlide((currentSlide - 1 + total) % total);
    next.onclick = () => goToSlide((currentSlide + 1) % total);
}

function goToSlide(index) {
    const wrapper = document.getElementById("detailSliderWrapper");
    const dots = document.getElementById("detailSliderDots").children;
    const total = dots.length;
    
    currentSlide = index;
    wrapper.style.transform = `translateX(-${index * 100}%)`;
    
    Array.from(dots).forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
    });
}

// Like Logic (Reused/Adapted)
async function handleLikePost(postId, btn, iconRef, countEl) {
    // Update icon reference because Lucide replaced the element
    const icon = btn.querySelector('.react-icon') || btn.querySelector('svg') || iconRef;

    // Toggle UI optimistcally
    const isLiked = icon.classList.contains("reacted");
    const currentCount = parseInt(countEl.textContent || "0");
    
    if (isLiked) {
         // Unreacting
         icon.classList.remove("reacted");
         icon.classList.add("unreacting");
         icon.addEventListener("animationend", () => icon.classList.remove("unreacting"), { once: true });
         countEl.textContent = currentCount > 0 ? currentCount - 1 : 0;
    } else {
         // Reacting
         icon.classList.add("reacted");
         icon.classList.remove("unreacting");
         countEl.textContent = currentCount + 1;
    }

    try {
        const res = await apiFetch(`/Posts/${postId}/react`, { method: "POST" });
        if (res.status === 403 || res.status === 400) {
            PostUtils.hidePost(postId);
            if (window.toastInfo) toastInfo("This post is no longer available.");
            return;
        }
        if (!res.ok) throw new Error("React failed");
        // Update with real data if needed
    } catch (err) {
        // Revert
        icon.classList.toggle("reacted");
        // ... revert logic ...
    }
}

// Emoji Logic
async function toggleDetailEmojiPicker(event) {
    if (event) event.stopPropagation();
    const container = document.getElementById("detailEmojiPicker");
    const input = document.getElementById("detailCommentInput");
    
    if (window.EmojiUtils) {
        await EmojiUtils.togglePicker(container, (emoji) => {
            EmojiUtils.insertAtCursor(input, emoji.native);
            autoResizeCommentInput();
        });
    }
}

// Auto-resize comment input
function autoResizeCommentInput() {
    const input = document.getElementById("detailCommentInput");
    if (input) {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    }
}

// Comment focus
function focusCommentInput() {
    document.getElementById("detailCommentInput").focus();
}

// Submit main comment
async function submitComment() {
    const input = document.getElementById("detailCommentInput");
    const btn = document.getElementById("postCommentBtn");
    
    if (!input || !btn || !currentPostId) return;
    
    const content = input.value.trim();
    if (!content) return;
    
    // Disable input during submission
    btn.disabled = true;
    input.disabled = true;
    
    try {
        // Use CommentModule to submit
        const success = await window.CommentModule.submitMainComment(currentPostId, content);
        
        if (success) {
            // Clear input
            input.value = '';
            input.style.height = 'auto';
            btn.disabled = true;
        }
    } finally {
        input.disabled = false;
        btn.disabled = input.value.trim().length === 0;
    }
}

// Setup comment input on modal load
function setupCommentInput() {
    const input = document.getElementById("detailCommentInput");
    const btn = document.getElementById("postCommentBtn");
    
    if (!input || !btn) return;
    
    // Set maxlength
    const maxLength = window.APP_CONFIG?.MAX_COMMENT_INPUT_LENGTH || 500;
    input.setAttribute('maxlength', maxLength);
    
    // Auto-resize on input
    input.oninput = () => {
        btn.disabled = input.value.trim().length === 0;
        autoResizeCommentInput();
    };
    
    // Handle Enter key (Shift+Enter for new line, Enter to submit)
    input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !btn.disabled) {
            e.preventDefault();
            submitComment();
        }
    };
    
    // Handle button click
    btn.onclick = () => {
        submitComment();
    };
}


// Global Exports
window.openPostDetail = openPostDetail;
window.openPostDetailByCode = openPostDetailByCode;
window.closePostDetailModal = closePostDetailModal;
window.toggleDetailEmojiPicker = toggleDetailEmojiPicker;
window.focusCommentInput = focusCommentInput;
window.cancelDiscardComment = cancelDiscardComment;
window.confirmDiscardEdit = confirmDiscardEdit;
window.cancelDiscardEdit = cancelDiscardEdit;

// Initialize click-outside handler when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.EmojiUtils) {
        // Broaden selectors to cover both main post detail and inline replies
        window.EmojiUtils.setupClickOutsideHandler(
            '.detail-emoji-picker, .reply-emoji-picker-container, .edit-emoji-picker-container', 
            '.emoji-trigger'
        );
    }
    
    // Keyboard navigation for post detail modal (Arrow keys)
    document.addEventListener('keydown', (e) => {
        // Only when modal is open and has navigation context
        const modal = document.getElementById(POST_DETAIL_MODAL_ID);
        if (!modal || !modal.classList.contains('show')) return;
        if (!navigationContext || navigationContext.source !== 'profile') return;
        
        // Skip if user is typing in an input/textarea
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateToPost('prev');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateToPost('next');
        }
    });
});

