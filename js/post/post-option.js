let currentPostOptions = null;
const pendingSavePosts = new Set();

function normalizePostId(value) {
  return (value || "").toString().trim().toLowerCase();
}

function parseSavedState(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function getPostSaveToggleElements(postId) {
  const normalizedPostId = normalizePostId(postId);
  if (!normalizedPostId) return [];

  return Array.from(document.querySelectorAll('[data-save-toggle="true"]')).filter(
    (el) => normalizePostId(el.dataset.postId) === normalizedPostId,
  );
}

function applySavedStateToToggle(toggleEl, isSaved) {
  if (!toggleEl) return;

  toggleEl.dataset.saved = isSaved ? "true" : "false";

  const icon =
    toggleEl.querySelector(".bookmark-icon") ||
    toggleEl.querySelector("svg") ||
    toggleEl.querySelector("i");
  if (icon) {
    icon.classList.toggle("saved", isSaved);
  }
}

function syncPostSaveState(postId, isSaved) {
  getPostSaveToggleElements(postId).forEach((toggleEl) =>
    applySavedStateToToggle(toggleEl, isSaved),
  );
}

function resolvePostSaveState(postId, fallback = false) {
  const toggleEl = getPostSaveToggleElements(postId)[0];
  if (!toggleEl) return fallback;

  const icon =
    toggleEl.querySelector(".bookmark-icon") ||
    toggleEl.querySelector("svg") ||
    toggleEl.querySelector("i");
  const iconSaved = icon ? icon.classList.contains("saved") : fallback;

  return parseSavedState(toggleEl.dataset.saved, iconSaved);
}

async function togglePostSave(postId, triggerEl = null, options = {}) {
  const normalizedPostId = normalizePostId(postId);
  if (!normalizedPostId) return false;

  if (pendingSavePosts.has(normalizedPostId)) {
    return resolvePostSaveState(postId, false);
  }

  const currentSavedState = options.hasOwnProperty("currentState")
    ? parseSavedState(options.currentState, false)
    : resolvePostSaveState(postId, false);
  const nextSavedState = !currentSavedState;

  pendingSavePosts.add(normalizedPostId);
  syncPostSaveState(postId, nextSavedState);
  if (triggerEl) {
    applySavedStateToToggle(triggerEl, nextSavedState);
  }

  try {
    const request = nextSavedState ? API.Posts.save : API.Posts.unsave;
    const res = await request(postId);

    if (res.status === 403 || res.status === 404) {
      syncPostSaveState(postId, currentSavedState);
      if (window.PostUtils?.hidePost) {
        PostUtils.hidePost(postId);
      }
      if (window.toastInfo) {
        toastInfo("This post is no longer available.");
      }
      return false;
    }

    if (!res.ok) throw new Error("Failed to update saved state");

    let confirmedSavedState = nextSavedState;
    try {
      const data = await res.json();
      if (typeof data?.isSavedByCurrentUser === "boolean") {
        confirmedSavedState = data.isSavedByCurrentUser;
      }
    } catch (_) {}

    syncPostSaveState(postId, confirmedSavedState);

    if (window.onPostSaveStateChanged) {
      window.onPostSaveStateChanged(postId, confirmedSavedState);
    }

    if (confirmedSavedState) {
      if (window.toastSuccess) toastSuccess("Post saved.");
    } else if (window.toastInfo) {
      toastInfo("Removed from saved.");
    }

    return confirmedSavedState;
  } catch (err) {
    console.error(err);
    syncPostSaveState(postId, currentSavedState);
    if (window.toastError) toastError("Could not update saved state.");
    return currentSavedState;
  } finally {
    pendingSavePosts.delete(normalizedPostId);
  }
}

async function togglePostSaveFromOptions(postId, isSavedByCurrentUser) {
  closePostOptions();
  return await togglePostSave(postId, null, { currentState: isSavedByCurrentUser });
}

/* ===== Show post options popup ===== */
function showPostOptions(
  postId,
  accountId,
  isOwnPost,
  isFollowing,
  isSavedByCurrentUser = false,
  postCode = "",
) {
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
    const safePostCodeForJs = (postCode || "")
      .toString()
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

    optionsHTML = `
      <button class="post-option post-option-danger" onclick="reportPost('${postId}')">
        <i data-lucide="flag"></i><span>Report</span>
      </button>
      <button class="post-option" onclick="hidePost('${postId}')">
        <i data-lucide="eye-off"></i><span>Hide</span>
      </button>
      <button class="post-option" onclick="copyPostLink('${safePostCodeForJs}')">
        <i data-lucide="link"></i><span>Copy link</span>
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
  togglePostSaveFromOptions(postId, resolvePostSaveState(postId, false));
}

function buildPostDetailPathForCopy(postCode) {
  const normalizedPostCode = (postCode || "").toString().trim();
  if (normalizedPostCode) {
    if (window.RouteHelper?.buildPostDetailPath) {
      return window.RouteHelper.buildPostDetailPath(normalizedPostCode);
    }
    return `/posts/${encodeURIComponent(normalizedPostCode)}`;
  }
  return "";
}

function buildAbsoluteHashLink(path) {
  const normalizedPath = (path || "").toString().trim() || "/posts";
  const hash = window.RouteHelper?.buildHash
    ? window.RouteHelper.buildHash(normalizedPath)
    : `#${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}${hash}`;
}

function copyPostLink(postCode = "") {
  closePostOptions();
  const path = buildPostDetailPathForCopy(postCode);
  if (!path) {
    toastError("Unable to copy post link.");
    return;
  }
  const link = buildAbsoluteHashLink(path);

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
window.togglePostSave = togglePostSave;
window.togglePostSaveFromOptions = togglePostSaveFromOptions;
window.syncPostSaveState = syncPostSaveState;
window.resolvePostSaveState = resolvePostSaveState;
