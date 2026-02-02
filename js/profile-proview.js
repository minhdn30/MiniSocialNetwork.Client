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
  const res = await apiFetch(`/Accounts/profile-preview/${accountId}`);

  if (!res.ok) return null;
  return await res.json();
}

/* ===== Render UI ===== */
function renderProfilePreview(data) {
  if (!data) return;

  currentUserId = data.account.accountId;
  isFollowing = data.isFollowedByCurrentUser ?? false;

  // Render actions buttons based on conditions
  let actionsHTML = "";

  if (data.isCurrentUser) {
    // Nếu là chính mình → chỉ hiện nút View Profile
    actionsHTML = `
      <button class="btn btn-view-profile" onclick="viewProfile('${currentUserId}')">
        View Profile
      </button>
    `;
  } else {
    // Nếu không phải chính mình → hiện Message + Follow/Following
    const followBtnHTML = data.isFollowedByCurrentUser
      ? `
        <button class="btn btn-following" id="followBtn" onclick="toggleFollowMenu(event, '${currentUserId}')">
          <i data-lucide="check"></i>
          <span>Following</span>
        </button>
      `
      : `
        <button class="btn btn-follow" id="followBtn" onclick="toggleFollow('${currentUserId}')">
          Follow
        </button>
      `;

    actionsHTML = `
      <button class="btn btn-message" onclick="openChat('${currentUserId}')">
        <i data-lucide="send"></i>
        <span>Message</span>
      </button>
      ${followBtnHTML}
    `;
  }

  previewEl.innerHTML = `
    <div class="preview-header">
      <img src="${data.account.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}" alt="avatar" />
      <div>
        <div class="name">${PostUtils.truncateName(data.account.fullName)}</div>
      </div>
    </div>

    <div class="preview-stats">
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

    <div class="preview-medias">
      ${
        !data.recentPosts || data.recentPosts.length === 0
          ? ""
          : data.recentPosts
              .map((p) => `
                <div class="preview-media-item">
                  <img src="${p.mediaUrl}" alt="post">
                </div>
              `)
              .join("")
      }
    </div>

    <div class="profile-actions">
      ${actionsHTML}
    </div>
  `;

  // Re-initialize lucide icons
  if (window.lucide) {
    lucide.createIcons();
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

  previewEl.style.top = top + window.scrollY + "px";
  previewEl.style.left = left + "px";

  // Trigger animation bằng cách xóa class hidden
  requestAnimationFrame(() => {
    previewEl.classList.remove("hidden");
  });
}

function hidePreview() {
  previewEl.classList.add("hidden");
  currentAccountId = null;
}

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
        !previewEl.classList.contains("hidden")
      ) {
        clearTimeout(hideTimer);
        return;
      }

      lastMouseEvent = e;
      clearTimeout(hideTimer);

      hoverTimer = setTimeout(async () => {
        const data = await loadProfilePreview(accountId);
        currentAccountId = accountId;
        renderProfilePreview(data);
        showPreview(lastMouseEvent);
      }, 400);
    });

    document.addEventListener("mouseout", (e) => {
      const avatar = e.target.closest(".post-avatar");
      const username = e.target.closest(".post-username");

      if (!avatar && !username) return;

      clearTimeout(hoverTimer);
      hideTimer = setTimeout(hidePreview, 200);
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

/* ===== Follow/Unfollow ===== */
function toggleFollow(userId) {
  isFollowing = !isFollowing;

  const btn = document.getElementById("followBtn");
  if (!btn) return;

  if (isFollowing) {
    btn.innerHTML = `
      <i data-lucide="check"></i>
      <span>Following</span>
    `;
    btn.className = "btn btn-following";
    btn.onclick = (e) => toggleFollowMenu(e, userId);
  } else {
    btn.textContent = "Follow";
    btn.className = "btn btn-follow";
    btn.onclick = () => toggleFollow(userId);
  }

  // Re-initialize lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // TODO: call follow / unfollow API
}

/* ===== Toggle follow menu (dropdown) ===== */
function toggleFollowMenu(event, userId) {
  event.stopPropagation();
  showUnfollowConfirm(userId);
}

/* ===== Show unfollow confirmation popup ===== */
function showUnfollowConfirm(userId) {
  // Tạo overlay
  const overlay = document.createElement("div");
  overlay.className = "unfollow-overlay";

  // Tạo popup
  const popup = document.createElement("div");
  popup.className = "unfollow-popup";

  popup.innerHTML = `
    <div class="unfollow-content">
      <h3>Unfollow this account?</h3>
      <p>You can always follow them again later.</p>
    </div>
    <div class="unfollow-actions">
      <button class="unfollow-btn unfollow-confirm" id="unfollowConfirm">Unfollow</button>
      <button class="unfollow-btn unfollow-cancel" id="unfollowCancel">Cancel</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add("show");
  });

  // Handle Unfollow button
  document.getElementById("unfollowConfirm").onclick = () => {
    toggleFollow(userId);
    closeUnfollowConfirm(overlay);
  };

  // Handle Cancel button
  document.getElementById("unfollowCancel").onclick = () => {
    closeUnfollowConfirm(overlay);
  };

  // Close when clicking overlay
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeUnfollowConfirm(overlay);
    }
  };
}

/* ===== Close unfollow confirmation popup ===== */
function closeUnfollowConfirm(overlay) {
  overlay.classList.remove("show");
  setTimeout(() => {
    overlay.remove();
  }, 200);
}

/* ===== View Profile ===== */
function viewProfile(userId) {
  // TODO: Navigate to profile page
  window.location.href = `/profile/${userId}`;
}

/* ===== Open Chat ===== */
function openChat(userId) {
  // TODO: Open chat with user
  console.log("Open chat with:", userId);
}