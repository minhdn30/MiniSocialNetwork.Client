const POST_DETAIL_MODAL_ID = "postDetailModal";
let currentPostId = null;
let currentPostCreatedAt = null;



/* formatFullDateTime moved to shared/post-utils.js */

// Load PostEdit module dynamically
if (!window.PostEdit) {
    const script = document.createElement('script');
    script.src = 'js/post-edit.js';
    document.head.appendChild(script);
}

// Open Modal
async function openPostDetail(postId) {
    currentPostId = postId;
    window.currentPostId = postId; // Ensure global access for CommentModule replies
    
    // 1. Check if modal exists, if not load it
    let modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (!modal) {
        await loadPostDetailHTML();
        modal = document.getElementById(POST_DETAIL_MODAL_ID);
        if (!modal) {
            console.error("Failed to inject modal");
            return;
        }
    }

    resetPostDetailView();
    modal.classList.add("show");
    document.body.style.overflow = "hidden"; // Prevent background scroll

    const mainLoader = document.getElementById("detailMainLoader");
    if (mainLoader) mainLoader.style.display = "flex";

    try {
        console.log(`[PostDetail] Opening post: ${postId}`);
        const res = await API.Posts.getById(postId);
        
        if (res.status === 403) {
            console.warn("[PostDetail] Access denied (403)");
            PostUtils.hidePost(postId);
            return;
        }
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to load post (Status: ${res.status}): ${errorText}`);
        }
        
        const data = await res.json();
        renderPostDetail(data);        
        
        if (mainLoader) mainLoader.style.display = "none";

        // Start loading comments via module
        if (window.CommentModule) {
            CommentModule.loadComments(postId, 1, data.owner.accountId);
        }

        // Join SignalR post group for realtime updates
        if (window.PostHub) {
            await window.PostHub.joinPostGroup(postId);
        }
    } catch (err) {
        if (mainLoader) mainLoader.style.display = "none";
        console.error("[PostDetail] Failed to load post:", err);

        // If Privacy or Deleted/NotFound, hide post
        if (err.message.includes("403") || err.message.includes("404") || err.status === 403) {
            PostUtils.hidePost(postId);
        } else {
            if(window.toastError) toastError("Could not load post details");
            closePostDetailModal();
        }
    }
}

// Dynamic HTML Loader
async function loadPostDetailHTML() {
    try {
        const response = await fetch('pages/post-detail.html');
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

// Actually perform the close action
function performClosePostDetail() {
    // Sync data back to Feed before closing
    if (currentPostId && window.PostUtils && window.PostUtils.syncPostFromDetail) {
        const likeIcon = document.getElementById("detailLikeIcon");
        const likeCount = document.getElementById("detailLikeCount");
        const commentCount = document.getElementById("detailCommentCount");
        const captionText = document.getElementById("detailCaptionText");
        
        if (likeIcon && likeCount && commentCount) {
             const isReacted = likeIcon.classList.contains("reacted");
             const rCount = likeCount.textContent;
             const cCount = commentCount.textContent;
             
             // Get content and privacy from DOM
             const fullContent = captionText?.dataset.fullContent || captionText?.textContent;
             const privacyBadge = document.querySelector("#detailTime .privacy-selector");
             let privacyVal = undefined;
             if (privacyBadge) {
                 const title = privacyBadge.getAttribute("title");
                 if (title === "Public") privacyVal = 0;
                 else if (title.includes("Follower")) privacyVal = 1; // "Followers Only" or "Followers"
                 else if (title === "Private") privacyVal = 2;
             }
             
             window.PostUtils.syncPostFromDetail(currentPostId, rCount, isReacted, cCount, currentPostCreatedAt, fullContent, privacyVal);
        }
    }

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
        document.body.style.overflow = ""; // Restore scroll
        
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

// Reset View
function resetPostDetailView() {
    document.getElementById("detailAvatar").src = APP_CONFIG.DEFAULT_AVATAR;
    document.getElementById("detailUsername").textContent = "";
    document.getElementById("detailSliderWrapper").innerHTML = "";
    document.getElementById("detailSliderWrapper").innerHTML = "";
    
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

    // Reset to View Mode Panel
    const viewPanel = document.getElementById("detailViewPanel");
    const editPanel = document.getElementById("detailEditPanel");
    if (viewPanel) viewPanel.style.display = "flex";
    if (editPanel) editPanel.style.display = "none";
}


// Render Post
function renderPostDetail(post) {
    // 1. Header Info
    const avatar = document.getElementById("detailAvatar");
    const username = document.getElementById("detailUsername");
    const location = document.getElementById("detailLocation"); // Not in API, placeholder

    // Enable Profile Preview
    avatar.classList.add("post-avatar");
    username.classList.add("post-username");
    
    const userInfo = avatar.closest(".user-info");
    if (userInfo) {
        userInfo.classList.add("post-user");
        userInfo.dataset.accountId = post.owner.accountId;
    }

    avatar.src = post.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    username.textContent = PostUtils.truncateName(post.owner.username || post.owner.fullName);
    
    // Update Hrefs for navigation
    const avatarLink = document.getElementById("detailAvatarLink");
    const usernameLink = document.getElementById("detailUsernameLink");
    if (avatarLink) avatarLink.href = `#/profile/${post.owner.username}`;
    if (usernameLink) usernameLink.href = `#/profile/${post.owner.username}`;
    
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
});

