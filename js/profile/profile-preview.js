let previewEl;
let hoverTimer;
let hideTimer;
let isFollowing = false;
let currentUserId = null;
let lastMouseEvent = null;
let currentAccountId = null;

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

  currentUserId = data.account.accountId;
  isFollowing = data.isFollowedByCurrentUser ?? false;

  const avatarUrl = data.account.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;

  // Actions buttons
  let actionsHTML = "";
  if (data.isCurrentUser) {
    actionsHTML = `
      <button class="profile-preview-btn profile-preview-btn-view-profile" onclick="viewProfile('${data.account.username}')">
        <i data-lucide="user"></i>
        <span>View Profile</span>
      </button>
    `;
  } else {
    const followBtnHTML = data.isFollowedByCurrentUser
      ? `
        <button class="profile-preview-btn profile-preview-btn-following" id="followBtn" onclick="toggleFollowMenu(event, '${currentUserId}')">
          <i data-lucide="check"></i>
          <span>Following</span>
        </button>
      `
      : `
        <button class="profile-preview-btn profile-preview-btn-follow" id="followBtn" onclick="toggleFollow('${currentUserId}')">
          <i data-lucide="user-plus"></i>
          <span>Follow</span>
        </button>
      `;

    const isTargetActive = data.account.status === 0;
    const statusClass = isTargetActive ? "" : "disabled-action";
    const disabledAttr = isTargetActive ? "" : "disabled";

    actionsHTML = `
      <button class="profile-preview-btn profile-preview-btn-message ${statusClass}" ${disabledAttr} onclick="openChat('${currentUserId}')">
        <i data-lucide="send"></i>
        <span>Message</span>
      </button>
      ${followBtnHTML.replace('class="profile-preview-btn', `class="profile-preview-btn ${statusClass}`).replace('onclick=', isTargetActive ? 'onclick=' : 'data-onclick=')}
    `;
  }

  // Cover & Dynamic Background
  const coverAreaId = `pp-cover-${currentUserId}`;
  const coverImgHtml = data.account.coverUrl 
    ? `<img src="${data.account.coverUrl}" alt="cover" onerror="this.style.display='none'">` 
    : "";

    previewEl.innerHTML = `
    <div class="profile-preview-cover" id="${coverAreaId}">
        ${coverImgHtml}
    </div>
    <div class="profile-preview-content">
        <div class="profile-preview-header" onclick="viewProfile('${data.account.username}')">
            <div class="profile-preview-avatar-wrapper">
                <img src="${avatarUrl}" alt="avatar">
            </div>
            <div class="profile-preview-info">
                <div class="profile-preview-name" id="pp-username">${data.account.username}</div>
                <div class="profile-preview-fullname-small">${data.account.fullName}</div>
            </div>
        </div>

        <div class="profile-preview-stats">
            <div>
                <b>${data.postCount}</b>
                <span>Posts</span>
            </div>
            <div>
                <b>${data.followerCount}</b>
                <span>Followers</span>
            </div>
            <div>
                <b>${data.followingCount}</b>
                <span>Following</span>
            </div>
        </div>

        ${
          data.recentPosts && data.recentPosts.length > 0
            ? `
            <div class="profile-preview-medias">
                ${data.recentPosts
                  .map((p) => `
                    <div class="profile-preview-media-item" onclick="if(window.InteractionModule) window.InteractionModule.closeReactList(); if(window.openPostDetail) window.openPostDetail('${p.postId}', '${p.postCode || ''}'); hidePreview();">
                      <img src="${p.mediaUrl}" alt="post">
                    </div>
                  `)
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
      if (avatarUrl && typeof extractDominantColor === 'function') {
          extractDominantColor(avatarUrl).then(color => {
              coverArea.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
          }).catch(() => {
              coverArea.style.background = "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
          });
      } else {
          coverArea.style.background = "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
      }
  }

  if (window.lucide) {
    lucide.createIcons();
  }

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

function hidePreview() {
  if (previewEl) previewEl.classList.add("hidden");
  currentAccountId = null;
  clearTimeout(hoverTimer);
  clearTimeout(hideTimer);
}
window.hidePreview = hidePreview;

/* ===== Init hover ===== */
function initProfilePreview() {
  if (previewEl) return;
  createProfilePreview();

  // Disable hover on mobile, enable click instead
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    // Mobile: Click to show preview
    document.addEventListener("click", async (e) => {
      const avatar = e.target.closest(".post-avatar");
      const username = e.target.closest(".post-username");

      if (!avatar && !username) {
        // Click outside - hide preview
        if (!e.target.closest("#profile-preview")) {
          hidePreview();
        }
        return;
      }

      e.preventDefault();
      const userEl = e.target.closest(".post-user");
      if (!userEl) return;

      const accountId = userEl.dataset.accountId;
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
    document.addEventListener("mouseover", async (e) => {
      const avatar = e.target.closest(".post-avatar");
      const username = e.target.closest(".post-username");

      if (!avatar && !username) return;

      const userEl = e.target.closest(".post-user");
      if (!userEl) return;

      const accountId = userEl.dataset.accountId;
      if (!accountId) return;

      if (
        currentAccountId === accountId &&
        previewEl && !previewEl.classList.contains("hidden")
      ) {
        clearTimeout(hideTimer);
        return;
      }

      lastMouseEvent = e;
      clearTimeout(hideTimer);
      clearTimeout(hoverTimer);
      
      currentAccountId = accountId; // Mark as pending

      hoverTimer = setTimeout(async () => {
        const data = await loadProfilePreview(accountId);
        
        // CRITICAL: Check if we still want this specific preview 
        // (navigation or another hover might have cleared it)
        if (currentAccountId !== accountId) return;

        renderProfilePreview(data);
        showPreview(lastMouseEvent);
      }, 400);
    });

    document.addEventListener("mouseout", (e) => {
      const avatar = e.target.closest(".post-avatar");
      const username = e.target.closest(".post-username");

      if (!avatar && !username) return;

      clearTimeout(hoverTimer);
      hideTimer = setTimeout(hidePreview, 300);
    });

    // Global click listener to kill preview when navigating
    document.addEventListener("click", (e) => {
      const avatar = e.target.closest(".post-avatar");
      const username = e.target.closest(".post-username");
      if (avatar || username) {
        hidePreview();
      }
    });
  }

  // Keep preview open when hovering/touching over it
  if (previewEl) {
    previewEl.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
    });

    previewEl.addEventListener("mouseleave", () => {
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
  isFollowing = !isFollowing;

  const btn = document.getElementById("followBtn");
  if (!btn) return;

  // Optimistic UI update for the preview button itself
  if (isFollowing) {
    btn.innerHTML = `
      <i data-lucide="check"></i>
      <span>Following</span>
    `;
    btn.className = "profile-preview-btn profile-preview-btn-following";
    btn.onclick = (e) => toggleFollowMenu(e, userId);
  } else {
    btn.innerHTML = `
      <i data-lucide="user-plus"></i>
      <span>Follow</span>
    `;
    btn.className = "profile-preview-btn profile-preview-btn-follow";
    btn.onclick = () => toggleFollow(userId);
  }

  // Re-initialize lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Call FollowModule to handle API and sync other UI
  // Note: We already updated local button optimistically, but FollowModule also syncs feed
  if (isFollowing) {
     if (window.FollowModule) await FollowModule.followUser(userId);
  } else {
     if (window.FollowModule) await FollowModule.unfollowUser(userId);
  }
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
  
  // Navigate to profile page using hash
  window.location.hash = `#/profile/${username}`;
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