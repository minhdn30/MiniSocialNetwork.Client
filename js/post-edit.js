/**
 * Post Edit Module
 * Handles editing post content and privacy with UI matching create-post-modal.
 */
(function(global) {
    const PostEdit = {
        currentEditingPostId: null,
        selectedPrivacy: 0,
        originalContent: "",
        originalPrivacy: 0,
        hasMedia: false,
        isInitialized: false
    };

    /**
     * Start editing a post
     * @param {string} postId 
     */
    PostEdit.startEditPost = async function(postId) {
        this.currentEditingPostId = postId;
        
        // 1. Ensure post detail modal is open for the post
        const detailModal = document.getElementById("postDetailModal");
        const isOpen = detailModal && detailModal.classList.contains("show");
        const isSamePost = window.currentPostId === postId;

        if (!isOpen || !isSamePost) {
            if (window.openPostDetail) {
                await openPostDetail(postId);
            } else {
                console.error("openPostDetail not found");
                return;
            }
        }

        // 2. Prepare panels
        const viewPanel = document.getElementById("detailViewPanel");
        const editPanel = document.getElementById("detailEditPanel");
        
        if (!viewPanel || !editPanel) {
            console.error("Panels not found in DOM");
            return;
        }

        // 3. Populate user info in Edit Panel
        const avatarUrl = localStorage.getItem("avatarUrl") || APP_CONFIG.DEFAULT_AVATAR;
        const fullname = localStorage.getItem("fullname");
        const username = localStorage.getItem("username");
        const display = username || fullname || "User";
        
        const editAvatar = document.getElementById("edit-user-avatar");
        const editName = document.getElementById("edit-user-name");
        
        if (editAvatar) editAvatar.src = avatarUrl;
        if (editName) {
            editName.textContent = window.PostUtils ? PostUtils.truncateName(display) : display;
        }

        // 4. Get current data for fields
        const captionTextEl = document.getElementById("detailCaptionText");
        const mediaWrapper = document.getElementById("detailSliderWrapper");
        
        this.originalContent = captionTextEl.dataset.fullContent || captionTextEl.textContent || "";
        this.hasMedia = mediaWrapper && mediaWrapper.children.length > 0;
        
        
        // Extract original privacy from detailTime (the badge)
        const privacyBadge = document.querySelector("#detailTime .privacy-selector");
        if (privacyBadge) {
            const title = privacyBadge.getAttribute("title");
            if (title === "Public") this.originalPrivacy = 0;
            else if (title === "Followers") this.originalPrivacy = 1;
            else if (title === "Private") this.originalPrivacy = 2;
        } else {
            this.originalPrivacy = 0; // Default
        }

        this.selectedPrivacy = this.originalPrivacy;
        
        const textarea = document.getElementById("editPostTextarea");
        const maxLimit = window.APP_CONFIG?.MAX_POST_CONTENT_LENGTH || 3000;
        textarea.value = this.originalContent;
        textarea.maxLength = maxLimit;
        
        // Update max limit display
        const maxLimitEl = document.getElementById("editMaxCharCount");
        if (maxLimitEl) maxLimitEl.textContent = maxLimit;
        
        // Setup listeners if not already done
        this.setupListeners();
        
        this.updateCharCount();
        this.selectPrivacy(this.selectedPrivacy);

        // 5. Switch Panels
        viewPanel.style.display = "none";
        editPanel.style.display = "flex";
        
        // UI Resets
        const emojiHeader = document.getElementById("editEmojiHeader");
        if (emojiHeader) emojiHeader.classList.remove("expanded");
        const emojiContainer = document.getElementById("editEmojiPickerContainer");
        if (emojiContainer) {
            emojiContainer.classList.remove("show");
            emojiContainer.innerHTML = "";
        }
        
        // Hide all extra sections
        this.toggleSection('location', false);
        this.toggleSection('people', false);
        this.toggleSection('accessibility', false);
        this.toggleSection('advanced', false);

        // Focus textarea
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        
        // Re-init icons
        if (window.lucide) lucide.createIcons();
    };

    /**
     * Setup Event Listeners
     */
    PostEdit.setupListeners = function() {
        const textarea = document.getElementById("editPostTextarea");
        if (textarea && !textarea.dataset.listenerAttached) {
            textarea.addEventListener("input", () => {
                this.updateCharCount();
            });
            textarea.dataset.listenerAttached = "true";
        }

        // Click outside to close dropdown and emoji picker
        if (!this.isInitialized) {
            document.addEventListener("click", (e) => {
                // Privacy Dropdown
                const dropdown = document.getElementById("editPrivacyDropdown");
                const selector = document.querySelector(".edit-privacy-selector-trigger");
                if (dropdown && dropdown.classList.contains("show")) {
                    if (!dropdown.contains(e.target) && !selector.contains(e.target)) {
                        dropdown.classList.remove("show");
                    }
                }

                // Emoji Picker
                const emojiContainer = document.getElementById("editEmojiPickerContainer");
                const emojiTrigger = document.getElementById("editEmojiHeader");
                if (emojiContainer && emojiContainer.classList.contains("show")) {
                    if (!emojiContainer.contains(e.target) && !emojiTrigger.contains(e.target)) {
                        this.toggleEmojiPicker(); // Close it
                    }
                }
            });
            this.isInitialized = true;
        }
    };

    /**
     * Cancel editing and return to view mode
     */
    PostEdit.cancelEditPost = function() {
        const viewPanel = document.getElementById("detailViewPanel");
        const editPanel = document.getElementById("detailEditPanel");

        if (viewPanel) viewPanel.style.display = "flex";
        if (editPanel) editPanel.style.display = "none";

        // Close emoji picker if open
        const emojiContainer = document.getElementById("editEmojiPickerContainer");
        if (emojiContainer && window.EmojiUtils) {
            EmojiUtils.closePicker(emojiContainer);
        }
        
        // Close privacy dropdown
        const dropdown = document.getElementById("editPrivacyDropdown");
        if (dropdown) dropdown.classList.remove("show");

        this.currentEditingPostId = null;
    };

    /**
     * Save changes via API
     */
    PostEdit.saveEditPost = async function() {
        if (!this.currentEditingPostId) return;

        const textarea = document.getElementById("editPostTextarea");
        const saveBtn = document.getElementById("saveEditPostBtn");
        const content = textarea.value.trim();

        // Validation: Only error if BOTH content and media are missing
        if (content.length === 0 && !this.hasMedia) {
            toastError("Post must have content or media files");
            return;
        }

        if (window.LoadingUtils) LoadingUtils.setButtonLoading(saveBtn, true);

        try {
            const data = {
                content: content,
                privacy: parseInt(this.selectedPrivacy)
            };

            const res = await API.Posts.updateContent(this.currentEditingPostId, data);
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || "Failed to update post");
            }

            const updatedPost = await res.json();
            
            toastSuccess("Post updated successfully");
            
            // Update UI immediately
            this.updateUI(updatedPost);
            
            // Return to view mode
            this.cancelEditPost();

        } catch (err) {
            console.error("Edit post error:", err);
            toastError(err.message || "Something went wrong while updating post");
        } finally {
            if (window.LoadingUtils) LoadingUtils.setButtonLoading(saveBtn, false);
        }
    };

    /**
     * Update UI after successful edit
     */
    PostEdit.updateUI = function(post) {
        const content = post.content;
        const privacy = post.privacy;

        // 1. Update Post Detail Header (Privacy only, keep existing time)
        const timeEl = document.getElementById("detailTime");
        if (timeEl && window.PostUtils) {
            // Get original time from post object or dataset
            const createdAt = post.createdAt || timeEl.dataset.createdAt;
            const privacy = post.privacy;
            
            // Re-render time line
            let timeHTML = "";
            if (createdAt) {
                timeHTML += `${PostUtils.timeAgo(createdAt)} <span>•</span> `;
            }
            
            timeHTML += PostUtils.renderPrivacyBadge(privacy);

            // Add Edited indicator
            if (post.updatedAt) {
                 const editedTime = PostUtils.formatFullDateTime(post.updatedAt);
                 timeHTML += ` <span>•</span> <span class="post-edited-indicator" title="Edited: ${editedTime}">edited</span>`;
            }

            timeEl.innerHTML = timeHTML;
            if (window.lucide) lucide.createIcons();
        }

        // 2. Update Post Detail Caption & Visibility
        const captionItem = document.getElementById("detailCaptionItem");
        const captionText = document.getElementById("detailCaptionText");
        
        if (captionItem && captionText && window.PostUtils) {
            if (!content || content.trim().length === 0) {
                captionItem.style.display = "none";
                captionText.textContent = "";
                delete captionText.dataset.fullContent;
            } else {
                captionItem.style.display = "block";
                PostUtils.setupCaption(captionText, content);
            }
        }
    };

    /**
     * Privacy Selection Logic
     */
    PostEdit.togglePrivacyDropdown = function(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const dropdown = document.getElementById("editPrivacyDropdown");
        dropdown.classList.toggle("show");
    };

    PostEdit.selectPrivacy = function(privacy) {
        this.selectedPrivacy = parseInt(privacy);
        
        const iconEl = document.getElementById("editPrivacyIcon");
        const textEl = document.getElementById("editPrivacyText");
        
        const iconMap = {
            0: { icon: "globe", text: "Public" },
            1: { icon: "users", text: "Followers Only" },
            2: { icon: "lock", text: "Private" }
        };

        const config = iconMap[this.selectedPrivacy];
        if (iconEl && textEl && config) {
            iconEl.setAttribute("data-lucide", config.icon);
            textEl.textContent = config.text;
            if (window.lucide) lucide.createIcons();
        }

        // Update active class in dropdown
        document.querySelectorAll("#editPrivacyDropdown .privacy-option").forEach(opt => {
            const p = parseInt(opt.dataset.privacy);
            opt.classList.toggle("active", p === this.selectedPrivacy);
        });

        // Close dropdown
        const dropdown = document.getElementById("editPrivacyDropdown");
        if (dropdown) dropdown.classList.remove("show");
    };

    /**
     * Emoji Picker Logic
     */
    PostEdit.toggleEmojiPicker = async function(event) {
        if (event) event.stopPropagation();
        
        const container = document.getElementById("editEmojiPickerContainer");
        if (!container) return;

        const header = document.getElementById("editEmojiHeader");
        const textarea = document.getElementById("editPostTextarea");
        
        // Check if currently showing
        const isShowing = container.classList.contains("show");
        
        if (isShowing) {
            if (window.EmojiUtils) {
                EmojiUtils.closePicker(container);
            } else {
                container.classList.remove("show");
                container.innerHTML = "";
            }
            if (header) header.classList.remove("expanded");
        } else {
            // Opening
            if (window.EmojiUtils) {
                await EmojiUtils.togglePicker(container, (emoji) => {
                    EmojiUtils.insertAtCursor(textarea, emoji.native);
                    this.updateCharCount();
                });
                if (header) header.classList.add("expanded");
            } else {
                console.error("EmojiUtils not found");
            }
        }
    };

    /**
     * Section Toggling (Location etc)
     */
    PostEdit.toggleSection = function(sectionId, forceState) {
        const content = document.getElementById(`edit${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Content`);
        const header = document.getElementById(`edit${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}Header`);
        
        if (!content) return;
        
        const isCurrentlyExpanded = content.style.display === "block";
        const targetState = forceState !== undefined ? forceState : !isCurrentlyExpanded;
        
        if (targetState) {
            content.style.display = "block";
            header?.classList.add("expanded");
        } else {
            content.style.display = "none";
            header?.classList.remove("expanded");
        }
    };

    /**
     * Textarea Helpers
     */
    PostEdit.updateCharCount = function() {
        const textarea = document.getElementById("editPostTextarea");
        const charCount = document.getElementById("editCharCount");
        const maxLimit = window.APP_CONFIG?.MAX_POST_CONTENT_LENGTH || 3000;
        
        if (textarea && charCount) {
            const count = textarea.value.length;
            charCount.textContent = count;
            
            if (count >= maxLimit) {
                charCount.style.color = "var(--danger-alt)";
            } else {
                charCount.style.color = "var(--text-disabled)";
            }
            
            const saveBtn = document.getElementById("saveEditPostBtn");
            if (saveBtn) {
                const isEmpty = count === 0;
                const isOverLimit = count > maxLimit;
                // Only disable if (empty AND no media) OR over limit
                saveBtn.disabled = (isEmpty && !this.hasMedia) || isOverLimit;
            }
        }
    };

    PostEdit.hasChanges = function() {
        if (!this.currentEditingPostId) return false;
        const textarea = document.getElementById("editPostTextarea");
        const currentContent = textarea ? textarea.value : "";
        
        return currentContent !== this.originalContent || this.selectedPrivacy !== this.originalPrivacy;
    };

    // Global Exposure
    global.PostEdit = PostEdit;

    // Helper functions for HTML onclick
    global.toggleEditPrivacyDropdown = (e) => PostEdit.togglePrivacyDropdown(e);
    global.selectEditPrivacy = (p) => PostEdit.selectPrivacy(p);
    global.toggleEditPostEmojiPicker = (e) => PostEdit.toggleEmojiPicker(e);
    global.cancelEditPost = () => PostEdit.cancelEditPost();
    global.saveEditPost = () => PostEdit.saveEditPost();
    global.toggleEditSection = (s) => PostEdit.toggleSection(s);

})(window);
