/**
 * follow-list.js
 * Handles displaying followers and following lists
 */

const FollowListModule = (function () {
  const FollowRouteHelper = window.RouteHelper;
  let currentPage = 1;
  let targetId = null;
  let listType = "followers"; // 'followers' or 'following'
  let hasNextPage = false;
  let isLoading = false;
  let searchKeyword = "";
  let sortState = null; // null: default, false: DESC, true: ASC
  const PAGE_SIZE = window.APP_CONFIG?.FOLLOW_LIST_PAGE_SIZE || 15;

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function isCurrentViewerAccount(accountId) {
    const targetId = normalizeAccountId(accountId);
    if (!targetId) return false;
    const currentId = normalizeAccountId(
      APP_CONFIG.CURRENT_USER_ID || localStorage.getItem("accountId"),
    );
    return !!currentId && targetId === currentId;
  }

  const MODAL_ID = "followListModal";

  function normalizeListType(type) {
    if (FollowRouteHelper?.normalizeProfileFollowListType) {
      return FollowRouteHelper.normalizeProfileFollowListType(type);
    }
    const normalized = (type || "").toString().trim().toLowerCase();
    if (normalized === "following") return "following";
    if (normalized === "followers" || normalized === "follower") {
      return "followers";
    }
    return "";
  }

  function getCurrentProfileUsername() {
    const profileData = window.ProfilePage?.getData?.();
    const accountInfo =
      profileData?.accountInfo || profileData?.AccountInfo || profileData?.account || profileData?.Account || {};
    const fromData = (accountInfo.username || accountInfo.Username || "")
      .toString()
      .trim();
    if (fromData) return fromData;

    const currentPath = FollowRouteHelper?.parseHash
      ? FollowRouteHelper.parseHash(window.location.hash || "").path
      : "";
    if (currentPath) {
      const segments = currentPath.split("/").filter(Boolean);
      const firstSegment = (segments[0] || "").toString().trim();
      if (
        firstSegment &&
        FollowRouteHelper?.isValidProfileTarget?.(firstSegment) &&
        !FollowRouteHelper?.isReservedProfileRootSegment?.(firstSegment)
      ) {
        return FollowRouteHelper.safeDecode
          ? FollowRouteHelper.safeDecode(firstSegment)
          : firstSegment;
      }
    }

    return (localStorage.getItem("username") || "").toString().trim();
  }

  function buildProfileHash(username) {
    if (FollowRouteHelper?.buildProfileHash) {
      return FollowRouteHelper.buildProfileHash(username || "");
    }
    const safe = (username || "").toString().trim();
    if (!safe) return "#/";
    return `#/${encodeURIComponent(safe)}`;
  }

  function buildFollowRouteHash(username, type) {
    const normalizedType = normalizeListType(type);
    if (!normalizedType) return buildProfileHash(username);

    if (FollowRouteHelper?.buildProfileFollowListHash) {
      return FollowRouteHelper.buildProfileFollowListHash(username || "", normalizedType);
    }

    const safe = (username || "").toString().trim();
    if (!safe) return buildProfileHash("");
    return `#/${encodeURIComponent(safe)}/${normalizedType}`;
  }

  function goToHash(hash, replace = false) {
    const normalizedHash = (hash || "").toString().trim();
    if (!normalizedHash) return;

    if (FollowRouteHelper?.goTo) {
      const parsed = FollowRouteHelper.parseHash(normalizedHash);
      FollowRouteHelper.goTo(parsed.path, { query: parsed.params, replace });
      return;
    }

    if (replace && window.history?.replaceState) {
      const base = `${window.location.pathname || ""}${window.location.search || ""}`;
      window.history.replaceState(window.history.state, "", `${base}${normalizedHash}`);
      return;
    }
    window.location.hash = normalizedHash;
  }

  function redirectToProfileRoot(replace = true) {
    const username = getCurrentProfileUsername();
    const profileHash = buildProfileHash(username);
    goToHash(profileHash, replace);
  }

  function redirectToNotFound(replace = true) {
    if (window.RouteHelper?.goTo) {
      const notFoundPath = window.RouteHelper.PATHS?.ERROR_404 || "/404";
      window.RouteHelper.goTo(notFoundPath, { replace });
      return;
    }
    goToHash("#/404", replace);
  }

  async function _fetchPage(accountId, page, keyword = "", sort = null) {
    const request = {
      keyword: keyword,
      sortByCreatedASC: sort,
      page: page,
      pageSize: PAGE_SIZE,
    };

    return listType === "followers"
      ? await API.Follows.getFollowers(accountId, request)
      : await API.Follows.getFollowing(accountId, request);
  }

  /**
   * Open the followers or following list
   * @param {string} accountId - User ID
   * @param {string} type - 'followers' or 'following'
   */
  async function openFollowList(accountId, type = "followers", options = {}) {
    const normalizedType = normalizeListType(type) || "followers";
    const syncRoute = options.syncRoute !== false;
    const routeReplace = options.routeReplace === true;
    const profileUsername = (options.profileUsername || getCurrentProfileUsername())
      .toString()
      .trim();

    if (syncRoute && profileUsername) {
      const followHash = buildFollowRouteHash(profileUsername, normalizedType);
      if ((window.location.hash || "") !== followHash) {
        goToHash(followHash, routeReplace);
        return;
      }
    }

    // Pre-check permission from currently loaded profile data to avoid flicker
    if (window.ProfilePage && window.ProfilePage.getAccountId() === accountId) {
      const data = window.ProfilePage.getData();
      if (data && !data.isCurrentUser) {
        const settings = data.settings;
        const isFollowed = data.followInfo?.isFollowedByCurrentUser ?? false;
        const privacy =
          normalizedType === "followers"
            ? settings?.followerPrivacy
            : settings?.followingPrivacy;

        let hasPermission = true;
        if (privacy === 2) {
          hasPermission = false;
        } else if (privacy === 1 && !isFollowed) {
          hasPermission = false;
        }

        if (!hasPermission) {
          if (window.toastError) {
            toastError(
              `This account is private or you don't have permission to view this ${normalizedType} list`,
            );
          }
          redirectToProfileRoot(true);
          return;
        }
      }
    }

    targetId = accountId;
    listType = normalizedType;
    currentPage = 1;
    searchKeyword = "";
    sortState = null;

    try {
      let modal = document.getElementById(MODAL_ID);
      if (!modal) {
        await _loadModalHTML();
        modal = document.getElementById(MODAL_ID);
      }

      _resetUI();

      modal.classList.add("show");
      if (window.lockScroll) lockScroll();

      const titleEl = modal.querySelector(".modal-header h3 span");
      if (titleEl) {
        titleEl.textContent =
          normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
      }

      await _loadData(1);
    } catch (error) {
      console.error(error);
      if (window.toastError) toastError("Could not load list");
      if (window.unlockScroll) unlockScroll();
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
        if (window.toastError)
          toastError(
            "This account is private or you don't have permission to view this list",
          );
        closeFollowList();
        redirectToProfileRoot(true);
        return;
      }
      if (res.status === 404) {
        if (window.toastError) toastError("Account not found");
        closeFollowList();
        redirectToNotFound(true);
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

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "interaction-item follow-list-item";

      const avatarUrl = item.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;

      let actionBtnHtml = "";
      if (isCurrentViewerAccount(item.accountId)) {
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
        } else if (item.isFollowRequested) {
          actionBtnHtml = `
                        <button class="follow-btn requested" onclick="FollowListModule.handleFollow('${item.accountId}', this)">
                            <i data-lucide="clock-3"></i>
                            <span>Request Sent</span>
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
                        <span class="fullname post-username">${PostUtils.truncateName(item.username)}</span>
                        <span class="username-subtext">${item.fullName || ""}</span>
                        ${item.isFollower ? '<span class="follower-tag">Follows you</span>' : ""}
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
    const isRequested = btn.classList.contains("requested");

    if (isFollowing || isRequested) {
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
      } else if (sortState === true) {
        sortBtn.className = "sort-toggle-btn active";
        sortBtn.innerHTML = '<i data-lucide="arrow-up-narrow-wide"></i>';
      } else {
        sortBtn.className = "sort-toggle-btn active";
        sortBtn.innerHTML = '<i data-lucide="arrow-down-narrow-wide"></i>';
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
      if (window.unlockScroll) unlockScroll();
    }
  }

  function closeFollowListFromUI() {
    closeFollowList();
    redirectToProfileRoot(false);
  }

  async function _loadModalHTML() {
    const html = `
            <div id="${MODAL_ID}" class="interaction-modal follow-list-modal">
                <div class="modal-backdrop" onclick="FollowListModule.closeFollowListFromUI()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                    <h3><span>Followers</span></h3>
                        <button class="close-btn" onclick="FollowListModule.closeFollowListFromUI()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="modal-search-bar">
                        <div class="search-input-wrapper">
                            <i data-lucide="search" class="search-icon"></i>
                            <input type="text" id="followSearchInput" placeholder="Search by name or username..." autocomplete="off">
                        </div>
                        <button id="followSortBtn" class="sort-toggle-btn" onclick="FollowListModule.toggleSort()">
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
    closeFollowListFromUI,
    toggleSort: _toggleSort,
    handleFollow,
    getCurrentTargetId: () => targetId,
    getCurrentListType: () => listType,
    isModalOpen: () => {
      const modal = document.getElementById(MODAL_ID);
      return modal && modal.classList.contains("show");
    },
    checkPermission: function (accountId, settings) {
      if (!this.isModalOpen() || targetId !== accountId) return;

      const myId = localStorage.getItem("accountId");
      if (accountId === myId) return; // Always keep open for owner

      const privacy =
        listType === "followers"
          ? settings.followerPrivacy
          : settings.followingPrivacy;

      // 0: Public, 1: FollowOnly, 2: Private
      let hasPermission = true;
      if (privacy === 2) {
        hasPermission = false;
      } else if (privacy === 1) {
        // Check if current user is following the owner
        const profileData = window.ProfilePage
          ? window.ProfilePage.getData()
          : null;
        const isFollowed =
          profileData?.followInfo?.isFollowedByCurrentUser ?? false;
        if (!isFollowed) hasPermission = false;
      }

      if (!hasPermission) {
        if (window.toastError)
          toastError(
            `Permission changed. You can no longer view this ${listType} list.`,
          );
        closeFollowList();
        redirectToProfileRoot(true);
      }
    },
  };
})();

window.FollowListModule = FollowListModule;

