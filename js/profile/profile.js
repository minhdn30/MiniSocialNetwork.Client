/**
 * profile.js
 * Handles logic for the user profile page
 */

(function (global) {
  let currentProfileId = null;
  let page = 1;
  let isLoading = false;
  let hasMore = true;
  let archivedStoriesPage = 1;
  let isArchivedStoriesLoading = false;
  let hasMoreArchivedStories = true;
  let activeTab = "posts";

  const POSTS_PAGE_SIZE = APP_CONFIG.PROFILE_POSTS_PAGE_SIZE;
  const ARCHIVED_STORIES_PAGE_SIZE =
    APP_CONFIG.PROFILE_ARCHIVED_STORIES_PAGE_SIZE ||
    APP_CONFIG.PROFILE_POSTS_PAGE_SIZE;
  const PROFILE_ARCHIVED_STORIES_TAB = "archived-stories";

  // Post navigation: Store post IDs in grid order for next/prev navigation
  let profilePostIds = [];

  let currentProfileData = null;
  let profilePresenceUnsubscribe = null;

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

  function resolveStoryRingClass(storyRingState) {
    const normalizedState = (storyRingState ?? "").toString().trim().toLowerCase();

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

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeStoryStyleKey(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function parseIntSafe(value, fallbackValue) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeStyleMap(rawMap, fallbackMap) {
    const sourceMap =
      isPlainObject(rawMap) && Object.keys(rawMap).length > 0
        ? rawMap
        : fallbackMap;
    const normalized = {};

    Object.entries(sourceMap || {}).forEach(([rawKey, rawOption]) => {
      const key = normalizeStoryStyleKey(rawKey);
      if (!key) return;

      const option = isPlainObject(rawOption) ? rawOption : {};
      const fallbackOption = isPlainObject(fallbackMap?.[key])
        ? fallbackMap[key]
        : {};
      const css =
        (typeof option.css === "string" && option.css.trim()) ||
        (typeof fallbackOption.css === "string" && fallbackOption.css.trim()) ||
        "";

      if (!css) return;
      normalized[key] = { ...option, css };
    });

    return Object.keys(normalized).length > 0 ? normalized : { ...(fallbackMap || {}) };
  }

  function resolveStyleKey(collection, rawKey, fallbackKey) {
    const normalizedRawKey = normalizeStoryStyleKey(rawKey);
    if (
      normalizedRawKey &&
      Object.prototype.hasOwnProperty.call(collection, normalizedRawKey)
    ) {
      return normalizedRawKey;
    }

    const normalizedFallbackKey = normalizeStoryStyleKey(fallbackKey);
    if (
      normalizedFallbackKey &&
      Object.prototype.hasOwnProperty.call(collection, normalizedFallbackKey)
    ) {
      return normalizedFallbackKey;
    }

    const firstKey = Object.keys(collection || {})[0];
    return typeof firstKey === "string" ? firstKey : "";
  }

  function resolveStoryTextThumbnailStyle(story) {
    const fallback = {
      options: {
        backgrounds: {
          accent: {
            css: "linear-gradient(150deg, var(--accent-primary) 0%, color-mix(in srgb, var(--accent-primary) 45%, #000000) 100%)",
          },
        },
        textColors: {
          light: { css: "#ffffff" },
          ink: { css: "#0f172a" },
        },
        fonts: {
          modern: { css: "'Segoe UI', 'Inter', system-ui, sans-serif" },
        },
      },
      fontSize: {
        min: 8,
        max: 72,
        default: 32,
      },
      defaults: {
        backgroundColorKey: "accent",
        textColorKey: "light",
        fontTextKey: "modern",
        fontSizePx: 32,
      },
    };

    const config = isPlainObject(window.STORY_TEXT_EDITOR_CONFIG)
      ? window.STORY_TEXT_EDITOR_CONFIG
      : {};
    const options = isPlainObject(config.options) ? config.options : {};
    const defaults = isPlainObject(config.defaults) ? config.defaults : {};
    const fontSize = isPlainObject(config.fontSize) ? config.fontSize : {};

    const backgrounds = normalizeStyleMap(
      options.backgrounds,
      fallback.options.backgrounds,
    );
    const textColors = normalizeStyleMap(
      options.textColors,
      fallback.options.textColors,
    );
    const fonts = normalizeStyleMap(options.fonts, fallback.options.fonts);

    const defaultBackgroundKey = resolveStyleKey(
      backgrounds,
      defaults.backgroundColorKey,
      fallback.defaults.backgroundColorKey,
    );
    const defaultTextColorKey = resolveStyleKey(
      textColors,
      defaults.textColorKey,
      fallback.defaults.textColorKey,
    );
    const defaultFontKey = resolveStyleKey(
      fonts,
      defaults.fontTextKey,
      fallback.defaults.fontTextKey,
    );

    const backgroundKey = resolveStyleKey(
      backgrounds,
      story.backgroundColorKey ?? story.BackgroundColorKey,
      defaultBackgroundKey,
    );
    const textColorKey = resolveStyleKey(
      textColors,
      story.textColorKey ?? story.TextColorKey,
      defaultTextColorKey,
    );
    const fontKey = resolveStyleKey(
      fonts,
      story.fontTextKey ?? story.FontTextKey,
      defaultFontKey,
    );

    const minSize = Math.max(1, parseIntSafe(fontSize.min, fallback.fontSize.min));
    const maxSize = Math.max(minSize, parseIntSafe(fontSize.max, fallback.fontSize.max));
    const defaultSize = clamp(
      parseIntSafe(
        defaults.fontSizePx,
        parseIntSafe(fontSize.default, fallback.fontSize.default),
      ),
      minSize,
      maxSize,
    );
    const finalSize = clamp(
      parseIntSafe(
        story.fontSizeKey ?? story.FontSizeKey,
        defaultSize,
      ),
      minSize,
      maxSize,
    );

    // Scale text from story-viewer size to profile-grid thumbnail size.
    const thumbnailFontSize = clamp(Math.round(finalSize * 0.55), 12, 34);

    return {
      background:
        backgrounds[backgroundKey]?.css ||
        backgrounds[defaultBackgroundKey]?.css ||
        fallback.options.backgrounds.accent.css,
      color:
        textColors[textColorKey]?.css ||
        textColors[defaultTextColorKey]?.css ||
        fallback.options.textColors.light.css,
      fontFamily:
        fonts[fontKey]?.css ||
        fonts[defaultFontKey]?.css ||
        fallback.options.fonts.modern.css,
      fontSizePx: thumbnailFontSize,
    };
  }

  function renderProfileAvatar(avatarWrapper, avatarUrl, storyRingState, accountId) {
    if (!avatarWrapper) return;

    const ringClass = resolveStoryRingClass(storyRingState);
    const safeAvatarUrl = escapeAttr(avatarUrl || APP_CONFIG.DEFAULT_AVATAR);

    avatarWrapper.classList.remove("profile-avatar-wrapper--story-ring");

    if (!ringClass) {
      avatarWrapper.innerHTML = `<img id="profile-avatar" src="${safeAvatarUrl}" alt="Profile Picture">`;
      return;
    }

    const storyAuthorAttr = accountId
      ? ` data-story-author-id="${escapeAttr(accountId)}"`
      : "";
    avatarWrapper.classList.add("profile-avatar-wrapper--story-ring");
    avatarWrapper.innerHTML = `
      <span class="post-avatar-ring ${ringClass} profile-story-ring"${storyAuthorAttr}>
        <img id="profile-avatar" class="post-avatar" src="${safeAvatarUrl}" alt="Profile Picture">
      </span>
    `;
  }

  function applyProfilePresenceDot(accountId) {
    const avatarWrapper = document.querySelector(".profile-avatar-wrapper");
    if (!avatarWrapper) return;

    const existingDot = avatarWrapper.querySelector(".profile-online-dot");
    const presenceStatus = resolvePresenceStatus(accountId);
    if (presenceStatus?.showDot) {
      if (!existingDot) {
        avatarWrapper.insertAdjacentHTML(
          "beforeend",
          '<div class="profile-online-dot"></div>',
        );
      }
    } else if (existingDot) {
      existingDot.remove();
    }
  }

  function ensureProfilePresenceSnapshot(accountId) {
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.ensureSnapshotForAccountIds === "function"
    ) {
      window.PresenceUI.ensureSnapshotForAccountIds([accountId]).catch(
        (error) => {
          console.warn("[ProfilePage] Presence snapshot sync failed:", error);
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

    window.PresenceStore.ensureSnapshotForAccountIds([
      normalizedAccountId,
    ]).catch((error) => {
      console.warn("[ProfilePage] Presence snapshot sync failed:", error);
    });
  }

  function initProfilePresenceTracking() {
    if (profilePresenceUnsubscribe) return;
    if (
      window.PresenceUI &&
      typeof window.PresenceUI.subscribe === "function"
    ) {
      profilePresenceUnsubscribe = window.PresenceUI.subscribe((payload) => {
        const targetAccountId = normalizePresenceId(currentProfileId);
        if (!targetAccountId) return;

        const changedIds = Array.isArray(payload?.changedAccountIds)
          ? payload.changedAccountIds.map((id) => normalizePresenceId(id))
          : [];

        if (changedIds.length > 0 && !changedIds.includes(targetAccountId))
          return;
        applyProfilePresenceDot(targetAccountId);
      });
      return;
    }
    if (
      !window.PresenceStore ||
      typeof window.PresenceStore.subscribe !== "function"
    )
      return;

    profilePresenceUnsubscribe = window.PresenceStore.subscribe((payload) => {
      const targetAccountId = normalizePresenceId(currentProfileId);
      if (!targetAccountId) return;

      const changedIds = Array.isArray(payload?.changedAccountIds)
        ? payload.changedAccountIds.map((id) => normalizePresenceId(id))
        : [];

      if (changedIds.length > 0 && !changedIds.includes(targetAccountId))
        return;
      applyProfilePresenceDot(targetAccountId);
    });
  }

  // Permanent State Accessor for App Router
  window.ProfileState = {
    setPageData: (data) => {
      if (!data) return;
      // console.log(`[ProfileState] Restoring state: ID=${data.currentProfileId}, Page=${data.page}`);
      currentProfileId = data.currentProfileId;
      page = data.page;
      hasMore = data.hasMore;
      archivedStoriesPage = data.archivedStoriesPage ?? 1;
      hasMoreArchivedStories = data.hasMoreArchivedStories ?? true;
      activeTab = data.activeTab || "posts";
      currentProfileData = data.currentProfileData;
    },
    getPageData: () => ({
      currentProfileId,
      page,
      hasMore,
      archivedStoriesPage,
      hasMoreArchivedStories,
      activeTab,
      currentProfileData,
    }),
  };

  function initProfile() {
    initProfilePresenceTracking();

    // Robust ID extraction
    const hash = window.location.hash || "";
    let accountId = null;

    if (hash.includes("?")) {
      const queryString = hash.split("?")[1];
      const params = new URLSearchParams(queryString);
      accountId = params.get("id");
    } else if (hash.includes("/profile/") && hash.split("/profile/")[1]) {
      // Support #/profile/{id} format just in case
      accountId = hash.split("/profile/")[1].split("?")[0];
    }

    // Fallback to logged-in user if no ID in URL
    accountId = accountId || localStorage.getItem("accountId");

    if (!accountId) {
      // console.warn("No account ID found in hash or localStorage");
      return;
    }

    // Register state hooks for PageCache
    window.getPageData = window.ProfileState.getPageData;
    window.setPageData = window.ProfileState.setPageData;

    // SignalR Clean up: Leave profile group when navigating away
    window.leaveCurrentProfileGroup = function () {
      if (window.UserHub && window._lastVisitedProfileId) {
        const myId = localStorage.getItem("accountId");
        // IMPORTANT: NEVER leave my own account group
        if (window._lastVisitedProfileId !== myId) {
          UserHub.leaveGroup(window._lastVisitedProfileId);
        }
        window._lastVisitedProfileId = null;
      }
    };

    // 1. Restore from cache if available
    // CRITICAL FIX: Set currentProfileId BEFORE restore, because restore might trigger scroll/resize events
    // which call loadPosts immediately using the current ID.
    const prevId = currentProfileId;
    currentProfileId = accountId;

    // Also update LastVisited right away or logic below handled it?
    // Let's stick to the flow but ensure ID is set.

    if (window.PageCache && PageCache.restore(hash)) {
      // console.log("[Profile] Restored from cache");

      // Even if restored, trigger a silent update to refresh stats (followers, etc.)
      // This ensures we keep scroll position but get fresh data
      loadProfileData(true);

      // Setup listeners again because DOM was replaced
      setupEditProfileListeners();

      // SignalR: Bridge the gap for cached views
      if (window.UserHub) {
        const myId = localStorage.getItem("accountId");
        if (
          window._lastVisitedProfileId &&
          window._lastVisitedProfileId !== accountId
        ) {
          // Only leave if it wasn't my own group
          if (window._lastVisitedProfileId !== myId) {
            UserHub.leaveGroup(window._lastVisitedProfileId);
          }
        }
        // Only join if it's someone else's profile
        if (accountId !== myId) {
          UserHub.joinGroup(accountId);
        }
        window._lastVisitedProfileId = accountId;
      }

      return;
    }

    // Real-time: Join the profile's group to receive updates
    if (window.UserHub) {
      const myId = localStorage.getItem("accountId");
      // Leave previous group if we switched profiles
      if (
        window._lastVisitedProfileId &&
        window._lastVisitedProfileId !== accountId
      ) {
        // Only leave if it wasn't my own group
        if (window._lastVisitedProfileId !== myId) {
          UserHub.leaveGroup(window._lastVisitedProfileId);
        }
      }
      // Join new group ONLY if it's someone else
      if (accountId !== myId) {
        UserHub.joinGroup(accountId);
      }
      window._lastVisitedProfileId = accountId;
    }

    // console.log(`[Profile] Switching currentProfileId from ${currentProfileId} to ${accountId}`);
    currentProfileId = accountId;

    // Block other loading calls until we have the real GUID
    isLoading = true;

    // Force scroll to top for fresh load to prevent any lingering scroll position
    const mc = document.querySelector(".main-content");
    if (mc) mc.scrollTop = 0;

    resetState();
    loadProfileData();
    // setupScrollListener is now global
    setupEditProfileListeners();
    setupFollowStatsListeners();
  }

  function resetState() {
    page = 1;
    isLoading = false;
    hasMore = true;
    archivedStoriesPage = 1;
    isArchivedStoriesLoading = false;
    hasMoreArchivedStories = true;
    activeTab = "posts";
    profilePostIds = []; // Reset post navigation list
    // Clear grid immediately to avoid showing previous user's posts
    const grid = document.getElementById("profile-posts-grid");
    if (grid) {
      grid.innerHTML = "";
      grid.classList.remove("placeholder-mode");
    }

    // Reset Header UI placeholders to prevent confusing user with old data while loading
    const avatarWrapper = document.querySelector(".profile-avatar-wrapper");
    const fullNameLabel = document.getElementById("profile-fullname");
    const bioText = document.getElementById("profile-bio-text");
    const coverImg = document.getElementById("profile-cover-img");

    if (avatarWrapper)
      renderProfileAvatar(avatarWrapper, APP_CONFIG.DEFAULT_AVATAR, null);
    if (fullNameLabel) fullNameLabel.textContent = "Loading...";
    if (bioText) bioText.textContent = "";
    const bioSection = document.querySelector(".profile-bio-section");
    const statsEl = document.querySelector(".profile-stats");
    if (bioSection) bioSection.style.display = "none";
    if (statsEl) statsEl.classList.add("stats-no-bio");
    if (coverImg) coverImg.style.display = "none";

    // Reset stats
    [
      "profile-posts-count",
      "profile-followers-count",
      "profile-following-count",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
  }

  // Scroll listener moved OUT of init to be always active (but checking current context)
  const handleProfileScroll = () => {
    const grid = document.getElementById("profile-posts-grid");
    if (!grid || !document.body.contains(grid)) return;

    if (activeTab !== "posts" && activeTab !== PROFILE_ARCHIVED_STORIES_TAB)
      return;

    if (activeTab === "posts" && (isLoading || !hasMore)) return;
    if (
      activeTab === PROFILE_ARCHIVED_STORIES_TAB &&
      (isArchivedStoriesLoading || !hasMoreArchivedStories)
    )
      return;

    const mc = document.querySelector(".main-content");
    if (!mc) return;
    if (mc.scrollTop + mc.clientHeight >= mc.scrollHeight - 500) {
      if (activeTab === "posts") {
        loadPosts();
      } else if (activeTab === PROFILE_ARCHIVED_STORIES_TAB) {
        loadArchivedStories();
      }
    }
  };
  const mc = document.querySelector(".main-content");
  if (mc) mc.addEventListener("scroll", handleProfileScroll);

  // Global hook for app.js to trigger update after restore
  window.triggerProfileSilentUpdate = function () {
    loadProfileData(true);

    // Also ensure listeners are setup (just in case)
    setupFollowStatsListeners();
    setupEditProfileListeners();

    // And ensure Group join
    if (window.UserHub && currentProfileId) {
      const myId = localStorage.getItem("accountId");
      if (
        window._lastVisitedProfileId &&
        window._lastVisitedProfileId !== currentProfileId
      ) {
        // Only leave if it wasn't my own group
        if (window._lastVisitedProfileId !== myId) {
          UserHub.leaveGroup(window._lastVisitedProfileId);
        }
      }
      if (currentProfileId !== myId) {
        UserHub.joinGroup(currentProfileId);
      }
      window._lastVisitedProfileId = currentProfileId;
    }
  };

  async function loadProfileData(isSilent = false) {
    // Parse "u" parameter from URL query string
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split("?")[1] || "");
    let usernameParam = params.get("u");

    // Check for /profile/username path format
    if (!usernameParam && hash.includes("#/profile/")) {
      const parts = hash.split("#/profile/");
      if (parts.length > 1) {
        // Remove any query params that might follow
        const potentialParam = parts[1].split("?")[0];
        // Ensure it is NOT a GUID (if it's a GUID, let logic below handle it via currentProfileId)
        const isGuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            potentialParam,
          );
        if (!isGuid) {
          usernameParam = potentialParam;
        }
      }
    }

    // Use LoadingUtils if available
    const mainContent = document.querySelector(".profile-content-wrapper");

    if (window.LoadingUtils) LoadingUtils.toggle("profile-posts-loader", true);

    try {
      let res;
      if (usernameParam) {
        res = await API.Accounts.getProfileByUsername(usernameParam);
      } else if (currentProfileId) {
        // Fallback: If currentProfileId is set (could be ID or Username if extracted loosely)
        // We should try to determine if it is a GUID
        const isGuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            currentProfileId,
          );
        if (isGuid) {
          res = await API.Accounts.getProfile(currentProfileId);
        } else {
          // Assume it's a username if not a GUID
          res = await API.Accounts.getProfileByUsername(currentProfileId);
        }
      } else {
        return;
      }
      if (!res.ok) {
        if (window.toastError) toastError("Failed to load profile details.");
        return;
      }

      const data = await res.json();

      // Defensively handle both camelCase and PascalCase
      const accountInfo =
        data.accountInfo ||
        data.AccountInfo ||
        data.account ||
        data.Account ||
        {};
      const realGuid =
        accountInfo.accountId ||
        accountInfo.AccountId ||
        accountInfo.id ||
        accountInfo.Id;

      // If loaded by username, update currentProfileId
      if (realGuid) {
        currentProfileId = realGuid;
        // Also update window._lastVisitedProfileId to ensure groups are managed correctly
        if (
          window.UserHub &&
          currentProfileId !== localStorage.getItem("accountId")
        ) {
          UserHub.joinGroup(currentProfileId);
          window._lastVisitedProfileId = currentProfileId;
        }
      }

      // Always update local storage and sidebar if viewing my own profile
      if (data.isCurrentUser || data.IsCurrentUser) {
        const settings = data.settings || data.Settings;
        if (settings) {
          localStorage.setItem(
            "defaultPostPrivacy",
            settings.defaultPostPrivacy ?? settings.DefaultPostPrivacy ?? 0,
          );
        }

        const newAvatarUrl =
          accountInfo.avatarUrl || accountInfo.AvatarUrl || "";
        const newFullname = accountInfo.fullName || accountInfo.FullName || "";
        const newUsername = accountInfo.username || accountInfo.Username || "";

        localStorage.setItem("avatarUrl", newAvatarUrl);
        localStorage.setItem("fullname", newFullname);
        localStorage.setItem("username", newUsername);

        if (window.updateSidebarInfo) {
          window.updateSidebarInfo(newAvatarUrl, newUsername || newFullname);
        }
      }

      if (isSilent) {
        // Background update: Only update stats and internal data
        currentProfileData = data;
        updateProfileStatsOnly(data);
        applyProfilePresenceDot(currentProfileId);
        ensureProfilePresenceSnapshot(currentProfileId);
      } else {
        // Full render
        currentProfileData = data;

        renderProfileHeader(data);
        ensureProfilePresenceSnapshot(currentProfileId);

        // Now that we have the GUID, we can load posts
        activeTab = "posts";
        archivedStoriesPage = 1;
        isArchivedStoriesLoading = false;
        hasMoreArchivedStories = true;
        isLoading = false;
        loadPosts();
      }
    } catch (err) {
      console.error(err);
      if (!isSilent) {
        const contentEl = document.getElementById("profile-content");
        if (contentEl)
          contentEl.innerHTML = `<div class="error-message">Failed to load profile. <button onclick="loadProfileData()">Retry</button></div>`;
      }
    } finally {
      isLoading = false;
      if (window.LoadingUtils)
        LoadingUtils.toggle("profile-posts-loader", false);
    }
  }

  function updateProfileStatsOnly(data) {
    // This function is intended to update only the dynamic parts of the profile header
    // without re-rendering the entire header or triggering post loads.
    // Useful for silent updates from cache or real-time events.
    const followInfo = data.followInfo || {};
    const postCount = document.getElementById("profile-posts-count");
    const followersCount = document.getElementById("profile-followers-count");
    const followingCount = document.getElementById("profile-following-count");
    const actionBtn = document.getElementById("profile-action-btn");

    if (postCount)
      postCount.textContent = data.totalPosts ?? data.postCount ?? 0;
    if (followersCount)
      followersCount.textContent =
        followInfo.followers ?? data.followerCount ?? 0;
    if (followingCount)
      followingCount.textContent =
        followInfo.following ?? data.followingCount ?? 0;

    // Update follow button state if necessary
    const isOwner = data.isCurrentUser;
    const isFollowed =
      followInfo.isFollowedByCurrentUser ?? data.isFollowedByCurrentUser;
    if (actionBtn && !isOwner) {
      const followBtn = actionBtn.querySelector(
        ".profile-btn-follow, .profile-btn-following",
      );
      if (followBtn) {
        const followBtnClass = isFollowed
          ? "profile-btn-following"
          : "profile-btn-follow";
        const followIcon = isFollowed ? "check" : "user-plus";
        const followText = isFollowed ? "Following" : "Follow";

        followBtn.className = `profile-btn ${followBtnClass}`;
        followBtn.innerHTML = `<i data-lucide="${followIcon}"></i><span>${followText}</span>`;
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  function renderProfileHeader(data) {
    // Find elements
    const coverImg = document.getElementById("profile-cover-img");
    const avatarWrapper = document.querySelector(".profile-avatar-wrapper");
    const usernameHeader = document.getElementById("profile-username-header");
    const fullNameLabel = document.getElementById("profile-fullname");
    const bioText = document.getElementById("profile-bio-text");
    const postCount = document.getElementById("profile-posts-count");
    const followersCount = document.getElementById("profile-followers-count");
    const followingCount = document.getElementById("profile-following-count");
    const actionBtn = document.getElementById("profile-action-btn");

    if (!data) return;

    const info = data.accountInfo || data.account || {};
    const followInfo = data.followInfo || {};
    const isOwner = data.isCurrentUser;
    const isFollowed =
      followInfo.isFollowedByCurrentUser ?? data.isFollowedByCurrentUser;

    // Cover & Avatar
    const avatarUrl = info.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    const storyRingState = info.storyRingState ?? data.storyRingState ?? null;
    const profileCover = document.querySelector(".profile-cover");

    if (avatarWrapper) {
      const profileAccountId = info.accountId || info.id || currentProfileId;
      renderProfileAvatar(avatarWrapper, avatarUrl, storyRingState, profileAccountId);
    }

    if (coverImg) {
      if (info.coverUrl) {
        coverImg.src = info.coverUrl;
        coverImg.style.display = "block";
        coverImg.onerror = function () {
          this.style.display = "none";
        };
      } else {
        coverImg.style.display = "none";
      }
    }

    // Dynamic Background based on Avatar
    if (profileCover) {
      if (avatarUrl && typeof extractDominantColor === "function") {
        extractDominantColor(avatarUrl)
          .then((color) => {
            profileCover.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
          })
          .catch(() => {
            // Fallback to theme-aware default gradient
            profileCover.style.background =
              "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
          });
      } else {
        profileCover.style.background =
          "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
      }
    }

    // Use Username in the prominent header position
    if (usernameHeader) usernameHeader.textContent = info.username || "user";

    // FullName label: Bold line above bio
    if (fullNameLabel) fullNameLabel.textContent = info.fullName || "";

    // Bio: Hide if empty
    const bioSection = document.querySelector(".profile-bio-section");
    const statsEl = document.querySelector(".profile-stats");

    if (bioSection) {
      const hasFullName = info.fullName && info.fullName.trim() !== "";
      const hasBio = info.bio && info.bio.trim() !== "";

      if (hasFullName || hasBio) {
        if (bioText) bioText.textContent = info.bio || "";
        bioSection.style.display = "block";
        if (statsEl) statsEl.classList.remove("stats-no-bio");

        // Show/hide specific elements inside
        if (fullNameLabel)
          fullNameLabel.style.display = hasFullName ? "block" : "none";
        if (bioText) bioText.style.display = hasBio ? "block" : "none";
      } else {
        bioSection.style.display = "none";
        if (statsEl) statsEl.classList.add("stats-no-bio");
      }
    }

    if (postCount)
      postCount.textContent = data.totalPosts ?? data.postCount ?? 0;
    if (followersCount)
      followersCount.textContent =
        followInfo.followers ?? data.followerCount ?? 0;
    if (followingCount)
      followingCount.textContent =
        followInfo.following ?? data.followingCount ?? 0;

    // Details: Phone, Address
    const phoneEl = document.getElementById("profile-detail-phone");
    const addressEl = document.getElementById("profile-detail-address");
    const phoneWrapper = document.getElementById(
      "profile-detail-phone-wrapper",
    );
    const addressWrapper = document.getElementById(
      "profile-detail-address-wrapper",
    );

    if (phoneEl && phoneWrapper) {
      if (info.phone) {
        phoneEl.textContent = info.phone;
        phoneWrapper.style.display = "flex";
      } else {
        phoneWrapper.style.display = "none";
      }
    }
    if (addressEl && addressWrapper) {
      if (info.address) {
        addressEl.textContent = info.address;
        addressWrapper.style.display = "flex";
      } else {
        addressWrapper.style.display = "none";
      }
    }

    // Action Buttons
    if (actionBtn) {
      if (isOwner) {
        actionBtn.innerHTML = `
                    <button class="profile-btn profile-btn-edit" onclick="openEditProfile()">
                        <i data-lucide="edit-3"></i>
                        <span>Edit Profile</span>
                    </button>
                    <button class="profile-btn profile-btn-secondary" id="profile-settings-btn" onclick="window.location.hash='#/account-settings'">
                        <i data-lucide="settings"></i>
                        <span>Settings</span>
                    </button>
                    <button class="profile-btn profile-btn-more" onclick="openProfileMoreMenu()">
                        <i data-lucide="more-horizontal"></i>
                        <span>More</span>
                    </button>
                `;
      } else {
        const followBtnClass = isFollowed
          ? "profile-btn-following"
          : "profile-btn-follow";
        const followIcon = isFollowed ? "check" : "user-plus";
        const followText = isFollowed ? "Following" : "Follow";

        const profileId = info.accountId || info.id || currentProfileId;

        actionBtn.innerHTML = `
                    <button class="profile-btn ${followBtnClass}" onclick="toggleFollowProfile('${profileId}')">
                        <i data-lucide="${followIcon}"></i>
                        <span>${followText}</span>
                    </button>
                    <button class="profile-btn profile-btn-message" onclick="openMessage('${profileId}')">
                        <i data-lucide="send"></i>
                        <span>Message</span>
                    </button>
                    <button class="profile-btn profile-btn-more" onclick="openProfileMoreMenu()">
                        <i data-lucide="more-horizontal"></i>
                        <span>More</span>
                    </button>
                `;
      }
      lucide.createIcons();
    }

    // Render Tabs
    renderProfileTabs(isOwner);

    // Auto-shrink font size for long usernames
    if (usernameHeader) {
      usernameHeader.style.fontSize = "32px"; // Reset

      // Wait for next frame to get accurate widths
      requestAnimationFrame(() => {
        let fontSize = 32;
        // ClientWidth is the boundary, ScrollWidth is the content size
        while (
          usernameHeader.scrollWidth > usernameHeader.clientWidth &&
          fontSize > 14
        ) {
          fontSize -= 1;
          usernameHeader.style.fontSize = fontSize + "px";
        }
      });
    }

    if (window.lucide) lucide.createIcons();
    applyProfilePresenceDot(info.accountId || info.id || currentProfileId);
  }

  function renderProfileTabs(isOwner) {
    const tabsContainer = document.getElementById("profile-tabs");
    if (!tabsContainer) return;

    let tabs = [
      { id: "posts", label: "Posts", icon: "grid" },
      { id: "reels", label: "Reels", icon: "clapperboard" },
      { id: "tagged", label: "Tagged", icon: "user-square" },
    ];

    if (isOwner) {
      tabs.push({ id: "saved", label: "Saved", icon: "bookmark" });
      tabs.push({
        id: PROFILE_ARCHIVED_STORIES_TAB,
        label: "Archived Stories",
        icon: "archive",
      });
    }

    tabsContainer.innerHTML = tabs
      .map(
        (tab) => `
            <div class="profile-tab ${tab.id === activeTab ? "active" : ""}" data-tab="${tab.id}" onclick="switchProfileTab('${tab.id}')">
                <i data-lucide="${tab.icon}"></i>
                <span>${tab.label}</span>
            </div>
        `,
      )
      .join("") + '<div class="profile-tabs-indicator" id="profile-tabs-indicator"></div>';

    if (window.lucide) lucide.createIcons();
    requestAnimationFrame(updateProfileTabsIndicator);
  }

  function updateProfileTabsIndicator() {
    const activeTabEl = document.querySelector(".profile-tab.active");
    const indicator = document.getElementById("profile-tabs-indicator");
    if (!activeTabEl || !indicator) return;

    indicator.style.transform = `translateX(${activeTabEl.offsetLeft}px)`;
    indicator.style.width = `${activeTabEl.offsetWidth}px`;
  }

  window.addEventListener("resize", () => {
    requestAnimationFrame(updateProfileTabsIndicator);
  });

  window.switchProfileTab = function (tabName) {
    const grid = document.getElementById("profile-posts-grid");
    const loader = document.getElementById("profile-posts-loader");
    if (!grid) return;

    activeTab = tabName;

    // Update UI active state
    document.querySelectorAll(".profile-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });

    updateProfileTabsIndicator();

    if (tabName === "posts") {
      // Restore posts grid
      grid.innerHTML = "";
      grid.classList.remove("placeholder-mode");
      page = 1;
      hasMore = true;
      isLoading = false;
      loadPosts();
    } else if (tabName === PROFILE_ARCHIVED_STORIES_TAB) {
      // Archived stories grid (owner only)
      grid.innerHTML = "";
      grid.classList.remove("placeholder-mode");
      archivedStoriesPage = 1;
      hasMoreArchivedStories = true;
      isArchivedStoriesLoading = false;
      loadArchivedStories();
    } else {
      // Show placeholder
      const iconMap = {
        reels: "clapperboard",
        tagged: "user-square",
        saved: "bookmark",
      };
      const labels = {
        reels: "Reels",
        tagged: "Tagged",
        saved: "Saved",
      };

      grid.classList.add("placeholder-mode");
      grid.innerHTML = `
                <div class="profile-tab-placeholder">
                    <div class="placeholder-icon-circle">
                        <i data-lucide="${iconMap[tabName]}"></i>
                    </div>
                    <h2>${labels[tabName]} coming soon</h2>
                    <p>We're working on ${labels[tabName].toLowerCase()} feature. It will be available in a future update.</p>
                </div>
            `;
      if (loader) loader.style.display = "none";
      isLoading = false;
      isArchivedStoriesLoading = false;
      if (window.lucide) lucide.createIcons();
    }
  };

  async function loadPosts() {
    if (activeTab !== "posts") return;
    if (isLoading || !hasMore) return;

    // Capture the ID we are fetching for at the start
    const fetchForId = currentProfileId;
    const fetchForTab = activeTab;
    // console.log(`[Profile] loadPosts START for ${fetchForId}, page ${page}`);
    isLoading = true;

    const grid = document.getElementById("profile-posts-grid");
    const loader = document.getElementById("profile-posts-loader");

    if (loader) loader.style.display = "block";

    try {
      // Safeguard: Ensure we have a GUID and not a username
      const isGuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          fetchForId,
        );
      if (!isGuid) {
        // console.warn(`[Profile] Cannot load posts: ${fetchForId} is not a valid GUID yet.`);
        isLoading = false;
        return;
      }

      const res = await API.Posts.getByAccountId(fetchForId, page, POSTS_PAGE_SIZE);

      // RACECONDITION FIX:
      // Check if user switched profiles while we were fetching
      if (fetchForId !== currentProfileId || fetchForTab !== activeTab) {
        // console.log(`[Profile] IGNORING posts for ${fetchForId} because we switched to ${currentProfileId}`);
        return;
      }

      if (!res.ok) throw new Error("Failed to load posts");

      const data = await res.json();
      const items = data.items || data; // Fallback if it's already an array

      if (!items || items.length < POSTS_PAGE_SIZE) {
        hasMore = false;
      }

      // console.log(`[Profile] Rendering ${items.length} posts for ${fetchForId}`);
      renderPosts(items);
      page++;
    } catch (err) {
      console.error(err);
    } finally {
      // Only turn off loading if we are still on the same profile context
      // actually, we should always turn it off?
      // If we switched profiles, resetState() would have set isLoading=false already.
      // But if we are still here, we need to complete the lifecycle.
      if (fetchForId === currentProfileId && fetchForTab === activeTab) {
        isLoading = false;
        if (loader) loader.style.display = "none";
      }
    }
  }

  async function loadArchivedStories() {
    if (activeTab !== PROFILE_ARCHIVED_STORIES_TAB) return;
    if (isArchivedStoriesLoading || !hasMoreArchivedStories) return;

    const fetchForId = currentProfileId;
    const fetchForTab = activeTab;
    isArchivedStoriesLoading = true;

    const grid = document.getElementById("profile-posts-grid");
    const loader = document.getElementById("profile-posts-loader");
    if (!grid) {
      isArchivedStoriesLoading = false;
      return;
    }

    if (loader) loader.style.display = "block";

    try {
      const isGuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          fetchForId,
        );
      if (!isGuid) {
        isArchivedStoriesLoading = false;
        return;
      }

      if (!global.API?.Stories?.getArchived) {
        throw new Error("Story archive API is unavailable");
      }

      const res = await API.Stories.getArchived(
        archivedStoriesPage,
        ARCHIVED_STORIES_PAGE_SIZE,
      );

      if (fetchForId !== currentProfileId || fetchForTab !== activeTab) {
        return;
      }
      if (!res.ok) throw new Error("Failed to load archived stories");

      const data = await res.json();
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];

      if (archivedStoriesPage === 1) {
        grid.innerHTML = "";
      }

      renderArchivedStories(items);
      archivedStoriesPage += 1;

      const hasNextPage =
        typeof data?.hasNextPage === "boolean"
          ? data.hasNextPage
          : items.length >= ARCHIVED_STORIES_PAGE_SIZE;
      hasMoreArchivedStories = hasNextPage;
    } catch (err) {
      console.error(err);
      if (window.toastError) toastError("Failed to load archived stories.");
    } finally {
      if (fetchForId === currentProfileId && fetchForTab === activeTab) {
        isArchivedStoriesLoading = false;
        if (loader) loader.style.display = "none";
      }
    }
  }

  /**
   * Load more posts for modal navigation (called from post-detail.js)
   * Returns array of new post objects with postId and postCode
   */
  async function loadMoreProfilePosts() {
    if (isLoading || !hasMore) return [];

    const fetchForId = currentProfileId;
    isLoading = true;

    try {
      const isGuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          fetchForId,
        );
      if (!isGuid) {
        isLoading = false;
        return [];
      }

      const res = await API.Posts.getByAccountId(
        fetchForId,
        page,
        POSTS_PAGE_SIZE,
      );

      if (fetchForId !== currentProfileId) return [];
      if (!res.ok) throw new Error("Failed to load posts");

      const data = await res.json();
      const items = data.items || data;

      if (!items || items.length < POSTS_PAGE_SIZE) {
        hasMore = false;
      }

      // Render to grid (for visual consistency) and update profilePostIds
      renderPosts(items);
      page++;

      // Return the new posts for navigation context update
      return items.map((post) => ({
        postId: post.postId,
        postCode: post.postCode,
      }));
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      if (fetchForId === currentProfileId) {
        isLoading = false;
      }
    }
  }

  // Export for post-detail.js navigation
  window.loadMoreProfilePosts = loadMoreProfilePosts;
  window.getProfileHasMore = () => hasMore;

  // Remove a post from the navigation list (called when post becomes invalid during navigation)
  window.removeProfilePostId = function (postId) {
    const index = profilePostIds.findIndex((p) => p.postId === postId);
    if (index !== -1) {
      profilePostIds.splice(index, 1);
    }
  };

  function renderPosts(posts) {
    const grid = document.getElementById("profile-posts-grid");
    if (!grid) return;

    if (page === 1) {
      grid.innerHTML = "";
      profilePostIds = []; // Reset on first page
    }

    posts.forEach((post) => {
      // Collect post IDs for navigation
      profilePostIds.push({ postId: post.postId, postCode: post.postCode });
      const item = createGridItem(post);
      grid.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  function createGridItem(post) {
    const item = document.createElement("div");
    item.className = "profile-grid-item skeleton";
    item.dataset.postId = post.postId;
    item.onclick = () => {
      if (window.openPostDetail) {
        // Find current index in the list
        const index = profilePostIds.findIndex((p) => p.postId === post.postId);
        // Pass navigation context for next/prev functionality
        window.openPostDetail(post.postId, post.postCode, {
          source: "profile",
          postList: profilePostIds,
          currentIndex: index,
          accountId: currentProfileId,
          hasMore: hasMore,
        });
      }
    };

    const isMulti = (post.mediaCount ?? post.medias?.length ?? 0) > 1;
    const primaryMedia =
      post.medias && post.medias[0]
        ? post.medias[0].mediaUrl
        : window.APP_CONFIG?.DEFAULT_POST_IMAGE || "";

    item.innerHTML = `
            <img class="img-loaded" src="${primaryMedia}" alt="post">
            ${isMulti ? '<div class="profile-multi-media-icon"><i data-lucide="layers"></i></div>' : ""}
            <div class="profile-grid-overlay">
                <div class="profile-overlay-stat">
                    <i data-lucide="heart"></i>
                    <span>${post.reactCount}</span>
                </div>
                <div class="profile-overlay-stat">
                    <i data-lucide="message-circle"></i>
                    <span>${post.commentCount}</span>
                </div>
            </div>
        `;

    // 1. Setup loading state
    const media = item.querySelector("img");
    if (media) {
      const onLoaded = () => {
        item.classList.remove("skeleton");
        media.classList.add("show");
      };

      if (media.complete) onLoaded();
      else media.onload = onLoaded;
    }

    // 2. Apply dominant color background
    if (primaryMedia && typeof window.extractDominantColor === "function") {
      extractDominantColor(primaryMedia)
        .then((color) => {
          item.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
        })
        .catch((err) => console.warn("Color extraction failed", err));
    }

    return item;
  }

  function renderArchivedStories(stories) {
    const grid = document.getElementById("profile-posts-grid");
    if (!grid) return;

    stories.forEach((story) => {
      const item = createArchivedStoryGridItem(story);
      grid.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  function resolveStoryContentType(rawStory) {
    const value =
      rawStory?.contentType ??
      rawStory?.ContentType ??
      rawStory?.type ??
      rawStory?.Type ??
      0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatArchiveStoryCreatedAt(rawValue) {
    if (!rawValue) return "";

    const createdAt = new Date(rawValue);
    if (Number.isNaN(createdAt.getTime())) return "";

    const day = String(createdAt.getDate()).padStart(2, "0");
    const month = String(createdAt.getMonth() + 1).padStart(2, "0");
    const year = createdAt.getFullYear();
    const currentYear = new Date().getFullYear();

    if (year === currentYear) {
      return `${day}/${month}`;
    }

    return `${day}/${month}/${year}`;
  }

  function createArchivedStoryGridItem(story) {
    const item = document.createElement("div");
    item.className = "profile-grid-item profile-story-grid-item skeleton";
    item.dataset.storyId = story?.storyId ?? story?.StoryId ?? "";

    const contentType = resolveStoryContentType(story);
    const mediaUrl = escapeAttr(story?.mediaUrl ?? story?.MediaUrl ?? "");
    const viewCount = Math.max(
      0,
      Number.parseInt(String(story?.viewCount ?? story?.ViewCount ?? 0), 10) || 0,
    );
    const reactCount = Math.max(
      0,
      Number.parseInt(String(story?.reactCount ?? story?.ReactCount ?? 0), 10) || 0,
    );
    const createdAtLabel = formatArchiveStoryCreatedAt(
      story?.createdAt ?? story?.CreatedAt ?? null,
    );

    const overlayHtml = `
      <div class="profile-grid-overlay profile-story-grid-overlay">
        <div class="profile-overlay-stat">
          <i data-lucide="eye" class="profile-story-view-icon"></i>
          <span>${viewCount}</span>
        </div>
        <div class="profile-overlay-stat">
          <i data-lucide="heart"></i>
          <span>${reactCount}</span>
        </div>
      </div>
    `;
    const createdAtBadgeHtml = `
      <div class="profile-story-created-at-badge">
        <i data-lucide="calendar-days" class="profile-story-created-at-icon"></i>
        <span>${createdAtLabel || "--/--"}</span>
      </div>
    `;

    if (contentType === 2) {
      const style = resolveStoryTextThumbnailStyle(story);
      const textContent = escapeHtml(story?.textContent ?? story?.TextContent ?? "");
      item.innerHTML = `
        <div class="profile-story-text-thumb" style="background:${style.background};">
          <div class="profile-story-text-content" style="color:${style.color};font-family:${style.fontFamily};font-size:${style.fontSizePx}px;">${textContent}</div>
        </div>
        ${overlayHtml}
        ${createdAtBadgeHtml}
      `;
      item.classList.remove("skeleton");
      return item;
    }

    if (contentType === 1) {
      item.innerHTML = `
        <video class="profile-story-thumb-media" src="${mediaUrl}" muted playsinline preload="metadata"></video>
        <div class="profile-story-video-icon"><i data-lucide="play"></i></div>
        ${overlayHtml}
        ${createdAtBadgeHtml}
      `;

      const video = item.querySelector("video");
      if (video) {
        const onReady = () => {
          item.classList.remove("skeleton");
          video.classList.add("show");
        };
        video.addEventListener("loadeddata", onReady, { once: true });
        video.addEventListener("error", () => {
          item.classList.remove("skeleton");
        });
      } else {
        item.classList.remove("skeleton");
      }

      return item;
    }

    item.innerHTML = `
      <img class="img-loaded profile-story-thumb-media" src="${mediaUrl}" alt="story">
      ${overlayHtml}
      ${createdAtBadgeHtml}
    `;

    const media = item.querySelector("img");
    if (media) {
      const onLoaded = () => {
        item.classList.remove("skeleton");
        media.classList.add("show");
      };
      if (media.complete) onLoaded();
      else media.onload = onLoaded;
      media.onerror = () => item.classList.remove("skeleton");
    } else {
      item.classList.remove("skeleton");
    }

    return item;
  }

  function prependPostToProfile(post) {
    const grid = document.getElementById("profile-posts-grid");
    if (!grid || !currentProfileId) return;

    // Only prepend if it's the current profile being viewed
    if (currentProfileId !== post.author.accountId) {
      return;
    }

    // Check for duplicates
    if (
      grid.querySelector(
        `[data-post-id="${post.postId}"]` ||
          `[data-post-id="${post.postId.toLowerCase()}"]`,
      )
    ) {
      return;
    }

    // Keep navigation list in sync (newest at top)
    profilePostIds.unshift({ postId: post.postId, postCode: post.postCode });

    const item = createGridItem(post);
    item.classList.add("post-new-fade-in");
    grid.prepend(item);

    if (window.lucide) lucide.createIcons();
  }

  // Edit Profile Modal logic
  let originalProfileData = {}; // Store original values for change detection
  let bioEmojiPickerInstance = null;
  let selectedAvatarFile = null;
  let shouldDeleteAvatar = false;
  let selectedCoverFile = null;
  let shouldDeleteCover = false;

  let currentPhonePrivacy = 0;
  let currentAddressPrivacy = 0;

  const PRIVACY_CONFIG = {
    0: { icon: "globe", next: 1, class: "public", title: "Public" },
    1: { icon: "users", next: 2, class: "follow", title: "Follow Only" },
    2: { icon: "lock", next: 0, class: "private", title: "Private" },
  };

  function updatePrivacyUI(type) {
    const value =
      type === "phone" ? currentPhonePrivacy : currentAddressPrivacy;
    const btn = document.getElementById(`toggle-${type}-privacy`);
    if (!btn) return;

    const config = PRIVACY_CONFIG[value];
    btn.innerHTML = `<i data-lucide="${config.icon}"></i>`;
    btn.className = `privacy-toggle-btn ${config.class}`;
    btn.title = `Current: ${config.title} (Click to change)`;

    if (window.lucide) lucide.createIcons();
  }

  function togglePrivacy(type) {
    if (type === "phone") {
      currentPhonePrivacy = PRIVACY_CONFIG[currentPhonePrivacy].next;
    } else {
      currentAddressPrivacy = PRIVACY_CONFIG[currentAddressPrivacy].next;
    }
    updatePrivacyUI(type);
  }

  function setMaxLengthsFromConfig() {
    // Set maxlength from APP_CONFIG
    const fullnameInput = document.getElementById("edit-fullname");
    const bioInput = document.getElementById("edit-bio");
    const phoneInput = document.getElementById("edit-phone");
    const addressInput = document.getElementById("edit-address");
    const bioMaxLengthSpan = document.getElementById("bioMaxLength");

    if (fullnameInput)
      fullnameInput.setAttribute(
        "maxlength",
        window.APP_CONFIG.MAX_PROFILE_FULLNAME_LENGTH,
      );
    if (bioInput)
      bioInput.setAttribute(
        "maxlength",
        window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH,
      );
    if (phoneInput)
      phoneInput.setAttribute(
        "maxlength",
        window.APP_CONFIG.MAX_PROFILE_PHONE_LENGTH,
      );
    if (addressInput)
      addressInput.setAttribute(
        "maxlength",
        window.APP_CONFIG.MAX_PROFILE_ADDRESS_LENGTH,
      );
    if (bioMaxLengthSpan)
      bioMaxLengthSpan.textContent = window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH;
  }

  function setupEditProfileListeners() {
    // Character counter for bio
    const bioInput = document.getElementById("edit-bio");
    const charCount = document.getElementById("bioCharCount");

    if (bioInput && charCount) {
      // Auto-resize textarea
      const autoResize = () => {
        bioInput.style.height = "auto";
        bioInput.style.height = Math.min(bioInput.scrollHeight, 200) + "px";
      };

      bioInput.addEventListener("input", () => {
        const length = bioInput.value.length;
        charCount.textContent = length;
        const maxLength = window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH || 200;
        if (length >= maxLength) {
          charCount.classList.add("at-max-length");
        } else {
          charCount.classList.remove("at-max-length");
        }
        autoResize();
      });

      // Initial resize
      autoResize();
    }

    // Phone number validation
    const phoneInput = document.getElementById("edit-phone");
    if (phoneInput) {
      phoneInput.addEventListener("input", (e) => {
        // Allow only numbers, +, spaces, and hyphens
        let value = e.target.value;
        value = value.replace(/[^\d\+\s\-]/g, "");
        e.target.value = value;
      });
    }

    // Helper to update modal cover background when no cover image
    const updateEditCoverBackground = async () => {
      const coverPreview = document.getElementById("edit-cover-preview");
      const avatarPreview = document.getElementById("edit-profile-preview");
      const coverContainer = document.querySelector(".edit-cover-container");

      if (!coverContainer || !avatarPreview) return;

      // Show gradient if: deleting cover OR (no current cover AND no new cover selected)
      const noCover =
        shouldDeleteCover || (!originalProfileData.cover && !selectedCoverFile);

      if (noCover) {
        if (coverPreview) coverPreview.style.display = "none";
        if (typeof extractDominantColor === "function" && avatarPreview.src) {
          try {
            const color = await extractDominantColor(avatarPreview.src);
            coverContainer.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
          } catch (e) {
            coverContainer.style.background =
              "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
          }
        } else {
          coverContainer.style.background =
            "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
        }
      } else {
        if (coverPreview) {
          coverPreview.style.display = "block";
        }
      }
    };

    // Avatar Upload & Delete Logic
    const avatarInput = document.getElementById("avatar-upload-input");
    const avatarPreview = document.getElementById("edit-profile-preview");
    const deleteAvatarBtn = document.getElementById("delete-avatar-btn");

    if (avatarInput) {
      avatarInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const maxSize =
            (window.APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5) * 1024 * 1024;
          if (file.size > maxSize) {
            if (window.toastError) toastError("File size exceeds limit.");
            avatarInput.value = "";
            return;
          }
          selectedAvatarFile = file;
          shouldDeleteAvatar = false;
          const reader = new FileReader();
          reader.onload = (re) => {
            avatarPreview.src = re.target.result;
            updateEditCoverBackground();
          };
          reader.readAsDataURL(file);
        }
      };
    }

    if (deleteAvatarBtn) {
      deleteAvatarBtn.onclick = () => {
        selectedAvatarFile = null;
        shouldDeleteAvatar = true;
        if (avatarInput) avatarInput.value = "";
        avatarPreview.src =
          window.APP_CONFIG.DEFAULT_AVATAR ||
          "assets/images/default-avatar.jpg";
        updateEditCoverBackground();
      };
    }

    // Cover Upload & Delete Logic
    const coverInput = document.getElementById("cover-upload-input");
    const coverPreview = document.getElementById("edit-cover-preview");
    const deleteCoverBtn = document.getElementById("delete-cover-btn");

    if (coverInput && coverPreview) {
      coverInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const maxSize =
            (window.APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5) * 1024 * 1024;
          if (file.size > maxSize) {
            if (window.toastError)
              toastError("Cover image size exceeds limit.");
            coverInput.value = "";
            return;
          }
          selectedCoverFile = file;
          shouldDeleteCover = false;
          const reader = new FileReader();
          reader.onload = (re) => {
            coverPreview.src = re.target.result;
            coverPreview.style.display = "block";
          };
          reader.readAsDataURL(file);
        }
      };
    }

    if (deleteCoverBtn && coverPreview) {
      deleteCoverBtn.onclick = () => {
        selectedCoverFile = null;
        shouldDeleteCover = true;
        if (coverInput) coverInput.value = "";
        updateEditCoverBackground();
      };
    }

    // Click outside modal to close with confirmation
    const modal = document.getElementById("edit-profile-modal");
    if (modal) {
      let isMouseDownOnOverlay = false;
      modal.onmousedown = (e) => {
        isMouseDownOnOverlay = e.target === modal;
      };
      modal.onmouseup = (e) => {
        if (isMouseDownOnOverlay && e.target === modal) checkChangesAndClose();
        isMouseDownOnOverlay = false;
      };

      const escHandler = (e) => {
        if (e.key === "Escape" && modal.style.display === "flex")
          checkChangesAndClose();
      };
      document.removeEventListener("keydown", escHandler);
      document.addEventListener("keydown", escHandler);
    }

    // Initial background update
    updateEditCoverBackground();

    // Setup Privacy Toggles
    const phoneToggle = document.getElementById("toggle-phone-privacy");
    if (phoneToggle) phoneToggle.onclick = () => togglePrivacy("phone");

    const addressToggle = document.getElementById("toggle-address-privacy");
    if (addressToggle) addressToggle.onclick = () => togglePrivacy("address");
  }

  function hasProfileChanges() {
    const fullName = document.getElementById("edit-fullname").value.trim();
    const bio = document.getElementById("edit-bio").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const address = document.getElementById("edit-address").value.trim();
    const genderEl = document.querySelector('input[name="gender"]:checked');
    const gender = genderEl ? genderEl.value : "";

    return (
      fullName !== (originalProfileData.fullName || "") ||
      bio !== (originalProfileData.bio || "") ||
      phone !== (originalProfileData.phone || "") ||
      address !== (originalProfileData.address || "") ||
      gender !== (originalProfileData.gender || "") ||
      selectedCoverFile !== null ||
      shouldDeleteCover ||
      currentPhonePrivacy !== (originalProfileData.phonePrivacy || 0) ||
      currentAddressPrivacy !== (originalProfileData.addressPrivacy || 0)
    );
  }

  global.checkChangesAndClose = function () {
    if (hasProfileChanges()) {
      showDiscardChangesConfirmation();
    } else {
      closeEditProfile();
    }
  };

  function showDiscardChangesConfirmation() {
    // Prevent multiple popups
    if (document.querySelector(".unfollow-overlay")) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay"; // Reuse overlay style

    const popup = document.createElement("div");
    popup.className = "unfollow-popup"; // Reuse popup style

    popup.innerHTML = `
            <div class="unfollow-content">
                <h3>Discard changes?</h3>
                <p>You have unsaved changes. Are you sure you want to discard them?</p>
            </div>
            <div class="unfollow-actions">
                <button class="unfollow-btn unfollow-confirm" data-action="discard">Discard</button>
                <button class="unfollow-btn unfollow-cancel" data-action="keep">Cancel</button>
            </div>
        `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("show"));

    // Define closePopup first
    const closePopup = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    };

    // Direct button listeners instead of event delegation
    const discardBtn = popup.querySelector('[data-action="discard"]');
    const keepBtn = popup.querySelector('[data-action="keep"]');

    if (discardBtn) {
      discardBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeEditProfile();
        closePopup();
      };
    }

    if (keepBtn) {
      keepBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
      };
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) closePopup();
    };
  }

  global.openEditProfile = function () {
    const modal = document.getElementById("edit-profile-modal");
    if (!modal || !currentProfileData) return;

    const info = currentProfileData.accountInfo || currentProfileData.account;
    if (!info) return;

    setMaxLengthsFromConfig();

    // Reset flags
    selectedAvatarFile = null;
    shouldDeleteAvatar = false;
    selectedCoverFile = null;
    shouldDeleteCover = false;

    originalProfileData = {
      fullName: info.fullName || "",
      bio: info.bio || "",
      phone: info.phone || "",
      address: info.address || "",
      gender:
        info.gender !== null && info.gender !== undefined
          ? info.gender.toString()
          : "",
      avatar: info.avatarUrl || info.avatar || window.APP_CONFIG.DEFAULT_AVATAR,
      cover: info.coverUrl || info.cover || "",
      phonePrivacy: currentProfileData.settings?.phonePrivacy ?? 0,
      addressPrivacy: currentProfileData.settings?.addressPrivacy ?? 0,
    };

    currentPhonePrivacy = originalProfileData.phonePrivacy;
    currentAddressPrivacy = originalProfileData.addressPrivacy;

    updatePrivacyUI("phone");
    updatePrivacyUI("address");

    // Populate form
    document.getElementById("edit-fullname").value =
      originalProfileData.fullName;
    document.getElementById("edit-bio").value = originalProfileData.bio;
    document.getElementById("edit-phone").value = originalProfileData.phone;
    document.getElementById("edit-address").value = originalProfileData.address;

    // Populate gender radio
    const genderRadios = document.querySelectorAll('input[name="gender"]');
    genderRadios.forEach((radio) => {
      radio.checked = radio.value === originalProfileData.gender;
    });

    // Previews
    const avatarPreview = document.getElementById("edit-profile-preview");
    if (avatarPreview) avatarPreview.src = originalProfileData.avatar;

    const coverPreview = document.getElementById("edit-cover-preview");
    const coverContainer = document.querySelector(".edit-cover-container");

    if (coverPreview && coverContainer) {
      if (originalProfileData.cover) {
        coverPreview.src = originalProfileData.cover;
        coverPreview.style.display = "block";
      } else {
        coverPreview.style.display = "none";
        // Trigger gradient update
        if (
          typeof extractDominantColor === "function" &&
          originalProfileData.avatar
        ) {
          extractDominantColor(originalProfileData.avatar).then((color) => {
            coverContainer.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
          });
        }
      }
    }

    const bioCharCount = document.getElementById("bioCharCount");
    if (bioCharCount) {
      const length = originalProfileData.bio.length;
      bioCharCount.textContent = length;
      const maxLength = window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH || 200;
      if (length >= maxLength) {
        bioCharCount.classList.add("at-max-length");
      } else {
        bioCharCount.classList.remove("at-max-length");
      }
    }

    modal.style.display = "flex";

    if (!bioEmojiPickerInstance) {
      setupEditProfileListeners();
      bioEmojiPickerInstance = true;
    } else {
      // Already setup, but need to update background for this user
      const avatarPreview = document.getElementById("edit-profile-preview");
      if (avatarPreview && !originalProfileData.cover) {
        if (typeof extractDominantColor === "function") {
          extractDominantColor(avatarPreview.src).then((color) => {
            if (coverContainer)
              coverContainer.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
          });
        }
      }
    }

    if (window.lucide) lucide.createIcons();
  };

  global.closeEditProfile = function () {
    const modal = document.getElementById("edit-profile-modal");
    if (modal) {
      modal.style.display = "none";
      // Close emoji picker if open
      const emojiContainer = document.getElementById("bioEmojiPicker");
      if (emojiContainer) {
        EmojiUtils.closePicker(emojiContainer);
      }
    }
  };

  global.saveProfileChanges = async function () {
    if (!currentProfileId) return;

    const btn = document.querySelector(
      "#edit-profile-modal .profile-btn-primary",
    );
    if (!btn) return;

    // Get values
    const fullName = document.getElementById("edit-fullname").value.trim();
    const bio = document.getElementById("edit-bio").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const address = document.getElementById("edit-address").value.trim();
    const genderEl = document.querySelector('input[name="gender"]:checked');
    const gender = genderEl ? genderEl.value : "";

    // Validation
    if (!fullName) {
      if (window.toastError) toastError("Full name is required");
      return;
    }

    if (fullName.length > window.APP_CONFIG.MAX_PROFILE_FULLNAME_LENGTH) {
      if (window.toastError)
        toastError(
          `Full name must be less than ${window.APP_CONFIG.MAX_PROFILE_FULLNAME_LENGTH} characters`,
        );
      return;
    }

    if (bio.length > window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH) {
      if (window.toastError)
        toastError(
          `Bio must be less than ${window.APP_CONFIG.MAX_PROFILE_BIO_LENGTH} characters`,
        );
      return;
    }

    // Phone validation - must be valid format if provided
    if (phone && !/^[\d\+\s\-]+$/.test(phone)) {
      if (window.toastError)
        toastError("Phone number contains invalid characters");
      return;
    }

    if (phone.length > window.APP_CONFIG.MAX_PROFILE_PHONE_LENGTH) {
      if (window.toastError)
        toastError(
          `Phone number must be less than ${window.APP_CONFIG.MAX_PROFILE_PHONE_LENGTH} characters`,
        );
      return;
    }

    if (address.length > window.APP_CONFIG.MAX_PROFILE_ADDRESS_LENGTH) {
      if (window.toastError)
        toastError(
          `Address must be less than ${window.APP_CONFIG.MAX_PROFILE_ADDRESS_LENGTH} characters`,
        );
      return;
    }

    const originalContent = btn.innerHTML;
    btn.innerHTML =
      '<span class="spinner spinner-tiny" aria-hidden="true"></span><span>Saving...</span>';
    btn.disabled = true;

    try {
      const formData = new FormData();
      formData.append("FullName", fullName);
      formData.append("Bio", bio);
      formData.append("Phone", phone);
      formData.append("Address", address);
      formData.append("Gender", gender);
      formData.append("PhonePrivacy", currentPhonePrivacy);
      formData.append("AddressPrivacy", currentAddressPrivacy);

      // Avatar changes
      if (shouldDeleteAvatar) {
        formData.append("DeleteAvatar", "true");
      } else if (selectedAvatarFile) {
        formData.append("AvatarFile", selectedAvatarFile);
      }

      // Cover changes
      if (shouldDeleteCover) {
        formData.append("DeleteCover", "true");
      } else if (selectedCoverFile) {
        formData.append("CoverFile", selectedCoverFile);
      }

      const res = await API.Accounts.updateProfile(formData);
      if (res.ok) {
        if (window.toastSuccess) toastSuccess("Profile updated successfully!");
        closeEditProfile();
        loadProfileData();
      } else {
        const data = await res.json();
        if (window.toastError)
          toastError(data.message || "Failed to update profile.");
      }
    } catch (err) {
      console.error(err);
      if (window.toastError) toastError("An error occurred while saving.");
    } finally {
      btn.innerHTML = originalContent;
      if (window.lucide) lucide.createIcons();
      btn.disabled = false;
    }
  };

  global.toggleFollowProfile = async function (accountId) {
    const btn = document.querySelector(
      "#profile-action-btn .profile-btn-follow, #profile-action-btn .profile-btn-following",
    );
    if (!btn) return;

    const isFollowed = btn.classList.contains("profile-btn-following");

    if (isFollowed) {
      if (window.FollowModule) {
        FollowModule.showUnfollowConfirm(accountId, btn);
      } else {
        // Fallback if module is missing
        global.toggleFollowAction(accountId, btn, true);
      }
      return;
    }

    global.toggleFollowAction(accountId, btn, false);
  };

  global.toggleFollowAction = async function (accountId, btn, isFollowed) {
    if (!window.FollowModule) {
      if (window.toastError) toastError("Follow module not loaded.");
      return;
    }

    if (isFollowed) {
      await FollowModule.unfollowUser(accountId, btn);
    } else {
      await FollowModule.followUser(accountId, btn);
    }
  };

  global.openMessage = function (accountId) {
    if (window.ChatWindow) {
      ChatWindow.openByAccountId(accountId);
    } else {
      if (window.toastInfo) toastInfo("Messaging feature is loading...");
    }
  };

  global.openProfileMoreMenu = function () {
    if (window.toastInfo) toastInfo("More options coming soon!");
  };

  global.updateFollowStatus = function (
    accountId,
    isFollowing,
    followers,
    following,
  ) {
    // 1. Invalidate cache logic REVISED
    // ONLY clear cache if it is NOT my own profile.
    // If it is my profile, keep cache to preserve scroll position when I return.
    // The 'silent update' in initProfile will handle the data refresh.
    const myId = localStorage.getItem("accountId");
    const myUsername = localStorage.getItem("username");
    // Case-insensitive check
    const isMe =
      accountId.toLowerCase() === myId?.toLowerCase() ||
      accountId.toLowerCase() === myUsername?.toLowerCase();

    if (window.PageCache && !isMe) {
      // Clear all possible profile keys for this account
      PageCache.clear(`#/profile?id=${accountId}`);
      PageCache.clear(`#/profile/${accountId}`);
      // Note: We don't know the username of others easily here,
      // but app.js clears it on entry anyway.
    }

    // 2. If the user is CURRENTLY viewing this profile, update the live DOM and state
    if (currentProfileId == accountId && currentProfileData) {
      // Update internal state
      if (isFollowing !== undefined) {
        currentProfileData.isFollowedByCurrentUser = isFollowing;

        if (currentProfileData.followInfo) {
          currentProfileData.followInfo.isFollowedByCurrentUser = isFollowing;
        } else {
          currentProfileData.followInfo = {
            isFollowedByCurrentUser: isFollowing,
            followers: followers ?? 0,
            following: following ?? 0,
          };
        }
      }

      // Always update counts if provided
      if (currentProfileData.followInfo) {
        if (followers !== undefined)
          currentProfileData.followInfo.followers = followers;
        if (following !== undefined)
          currentProfileData.followInfo.following = following;
      }

      // Animate Stats directly
      const followersCountEl = document.getElementById(
        "profile-followers-count",
      );
      const followingCountEl = document.getElementById(
        "profile-following-count",
      );

      if (window.animateValue && typeof window.animateValue === "function") {
        if (followers !== undefined && followersCountEl)
          window.animateValue(followersCountEl, followers);
        if (following !== undefined && followingCountEl)
          window.animateValue(followingCountEl, following);
      } else if (
        window.PostUtils &&
        typeof PostUtils.animateCount === "function"
      ) {
        if (followers !== undefined && followersCountEl)
          PostUtils.animateCount(followersCountEl, followers);
        if (following !== undefined && followingCountEl)
          PostUtils.animateCount(followingCountEl, following);
      } else {
        // Fallback
        if (followers !== undefined && followersCountEl)
          followersCountEl.textContent = followers;
        if (following !== undefined && followingCountEl)
          followingCountEl.textContent = following;
      }

      // Update Action Button
      const actionBtn = document.getElementById("profile-action-btn");
      if (actionBtn && isFollowing !== undefined) {
        const followBtn = actionBtn.querySelector(
          ".profile-btn-follow, .profile-btn-following",
        );
        if (followBtn) {
          // Check if state actually matches 'isFollowing'
          const btnIsFollowing = followBtn.classList.contains(
            "profile-btn-following",
          );
          if (btnIsFollowing !== isFollowing) {
            // Swap state
            if (isFollowing) {
              followBtn.innerHTML =
                '<i data-lucide="check"></i><span>Following</span>';
              followBtn.className = "profile-btn profile-btn-following";
              followBtn.onclick = (e) =>
                FollowModule.showUnfollowConfirm(accountId, e.currentTarget);
            } else {
              followBtn.innerHTML =
                '<i data-lucide="user-plus"></i><span>Follow</span>';
              followBtn.className = "profile-btn profile-btn-follow";
              followBtn.onclick = () =>
                FollowModule.followUser(accountId, followBtn);
            }
            if (window.lucide) lucide.createIcons();
          }
        }
      }
    }
  };

  function setupFollowStatsListeners() {
    const stats = document.querySelector(".profile-stats");
    if (!stats) return;

    // stats.children -> [posts, followers, following]
    const followersLi = stats.children[1];
    const followingLi = stats.children[2];

    if (followersLi) {
      followersLi.style.cursor = "pointer";
      followersLi.onclick = () => {
        if (window.FollowListModule && currentProfileId) {
          FollowListModule.openFollowList(currentProfileId, "followers");
        }
      };
    }

    if (followingLi) {
      followingLi.style.cursor = "pointer";
      followingLi.onclick = () => {
        if (window.FollowListModule && currentProfileId) {
          FollowListModule.openFollowList(currentProfileId, "following");
        }
      };
    }
  }

  // Expose ProfilePage module for external updates (e.g., SignalR)
  global.ProfilePage = {
    init: initProfile,
    getAccountId: () => currentProfileId,
    getData: () => currentProfileData,
    setData: (data) => {
      currentProfileData = data;
    },
    renderHeader: () => renderProfileHeader(currentProfileData),
    prependPost: prependPostToProfile,
  };

  // Keep legacy exports for compatibility if needed
  global.initProfilePage = initProfile;
  global.getProfileAccountId = () => currentProfileId;
  global.prependPostToProfile = prependPostToProfile;
})(window);
