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
     * Private helper to fetch data from API
     */
    async function _fetchPage(id, page) {
        const res = targetType === 'comment' 
            ? await API.Comments.getReacts(id, page, PAGE_SIZE)
            : await API.Posts.getReacts(id, page, PAGE_SIZE);

        if (res.status === 403) {
            PostUtils.hidePost(window.currentPostId || id);
            throw new Error("FORBIDDEN");
        }

        if (!res.ok) throw new Error("Failed to load reacts");

        return await res.json();
    }

    /**
     * Open the react list modal
     * @param {string} id - PostId or CommentId
     * @param {string} type - 'post' or 'comment'
     */
    async function openReactList(id, type = 'post') {
        targetId = id;
        targetType = type;
        currentPage = 1;

        try {
            // 1. First fetch to verify and get initial data (Optimized: reuse this data)
            const data = await _fetchPage(id, 1);
            
            if (!data.totalItems || data.totalItems === 0) {
                if (window.toastInfo) toastInfo("No one has reacted yet");
                return;
            }

            // 2. Ensure modal exists
            let modal = document.getElementById(MODAL_ID);
            if (!modal) {
                await loadModalHTML();
                modal = document.getElementById(MODAL_ID);
            }

            // 3. Show modal and reset list
            modal.classList.add("show");
            document.body.style.overflow = "hidden";
            
            const listContainer = document.getElementById("interactionList");
            const totalText = document.getElementById("interactionTotalCount");
            
            listContainer.innerHTML = "";
            if (totalText) totalText.textContent = data.totalItems;

            // 4. Handle rendering first page and state update
            _handleDataResponse(data, listContainer);

            // Sync back to UI in case FE count was out of sync
            syncCountToUI();

        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Could not load reaction list");
        }
    }

    /**
     * Load more reacts for infinite scroll
     */
    async function loadReacts(id, page = 1) {
        if (isLoading) return;
        
        const listContainer = document.getElementById("interactionList");
        const loader = document.getElementById("interactionLoader");

        isLoading = true;
        if (loader) loader.style.display = "flex";

        try {
            const data = await _fetchPage(id, page);
            _handleDataResponse(data, listContainer);
        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Could not load more reacts");
        } finally {
            isLoading = false;
        }
    }

    /**
     * Process data response, update state, and handle loader UI
     */
    function _handleDataResponse(data, container) {
        renderReactList(data.items, container);

        currentPage = data.page;
        hasNextPage = data.hasNextPage;

        const loader = document.getElementById("interactionLoader");
        if (loader) {
            // Keep loader at the bottom
            container.appendChild(loader);
            loader.style.display = hasNextPage ? "flex" : "none";
        }

        if (hasNextPage) {
            checkNeedsMoreReacts(targetId);
        }
    }

    /**
     * Helper to ensure scrollbar appears if there's more content
     */
    function checkNeedsMoreReacts(id) {
        const listContainer = document.getElementById("interactionList");
        if (!listContainer) return;

        setTimeout(() => {
            if (!hasNextPage || isLoading) return;
            
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
            
            let actionBtnHtml = "";
            if (item.accountId === APP_CONFIG.CURRENT_USER_ID) {
                actionBtnHtml = `<button class="follow-btn view-profile-btn" onclick="viewProfile('${item.accountId}')"><span>View Profile</span></button>`;
            } else {
                if (item.isFollowing) {
                    actionBtnHtml = `<button class="follow-btn following" onclick="InteractionModule.handleFollow('${item.accountId}', this)"><span>Following</span></button>`;
                } else {
                    actionBtnHtml = `<button class="follow-btn" onclick="InteractionModule.handleFollow('${item.accountId}', this)"><span>Follow</span></button>`;
                }
            }

            row.innerHTML = `
                <div class="user-info post-user" data-account-id="${item.accountId}" onclick="viewProfile('${item.accountId}')">
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
     * Show unfollow confirmation popup
     */
    function showUnfollowConfirm(accountId, btn) {
        const overlay = document.createElement("div");
        overlay.className = "unfollow-overlay";
        overlay.style.zIndex = "31000";

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

        setTimeout(() => overlay.classList.add("show"), 10);

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
     * Perform the actual API call for follow/unfollow status
     */
    async function performFollowAction(accountId, btn, wasFollowing) {
        if (!window.FollowModule) {
            if (window.toastError) toastError("Follow module not loaded.");
            return;
        }

        if (wasFollowing) {
            await FollowModule.unfollowUser(accountId, btn);
        } else {
            await FollowModule.followUser(accountId, btn);
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
            const detailLikeCount = document.getElementById("detailLikeCount");
            if (detailLikeCount && window.currentPostId === targetId) {
                detailLikeCount.textContent = newCount;
            }

            const feedPost = document.querySelector(`.post[data-post-id="${targetId}"]`);
            if (feedPost) {
                const countEl = feedPost.querySelector(".react-btn .count");
                if (countEl) countEl.textContent = newCount;
            }
        } else if (targetType === 'comment') {
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
            syncCountToUI();
            
            modal.classList.remove("show");
            document.body.style.overflow = "";
            targetId = null;
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
                    </div>
                    <div id="interactionLoader" class="interaction-loader" style="display: none;">
                        <div class="loader-spinner"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", html);
        if (window.lucide) lucide.createIcons();
        
        setupScrollListener();
    }

    return {
        openReactList,
        closeReactList,
        handleFollow
    };
})();

window.InteractionModule = InteractionModule;
