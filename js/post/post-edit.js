/**
 * Post Edit Module
 * Handles editing post content and privacy with UI matching create-post-modal.
 */
(function(global) {
    const epGetPostTagMaxCount = () => window.APP_CONFIG?.MAX_POST_TAGS || 20;
    const epGetPostTagSearchLimit = () =>
        window.APP_CONFIG?.POST_TAG_SEARCH_LIMIT || 10;
    const epGetPostTagSearchDebounceMs = () =>
        window.APP_CONFIG?.POST_TAG_SEARCH_DEBOUNCE_MS || 300;
    const epGetDefaultAvatar = () =>
        window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";

    const epEscapeHtml = (text) =>
        String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const epEscapeHtmlAttr = (text) => epEscapeHtml(text).replace(/`/g, "&#96;");

    const PostEdit = {
        currentEditingPostId: null,
        selectedPrivacy: 0,
        originalContent: "",
        originalPrivacy: 0,
        hasMedia: false,
        isInitialized: false,
        tagSelectedAccounts: [],
        originalTagAccountIds: [],
        tagSearchResults: [],
        tagSearchDebounceTimer: null,
        tagSearchRequestSequence: 0,
        tagActiveResultIndex: -1,
        tagEventsBound: false
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
        this.ensurePostTagBindings();
        this.resetPostTagPicker();
        this.seedPostTagPicker(this.getInitialPostTagAccounts());
        
        this.updateCharCount();
        this.selectPrivacy(this.selectedPrivacy);

        // 5. Switch Panels
        viewPanel.style.display = "none";
        editPanel.style.display = "flex";
        
        // UI Resets
        const emojiContainer = document.getElementById("editEmojiPickerContainer");
        const emojiBtn = document.getElementById("editPostEmojiBtn");
        if (emojiContainer) {
            emojiContainer.classList.remove("show");
            emojiContainer.innerHTML = "";
        }
        if (emojiBtn) emojiBtn.setAttribute("aria-expanded", "false");
        
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
                    if (!dropdown.contains(e.target) && !(selector && selector.contains(e.target))) {
                        dropdown.classList.remove("show");
                    }
                }

                // Emoji Picker
                const emojiContainer = document.getElementById("editEmojiPickerContainer");
                const emojiTrigger = document.getElementById("editPostEmojiBtn");
                if (emojiContainer && emojiContainer.classList.contains("show")) {
                    if (
                        !emojiContainer.contains(e.target) &&
                        !(emojiTrigger && emojiTrigger.contains(e.target))
                    ) {
                        this.toggleEmojiPicker(); // Close it
                    }
                }

                // Post Tag Search Results
                const isInsideTagPicker = e.target.closest("#editPostTagPicker");
                if (!isInsideTagPicker) {
                    this.hidePostTagResults();
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
        const emojiBtn = document.getElementById("editPostEmojiBtn");
        if (emojiContainer && window.EmojiUtils) {
            EmojiUtils.closePicker(emojiContainer);
        }
        if (emojiBtn) emojiBtn.setAttribute("aria-expanded", "false");
        
        // Close privacy dropdown
        const dropdown = document.getElementById("editPrivacyDropdown");
        if (dropdown) dropdown.classList.remove("show");

        this.resetPostTagPicker();
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
            const currentTagAccountIds = this.getSelectedPostTagAccountIds();
            const originalTagAccountIds = Array.from(
                new Set((this.originalTagAccountIds || []).filter(Boolean)),
            );
            const addNewTagIds = currentTagAccountIds.filter(
                (id) => !originalTagAccountIds.includes(id),
            );
            const removeTagIds = originalTagAccountIds.filter(
                (id) => !currentTagAccountIds.includes(id),
            );

            const data = {
                content: content,
                privacy: parseInt(this.selectedPrivacy)
            };
            if (addNewTagIds.length > 0) {
                data.addNewTagIds = addNewTagIds;
            }
            if (removeTagIds.length > 0) {
                data.removeTagIds = removeTagIds;
            }

            const res = await API.Posts.updateContent(this.currentEditingPostId, data);
            
            if (!res.ok) {
                let errorMessage = "Failed to update post";
                try {
                    const errorData = await res.json();
                    errorMessage = errorData?.message || errorData?.title || errorMessage;
                } catch (_) {}
                throw new Error(errorMessage);
            }

            const updatedPost = await res.json();
            
            toastSuccess("Post updated successfully");
            
            // Update UI immediately
            this.updateUI(updatedPost);

            this.originalTagAccountIds = currentTagAccountIds;
            if (window.currentPostDetailData) {
                window.currentPostDetailData.taggedAccounts = this.tagSelectedAccounts.map(
                    (account) => ({
                        accountId: account.accountId,
                        username: account.username || "",
                        fullName: account.fullName || "",
                        avatarUrl: account.avatarUrl || "",
                    }),
                );
            }
            
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

        if (this.selectedPrivacy === 2 && this.tagSelectedAccounts.length > 0) {
            if (window.toastWarning) {
                toastWarning("Private posts cannot include tagged people.");
            }
        }
        
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

        const input = document.getElementById("editPostTagSearchInput");
        if (input && document.activeElement === input) {
            this.schedulePostTagSearch((input.value || "").trim(), { immediate: true });
        }
    };

    /**
     * Emoji Picker Logic
     */
    PostEdit.toggleEmojiPicker = async function(event) {
        if (event) event.stopPropagation();
        
        const container = document.getElementById("editEmojiPickerContainer");
        if (!container) return;

        const triggerBtn = document.getElementById("editPostEmojiBtn");
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
            if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "false");
        } else {
            // Opening
            if (window.EmojiUtils) {
                await EmojiUtils.togglePicker(container, (emoji) => {
                    EmojiUtils.insertAtCursor(textarea, emoji.native);
                    this.updateCharCount();
                });
                if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "true");
            } else {
                console.error("EmojiUtils not found");
            }
        }
    };

    /**
     * Post Tag Picker (Edit Post)
     */
    PostEdit.ensurePostTagBindings = function() {
        if (this.tagEventsBound) return;

        const input = document.getElementById("editPostTagSearchInput");
        const results = document.getElementById("editPostTagSearchResults");
        const chips = document.getElementById("editPostTagSelectedChips");
        if (!input || !results || !chips) return;

        input.addEventListener("input", () => {
            const keyword = (input.value || "").trim();
            this.schedulePostTagSearch(keyword);
        });

        input.addEventListener("focus", () => {
            if (input.disabled) return;
            const keyword = (input.value || "").trim();
            if (keyword.length < 1) {
                this.hidePostTagResults();
                return;
            }
            this.schedulePostTagSearch(keyword, { immediate: true });
        });

        input.addEventListener("keydown", (event) => {
            const resultsEl = document.getElementById("editPostTagSearchResults");
            const isVisible =
                resultsEl &&
                resultsEl.style.display !== "none" &&
                this.tagSearchResults.length > 0;

            if (event.key === "Escape") {
                if (resultsEl && resultsEl.style.display !== "none") {
                    event.preventDefault();
                    this.hidePostTagResults();
                }
                return;
            }

            if (!isVisible) return;

            if (event.key === "ArrowDown") {
                event.preventDefault();
                if (this.tagActiveResultIndex < 0) {
                    this.tagActiveResultIndex = 0;
                } else {
                    this.tagActiveResultIndex = Math.max(0, this.tagActiveResultIndex - 1);
                }
                this.renderPostTagResults();
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                if (this.tagActiveResultIndex < 0) {
                    this.tagActiveResultIndex = 0;
                } else {
                    this.tagActiveResultIndex = Math.min(
                        this.tagSearchResults.length - 1,
                        this.tagActiveResultIndex + 1,
                    );
                }
                this.renderPostTagResults();
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                this.selectPostTagAccount(this.tagActiveResultIndex);
            }
        });

        results.addEventListener("click", (event) => {
            const item = event.target.closest(".post-tag-result-item");
            if (!item || !results.contains(item)) return;
            event.preventDefault();
            this.selectPostTagAccount(Number(item.dataset.index || -1));
        });

        chips.addEventListener("click", (event) => {
            const removeBtn = event.target.closest(".post-tag-chip-remove");
            if (!removeBtn || !chips.contains(removeBtn)) return;
            event.preventDefault();
            this.removePostTagAccount(removeBtn.dataset.accountId || "");
        });

        this.tagEventsBound = true;
        this.updatePostTagCounter();
        this.refreshPostTagInputState();
    };

    PostEdit.schedulePostTagSearch = function(keyword, { immediate = false } = {}) {
        if (this.tagSearchDebounceTimer) {
            clearTimeout(this.tagSearchDebounceTimer);
            this.tagSearchDebounceTimer = null;
        }

        const normalizedKeyword = (keyword || "").trim();
        if (normalizedKeyword.length < 1) {
            this.tagSearchRequestSequence++;
            this.tagSearchResults = [];
            this.hidePostTagResults();
            return;
        }

        const delay = immediate ? 0 : epGetPostTagSearchDebounceMs();
        this.tagSearchDebounceTimer = setTimeout(() => {
            this.searchPostTagAccounts(normalizedKeyword);
        }, delay);
    };

    PostEdit.searchPostTagAccounts = async function(keyword) {
        const normalizedKeyword = (keyword || "").trim();
        if (normalizedKeyword.length < 1) {
            this.hidePostTagResults();
            return;
        }

        if (!window.API?.Accounts?.searchPostTagAccounts) {
            this.renderPostTagEmptyState("Search is unavailable");
            return;
        }

        if (this.tagSelectedAccounts.length >= epGetPostTagMaxCount()) {
            this.hidePostTagResults();
            return;
        }

        const requestSequence = ++this.tagSearchRequestSequence;
        this.renderPostTagLoading();

        try {
            const excludeAccountIds = this.tagSelectedAccounts.map(
                (account) => account.accountId,
            );

            const res = await window.API.Accounts.searchPostTagAccounts(
                normalizedKeyword,
                epGetPostTagSearchLimit(),
                excludeAccountIds,
                this.selectedPrivacy,
            );

            if (requestSequence !== this.tagSearchRequestSequence) return;

            if (!res.ok) {
                let message = "Failed to load users";
                try {
                    const errorData = await res.json();
                    message = errorData?.message || errorData?.title || message;
                } catch (_) {}
                this.renderPostTagEmptyState(message);
                return;
            }

            const data = await res.json();
            if (requestSequence !== this.tagSearchRequestSequence) return;

            const rawAccounts = Array.isArray(data)
                ? data
                : Array.isArray(data?.items)
                    ? data.items
                    : [];

            this.tagSearchResults = rawAccounts
                .map((raw) => this.normalizePostTagAccount(raw))
                .filter((account) => account && account.accountId)
                .filter(
                    (account) =>
                        !this.tagSelectedAccounts.some(
                            (selected) => selected.accountId === account.accountId,
                        ),
                );

            this.tagActiveResultIndex = this.tagSearchResults.length > 0 ? 0 : -1;
            this.renderPostTagResults(normalizedKeyword);
        } catch (error) {
            if (requestSequence !== this.tagSearchRequestSequence) return;
            console.error("Failed to search edit-post tag accounts:", error);
            this.renderPostTagEmptyState("Could not connect to server");
        }
    };

    PostEdit.normalizePostTagAccount = function(raw) {
        if (!raw || typeof raw !== "object") return null;

        const accountId = raw.accountId || raw.AccountId || "";
        if (!accountId) return null;

        return {
            accountId,
            username: raw.username || raw.userName || raw.Username || raw.UserName || "",
            fullName: raw.fullName || raw.FullName || "",
            avatarUrl: raw.avatarUrl || raw.AvatarUrl || raw.avatar || raw.Avatar || "",
        };
    };

    PostEdit.renderPostTagLoading = function() {
        const container = document.getElementById("editPostTagSearchResults");
        if (!container) return;

        container.innerHTML = `
            <div class="post-tag-skeleton-item"></div>
            <div class="post-tag-skeleton-item"></div>
            <div class="post-tag-skeleton-item"></div>
        `;
        container.style.display = "flex";
    };

    PostEdit.renderPostTagEmptyState = function(message) {
        const container = document.getElementById("editPostTagSearchResults");
        if (!container) return;

        container.innerHTML = `<div class="post-tag-empty-state">${epEscapeHtml(message || "No results")}</div>`;
        container.style.display = "flex";
    };

    PostEdit.renderPostTagResults = function(keyword = "") {
        const container = document.getElementById("editPostTagSearchResults");
        if (!container) return;

        if (!this.tagSearchResults.length) {
            this.renderPostTagEmptyState(
                keyword ? "No matching users found" : "No users available for tagging",
            );
            return;
        }

        const defaultAvatar = epEscapeHtmlAttr(epGetDefaultAvatar());
        container.innerHTML = this.tagSearchResults
            .map((account, index) => {
                const username = account.username || "unknown";
                const displayName = account.fullName || account.username || "Unknown user";
                const avatarUrl = account.avatarUrl || epGetDefaultAvatar();

                return `
                    <button
                        type="button"
                        class="post-tag-result-item ${index === this.tagActiveResultIndex ? "active" : ""}"
                        data-index="${index}"
                    >
                        <img src="${epEscapeHtmlAttr(avatarUrl)}" alt="" onerror="this.src='${defaultAvatar}'" />
                        <div class="post-tag-result-info">
                            <span class="post-tag-result-username">${epEscapeHtml(username)}</span>
                            <span class="post-tag-result-name">${epEscapeHtml(displayName)}</span>
                        </div>
                    </button>
                `;
            })
            .join("");

        container.style.display = "flex";
    };

    PostEdit.selectPostTagAccount = function(index) {
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this.tagSearchResults.length
        ) {
            return;
        }

        const account = this.tagSearchResults[index];
        this.addPostTagAccount(account);
    };

    PostEdit.addPostTagAccount = function(account) {
        if (!account || !account.accountId) return;

        if (
            this.tagSelectedAccounts.some(
                (selected) => selected.accountId === account.accountId,
            )
        ) {
            return;
        }

        if (this.tagSelectedAccounts.length >= epGetPostTagMaxCount()) {
            if (window.toastWarning) {
                window.toastWarning(
                    `You can tag up to ${epGetPostTagMaxCount()} people in one post`,
                );
            }
            return;
        }

        this.tagSelectedAccounts.push(account);
        this.renderPostTagChips();
        this.updatePostTagCounter();
        this.refreshPostTagInputState();

        const input = document.getElementById("editPostTagSearchInput");
        if (input) {
            input.value = "";
            input.focus();
        }

        this.schedulePostTagSearch("", { immediate: true });
    };

    PostEdit.removePostTagAccount = function(accountId) {
        if (!accountId) return;

        const next = this.tagSelectedAccounts.filter(
            (account) => account.accountId !== accountId,
        );

        if (next.length === this.tagSelectedAccounts.length) return;

        this.tagSelectedAccounts = next;
        this.renderPostTagChips();
        this.updatePostTagCounter();
        this.refreshPostTagInputState();

        const input = document.getElementById("editPostTagSearchInput");
        if (input && document.activeElement === input) {
            this.schedulePostTagSearch((input.value || "").trim(), { immediate: true });
        }
    };

    PostEdit.renderPostTagChips = function() {
        const container = document.getElementById("editPostTagSelectedChips");
        if (!container) return;

        if (this.tagSelectedAccounts.length === 0) {
            container.classList.add("hidden");
            container.innerHTML = "";
            return;
        }

        container.classList.remove("hidden");
        container.innerHTML = this.tagSelectedAccounts
            .map((account) => {
                const chipText = account.username
                    ? account.username
                    : account.fullName || "Unknown user";
                const avatarUrl = account.avatarUrl || epGetDefaultAvatar();

                return `
                    <div class="post-tag-chip">
                        <img src="${epEscapeHtmlAttr(avatarUrl)}" alt="" onerror="this.src='${epEscapeHtmlAttr(epGetDefaultAvatar())}'" />
                        <span class="post-tag-chip-text">${epEscapeHtml(chipText)}</span>
                        <button
                            type="button"
                            class="post-tag-chip-remove"
                            data-account-id="${epEscapeHtmlAttr(account.accountId)}"
                            aria-label="Remove tag"
                        >
                            &times;
                        </button>
                    </div>
                `;
            })
            .join("");
    };

    PostEdit.hidePostTagResults = function() {
        const container = document.getElementById("editPostTagSearchResults");
        if (!container) return;
        container.style.display = "none";
        container.innerHTML = "";
        this.tagActiveResultIndex = -1;
    };

    PostEdit.updatePostTagCounter = function() {
        const countEl = document.getElementById("editPostTagSelectedCount");
        const selectedCount = this.tagSelectedAccounts.length;

        if (countEl) countEl.textContent = `${selectedCount} selected`;
    };

    PostEdit.refreshPostTagInputState = function() {
        const input = document.getElementById("editPostTagSearchInput");
        if (!input) return;

        if (!input.dataset.defaultPlaceholder) {
            input.dataset.defaultPlaceholder = input.placeholder || "Search users...";
        }

        const isAtLimit = this.tagSelectedAccounts.length >= epGetPostTagMaxCount();
        input.disabled = isAtLimit;
        input.placeholder = isAtLimit
            ? "Tag limit reached"
            : input.dataset.defaultPlaceholder;

        if (isAtLimit) {
            this.hidePostTagResults();
        }
    };

    PostEdit.resetPostTagPicker = function() {
        this.tagSelectedAccounts = [];
        this.originalTagAccountIds = [];
        this.tagSearchResults = [];
        this.tagActiveResultIndex = -1;
        this.tagSearchRequestSequence++;

        if (this.tagSearchDebounceTimer) {
            clearTimeout(this.tagSearchDebounceTimer);
            this.tagSearchDebounceTimer = null;
        }

        const input = document.getElementById("editPostTagSearchInput");
        if (input) {
            input.value = "";
            input.disabled = false;
            if (input.dataset.defaultPlaceholder) {
                input.placeholder = input.dataset.defaultPlaceholder;
            }
        }

        this.renderPostTagChips();
        this.updatePostTagCounter();
        this.hidePostTagResults();
        this.refreshPostTagInputState();
    };

    PostEdit.getInitialPostTagAccounts = function() {
        const rawTaggedAccounts = Array.isArray(window.currentPostDetailData?.taggedAccounts)
            ? window.currentPostDetailData.taggedAccounts
            : [];

        return rawTaggedAccounts
            .map((raw) => this.normalizePostTagAccount(raw))
            .filter((account) => account && account.accountId)
            .slice(0, epGetPostTagMaxCount());
    };

    PostEdit.seedPostTagPicker = function(accounts) {
        const normalizedAccounts = Array.isArray(accounts)
            ? accounts
                .map((raw) => this.normalizePostTagAccount(raw))
                .filter((account) => account && account.accountId)
            : [];

        this.tagSelectedAccounts = normalizedAccounts;
        this.originalTagAccountIds = normalizedAccounts
            .map((account) => account.accountId)
            .filter(Boolean);

        this.renderPostTagChips();
        this.updatePostTagCounter();
        this.hidePostTagResults();
        this.refreshPostTagInputState();
    };

    PostEdit.getSelectedPostTagAccountIds = function() {
        return Array.from(
            new Set(
                this.tagSelectedAccounts
                    .map((account) => account.accountId)
                    .filter(Boolean),
            ),
        );
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
        if (currentContent !== this.originalContent || this.selectedPrivacy !== this.originalPrivacy) {
            return true;
        }

        const currentTagIds = this.getSelectedPostTagAccountIds();
        const originalTagIds = Array.from(
            new Set((this.originalTagAccountIds || []).filter(Boolean)),
        );
        if (currentTagIds.length !== originalTagIds.length) {
            return true;
        }

        return currentTagIds.some((id) => !originalTagIds.includes(id));
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
