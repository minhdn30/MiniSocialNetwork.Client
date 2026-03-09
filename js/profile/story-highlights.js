/**
 * story-highlights.js
 * Handles profile story highlight groups UI and actions
 */

(function (global) {
  function shT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback) : fallback;
  }

  const HIGHLIGHT_ARCHIVE_PAGE_SIZE =
    global.APP_CONFIG?.STORY_HIGHLIGHT_ARCHIVE_PAGE_SIZE || 24;
  const HIGHLIGHT_GROUP_NAME_MAX_LENGTH =
    global.APP_CONFIG?.STORY_HIGHLIGHT_GROUP_NAME_MAX_LENGTH || 50;
  const HIGHLIGHT_GROUP_MAX_LIMIT =
    global.APP_CONFIG?.STORY_HIGHLIGHT_MAX_GROUPS || 20;
  const HIGHLIGHT_STORY_MAX_PER_GROUP =
    global.APP_CONFIG?.STORY_HIGHLIGHT_MAX_STORIES_PER_GROUP || 50;

  let currentProfileId = "";
  let currentProfileData = null;

  let highlightGroups = [];
  let isHighlightGroupsLoading = false;
  let activeHighlightMenu = null;
  let activeHighlightModal = null;
  let highlightGroupsRequestVersion = 0;
  let highlightTrackLayoutBinding = null;

  let resolveStoryTextThumbnailStyle = () => ({
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
    fontSizePx: 14,
  });

  let formatArchiveStoryCreatedAt = () => "";

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

  function normalizeEntityId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  async function readApiErrorMessage(response, fallbackKey, fallbackMessage) {
    if (!response) return shT(fallbackKey, {}, fallbackMessage);
    let rawMessage = "";
    try {
      const payload = await response.json();
      rawMessage = payload?.message ?? payload?.Message ?? "";
    } catch (_) {
      // Ignore non-JSON response
    }
    if (global.UIErrors?.resolveMessage) {
      return global.UIErrors.resolveMessage(
        "story",
        "load-highlight",
        response.status,
        rawMessage,
        fallbackKey,
        fallbackMessage,
      );
    }
    return shT(fallbackKey, {}, fallbackMessage);
  }

  function configure(options = {}) {
    if (typeof options.resolveStoryTextThumbnailStyle === "function") {
      resolveStoryTextThumbnailStyle = options.resolveStoryTextThumbnailStyle;
    }

    if (typeof options.formatArchiveStoryCreatedAt === "function") {
      formatArchiveStoryCreatedAt = options.formatArchiveStoryCreatedAt;
    }
  }

  function setContext(context = {}) {
    if (context.currentProfileId !== undefined) {
      currentProfileId = (context.currentProfileId || "").toString().trim();
    }

    if (context.currentProfileData !== undefined) {
      currentProfileData = context.currentProfileData || null;
    }
  }

  function readHighlightGroupId(rawGroup) {
    return (
      rawGroup?.storyHighlightGroupId ??
      rawGroup?.StoryHighlightGroupId ??
      ""
    )
      .toString()
      .trim();
  }

  function readHighlightStoryId(rawStory) {
    return (rawStory?.storyId ?? rawStory?.StoryId ?? "").toString().trim();
  }

  function resolveHighlightContentType(rawStory) {
    const value =
      rawStory?.contentType ??
      rawStory?.ContentType ??
      rawStory?.type ??
      rawStory?.Type ??
      0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeHighlightStory(rawStory) {
    return {
      storyId: readHighlightStoryId(rawStory),
      contentType: resolveHighlightContentType(rawStory),
      mediaUrl: rawStory?.mediaUrl ?? rawStory?.MediaUrl ?? "",
      textContent: rawStory?.textContent ?? rawStory?.TextContent ?? "",
      backgroundColorKey:
        rawStory?.backgroundColorKey ?? rawStory?.BackgroundColorKey ?? "",
      fontTextKey: rawStory?.fontTextKey ?? rawStory?.FontTextKey ?? "",
      fontSizeKey: rawStory?.fontSizeKey ?? rawStory?.FontSizeKey ?? "",
      textColorKey: rawStory?.textColorKey ?? rawStory?.TextColorKey ?? "",
      createdAt: rawStory?.createdAt ?? rawStory?.CreatedAt ?? null,
      expiresAt: rawStory?.expiresAt ?? rawStory?.ExpiresAt ?? null,
      isViewedByCurrentUser:
        rawStory?.isViewedByCurrentUser ??
        rawStory?.IsViewedByCurrentUser ??
        false,
      currentUserReactType:
        rawStory?.currentUserReactType ??
        rawStory?.CurrentUserReactType ??
        null,
    };
  }

  function normalizeHighlightGroup(rawGroup) {
    const fallbackRaw =
      rawGroup?.fallbackStory ?? rawGroup?.FallbackStory ?? null;
    const fallbackStory = fallbackRaw
      ? normalizeHighlightStory(fallbackRaw)
      : null;

    return {
      storyHighlightGroupId: readHighlightGroupId(rawGroup),
      accountId: (
        rawGroup?.accountId ??
        rawGroup?.AccountId ??
        currentProfileId ??
        ""
      )
        .toString()
        .trim(),
      name:
        (rawGroup?.name ??
          rawGroup?.Name ??
          shT("story.viewer.highlightFallbackName", {}, "highlight"))
          .toString()
          .trim() ||
        shT("story.viewer.highlightFallbackName", {}, "highlight"),
      coverImageUrl: rawGroup?.coverImageUrl ?? rawGroup?.CoverImageUrl ?? "",
      storyCount:
        Number.parseInt(
          String(rawGroup?.storyCount ?? rawGroup?.StoryCount ?? 0),
          10,
        ) || 0,
      createdAt: rawGroup?.createdAt ?? rawGroup?.CreatedAt ?? null,
      updatedAt: rawGroup?.updatedAt ?? rawGroup?.UpdatedAt ?? null,
      fallbackStory,
    };
  }

  function isCurrentProfileOwner() {
    const profileOwnerId = normalizeEntityId(
      currentProfileData?.accountInfo?.accountId ??
        currentProfileData?.accountInfo?.AccountId ??
        currentProfileData?.account?.accountId ??
        currentProfileData?.account?.AccountId ??
        currentProfileId,
    );
    const currentAccountId = normalizeEntityId(
      localStorage.getItem("accountId"),
    );
    return (
      !!profileOwnerId &&
      !!currentAccountId &&
      profileOwnerId === currentAccountId
    );
  }

  function resolveCurrentProfileHighlightAuthor() {
    const accountInfo =
      currentProfileData?.accountInfo ||
      currentProfileData?.AccountInfo ||
      currentProfileData?.account ||
      currentProfileData?.Account ||
      {};

    return {
      accountId:
        accountInfo.accountId ??
        accountInfo.AccountId ??
        currentProfileId ??
        "",
      username:
        accountInfo.username ??
        accountInfo.Username ??
        localStorage.getItem("username") ??
        "",
      fullName:
        accountInfo.fullName ??
        accountInfo.FullName ??
        localStorage.getItem("fullname") ??
        "",
      avatarUrl:
        accountInfo.avatarUrl ??
        accountInfo.AvatarUrl ??
        localStorage.getItem("avatarUrl") ??
        APP_CONFIG.DEFAULT_AVATAR,
    };
  }

  function getProfileHighlightsContainer() {
    return document.getElementById("profile-highlights");
  }

  function setProfileHighlightsHiddenState(container, hidden) {
    if (!container) return;
    container.classList.toggle("profile-highlights-hidden", hidden === true);
  }

  function renderProfileHighlightsLoading() {
    const container = getProfileHighlightsContainer();
    if (!container) return;
    setProfileHighlightsHiddenState(container, false);
    container.innerHTML = `
      <div class="profile-highlight-loading">
        <span class="spinner spinner-small" aria-hidden="true"></span>
      </div>
    `;
  }

  function resolveHighlightGroupTextCoverFontSize(baseFontSizePx) {
    const parsedSize = Number(baseFontSizePx);
    const normalizedSize = Number.isFinite(parsedSize) ? parsedSize : 14;
    const scaledSize = Math.round(normalizedSize * 0.58);
    return Math.max(9, Math.min(14, scaledSize));
  }

  function buildHighlightFallbackStoryMarkup(story, options = {}) {
    const variant = (options.variant || "group")
      .toString()
      .trim()
      .toLowerCase();
    const isCompactGroupVariant = variant !== "picker";

    if (!story) {
      return `
        <div class="profile-highlight-cover">
          <i data-lucide="circle-dashed"></i>
        </div>
      `;
    }

    if (story.contentType === 2) {
      const style = resolveStoryTextThumbnailStyle(story);
      const textContent = escapeHtml(story.textContent || "");
      const textFontSize = isCompactGroupVariant
        ? resolveHighlightGroupTextCoverFontSize(style.fontSizePx)
        : Math.max(11, style.fontSizePx);
      return `
        <div class="profile-highlight-cover-text ${isCompactGroupVariant ? "profile-highlight-cover-text-compact" : ""}" style="background:${style.background};">
          <span style="color:${style.color};font-family:${style.fontFamily};font-size:${textFontSize}px;">${textContent}</span>
        </div>
      `;
    }

    const mediaUrl = escapeAttr(story.mediaUrl || "");
    if (story.contentType === 1) {
      return `
        <div class="profile-highlight-cover">
          <video src="${mediaUrl}" muted playsinline preload="metadata"></video>
        </div>
      `;
    }

    return `
      <div class="profile-highlight-cover">
        <img src="${mediaUrl}" alt="">
      </div>
    `;
  }

  function buildHighlightGroupCoverMarkup(group) {
    const coverUrl = (group.coverImageUrl || "").toString().trim();
    if (coverUrl) {
      return `
        <div class="profile-highlight-cover">
          <img src="${escapeAttr(coverUrl)}" alt="${escapeAttr(group.name)}">
        </div>
      `;
    }

    return buildHighlightFallbackStoryMarkup(group.fallbackStory, {
      variant: "group",
    });
  }

  function closeHighlightMenu() {
    if (!activeHighlightMenu) return;

    const { menuEl, cardEl, onDocumentPointerDown, onScroll } =
      activeHighlightMenu;
    if (menuEl?.parentNode) {
      menuEl.remove();
    }
    if (cardEl) {
      cardEl.classList.remove("menu-open");
    }
    if (onDocumentPointerDown) {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    }
    if (onScroll) {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    }

    activeHighlightMenu = null;
  }

  function cleanupHighlightTrackLayoutWatcher() {
    if (!highlightTrackLayoutBinding) return;

    const {
      shellEl,
      trackEl,
      prevBtn,
      nextBtn,
      onResize,
      onScroll,
      onPrevClick,
      onNextClick,
    } = highlightTrackLayoutBinding;

    if (onResize) {
      window.removeEventListener("resize", onResize);
    }
    if (trackEl && onScroll) {
      trackEl.removeEventListener("scroll", onScroll);
    }
    if (prevBtn && onPrevClick) {
      prevBtn.removeEventListener("click", onPrevClick);
    }
    if (nextBtn && onNextClick) {
      nextBtn.removeEventListener("click", onNextClick);
    }
    if (shellEl) {
      shellEl.style.removeProperty("--profile-highlights-nav-top");
    }

    highlightTrackLayoutBinding = null;
  }

  function resolveHighlightTrackMaxScroll(trackEl) {
    if (!trackEl) return 0;
    const maxScroll = trackEl.scrollWidth - trackEl.clientWidth;
    if (!Number.isFinite(maxScroll)) return 0;
    return Math.max(0, maxScroll);
  }

  function resolveHighlightTrackScrollStep(trackEl) {
    if (!trackEl) return 0;

    const firstItem = trackEl.querySelector(".profile-highlight-item");
    const computedStyle = window.getComputedStyle(trackEl);
    const gapValue = Number.parseFloat(
      computedStyle.columnGap || computedStyle.gap || "0",
    );
    const gap = Number.isFinite(gapValue) ? gapValue : 0;

    if (firstItem) {
      const itemWidth = firstItem.getBoundingClientRect().width + gap;
      if (itemWidth > 0) {
        const itemsPerViewport = Math.max(
          1,
          Math.floor((trackEl.clientWidth + gap) / itemWidth),
        );
        const pageStep = Math.max(1, itemsPerViewport - 1) * itemWidth;
        return Math.round(pageStep);
      }
    }

    return Math.max(120, Math.round(trackEl.clientWidth * 0.82));
  }

  function syncHighlightTrackNavVerticalPosition(shellEl, trackEl) {
    if (!shellEl || !trackEl) return;

    const ringEl = trackEl.querySelector(".profile-highlight-ring");
    if (!ringEl) {
      shellEl.style.removeProperty("--profile-highlights-nav-top");
      return;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const ringRect = ringEl.getBoundingClientRect();
    const centerY = ringRect.top - shellRect.top + ringRect.height / 2;
    if (!Number.isFinite(centerY)) return;

    shellEl.style.setProperty(
      "--profile-highlights-nav-top",
      `${Math.round(centerY)}px`,
    );
  }

  function applyHighlightTrackOverflowState(
    trackEl,
    shellEl,
    prevBtn,
    nextBtn,
  ) {
    if (!trackEl) return;

    const maxScroll = resolveHighlightTrackMaxScroll(trackEl);
    const hasOverflow = maxScroll > 1;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(trackEl.scrollLeft, maxScroll),
    );
    const canNavigatePrev = hasOverflow && clampedScrollLeft > 1;
    const canNavigateNext = hasOverflow && clampedScrollLeft < maxScroll - 1;

    trackEl.classList.toggle("is-overflowing", hasOverflow);
    if (shellEl) {
      shellEl.classList.toggle("is-scrollable", hasOverflow);
    }

    if (prevBtn) {
      prevBtn.classList.toggle("is-hidden", !canNavigatePrev);
    }
    if (nextBtn) {
      nextBtn.classList.toggle("is-hidden", !canNavigateNext);
    }
  }

  function bindHighlightTrackLayoutWatcher(container) {
    cleanupHighlightTrackLayoutWatcher();

    const shellEl = container?.querySelector(".profile-highlights-shell");
    const trackEl = container?.querySelector(".profile-highlights-track");
    const prevBtn = container?.querySelector(
      '[data-action="scroll-highlights-prev"]',
    );
    const nextBtn = container?.querySelector(
      '[data-action="scroll-highlights-next"]',
    );
    if (!trackEl) return;

    const updateLayout = () =>
      applyHighlightTrackOverflowState(trackEl, shellEl, prevBtn, nextBtn);

    let layoutFrameRequested = false;
    const scheduleLayoutUpdate = () => {
      if (layoutFrameRequested) return;
      layoutFrameRequested = true;
      requestAnimationFrame(() => {
        layoutFrameRequested = false;
        updateLayout();
      });
    };

    let navPositionFrameRequested = false;
    const scheduleNavPositionUpdate = () => {
      if (navPositionFrameRequested) return;
      navPositionFrameRequested = true;
      requestAnimationFrame(() => {
        navPositionFrameRequested = false;
        syncHighlightTrackNavVerticalPosition(shellEl, trackEl);
      });
    };

    const scrollByDirection = (direction) => {
      const maxScroll = resolveHighlightTrackMaxScroll(trackEl);
      if (maxScroll <= 1) {
        updateLayout();
        return;
      }

      const step = resolveHighlightTrackScrollStep(trackEl);
      if (step <= 0) {
        updateLayout();
        return;
      }

      const targetScrollLeft = Math.max(
        0,
        Math.min(maxScroll, trackEl.scrollLeft + direction * step),
      );

      trackEl.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });

      scheduleLayoutUpdate();
    };

    const onPrevClick = () => scrollByDirection(-1);
    const onNextClick = () => scrollByDirection(1);
    const onScroll = scheduleLayoutUpdate;
    const onResize = () => {
      scheduleLayoutUpdate();
      scheduleNavPositionUpdate();
    };

    if (prevBtn) {
      prevBtn.addEventListener("click", onPrevClick);
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", onNextClick);
    }

    trackEl.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    scheduleLayoutUpdate();
    scheduleNavPositionUpdate();

    highlightTrackLayoutBinding = {
      shellEl,
      trackEl,
      prevBtn,
      nextBtn,
      onResize,
      onScroll,
      onPrevClick,
      onNextClick,
    };
  }

  function closeHighlightModal() {
    if (!activeHighlightModal) return;

    const { overlay, onDocumentKeyDown, cleanup } = activeHighlightModal;
    if (onDocumentKeyDown) {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    }

    if (overlay) {
      overlay.classList.remove("show");
      setTimeout(() => {
        overlay.remove();
      }, 180);
    }

    if (typeof cleanup === "function") {
      cleanup();
    }

    activeHighlightModal = null;
  }

  function setActiveHighlightModal(overlay, cleanup, options = {}) {
    closeHighlightModal();

    const triggerClose = () => {
      if (typeof options?.onRequestClose === "function") {
        options.onRequestClose(closeHighlightModal);
      } else {
        closeHighlightModal();
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        triggerClose();
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown, true);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        triggerClose();
      }
    });

    activeHighlightModal = {
      overlay,
      onDocumentKeyDown,
      cleanup,
    };
  }

  function openHighlightGroupMenu(group, menuBtn, cardEl) {
    if (!group || !menuBtn || !cardEl) return;
    closeHighlightMenu();

    const menuEl = document.createElement("div");
    menuEl.className = "profile-highlight-card-menu";
    menuEl.innerHTML = `
      <button type="button" data-action="add-items"><i data-lucide="plus"></i><span>${escapeHtml(shT("profile.highlights.menuAddStories", {}, "Add stories"))}</span></button>
      <button type="button" data-action="edit-group"><i data-lucide="pencil-line"></i><span>${escapeHtml(shT("profile.highlights.menuEditGroup", {}, "Edit group"))}</span></button>
      <button type="button" data-action="delete-group" class="danger"><i data-lucide="trash-2"></i><span>${escapeHtml(shT("profile.highlights.menuDeleteGroup", {}, "Delete group"))}</span></button>
    `;
    document.body.appendChild(menuEl);

    const rect = menuBtn.getBoundingClientRect();
    const menuWidth = menuEl.offsetWidth || 190;
    const menuHeight = menuEl.offsetHeight || 132;
    const viewportPadding = 10;

    let left = rect.right - menuWidth + 12; // align right edge of popup near right edge of button
    if (left < viewportPadding) left = viewportPadding;
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = Math.max(
        viewportPadding,
        window.innerWidth - viewportPadding - menuWidth,
      );
    }

    const estimatedHeight = 132;
    let top = rect.top - menuHeight - 6; // Render firmly above the button
    let isArrowBottom = true;

    // Only fall back to bottom behavior if there's no vertical space at the top
    if (top < viewportPadding) {
      top = rect.bottom + 6;
      isArrowBottom = false;
    }

    menuEl.classList.add(isArrowBottom ? "arrow-bottom" : "arrow-top");

    // Calculate precise center point of the button relative to the popup's X coordinate
    const arrowX = rect.left + rect.width / 2 - left;
    menuEl.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);

    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.top = `${Math.round(top)}px`;
    cardEl.classList.add("menu-open");

    if (window.lucide) {
      window.lucide.createIcons({ root: menuEl });
    }

    menuEl.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = btn.getAttribute("data-action");
        closeHighlightMenu();

        if (action === "add-items") {
          openAddStoriesToHighlightGroupModal(group);
        } else if (action === "edit-group") {
          openEditHighlightGroupModal(group);
        } else if (action === "delete-group") {
          deleteHighlightGroup(group);
        }
      });
    });

    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (!target) return;
      if (menuEl.contains(target) || menuBtn.contains(target)) return;
      closeHighlightMenu();
    };

    const onScroll = () => closeHighlightMenu();
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    activeHighlightMenu = {
      menuEl,
      cardEl,
      onDocumentPointerDown,
      onScroll,
    };
  }

  async function removeStoryFromHighlightGroup(groupId, storyId, options = {}) {
    const normalizedGroupId = (groupId || "").toString().trim();
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedGroupId || !normalizedStoryId) {
      return { ok: false, groupDeleted: false };
    }

    try {
      const response = await API.Stories.removeHighlightItem(
        normalizedGroupId,
        normalizedStoryId,
      );
      if (!response.ok) {
        const message = await readApiErrorMessage(
          response,
          "profile.highlights.removeStoryFailed",
          "Failed to remove story from the highlight",
        );
        if (window.toastError) {
          toastError(message);
        }
        return { ok: false, groupDeleted: false, message };
      }

      await loadProfileHighlightGroups({ silent: true, force: true });
      const groupDeleted = !highlightGroups.some(
        (group) =>
          normalizeEntityId(group.storyHighlightGroupId) ===
          normalizeEntityId(normalizedGroupId),
      );

      if (options.showSuccessToast !== false && window.toastSuccess) {
        if (groupDeleted) {
          toastSuccess(
            shT(
              "profile.highlights.removeStoryDeletedGroupSuccess",
              {},
              "Story removed and empty highlight deleted",
            ),
          );
        } else {
          toastSuccess(
            shT(
              "profile.highlights.removeStorySuccess",
              {},
              "Story removed from the highlight",
            ),
          );
        }
      }

      return { ok: true, groupDeleted };
    } catch (error) {
      console.error(error);
      if (window.toastError) {
        toastError(
          shT(
            "profile.highlights.removeStoryFailed",
            {},
            "Failed to remove story from the highlight",
          ),
        );
      }
      return { ok: false, groupDeleted: false };
    }
  }

  async function handleViewerRemoveHighlightStory(groupId, story) {
    const storyId = readHighlightStoryId(story);
    if (!storyId) return { ok: false, groupDeleted: false };

    return removeStoryFromHighlightGroup(groupId, storyId, {
      showSuccessToast: true,
    });
  }

  function renderProfileHighlightsSection() {
    const container = getProfileHighlightsContainer();
    if (!container) return;
    closeHighlightMenu();
    cleanupHighlightTrackLayoutWatcher();

    const isOwner = isCurrentProfileOwner();
    const groups = Array.isArray(highlightGroups)
      ? highlightGroups.filter((group) => (group.storyCount || 0) > 0)
      : [];

    if (!groups.length && !isOwner) {
      setProfileHighlightsHiddenState(container, true);
      container.innerHTML = "";
      return;
    }

    setProfileHighlightsHiddenState(container, false);

    const ownerCanAddNew =
      isOwner &&
      (!Array.isArray(highlightGroups) ||
        highlightGroups.length < HIGHLIGHT_GROUP_MAX_LIMIT);

    const addButtonHtml = ownerCanAddNew
      ? `
        <div class="profile-highlight-item profile-highlight-add-item profile-highlight-owner" data-action="add-highlight-group">
          <div class="profile-highlight-ring">
            <div class="profile-highlight-add-cover">
              <i data-lucide="plus"></i>
            </div>
          </div>
          <div class="profile-highlight-name">${escapeHtml(shT("profile.highlights.addNew", {}, "Add New"))}</div>
        </div>
      `
      : "";

    const groupItemsHtml = groups
      .map((group) => {
        const safeGroupId = escapeAttr(group.storyHighlightGroupId);
        const safeGroupName = escapeHtml(
          group.name || shT("story.viewer.highlightFallbackName", {}, "highlight"),
        );
        const storyCount = Math.max(0, Number(group.storyCount || 0));
        const storyCountText = shT(
          storyCount === 1
            ? "profile.highlights.storyCountSingle"
            : "profile.highlights.storyCountPlural",
          { count: storyCount },
          storyCount === 1 ? `${storyCount} story` : `${storyCount} stories`,
        );
        const ownerClass = isOwner ? "profile-highlight-owner" : "";
        const menuButtonHtml = isOwner
          ? `
            <button type="button" class="profile-highlight-card-menu-btn" data-action="open-group-menu" data-group-id="${safeGroupId}" aria-label="${escapeAttr(shT("profile.highlights.groupOptionsAria", {}, "Highlight group options"))}">
              <i data-lucide="more-horizontal"></i>
            </button>
          `
          : "";

        return `
          <div class="profile-highlight-item ${ownerClass}" data-highlight-group-id="${safeGroupId}">
            <div class="profile-highlight-ring">
              ${buildHighlightGroupCoverMarkup(group)}
            </div>
            <div class="profile-highlight-name">${safeGroupName}</div>
            <div class="profile-highlight-story-count">${escapeHtml(storyCountText)}</div>
            ${menuButtonHtml}
          </div>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="profile-highlights-shell">
        <button
          type="button"
          class="profile-highlights-nav profile-highlights-nav-prev is-hidden"
          data-action="scroll-highlights-prev"
          aria-label="${escapeAttr(shT("profile.highlights.prevGroupsAria", {}, "Previous highlights"))}"
        >
          <i data-lucide="chevron-left"></i>
        </button>
        <div class="profile-highlights-track">
          ${groupItemsHtml}
          ${addButtonHtml}
        </div>
        <button
          type="button"
          class="profile-highlights-nav profile-highlights-nav-next is-hidden"
          data-action="scroll-highlights-next"
          aria-label="${escapeAttr(shT("profile.highlights.nextGroupsAria", {}, "Next highlights"))}"
        >
          <i data-lucide="chevron-right"></i>
        </button>
      </div>
    `;
    bindHighlightTrackLayoutWatcher(container);

    if (window.lucide) {
      window.lucide.createIcons({ root: container });
    }

    const addButton = container.querySelector(
      '[data-action="add-highlight-group"]',
    );
    if (addButton) {
      addButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCreateHighlightGroupModal();
      });
    }

    container
      .querySelectorAll("[data-highlight-group-id]")
      .forEach((itemEl) => {
        const groupId = itemEl.getAttribute("data-highlight-group-id") || "";
        if (!groupId) return;

        itemEl.addEventListener("click", (event) => {
          const menuBtn = event.target.closest(
            '[data-action="open-group-menu"]',
          );
          if (menuBtn) return;

          openHighlightGroupViewer(groupId);
        });
      });

    if (isOwner) {
      container
        .querySelectorAll('[data-action="open-group-menu"]')
        .forEach((menuBtn) => {
          menuBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const groupId = menuBtn.getAttribute("data-group-id") || "";
            const group = highlightGroups.find(
              (item) =>
                normalizeEntityId(item.storyHighlightGroupId) ===
                normalizeEntityId(groupId),
            );
            const cardEl = menuBtn.closest("[data-highlight-group-id]");
            if (!group || !cardEl) return;

            // Toggle logic: If the menu for this specific group is already open, close it
            if (activeHighlightMenu && activeHighlightMenu.cardEl === cardEl) {
              closeHighlightMenu();
              return;
            }

            openHighlightGroupMenu(group, menuBtn, cardEl);
          });
        });
    }
  }

  async function loadProfileHighlightGroups(options = {}) {
    const silent = options.silent === true;
    const force = options.force === true;
    const targetAccountId = (currentProfileId || "").toString().trim();

    if (!targetAccountId) {
      highlightGroups = [];
      renderProfileHighlightsSection();
      return [];
    }

    if (isHighlightGroupsLoading && !force) {
      return highlightGroups;
    }

    const requestVersion = ++highlightGroupsRequestVersion;
    isHighlightGroupsLoading = true;

    if (
      !silent &&
      (!Array.isArray(highlightGroups) || highlightGroups.length === 0)
    ) {
      renderProfileHighlightsLoading();
    }

    try {
      if (!API?.Stories?.getHighlightGroupsByProfile) {
        throw new Error(
          shT(
            "profile.highlights.apiUnavailable",
            {},
            "Highlights aren't available right now",
          ),
        );
      }

      const response =
        await API.Stories.getHighlightGroupsByProfile(targetAccountId);

      if (
        highlightGroupsRequestVersion !== requestVersion ||
        normalizeEntityId(currentProfileId) !==
          normalizeEntityId(targetAccountId)
      ) {
        return highlightGroups;
      }

      if (!response.ok) {
        const message = await readApiErrorMessage(
          response,
          "profile.highlights.loadFailed",
          "Couldn't load story highlights",
        );
        if (!silent && window.toastError) {
          toastError(message);
        }
        highlightGroups = [];
        renderProfileHighlightsSection();
        return [];
      }

      const payload = await response.json().catch(() => []);
      const normalizedGroups = (Array.isArray(payload) ? payload : [])
        .map(normalizeHighlightGroup)
        .filter((group) => group.storyHighlightGroupId && group.storyCount > 0)
        .sort((left, right) => {
          const leftTime = new Date(left.createdAt || 0).getTime();
          const rightTime = new Date(right.createdAt || 0).getTime();
          if (leftTime !== rightTime) return leftTime - rightTime;
          return normalizeEntityId(left.storyHighlightGroupId).localeCompare(
            normalizeEntityId(right.storyHighlightGroupId),
          );
        });

      highlightGroups = normalizedGroups;
      renderProfileHighlightsSection();
      return normalizedGroups;
    } catch (error) {
      console.error(error);
      if (!silent && window.toastError) {
        toastError(
          shT(
            "profile.highlights.loadFailed",
            {},
            "Couldn't load story highlights",
          ),
        );
      }
      highlightGroups = [];
      renderProfileHighlightsSection();
      return [];
    } finally {
      if (highlightGroupsRequestVersion === requestVersion) {
        isHighlightGroupsLoading = false;
      }
    }
  }

  async function openHighlightGroupViewer(groupId, targetStoryId = "") {
    const normalizedGroupId = (groupId || "").toString().trim();
    const targetAccountId = (currentProfileId || "").toString().trim();
    if (!normalizedGroupId || !targetAccountId) return;

    if (typeof window.openStoryViewerByHighlightGroup !== "function") {
      if (window.toastError) {
        toastError(
          shT(
            "profile.highlights.viewerUnavailable",
            {},
            "Can't open the story viewer right now",
          ),
        );
      }
      return;
    }

    const highlightAuthor = resolveCurrentProfileHighlightAuthor();
    const isOwner = isCurrentProfileOwner();
    const highlightGroupQueue = Array.isArray(highlightGroups)
      ? highlightGroups
          .map((group) => ({
            storyHighlightGroupId: group.storyHighlightGroupId,
            accountId: group.accountId || targetAccountId,
            name: group.name,
            coverImageUrl: group.coverImageUrl,
            storyCount: group.storyCount,
            fallbackStory: group.fallbackStory || null,
          }))
          .filter((group) => !!group.storyHighlightGroupId)
      : [];
    const highlightGroupIndex = highlightGroupQueue.findIndex(
      (group) =>
        normalizeEntityId(group.storyHighlightGroupId) ===
        normalizeEntityId(normalizedGroupId),
    );

    const openStatus = await window.openStoryViewerByHighlightGroup(
      targetAccountId,
      normalizedGroupId,
      {
        syncUrl: true,
        targetStoryId,
        highlightGroupQueue,
        highlightGroupIndex,
        highlightAuthor,
        onRemoveCurrentStory: isOwner
          ? (story, context = {}) =>
              handleViewerRemoveHighlightStory(
                (context?.groupId || normalizedGroupId).toString().trim(),
                story,
              )
          : null,
      },
    );

    if (openStatus === "unavailable") {
      loadProfileHighlightGroups({ silent: true, force: true });
    }
  }

  function buildHighlightCandidateThumbHtml(story) {
    if (story.contentType === 2) {
      const style = resolveStoryTextThumbnailStyle(story);
      const textContent = escapeHtml(story.textContent || "");
      return `
        <div class="profile-story-text-thumb" style="background:${style.background};">
          <div class="profile-story-text-content" style="color:${style.color};font-family:${style.fontFamily};font-size:${style.fontSizePx}px;">${textContent}</div>
        </div>
      `;
    }

    const mediaUrl = escapeAttr(story.mediaUrl || "");
    if (story.contentType === 1) {
      return `<video class="profile-story-thumb-media" src="${mediaUrl}" muted playsinline preload="metadata"></video>`;
    }

    return `<img class="profile-story-thumb-media" src="${mediaUrl}" alt="">`;
  }

  function createHighlightModalShell(title, subtitle = "", options = {}) {
    const hasSubtitle =
      typeof subtitle === "string" && subtitle.trim().length > 0;
    const centerTitle = options?.centerTitle === true;
    const headerClass = centerTitle
      ? "profile-highlight-modal-header profile-highlight-modal-header-center-title"
      : "profile-highlight-modal-header";

    const overlay = document.createElement("div");
    overlay.className = "profile-highlight-modal-overlay";
    overlay.innerHTML = `
      <div class="profile-highlight-modal" role="dialog" aria-modal="true">
        <div class="${headerClass}">
          <button type="button" class="profile-highlight-btn profile-highlight-icon-btn profile-highlight-modal-back hidden" data-action="prev-step" aria-label="${escapeAttr(shT("profile.highlights.backAria", {}, "Back"))}">
            <i data-lucide="arrow-left"></i>
          </button>
          <div class="profile-highlight-modal-title-wrap">
            <h3 class="profile-highlight-modal-title">${escapeHtml(title)}</h3>
            ${hasSubtitle ? `<p class="profile-highlight-modal-subtitle">${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <button type="button" class="profile-highlight-modal-close" data-action="close-highlight-modal" aria-label="${escapeAttr(shT("profile.highlights.closeAria", {}, "Close"))}">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="profile-highlight-modal-body"></div>
        <div class="profile-highlight-modal-footer"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    if (window.lucide) {
      window.lucide.createIcons({ root: overlay });
    }

    const closeBtn = overlay.querySelector(
      '[data-action="close-highlight-modal"]',
    );
    if (closeBtn) {
      closeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof options?.onRequestClose === "function") {
          options.onRequestClose(closeHighlightModal);
        } else {
          closeHighlightModal();
        }
      });
    }

    setActiveHighlightModal(overlay, null, options);
    return {
      overlay,
      bodyEl: overlay.querySelector(".profile-highlight-modal-body"),
      footerEl: overlay.querySelector(".profile-highlight-modal-footer"),
      titleEl: overlay.querySelector(".profile-highlight-modal-title"),
      subtitleEl: overlay.querySelector(".profile-highlight-modal-subtitle"),
      backEl: overlay.querySelector(".profile-highlight-modal-back"),
    };
  }

  function isHighlightModalShellActive(shell) {
    const overlay = shell?.overlay;
    if (!overlay) return false;
    return (
      activeHighlightModal?.overlay === overlay &&
      document.body.contains(overlay)
    );
  }

  function showSystemConfirm(options = {}) {
    const {
      title = shT("chat.common.areYouSure", {}, "Are you sure?"),
      message = "",
      confirmText = shT("common.buttons.confirm", {}, "Confirm"),
      cancelText = shT("common.buttons.cancel", {}, "Cancel"),
      isDanger = false,
      inlineActions = false,
      onConfirm = null,
      onCancel = null,
    } = options;

    if (
      window.ChatCommon &&
      typeof window.ChatCommon.showConfirm === "function"
    ) {
      window.ChatCommon.showConfirm({
        title,
        message,
        confirmText,
        cancelText,
        isDanger,
        onConfirm,
        onCancel,
      });
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";
    popup.innerHTML = `
      <div class="unfollow-content">
        <h3>${escapeHtml(title)}</h3>
        ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      </div>
      <div class="unfollow-actions${inlineActions ? " unfollow-actions-inline" : ""}">
        <button type="button" class="unfollow-btn unfollow-cancel" data-action="cancel">${escapeHtml(cancelText)}</button>
        <button type="button" class="unfollow-btn ${isDanger ? "unfollow-confirm" : "unfollow-cancel"}" data-action="confirm">${escapeHtml(confirmText)}</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("show"));

    const close = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    };

    const confirmBtn = popup.querySelector('[data-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        close();
        if (typeof onConfirm === "function") {
          onConfirm();
        }
      });
    }

    const cancelBtn = popup.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        close();
        if (typeof onCancel === "function") {
          onCancel();
        }
      });
    }

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      close();
      if (typeof onCancel === "function") {
        onCancel();
      }
    });
  }

  async function deleteHighlightGroup(group) {
    if (!group?.storyHighlightGroupId) return;

    const groupName = (group.name || "").toString().trim();
    showSystemConfirm({
      title: shT(
        "profile.highlights.deleteGroupConfirmTitle",
        {},
        "Delete highlight",
      ),
      message: groupName
        ? shT(
            "profile.highlights.deleteGroupConfirmNamed",
            { name: groupName },
            `Delete highlight "${groupName}"? This action cannot be undone.`,
          )
        : shT(
            "profile.highlights.deleteGroupConfirmUnnamed",
            {},
            "Delete this highlight? This action cannot be undone.",
          ),
      confirmText: shT("common.buttons.delete", {}, "Delete"),
      cancelText: shT("common.buttons.cancel", {}, "Cancel"),
      isDanger: true,
      onConfirm: async () => {
        try {
          const response = await API.Stories.deleteHighlightGroup(
            group.storyHighlightGroupId,
          );
          if (!response.ok) {
            const message = await readApiErrorMessage(
              response,
            "profile.highlights.deleteGroupFailed",
            "Failed to delete highlight",
          );
            if (window.toastError) toastError(message);
            return;
          }

          if (window.toastSuccess) {
            toastSuccess(
              shT(
                "profile.highlights.deleteGroupSuccess",
                {},
                "Highlight group deleted",
              ),
            );
          }
          loadProfileHighlightGroups({ silent: true, force: true });
        } catch (error) {
          console.error(error);
          if (window.toastError) {
            toastError(
              shT(
                "profile.highlights.deleteGroupFailed",
                {},
                "Failed to delete highlight",
              ),
            );
          }
        }
      },
    });
  }

  function openCreateHighlightGroupModal() {
    if (!isCurrentProfileOwner()) return;

    if (highlightGroups.length >= HIGHLIGHT_GROUP_MAX_LIMIT) {
      return;
    }

    const shell = createHighlightModalShell(
      shT("profile.highlights.createTitle", {}, "Create highlight"),
      "",
      {
      centerTitle: true,
      onRequestClose: (closeFn) => {
        if ((state.name || "").trim().length > 0 || state.coverObjectUrl) {
          showSystemConfirm({
            title: shT("profile.highlights.discardTitle", {}, "Discard changes?"),
            message: shT(
              "profile.highlights.discardDescription",
              {},
              "You have unsaved changes. Are you sure you want to discard them?",
            ),
            confirmText: shT("common.buttons.discard", {}, "Discard"),
            cancelText: shT("common.buttons.cancel", {}, "Cancel"),
            isDanger: true,
            inlineActions: true,
            onConfirm: closeFn,
          });
        } else {
          closeFn();
        }
      },
    });
    if (!shell.bodyEl || !shell.footerEl) return;

    const state = {
      step: 1,
      name: "",
      coverFile: null,
      coverObjectUrl: "",
      selectedStoryIds: new Set(),
      candidates: [],
      page: 1,
      hasMore: true,
      isLoadingCandidates: false,
      isSubmitting: false,
      stepTwoScrollTop: 0,
    };

    activeHighlightModal.cleanup = () => {
      if (state.coverObjectUrl) {
        URL.revokeObjectURL(state.coverObjectUrl);
      }
    };

    const loadCandidates = async ({ reset } = {}) => {
      if (state.isLoadingCandidates) return;
      if (!state.hasMore && !reset) return;

      if (reset) {
        state.page = 1;
        state.hasMore = true;
        state.candidates = [];
      }

      state.isLoadingCandidates = true;
      render();

      try {
        const response = await API.Stories.getHighlightArchiveCandidates(
          state.page,
          HIGHLIGHT_ARCHIVE_PAGE_SIZE,
          null,
        );
        if (!response.ok) {
          const message = await readApiErrorMessage(
            response,
            "profile.highlights.storiesLoadFailed",
            "Failed to load stories.",
          );
          if (window.toastError) {
            toastError(message);
          }
          return;
        }

        const payload = await response.json().catch(() => null);
        const itemsRaw = Array.isArray(payload?.items ?? payload?.Items)
          ? (payload.items ?? payload.Items)
          : [];
        const normalizedItems = itemsRaw
          .map(normalizeHighlightStory)
          .filter((story) => !!story.storyId);

        const existingIdSet = new Set(
          state.candidates.map((story) => normalizeEntityId(story.storyId)),
        );
        normalizedItems.forEach((story) => {
          const storyId = normalizeEntityId(story.storyId);
          if (existingIdSet.has(storyId)) return;
          existingIdSet.add(storyId);
          state.candidates.push(story);
        });

        state.hasMore = Boolean(
          payload?.hasNextPage ?? payload?.HasNextPage ?? false,
        );
        state.page += 1;
      } catch (error) {
        console.error(error);
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.storiesLoadFailed",
              {},
              "Failed to load stories.",
            ),
          );
        }
      } finally {
        state.isLoadingCandidates = false;
        render();
      }
    };

    const submitCreateGroup = async () => {
      if (state.isSubmitting) return;

      const normalizedName = (state.name || "").trim();
      if (!normalizedName) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.groupNameRequired",
              {},
              "Group name is required.",
            ),
          );
        }
        return;
      }
      if (normalizedName.length > HIGHLIGHT_GROUP_NAME_MAX_LENGTH) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.groupNameMax",
              { max: HIGHLIGHT_GROUP_NAME_MAX_LENGTH },
              `Group name must be at most ${HIGHLIGHT_GROUP_NAME_MAX_LENGTH} characters.`,
            ),
          );
        }
        return;
      }
      if (state.selectedStoryIds.size <= 0) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.selectAtLeastOneStory",
              {},
              "Please select at least one story.",
            ),
          );
        }
        return;
      }
      if (state.selectedStoryIds.size > HIGHLIGHT_STORY_MAX_PER_GROUP) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.maxStories",
              { max: HIGHLIGHT_STORY_MAX_PER_GROUP },
              `Maximum ${HIGHLIGHT_STORY_MAX_PER_GROUP} stories are allowed in a group.`,
            ),
          );
        }
        return;
      }

      state.isSubmitting = true;
      render();
      if (typeof window.showGlobalLoader === "function") {
        window.showGlobalLoader();
      }

      try {
        const formData = new FormData();
        formData.append("Name", normalizedName);
        if (state.coverFile) {
          formData.append("CoverImageFile", state.coverFile);
        }
        Array.from(state.selectedStoryIds).forEach((storyId) => {
          formData.append("StoryIds", storyId);
        });

        const response = await API.Stories.createHighlightGroup(formData);
        if (!response.ok) {
          const message = await readApiErrorMessage(
            response,
            "profile.highlights.createFailed",
            "Failed to create highlight",
          );
          if (window.toastError) {
            toastError(message);
          }
          return;
        }

        if (window.toastSuccess) {
          toastSuccess(
            shT(
              "profile.highlights.createSuccess",
              {},
              "Highlight group created",
            ),
          );
        }
        closeHighlightModal();
        loadProfileHighlightGroups({ silent: true, force: true });
      } catch (error) {
        console.error(error);
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.createFailed",
              {},
              "Failed to create highlight",
            ),
          );
        }
      } finally {
        if (typeof window.hideGlobalLoader === "function") {
          window.hideGlobalLoader();
        }
        state.isSubmitting = false;
        if (isHighlightModalShellActive(shell)) {
          render();
        }
      }
    };

    const renderStepOne = () => {
      const coverPreviewHtml = state.coverObjectUrl
        ? `<img src="${escapeAttr(state.coverObjectUrl)}" alt="${escapeAttr(shT("profile.highlights.coverPreviewAlt", {}, "Cover preview"))}">`
        : `<i data-lucide="image-plus"></i>`;
      const coverActionLabel = state.coverObjectUrl
        ? shT("profile.highlights.changeCoverImage", {}, "Change cover image")
        : shT("profile.highlights.uploadCoverImage", {}, "Upload cover image");

      shell.bodyEl.innerHTML = `
        <div class="profile-highlight-create-step-one">
          <div class="profile-highlight-form-group">
            <label for="highlightGroupNameInput">${escapeHtml(shT("profile.highlights.groupNameLabel", {}, "Group name"))}</label>
            <div class="profile-highlight-input-wrapper">
              <input id="highlightGroupNameInput" class="profile-highlight-input" type="text" maxlength="${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}" placeholder="${escapeAttr(shT("profile.highlights.groupNamePlaceholder", {}, "Enter group name"))}">
              <button type="button" class="profile-highlight-emoji-btn" id="highlightGroupNameEmojiBtn" aria-label="${escapeAttr(shT("profile.highlights.addEmojiAria", {}, "Add emoji"))}">
                <i data-lucide="smile"></i>
              </button>
              <div class="profile-highlight-emoji-picker-container" id="highlightGroupNameEmojiPicker"></div>
              <div class="profile-highlight-selected-counter">${escapeHtml(String((state.name || "").length))}/${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}</div>
            </div>
          </div>
          <div class="profile-highlight-cover-upload-shell">
            <span class="profile-highlight-cover-upload-title">${escapeHtml(shT("profile.highlights.coverImage", {}, "Cover image"))}</span>
            <div class="profile-highlight-cover-upload-main">
              <div class="profile-highlight-cover-circle-wrap">
                <label class="profile-highlight-cover-circle" for="highlightCoverFileInput" aria-label="${escapeAttr(shT("profile.highlights.chooseCoverImageAria", {}, "Choose cover image"))}">
                  ${coverPreviewHtml}
                </label>
                <button
                  type="button"
                  class="profile-highlight-cover-circle-remove${state.coverObjectUrl ? "" : " hidden"}"
                  data-action="remove-cover"
                  aria-label="${escapeAttr(shT("profile.highlights.removeCoverAria", {}, "Remove cover"))}"
                >
                  <i data-lucide="x"></i>
                </button>
              </div>
              <input id="highlightCoverFileInput" type="file" accept="image/*" style="display:none">
              <label class="profile-highlight-cover-upload-label" for="highlightCoverFileInput">${escapeHtml(coverActionLabel)}</label>
            </div>
          </div>
        </div>
      `;

      if (shell.backEl) {
        shell.backEl.classList.add("hidden");
        shell.backEl.onclick = null;
      }

      shell.footerEl.innerHTML = `
        <div class="profile-highlight-footer-right" style="width: 100%; display: flex; justify-content: flex-end;">
          <button type="button" class="profile-highlight-btn primary" data-action="next-step">${escapeHtml(shT("profile.highlights.next", {}, "Next"))}</button>
        </div>
      `;

      if (window.lucide) {
        window.lucide.createIcons({ root: shell.bodyEl });
      }

      const nameInput = shell.bodyEl.querySelector("#highlightGroupNameInput");
      if (nameInput) {
        nameInput.value = state.name;
        nameInput.addEventListener("input", () => {
          state.name = nameInput.value;
          const counter = shell.bodyEl.querySelector(
            ".profile-highlight-selected-counter",
          );
          if (counter) {
            counter.textContent = `${state.name.length}/${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}`;
          }
        });
        nameInput.focus();
      }

      const emojiBtn = shell.bodyEl.querySelector(
        "#highlightGroupNameEmojiBtn",
      );
      const emojiContainer = shell.bodyEl.querySelector(
        "#highlightGroupNameEmojiPicker",
      );

      if (emojiBtn && window.EmojiUtils) {
        emojiBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await window.EmojiUtils.togglePicker(emojiContainer, (emoji) => {
            if (nameInput) {
              window.EmojiUtils.insertAtCursor(nameInput, emoji.native);
            }
          });
        });

        window.EmojiUtils.setupClickOutsideHandler(
          "#highlightGroupNameEmojiPicker",
          "#highlightGroupNameEmojiBtn",
        );
      }

      const fileInput = shell.bodyEl.querySelector("#highlightCoverFileInput");
      if (fileInput) {
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0] || null;
          if (!file) return;
          const maxSizeBytes =
            (APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5) * 1024 * 1024;
          if (file.size > maxSizeBytes) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.coverImageTooLarge",
                  { size: APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5 },
                  `Cover image size exceeds ${APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5}MB.`,
                ),
              );
            }
            fileInput.value = "";
            return;
          }

          if (state.coverObjectUrl) {
            URL.revokeObjectURL(state.coverObjectUrl);
          }
          state.coverFile = file;
          state.coverObjectUrl = URL.createObjectURL(file);
          render();
        });
      }

      const removeCoverBtn = shell.bodyEl.querySelector(
        '[data-action="remove-cover"]',
      );
      if (removeCoverBtn) {
        removeCoverBtn.addEventListener("click", () => {
          if (state.coverObjectUrl) {
            URL.revokeObjectURL(state.coverObjectUrl);
          }
          state.coverFile = null;
          state.coverObjectUrl = "";
          render();
        });
      }
    };

    const renderStepTwo = () => {
      const candidatesHtml = state.candidates.length
        ? state.candidates
            .map((story) => {
              const normalizedId = normalizeEntityId(story.storyId);
              const isSelected = state.selectedStoryIds.has(normalizedId);
              const createdAtLabel = formatArchiveStoryCreatedAt(
                story.createdAt,
              );
              return `
                <div class="profile-highlight-candidate ${isSelected ? "selected" : ""}" data-story-id="${escapeAttr(story.storyId)}">
                  <div class="profile-highlight-candidate-thumb">
                    ${buildHighlightCandidateThumbHtml(story)}
                    <div class="profile-story-created-at-badge">
                      <i data-lucide="${story.contentType === 2 ? "type" : story.contentType === 1 ? "video" : "image"}"></i>
                      <span>${escapeHtml(createdAtLabel || "--/--")}</span>
                    </div>
                  </div>
                  <div class="profile-highlight-candidate-check">${isSelected ? "✓" : ""}</div>
                </div>
              `;
            })
            .join("")
        : !state.isLoadingCandidates
          ? `<div class="profile-highlight-candidate-empty"><i data-lucide="image-off"></i><div class="profile-highlight-candidate-empty-title">${escapeHtml(shT("profile.highlights.noStoriesAvailable", {}, "No stories available"))}</div><div class="profile-highlight-candidate-empty-subtitle">${escapeHtml(shT("profile.highlights.createStoryFirst", {}, "Create at least one story first to add to a highlight."))}</div></div>`
          : "";

      shell.bodyEl.innerHTML = `
        <div class="profile-highlight-candidates-toolbar">
          <div class="profile-highlight-selected-counter">${escapeHtml(shT("profile.highlights.selectedCount", { selected: state.selectedStoryIds.size, max: HIGHLIGHT_STORY_MAX_PER_GROUP }, `Selected: ${state.selectedStoryIds.size}/${HIGHLIGHT_STORY_MAX_PER_GROUP}`))}</div>
          ${state.isLoadingCandidates ? `<span class="profile-highlight-selected-counter">${escapeHtml(shT("profile.highlights.loading", {}, "loading..."))}</span>` : ""}
        </div>
        <div class="profile-highlight-candidates-scroll-area">
          <div class="profile-highlight-candidates-grid">${candidatesHtml}</div>
        </div>
      `;

      const candidatesScrollEl = shell.bodyEl.querySelector(
        ".profile-highlight-candidates-scroll-area",
      );
      if (candidatesScrollEl) {
        candidatesScrollEl.scrollTop = Math.max(0, state.stepTwoScrollTop || 0);
        const tryLoadMoreOnScroll = () => {
          if (state.isLoadingCandidates || !state.hasMore) return;
          const remaining =
            candidatesScrollEl.scrollHeight -
            candidatesScrollEl.scrollTop -
            candidatesScrollEl.clientHeight;
          if (remaining <= 160) {
            loadCandidates();
          }
        };
        candidatesScrollEl.addEventListener(
          "scroll",
          () => {
            state.stepTwoScrollTop = candidatesScrollEl.scrollTop;
            tryLoadMoreOnScroll();
          },
          { passive: true },
        );
        requestAnimationFrame(tryLoadMoreOnScroll);
      }

      if (shell.backEl) {
        shell.backEl.classList.remove("hidden");
        shell.backEl.onclick = () => {
          state.step = 1;
          render();
        };
      }

      shell.footerEl.innerHTML = `
        <div class="profile-highlight-footer-right" style="width: 100%; display: flex; justify-content: flex-end;">
          <button type="button" class="profile-highlight-btn primary" data-action="submit-create-group"${state.isSubmitting ? " disabled" : ""}>${escapeHtml(state.isSubmitting ? shT("profile.highlights.adding", {}, "Adding...") : shT("profile.highlights.add", {}, "Add"))}</button>
        </div>
      `;

      shell.bodyEl.querySelectorAll("[data-story-id]").forEach((itemEl) => {
        itemEl.addEventListener("click", () => {
          const storyId = itemEl.getAttribute("data-story-id") || "";
          const normalizedStoryId = normalizeEntityId(storyId);
          if (!normalizedStoryId) return;

          const setCandidateSelectedState = (isSelected) => {
            itemEl.classList.toggle("selected", isSelected);
            const checkEl = itemEl.querySelector(
              ".profile-highlight-candidate-check",
            );
            if (checkEl) {
              checkEl.textContent = isSelected ? "\u2713" : "";
            }
          };

          const selectedCounterEl = shell.bodyEl.querySelector(
            ".profile-highlight-candidates-toolbar .profile-highlight-selected-counter",
          );
          const updateSelectedCounterText = () => {
            if (!selectedCounterEl) return;
            selectedCounterEl.textContent = shT(
              "profile.highlights.selectedCount",
              {
                selected: state.selectedStoryIds.size,
                max: HIGHLIGHT_STORY_MAX_PER_GROUP,
              },
              `Selected: ${state.selectedStoryIds.size}/${HIGHLIGHT_STORY_MAX_PER_GROUP}`,
            );
          };

          if (state.selectedStoryIds.has(normalizedStoryId)) {
            state.selectedStoryIds.delete(normalizedStoryId);
            setCandidateSelectedState(false);
            updateSelectedCounterText();
            return;
          }

          if (state.selectedStoryIds.size >= HIGHLIGHT_STORY_MAX_PER_GROUP) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.maxStories",
                  { max: HIGHLIGHT_STORY_MAX_PER_GROUP },
                  `Maximum ${HIGHLIGHT_STORY_MAX_PER_GROUP} stories are allowed in a group.`,
                ),
              );
            }
            return;
          }

          state.selectedStoryIds.add(normalizedStoryId);
          setCandidateSelectedState(true);
          updateSelectedCounterText();
        });
      });
    };

    const bindFooterEvents = () => {
      const nextBtn = shell.footerEl.querySelector('[data-action="next-step"]');
      if (nextBtn) {
        nextBtn.addEventListener("click", async () => {
          const normalizedName = (state.name || "").trim();
          if (!normalizedName) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.groupNameRequired",
                  {},
                  "Group name is required.",
                ),
              );
            }
            return;
          }
          if (normalizedName.length > HIGHLIGHT_GROUP_NAME_MAX_LENGTH) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.groupNameMax",
                  { max: HIGHLIGHT_GROUP_NAME_MAX_LENGTH },
                  `Group name must be at most ${HIGHLIGHT_GROUP_NAME_MAX_LENGTH} characters.`,
                ),
              );
            }
            return;
          }

          state.step = 2;
          render();
          if (state.candidates.length === 0) {
            await loadCandidates({ reset: true });
          }
        });
      }

      const submitBtn = shell.footerEl.querySelector(
        '[data-action="submit-create-group"]',
      );
      if (submitBtn) {
        submitBtn.addEventListener("click", submitCreateGroup);
      }
    };

    const render = () => {
      if (state.step === 1) {
        renderStepOne();
      } else {
        renderStepTwo();
      }
      bindFooterEvents();
      if (window.lucide) {
        window.lucide.createIcons({ root: shell.overlay });
      }
    };

    render();
  }

  function openAddStoriesToHighlightGroupModal(group) {
    if (!group?.storyHighlightGroupId || !isCurrentProfileOwner()) return;

    if ((group.storyCount || 0) >= HIGHLIGHT_STORY_MAX_PER_GROUP) {
      if (window.toastError) {
        toastError(
          shT(
            "profile.highlights.groupFull",
            { max: HIGHLIGHT_STORY_MAX_PER_GROUP },
            `This group already has ${HIGHLIGHT_STORY_MAX_PER_GROUP} stories.`,
          ),
        );
      }
      return;
    }

    const shell = createHighlightModalShell(
      shT(
        "profile.highlights.addStoriesTitle",
        {},
        "Add stories to highlight",
      ),
      "",
      { centerTitle: true },
    );
    if (!shell.bodyEl || !shell.footerEl) return;

    const state = {
      selectedStoryIds: new Set(),
      candidates: [],
      page: 1,
      hasMore: true,
      isLoadingCandidates: false,
      isSubmitting: false,
      candidatesScrollTop: 0,
    };

    const loadCandidates = async ({ reset } = {}) => {
      if (state.isLoadingCandidates) return;
      if (!state.hasMore && !reset) return;

      if (reset) {
        state.page = 1;
        state.hasMore = true;
        state.candidates = [];
      }

      state.isLoadingCandidates = true;
      render();

      try {
        const response = await API.Stories.getHighlightArchiveCandidates(
          state.page,
          HIGHLIGHT_ARCHIVE_PAGE_SIZE,
          group.storyHighlightGroupId,
        );
        if (!response.ok) {
          const message = await readApiErrorMessage(
            response,
            "profile.highlights.storiesLoadFailed",
            "Failed to load stories",
          );
          if (window.toastError) {
            toastError(message);
          }
          return;
        }

        const payload = await response.json().catch(() => null);
        const itemsRaw = Array.isArray(payload?.items ?? payload?.Items)
          ? (payload.items ?? payload.Items)
          : [];
        const normalizedItems = itemsRaw
          .map(normalizeHighlightStory)
          .filter((story) => !!story.storyId);

        const existingIdSet = new Set(
          state.candidates.map((story) => normalizeEntityId(story.storyId)),
        );
        normalizedItems.forEach((story) => {
          const storyId = normalizeEntityId(story.storyId);
          if (existingIdSet.has(storyId)) return;
          existingIdSet.add(storyId);
          state.candidates.push(story);
        });

        state.hasMore = Boolean(
          payload?.hasNextPage ?? payload?.HasNextPage ?? false,
        );
        state.page += 1;
      } catch (error) {
        console.error(error);
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.storiesLoadFailed",
              {},
              "Failed to load stories.",
            ),
          );
        }
      } finally {
        state.isLoadingCandidates = false;
        render();
      }
    };

    const submitAddStories = async () => {
      if (state.isSubmitting) return;

      const selectedCount = state.selectedStoryIds.size;
      if (selectedCount <= 0) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.selectAtLeastOneStory",
              {},
              "Please select at least one story",
            ),
          );
        }
        return;
      }

      if (group.storyCount + selectedCount > HIGHLIGHT_STORY_MAX_PER_GROUP) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.maxStories",
              { max: HIGHLIGHT_STORY_MAX_PER_GROUP },
              `Maximum ${HIGHLIGHT_STORY_MAX_PER_GROUP} stories are allowed in a group`,
            ),
          );
        }
        return;
      }

      state.isSubmitting = true;
      render();

      try {
        const response = await API.Stories.addHighlightItems(
          group.storyHighlightGroupId,
          Array.from(state.selectedStoryIds),
        );
        if (!response.ok) {
          const message = await readApiErrorMessage(
            response,
            "profile.highlights.addStoriesFailed",
            "Failed to add stories",
          );
          if (window.toastError) {
            toastError(message);
          }
          return;
        }

        if (window.toastSuccess) {
          toastSuccess(
            shT(
              "profile.highlights.addStoriesSuccess",
              {},
              "Stories added to the highlight",
            ),
          );
        }
        closeHighlightModal();
        loadProfileHighlightGroups({ silent: true, force: true });
      } catch (error) {
        console.error(error);
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.addStoriesFailed",
              {},
              "Failed to add stories",
            ),
          );
        }
      } finally {
        state.isSubmitting = false;
        if (isHighlightModalShellActive(shell)) {
          render();
        }
      }
    };

    const render = () => {
      const selectedCount = state.selectedStoryIds.size;
      const totalAfterAdd = group.storyCount + selectedCount;
      const candidatesHtml = state.candidates.length
        ? state.candidates
            .map((story) => {
              const normalizedId = normalizeEntityId(story.storyId);
              const isSelected = state.selectedStoryIds.has(normalizedId);
              const createdAtLabel = formatArchiveStoryCreatedAt(
                story.createdAt,
              );
              return `
                <div class="profile-highlight-candidate ${isSelected ? "selected" : ""}" data-story-id="${escapeAttr(story.storyId)}">
                  <div class="profile-highlight-candidate-thumb">
                    ${buildHighlightCandidateThumbHtml(story)}
                    <div class="profile-story-created-at-badge">
                      <i data-lucide="${story.contentType === 2 ? "type" : story.contentType === 1 ? "video" : "image"}"></i>
                      <span>${escapeHtml(createdAtLabel || "--/--")}</span>
                    </div>
                  </div>
                  <div class="profile-highlight-candidate-check">${isSelected ? "✓" : ""}</div>
                </div>
              `;
            })
            .join("")
        : !state.isLoadingCandidates
          ? `<div class="profile-highlight-candidate-empty"><i data-lucide="image-off"></i><div class="profile-highlight-candidate-empty-title">${escapeHtml(shT("profile.highlights.noStoriesAvailable", {}, "No stories available"))}</div><div class="profile-highlight-candidate-empty-subtitle">${escapeHtml(shT("profile.highlights.createStoryFirst", {}, "Create at least one story first to add to a highlight."))}</div></div>`
          : "";

      shell.bodyEl.innerHTML = `
        <div class="profile-highlight-candidates-toolbar">
          <div class="profile-highlight-selected-counter">${escapeHtml(shT("profile.highlights.selectedSummary", { selected: selectedCount, total: totalAfterAdd, max: HIGHLIGHT_STORY_MAX_PER_GROUP }, `Selected: ${selectedCount} | total after add: ${totalAfterAdd}/${HIGHLIGHT_STORY_MAX_PER_GROUP}`))}</div>
          ${state.isLoadingCandidates ? `<span class="profile-highlight-selected-counter">${escapeHtml(shT("profile.highlights.loading", {}, "loading..."))}</span>` : ""}
        </div>
        <div class="profile-highlight-candidates-scroll-area">
          <div class="profile-highlight-candidates-grid">${candidatesHtml}</div>
        </div>
      `;

      shell.footerEl.innerHTML = `
        <div class="profile-highlight-footer-right" style="width: 100%; display: flex; justify-content: flex-end;">
          <button type="button" class="profile-highlight-btn primary" data-action="submit-add-stories"${state.isSubmitting ? " disabled" : ""}>${escapeHtml(state.isSubmitting ? shT("profile.highlights.adding", {}, "Adding...") : shT("profile.highlights.add", {}, "Add"))}</button>
        </div>
      `;

      shell.bodyEl.querySelectorAll("[data-story-id]").forEach((itemEl) => {
        itemEl.addEventListener("click", () => {
          const storyId = itemEl.getAttribute("data-story-id") || "";
          const normalizedStoryId = normalizeEntityId(storyId);
          if (!normalizedStoryId) return;

          const setCandidateSelectedState = (isSelected) => {
            itemEl.classList.toggle("selected", isSelected);
            const checkEl = itemEl.querySelector(
              ".profile-highlight-candidate-check",
            );
            if (checkEl) {
              checkEl.textContent = isSelected ? "\u2713" : "";
            }
          };

          const selectedCounterEl = shell.bodyEl.querySelector(
            ".profile-highlight-candidates-toolbar .profile-highlight-selected-counter",
          );
          const updateSelectedCounterText = () => {
            if (!selectedCounterEl) return;
            const selectedCount = state.selectedStoryIds.size;
            const totalAfterAdd = group.storyCount + selectedCount;
            selectedCounterEl.textContent = shT(
              "profile.highlights.selectedSummary",
              {
                selected: selectedCount,
                total: totalAfterAdd,
                max: HIGHLIGHT_STORY_MAX_PER_GROUP,
              },
              `Selected: ${selectedCount} | total after add: ${totalAfterAdd}/${HIGHLIGHT_STORY_MAX_PER_GROUP}`,
            );
          };

          if (state.selectedStoryIds.has(normalizedStoryId)) {
            state.selectedStoryIds.delete(normalizedStoryId);
            setCandidateSelectedState(false);
            updateSelectedCounterText();
            return;
          }

          if (
            group.storyCount + state.selectedStoryIds.size >=
            HIGHLIGHT_STORY_MAX_PER_GROUP
          ) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.maxStories",
                  { max: HIGHLIGHT_STORY_MAX_PER_GROUP },
                  `Maximum ${HIGHLIGHT_STORY_MAX_PER_GROUP} stories are allowed in a group.`,
                ),
              );
            }
            return;
          }

          state.selectedStoryIds.add(normalizedStoryId);
          setCandidateSelectedState(true);
          updateSelectedCounterText();
        });
      });

      const candidatesScrollEl = shell.bodyEl.querySelector(
        ".profile-highlight-candidates-scroll-area",
      );
      if (candidatesScrollEl) {
        candidatesScrollEl.scrollTop = Math.max(
          0,
          state.candidatesScrollTop || 0,
        );
        const tryLoadMoreOnScroll = () => {
          if (state.isLoadingCandidates || !state.hasMore) return;
          const remaining =
            candidatesScrollEl.scrollHeight -
            candidatesScrollEl.scrollTop -
            candidatesScrollEl.clientHeight;
          if (remaining <= 160) {
            loadCandidates();
          }
        };
        candidatesScrollEl.addEventListener(
          "scroll",
          () => {
            state.candidatesScrollTop = candidatesScrollEl.scrollTop;
            tryLoadMoreOnScroll();
          },
          { passive: true },
        );
        requestAnimationFrame(tryLoadMoreOnScroll);
      }

      const submitBtn = shell.footerEl.querySelector(
        '[data-action="submit-add-stories"]',
      );
      if (submitBtn) {
        submitBtn.addEventListener("click", submitAddStories);
      }

      if (window.lucide) {
        window.lucide.createIcons({ root: shell.overlay });
      }
    };

    render();
    loadCandidates({ reset: true });
  }

  function openEditHighlightGroupModal(group) {
    if (!group?.storyHighlightGroupId || !isCurrentProfileOwner()) return;

    const shell = createHighlightModalShell(
      shT("profile.highlights.editTitle", {}, "Edit highlight"),
      "",
      {
      centerTitle: true,
      onRequestClose: (closeFn) => {
        const normalizedName = (state.name || "").trim();
        const initialName = (group.name || "").trim();
        const hasChanges =
          normalizedName !== initialName ||
          !!state.coverObjectUrl ||
          state.removeCover;

        if (hasChanges) {
          showSystemConfirm({
            title: shT("profile.highlights.discardTitle", {}, "Discard changes?"),
            message: shT(
              "profile.highlights.discardDescription",
              {},
              "You have unsaved changes. Are you sure you want to discard them?",
            ),
            confirmText: shT("common.buttons.discard", {}, "Discard"),
            cancelText: shT("common.buttons.cancel", {}, "Cancel"),
            isDanger: true,
            inlineActions: true,
            onConfirm: closeFn,
          });
        } else {
          closeFn();
        }
      },
    });
    if (!shell.bodyEl || !shell.footerEl) return;

    const state = {
      name: group.name || "",
      coverFile: null,
      coverObjectUrl: "",
      removeCover: false,
      isSubmitting: false,
    };

    activeHighlightModal.cleanup = () => {
      if (state.coverObjectUrl) {
        URL.revokeObjectURL(state.coverObjectUrl);
      }
    };

    const submitUpdate = async () => {
      if (state.isSubmitting) return;

      const normalizedName = (state.name || "").trim();
      if (!normalizedName) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.groupNameRequired",
              {},
              "Group name is required.",
            ),
          );
        }
        return;
      }
      if (normalizedName.length > HIGHLIGHT_GROUP_NAME_MAX_LENGTH) {
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.groupNameMax",
              { max: HIGHLIGHT_GROUP_NAME_MAX_LENGTH },
              `Group name must be at most ${HIGHLIGHT_GROUP_NAME_MAX_LENGTH} characters.`,
            ),
          );
        }
        return;
      }

      state.isSubmitting = true;
      render();

      try {
        const formData = new FormData();
        formData.append("Name", normalizedName);
        if (state.coverFile) {
          formData.append("CoverImageFile", state.coverFile);
        } else if (state.removeCover) {
          formData.append("RemoveCoverImage", "true");
        }

        const response = await API.Stories.updateHighlightGroup(
          group.storyHighlightGroupId,
          formData,
        );
        if (!response.ok) {
          const message = await readApiErrorMessage(
            response,
            "profile.highlights.updateFailed",
            "Failed to update highlight",
          );
          if (window.toastError) {
            toastError(message);
          }
          return;
        }

        if (window.toastSuccess) {
          toastSuccess(
            shT(
              "profile.highlights.updateSuccess",
              {},
              "Highlight group updated",
            ),
          );
        }
        closeHighlightModal();
        loadProfileHighlightGroups({ silent: true, force: true });
      } catch (error) {
        console.error(error);
        if (window.toastError) {
          toastError(
            shT(
              "profile.highlights.updateFailed",
              {},
              "Failed to update highlight",
            ),
          );
        }
      } finally {
        state.isSubmitting = false;
        if (isHighlightModalShellActive(shell)) {
          render();
        }
      }
    };

    const render = () => {
      if (shell.backEl) {
        shell.backEl.classList.add("hidden");
      }

      const coverPreviewHtml = state.coverObjectUrl
        ? `<img src="${escapeAttr(state.coverObjectUrl)}" alt="${escapeAttr(shT("profile.highlights.coverPreviewAlt", {}, "Cover preview"))}">`
        : !state.removeCover && group.coverImageUrl
          ? `<img src="${escapeAttr(group.coverImageUrl)}" alt="${escapeAttr(shT("profile.highlights.coverImageAlt", {}, "Cover image"))}">`
          : `<i data-lucide="image-plus"></i>`;

      const showRemoveBtn =
        state.coverObjectUrl || (!state.removeCover && group.coverImageUrl);
      const coverActionLabel = showRemoveBtn
        ? shT("profile.highlights.changeCoverImage", {}, "Change cover image")
        : shT("profile.highlights.uploadCoverImage", {}, "Upload cover image");

      shell.bodyEl.innerHTML = `
        <div class="profile-highlight-create-step-one">
          <div class="profile-highlight-form-group">
            <label for="editHighlightGroupNameInput">${escapeHtml(shT("profile.highlights.groupNameLabel", {}, "Group name"))}</label>
            <div class="profile-highlight-input-wrapper">
              <input id="editHighlightGroupNameInput" class="profile-highlight-input" type="text" maxlength="${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}" placeholder="${escapeAttr(shT("profile.highlights.groupNamePlaceholder", {}, "Enter group name"))}">
              <button type="button" class="profile-highlight-emoji-btn" id="editHighlightGroupNameEmojiBtn" aria-label="${escapeAttr(shT("profile.highlights.addEmojiAria", {}, "Add emoji"))}">
                <i data-lucide="smile"></i>
              </button>
              <div class="profile-highlight-emoji-picker-container" id="editHighlightGroupNameEmojiPicker"></div>
              <div class="profile-highlight-selected-counter">${escapeHtml(String((state.name || "").length))}/${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}</div>
            </div>
          </div>
          <div class="profile-highlight-cover-upload-shell">
            <span class="profile-highlight-cover-upload-title">${escapeHtml(shT("profile.highlights.coverImage", {}, "Cover image"))}</span>
            <div class="profile-highlight-cover-upload-main">
              <div class="profile-highlight-cover-circle-wrap">
                <label class="profile-highlight-cover-circle" for="editHighlightCoverFileInput" aria-label="${escapeAttr(shT("profile.highlights.chooseCoverImageAria", {}, "Choose cover image"))}">
                  ${coverPreviewHtml}
                </label>
                <button
                  type="button"
                  class="profile-highlight-cover-circle-remove${showRemoveBtn ? "" : " hidden"}"
                  data-action="remove-cover"
                  aria-label="${escapeAttr(shT("profile.highlights.removeCoverAria", {}, "Remove cover"))}"
                >
                  <i data-lucide="x"></i>
                </button>
              </div>
              <input id="editHighlightCoverFileInput" type="file" accept="image/*" style="display:none">
              <label class="profile-highlight-cover-upload-label" for="editHighlightCoverFileInput">${escapeHtml(coverActionLabel)}</label>
            </div>
          </div>
        </div>
      `;

      shell.footerEl.innerHTML = `
        <div class="profile-highlight-footer-right" style="width: 100%; display: flex; justify-content: flex-end;">
          <button type="button" class="profile-highlight-btn primary" data-action="submit-update-group"${state.isSubmitting ? " disabled" : ""}>${escapeHtml(state.isSubmitting ? shT("profile.highlights.saving", {}, "Saving...") : shT("profile.highlights.save", {}, "Save"))}</button>
        </div>
      `;

      if (window.lucide) {
        window.lucide.createIcons({ root: shell.overlay });
      }

      const nameInput = shell.bodyEl.querySelector(
        "#editHighlightGroupNameInput",
      );
      if (nameInput) {
        nameInput.value = state.name;
        nameInput.addEventListener("input", () => {
          state.name = nameInput.value;
          const counter = shell.bodyEl.querySelector(
            ".profile-highlight-selected-counter",
          );
          if (counter) {
            counter.textContent = `${state.name.length}/${HIGHLIGHT_GROUP_NAME_MAX_LENGTH}`;
          }
        });
      }

      const emojiBtn = shell.bodyEl.querySelector(
        "#editHighlightGroupNameEmojiBtn",
      );
      const emojiContainer = shell.bodyEl.querySelector(
        "#editHighlightGroupNameEmojiPicker",
      );

      if (emojiBtn && window.EmojiUtils) {
        emojiBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await window.EmojiUtils.togglePicker(emojiContainer, (emoji) => {
            if (nameInput) {
              window.EmojiUtils.insertAtCursor(nameInput, emoji.native);
            }
          });
        });

        window.EmojiUtils.setupClickOutsideHandler(
          "#editHighlightGroupNameEmojiPicker",
          "#editHighlightGroupNameEmojiBtn",
        );
      }

      const fileInput = shell.bodyEl.querySelector(
        "#editHighlightCoverFileInput",
      );
      if (fileInput) {
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0] || null;
          if (!file) return;

          const maxSizeBytes =
            (APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5) * 1024 * 1024;
          if (file.size > maxSizeBytes) {
            if (window.toastError) {
              toastError(
                shT(
                  "profile.highlights.coverImageTooLarge",
                  { size: APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5 },
                  `Cover image size exceeds ${APP_CONFIG.MAX_UPLOAD_SIZE_MB || 5}MB.`,
                ),
              );
            }
            fileInput.value = "";
            return;
          }

          if (state.coverObjectUrl) {
            URL.revokeObjectURL(state.coverObjectUrl);
          }
          state.coverFile = file;
          state.coverObjectUrl = URL.createObjectURL(file);
          state.removeCover = false;
          render();
        });
      }

      const removeCoverBtn = shell.bodyEl.querySelector(
        '[data-action="remove-cover"]',
      );
      if (removeCoverBtn) {
        removeCoverBtn.addEventListener("click", () => {
          if (state.coverObjectUrl) {
            URL.revokeObjectURL(state.coverObjectUrl);
          }
          state.coverFile = null;
          state.coverObjectUrl = "";
          state.removeCover = true;
          render();
        });
      }

      const submitBtn = shell.footerEl.querySelector(
        '[data-action="submit-update-group"]',
      );
      if (submitBtn) {
        submitBtn.addEventListener("click", submitUpdate);
      }
    };

    render();
  }

  function reset() {
    highlightGroups = [];
    isHighlightGroupsLoading = false;
    highlightGroupsRequestVersion += 1;
    cleanupHighlightTrackLayoutWatcher();
    closeHighlightMenu();
    closeHighlightModal();
    renderProfileHighlightsLoading();
  }

  global.ProfileStoryHighlights = {
    configure,
    setContext,
    loadGroups: loadProfileHighlightGroups,
    render: renderProfileHighlightsSection,
    renderLoading: renderProfileHighlightsLoading,
    closeMenu: closeHighlightMenu,
    closeModal: closeHighlightModal,
    reset,
  };
})(window);
