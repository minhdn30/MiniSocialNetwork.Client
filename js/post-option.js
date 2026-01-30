let currentPostOptions = null;

/* ===== Show post options popup ===== */
function showPostOptions(postId, accountId, isOwnPost, isFollowing) {
  // Nếu đã có popup đang mở, đóng nó trước
  if (currentPostOptions) {
    closePostOptions();
  }

  // Tạo overlay
  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "postOptionsOverlay";

  // Tạo popup
  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  // Build options dựa trên điều kiện
  let optionsHTML = "";

  if (isOwnPost) {
    // Nếu là post của mình
    optionsHTML = `
      <button class="post-option post-option-danger" onclick="deletePost('${postId}')">
        <i data-lucide="trash-2"></i>
        <span>Delete</span>
      </button>
      <button class="post-option" onclick="editPost('${postId}')">
        <i data-lucide="edit"></i>
        <span>Edit</span>
      </button>
      <button class="post-option" onclick="hidePostLikes('${postId}')">
        <i data-lucide="eye-off"></i>
        <span>Hide like count</span>
      </button>
      <button class="post-option" onclick="turnOffCommenting('${postId}')">
        <i data-lucide="message-square-off"></i>
        <span>Turn off commenting</span>
      </button>
    `;
  } else {
    // Nếu là post của người khác
    const followOption = isFollowing
      ? `
        <button class="post-option" onclick="unfollowFromPost('${accountId}')">
          <i data-lucide="user-minus"></i>
          <span>Unfollow</span>
        </button>
      `
      : `
        <button class="post-option" onclick="followFromPost('${accountId}')">
          <i data-lucide="user-plus"></i>
          <span>Follow</span>
        </button>
      `;

    optionsHTML = `
      <button class="post-option post-option-danger" onclick="reportPost('${postId}')">
        <i data-lucide="flag"></i>
        <span>Report</span>
      </button>
      ${followOption}
      <button class="post-option" onclick="hidePost('${postId}')">
        <i data-lucide="eye-off"></i>
        <span>Hide</span>
      </button>
      <button class="post-option" onclick="addToFavorites('${postId}')">
        <i data-lucide="bookmark"></i>
        <span>Add to favorites</span>
      </button>
      <button class="post-option" onclick="copyPostLink('${postId}')">
        <i data-lucide="link"></i>
        <span>Copy link</span>
      </button>
      <button class="post-option" onclick="shareToStory('${postId}')">
        <i data-lucide="send"></i>
        <span>Share to story</span>
      </button>
      <button class="post-option" onclick="aboutThisAccount('${accountId}')">
        <i data-lucide="info"></i>
        <span>About this account</span>
      </button>
    `;
  }

  // Thêm nút Cancel cho tất cả
  optionsHTML += `
    <button class="post-option post-option-cancel" onclick="closePostOptions()">
      Cancel
    </button>
  `;

  popup.innerHTML = optionsHTML;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  currentPostOptions = overlay;

  // Re-initialize lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add("show");
  });

  // Close when clicking overlay
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closePostOptions();
    }
  };
}

/* ===== Close post options popup ===== */
function closePostOptions() {
  if (!currentPostOptions) return;

  currentPostOptions.classList.remove("show");
  setTimeout(() => {
    if (currentPostOptions) {
      currentPostOptions.remove();
      currentPostOptions = null;
    }
  }, 200);
}

/* ===== Post Actions - Own Post ===== */
function deletePost(postId) {
  closePostOptions();

  // Show delete confirmation
  const overlay = document.createElement("div");
  overlay.className = "unfollow-overlay";

  const popup = document.createElement("div");
  popup.className = "unfollow-popup";

  popup.innerHTML = `
    <div class="unfollow-content">
      <h3>Delete post?</h3>
      <p>This action cannot be undone.</p>
    </div>
    <div class="unfollow-actions">
      <button class="unfollow-btn unfollow-confirm" onclick="confirmDeletePost('${postId}', this)">Delete</button>
      <button class="unfollow-btn unfollow-cancel" onclick="this.closest('.unfollow-overlay').remove()">Cancel</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));
}

function confirmDeletePost(postId, btnElement) {
  // TODO: Call API to delete post
  console.log("Deleting post:", postId);
  btnElement.closest(".unfollow-overlay").remove();
}

function editPost(postId) {
  closePostOptions();
  // TODO: Navigate to edit post page
  console.log("Editing post:", postId);
}

function hidePostLikes(postId) {
  closePostOptions();
  // TODO: Call API to hide likes
  console.log("Hiding likes for post:", postId);
}

function turnOffCommenting(postId) {
  closePostOptions();
  // TODO: Call API to turn off comments
  console.log("Turning off comments for post:", postId);
}

/* ===== Post Actions - Other's Post ===== */
function reportPost(postId) {
  closePostOptions();

  // Show report options
  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>Report</h3>
      <p>Why are you reporting this post?</p>
    </div>
    <button class="post-option" onclick="submitReport('${postId}', 'spam')">
      <span>It's spam</span>
    </button>
    <button class="post-option" onclick="submitReport('${postId}', 'inappropriate')">
      <span>Nudity or sexual activity</span>
    </button>
    <button class="post-option" onclick="submitReport('${postId}', 'hate')">
      <span>Hate speech or symbols</span>
    </button>
    <button class="post-option" onclick="submitReport('${postId}', 'violence')">
      <span>Violence or dangerous organizations</span>
    </button>
    <button class="post-option" onclick="submitReport('${postId}', 'false')">
      <span>False information</span>
    </button>
    <button class="post-option" onclick="submitReport('${postId}', 'scam')">
      <span>Scam or fraud</span>
    </button>
    <button class="post-option post-option-cancel" onclick="this.closest('.post-options-overlay').remove()">
      Cancel
    </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

function submitReport(postId, reason) {
  // TODO: Call API to submit report
  console.log("Reporting post:", postId, "Reason:", reason);

  const overlay = document.querySelector(".post-options-overlay");
  if (overlay) overlay.remove();

  // Show success message
  showToast("Thanks for reporting. We'll review this post.");
}

function unfollowFromPost(accountId) {
  closePostOptions();
  showUnfollowConfirm(accountId);
}

function followFromPost(accountId) {
  closePostOptions();
  // TODO: Call API to follow
  console.log("Following account:", accountId);
  showToast("Following");
}

function hidePost(postId) {
  closePostOptions();
  // TODO: Call API to hide post
  console.log("Hiding post:", postId);
  showToast("Post hidden");
}

function addToFavorites(postId) {
  closePostOptions();
  // TODO: Call API to add to favorites
  console.log("Adding to favorites:", postId);
  showToast("Added to favorites");
}

function copyPostLink(postId) {
  closePostOptions();
  const link = `${window.location.origin}/post/${postId}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast("Link copied to clipboard");
  });
}

function shareToStory(postId) {
  closePostOptions();
  // TODO: Navigate to story creation with post
  console.log("Sharing to story:", postId);
}

function aboutThisAccount(accountId) {
  closePostOptions();
  // TODO: Show account info modal
  console.log("About account:", accountId);
}

/* ===== Toast notification ===== */
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Export functions to window
window.showPostOptions = showPostOptions;
window.closePostOptions = closePostOptions;
