/**
 * follow-list.js
 * Handles displaying followers and following lists
 */

const FollowListModule = (function () {
  const FollowRouteHelper = window.RouteHelper;
  let currentPage = 1;
  let targetId = null;
  let listType = "followers"; // 'followers' or 'following'
  let isRouteBound = false;
  let hasNextPage = false;
  let isLoading = false;
  let searchKeyword = "";
  let sortState = null; // null: default, false: DESC, true: ASC
  const PAGE_SIZE = window.APP_CONFIG?.FOLLOW_LIST_PAGE_SIZE || 15;

  function flT(key, params = {}, fallback = "") {
    if (window.I18n?.t) {
      return window.I18n.t(key, params, fallback);
    }
    return fallback;
  }

  function getSearchPlaceholderText() {
    return flT(
      "follow.list.search.placeholder",
      {},
      "Search by full name or username...",
    );
  }

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

  function isOwnerFollowersList() {
    return listType === "followers" && isCurrentViewerAccount(targetId);
  }

  const MODAL_ID = "followListModal";

  function normalizeListType(type) {
    const normalized = (type || "").toString().trim().toLowerCase();
    if (normalized === "sent-requests" || normalized === "sentrequests") {
      return "sent-requests";
    }
    if (FollowRouteHelper?.normalizeProfileFollowListType) {
      return FollowRouteHelper.normalizeProfileFollowListType(normalized);
    }
    if (normalized === "following") return "following";
    if (normalized === "followers" || normalized === "follower") {
      return "followers";
    }
    return "";
  }

  function getListTitle(type) {
    switch (normalizeListType(type)) {
      case "following":
        return flT("follow.list.title.following", {}, "Following");
      case "sent-requests":
        return flT("follow.list.title.sentRequests", {}, "Pending Requests");
      case "followers":
      default:
        return flT("follow.list.title.followers", {}, "Followers");
    }
  }

  function getEmptyMessage(type) {
    switch (normalizeListType(type)) {
      case "following":
        return flT("follow.list.empty.following", {}, "Not following anyone yet");
      case "sent-requests":
        return flT(
          "follow.list.empty.sentRequests",
          {},
          "No pending requests",
        );
      case "followers":
      default:
        return flT("follow.list.empty.followers", {}, "No followers yet");
    }
  }

  function getPermissionDeniedMessage(type = listType) {
    if (normalizeListType(type) === "sent-requests") {
      return flT(
        "follow.list.errors.pendingPermission",
        {},
        "You do not have permission to view pending requests right now",
      );
    }
    return flT(
      "follow.list.errors.privateCurrentList",
      {},
      "This account is private or you don't have permission to view this list",
    );
  }

  function getLoadItemsFailedMessage(type = listType) {
    if (normalizeListType(type) === "sent-requests") {
      return flT(
        "follow.list.errors.pendingLoad",
        {},
        "Couldn't load pending requests",
      );
    }
    return flT("follow.list.errors.loadItems", {}, "Couldn't load items");
  }

  function getLoadListFailedMessage() {
    return flT("follow.list.errors.loadList", {}, "Couldn't load list");
  }

  function getAccountNotFoundMessage() {
    return flT("follow.list.errors.accountNotFound", {}, "Account not found");
  }

  function getRemoveFollowerFailedMessage() {
    return flT(
      "follow.list.errors.removeFollowerNow",
      {},
      "Can't remove this follower right now",
    );
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

    if (listType === "followers") {
      return await API.Follows.getFollowers(accountId, request);
    }

    if (listType === "following") {
      return await API.Follows.getFollowing(accountId, request);
    }

    return await API.Follows.getSentRequests(request);
  }

  /**
   * Open the followers or following list
   * @param {string} accountId - User ID
   * @param {string} type - 'followers' or 'following'
   */
  async function openFollowList(accountId, type = "followers", options = {}) {
    const normalizedType = normalizeListType(type) || "followers";
    const syncRoute = options.syncRoute !== false && normalizedType !== "sent-requests";
    const routeReplace = options.routeReplace === true;
    const profileUsername = (options.profileUsername || getCurrentProfileUsername())
      .toString()
      .trim();
    const initialData = options.initialData || null;

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
            toastError(getPermissionDeniedMessage(normalizedType));
          }
          redirectToProfileRoot(true);
          return;
        }
      }
    }

    targetId = accountId;
    listType = normalizedType;
    isRouteBound = options.routeBound === true;
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
        titleEl.textContent = getListTitle(normalizedType);
      }

      if (initialData && typeof initialData === "object") {
        _handleDataResponse(initialData, false);
      } else {
        await _loadData(1);
      }
    } catch (error) {
      console.error(error);
      if (window.toastError) toastError(getLoadListFailedMessage());
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
    if (searchInput) {
      searchInput.value = "";
      searchInput.placeholder = getSearchPlaceholderText();
    }
    if (sortBtn) {
      sortBtn.className = "sort-toggle-btn";
      sortBtn.innerHTML = '<i data-lucide="arrow-up-down"></i>';
    }
    if (window.lucide) lucide.createIcons();
  }

  async function _loadData(page, append = false) {
    if (isLoading) return;

    const loader = document.getElementById("followListLoader");

    isLoading = true;
    if (loader) loader.style.display = "flex";

    try {
      const res = await _fetchPage(targetId, page, searchKeyword, sortState);

      if (res.status === 403) {
        if (window.toastError) {
          toastError(getPermissionDeniedMessage(listType));
        }
        closeFollowList();
        if (listType !== "sent-requests") {
          redirectToProfileRoot(true);
        }
        return;
      }
      if (res.status === 404) {
        if (window.toastError) {
          toastError(
            listType === "sent-requests"
              ? getLoadItemsFailedMessage("sent-requests")
              : getAccountNotFoundMessage(),
          );
        }
        closeFollowList();
        if (listType !== "sent-requests") {
          redirectToNotFound(true);
        }
        return;
      }
      if (!res.ok) throw new Error("Load failed");

      const data = await res.json();
      _handleDataResponse(data, append);
    } catch (error) {
      console.error(error);
      if (loader) loader.style.display = "none";
      if (window.toastError) toastError(getLoadItemsFailedMessage(listType));
    } finally {
      isLoading = false;
      // Loader visibility is handled by _handleDataResponse or error catch
    }
  }

  function _handleDataResponse(data, append) {
    const container = document.getElementById("followListItems");
    if (!append) container.innerHTML = "";

    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.Items)
        ? data.Items
        : [];
    _renderItems(items, container);

    currentPage = Number(data?.page ?? data?.Page ?? 1);
    hasNextPage = Boolean(data?.hasNextPage ?? data?.HasNextPage);

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
      emptyMsg.textContent = getEmptyMessage(listType);
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
                        <span>${flT("chat.header.viewProfile", {}, "View Profile")}</span>
                    </button>`;
      } else if (isOwnerFollowersList()) {
        actionBtnHtml = `
                    <button class="follow-btn danger" onclick="FollowListModule.confirmRemoveFollower('${item.accountId}', this)">
                        <i data-lucide="user-minus"></i>
                        <span>${flT("common.buttons.remove", {}, "Remove")}</span>
                    </button>`;
      } else {
        if (item.isFollowing) {
          actionBtnHtml = `
                        <button class="follow-btn following" onclick="FollowListModule.handleFollow('${item.accountId}', this)">
                            <i data-lucide="check"></i>
                            <span>${flT("common.buttons.following", {}, "Following")}</span>
                        </button>`;
        } else if (item.isFollowRequested) {
          const requestActionHandler =
            listType === "sent-requests"
              ? "FollowListModule.handleSentRequest"
              : "FollowListModule.handleFollow";
          actionBtnHtml = `
                        <button class="follow-btn requested" onclick="${requestActionHandler}('${item.accountId}', this)">
                            <i data-lucide="clock-3"></i>
                            <span>${flT("common.buttons.requestSent", {}, "Request sent")}</span>
                        </button>`;
        } else {
          actionBtnHtml = `
                        <button class="follow-btn" onclick="FollowListModule.handleFollow('${item.accountId}', this)">
                            <i data-lucide="user-plus"></i>
                            <span>${flT("common.buttons.follow", {}, "Follow")}</span>
                        </button>`;
        }
      }

      row.innerHTML = `
                <div class="user-info post-user" data-account-id="${item.accountId}" onclick="viewProfile('${item.username}')">
                    <img src="${avatarUrl}" class="avatar post-avatar" />
                    <div class="name-box">
                        <span class="fullname post-username">${PostUtils.truncateName(item.username)}</span>
                        <span class="username-subtext">${item.fullName || ""}</span>
                        ${
                          item.isFollower && !isOwnerFollowersList()
                            ? `<span class="follower-tag">${flT(
                                "follow.list.labels.followsYou",
                                {},
                                "Follows you",
                              )}</span>`
                            : ""
                        }
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

  async function reconcileFollowersListAfterRemoval() {
    const listContainer = document.getElementById("followListItems");
    if (!listContainer) return;

    if (listContainer.querySelector(".follow-list-item")) {
      return;
    }

    const existingEmpty = listContainer.querySelector(".empty-list-msg");
    if (existingEmpty) {
      existingEmpty.remove();
    }

    if (hasNextPage) {
      currentPage = 1;
      await _loadData(1, false);
      return;
    }

    if (!listContainer.querySelector(".empty-list-msg")) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-list-msg";
      emptyMsg.textContent = getEmptyMessage(listType);
      listContainer.appendChild(emptyMsg);
    }
  }

  async function removeFollowerRow(accountId) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    const normalizedAccountId = normalizeAccountId(accountId);
    const row = Array.from(modal.querySelectorAll(".user-info[data-account-id]"))
      .find(
        (element) =>
          normalizeAccountId(element.dataset.accountId) === normalizedAccountId,
      )
      ?.closest(".follow-list-item");
    if (!row) return;

    row.style.opacity = "0";
    row.style.transform = "translateY(-6px)";
    row.style.pointerEvents = "none";

    await new Promise((resolve) => setTimeout(resolve, 180));
    row.remove();
    await reconcileFollowersListAfterRemoval();
  }

  async function removeFollower(accountId, btn) {
    const safeAccountId = normalizeAccountId(accountId);
    if (!safeAccountId || !window.API?.Follows?.removeFollower) return null;

    if (btn) btn.disabled = true;

    try {
      const res = await API.Follows.removeFollower(accountId);
      if (!res.ok) {
        if (window.toastError) {
          toastError(getRemoveFollowerFailedMessage());
        }
        return null;
      }

      await removeFollowerRow(accountId);
      if (window.toastSuccess) {
        toastSuccess(
          flT("profile.follow.followerRemoved", {}, "Follower removed"),
        );
      }
      return { removed: true, silent: false };
    } catch (error) {
      console.error(error);
      if (window.toastError) {
        toastError(getRemoveFollowerFailedMessage());
      }
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function confirmRemoveFollower(accountId, btn) {
    if (!window.FollowModule?.showRemoveFollowerConfirm) return;

    await window.FollowModule.showRemoveFollowerConfirm(accountId, btn, {
      onResolved: () => {},
      execute: () => removeFollower(accountId, btn),
    });
  }

  async function handleSentRequest(accountId, btn) {
    if (!window.FollowModule) return;

    await FollowModule.showUnfollowConfirm(accountId, btn, {
      onResolved: (relation) => {
        if (!relation || relation.isRequested) return;
        currentPage = 1;
        _loadData(1, false);
      },
    });
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
    isRouteBound = false;
  }

  function closeFollowListFromUI() {
    const shouldRedirect = isRouteBound;
    closeFollowList();
    if (shouldRedirect) {
      redirectToProfileRoot(false);
    }
  }

  async function openSentFollowRequestList(accountId, options = {}) {
    const safeAccountId = (accountId || "").toString().trim();
    if (!safeAccountId) return;

    try {
      const res = await API.Follows.getSentRequests({
        page: 1,
        pageSize: PAGE_SIZE,
        keyword: "",
        sortByCreatedASC: null,
      });

      if (res.status === 401) {
        if (window.toastError) {
          toastError(
            flT(
              "common.auth.sessionExpired",
              {},
              "Your session has expired, please sign in again",
            ),
          );
        }
        return;
      }

      if (!res.ok) {
        if (window.toastError) {
          toastError(getLoadItemsFailedMessage("sent-requests"));
        }
        return;
      }

      const data = await res.json();
      const totalItems = Number(data?.totalItems ?? data?.TotalItems ?? 0);
      if (!Number.isFinite(totalItems) || totalItems <= 0) {
        if (window.toastInfo) {
          toastInfo(
            flT(
              "follow.list.toast.noPendingRequests",
              {},
              "You don't have any pending follow requests right now.",
            ),
          );
        }
        return;
      }

      await openFollowList(accountId, "sent-requests", {
        syncRoute: false,
        routeBound: false,
        profileUsername: options.profileUsername,
        initialData: data,
      });
    } catch (error) {
      console.error(error);
      if (window.toastError) {
        toastError(getLoadItemsFailedMessage("sent-requests"));
      }
    }
  }

  async function _loadModalHTML() {
    const html = `
            <div id="${MODAL_ID}" class="interaction-modal follow-list-modal">
                <div class="modal-backdrop" onclick="FollowListModule.closeFollowListFromUI()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                    <h3><span>${getListTitle("followers")}</span></h3>
                        <button class="close-btn" onclick="FollowListModule.closeFollowListFromUI()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="modal-search-bar">
                        <div class="search-input-wrapper">
                            <i data-lucide="search" class="search-icon"></i>
                            <input type="text" id="followSearchInput" placeholder="${getSearchPlaceholderText()}" autocomplete="off">
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

  if (window.I18n?.onChange) {
    window.I18n.onChange(() => {
      const modal = document.getElementById(MODAL_ID);
      if (!modal) return;

      const titleEl = modal.querySelector(".modal-header h3 span");
      if (titleEl) {
        titleEl.textContent = getListTitle(listType);
      }

      const searchInput = document.getElementById("followSearchInput");
      if (searchInput) {
        searchInput.placeholder = getSearchPlaceholderText();
      }

      if (modal.classList.contains("show") && !isLoading) {
        currentPage = 1;
        _loadData(1, false);
      }
    });
  }

  return {
    openFollowList,
    closeFollowList,
    closeFollowListFromUI,
    openSentFollowRequestList,
    toggleSort: _toggleSort,
    handleFollow,
    handleSentRequest,
    confirmRemoveFollower,
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
          toastError(getPermissionDeniedMessage(listType));
        closeFollowList();
        redirectToProfileRoot(true);
      }
    },
  };
})();

window.FollowListModule = FollowListModule;

