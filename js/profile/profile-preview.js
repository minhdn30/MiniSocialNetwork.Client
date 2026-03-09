let previewEl;
let hoverTimer;
let hideTimer;
let followRelation = { isFollowing: false, isRequested: false };
let currentUserId = null;
let lastMouseEvent = null;
let currentAccountId = null;
let profilePreviewPresenceUnsubscribe = null;
let currentPreviewData = null;
let profilePreviewLanguageBound = false;

function ppT(key, params = {}, fallback = "") {
  if (window.I18n?.t) {
    return window.I18n.t(key, params, fallback || key);
  }
  return fallback || key;
}

function normalizePresenceId(value) {
  if (
    window.PresenceUI &&
    typeof window.PresenceUI.normalizeAccountId === "function"
  ) {
    return window.PresenceUI.normalizeAccountId(value);
  }
  return (value || "").toString().trim().toLowerCase();
}

function resolvePresenceStatus(accountId) {
  if (
    window.PresenceUI &&
    typeof window.PresenceUI.resolveStatusByAccountId === "function"
  ) {
    return window.PresenceUI.resolveStatusByAccountId(accountId, false);
  }
  const normalizedAccountId = normalizePresenceId(accountId);
  if (
    !normalizedAccountId ||
    !window.PresenceStore ||
    typeof window.PresenceStore.resolveStatus !== "function"
  ) {
    return { showDot: false };
  }

  return window.PresenceStore.resolveStatus({
    accountId: normalizedAccountId,
  });
}

function ensurePresenceSnapshot(accountId) {
  if (
    window.PresenceUI &&
    typeof window.PresenceUI.ensureSnapshotForAccountIds === "function"
  ) {
    window.PresenceUI.ensureSnapshotForAccountIds([accountId]).catch(
      (error) => {
        console.warn("[ProfilePreview] Presence snapshot sync failed:", error);
      },
    );
    return;
  }

  const normalizedAccountId = normalizePresenceId(accountId);
  if (
    !normalizedAccountId ||
    !window.PresenceStore ||
    typeof window.PresenceStore.ensureSnapshotForAccountIds !== "function"
  ) {
    return;
  }

  window.PresenceStore.ensureSnapshotForAccountIds([normalizedAccountId]).catch(
    (error) => {
      console.warn("[ProfilePreview] Presence snapshot sync failed:", error);
    },
  );
}

function applyPreviewPresenceDot(accountId) {
  const avatarWrapper = previewEl?.querySelector(
    ".profile-preview-avatar-wrapper",
  );
  if (!avatarWrapper) return;

  const existingDot = avatarWrapper.querySelector(
    ".profile-preview-online-dot",
  );
  const presenceStatus = resolvePresenceStatus(accountId);
  if (presenceStatus?.showDot) {
    if (!existingDot) {
      avatarWrapper.insertAdjacentHTML(
        "beforeend",
        '<div class="profile-preview-online-dot"></div>',
      );
    }
  } else if (existingDot) {
    existingDot.remove();
  }
}

function getStoryRingClass(storyRingState) {
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

function renderProfilePreviewAvatar(avatarUrl, storyRingClass, accountId) {
  const safeAvatarUrl = escapeAttr(avatarUrl || APP_CONFIG.DEFAULT_AVATAR);
  const avatarAlt = escapeAttr(ppT("profile.preview.avatarAlt", {}, "avatar"));
  if (!storyRingClass) {
    return `<img class="profile-preview-avatar-image" src="${safeAvatarUrl}" alt="${avatarAlt}">`;
  }

  const storyAuthorAttr = accountId
    ? ` data-story-author-id="${escapeAttr(accountId)}"`
    : "";
  return `
    <span class="post-avatar-ring profile-preview-avatar-ring ${storyRingClass}"${storyAuthorAttr}>
      <img class="post-avatar" src="${safeAvatarUrl}" alt="${avatarAlt}">
    </span>
  `;
}

/* ===== Create preview element ===== */
function createProfilePreview() {
  previewEl = document.createElement("div");
  previewEl.id = "profile-preview";
  previewEl.className = "profile-preview hidden";
  document.body.appendChild(previewEl);
}

/* ===== Load data ===== */
async function loadProfilePreview(accountId) {
  // Show loading state
  if (previewEl) {
    previewEl.innerHTML = `
      <div class="profile-preview-loading" style="height: 200px; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary);">
        <div class="spinner spinner-medium"></div>
      </div>
    `;
    previewEl.classList.remove("hidden");
  }

  const res = await API.Accounts.getProfilePreview(accountId);

  if (!res.ok) {
    if (previewEl) previewEl.classList.add("hidden");
    return null;
  }
  return await res.json();
}

/* ===== Render UI ===== */
function renderProfilePreview(data) {
  if (!data) return;
  currentPreviewData = data;

  const account = data.account || data.Account || {};
  const recentPosts = data.recentPosts || data.RecentPosts || [];
  const profileUsername = account.username || account.Username || "";
  const profileFullName = account.fullName || account.FullName || "";
  const profileCoverUrl = account.coverUrl || account.CoverUrl || "";
  const profileStatus = account.status ?? account.Status;
  const postCountValue =
    data.postCount ?? data.PostCount ?? data.totalPosts ?? data.TotalPosts ?? 0;
  const followerCountValue =
    data.followerCount ??
    data.FollowerCount ??
    data.followInfo?.followers ??
    data.followInfo?.Followers ??
    data.FollowInfo?.followers ??
    data.FollowInfo?.Followers ??
    0;
  const followingCountValue =
    data.followingCount ??
    data.FollowingCount ??
    data.followInfo?.following ??
    data.followInfo?.Following ??
    data.FollowInfo?.following ??
    data.FollowInfo?.Following ??
    0;

  currentUserId =
    account.accountId || account.AccountId || account.id || account.Id;
  const relation = window.FollowModule?.resolveEffectiveFollowRelation
    ? window.FollowModule.resolveEffectiveFollowRelation(currentUserId, {
        ...data,
        followers: followerCountValue,
        following: followingCountValue,
      })
    : {
        isFollowing: !!(
          data.isFollowedByCurrentUser ?? data.IsFollowedByCurrentUser ?? false
        ),
        isRequested: !!(
          data.isFollowRequestPendingByCurrentUser ??
          data.IsFollowRequestPendingByCurrentUser ??
          false
        ),
      };
  followRelation = relation;

  const avatarUrl = account.avatarUrl || account.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;
  const storyRingClass = getStoryRingClass(
    account.storyRingState ?? account.StoryRingState,
  );
  const avatarWrapperClass = storyRingClass
    ? "profile-preview-avatar-wrapper with-story-ring"
    : "profile-preview-avatar-wrapper";
  const avatarMarkup = renderProfilePreviewAvatar(
    avatarUrl,
    storyRingClass,
    currentUserId,
  );

  // Actions buttons
  let actionsHTML = "";
  if (data.isCurrentUser ?? data.IsCurrentUser) {
    actionsHTML = `
      <button class="profile-preview-btn profile-preview-btn-view-profile" onclick="viewProfile('${profileUsername}')">
        <i data-lucide="user"></i>
        <span>${ppT("profile.preview.actions.viewProfile", {}, "View Profile")}</span>
      </button>
    `;
  } else {
    const followBtnHTML = relation.isFollowing
      ? `
        <button class="profile-preview-btn profile-preview-btn-following" id="followBtn" onclick="toggleFollowMenu(event, '${currentUserId}')">
          <i data-lucide="check"></i>
          <span>${ppT("common.buttons.following", {}, "Following")}</span>
        </button>
      `
      : relation.isRequested
        ? `
        <button class="profile-preview-btn profile-preview-btn-requested" id="followBtn" onclick="toggleFollowMenu(event, '${currentUserId}')">
          <i data-lucide="clock-3"></i>
          <span>${ppT("common.buttons.requestSent", {}, "Request Sent")}</span>
        </button>
      `
      : `
        <button class="profile-preview-btn profile-preview-btn-follow" id="followBtn" onclick="toggleFollow('${currentUserId}')">
          <i data-lucide="user-plus"></i>
          <span>${ppT("common.buttons.follow", {}, "Follow")}</span>
        </button>
      `;

    const isTargetActive =
      profileStatus === undefined ||
      profileStatus === null ||
      Number(profileStatus) === 0;
    const statusClass = isTargetActive ? "" : "disabled-action";
    const disabledAttr = isTargetActive ? "" : "disabled";

    actionsHTML = `
      <button class="profile-preview-btn profile-preview-btn-message ${statusClass}" ${disabledAttr} onclick="openChat('${currentUserId}')">
        <i data-lucide="send"></i>
        <span>${ppT("profile.page.messageAction", {}, "Message")}</span>
      </button>
      ${followBtnHTML.replace('class="profile-preview-btn', `class="profile-preview-btn ${statusClass}`).replace("onclick=", isTargetActive ? "onclick=" : "data-onclick=")}
    `;
  }

  // Cover & Dynamic Background
  const coverAreaId = `pp-cover-${currentUserId}`;
  const coverImgHtml = profileCoverUrl
    ? `<img src="${profileCoverUrl}" alt="${escapeAttr(ppT("common.labels.coverPhoto", {}, "cover"))}" onerror="this.style.display='none'">`
    : "";

  previewEl.innerHTML = `
    <div class="profile-preview-cover" id="${coverAreaId}">
        ${coverImgHtml}
    </div>
    <div class="profile-preview-content">
        <div class="profile-preview-header" onclick="viewProfile('${profileUsername}')">
            <div class="${avatarWrapperClass}">
                ${avatarMarkup}
            </div>
            <div class="profile-preview-info">
                <div class="profile-preview-name" id="pp-username">${profileUsername}</div>
                <div class="profile-preview-fullname-small">${profileFullName}</div>
            </div>
        </div>

        <div class="profile-preview-stats">
            <div>
                <b>${postCountValue}</b>
                <span>${ppT("profile.stats.posts", {}, "Posts")}</span>
            </div>
            <div>
                <b>${followerCountValue}</b>
                <span>${ppT("profile.stats.followers", {}, "Followers")}</span>
            </div>
            <div>
                <b>${followingCountValue}</b>
                <span>${ppT("profile.stats.following", {}, "Following")}</span>
            </div>
        </div>

        ${
          recentPosts.length > 0
            ? `
            <div class="profile-preview-medias">
                ${recentPosts
                  .map(
                    (p) => `
                    <div class="profile-preview-media-item" onclick="if(window.InteractionModule) window.InteractionModule.closeReactList(); if(window.openPostDetail) window.openPostDetail('${p.postId || p.PostId}', '${p.postCode || p.PostCode || ""}'); hidePreview();">
                      <img src="${p.mediaUrl || p.MediaUrl}" alt="${escapeAttr(ppT("common.labels.post", {}, "post"))}">
                    </div>
                  `,
                  )
                  .join("")}
            </div>
            `
            : ""
        }

        <div class="profile-preview-actions">
            ${actionsHTML}
        </div>
    </div>
  `;

  // Apply dynamic gradient to cover
  const coverArea = document.getElementById(coverAreaId);
  if (coverArea) {
    if (avatarUrl && typeof extractDominantColor === "function") {
      extractDominantColor(avatarUrl)
        .then((color) => {
          coverArea.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
        })
        .catch(() => {
          coverArea.style.background =
            "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
        });
    } else {
      coverArea.style.background =
        "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }

  applyPreviewPresenceDot(currentUserId);
  ensurePresenceSnapshot(currentUserId);

  // Auto-shrink font for long names (Max 2 lines)
  const nameEl = document.getElementById("pp-username");
  if (nameEl) {
    nameEl.style.fontSize = "16px"; // Reset to base

    // Use requestAnimationFrame to ensure layout width is calculated
    requestAnimationFrame(() => {
      let fontSize = 16;
      // Threshold for 2 lines with 1.2 line-height: 16 * 1.2 * 2 = 38.4px.
      // We use 42px as a safe limit to account for padding/sub-pixel rendering.
      while (nameEl.scrollHeight > 42 && fontSize > 12) {
        fontSize -= 0.5;
        nameEl.style.fontSize = fontSize + "px";
      }
    });
  }
}

/* ===== Position ===== */
function showPreview(mouseEvent) {
  if (!mouseEvent) return;

  const mouseX = mouseEvent.clientX;
  const mouseY = mouseEvent.clientY;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const isMobile = viewportWidth <= 768;

  // Đo chính xác chiều cao popup sau khi render
  // Tạm thời hiện popup để đo
  previewEl.style.visibility = "hidden";
  previewEl.classList.remove("hidden");
  const popupHeight = previewEl.offsetHeight;
  const popupWidth = previewEl.offsetWidth;
  previewEl.classList.add("hidden");
  previewEl.style.visibility = "visible";

  const offset = isMobile ? 8 : 10;

  let top, left;

  if (isMobile) {
    // Mobile: Center horizontally, position vertically based on available space
    left = (viewportWidth - popupWidth) / 2;

    // Nếu đủ chỗ phía dưới, hiện dưới; không thì hiện trên
    if (mouseY + popupHeight + offset < viewportHeight) {
      top = mouseY + offset;
      previewEl.style.transformOrigin = "top center";
    } else {
      top = mouseY - popupHeight - offset;
      previewEl.style.transformOrigin = "bottom center";
    }
  } else {
    // Desktop: Original positioning logic
    // Quyết định hiển thị trên hay dưới dựa vào vị trí chuột
    if (mouseY > viewportHeight / 2) {
      // Nửa dưới màn hình → hiện phía trên
      top = mouseY - popupHeight;
      previewEl.style.transformOrigin = "bottom left";
    } else {
      // Nửa trên màn hình → hiện phía dưới
      top = mouseY;
      previewEl.style.transformOrigin = "top left";
    }

    // Góc trái của popup tại vị trí chuột
    left = mouseX;
  }

  // Đảm bảo không bị tràn ra ngoài viewport
  if (left + popupWidth > viewportWidth) {
    left = viewportWidth - popupWidth - offset;
  }

  if (left < offset) {
    left = offset;
  }

  if (top < offset) {
    top = offset;
  }

  if (top + popupHeight > viewportHeight) {
    top = viewportHeight - popupHeight - offset;
  }

  previewEl.style.top = top + "px";
  previewEl.style.left = left + "px";

  // Trigger animation bằng cách xóa class hidden
  requestAnimationFrame(() => {
    previewEl.classList.remove("hidden");
  });
}

function bindProfilePreviewLanguageChange() {
  if (profilePreviewLanguageBound || !window.I18n?.onChange) return;
  profilePreviewLanguageBound = true;
  window.I18n.onChange(() => {
    if (
      !previewEl ||
      previewEl.classList.contains("hidden") ||
      !currentPreviewData
    ) {
      return;
    }
    renderProfilePreview(currentPreviewData);
  });
}

function hidePreview() {
  if (previewEl) previewEl.classList.add("hidden");
  currentAccountId = null;
  clearTimeout(hoverTimer);
  clearTimeout(hideTimer);
}
window.hidePreview = hidePreview;

function isProfilePreviewTrigger(target) {
  if (!target || typeof target.closest !== "function") return false;

  const strictPostHeaderContext = target.closest(
    ".post-header .post-user[data-account-id], #postDetailModal .detail-header .post-user[data-account-id]",
  );

  // Newfeed + Post detail: strict trigger only on username/avatar of target user
  if (strictPostHeaderContext) {
    const taggedTarget = target.closest(".post-tag-name-text, .post-tag-avatar");
    if (
      taggedTarget &&
      taggedTarget.closest(".post-tag-name[data-account-id]")
    ) {
      return true;
    }

    const ownerNameTarget = target.closest(
      ".post-name-row .post-username, .post-name-row .username, .user-name-row .post-username, .user-name-row .username",
    );
    if (ownerNameTarget) {
      return true;
    }

    const ownerAvatarTarget = target.closest(".post-avatar, .post-avatar-ring");
    if (ownerAvatarTarget) {
      return true;
    }

    return false;
  }

  // Other modules: keep legacy trigger behavior
  return !!(
    target.closest(".post-avatar") ||
    target.closest(".post-avatar-ring") ||
    target.closest(".post-username") ||
    target.closest(".post-tag-name")
  );
}

function resolvePreviewAccountId(target) {
  // post-tag-name carries its own data-account-id (tagged user, not post author)
  const tagNameEl = target.closest(".post-tag-name");
  if (tagNameEl && tagNameEl.dataset.accountId) {
    return tagNameEl.dataset.accountId;
  }
  // fallback: post author from .post-user container
  const userEl = target.closest(".post-user");
  return userEl?.dataset?.accountId || null;
}

/* ===== Init hover ===== */
function initProfilePreview() {
  if (previewEl) return;
  createProfilePreview();
  bindProfilePreviewLanguageChange();

  if (
    !profilePreviewPresenceUnsubscribe &&
    window.PresenceUI &&
    typeof window.PresenceUI.subscribe === "function"
  ) {
    profilePreviewPresenceUnsubscribe = window.PresenceUI.subscribe(
      (payload) => {
        const targetAccountId = normalizePresenceId(currentUserId);
        if (
          !targetAccountId ||
          !previewEl ||
          previewEl.classList.contains("hidden")
        ) {
          return;
        }
        const changedIds = Array.isArray(payload?.changedAccountIds)
          ? payload.changedAccountIds.map(normalizePresenceId)
          : [];
        if (changedIds.length > 0 && !changedIds.includes(targetAccountId)) {
          return;
        }
        applyPreviewPresenceDot(targetAccountId);
      },
    );
  } else if (
    !profilePreviewPresenceUnsubscribe &&
    window.PresenceStore &&
    typeof window.PresenceStore.subscribe === "function"
  ) {
    profilePreviewPresenceUnsubscribe = window.PresenceStore.subscribe(
      (payload) => {
        const targetAccountId = normalizePresenceId(currentUserId);
        if (
          !targetAccountId ||
          !previewEl ||
          previewEl.classList.contains("hidden")
        ) {
          return;
        }
        const changedIds = Array.isArray(payload?.changedAccountIds)
          ? payload.changedAccountIds.map(normalizePresenceId)
          : [];
        if (changedIds.length > 0 && !changedIds.includes(targetAccountId)) {
          return;
        }
        applyPreviewPresenceDot(targetAccountId);
      },
    );
  }

  // Disable hover on mobile, enable click instead
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    // Mobile: Click to show preview
    document.addEventListener("click", async (e) => {
      if (!isProfilePreviewTrigger(e.target)) {
        // Click outside - hide preview
        if (!e.target.closest("#profile-preview")) {
          hidePreview();
        }
        return;
      }

      e.preventDefault();
      const accountId = resolvePreviewAccountId(e.target);
      if (!accountId) return;

      // Toggle preview if clicking same user
      if (
        currentAccountId === accountId &&
        !previewEl.classList.contains("hidden")
      ) {
        hidePreview();
        return;
      }

      lastMouseEvent = e;
      const data = await loadProfilePreview(accountId);
      currentAccountId = accountId;
      renderProfilePreview(data);
      showPreview(lastMouseEvent);
    });
  } else {
    // Desktop: Hover to show preview
    let pendingAccountId = null; // Track which accountId the timer is for

    document.addEventListener("mouseover", async (e) => {
      if (!isProfilePreviewTrigger(e.target)) return;

      const accountId = resolvePreviewAccountId(e.target);
      if (!accountId) return;

      if (
        currentAccountId === accountId &&
        previewEl &&
        !previewEl.classList.contains("hidden")
      ) {
        clearTimeout(hideTimer);
        return;
      }

      lastMouseEvent = e;
      clearTimeout(hideTimer);
      clearTimeout(hoverTimer);

      pendingAccountId = accountId;
      currentAccountId = accountId; // Mark as pending

      hoverTimer = setTimeout(async () => {
        // Guard: still the same pending account?
        if (pendingAccountId !== accountId) return;

        const data = await loadProfilePreview(accountId);

        // CRITICAL: Check if we still want this specific preview
        // (navigation or another hover might have cleared it)
        if (currentAccountId !== accountId) return;

        renderProfilePreview(data);
        showPreview(lastMouseEvent);
      }, 400);
    });

    document.addEventListener("mouseout", (e) => {
      const isTriggerElement = isProfilePreviewTrigger(e.target);
      const isFromPreview =
        !!e.target.closest && !!e.target.closest("#profile-preview");
      if (!isTriggerElement && !isFromPreview) return;

      const nextTarget = e.relatedTarget;

      // Mouse moved into preview popup -> stay open
      if (
        nextTarget &&
        nextTarget.closest &&
        nextTarget.closest("#profile-preview")
      ) {
        clearTimeout(hideTimer);
        return;
      }

      // Mouse moved between valid preview triggers -> stay open
      if (nextTarget && isProfilePreviewTrigger(nextTarget)) {
        clearTimeout(hideTimer);
        return;
      }

      // Cancel any pending hover timer
      clearTimeout(hoverTimer);
      pendingAccountId = null;
      hideTimer = setTimeout(hidePreview, 300);
    });

    // Safety net: periodically check if mouse is still over trigger/preview
    // This catches edge cases where mouseout fires on wrong target during fast movement
    let safetyInterval = null;

    function startSafetyCheck() {
      stopSafetyCheck();
      safetyInterval = setInterval(() => {
        if (!previewEl || previewEl.classList.contains("hidden")) {
          stopSafetyCheck();
          return;
        }
        const hoveredEls = document.querySelectorAll(":hover");
        let isOverPreview = false;
        let isOverTrigger = false;
        hoveredEls.forEach((el) => {
          if (el.closest("#profile-preview")) isOverPreview = true;
          if (isProfilePreviewTrigger(el)) isOverTrigger = true;
        });
        if (!isOverPreview && !isOverTrigger) {
          clearTimeout(hoverTimer);
          pendingAccountId = null;
          hidePreview();
          stopSafetyCheck();
        }
      }, 500);
    }

    function stopSafetyCheck() {
      if (safetyInterval) {
        clearInterval(safetyInterval);
        safetyInterval = null;
      }
    }

    // Hook safety check into show/hide cycle
    const originalShowPreview = showPreview;
    showPreview = function (mouseEvent) {
      originalShowPreview(mouseEvent);
      startSafetyCheck();
    };

    const originalHidePreview = hidePreview;
    hidePreview = function () {
      originalHidePreview();
      stopSafetyCheck();
    };
    window.hidePreview = hidePreview;

    // Global click listener to kill preview when navigating
    document.addEventListener("click", (e) => {
      if (isProfilePreviewTrigger(e.target)) {
        hidePreview();
      }
    });
  }

  // Keep preview open when hovering/touching over it
  if (previewEl) {
    previewEl.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
    });

    previewEl.addEventListener("mouseleave", (e) => {
      const nextTarget = e.relatedTarget;
      // If mouse goes back to a trigger element, don't start hide timer
      if (nextTarget && isProfilePreviewTrigger(nextTarget)) {
        return;
      }
      hideTimer = setTimeout(hidePreview, 200);
    });
  }
}

window.initProfilePreview = initProfilePreview;

// Auto-initialize once DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProfilePreview);
} else {
  initProfilePreview();
}

/* ===== Follow/Unfollow ===== */
/* ===== Follow/Unfollow ===== */
async function toggleFollow(userId) {
  const btn = document.getElementById("followBtn");
  if (!btn) return;
  if (!window.FollowModule) return;

  const isFollowingNow = btn.classList.contains("profile-preview-btn-following");
  const isRequestedNow = btn.classList.contains("profile-preview-btn-requested");
  followRelation = {
    isFollowing: isFollowingNow,
    isRequested: isRequestedNow,
  };

  if (isFollowingNow || isRequestedNow) {
    FollowModule.showUnfollowConfirm(userId, btn);
    return;
  }

  await FollowModule.followUser(userId, btn);
}

/* ===== Toggle follow menu (dropdown) ===== */
function toggleFollowMenu(event, userId) {
  event.stopPropagation();
  if (window.FollowModule) {
    FollowModule.showUnfollowConfirm(userId, event.currentTarget);
  }
}

/* ===== View Profile ===== */
function viewProfile(username) {
  // Close all possible overlays (Follow list, React list, Create Post, etc.)
  if (window.closeAllOverlayModals) {
    window.closeAllOverlayModals();
  } else {
    // Fallback if app.js not ready/available correctly
    hidePreview();
  }

  const target = (username || "").toString().trim();
  if (!target) return;

  if (window.RouteHelper?.buildProfilePath && window.RouteHelper?.goTo) {
    const path = window.RouteHelper.buildProfilePath(target);
    window.RouteHelper.goTo(path);
    return;
  }

  // Fallback without RouteHelper
  window.location.hash = `#/${encodeURIComponent(target)}`;
}
window.viewProfile = viewProfile;

/* ===== Open Chat ===== */
function openChat(userId) {
  if (window.ChatWindow) {
    ChatWindow.openByAccountId(userId);
    hidePreview();
  } else {
    console.warn("ChatWindow not initialized");
  }
}

// Expose currentAccountId for external checks (e.g. from follow.js)
window.getProfilePreviewAccountId = () => currentAccountId;
