let currentPostOptions = null;

/* ===== Show post options popup ===== */
function showPostOptions(postId, accountId, isOwnPost, isFollowing) {
  if (currentPostOptions) closePostOptions();

  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "postOptionsOverlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  let optionsHTML = "";

  if (isOwnPost) {
    optionsHTML = `
      <button class="post-option post-option-danger" onclick="deletePost('${postId}')">
        <i data-lucide="trash-2"></i><span>Delete</span>
      </button>
      <button class="post-option" onclick="editPost('${postId}')">
        <i data-lucide="edit"></i><span>Edit</span>
      </button>
      <button class="post-option" onclick="hidePostLikes('${postId}')">
        <i data-lucide="eye-off"></i><span>Hide like count</span>
      </button>
      <button class="post-option" onclick="turnOffCommenting('${postId}')">
        <i data-lucide="message-square-off"></i><span>Turn off commenting</span>
      </button>
    `;
  } else {
    optionsHTML = `
      <button class="post-option post-option-danger" onclick="reportPost('${postId}')">
        <i data-lucide="flag"></i><span>Report</span>
      </button>
      <button class="post-option" onclick="hidePost('${postId}')">
        <i data-lucide="eye-off"></i><span>Hide</span>
      </button>
      <button class="post-option" onclick="addToFavorites('${postId}')">
        <i data-lucide="bookmark"></i><span>Add to favorites</span>
      </button>
      <button class="post-option" onclick="copyPostLink('${postId}')">
        <i data-lucide="link"></i><span>Copy link</span>
      </button>
      <button class="post-option" onclick="shareToStory('${postId}')">
        <i data-lucide="send"></i><span>Share to story</span>
      </button>
      <button class="post-option" onclick="aboutThisAccount('${accountId}')">
        <i data-lucide="info"></i><span>About this account</span>
      </button>
    `;
  }

  optionsHTML += `
    <button class="post-option post-option-cancel" onclick="closePostOptions()">
      Cancel
    </button>
  `;

  popup.innerHTML = optionsHTML;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  currentPostOptions = overlay;

  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) closePostOptions();
  };
}

/* ===== Close popup ===== */
function closePostOptions() {
  if (!currentPostOptions) return;

  currentPostOptions.classList.remove("show");
  setTimeout(() => {
    currentPostOptions?.remove();
    currentPostOptions = null;
  }, 200);
}

/* ===== Own post actions ===== */
function deletePost(postId) {
  closePostOptions();
  showDeleteConfirm(postId);
}

function showDeleteConfirm(postId) {
    const overlay = document.createElement("div");
    overlay.className = "post-options-overlay";
    overlay.id = "deletePostConfirmOverlay";

    const popup = document.createElement("div");
    popup.className = "post-options-popup";

    popup.innerHTML = `
        <div class="post-options-header">
            <h3>Delete this post?</h3>
            <p>This action cannot be undone.</p>
        </div>
        <button class="post-option post-option-danger" onclick="confirmDeletePost('${postId}')">
            Delete
        </button>
        <button class="post-option post-option-cancel" onclick="closeDeleteConfirm()">
            Cancel
        </button>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.onclick = (e) => {
        if (e.target === overlay) closeDeleteConfirm();
    };
}

function closeDeleteConfirm() {
    const overlay = document.getElementById("deletePostConfirmOverlay");
    if (overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
    }
}

async function confirmDeletePost(postId) {
    const btn = document.querySelector("#deletePostConfirmOverlay .post-option-danger");
    if(btn) btn.disabled = true;

    try {
        const res = await API.Posts.delete(postId);
        if (!res.ok) throw new Error("Failed to delete post");

        closeDeleteConfirm();
        
        // Hide from UI (Modal + Feed)
        if (window.PostUtils) {
            PostUtils.hidePost(postId);
        }
        
        if (window.toastSuccess) toastSuccess("Post deleted.");

    } catch (err) {
        console.error(err);
        if (window.toastError) toastError("Could not delete post");
        if(btn) btn.disabled = false;
        closeDeleteConfirm();
    }
}

function editPost(postId) {
  closePostOptions();
  console.log("Edit post:", postId);
  
  // If PostEdit module exists, start editing
  if (window.PostEdit) {
      window.PostEdit.startEditPost(postId);
  } else {
      toastInfo("Edit post module not loaded");
  }
}

function hidePostLikes(postId) {
  closePostOptions();
  console.log("Hide likes:", postId);
  toastInfo("Like count hidden");
}

function turnOffCommenting(postId) {
  closePostOptions();
  console.log("Turn off commenting:", postId);
  toastInfo("Commenting turned off");
}

/* ===== Other post actions ===== */
/* ===== Generic Report Logic ===== */
function showReportReasons(targetId, type = 'post') {
  // Close any existing overlays first
  closePostOptions();
  document.querySelector(".post-options-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  const typeLabel = type === 'comment' ? 'comment' : 'post';

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>Report</h3>
      <p>Why are you reporting this ${typeLabel}?</p>
    </div>
    <button class="post-option" onclick="submitReport('${targetId}', 'spam', '${type}')">It's spam</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'inappropriate', '${type}')">Nudity or sexual activity</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'hate', '${type}')">Hate speech or symbols</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'violence', '${type}')">Violence or dangerous organizations</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'false', '${type}')">False information</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'scam', '${type}')">Scam or fraud</button>
    <button class="post-option post-option-cancel" onclick="this.closest('.post-options-overlay').remove()">Cancel</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function submitReport(targetId, reason, type = 'post') {
  console.log(`Report ${type}:`, targetId, reason);
  document.querySelector(".post-options-overlay")?.remove();
  const typeLabel = type === 'comment' ? 'comment' : 'post';
  
  if (window.toastSuccess) {
      toastSuccess(`Thanks for reporting. We'll review this ${typeLabel}.`);
  } else {
      console.log(`Thanks for reporting. We'll review this ${typeLabel}.`);
  }
}

function reportPost(postId) {
    showReportReasons(postId, 'post');
}

function followFromPost(accountId) {
  closePostOptions();
  console.log("Follow:", accountId);
  toastSuccess("Following");
}

function unfollowFromPost(accountId) {
  closePostOptions();
  console.log("Unfollow:", accountId);
  toastInfo("Unfollowed");
}

function hidePost(postId) {
  closePostOptions();
  console.log("Hide post:", postId);
  toastInfo("Post hidden");
}

function addToFavorites(postId) {
  closePostOptions();
  console.log("Favorite:", postId);
  toastSuccess("Added to favorites");
}

function copyPostLink(postId) {
  closePostOptions();
  const link = `${location.origin}/post/${postId}`;

  navigator.clipboard
    .writeText(link)
    .then(() => toastSuccess("Link copied"))
    .catch(() => toastError("Failed to copy link"));
}

function shareToStory(postId) {
  closePostOptions();
  console.log("Share to story:", postId);
  toastInfo("Share to story (todo)");
}

function aboutThisAccount(accountId) {
  closePostOptions();
  console.log("About account:", accountId);
  toastInfo("About this account (todo)");
}

/* ===== Export ===== */
window.showPostOptions = showPostOptions;
window.closePostOptions = closePostOptions;
window.showReportReasons = showReportReasons;
window.submitReport = submitReport;
window.confirmDeletePost = confirmDeletePost;
window.closeDeleteConfirm = closeDeleteConfirm;
