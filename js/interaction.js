/**
 * Interaction Module
 * Handles displaying list of people who reacted to posts or comments
 */

const InteractionModule = (function () {
    let currentPage = 1;
    let targetId = null;
    let targetType = 'post'; // 'post' or 'comment'
    let hasNextPage = false;
    let isLoading = false;
    const PAGE_SIZE = window.APP_CONFIG?.INTERACTIONS_PAGE_SIZE || 10;

    const MODAL_ID = "interactionModal";

    /**
     * Open the react list modal
     * @param {string} id - PostId or CommentId
     * @param {string} type - 'post' or 'comment'
     */
    async function openReactList(id, type = 'post') {
        targetId = id;
        targetType = type;
        currentPage = 1;

        // 1. Ensure modal exists
        let modal = document.getElementById(MODAL_ID);
        if (!modal) {
            await loadModalHTML();
            modal = document.getElementById(MODAL_ID);
        }

        // 2. Show modal and reset list
        modal.classList.add("show");
        document.body.style.overflow = "hidden";
        
        const listContainer = document.getElementById("interactionList");
        listContainer.innerHTML = "";
        
        // 3. Initial load
        await loadReacts(targetId, 1);
    }

    /**
     * Load follows from API
     */
    async function loadReacts(id, page = 1) {
        if (isLoading) return;
        
        const listContainer = document.getElementById("interactionList");
        const loader = document.getElementById("interactionLoader");
        const totalText = document.getElementById("interactionTotalCount");

        isLoading = true;
        if (loader) loader.style.display = "flex";

        try {
            const apiPath = targetType === 'comment' 
                ? `/Comments/${id}/reacts` 
                : `/Posts/${id}/reacts`;

            const res = await apiFetch(`${apiPath}?page=${page}&pageSize=${PAGE_SIZE}`);
            if (!res.ok) throw new Error("Failed to load reacts");

            const data = await res.json();
            
            // Render total at the top
            if (totalText) totalText.textContent = data.totalItems || 0;

            renderReactList(data.items, listContainer);

            currentPage = data.page;
            hasNextPage = data.hasNextPage;

            // Move loader to bottom of the list for next load or hide it
            if (loader) listContainer.appendChild(loader);

            // AUTO LOAD NEXT PAGE if container not full enough to scroll
            if (hasNextPage) {
                checkNeedsMoreReacts(id);
            }

        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Could not load reaction list");
        } finally {
            isLoading = false;
            if (loader && !hasNextPage) loader.style.display = "none";
        }
    }

    /**
     * Helper to ensure scrollbar appears if there's more content
     */
    function checkNeedsMoreReacts(id) {
        const listContainer = document.getElementById("interactionList");
        if (!listContainer) return;

        // Short timeout to let DOM render
        setTimeout(() => {
            if (!hasNextPage || isLoading) return;
            
            // If the content is shorter than the scroll area, load more
            if (listContainer.scrollHeight <= listContainer.clientHeight + 20) {
                loadReacts(id, currentPage + 1);
            }
        }, 150);
    }

    /**
     * Render the list items
     */
    function renderReactList(items, container) {
        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "interaction-item";
            
            const avatarUrl = item.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
            const fullName = item.fullName || item.username;
            
            // Determine button state
            let actionBtnHtml = "";
            if (item.accountId === APP_CONFIG.CURRENT_USER_ID) {
                // It's me!
                actionBtnHtml = `<button class="follow-btn view-profile-btn" onclick="viewProfile('${item.accountId}')"><span>View Profile</span></button>`;
            } else {
                if (item.isFollowing) {
                    actionBtnHtml = `<button class="follow-btn following" onclick="InteractionModule.handleFollow('${item.accountId}', this)"><span>Following</span></button>`;
                } else {
                    actionBtnHtml = `<button class="follow-btn" onclick="InteractionModule.handleFollow('${item.accountId}', this)"><span>Follow</span></button>`;
                }
            }

            row.innerHTML = `
                <div class="user-info post-user" data-account-id="${item.accountId}">
                    <img src="${avatarUrl}" class="avatar post-avatar" />
                    <div class="name-box">
                        <span class="fullname post-username" title="${fullName}">${PostUtils.truncateName(fullName)}</span>
                        ${item.isFollower ? '<span class="follower-tag">Follows you</span>' : ''}
                    </div>
                </div>
                <div class="action-box">
                    ${actionBtnHtml}
                </div>
            `;
            container.appendChild(row);
        });

        // Refresh icons and profile preview
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Infinite scroll setup
     */
    function setupScrollListener() {
        const listContainer = document.getElementById("interactionList");
        if (!listContainer) return;

        listContainer.onscroll = () => {
            if (isLoading || !hasNextPage) return;

            const scrollPos = listContainer.scrollTop + listContainer.clientHeight;
            const threshold = listContainer.scrollHeight - 30;

            if (scrollPos >= threshold) {
                loadReacts(targetId, currentPage + 1);
            }
        };
    }

    /**
     * Handle follow/unfollow from within the list
     */
    async function handleFollow(accountId, btn) {
        const isFollowing = btn.classList.contains("following");
        
        if (isFollowing) {
            showUnfollowConfirm(accountId, btn);
            return;
        }

        performFollowAction(accountId, btn, false);
    }

    /**
     * Show unfollow confirmation popup (same style as profile preview)
     */
    function showUnfollowConfirm(accountId, btn) {
        const overlay = document.createElement("div");
        overlay.className = "unfollow-overlay";
        overlay.style.zIndex = "31000"; // Ensure top of everything

        const popup = document.createElement("div");
        popup.className = "unfollow-popup";

        popup.innerHTML = `
            <div class="unfollow-content">
                <h3>Unfollow this account?</h3>
                <p>You can always follow them again later.</p>
            </div>
            <div class="unfollow-actions">
                <button class="unfollow-btn unfollow-confirm" id="confirmUnfollowBtn">Unfollow</button>
                <button class="unfollow-btn unfollow-cancel" id="cancelUnfollowBtn">Cancel</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // Animation
        setTimeout(() => overlay.classList.add("show"), 10);

        // Actions
        document.getElementById("confirmUnfollowBtn").onclick = () => {
            performFollowAction(accountId, btn, true);
            closeConfirmPopup(overlay);
        };

        document.getElementById("cancelUnfollowBtn").onclick = () => {
            closeConfirmPopup(overlay);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) closeConfirmPopup(overlay);
        };
    }

    function closeConfirmPopup(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 300);
    }

    /**
     * Perform the actual API call
     */
    async function performFollowAction(accountId, btn, wasFollowing) {
        if (btn.disabled) return;
        btn.disabled = true;

        try {
            const res = await apiFetch(`/Accounts/follow/${accountId}`, { method: 'POST' });
            if (!res.ok) throw new Error("Action failed");

            const span = btn.querySelector("span");
            // Toggle UI
            if (wasFollowing) {
                btn.classList.remove("following");
                if (span) span.textContent = "Follow";
            } else {
                btn.classList.add("following");
                if (span) span.textContent = "Following";
            }
        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Failed to update follow status");
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * Sync the latest count from modal back to underlying newsfeed/detail UI
     */
    function syncCountToUI() {
        if (!targetId) return;
        
        const countText = document.getElementById("interactionTotalCount")?.textContent;
        const newCount = parseInt(countText) || 0;
        
        if (targetType === 'post') {
            // 1. Update in post detail
            const detailLikeCount = document.getElementById("detailLikeCount");
            if (detailLikeCount && window.currentPostId === targetId) {
                detailLikeCount.textContent = newCount;
            }

            // 2. Update in newsfeed
            const feedPost = document.querySelector(`.post[data-post-id="${targetId}"]`);
            if (feedPost) {
                const countEl = feedPost.querySelector(".react-btn .count");
                if (countEl) countEl.textContent = newCount;
            }
        } else if (targetType === 'comment') {
            // Update in comment list
            const commentItem = document.querySelector(`.comment-item[data-comment-id="${targetId}"], .reply-item[data-comment-id="${targetId}"]`);
            if (commentItem) {
                const countEl = commentItem.querySelector(".react-count");
                if (countEl) {
                    countEl.textContent = newCount > 0 ? newCount : "";
                }
            }
        }
    }

    /**
     * Close Modal
     */
    function closeReactList() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            // SYNC before closing (to capture any updates that happened while open)
            syncCountToUI();
            
            modal.classList.remove("show");
            document.body.style.overflow = "";
            targetId = null; // Reset
        }
    }

    /**
     * Load Modal HTML
     */
    async function loadModalHTML() {
        const html = `
            <div id="${MODAL_ID}" class="interaction-modal">
                <div class="modal-backdrop" onclick="InteractionModule.closeReactList()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Reactions (<span id="interactionTotalCount">0</span>)</h3>
                        <button class="close-btn" onclick="InteractionModule.closeReactList()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div id="interactionList" class="interaction-list custom-scrollbar">
                        <!-- Items injected here -->
                    </div>
                    <div id="interactionLoader" class="interaction-loader" style="display: none;">
                        <div class="loader-spinner"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", html);
        if (window.lucide) lucide.createIcons();
        
        // Setup listener once HTML is injected
        setupScrollListener();
    }

    return {
        openReactList,
        closeReactList,
        handleFollow
    };
})();

window.InteractionModule = InteractionModule;
