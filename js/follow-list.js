/**
 * follow-list.js
 * Handles displaying followers and following lists
 */

const FollowListModule = (function () {
    let currentPage = 1;
    let targetId = null;
    let listType = 'followers'; // 'followers' or 'following'
    let hasNextPage = false;
    let isLoading = false;
    let searchKeyword = "";
    let sortState = null; // null: default, false: DESC, true: ASC
    const PAGE_SIZE = window.APP_CONFIG?.FOLLOW_LIST_PAGE_SIZE || 15;

    const MODAL_ID = "followListModal";

    async function _fetchPage(accountId, page, keyword = "", sort = null) {
        const request = {
            keyword: keyword,
            sortByCreatedASC: sort,
            page: page,
            pageSize: PAGE_SIZE
        };

        return listType === 'followers'
            ? await API.Follows.getFollowers(accountId, request)
            : await API.Follows.getFollowing(accountId, request);
    }

    /**
     * Open the followers or following list
     * @param {string} accountId - User ID
     * @param {string} type - 'followers' or 'following'
     */
    async function openFollowList(accountId, type = 'followers') {
        targetId = accountId;
        listType = type;
        currentPage = 1;
        searchKeyword = "";
        sortState = null;

        try {
            // Ensure modal exists
            let modal = document.getElementById(MODAL_ID);
            if (!modal) {
                await _loadModalHTML();
                modal = document.getElementById(MODAL_ID);
            }

            // Reset UI
            _resetUI();
            
            // Show modal
            modal.classList.add("show");
            document.body.style.overflow = "hidden";

            // Update title
            const titleEl = modal.querySelector(".modal-header h3 span");
            if (titleEl) titleEl.textContent = type.charAt(0).toUpperCase() + type.slice(1);

            // Initial load
            await _loadData(1);

        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Could not load list");
        }
    }

    function _resetUI() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;

        const listContainer = document.getElementById("followListItems");
        const searchInput = document.getElementById("followSearchInput");
        const sortBtn = document.getElementById("followSortBtn");

        if (listContainer) listContainer.innerHTML = "";
        if (searchInput) searchInput.value = "";
        if (sortBtn) {
            sortBtn.className = "sort-toggle-btn";
            sortBtn.innerHTML = '<i data-lucide="arrow-up-down"></i>';
            sortBtn.title = "Sort by latest";
        }
        if (window.lucide) lucide.createIcons();
    }

    async function _loadData(page, append = false) {
        if (isLoading) return;
        
        const loader = document.getElementById("followListLoader");
        const listContainer = document.getElementById("followListItems");

        isLoading = true;
        if (loader) loader.style.display = "flex";

        try {
            const res = await _fetchPage(targetId, page, searchKeyword, sortState);
            
            if (res.status === 403) {
                 if (window.toastError) toastError("This account is private or you don't have permission to view this list");
                 closeFollowList();
                 return;
            }
            if (res.status === 404) {
                 if (window.toastError) toastError("Account not found");
                 closeFollowList();
                 return;
            }
            if (!res.ok) throw new Error("Load failed");

            const data = await res.json();
            _handleDataResponse(data, append);
        } catch (error) {
            console.error(error);
            if (window.toastError) toastError("Failed to load items");
        } finally {
            isLoading = false;
            // Loader visibility is handled by _handleDataResponse or error catch
        }
    }

    function _handleDataResponse(data, append) {
        const container = document.getElementById("followListItems");
        if (!append) container.innerHTML = "";

        _renderItems(data.items, container);

        currentPage = data.page;
        hasNextPage = data.hasNextPage;

        const loader = document.getElementById("followListLoader");
        if (loader) {
            // Keep loader at the bottom of items list
            container.appendChild(loader);
            loader.style.display = hasNextPage ? "flex" : "none";
        }
    }

    function _renderItems(items, container) {
        if (items.length === 0 && currentPage === 1) {
            const emptyMsg = document.createElement("div");
            emptyMsg.className = "empty-list-msg";
            emptyMsg.textContent = `No ${listType} found`;
            container.appendChild(emptyMsg);
            return;
        }

        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "interaction-item follow-list-item";
            
            const avatarUrl = item.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
            
            let actionBtnHtml = "";
            if (item.accountId === APP_CONFIG.CURRENT_USER_ID) {
                actionBtnHtml = `
                    <button class="follow-btn view-profile-btn" onclick="viewProfile('${item.username}')">
                        <i data-lucide="user"></i>
                        <span>View Profile</span>
                    </button>`;
            } else {
                if (item.isFollowing) {
                    actionBtnHtml = `
                        <button class="follow-btn following" onclick="FollowListModule.handleFollow('${item.accountId}', this)">
                            <i data-lucide="check"></i>
                            <span>Following</span>
                        </button>`;
                } else {
                    actionBtnHtml = `
                        <button class="follow-btn" onclick="FollowListModule.handleFollow('${item.accountId}', this)">
                            <i data-lucide="user-plus"></i>
                            <span>Follow</span>
                        </button>`;
                }
            }

            row.innerHTML = `
                <div class="user-info post-user" data-account-id="${item.accountId}" onclick="viewProfile('${item.username}')">
                    <img src="${avatarUrl}" class="avatar post-avatar" />
                    <div class="name-box">
                        <span class="fullname post-username" title="${item.fullName}">${PostUtils.truncateName(item.username)}</span>
                        <span class="username-subtext">${item.fullName || ''}</span>
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

    async function handleFollow(accountId, btn) {
         if (!window.FollowModule) return;
         const isFollowing = btn.classList.contains("following");
         
         if (isFollowing) {
             FollowModule.showUnfollowConfirm(accountId, btn);
         } else {
             await FollowModule.followUser(accountId, btn);
         }
    }

    let searchTimeout = null;
    function _onSearchInput(e) {
        const value = e.target.value.trim();
        searchKeyword = value;
        currentPage = 1;

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            _loadData(1, false);
        }, 400);
    }

    function _toggleSort() {
        // Cycle: null -> true (ASC/Oldest) -> false (DESC/Newest) -> null
        if (sortState === null) {
            sortState = true; // 1st click: Oldest
        } else if (sortState === true) {
            sortState = false; // 2nd click: Newest
        } else {
            sortState = null; // 3rd click: Default
        }

        const sortBtn = document.getElementById("followSortBtn");
        if (sortBtn) {
            if (sortState === null) {
                sortBtn.className = "sort-toggle-btn";
                sortBtn.innerHTML = '<i data-lucide="arrow-up-down"></i>';
                sortBtn.title = "Default sort. Click for Oldest first";
            } else if (sortState === true) {
                sortBtn.className = "sort-toggle-btn active";
                sortBtn.innerHTML = '<i data-lucide="arrow-up-narrow-wide"></i>';
                sortBtn.title = "Currently: Oldest first. Click for Newest first";
            } else {
                sortBtn.className = "sort-toggle-btn active";
                sortBtn.innerHTML = '<i data-lucide="arrow-down-narrow-wide"></i>';
                sortBtn.title = "Currently: Newest first. Click for Default sort";
            }
            if (window.lucide) lucide.createIcons();
        }
        currentPage = 1;
        _loadData(1, false);
    }

    function closeFollowList() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.remove("show");
            document.body.style.overflow = "";
        }
    }

    async function _loadModalHTML() {
        const html = `
            <div id="${MODAL_ID}" class="interaction-modal follow-list-modal">
                <div class="modal-backdrop" onclick="FollowListModule.closeFollowList()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                    <h3><span>Followers</span></h3>
                        <button class="close-btn" onclick="FollowListModule.closeFollowList()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="modal-search-bar">
                        <div class="search-input-wrapper">
                            <i data-lucide="search" class="search-icon"></i>
                            <input type="text" id="followSearchInput" placeholder="Search by name or username..." autocomplete="off">
                        </div>
                        <button id="followSortBtn" class="sort-toggle-btn" title="Sort by latest" onclick="FollowListModule.toggleSort()">
                            <i data-lucide="arrow-up-down"></i>
                        </button>
                    </div>
                    <div id="followListItems" class="interaction-list custom-scrollbar">
                    </div>
                    <div id="followListLoader" class="interaction-loader" style="display: none;">
                        <div class="loader-spinner"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", html);
        if (window.lucide) lucide.createIcons();

        document.getElementById("followSearchInput").oninput = _onSearchInput;
        
        const listContainer = document.getElementById("followListItems");
        listContainer.onscroll = () => {
            if (isLoading || !hasNextPage) return;
            const scrollPos = listContainer.scrollTop + listContainer.clientHeight;
            if (scrollPos >= listContainer.scrollHeight - 50) {
                _loadData(currentPage + 1, true);
            }
        };
    }

    return {
        openFollowList,
        closeFollowList,
        toggleSort: _toggleSort,
        handleFollow
    };
})();

window.FollowListModule = FollowListModule;
