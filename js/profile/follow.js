/**
 * follow.js
 * Handles follow/request/unfollow logic and UI synchronization
 */

(function (global) {
  const FollowModule = {};
  const followRelationOverrides = new Map();
  const FOLLOW_RELATION_OVERRIDE_TTL_MS = 15 * 1000;

  const FOLLOW_RELATION_STATUS = Object.freeze({
    NONE: 0,
    REQUESTED: 1,
    FOLLOWING: 2,
  });

  const FOLLOW_PRIVACY = Object.freeze({
    ANYONE: 0,
    PRIVATE: 1,
  });

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function resolveFollowActionErrorMessage(
    status,
    action,
    isRequested = false,
  ) {
    if (status === 401)
      return "Your session has expired. Please sign in again.";
    if (status === 403) {
      return action === "follow"
        ? "You do not have permission to follow this account."
        : "You do not have permission to update this follow state.";
    }
    if (status === 404 || status === 410) {
      return "This account is no longer available.";
    }
    if (status === 409) {
      return action === "follow"
        ? "Follow state changed. Please refresh and try again."
        : "Follow state changed. Please refresh and try again.";
    }
    if (status === 400) {
      return action === "follow"
        ? "Could not follow this account right now."
        : isRequested
          ? "Could not discard this follow request right now."
          : "Could not unfollow this account right now.";
    }
    return action === "follow"
      ? "Could not follow this account. Please try again."
      : isRequested
        ? "Could not discard this follow request. Please try again."
        : "Could not unfollow this account. Please try again.";
  }

  function pickValue(source, keys = []) {
    if (!source || typeof source !== "object") return undefined;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        return source[key];
      }
    }
    return undefined;
  }

  function hasAnyKey(source, keys = []) {
    if (!source || typeof source !== "object") return false;
    for (let i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(source, keys[i])) {
        return true;
      }
    }
    return false;
  }

  function readNumber(source, keys, fallback) {
    const resolvedFallback = arguments.length >= 3 ? fallback : 0;
    const value = pickValue(source, keys);
    if (value === undefined || value === null || value === "") {
      return resolvedFallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : resolvedFallback;
  }

  function readOptionalBoolean(source, keys) {
    const value = pickValue(source, keys);
    if (value === undefined || value === null) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
    return undefined;
  }

  function normalizeRelationStatus(rawValue, fallbackStatus) {
    const parsed = Number(rawValue);
    if (
      parsed === FOLLOW_RELATION_STATUS.NONE ||
      parsed === FOLLOW_RELATION_STATUS.REQUESTED ||
      parsed === FOLLOW_RELATION_STATUS.FOLLOWING
    ) {
      return parsed;
    }
    return fallbackStatus;
  }

  function normalizeFollowPayload(payload = null, fallbackIsFollowing) {
    const explicitFollowing = readOptionalBoolean(payload, [
      "isFollowedByCurrentUser",
      "IsFollowedByCurrentUser",
      "isFollowing",
      "IsFollowing",
    ]);
    const explicitRequested = readOptionalBoolean(payload, [
      "isFollowRequestPendingByCurrentUser",
      "IsFollowRequestPendingByCurrentUser",
      "isFollowRequestPending",
      "IsFollowRequestPending",
      "isFollowRequested",
      "IsFollowRequested",
      "isRequested",
      "IsRequested",
      "requested",
      "Requested",
    ]);
    const rawRelationStatus = pickValue(payload, [
      "relationStatus",
      "RelationStatus",
    ]);
    const hasExplicitFollowing = explicitFollowing !== undefined;
    const hasExplicitRequested = explicitRequested !== undefined;

    let inferredStatus;
    if (explicitFollowing === true) {
      inferredStatus = FOLLOW_RELATION_STATUS.FOLLOWING;
    } else if (explicitRequested === true) {
      inferredStatus = FOLLOW_RELATION_STATUS.REQUESTED;
    } else if (hasExplicitFollowing && hasExplicitRequested) {
      inferredStatus = FOLLOW_RELATION_STATUS.NONE;
    } else if (rawRelationStatus !== undefined && rawRelationStatus !== null) {
      inferredStatus = normalizeRelationStatus(
        rawRelationStatus,
        FOLLOW_RELATION_STATUS.NONE,
      );
    } else if (
      !hasExplicitFollowing &&
      !hasExplicitRequested &&
      fallbackIsFollowing === true
    ) {
      inferredStatus = FOLLOW_RELATION_STATUS.FOLLOWING;
    } else {
      inferredStatus = FOLLOW_RELATION_STATUS.NONE;
    }

    const relationStatus = inferredStatus;
    const isFollowing = relationStatus === FOLLOW_RELATION_STATUS.FOLLOWING;
    const isRequested = relationStatus === FOLLOW_RELATION_STATUS.REQUESTED;

    return {
      relationStatus,
      isFollowing,
      isRequested,
      followers: readNumber(payload, ["followers", "Followers"], undefined),
      following: readNumber(payload, ["following", "Following"], undefined),
      targetFollowPrivacy: readNumber(
        payload,
        ["targetFollowPrivacy", "TargetFollowPrivacy"],
        FOLLOW_PRIVACY.ANYONE,
      ),
    };
  }

  function buildRelationStatus(isFollowing, isRequested) {
    if (isFollowing) return FOLLOW_RELATION_STATUS.FOLLOWING;
    if (isRequested) return FOLLOW_RELATION_STATUS.REQUESTED;
    return FOLLOW_RELATION_STATUS.NONE;
  }

  function getRelationOverride(accountId) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId) return null;

    const override = followRelationOverrides.get(normalizedAccountId);
    if (!override) return null;

    if (Date.now() - override.updatedAt > FOLLOW_RELATION_OVERRIDE_TTL_MS) {
      followRelationOverrides.delete(normalizedAccountId);
      return null;
    }

    return override;
  }

  function setRelationOverride(accountId, relation) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId || !relation) return;

    followRelationOverrides.set(normalizedAccountId, {
      isFollowing: relation.isFollowing === true,
      isRequested: relation.isRequested === true,
      relationStatus: buildRelationStatus(
        relation.isFollowing === true,
        relation.isRequested === true,
      ),
      targetFollowPrivacy: relation.targetFollowPrivacy,
      updatedAt: Date.now(),
    });
  }

  function resolveEffectiveFollowRelation(
    accountId,
    payload = null,
    fallbackIsFollowing,
  ) {
    const override = getRelationOverride(accountId);
    const effectivePayload =
      override && payload && typeof payload === "object"
        ? {
            ...payload,
            isFollowedByCurrentUser: override.isFollowing,
            isFollowRequestPendingByCurrentUser: override.isRequested,
            relationStatus: override.relationStatus,
            targetFollowPrivacy:
              override.targetFollowPrivacy ??
              pickValue(payload, [
                "targetFollowPrivacy",
                "TargetFollowPrivacy",
              ]),
          }
        : override
          ? {
              isFollowedByCurrentUser: override.isFollowing,
              isFollowRequestPendingByCurrentUser: override.isRequested,
              relationStatus: override.relationStatus,
              targetFollowPrivacy: override.targetFollowPrivacy,
            }
          : payload;

    return normalizeFollowPayload(effectivePayload, fallbackIsFollowing);
  }

  function getCurrentProfileDataAccountId() {
    const currentProfileData =
      global.ProfilePage && typeof global.ProfilePage.getData === "function"
        ? global.ProfilePage.getData()
        : null;
    const info =
      currentProfileData?.accountInfo ||
      currentProfileData?.AccountInfo ||
      currentProfileData?.account ||
      currentProfileData?.Account ||
      {};

    return normalizeAccountId(
      info.accountId || info.AccountId || info.id || info.Id,
    );
  }

  function isViewingCurrentProfile(accountId) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId) return false;

    const routeProfileId =
      typeof global.getProfileAccountId === "function"
        ? normalizeAccountId(global.getProfileAccountId())
        : "";
    if (routeProfileId && routeProfileId === normalizedAccountId) {
      return true;
    }

    return getCurrentProfileDataAccountId() === normalizedAccountId;
  }

  function patchOwnProfileCache(followers, following) {
    if (!global.PageCache) return;
    if (followers === undefined && following === undefined) return;

    const myId = normalizeAccountId(localStorage.getItem("accountId"));
    const myUsername = normalizeAccountId(localStorage.getItem("username"));
    const cacheKeys = Array.from(
      new Set([
        "profile:me",
        myId ? `profile:${myId}` : "",
        myUsername ? `profile:${myUsername}` : "",
      ]),
    ).filter(Boolean);

    cacheKeys.forEach((cacheKey) => {
      if (!PageCache.has(cacheKey)) return;

      try {
        const cached = PageCache.get(cacheKey);
        if (!cached) return;

        if (cached.fragment) {
          if (followers !== undefined) {
            const followersEl = cached.fragment.querySelector(
              "#profile-followers-count",
            );
            if (followersEl) {
              followersEl.textContent = followers;
            }
          }

          if (following !== undefined) {
            const followingEl = cached.fragment.querySelector(
              "#profile-following-count",
            );
            if (followingEl) {
              followingEl.textContent = following;
            }
          }
        }

        const cachedProfileData = cached.data?.currentProfileData;
        if (!cachedProfileData) return;

        const cachedFollowInfo =
          cachedProfileData.followInfo || cachedProfileData.FollowInfo || {};
        cachedProfileData.followInfo = cachedFollowInfo;
        cachedProfileData.FollowInfo = cachedFollowInfo;

        if (followers !== undefined) {
          cachedFollowInfo.followers = followers;
          cachedFollowInfo.Followers = followers;
          cachedProfileData.followerCount = followers;
          cachedProfileData.FollowerCount = followers;
        }

        if (following !== undefined) {
          cachedFollowInfo.following = following;
          cachedFollowInfo.Following = following;
          cachedProfileData.followingCount = following;
          cachedProfileData.FollowingCount = following;
        }
      } catch (error) {
        console.warn(`Failed to patch own profile cache (${cacheKey}).`, error);
      }
    });
  }

  function isRequestedButton(btn) {
    if (!btn?.classList) return false;
    return (
      btn.classList.contains("requested") ||
      btn.classList.contains("profile-btn-requested") ||
      btn.classList.contains("profile-preview-btn-requested")
    );
  }

  function isFollowingButton(btn) {
    if (!btn?.classList) return false;
    return (
      btn.classList.contains("following") ||
      btn.classList.contains("profile-btn-following") ||
      btn.classList.contains("profile-preview-btn-following")
    );
  }

  function applyStandardFollowButton(btn, relation, accountId) {
    if (!btn) return;

    if (relation.isFollowing) {
      btn.className = "follow-btn following";
      btn.innerHTML = '<i data-lucide="check"></i> <span>Following</span>';
      if (accountId) {
        btn.onclick = () => FollowModule.showUnfollowConfirm(accountId, btn);
      }
      return;
    }

    if (relation.isRequested) {
      btn.className = "follow-btn requested";
      btn.innerHTML = '<i data-lucide="clock-3"></i> <span>Request Sent</span>';
      if (accountId) {
        btn.onclick = () => FollowModule.showUnfollowConfirm(accountId, btn);
      }
      return;
    }

    btn.className = "follow-btn";
    btn.innerHTML = '<i data-lucide="user-plus"></i> <span>Follow</span>';
    if (accountId) {
      btn.onclick = function () {
        FollowModule.followUser(accountId, btn);
      };
    }
  }

  function applyProfilePreviewButton(btn, relation, accountId) {
    if (!btn) return;

    if (relation.isFollowing) {
      btn.className = "profile-preview-btn profile-preview-btn-following";
      btn.innerHTML = '<i data-lucide="check"></i><span>Following</span>';
      btn.onclick = (event) => {
        if (typeof global.toggleFollowMenu === "function") {
          global.toggleFollowMenu(event, accountId);
        } else {
          FollowModule.showUnfollowConfirm(accountId, btn);
        }
      };
      return;
    }

    if (relation.isRequested) {
      btn.className = "profile-preview-btn profile-preview-btn-requested";
      btn.innerHTML = '<i data-lucide="clock-3"></i><span>Request Sent</span>';
      btn.onclick = () => FollowModule.showUnfollowConfirm(accountId, btn);
      return;
    }

    btn.className = "profile-preview-btn profile-preview-btn-follow";
    btn.innerHTML = '<i data-lucide="user-plus"></i><span>Follow</span>';
    btn.onclick = () => FollowModule.followUser(accountId, btn);
  }

  function applyProfilePageButton(btn, relation, accountId) {
    if (!btn) return;

    if (relation.isFollowing) {
      btn.className = "profile-btn profile-btn-following";
      btn.innerHTML = '<i data-lucide="check"></i><span>Following</span>';
      btn.onclick = (event) =>
        FollowModule.showUnfollowConfirm(accountId, event.currentTarget);
      return;
    }

    if (relation.isRequested) {
      btn.className = "profile-btn profile-btn-requested";
      btn.innerHTML = '<i data-lucide="clock-3"></i><span>Request Sent</span>';
      btn.onclick = (event) =>
        FollowModule.showUnfollowConfirm(accountId, event.currentTarget);
      return;
    }

    btn.className = "profile-btn profile-btn-follow";
    btn.innerHTML = '<i data-lucide="user-plus"></i><span>Follow</span>';
    btn.onclick = () => FollowModule.followUser(accountId, btn);
  }

  function applyTriggeredButtonState(btn, relation, accountId) {
    if (!btn) return;

    if (
      btn.classList.contains("profile-preview-btn") ||
      btn.classList.contains("profile-preview-btn-follow") ||
      btn.classList.contains("profile-preview-btn-following") ||
      btn.classList.contains("profile-preview-btn-requested")
    ) {
      applyProfilePreviewButton(btn, relation, accountId);
      return;
    }

    if (
      btn.classList.contains("profile-btn") ||
      btn.classList.contains("profile-btn-follow") ||
      btn.classList.contains("profile-btn-following") ||
      btn.classList.contains("profile-btn-requested")
    ) {
      applyProfilePageButton(btn, relation, accountId);
      return;
    }

    applyStandardFollowButton(btn, relation, accountId);
  }

  function applyVisibleProfilePreviewButton(accountId, relation) {
    if (
      typeof global.getProfilePreviewAccountId !== "function" ||
      normalizeAccountId(global.getProfilePreviewAccountId()) !==
        normalizeAccountId(accountId)
    ) {
      return;
    }

    const previewBtn = document.getElementById("followBtn");
    if (previewBtn) {
      applyProfilePreviewButton(
        previewBtn,
        relation,
        global.getProfilePreviewAccountId() || accountId,
      );
    }
  }

  function applyVisibleProfilePageButton(accountId, relation) {
    if (!isViewingCurrentProfile(accountId)) return;

    const followBtn = document.querySelector(
      "#profile-action-btn .profile-btn-follow, #profile-action-btn .profile-btn-following, #profile-action-btn .profile-btn-requested",
    );
    if (followBtn) {
      applyProfilePageButton(followBtn, relation, accountId);
    }
  }

  function applyVisibleRelationButtons(accountId, relation, btn = null) {
    if (btn) {
      applyTriggeredButtonState(btn, relation, accountId);
    }

    applyVisibleProfilePageButton(accountId, relation);
    applyVisibleProfilePreviewButton(accountId, relation);
  }

  function syncResolvedRelation(accountId, relation, btn = null) {
    if (!relation) return;

    setRelationOverride(accountId, relation);
    applyVisibleRelationButtons(accountId, relation, btn);
    if (global.lucide && typeof global.lucide.createIcons === "function") {
      global.lucide.createIcons();
    }
    FollowModule.syncFollowStatus(accountId, relation.isFollowing, {
      followers: relation.followers,
      following: relation.following,
      isFollowedByCurrentUser: relation.isFollowing,
      isFollowRequestPendingByCurrentUser: relation.isRequested,
      relationStatus: relation.relationStatus,
      targetFollowPrivacy: relation.targetFollowPrivacy,
    });
  }

  FollowModule.normalizeFollowPayload = normalizeFollowPayload;
  FollowModule.resolveEffectiveFollowRelation = resolveEffectiveFollowRelation;
  FollowModule.getRelationOverride = getRelationOverride;
  FollowModule.setRelationOverride = setRelationOverride;
  FollowModule.RELATION_STATUS = FOLLOW_RELATION_STATUS;
  FollowModule.FOLLOW_PRIVACY = FOLLOW_PRIVACY;

  FollowModule.fetchRelationStatus = async function (accountId) {
    if (!global.API?.Follows?.status) return null;
    const res = await API.Follows.status(accountId);
    if (!res?.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const relation = normalizeFollowPayload(data);
    setRelationOverride(accountId, relation);
    return relation;
  };

  /**
   * Follow a user (public follow or private follow request)
   * @param {string} accountId
   * @param {HTMLElement} [btn]
   */
  FollowModule.followUser = async function (accountId, btn) {
    if (btn) btn.disabled = true;

    try {
      const res = await API.Follows.follow(accountId);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }

      if (!res.ok) {
        throw new Error(resolveFollowActionErrorMessage(res.status, "follow"));
      }

      const relation = normalizeFollowPayload(data, true);
      if (
        !relation.isFollowing &&
        !relation.isRequested &&
        relation.targetFollowPrivacy === FOLLOW_PRIVACY.PRIVATE
      ) {
        relation.isRequested = true;
        relation.relationStatus = FOLLOW_RELATION_STATUS.REQUESTED;
      }
      setRelationOverride(accountId, relation);
      if (relation.isRequested) {
        if (global.toastInfo) global.toastInfo("Follow request sent");
      } else if (global.toastSuccess) {
        global.toastSuccess("Following");
      }

      applyVisibleRelationButtons(accountId, relation, btn);
      if (global.lucide && typeof global.lucide.createIcons === "function") {
        global.lucide.createIcons();
      }
      FollowModule.syncFollowStatus(accountId, relation.isFollowing, {
        followers: relation.followers,
        following: relation.following,
        isFollowedByCurrentUser: relation.isFollowing,
        isFollowRequestPendingByCurrentUser: relation.isRequested,
        relationStatus: relation.relationStatus,
        targetFollowPrivacy: relation.targetFollowPrivacy,
      });
      return relation;
    } catch (err) {
      console.error(err);
      if (global.toastError) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : resolveFollowActionErrorMessage(0, "follow");
        global.toastError(message);
      }
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  /**
   * Unfollow user or discard follow request
   * @param {string} accountId
   * @param {HTMLElement} [btn]
   */
  FollowModule.unfollowUser = async function (accountId, btn) {
    if (btn) btn.disabled = true;
    const wasRequested = isRequestedButton(btn);

    try {
      const res = await API.Follows.unfollow(accountId);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }

      if (!res.ok) {
        if (wasRequested) {
          const resolvedRelation = await FollowModule.fetchRelationStatus(accountId);
          if (resolvedRelation && !resolvedRelation.isRequested) {
            syncResolvedRelation(accountId, resolvedRelation, btn);
            return resolvedRelation;
          }
        }
        throw new Error(
          resolveFollowActionErrorMessage(res.status, "unfollow", wasRequested),
        );
      }

      if (wasRequested) {
        if (global.toastInfo) global.toastInfo("Follow request discarded");
      } else if (global.toastInfo) {
        global.toastInfo("Unfollowed");
      }

      const relation = normalizeFollowPayload(data, false);
      syncResolvedRelation(accountId, relation, btn);
      return relation;
    } catch (err) {
      console.error(err);
      if (global.toastError) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : resolveFollowActionErrorMessage(0, "unfollow", wasRequested);
        global.toastError(message);
      }
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  async function resolveUnfollowConfirmIntent(accountId, btn, fallbackStatus = null) {
    let latestStatus = fallbackStatus;
    try {
      latestStatus = await FollowModule.fetchRelationStatus(accountId);
    } catch (_) {
      latestStatus = fallbackStatus;
    }

    if (latestStatus) {
      syncResolvedRelation(accountId, latestStatus, btn);
      if (!latestStatus.isRequested && !latestStatus.isFollowing) {
        return {
          shouldExecute: false,
          relation: latestStatus,
        };
      }
    }

    return {
      shouldExecute: true,
      relation: latestStatus,
    };
  }

  /**
   * Show confirmation popup for unfollow or discard request
   * @param {string} accountId
   * @param {HTMLElement} [btn]
   */
  FollowModule.showUnfollowConfirm = async function (accountId, btn, options = null) {
    if (document.querySelector(".unfollow-overlay")) return;

    let status = null;
    try {
      status = await FollowModule.fetchRelationStatus(accountId);
    } catch (_) {
      status = null;
    }

    const staleRequestedButton =
      isRequestedButton(btn) &&
      status &&
      status.isRequested !== true;

    if (staleRequestedButton) {
      syncResolvedRelation(accountId, status, btn);
      if (typeof options?.onResolved === "function") {
        options.onResolved(status);
      }
      return;
    }

    const isRequested =
      status?.isRequested === true
        ? true
        : status?.isFollowing === true
          ? false
          : isRequestedButton(btn);
    const isPrivateTarget =
      status?.targetFollowPrivacy === FOLLOW_PRIVACY.PRIVATE;

    const title = isRequested
      ? "Stop following this account?"
      : "Unfollow this account?";
    const description = isRequested
      ? "If your request is still pending, it will be removed. If it was already accepted, you will unfollow this account."
      : isPrivateTarget
        ? "If you follow again later, you will need this account to approve your request."
        : "You can always follow them again later.";
    const confirmText = isRequested ? "Confirm" : "Unfollow";

    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";
    popup.innerHTML = `
      <div class="unfollow-content">
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <div class="unfollow-actions">
        <button class="unfollow-btn unfollow-confirm" id="unfollowConfirm">${confirmText}</button>
        <button class="unfollow-btn unfollow-cancel" id="unfollowCancel">Cancel</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("show"));

    const closePopup = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    };

    const confirmBtn = document.getElementById("unfollowConfirm");
    const cancelBtn = document.getElementById("unfollowCancel");
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const confirmIntent = await resolveUnfollowConfirmIntent(
          accountId,
          btn,
          status,
        );
        if (!confirmIntent.shouldExecute) {
          if (typeof options?.onResolved === "function") {
            options.onResolved(confirmIntent.relation);
          }
          closePopup();
          return;
        }

        const relation = await FollowModule.unfollowUser(accountId, btn);
        if (typeof options?.onResolved === "function") {
          options.onResolved(relation ?? confirmIntent.relation);
        }
        closePopup();
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = closePopup;
    }
    overlay.onclick = (event) => {
      if (event.target === overlay) closePopup();
    };
  };

  FollowModule.showRemoveFollowerConfirm = async function (
    accountId,
    btn,
    options = null,
  ) {
    if (document.querySelector(".unfollow-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";
    popup.innerHTML = `
      <div class="unfollow-content">
        <h3>Remove this follower?</h3>
        <p>They will no longer follow you, but you can still follow them if you want.</p>
      </div>
      <div class="unfollow-actions">
        <button class="unfollow-btn unfollow-confirm" id="removeFollowerConfirm">Remove</button>
        <button class="unfollow-btn unfollow-cancel" id="removeFollowerCancel">Cancel</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("show"));

    const closePopup = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    };

    const confirmBtn = document.getElementById("removeFollowerConfirm");
    const cancelBtn = document.getElementById("removeFollowerCancel");
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const result =
          typeof options?.execute === "function"
            ? await options.execute()
            : null;
        if (typeof options?.onResolved === "function") {
          options.onResolved(result);
        }
        closePopup();
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = closePopup;
    }
    overlay.onclick = (event) => {
      if (event.target === overlay) closePopup();
    };
  };

  /**
   * Sync follow relation across pages/components
   * @param {string} accountId
   * @param {boolean|undefined} isFollowing
   * @param {object|null} freshData
   */
  FollowModule.syncFollowStatus = function (
    accountId,
    isFollowing,
    freshData = null,
  ) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId) return;
    const myId = normalizeAccountId(localStorage.getItem("accountId"));
    const myUsername = normalizeAccountId(localStorage.getItem("username"));
    const isMe =
      (myId && normalizedAccountId === myId) ||
      (myUsername && normalizedAccountId === myUsername);

    const relation = normalizeFollowPayload(freshData, isFollowing);
    const followers = relation.followers;
    const following = relation.following;
    const hasRelationState =
      isFollowing !== undefined ||
      hasAnyKey(freshData, [
        "isFollowedByCurrentUser",
        "IsFollowedByCurrentUser",
        "isFollowing",
        "IsFollowing",
        "isFollowRequestPendingByCurrentUser",
        "IsFollowRequestPendingByCurrentUser",
        "isFollowRequestPending",
        "IsFollowRequestPending",
        "isFollowRequested",
        "IsFollowRequested",
        "relationStatus",
        "RelationStatus",
      ]);
    const hasTargetFollowPrivacy = hasAnyKey(freshData, [
      "targetFollowPrivacy",
      "TargetFollowPrivacy",
    ]);

    if (hasRelationState) {
      setRelationOverride(normalizedAccountId, relation);
      applyVisibleRelationButtons(normalizedAccountId, relation);
    }

    // 1. update cached feed author relation flags
    if (global.PageCache && PageCache.has("home")) {
      const homeCache = PageCache.get("home");
      if (homeCache?.data?.posts) {
        homeCache.data.posts.forEach((post) => {
          const authorId = normalizeAccountId(
            post?.author?.accountId || post?.author?.AccountId,
          );
          if (authorId === normalizedAccountId && hasRelationState) {
            post.author.isFollowedByCurrentUser = relation.isFollowing;
            post.author.IsFollowedByCurrentUser = relation.isFollowing;
            post.author.isFollowRequestPendingByCurrentUser =
              relation.isRequested;
            post.author.IsFollowRequestPendingByCurrentUser =
              relation.isRequested;
          }
        });
      }
    }

    // 2. patch cached own profile counts so returning to profile keeps the latest stats
    if (isMe) {
      patchOwnProfileCache(followers, following);
    }

    // 3. update feed follow buttons
    if (hasRelationState) {
      updateFeedButtons(normalizedAccountId, relation, document);
      if (global.PageCache && PageCache.has("home")) {
        const homeCache = PageCache.get("home");
        if (homeCache?.fragment) {
          updateFeedButtons(normalizedAccountId, relation, homeCache.fragment);
        }
      }
    }

    // 4. update profile preview
    if (
      typeof global.getProfilePreviewAccountId === "function" &&
      normalizeAccountId(global.getProfilePreviewAccountId()) ===
        normalizedAccountId
    ) {
      if (followers !== undefined || following !== undefined) {
        const previewEl = document.querySelector(".profile-preview");
        if (previewEl) {
          const statNums = previewEl.querySelectorAll(
            ".profile-preview-stats b",
          );
          if (statNums.length >= 3) {
            if (
              global.animateValue &&
              typeof global.animateValue === "function"
            ) {
              if (followers !== undefined)
                global.animateValue(statNums[1], followers);
              if (following !== undefined)
                global.animateValue(statNums[2], following);
            } else if (global.PostUtils?.animateCount) {
              if (followers !== undefined)
                global.PostUtils.animateCount(statNums[1], followers);
              if (following !== undefined)
                global.PostUtils.animateCount(statNums[2], following);
            }
          }
        }
      }
    }

    // 5. update profile page
    if (typeof global.updateFollowStatus === "function") {
      global.updateFollowStatus(
        normalizedAccountId,
        hasRelationState ? relation.isFollowing : undefined,
        followers,
        following,
        hasRelationState ? relation.isRequested : undefined,
        hasTargetFollowPrivacy ? relation.targetFollowPrivacy : undefined,
      );
    }

    // 6. update open interaction/follow/tagged modals
    const modals = [
      document.getElementById("interactionModal"),
      document.getElementById("followListModal"),
      document.getElementById("postTaggedAccountsModal"),
    ];

    modals.forEach((modal) => {
      if (!modal || !modal.classList.contains("show") || !hasRelationState)
        return;

      const rows = modal.querySelectorAll(".user-info[data-account-id]");
      rows.forEach((row) => {
        const rowAccountId = normalizeAccountId(row.dataset.accountId);
        if (rowAccountId !== normalizedAccountId) return;
        const actionBox = row.nextElementSibling;
        const actionBtn = actionBox?.querySelector(".follow-btn");
        if (!actionBtn || actionBtn.classList.contains("view-profile-btn"))
          return;
        applyStandardFollowButton(actionBtn, relation, row.dataset.accountId);
      });
    });

    if (global.lucide && typeof global.lucide.createIcons === "function") {
      global.lucide.createIcons();
    }
  };

  function updateFeedButtons(normalizedAccountId, relation, root = document) {
    if (!root) return;
    const posts = root.querySelectorAll(".post .post-user[data-account-id]");
    posts.forEach((userEl) => {
      const postAccountId = normalizeAccountId(userEl.dataset.accountId);
      if (postAccountId !== normalizedAccountId) return;

      const postHeader = userEl.closest(".post-header");
      if (!postHeader) return;
      const actionsDiv = postHeader.querySelector(".post-actions");
      if (!actionsDiv) return;
      const accountId = userEl.dataset.accountId || normalizedAccountId;

      let followBtn = actionsDiv.querySelector(".follow-btn");

      if (relation.isFollowing) {
        if (followBtn) {
          followBtn.remove();
        }
        return;
      }

      if (!followBtn) {
        followBtn = document.createElement("button");
        followBtn.type = "button";
        followBtn.className = "follow-btn";
        const moreBtn = actionsDiv.querySelector(".post-more");
        if (moreBtn) {
          actionsDiv.insertBefore(followBtn, moreBtn);
        } else {
          actionsDiv.appendChild(followBtn);
        }
      }

      applyStandardFollowButton(followBtn, relation, accountId);
      if (relation.isRequested) {
        followBtn.onclick = () =>
          FollowModule.showUnfollowConfirm(accountId, followBtn);
      } else {
        followBtn.onclick = () => FollowModule.followUser(accountId, followBtn);
      }
    });
  }

  FollowModule.applyStandardFollowButton = applyStandardFollowButton;
  FollowModule.applyProfilePageButton = applyProfilePageButton;
  FollowModule.applyProfilePreviewButton = applyProfilePreviewButton;
  FollowModule.applyVisibleRelationButtons = applyVisibleRelationButtons;
  FollowModule.isRequestedButton = isRequestedButton;
  FollowModule.isFollowingButton = isFollowingButton;

  global.FollowModule = FollowModule;
})(window);
