let currentPostOptions = null;
const pendingSavePosts = new Set();
const pendingUntagPosts = new Set();

function poT(key, params = {}, fallback = "") {
  return window.I18n?.t ? window.I18n.t(key, params, fallback || key) : fallback || key;
}

function normalizePostId(value) {
  return (value || "").toString().trim().toLowerCase();
}

function normalizeAccountId(value) {
  return (value || "").toString().trim().toLowerCase();
}

function getCurrentViewerAccountId() {
  return (
    normalizeAccountId(window.APP_CONFIG?.CURRENT_USER_ID) ||
    normalizeAccountId(localStorage.getItem("accountId"))
  );
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
        toastInfo(
          poT("post.options.postUnavailable", {}, "This post is no longer available."),
        );
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
      if (window.toastSuccess) {
        toastSuccess(poT("post.options.saved", {}, "Post saved"));
      }
    } else if (window.toastInfo) {
      toastInfo(
        poT("post.options.removedFromSaved", {}, "Removed from saved"),
      );
    }

    return confirmedSavedState;
  } catch (err) {
    console.error(err);
    syncPostSaveState(postId, currentSavedState);
    if (window.toastError) {
      toastError(
        poT("post.options.saveFailed", {}, "Could not update saved state"),
      );
    }
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
  isCurrentUserTagged = false,
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
        <i data-lucide="trash-2"></i><span>${poT("post.options.menu.delete", {}, "Delete")}</span>
      </button>
      <button class="post-option" onclick="editPost('${postId}')">
        <i data-lucide="edit"></i><span>${poT("post.options.menu.edit", {}, "Edit")}</span>
      </button>
    `;
  } else {
    const safePostCodeForJs = (postCode || "")
      .toString()
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

    optionsHTML = `
      <button class="post-option post-option-danger" onclick="reportPost('${postId}')">
        <i data-lucide="flag"></i><span>${poT("post.options.menu.report", {}, "Report")}</span>
      </button>
      ${
        isCurrentUserTagged
          ? `<button class="post-option" onclick="untagMeFromPost('${postId}')">
        <i data-lucide="tag"></i><span>${poT("post.options.menu.removeTag", {}, "Remove Tag")}</span>
      </button>`
          : ""
      }
      <button class="post-option" onclick="copyPostLink('${safePostCodeForJs}')">
        <i data-lucide="link"></i><span>${poT("post.options.menu.copyLink", {}, "Copy link")}</span>
      </button>
    `;
  }

  optionsHTML += `
    <button class="post-option post-option-cancel" onclick="closePostOptions()">
      ${poT("post.options.menu.cancel", {}, "Cancel")}
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

function untagMeFromPost(postId) {
  closePostOptions();
  showUntagConfirm(postId);
}

function showUntagConfirm(postId) {
  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "untagPostConfirmOverlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>${poT("post.options.untag.title", {}, "Remove tag from this post?")}</h3>
      <p>${poT("post.options.untag.description", {}, "You can be tagged again if the owner tags you later.")}</p>
    </div>
    <button class="post-option post-option-danger" onclick="confirmUntagMeFromPost('${postId}')">
      ${poT("post.options.untag.confirm", {}, "Remove Tag")}
    </button>
    <button class="post-option post-option-cancel" onclick="closeUntagConfirm()">
      ${poT("post.options.menu.cancel", {}, "Cancel")}
    </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) closeUntagConfirm();
  };
}

function closeUntagConfirm() {
  const overlay = document.getElementById("untagPostConfirmOverlay");
  if (!overlay) return;

  overlay.classList.remove("show");
  setTimeout(() => overlay.remove(), 200);
}

function parseUntagPostTagState(data, postId) {
  if (!data || typeof data !== "object") return null;

  const responsePostId = (data?.postId || data?.PostId || "").toString().trim();
  if (responsePostId && normalizePostId(responsePostId) !== normalizePostId(postId)) {
    return null;
  }

  const taggedAccounts = Array.isArray(data?.taggedAccountsPreview)
    ? data.taggedAccountsPreview
    : Array.isArray(data?.TaggedAccountsPreview)
      ? data.TaggedAccountsPreview
      : Array.isArray(data?.taggedAccounts)
        ? data.taggedAccounts
        : Array.isArray(data?.TaggedAccounts)
          ? data.TaggedAccounts
          : [];

  const totalRaw = Number(
    data?.totalTaggedAccounts ?? data?.TotalTaggedAccounts ?? taggedAccounts.length,
  );
  const totalTaggedAccounts =
    Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : taggedAccounts.length;

  return {
    taggedAccounts,
    totalTaggedAccounts,
    isCurrentUserTagged: Boolean(
      data?.isCurrentUserTagged ?? data?.IsCurrentUserTagged,
    ),
  };
}

function markPostAsCurrentUserUntagged(postId, latestState = null) {
  const normalizedPostId = normalizePostId(postId);
  if (!normalizedPostId) return;

  const feedPostEl = document.querySelector(`.post[data-post-id="${postId}"]`);
  if (feedPostEl) {
    const nextTaggedFlag = Boolean(latestState?.isCurrentUserTagged);
    feedPostEl.dataset.currentUserTagged = nextTaggedFlag ? "true" : "false";
  }

  let nextTaggedAccounts = Array.isArray(latestState?.taggedAccounts)
    ? latestState.taggedAccounts
    : null;
  let nextTotalTaggedAccounts = Number(latestState?.totalTaggedAccounts);

  if (
    window.currentPostDetailData &&
    normalizePostId(window.currentPostDetailData.postId) === normalizedPostId
  ) {
    window.currentPostDetailData.isCurrentUserTagged = Boolean(
      latestState?.isCurrentUserTagged,
    );

    const hasLatestTaggedAccounts = Array.isArray(nextTaggedAccounts);
    if (!hasLatestTaggedAccounts) {
      const currentViewerId = getCurrentViewerAccountId();
      if (currentViewerId && Array.isArray(window.currentPostDetailData.taggedAccounts)) {
        nextTaggedAccounts = window.currentPostDetailData.taggedAccounts.filter(
          (item) => normalizeAccountId(item?.accountId || item?.AccountId) !== currentViewerId,
        );
        nextTotalTaggedAccounts = nextTaggedAccounts.length;
      } else {
        nextTaggedAccounts = [];
        nextTotalTaggedAccounts = 0;
      }
    }

    if (Array.isArray(nextTaggedAccounts)) {
      window.currentPostDetailData.taggedAccounts = nextTaggedAccounts;
      const safeTotalTaggedAccounts =
        Number.isFinite(nextTotalTaggedAccounts) && nextTotalTaggedAccounts >= 0
          ? nextTotalTaggedAccounts
          : nextTaggedAccounts.length;
      window.currentPostDetailData.totalTaggedAccounts = safeTotalTaggedAccounts;

      const detailTaggedSummary = document.getElementById("detailTaggedSummary");
      if (detailTaggedSummary && window.PostUtils?.applyPostTagSummary) {
        window.PostUtils.applyPostTagSummary(
          detailTaggedSummary,
          window.currentPostDetailData,
        );
      }
    }
  }

  if (Array.isArray(nextTaggedAccounts) && window.PostUtils?.syncPostFromDetail) {
    window.PostUtils.syncPostFromDetail(
      postId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        taggedAccountsPreview: nextTaggedAccounts,
        totalTaggedAccounts:
          Number.isFinite(nextTotalTaggedAccounts) && nextTotalTaggedAccounts >= 0
            ? nextTotalTaggedAccounts
            : nextTaggedAccounts.length,
      },
    );
  }
}

async function confirmUntagMeFromPost(postId) {
  const genericUntagErrorMessage = poT(
    "post.options.untag.failed",
    {},
    "Could not remove tag. Please try again.",
  );

  if (!window.API?.Posts?.untagMe) {
    if (window.toastError) {
      toastError(
        poT("post.options.untag.unavailable", {}, "Untag is unavailable."),
      );
    }
    closeUntagConfirm();
    return;
  }

  const normalizedPostId = normalizePostId(postId);
  if (!normalizedPostId || pendingUntagPosts.has(normalizedPostId)) {
    return;
  }

  const actionBtn = document.querySelector(
    "#untagPostConfirmOverlay .post-option:not(.post-option-cancel)",
  );
  if (actionBtn) actionBtn.disabled = true;
  pendingUntagPosts.add(normalizedPostId);

  try {
    const res = await API.Posts.untagMe(postId);
    let responseData = null;
    try {
      responseData = await res.clone().json();
    } catch (_) {}

    if (res.status === 403 || res.status === 404) {
      closeUntagConfirm();
      if (window.toastInfo) {
        toastInfo(
          poT("post.options.postUnavailable", {}, "This post is no longer available."),
        );
      }
      if (window.PostUtils?.hidePost) {
        window.PostUtils.hidePost(postId);
      }
      return;
    }

    if (!res.ok) {
      throw new Error(genericUntagErrorMessage);
    }

    const latestState = parseUntagPostTagState(responseData, postId);

    closeUntagConfirm();
    markPostAsCurrentUserUntagged(postId, latestState);
    if (window.syncPostDetailNavigationAfterPostRemoved) {
      window.syncPostDetailNavigationAfterPostRemoved(postId);
    }
    if (window.onPostCurrentUserTagStateChanged) {
      window.onPostCurrentUserTagStateChanged(
        postId,
        Boolean(latestState?.isCurrentUserTagged),
      );
    }
    if (window.toastSuccess) {
      toastSuccess(poT("post.options.untag.success", {}, "Tag removed"));
    }
  } catch (err) {
    console.error(err);
    if (window.toastError) {
      toastError(genericUntagErrorMessage);
    }
    if (actionBtn) actionBtn.disabled = false;
    closeUntagConfirm();
  } finally {
    pendingUntagPosts.delete(normalizedPostId);
  }
}

function showDeleteConfirm(postId) {
    const overlay = document.createElement("div");
    overlay.className = "post-options-overlay";
    overlay.id = "deletePostConfirmOverlay";

    const popup = document.createElement("div");
    popup.className = "post-options-popup";

    popup.innerHTML = `
        <div class="post-options-header">
            <h3>${poT("post.options.deleteConfirm.title", {}, "Delete this post?")}</h3>
            <p>${poT("post.options.deleteConfirm.description", {}, "This action cannot be undone.")}</p>
        </div>
        <button class="post-option post-option-danger" onclick="confirmDeletePost('${postId}')">
            ${poT("post.options.deleteConfirm.confirm", {}, "Delete")}
        </button>
        <button class="post-option post-option-cancel" onclick="closeDeleteConfirm()">
            ${poT("post.options.menu.cancel", {}, "Cancel")}
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
        
        if (window.toastSuccess) {
          toastSuccess(
            poT("post.options.deleteConfirm.success", {}, "Post deleted"),
          );
        }

    } catch (err) {
        console.error(err);
        if (window.toastError) {
          toastError(
            poT(
              "post.options.deleteConfirm.failed",
              {},
              "Could not delete the post",
            ),
          );
        }
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
      toastInfo(
        poT("post.options.editUnavailable", {}, "Edit post module is not loaded"),
      );
  }
}

function hidePostLikes(postId) {
  closePostOptions();
  console.log("Hide likes:", postId);
  toastInfo(poT("post.options.likeCountHidden", {}, "Like count hidden"));
}

function turnOffCommenting(postId) {
  closePostOptions();
  console.log("Turn off commenting:", postId);
  toastInfo(poT("post.options.commentingOff", {}, "Commenting turned off"));
}

/* ===== Other post actions ===== */
/* ===== Generic Report Logic ===== */
function showReportReasons(targetId, type = 'post') {
  // Close any existing overlays first
  closePostOptions();
  document.querySelector(".post-options-overlay")?.remove();

  const normalizedType = normalizeReportType(type);

  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>${poT("post.options.reportDialog.title", {}, "Report")}</h3>
      <p>${getReportDescription(normalizedType)}</p>
    </div>
    <button class="post-option" onclick="submitReport('${targetId}', 'spam', '${normalizedType}')">${poT("post.options.reportDialog.spam", {}, "It's spam")}</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'inappropriate', '${normalizedType}')">${poT("post.options.reportDialog.nudity", {}, "Nudity or sexual activity")}</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'hate', '${normalizedType}')">${poT("post.options.reportDialog.hate", {}, "Hate speech or symbols")}</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'violence', '${normalizedType}')">${poT("post.options.reportDialog.violence", {}, "Violence or dangerous organizations")}</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'false', '${normalizedType}')">${poT("post.options.reportDialog.falseInformation", {}, "False information")}</button>
    <button class="post-option" onclick="submitReport('${targetId}', 'scam', '${normalizedType}')">${poT("post.options.reportDialog.scam", {}, "Scam or fraud")}</button>
    <button class="post-option post-option-cancel" onclick="this.closest('.post-options-overlay').remove()">${poT("post.options.menu.cancel", {}, "Cancel")}</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function normalizeReportType(type = "post") {
  const normalizedType = (type || "").toString().trim().toLowerCase();
  switch (normalizedType) {
    case "account":
    case "profile":
      return "account";
    case "story":
      return "story";
    case "comment":
      return "comment";
    case "reply":
      return "reply";
    default:
      return "post";
  }
}

function getReportApiTargetType(type = "post") {
  switch (normalizeReportType(type)) {
    case "account":
      return "Account";
    case "story":
      return "Story";
    case "comment":
      return "Comment";
    case "reply":
      return "Reply";
    default:
      return "Post";
  }
}

function getReportDescription(type = "post") {
  switch (normalizeReportType(type)) {
    case "account":
      return poT(
        "post.options.reportDialog.descriptionAccount",
        {},
        "Why are you reporting this account?",
      );
    case "story":
      return poT(
        "post.options.reportDialog.descriptionStory",
        {},
        "Why are you reporting this story?",
      );
    case "reply":
      return poT(
        "post.options.reportDialog.descriptionReply",
        {},
        "Why are you reporting this reply?",
      );
    case "comment":
      return poT(
        "post.options.reportDialog.descriptionComment",
        {},
        "Why are you reporting this comment?",
      );
    default:
      return poT(
        "post.options.reportDialog.descriptionPost",
        {},
        "Why are you reporting this post?",
      );
  }
}

function getReportSuccessMessage(type = "post") {
  switch (normalizeReportType(type)) {
    case "account":
      return poT(
        "post.options.reportDialog.successAccount",
        {},
        "Thanks for reporting this account. We'll review it",
      );
    case "story":
      return poT(
        "post.options.reportDialog.successStory",
        {},
        "Thanks for reporting this story. We'll review it",
      );
    case "reply":
      return poT(
        "post.options.reportDialog.successReply",
        {},
        "Thanks for reporting this reply. We'll review it",
      );
    case "comment":
      return poT(
        "post.options.reportDialog.successComment",
        {},
        "Thanks for reporting this comment. We'll review it",
      );
    default:
      return poT(
        "post.options.reportDialog.successPost",
        {},
        "Thanks for reporting this post. We'll review it",
      );
  }
}

async function getReportFailureMessage(response) {
  let serverMessage = "";

  try {
    const payload = await response.clone().json();
    serverMessage = (payload?.message || "").toString().trim().toLowerCase();
  } catch (_) {
    serverMessage = "";
  }

  if (
    response.status === 429 ||
    serverMessage.includes("sending reports too quickly")
  ) {
    return poT(
      "post.options.reportDialog.rateLimited",
      {},
      "You're reporting too fast right now. Please try again shortly",
    );
  }

  if (
    serverMessage.includes("already have an open report") ||
    serverMessage.includes("already reported")
  ) {
    return poT(
      "post.options.reportDialog.alreadyReported",
      {},
      "You've already reported this item and it's still under review",
    );
  }

  return poT(
    "post.options.reportDialog.failed",
    {},
    "We couldn't send your report right now",
  );
}

async function submitReport(targetId, reason, type = 'post') {
  document.querySelector(".post-options-overlay")?.remove();

  const normalizedType = normalizeReportType(type);
  const normalizedTargetId = (targetId || "").toString().trim();
  const normalizedReason = (reason || "").toString().trim().toLowerCase();

  if (!normalizedTargetId || !normalizedReason || typeof window.apiFetch !== "function") {
    toastError(
      poT(
        "post.options.reportDialog.failed",
        {},
        "We couldn't send your report right now",
      ),
    );
    return;
  }

  try {
    const response = await window.apiFetch("/Reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetType: getReportApiTargetType(normalizedType),
        targetId: normalizedTargetId,
        reasonCode: normalizedReason,
      }),
    });

    if (!response.ok) {
      const failureMessage = await getReportFailureMessage(response);
      throw new Error(failureMessage);
    }

    toastSuccess(getReportSuccessMessage(normalizedType));
  } catch (error) {
    console.error("Failed to submit report:", error);
    toastError(
      error instanceof Error && error.message
        ? error.message
        : poT(
            "post.options.reportDialog.failed",
            {},
            "We couldn't send your report right now",
          ),
    );
  }
}

function reportPost(postId) {
    showReportReasons(postId, 'post');
}

function followFromPost(accountId) {
  closePostOptions();
  console.log("Follow:", accountId);
  toastSuccess(poT("post.options.following", {}, "Following"));
}

function unfollowFromPost(accountId) {
  closePostOptions();
  console.log("Unfollow:", accountId);
  toastInfo(poT("post.options.unfollowed", {}, "Unfollowed"));
}

function hidePost(postId) {
  closePostOptions();
  console.log("Hide post:", postId);
  toastInfo(poT("post.options.hidden", {}, "Post hidden"));
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
    toastError(
      poT("post.options.copyUnavailable", {}, "Unable to copy post link"),
    );
    return;
  }
  const link = buildAbsoluteHashLink(path);

  navigator.clipboard
    .writeText(link)
    .then(() => toastSuccess(poT("post.options.copySuccess", {}, "Link copied")))
    .catch(() => toastError(poT("post.options.copyFailed", {}, "Failed to copy link")));
}

function shareToStory(postId) {
  closePostOptions();
  console.log("Share to story:", postId);
  toastInfo(
    poT("post.options.shareToStorySoon", {}, "Share to story is coming soon"),
  );
}

function aboutThisAccount(accountId) {
  closePostOptions();
  console.log("About account:", accountId);
  toastInfo(
    poT("post.options.aboutAccountSoon", {}, "About this account is coming soon"),
  );
}

/* ===== Export ===== */
window.showPostOptions = showPostOptions;
window.closePostOptions = closePostOptions;
window.showReportReasons = showReportReasons;
window.submitReport = submitReport;
window.confirmDeletePost = confirmDeletePost;
window.closeDeleteConfirm = closeDeleteConfirm;
window.untagMeFromPost = untagMeFromPost;
window.confirmUntagMeFromPost = confirmUntagMeFromPost;
window.closeUntagConfirm = closeUntagConfirm;
window.togglePostSave = togglePostSave;
window.togglePostSaveFromOptions = togglePostSaveFromOptions;
window.syncPostSaveState = syncPostSaveState;
window.resolvePostSaveState = resolvePostSaveState;
