(function (global) {
  const STORY_URL_PARAM = "storyId";
  const STORY_HASH_ROUTE_PREFIX = "/stories/";
  const STORY_HASH_ROUTE_LEGACY_PREFIX = "/story/";
  const STORY_HIGHLIGHT_HASH_ROUTE_PREFIX = "/story/highlight/";
  const STORY_HIGHLIGHT_PROFILE_ROUTE_SEGMENT = "/stories/highlight/";
  const DEFAULT_STORY_DURATION_MS =
    global.APP_CONFIG?.STORY_DEFAULT_DURATION_MS || 5000;
  const PROGRESS_TICK_MS = 50;
  const STORY_TO_AUTHOR_CACHE_MAX = 1000;
  const AUTHOR_RESUME_CACHE_MAX = 300;
  const STORY_OPEN_STATUS = {
    SUCCESS: "success",
    UNAVAILABLE: "unavailable",
    ERROR: "error",
  };
  const STORY_VIEW_MODE = {
    ACTIVE: "active",
    ARCHIVE: "archive",
    HIGHLIGHT: "highlight",
  };
  const ARCHIVE_PREFETCH_THRESHOLD = 2;
  const STORY_PRIVACY_OPTIONS = [
    { value: 0, label: "Public", icon: "globe" },
    { value: 1, label: "Followers Only", icon: "users" },
    { value: 2, label: "Private", icon: "lock" },
  ];
  const STORY_TEXT_VIEWER_FALLBACK = {
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

  const viewerState = {
    isOpen: false,
    storyMode: STORY_VIEW_MODE.ACTIVE,
    highlightTargetAccountId: "",
    highlightGroupId: "",
    highlightGroupName: "",
    highlightOnRemoveStory: null,
    author: null,
    stories: [],
    currentIndex: 0,
    timerId: null,
    progressStartedAt: 0,
    progressDurationMs: DEFAULT_STORY_DURATION_MS,
    progressPausedElapsedMs: 0,
    isProgressPaused: false,
    requestId: 0,
    markedStoryIds: new Set(),
    storyToAuthorCache: new Map(),
    authorResumeMap: new Map(), // normalized authorId -> normalized storyId
    baseUrl: null,
    shouldSyncUrl: true,
    modal: null,
    dom: {},
    isViewersListOpen: false,
    viewersPage: 1,
    viewersHasMore: true,
    viewersIsLoading: false,
    viewersTotalCount: 0,
    viewersTargetStoryId: null,
    archivePage: 0,
    archivePageSize:
      global.APP_CONFIG?.PROFILE_ARCHIVED_STORIES_PAGE_SIZE || 12,
    archiveHasMore: false,
    archiveIsLoadingMore: false,
    archiveLoadPromise: null,
    archiveLoadMoreFn: null,
    // Story list (queue) mode
    authorQueue: [],
    authorQueueIndex: -1,
    queueHasMore: false,
    viewedAuthors: new Map(), // authorId → "seen" | "partial"
  };

  function stEscapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function stEscapeAttr(value) {
    return stEscapeHtml(value).replace(/`/g, "&#096;");
  }

  function stNormalizeId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function stNormalizeStoryMode(mode) {
    const normalized = (mode || "").toString().trim().toLowerCase();
    if (normalized === STORY_VIEW_MODE.ARCHIVE) {
      return STORY_VIEW_MODE.ARCHIVE;
    }
    if (normalized === STORY_VIEW_MODE.HIGHLIGHT) {
      return STORY_VIEW_MODE.HIGHLIGHT;
    }
    return STORY_VIEW_MODE.ACTIVE;
  }

  function stIsArchiveMode() {
    return viewerState.storyMode === STORY_VIEW_MODE.ARCHIVE;
  }

  function stIsHighlightMode() {
    return viewerState.storyMode === STORY_VIEW_MODE.HIGHLIGHT;
  }

  function stIsArchiveLikeMode() {
    return stIsArchiveMode() || stIsHighlightMode();
  }

  function stCanViewHighlightByPrivacy(
    ownerAccountId,
    privacyValue,
    isFollowedByCurrentUser,
  ) {
    const normalizedOwnerId = stNormalizeId(ownerAccountId);
    const currentAccountId = stCurrentAccountId();
    const isOwner =
      !!normalizedOwnerId &&
      !!currentAccountId &&
      normalizedOwnerId === currentAccountId;
    if (isOwner) {
      return true;
    }

    const privacy = Number.parseInt(String(privacyValue ?? 0), 10);
    if (privacy === 2) {
      return false;
    }
    if (privacy === 1) {
      return isFollowedByCurrentUser === true;
    }
    return true;
  }

  function stHandleHighlightPrivacyRealtime(payload = {}) {
    if (!viewerState.isOpen || !stIsHighlightMode()) {
      return false;
    }

    const ownerAccountId = (
      payload.accountId ??
      payload.AccountId ??
      payload.targetAccountId ??
      payload.TargetAccountId ??
      ""
    )
      .toString()
      .trim();
    const normalizedOwnerId = stNormalizeId(ownerAccountId);
    if (!normalizedOwnerId) {
      return false;
    }

    const currentHighlightOwnerId = stNormalizeId(
      viewerState.highlightTargetAccountId,
    );
    if (
      !currentHighlightOwnerId ||
      currentHighlightOwnerId !== normalizedOwnerId
    ) {
      return false;
    }

    const settings = payload.settings ?? payload.Settings ?? payload;
    const privacyValue =
      settings?.storyHighlightPrivacy ?? settings?.StoryHighlightPrivacy;
    const isFollowedByCurrentUser = Boolean(
      payload.isFollowedByCurrentUser ?? payload.IsFollowedByCurrentUser,
    );

    const canView = stCanViewHighlightByPrivacy(
      normalizedOwnerId,
      privacyValue,
      isFollowedByCurrentUser,
    );
    if (canView) {
      return false;
    }

    stCloseViewer();
    if (typeof global.toastInfo === "function") {
      global.toastInfo("You no longer have permission to view this highlight.");
    }
    return true;
  }

  function stNormalizeRingState(nextState) {
    const normalized = (nextState ?? "").toString().trim().toLowerCase();
    if (nextState === 2 || normalized === "2" || normalized === "unseen") {
      return "unseen";
    }
    if (nextState === 1 || normalized === "1" || normalized === "seen") {
      return "seen";
    }
    return "none";
  }

  function stGetViewedAuthorState(authorId) {
    const normalizedAuthorId = stNormalizeId(authorId);
    if (!normalizedAuthorId) return "";
    return (
      viewerState.viewedAuthors.get(normalizedAuthorId) ||
      viewerState.viewedAuthors.get((authorId || "").toString().trim()) ||
      ""
    );
  }

  function stSetViewedAuthorState(authorId, state) {
    const normalizedAuthorId = stNormalizeId(authorId);
    if (!normalizedAuthorId) return;
    viewerState.viewedAuthors.set(normalizedAuthorId, state);
  }

  function stCurrentAccountId() {
    return stNormalizeId(localStorage.getItem("accountId"));
  }

  function stSetBoundedMapValue(map, key, value, maxSize) {
    if (!key) return;
    if (map.has(key)) {
      map.delete(key);
    }
    map.set(key, value);

    while (map.size > maxSize) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }

  function stCacheStoryAuthor(storyId, authorId) {
    const normalizedStoryId = stNormalizeId(storyId);
    const normalizedAuthorId = (authorId || "").toString().trim();
    if (!normalizedStoryId || !normalizedAuthorId) return;

    stSetBoundedMapValue(
      viewerState.storyToAuthorCache,
      normalizedStoryId,
      normalizedAuthorId,
      STORY_TO_AUTHOR_CACHE_MAX,
    );
  }

  function stRememberCurrentStoryPosition(authorId, storyId) {
    const normalizedAuthorId = stNormalizeId(authorId);
    const normalizedStoryId = stNormalizeId(storyId);
    if (!normalizedAuthorId || !normalizedStoryId) return;

    stSetBoundedMapValue(
      viewerState.authorResumeMap,
      normalizedAuthorId,
      normalizedStoryId,
      AUTHOR_RESUME_CACHE_MAX,
    );
  }

  function stGetAuthorResumeStoryId(authorId) {
    const normalizedAuthorId = stNormalizeId(authorId);
    if (!normalizedAuthorId) return "";
    return viewerState.authorResumeMap.get(normalizedAuthorId) || "";
  }

  function stPruneAuthorResumeMap(queue) {
    if (!Array.isArray(queue) || queue.length === 0) {
      viewerState.authorResumeMap.clear();
      return;
    }

    const allowedAuthorIds = new Set(
      queue.map((author) => stNormalizeId(author?.accountId)).filter(Boolean),
    );
    Array.from(viewerState.authorResumeMap.keys()).forEach((authorId) => {
      if (!allowedAuthorIds.has(authorId)) {
        viewerState.authorResumeMap.delete(authorId);
      }
    });
  }

  function stParseInt(value, fallbackValue) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  function stClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function stIsPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function stNormalizeStyleMap(rawMap, fallbackMap) {
    const source =
      stIsPlainObject(rawMap) && Object.keys(rawMap).length > 0
        ? rawMap
        : fallbackMap;
    const normalized = {};

    Object.entries(source).forEach(([rawKey, rawOption]) => {
      const key = stNormalizeId(rawKey);
      if (!key) return;

      const option = stIsPlainObject(rawOption) ? rawOption : {};
      const fallbackOption = stIsPlainObject(fallbackMap[key])
        ? fallbackMap[key]
        : {};
      const css =
        (typeof option.css === "string" && option.css.trim()) ||
        (typeof fallbackOption.css === "string" && fallbackOption.css.trim()) ||
        "";

      if (!css) return;
      normalized[key] = { ...option, css };
    });

    return Object.keys(normalized).length > 0 ? normalized : { ...fallbackMap };
  }

  function stResolveStyleKey(collection, rawKey, fallbackKey) {
    const normalizedRawKey = stNormalizeId(rawKey);
    if (
      normalizedRawKey &&
      Object.prototype.hasOwnProperty.call(collection, normalizedRawKey)
    ) {
      return normalizedRawKey;
    }

    const normalizedFallbackKey = stNormalizeId(fallbackKey);
    if (
      normalizedFallbackKey &&
      Object.prototype.hasOwnProperty.call(collection, normalizedFallbackKey)
    ) {
      return normalizedFallbackKey;
    }

    const firstKey = Object.keys(collection)[0];
    return typeof firstKey === "string" ? firstKey : "";
  }

  function stReadArray(payload, camelKey, pascalKey) {
    const value = payload?.[camelKey] ?? payload?.[pascalKey];
    return Array.isArray(value) ? value : [];
  }

  function stReadString(payload, camelKey, pascalKey, fallbackValue = "") {
    const value = payload?.[camelKey] ?? payload?.[pascalKey];
    return value == null ? fallbackValue : String(value);
  }

  function stGetReactionEmoji(reactType) {
    const type = Number(reactType);
    switch (type) {
      case 0:
        return "👍";
      case 1:
        return "❤️";
      case 2:
        return "😆";
      case 3:
        return "😮";
      case 4:
        return "😢";
      case 5:
        return "😡";
      default:
        return "";
    }
  }

  function stGetStoryPrivacyLabel(privacy) {
    const parsedPrivacy = Number(privacy);
    const option = STORY_PRIVACY_OPTIONS.find(
      (item) => item.value === parsedPrivacy,
    );
    return option?.label || "Public";
  }

  function stResolveStoryContentType(story) {
    const raw =
      story.contentType ?? story.ContentType ?? story.type ?? story.Type ?? 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function stResolveStoryItem(raw) {
    return {
      storyId: raw.storyId ?? raw.StoryId ?? "",
      contentType: stResolveStoryContentType(raw),
      mediaUrl: raw.mediaUrl ?? raw.MediaUrl ?? "",
      textContent: raw.textContent ?? raw.TextContent ?? "",
      backgroundColorKey:
        raw.backgroundColorKey ?? raw.BackgroundColorKey ?? "",
      textColorKey: raw.textColorKey ?? raw.TextColorKey ?? "",
      fontTextKey: raw.fontTextKey ?? raw.FontTextKey ?? "",
      fontSizeKey: raw.fontSizeKey ?? raw.FontSizeKey ?? "",
      privacy: raw.privacy ?? raw.Privacy ?? 0,
      createdAt: raw.createdAt ?? raw.CreatedAt ?? null,
      expiresAt: raw.expiresAt ?? raw.ExpiresAt ?? null,
      isViewedByCurrentUser:
        raw.isViewedByCurrentUser ?? raw.IsViewedByCurrentUser ?? false,
      currentUserReactType:
        raw.currentUserReactType ?? raw.CurrentUserReactType ?? null,
      viewSummary: raw.viewSummary ?? raw.ViewSummary ?? null,
    };
  }

  function stResolveTextStyle(story) {
    const config = stIsPlainObject(global.STORY_TEXT_EDITOR_CONFIG)
      ? global.STORY_TEXT_EDITOR_CONFIG
      : {};
    const options = stIsPlainObject(config.options) ? config.options : {};
    const defaults = stIsPlainObject(config.defaults) ? config.defaults : {};
    const fontSize = stIsPlainObject(config.fontSize) ? config.fontSize : {};

    const backgrounds = stNormalizeStyleMap(
      options.backgrounds,
      STORY_TEXT_VIEWER_FALLBACK.options.backgrounds,
    );
    const textColors = stNormalizeStyleMap(
      options.textColors,
      STORY_TEXT_VIEWER_FALLBACK.options.textColors,
    );
    const fonts = stNormalizeStyleMap(
      options.fonts,
      STORY_TEXT_VIEWER_FALLBACK.options.fonts,
    );

    const defaultBackgroundKey = stResolveStyleKey(
      backgrounds,
      defaults.backgroundColorKey,
      STORY_TEXT_VIEWER_FALLBACK.defaults.backgroundColorKey,
    );
    const defaultTextColorKey = stResolveStyleKey(
      textColors,
      defaults.textColorKey,
      STORY_TEXT_VIEWER_FALLBACK.defaults.textColorKey,
    );
    const defaultFontKey = stResolveStyleKey(
      fonts,
      defaults.fontTextKey,
      STORY_TEXT_VIEWER_FALLBACK.defaults.fontTextKey,
    );

    const backgroundKey = stResolveStyleKey(
      backgrounds,
      story.backgroundColorKey,
      defaultBackgroundKey,
    );
    const textColorKey = stResolveStyleKey(
      textColors,
      story.textColorKey,
      defaultTextColorKey,
    );
    const fontKey = stResolveStyleKey(fonts, story.fontTextKey, defaultFontKey);

    const minSize = Math.max(
      1,
      stParseInt(fontSize.min, STORY_TEXT_VIEWER_FALLBACK.fontSize.min),
    );
    const maxSize = Math.max(
      minSize,
      stParseInt(fontSize.max, STORY_TEXT_VIEWER_FALLBACK.fontSize.max),
    );
    const defaultSize = stClamp(
      stParseInt(
        defaults.fontSizePx,
        stParseInt(
          fontSize.default,
          STORY_TEXT_VIEWER_FALLBACK.fontSize.default,
        ),
      ),
      minSize,
      maxSize,
    );
    const finalSize = stClamp(
      stParseInt(story.fontSizeKey, defaultSize),
      minSize,
      maxSize,
    );

    return {
      background:
        backgrounds[backgroundKey]?.css ||
        backgrounds[defaultBackgroundKey]?.css ||
        STORY_TEXT_VIEWER_FALLBACK.options.backgrounds.accent.css,
      color:
        textColors[textColorKey]?.css ||
        textColors[defaultTextColorKey]?.css ||
        STORY_TEXT_VIEWER_FALLBACK.options.textColors.light.css,
      fontFamily:
        fonts[fontKey]?.css ||
        fonts[defaultFontKey]?.css ||
        STORY_TEXT_VIEWER_FALLBACK.options.fonts.modern.css,
      fontSizePx: finalSize,
    };
  }

  function stEnsureModal() {
    if (viewerState.modal) return viewerState.modal;

    const modal = document.createElement("div");
    modal.id = "storyViewerModal";
    modal.className = "sn-story-viewer-modal sn-story-viewer-hidden";
    modal.innerHTML = `
      <div class="sn-story-viewer-backdrop" data-story-viewer-close="true"></div>
      <div class="sn-story-viewer-card" role="dialog" aria-modal="true" aria-label="Story viewer">
        <div class="sn-story-viewer-surface">
          <div class="sn-story-viewer-progress" id="storyViewerProgress"></div>
          <div class="sn-story-viewer-header">
            <div class="sn-story-viewer-author">
              <img class="sn-story-viewer-author-avatar" id="storyViewerAvatar" src="${stEscapeAttr(global.APP_CONFIG?.DEFAULT_AVATAR || "")}" alt="">
              <div class="sn-story-viewer-author-meta">
                <div class="sn-story-viewer-username" id="storyViewerUsername"></div>
                <div class="sn-story-viewer-author-meta-secondary">
                  <div class="sn-story-viewer-time" id="storyViewerTime"></div>
                  <span class="sn-story-viewer-author-meta-divider">&nbsp;•&nbsp;</span>
                  <span class="sn-story-viewer-privacy" id="storyViewerPrivacy"></span>
                </div>
              </div>
            </div>
            <div class="sn-story-viewer-header-actions">
              <button type="button" class="sn-story-viewer-more-btn" id="storyViewerMoreBtn" aria-label="More options">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="19" cy="12" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle>
                </svg>
              </button>
              <div class="sn-story-viewer-more-menu sn-story-viewer-hidden" id="storyViewerMoreMenu"></div>
            </div>
          </div>
          <div class="sn-story-viewer-body">
            <div class="sn-story-viewer-content" id="storyViewerContent"></div>
          </div>
          <div class="sn-story-viewer-self-insight sn-story-viewer-hidden" id="storyViewerSelfInsight"></div>
          <div class="sn-story-viewer-actions sn-story-viewer-hidden" id="storyViewerActions">
            <div class="sn-story-viewer-reply-frame" style="position: relative;">
              <input
                id="storyViewerReplyInput"
                class="sn-story-viewer-reply-input"
                type="text"
                maxlength="500"
                placeholder="Reply to story..."
              />
              <button type="button" id="storyViewerReplyEmojiBtn" class="sn-story-viewer-reply-emoji-btn" aria-label="Insert emoji">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-smile">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" x2="9.01" y1="9" y2="9"></line>
                  <line x1="15" x2="15.01" y1="9" y2="9"></line>
                </svg>
              </button>
              <button type="button" id="storyViewerReplySendBtn" class="sn-story-viewer-reply-send-btn" aria-label="Send reply">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
              <div id="storyViewerReplyEmojiPicker" class="emoji-picker-container sn-story-viewer-emoji-picker-container"></div>
            </div>
            <div class="sn-story-viewer-react-frame" id="storyViewerReactFrame">
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="👍" aria-label="Like">👍</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="❤️" aria-label="Love">❤️</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😆" aria-label="Haha">😆</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😮" aria-label="Wow">😮</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😢" aria-label="Sad">😢</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😡" aria-label="Angry">😡</button>
            </div>
          </div>
          <div class="sn-story-viewer-viewers-panel sn-story-viewer-panel-hidden" id="storyViewersPanel">
            <div class="sn-story-viewer-viewers-header">
              <span class="sn-story-viewer-viewers-title">Story Viewers <span class="sn-story-viewer-viewers-total" id="storyViewersTotalCount"></span></span>
              <button type="button" class="sn-story-viewer-viewers-close" id="storyViewersCloseBtn" aria-label="Close viewers list">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="sn-story-viewer-viewers-list" id="storyViewersList"></div>
            <div class="sn-story-viewer-viewers-loading sn-story-viewer-hidden" id="storyViewersLoading">Loading...</div>
          </div>
        </div>
        <button type="button" class="sn-story-viewer-nav sn-story-viewer-nav-prev" id="storyViewerPrevBtn" aria-label="Previous story">
          <svg class="sn-story-viewer-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18L9 12L15 6"></path>
          </svg>
        </button>
        <button type="button" class="sn-story-viewer-nav sn-story-viewer-nav-next" id="storyViewerNextBtn" aria-label="Next story">
          <svg class="sn-story-viewer-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18L15 12L9 6"></path>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    viewerState.modal = modal;
    viewerState.dom = {
      progress: modal.querySelector("#storyViewerProgress"),
      header: modal.querySelector(".sn-story-viewer-header"),
      avatar: modal.querySelector("#storyViewerAvatar"),
      username: modal.querySelector("#storyViewerUsername"),
      time: modal.querySelector("#storyViewerTime"),
      content: modal.querySelector("#storyViewerContent"),
      insight: modal.querySelector("#storyViewerSelfInsight"),
      actions: modal.querySelector("#storyViewerActions"),
      replyInput: modal.querySelector("#storyViewerReplyInput"),
      replyEmojiBtn: modal.querySelector("#storyViewerReplyEmojiBtn"),
      replyEmojiPicker: modal.querySelector("#storyViewerReplyEmojiPicker"),
      replySendBtn: modal.querySelector("#storyViewerReplySendBtn"),
      reactFrame: modal.querySelector("#storyViewerReactFrame"),
      prevBtn: modal.querySelector("#storyViewerPrevBtn"),
      nextBtn: modal.querySelector("#storyViewerNextBtn"),
      moreBtn: modal.querySelector("#storyViewerMoreBtn"),
      moreMenu: modal.querySelector("#storyViewerMoreMenu"),
      privacy: modal.querySelector("#storyViewerPrivacy"),
      privacyDivider: modal.querySelector(
        ".sn-story-viewer-author-meta-divider",
      ),
      author: modal.querySelector(".sn-story-viewer-author"),
      viewersPanel: modal.querySelector("#storyViewersPanel"),
      viewersList: modal.querySelector("#storyViewersList"),
      viewersCloseBtn: modal.querySelector("#storyViewersCloseBtn"),
      viewersLoading: modal.querySelector("#storyViewersLoading"),
      viewersTotalCount: modal.querySelector("#storyViewersTotalCount"),
    };

    modal.addEventListener("click", (event) => {
      const closeTrigger = event.target.closest(
        "[data-story-viewer-close='true']",
      );
      if (closeTrigger) {
        stCloseViewer();
      }

      if (
        viewerState.dom.replyEmojiPicker &&
        viewerState.dom.replyEmojiPicker.classList.contains("show")
      ) {
        // Find if we clicked inside the picker or the trigger button
        const isClickInsidePicker = event
          .composedPath()
          .includes(viewerState.dom.replyEmojiPicker);
        const isClickOnTrigger = event.target.closest(
          "#storyViewerReplyEmojiBtn",
        );

        if (!isClickInsidePicker && !isClickOnTrigger && global.EmojiUtils) {
          global.EmojiUtils.closePicker(viewerState.dom.replyEmojiPicker);
        }
      }
    });

    if (viewerState.dom.author) {
      viewerState.dom.author.addEventListener("click", (event) => {
        event.stopPropagation();
        stHandleAuthorClick();
      });
    }

    if (viewerState.dom.prevBtn) {
      viewerState.dom.prevBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (
          viewerState.dom.prevBtn.classList.contains(
            "sn-story-viewer-nav-disabled",
          )
        )
          return;
        stGoPrev();
      });
    }
    if (viewerState.dom.nextBtn) {
      viewerState.dom.nextBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (
          viewerState.dom.nextBtn.classList.contains(
            "sn-story-viewer-nav-disabled",
          )
        )
          return;
        stGoNext();
      });
    }
    if (viewerState.dom.replySendBtn) {
      viewerState.dom.replySendBtn.addEventListener("click", () => {
        stHandleReplySubmit();
      });
    }
    if (viewerState.dom.replyInput) {
      viewerState.dom.replyInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        stHandleReplySubmit();
      });
    }

    if (viewerState.dom.replyEmojiBtn && viewerState.dom.replyEmojiPicker) {
      viewerState.dom.replyEmojiBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (global.EmojiUtils) {
          await global.EmojiUtils.togglePicker(
            viewerState.dom.replyEmojiPicker,
            (emoji) => {
              if (viewerState.dom.replyInput) {
                const input = viewerState.dom.replyInput;
                const emojiChar = emoji.native || emoji; // handle object
                const start = input.selectionStart || input.value.length;
                const textBefore = input.value.substring(0, start);
                const textAfter = input.value.substring(start);
                input.value = textBefore + emojiChar + textAfter;
                const newPos = start + emojiChar.length;
                input.focus();
                try {
                  input.setSelectionRange(newPos, newPos);
                } catch (e) {}
              }
            },
          );
        }
      });
    }
    if (viewerState.dom.reactFrame) {
      viewerState.dom.reactFrame.addEventListener("click", (event) => {
        const reactBtn = event.target.closest(".sn-story-viewer-react-btn");
        if (!reactBtn) return;
        const emoji = reactBtn.getAttribute("data-story-react") || "";
        stHandleQuickReact(emoji);
      });
    }
    if (viewerState.dom.content) {
      viewerState.dom.content.addEventListener("click", (event) => {
        const isContent = event.target.closest(
          ".sn-story-viewer-text-preview, .sn-story-viewer-image-preview, .sn-story-viewer-video-preview, .sn-story-viewer-preview-shell",
        );
        if (!isContent) return;

        event.preventDefault();
        event.stopPropagation();

        // Close emoji picker if open
        if (
          viewerState.dom.replyEmojiPicker &&
          viewerState.dom.replyEmojiPicker.classList.contains("show") &&
          global.EmojiUtils
        ) {
          global.EmojiUtils.closePicker(viewerState.dom.replyEmojiPicker);
        }

        stToggleStoryPause();
      });
    }

    // More button handler
    if (viewerState.dom.moreBtn) {
      viewerState.dom.moreBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stToggleMoreMenu();
      });
    }

    // Insight click to open viewers list
    if (viewerState.dom.insight) {
      viewerState.dom.insight.addEventListener("click", () => {
        stOpenViewersList();
      });
    }

    // Close viewers list
    if (viewerState.dom.viewersCloseBtn) {
      viewerState.dom.viewersCloseBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stCloseViewersList();
      });
    }

    // Viewers list scroll (infinite scroll)
    if (viewerState.dom.viewersList) {
      viewerState.dom.viewersList.addEventListener("scroll", () => {
        const { scrollTop, scrollHeight, clientHeight } =
          viewerState.dom.viewersList;
        if (scrollTop + clientHeight >= scrollHeight - 30) {
          stLoadMoreViewers();
        }
      });
    }

    // Close more menu when clicking outside
    modal.addEventListener("click", (event) => {
      if (!event.target.closest(".sn-story-viewer-header-actions")) {
        stCloseMoreMenu();
      }
    });

    return modal;
  }

  function stStopProgressTimer() {
    if (viewerState.timerId) {
      clearInterval(viewerState.timerId);
      viewerState.timerId = null;
    }
  }

  function stCurrentStory() {
    if (
      !Array.isArray(viewerState.stories) ||
      viewerState.currentIndex < 0 ||
      viewerState.currentIndex >= viewerState.stories.length
    ) {
      return null;
    }
    return viewerState.stories[viewerState.currentIndex];
  }

  function stResolveViewerHeaderName() {
    if (stIsHighlightMode()) {
      const groupName = (viewerState.highlightGroupName || "")
        .toString()
        .trim();
      if (groupName) return groupName;
    }
    return (
      viewerState.author?.username || viewerState.author?.fullName || "user"
    );
  }

  function stUpdateProgressFill(progressRate) {
    if (!viewerState.dom.progress) return;

    const bars = viewerState.dom.progress.querySelectorAll(
      ".sn-story-viewer-progress-fill",
    );
    const clamped = Math.max(0, Math.min(1, progressRate || 0));

    if (stIsArchiveMode() && !stHasQueue()) {
      bars.forEach((bar, index) => {
        bar.style.width = index === 0 ? `${clamped * 100}%` : "0%";
      });
      return;
    }

    bars.forEach((bar, index) => {
      if (index < viewerState.currentIndex) {
        bar.style.width = "100%";
      } else if (index > viewerState.currentIndex) {
        bar.style.width = "0%";
      } else {
        bar.style.width = `${clamped * 100}%`;
      }
    });
  }

  function stStartProgressTimer(durationMs) {
    stStartProgressTimerInternal(durationMs, 0);
  }

  function stStartProgressTimerInternal(durationMs, elapsedOffsetMs) {
    stStopProgressTimer();
    viewerState.progressDurationMs = Math.max(
      1,
      durationMs || DEFAULT_STORY_DURATION_MS,
    );
    const safeElapsedOffset = stClamp(
      stParseInt(elapsedOffsetMs, 0),
      0,
      Math.max(0, viewerState.progressDurationMs - 1),
    );
    viewerState.progressStartedAt = Date.now() - safeElapsedOffset;
    viewerState.progressPausedElapsedMs = 0;
    viewerState.isProgressPaused = false;

    viewerState.timerId = setInterval(() => {
      if (!viewerState.isOpen) {
        stStopProgressTimer();
        return;
      }

      const elapsed = Date.now() - viewerState.progressStartedAt;
      const progress = elapsed / viewerState.progressDurationMs;
      stUpdateProgressFill(progress);

      if (progress >= 1) {
        stGoNext();
      }
    }, PROGRESS_TICK_MS);
  }

  function stPauseProgressTimer() {
    if (viewerState.isProgressPaused) return;
    if (!viewerState.timerId) return;

    const elapsed = stClamp(
      Date.now() - viewerState.progressStartedAt,
      0,
      viewerState.progressDurationMs,
    );

    viewerState.progressPausedElapsedMs = elapsed;
    viewerState.isProgressPaused = true;
    stUpdateProgressFill(elapsed / viewerState.progressDurationMs);
    stStopProgressTimer();
  }

  function stResumeProgressTimer() {
    if (!viewerState.isProgressPaused) return;

    const elapsed = stClamp(
      viewerState.progressPausedElapsedMs,
      0,
      Math.max(0, viewerState.progressDurationMs - 1),
    );
    stStartProgressTimerInternal(viewerState.progressDurationMs, elapsed);
  }

  function stToggleStoryPause(shouldPause) {
    const story = stCurrentStory();
    if (!story) return;

    const isPaused = !!viewerState.isProgressPaused;
    const targetPause =
      typeof shouldPause === "boolean" ? shouldPause : !isPaused;

    if (targetPause) {
      if (!isPaused) {
        stPauseProgressTimer();
        stPauseAnyVideo();
      }
    } else {
      if (isPaused) {
        stResumeProgressTimer();
        stResumeAnyVideo();
      }
    }
  }

  function stResumeAnyVideo() {
    if (!viewerState.dom.content) return;
    const videos = viewerState.dom.content.querySelectorAll("video");
    videos.forEach((v) => {
      try {
        v.play().catch(() => {});
      } catch (_) {}
    });
  }

  function stRenderProgressBars(totalStories) {
    if (!viewerState.dom.progress) return;
    const barCount =
      stIsArchiveMode() && !stHasQueue() ? 1 : Math.max(1, totalStories);
    const bars = [];
    for (let index = 0; index < barCount; index += 1) {
      bars.push(
        '<div class="sn-story-viewer-progress-track"><div class="sn-story-viewer-progress-fill"></div></div>',
      );
    }
    viewerState.dom.progress.innerHTML = bars.join("");
    stUpdateProgressFill(0);
  }

  function stRenderNavButtons() {
    const { prevBtn, nextBtn } = viewerState.dom;
    if (!prevBtn || !nextBtn) return;

    const totalStories = Array.isArray(viewerState.stories)
      ? viewerState.stories.length
      : 0;
    const isQueue = stHasQueue();
    const archiveCanLoadMore =
      !isQueue && stIsArchiveMode() && viewerState.archiveHasMore;

    if (isQueue) {
      // In Queue Mode: Always show. Disable only if at absolute start/end.
      prevBtn.classList.remove("sn-story-viewer-hidden");
      nextBtn.classList.remove("sn-story-viewer-hidden");

      const isAbsoluteFirst =
        viewerState.authorQueueIndex <= 0 && viewerState.currentIndex <= 0;
      const isAbsoluteLast =
        viewerState.authorQueueIndex >= viewerState.authorQueue.length - 1 &&
        viewerState.currentIndex >= totalStories - 1 &&
        !viewerState.queueHasMore;

      prevBtn.classList.toggle("sn-story-viewer-nav-disabled", isAbsoluteFirst);
      nextBtn.classList.toggle("sn-story-viewer-nav-disabled", isAbsoluteLast);
    } else {
      // Single User Mode: Original logic
      if (totalStories <= 1) {
        prevBtn.classList.add("sn-story-viewer-hidden");
        nextBtn.classList.toggle("sn-story-viewer-hidden", !archiveCanLoadMore);
      } else {
        prevBtn.classList.toggle(
          "sn-story-viewer-hidden",
          viewerState.currentIndex <= 0,
        );
        nextBtn.classList.toggle(
          "sn-story-viewer-hidden",
          viewerState.currentIndex >= totalStories - 1 && !archiveCanLoadMore,
        );
      }
      prevBtn.classList.remove("sn-story-viewer-nav-disabled");
      nextBtn.classList.remove("sn-story-viewer-nav-disabled");
    }
  }

  function stIsOwnStory() {
    return (
      stNormalizeId(viewerState.author?.accountId) === stCurrentAccountId()
    );
  }

  function stRenderViewerActions() {
    if (!viewerState.dom.actions) return;

    viewerState.dom.actions.classList.remove(
      "sn-story-viewer-highlight-footer-empty",
    );

    if (stIsHighlightMode()) {
      viewerState.dom.actions.classList.remove("sn-story-viewer-hidden");
      viewerState.dom.actions.classList.add(
        "sn-story-viewer-highlight-footer-empty",
      );
      if (viewerState.dom.replyInput) {
        viewerState.dom.replyInput.value = "";
      }
      if (
        viewerState.dom.replyEmojiPicker &&
        viewerState.dom.replyEmojiPicker.classList.contains("show") &&
        global.EmojiUtils
      ) {
        global.EmojiUtils.closePicker(viewerState.dom.replyEmojiPicker);
      }
      return;
    }

    if (stIsOwnStory()) {
      viewerState.dom.actions.classList.add("sn-story-viewer-hidden");
      return;
    }

    viewerState.dom.actions.classList.remove("sn-story-viewer-hidden");
  }

  function stRenderSelfInsight(story) {
    if (!viewerState.dom.insight) return;

    if (stIsHighlightMode()) {
      viewerState.dom.insight.classList.add("sn-story-viewer-hidden");
      viewerState.dom.insight.innerHTML = "";
      if (viewerState.isViewersListOpen) {
        stCloseViewersList();
      }
      return;
    }

    const isOwnStory = stIsOwnStory();
    const summary = story?.viewSummary;
    if (!isOwnStory || !summary) {
      viewerState.dom.insight.classList.add("sn-story-viewer-hidden");
      viewerState.dom.insight.innerHTML = "";
      return;
    }

    const totalViews =
      Number(summary.totalViews ?? summary.TotalViews ?? 0) || 0;
    const topViewers = Array.isArray(summary.topViewers ?? summary.TopViewers)
      ? (summary.topViewers ?? summary.TopViewers)
      : [];

    let topViewersHtml = topViewers
      .slice(0, 3)
      .map((viewer, index) => {
        const username = viewer.username ?? viewer.Username ?? "user";
        const avatarUrl =
          viewer.avatarUrl ??
          viewer.AvatarUrl ??
          global.APP_CONFIG.DEFAULT_AVATAR;
        const reactType = viewer.reactType ?? viewer.ReactType;
        const emoji = stGetReactionEmoji(reactType);
        const zIndex = 10 - index;

        return `
          <div class="sn-story-viewer-top-viewer" title="${stEscapeAttr(username)}" style="z-index: ${zIndex}">
            <img class="sn-story-viewer-top-viewer-image" src="${stEscapeAttr(avatarUrl)}" alt="${stEscapeAttr(username)}">
            ${emoji ? `<span class="sn-story-viewer-top-viewer-react">${emoji}</span>` : ""}
          </div>
        `;
      })
      .join("");

    const remainingCount = totalViews - topViewers.length;
    if (remainingCount > 0) {
      topViewersHtml += `
        <div class="sn-story-viewer-top-viewer sn-story-viewer-top-viewer-badge">
          +${remainingCount}
        </div>
      `;
    }

    viewerState.dom.insight.classList.remove("sn-story-viewer-hidden");
    viewerState.dom.insight.innerHTML = `
      <div class="sn-story-viewer-self-total">
        <svg class="sn-story-viewer-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="2.5"></circle>
        </svg>
        <span class="sn-story-viewer-self-count">${totalViews}</span>
      </div>
      <div class="sn-story-viewer-top-viewers">${topViewersHtml}</div>
    `;
  }

  async function stOpenViewersList() {
    const story = stCurrentStory();
    if (!story || !viewerState.dom.viewersPanel) return;

    viewerState.isViewersListOpen = true;
    viewerState.viewersTargetStoryId = story.storyId; // Lock target
    viewerState.viewersPage = 1;
    viewerState.viewersHasMore = true;
    viewerState.viewersTotalCount = story.viewSummary?.totalViews || 0;
    if (viewerState.dom.viewersTotalCount) {
      viewerState.dom.viewersTotalCount.textContent = `(${viewerState.viewersTotalCount})`;
    }
    viewerState.dom.viewersList.innerHTML = "";
    viewerState.dom.viewersPanel.classList.remove(
      "sn-story-viewer-panel-hidden",
    );

    // Pause story
    stToggleStoryPause(true);

    await stLoadMoreViewers();
  }

  function stCloseViewersList() {
    if (!viewerState.dom.viewersPanel) return;

    const targetId = viewerState.viewersTargetStoryId;
    viewerState.isViewersListOpen = false;
    viewerState.dom.viewersPanel.classList.add("sn-story-viewer-panel-hidden");

    // Sync back only to the correct story
    if (targetId) {
      const targetStory = viewerState.stories.find(
        (s) => s.storyId === targetId,
      );
      if (targetStory && targetStory.viewSummary) {
        targetStory.viewSummary.totalViews = viewerState.viewersTotalCount;
      }

      // If that story is still the current one visible, update UI element
      const current = stCurrentStory();
      if (current && current.storyId === targetId) {
        const countEl = viewerState.dom.insight?.querySelector(
          ".sn-story-viewer-self-count",
        );
        if (countEl) {
          countEl.textContent = viewerState.viewersTotalCount;
        }
      }
    }

    viewerState.viewersTargetStoryId = null;

    // Resume story
    stToggleStoryPause(false);
  }

  async function stLoadMoreViewers() {
    if (viewerState.viewersIsLoading || !viewerState.viewersHasMore) return;
    const story = stCurrentStory();
    if (!story) return;

    viewerState.viewersIsLoading = true;
    if (viewerState.dom.viewersLoading) {
      viewerState.dom.viewersLoading.classList.remove("sn-story-viewer-hidden");
    }

    try {
      const res = await global.API.Stories.getViewers(
        story.storyId,
        viewerState.viewersPage,
      );
      if (res.ok) {
        const payload = await res.json();
        const items = payload.items || [];

        // Prevent updating if story changed during async load
        if (viewerState.viewersTargetStoryId === story.storyId) {
          viewerState.viewersTotalCount = payload.totalItems || 0;
          if (viewerState.dom.viewersTotalCount) {
            viewerState.dom.viewersTotalCount.textContent = `(${viewerState.viewersTotalCount})`;
          }
        }

        stRenderViewersListItems(items);

        viewerState.viewersPage += 1;
        viewerState.viewersHasMore = items.length >= (payload.pageSize || 20);
      } else {
        viewerState.viewersHasMore = false;
      }
    } catch (err) {
      console.error("Error loading viewers:", err);
      viewerState.viewersHasMore = false;
    } finally {
      viewerState.viewersIsLoading = false;
      if (viewerState.dom.viewersLoading) {
        viewerState.dom.viewersLoading.classList.add("sn-story-viewer-hidden");
      }
    }
  }

  function stRenderViewersListItems(viewers) {
    if (!viewerState.dom.viewersList) return;

    const html = viewers
      .map((v, index) => {
        const username = v.username || v.Username || "user";
        const fullName = v.fullName || v.FullName || "";
        const avatarUrl =
          v.avatarUrl || v.AvatarUrl || global.APP_CONFIG.DEFAULT_AVATAR;
        const emoji = stGetReactionEmoji(v.reactType ?? v.ReactType);
        const accountId = v.accountId || v.AccountId || "";
        const delay = index * 0.04; // Staggered delay

        return `
        <div class="sn-story-viewer-viewers-item" style="animation-delay: ${delay}s">
          <div class="sn-story-viewer-viewers-item-left post-user" data-account-id="${stEscapeAttr(accountId)}">
            <img class="sn-story-viewer-viewers-item-avatar post-avatar" src="${stEscapeAttr(avatarUrl)}" alt="${stEscapeAttr(username)}">
            <div class="sn-story-viewer-viewers-item-info">
              <span class="sn-story-viewer-viewers-item-username post-username">${stEscapeHtml(username)}</span>
              <span class="sn-story-viewer-viewers-item-fullname post-username">${stEscapeHtml(fullName)}</span>
            </div>
          </div>
          <div class="sn-story-viewer-viewers-item-right">
            ${emoji ? `<span class="sn-story-viewer-viewers-item-react">${emoji}</span>` : ""}
          </div>
        </div>
      `;
      })
      .join("");

    viewerState.dom.viewersList.insertAdjacentHTML("beforeend", html);
  }

  async function stHandleReplySubmit() {
    if (stIsOwnStory()) return;
    const inputEl = viewerState.dom.replyInput;
    if (!inputEl) return;

    const value = (inputEl.value || "").trim();
    if (!value) return;

    const story = stCurrentStory();
    const authorId = viewerState.author?.accountId;
    if (!story || !authorId) return;

    // Disable input while sending
    inputEl.disabled = true;
    const sendBtn = viewerState.dom.replySendBtn;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await global.API.Messages.storyReply({
        receiverId: authorId,
        content: value,
        tempId: crypto.randomUUID(),
        storyId: story.storyId,
        storyMediaUrl: story.mediaUrl || null,
        storyContentType: Number(story.contentType ?? 0),
        storyTextContent: story.textContent || null,
        storyBackgroundColorKey: story.backgroundColorKey || null,
        storyTextColorKey: story.textColorKey || null,
        storyFontTextKey: story.fontTextKey || null,
        storyFontSizeKey:
          story.fontSizeKey ||
          (story.fontSizePx ? String(story.fontSizePx) : null),
      });

      if (res.ok) {
        inputEl.value = "";
        try {
          const msg = await res.json();
          if (
            global.ChatSidebar &&
            typeof global.ChatSidebar.incrementUnread === "function"
          ) {
            const sidebarConversationId = (
              msg?.conversationId ||
              msg?.ConversationId ||
              ""
            )
              .toString()
              .toLowerCase();
            if (sidebarConversationId) {
              global.ChatSidebar.incrementUnread(
                sidebarConversationId,
                msg,
                true,
              );
            }
          }
        } catch (updateErr) {
          console.warn("Could not push sent reply to sidebar", updateErr);
        }

        if (typeof global.toastSuccess === "function") {
          global.toastSuccess("Reply sent!");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (typeof global.toastError === "function") {
          global.toastError(err.message || "Failed to send reply.");
        }
      }
    } catch (err) {
      console.error("Story reply error:", err);
      if (typeof global.toastError === "function") {
        global.toastError("Failed to send reply.");
      }
    } finally {
      inputEl.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  async function stHandleQuickReact(emoji) {
    if (stIsOwnStory()) return;
    const story = stCurrentStory();
    if (!story) return;

    const emojiToType = {
      "👍": 0,
      "❤️": 1,
      "😆": 2,
      "😮": 3,
      "😢": 4,
      "😡": 5,
    };

    const reactType = emojiToType[emoji];
    if (reactType === undefined) return;

    try {
      if (!global.API?.Stories?.toggleReact) return;
      const res = await global.API.Stories.toggleReact(
        story.storyId,
        reactType,
      );
      if (res.ok) {
        const updatedStory = await res.json();
        // Update local state
        story.currentUserReactType = updatedStory.currentUserReactType;
        // Re-highlight
        stHighlightUserReact(story.currentUserReactType);

        // Optional: show small toast or subtle feedback
        if (typeof global.toastSuccess === "function") {
          const isUnreact =
            story.currentUserReactType === null ||
            story.currentUserReactType === undefined;
          global.toastSuccess(
            isUnreact ? "Reaction removed" : `Reacted ${emoji}`,
          );
        }
      } else {
        if (typeof global.toastError === "function") {
          global.toastError("Failed to update reaction");
        }
      }
    } catch (err) {
      console.error("Error reacting to story:", err);
    }
  }

  function stHighlightUserReact(reactType) {
    const reactFrame = viewerState.dom.reactFrame;
    if (!reactFrame) return;

    const buttons = reactFrame.querySelectorAll(".sn-story-viewer-react-btn");
    buttons.forEach((btn) => {
      btn.classList.remove("sn-story-viewer-react-active");
    });

    if (reactType !== null && reactType !== undefined) {
      const emojiMap = {
        0: "👍",
        1: "❤️",
        2: "😆",
        3: "😮",
        4: "😢",
        5: "😡",
      };
      const targetEmoji = emojiMap[reactType];
      if (targetEmoji) {
        const targetBtn = Array.from(buttons).find(
          (b) => b.getAttribute("data-story-react") === targetEmoji,
        );
        if (targetBtn) {
          targetBtn.classList.add("sn-story-viewer-react-active");
        }
      }
    }
  }

  // ===== More Menu =====

  function stToggleMoreMenu() {
    const menu = viewerState.dom.moreMenu;
    if (!menu) return;

    if (menu.classList.contains("sn-story-viewer-hidden")) {
      stOpenMoreMenu();
    } else {
      stCloseMoreMenu();
    }
  }

  function stOpenMoreMenu() {
    const menu = viewerState.dom.moreMenu;
    if (!menu) return;

    stToggleStoryPause(true);

    const story = stCurrentStory();
    const isOwn = stIsOwnStory();

    let menuHtml = "";

    if (isOwn) {
      if (!stIsArchiveLikeMode()) {
        const currentLabel = stGetStoryPrivacyLabel(story?.privacy ?? 0);
        menuHtml += `
          <button class="sn-story-viewer-menu-item" data-action="edit-privacy" title="Current: ${stEscapeAttr(currentLabel)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>
            </svg>
            <span>Edit Privacy</span>
          </button>
        `;
      }
      if (
        stIsHighlightMode() &&
        typeof viewerState.highlightOnRemoveStory === "function"
      ) {
        menuHtml += `
          <button class="sn-story-viewer-menu-item" data-action="remove-highlight-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <span>Remove</span>
          </button>
        `;
      }
      menuHtml += `
        <button class="sn-story-viewer-menu-item sn-story-viewer-menu-danger" data-action="delete-story">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
          <span>Delete Story</span>
        </button>
      `;
    } else {
      menuHtml += `
        <button class="sn-story-viewer-menu-item" data-action="report-story">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
          <span>Report</span>
        </button>
      `;
    }

    menu.innerHTML = menuHtml;
    menu.classList.remove("sn-story-viewer-hidden");

    // Attach click handlers
    menu.querySelectorAll(".sn-story-viewer-menu-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = item.getAttribute("data-action");
        stCloseMoreMenu();
        stHandleMenuAction(action);
      });
    });
  }

  function stCloseMoreMenu() {
    const menu = viewerState.dom.moreMenu;
    if (!menu) return;
    if (!menu.classList.contains("sn-story-viewer-hidden")) {
      menu.classList.add("sn-story-viewer-hidden");
      menu.innerHTML = "";
      stToggleStoryPause(false);
    }
  }

  function stHandleMenuAction(action) {
    switch (action) {
      case "edit-privacy":
        stShowPrivacyEditor();
        break;
      case "delete-story":
        stConfirmDeleteStory();
        break;
      case "remove-highlight-item":
        stRemoveCurrentHighlightItem();
        break;
      case "report-story":
        stReportStory();
        break;
    }
  }

  function stShowSystemConfirm(options = {}) {
    const {
      title = "Are you sure?",
      message = "",
      confirmText = "Confirm",
      cancelText = "Cancel",
      isDanger = false,
      onConfirm = null,
      onCancel = null,
    } = options;

    if (
      global.ChatCommon &&
      typeof global.ChatCommon.showConfirm === "function"
    ) {
      global.ChatCommon.showConfirm({
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
        <h3>${stEscapeHtml(title)}</h3>
        ${message ? `<p>${stEscapeHtml(message)}</p>` : ""}
      </div>
      <div class="unfollow-actions">
        <button type="button" class="unfollow-btn ${isDanger ? "unfollow-confirm" : "unfollow-cancel"}" data-action="confirm">${stEscapeHtml(confirmText)}</button>
        <button type="button" class="unfollow-btn unfollow-cancel" data-action="cancel">${stEscapeHtml(cancelText)}</button>
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

  function stRemoveCurrentHighlightItem() {
    if (!stIsHighlightMode()) return;
    if (typeof viewerState.highlightOnRemoveStory !== "function") return;

    const story = stCurrentStory();
    if (!story?.storyId) return;

    stPauseProgressTimer();

    stShowSystemConfirm({
      title: "Remove from Group",
      message:
        "Are you sure you want to remove this story from the highlight group?",
      confirmText: "Remove",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: () => stExecuteRemoveHighlightItem(story),
      onCancel: () => stResumeProgressTimer(),
    });
  }

  async function stExecuteRemoveHighlightItem(story) {
    stToggleStoryPause(true);

    try {
      const result = await viewerState.highlightOnRemoveStory(story);
      if (!result?.ok) {
        stToggleStoryPause(false);
        return;
      }

      if (result.groupDeleted) {
        stCloseViewer();
        return;
      }

      const normalizedStoryId = stNormalizeId(story.storyId);
      viewerState.stories = (viewerState.stories || []).filter(
        (item) => stNormalizeId(item?.storyId) !== normalizedStoryId,
      );

      if (!viewerState.stories.length) {
        stCloseViewer();
        return;
      }

      if (viewerState.currentIndex >= viewerState.stories.length) {
        viewerState.currentIndex = viewerState.stories.length - 1;
      }

      stRenderProgressBars(viewerState.stories.length);
      stRenderCurrentStory("fade");
    } catch (_) {
      stToggleStoryPause(false);
    }
  }

  function stShowPrivacyEditor() {
    const story = stCurrentStory();
    if (!story) return;

    stPauseProgressTimer();

    const currentPrivacy = story.privacy ?? 0;
    const options = STORY_PRIVACY_OPTIONS;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "sn-story-viewer-privacy-overlay";

    const popup = document.createElement("div");
    popup.className = "sn-story-viewer-privacy-popup";
    popup.innerHTML = `
      <h3>Edit Story Privacy</h3>
      <div class="sn-story-viewer-privacy-options">
        ${options
          .map(
            (opt) => `
          <label class="sn-story-viewer-privacy-option ${opt.value === currentPrivacy ? "selected" : ""}">
            <input type="radio" name="storyPrivacy" value="${opt.value}" ${opt.value === currentPrivacy ? "checked" : ""}>
            <i data-lucide="${opt.icon}"></i>
            <span>${opt.label}</span>
          </label>
        `,
          )
          .join("")}
      </div>
      <div class="sn-story-viewer-privacy-actions">
        <button class="sn-story-viewer-privacy-cancel" id="stPrivacyCancelBtn">Cancel</button>
        <button class="sn-story-viewer-privacy-save" id="stPrivacySaveBtn">Save</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    if (global.lucide) global.lucide.createIcons();

    // Highlight selected on change
    popup.querySelectorAll("input[name='storyPrivacy']").forEach((radio) => {
      radio.addEventListener("change", () => {
        popup
          .querySelectorAll(".sn-story-viewer-privacy-option")
          .forEach((el) => el.classList.remove("selected"));
        radio
          .closest(".sn-story-viewer-privacy-option")
          .classList.add("selected");
      });
    });

    const closeOverlay = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
      stResumeProgressTimer();
    };

    popup
      .querySelector("#stPrivacyCancelBtn")
      .addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeOverlay();
    });

    popup
      .querySelector("#stPrivacySaveBtn")
      .addEventListener("click", async () => {
        const selected = popup.querySelector(
          "input[name='storyPrivacy']:checked",
        );
        if (!selected) return;
        const newPrivacy = Number(selected.value);
        if (newPrivacy === currentPrivacy) {
          closeOverlay();
          return;
        }

        try {
          const res = await global.API.Stories.updatePrivacy(
            story.storyId,
            newPrivacy,
          );
          if (res?.ok) {
            story.privacy = newPrivacy;
            if (global.toastSuccess)
              global.toastSuccess("Story privacy updated.");
          } else {
            if (global.toastError)
              global.toastError("Failed to update privacy.");
          }
        } catch (_) {
          if (global.toastError) global.toastError("Failed to update privacy.");
        }
        closeOverlay();
      });
  }

  function stConfirmDeleteStory() {
    const story = stCurrentStory();
    if (!story) return;

    stPauseProgressTimer();

    stShowSystemConfirm({
      title: "Delete Story",
      message:
        "Are you sure you want to delete this story? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: () => stDeleteStory(story),
      onCancel: () => stResumeProgressTimer(),
    });
  }

  async function stDeleteStory(story) {
    if (!story?.storyId) return;

    try {
      const res = await global.API.Stories.delete(story.storyId);
      if (res?.ok) {
        if (global.toastSuccess) global.toastSuccess("Story deleted.");

        // Remove from viewer list
        viewerState.stories = viewerState.stories.filter(
          (s) => stNormalizeId(s.storyId) !== stNormalizeId(story.storyId),
        );

        const authorId = viewerState.author?.accountId;
        const remaining = viewerState.stories.length;

        // Dispatch event for story-feed sync
        global.dispatchEvent(
          new CustomEvent("story:deleted", {
            detail: {
              storyId: story.storyId,
              authorId,
              remainingCount: remaining,
              storyMode: viewerState.storyMode,
            },
          }),
        );

        if (!remaining) {
          // No more stories, close viewer and remove ring
          stCloseViewer();
          if (authorId) stSyncRingGlobally(authorId, "none");
          return;
        }

        // Adjust index
        if (viewerState.currentIndex >= viewerState.stories.length) {
          viewerState.currentIndex = viewerState.stories.length - 1;
        }

        stRenderProgressBars(viewerState.stories.length);
        stRenderCurrentStory();
      } else {
        if (global.toastError) global.toastError("Failed to delete story.");
        stResumeProgressTimer();
      }
    } catch (_) {
      if (global.toastError) global.toastError("Failed to delete story.");
      stResumeProgressTimer();
    }
  }

  function stReportStory() {
    const story = stCurrentStory();
    if (!story) return;
    if (global.toastInfo) {
      global.toastInfo("Report feature will be available soon.");
    }
  }

  function stPauseAnyVideo() {
    if (!viewerState.dom.content) return;
    const videos = viewerState.dom.content.querySelectorAll("video");
    videos.forEach((video) => {
      try {
        video.pause();
      } catch (_) {
        // Ignore
      }
    });
  }

  /**
   * Globally sync story ring state for a given author across ALL surfaces.
   * @param {string} authorId
   * @param {"unseen"|"seen"|"none"} newState
   */
  function stSyncRingGlobally(authorId, newState) {
    const rawId = (authorId || "").toString().trim();
    const normalizedAuthorId = stNormalizeId(rawId);
    if (!normalizedAuthorId) return;

    const normalizedState = stNormalizeRingState(newState);
    const ringMap = new Map();

    const addRingCandidates = (selector) => {
      document.querySelectorAll(selector).forEach((ring) => {
        ringMap.set(ring, ring);
      });
    };

    addRingCandidates(
      `.post-avatar-ring[data-story-author-id="${CSS.escape(rawId)}"]`,
    );
    if (normalizedAuthorId !== rawId) {
      addRingCandidates(
        `.post-avatar-ring[data-story-author-id="${CSS.escape(normalizedAuthorId)}"]`,
      );
    }

    if (!ringMap.size) {
      document
        .querySelectorAll(".post-avatar-ring[data-story-author-id]")
        .forEach((ring) => {
          const candidateId = stNormalizeId(
            ring.getAttribute("data-story-author-id") || "",
          );
          if (candidateId === normalizedAuthorId) {
            ringMap.set(ring, ring);
          }
        });
    }

    ringMap.forEach((ring) => {
      ring.classList.remove("story-ring-unseen", "story-ring-seen");

      if (normalizedState === "unseen") {
        ring.classList.add("story-ring-unseen");
      } else if (normalizedState === "seen") {
        ring.classList.add("story-ring-seen");
      } else {
        // "none" → remove ring entirely
        ring.classList.remove("post-avatar-ring");
        ring.removeAttribute("data-story-author-id");
      }
    });

    const queueIndex = viewerState.authorQueue.findIndex(
      (author) => stNormalizeId(author?.accountId) === normalizedAuthorId,
    );
    if (queueIndex >= 0) {
      const nextRingState =
        normalizedState === "unseen" ? 2 : normalizedState === "seen" ? 1 : 0;
      const current = viewerState.authorQueue[queueIndex];
      if ((current?.storyRingState ?? 0) !== nextRingState) {
        viewerState.authorQueue[queueIndex] = {
          ...current,
          storyRingState: nextRingState,
        };
      }
    }

    if (typeof global.syncStoryFeedRingState === "function") {
      global.syncStoryFeedRingState(normalizedAuthorId, normalizedState);
    }
  }

  /**
   * Check whether ALL stories in the viewer have been viewed.
   */
  function stAllStoriesViewed() {
    if (!Array.isArray(viewerState.stories) || !viewerState.stories.length) {
      return false;
    }
    return viewerState.stories.every((s) => !!s.isViewedByCurrentUser);
  }

  async function stMarkViewedIfNeeded(story) {
    if (!story || !story.storyId) return;
    if (stIsArchiveLikeMode()) return;
    if (stIsOwnStory()) return;
    if (viewerState.markedStoryIds.has(story.storyId)) return;
    if (story.isViewedByCurrentUser) return;
    if (!global.API?.Stories?.markViewed) return;

    viewerState.markedStoryIds.add(story.storyId);

    try {
      const response = await global.API.Stories.markViewed([story.storyId]);
      if (response?.ok) {
        story.isViewedByCurrentUser = true;

        // Sync ring globally: if all stories are now viewed → seen, otherwise unseen
        const authorId = viewerState.author?.accountId;
        if (authorId) {
          const nextRingState = stAllStoriesViewed() ? "seen" : "unseen";
          stSetViewedAuthorState(
            authorId,
            nextRingState === "seen" ? "seen" : "partial",
          );
          stSyncRingGlobally(authorId, nextRingState);
          if (stHasQueue()) {
            stUpdateStripHighlight();
          }
        }
      }
    } catch (_) {
      // Ignore mark-view failures to avoid blocking viewer UX.
    }
  }

  function stRenderUnavailableContent(
    parentShell,
    reason,
    iconName = "eye-off",
  ) {
    const unavailableEl = document.createElement("div");
    unavailableEl.className = "sn-story-viewer-unavailable";
    unavailableEl.innerHTML = `
      <i data-lucide="${iconName}" style="width:48px;height:48px;opacity:0.5;"></i>
      <p style="margin-top:12px;font-size:15px;opacity:0.7;">${reason || "This story is no longer available."}</p>
    `;
    parentShell.appendChild(unavailableEl);
    if (global.lucide) global.lucide.createIcons();
  }

  function stMountPreviewShell(previewShell, direction = "fade") {
    const contentRoot = viewerState.dom.content;
    if (!contentRoot || !previewShell) return;

    const normalizedDirection =
      direction === "next" || direction === "prev" ? direction : "fade";

    // Clear stale transition shells to avoid DOM build-up on rapid navigation.
    contentRoot
      .querySelectorAll(".snsv-preview-shell-leaving")
      .forEach((node) => node.remove());

    const currentShell =
      contentRoot.querySelector(
        ".sn-story-viewer-preview-shell:not(.snsv-preview-shell-leaving)",
      ) || contentRoot.querySelector(".sn-story-viewer-preview-shell");

    if (!currentShell || normalizedDirection === "fade") {
      contentRoot.innerHTML = "";
      previewShell.classList.add("snsv-preview-shell-fade-in");
      contentRoot.appendChild(previewShell);
      requestAnimationFrame(() => {
        previewShell.classList.add("snsv-preview-shell-fade-in-active");
      });
      setTimeout(() => {
        previewShell.classList.remove(
          "snsv-preview-shell-fade-in",
          "snsv-preview-shell-fade-in-active",
        );
      }, 350);
      return;
    }

    // Pause outgoing media early so transition feels lighter on lower-end devices.
    const outgoingVideo = currentShell.querySelector("video");
    if (outgoingVideo && !outgoingVideo.paused) {
      try {
        outgoingVideo.pause();
      } catch (_) {
        // Ignore pause errors.
      }
    }

    const enterClass =
      normalizedDirection === "next"
        ? "snsv-preview-shell-enter-next"
        : "snsv-preview-shell-enter-prev";
    const leaveClass =
      normalizedDirection === "next"
        ? "snsv-preview-shell-leave-next"
        : "snsv-preview-shell-leave-prev";

    currentShell.classList.add("snsv-preview-shell-leaving", leaveClass);
    previewShell.classList.add("snsv-preview-shell-entering", enterClass);
    contentRoot.appendChild(previewShell);

    requestAnimationFrame(() => {
      previewShell.classList.add("snsv-preview-shell-enter-active");
      currentShell.classList.add("snsv-preview-shell-leave-active");
    });

    let cleaned = false;
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      if (currentShell.parentNode === contentRoot) {
        currentShell.remove();
      }
      previewShell.classList.remove(
        "snsv-preview-shell-entering",
        "snsv-preview-shell-enter-active",
        enterClass,
      );
    };

    previewShell.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 360);
  }

  function stRenderStoryContent(story, direction = "fade") {
    if (!viewerState.dom.content) return;

    stRenderViewerActions();
    stRenderSelfInsight(story);
    stMarkViewedIfNeeded(story);

    const previewShell = document.createElement("div");
    previewShell.className = "sn-story-viewer-preview-shell";

    const contentType = Number(story.contentType);
    if (contentType === 2) {
      const style = stResolveTextStyle(story);

      const textPreview = document.createElement("div");
      textPreview.className = "sn-story-viewer-text-preview";
      textPreview.style.background = style.background;

      const textEditor = document.createElement("div");
      textEditor.className = "sn-story-viewer-text-editor";
      textEditor.style.color = style.color;
      textEditor.style.fontFamily = style.fontFamily;
      textEditor.style.fontSize = `${style.fontSizePx}px`;
      textEditor.textContent = story.textContent || "";

      textPreview.appendChild(textEditor);
      previewShell.appendChild(textPreview);
      stMountPreviewShell(previewShell, direction);
      stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
      return;
    }

    if (contentType === 1) {
      // Resolve video background color with fallback
      const style = stResolveTextStyle(story);
      previewShell.style.background = style.background;

      const video = document.createElement("video");
      video.className = "sn-story-viewer-video-preview";
      video.src = story.mediaUrl || "";
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.loop = false;
      video.setAttribute("preload", "metadata");

      // Mute/Unmute toggle button
      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.className = "sn-story-viewer-mute-btn";
      muteBtn.setAttribute("aria-label", "Toggle sound");
      muteBtn.innerHTML = `
        <svg class="sn-story-mute-icon sn-story-mute-icon--muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
        <svg class="sn-story-mute-icon sn-story-mute-icon--unmuted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        const mutedIcon = muteBtn.querySelector(".sn-story-mute-icon--muted");
        const unmutedIcon = muteBtn.querySelector(
          ".sn-story-mute-icon--unmuted",
        );
        if (video.muted) {
          mutedIcon.style.display = "";
          unmutedIcon.style.display = "none";
        } else {
          mutedIcon.style.display = "none";
          unmutedIcon.style.display = "";
        }
      });

      video.addEventListener("loadedmetadata", () => {
        const durationSeconds = Number(video.duration);
        const durationMs =
          Number.isFinite(durationSeconds) && durationSeconds > 0
            ? durationSeconds * 1000
            : DEFAULT_STORY_DURATION_MS;
        stStartProgressTimer(durationMs);
      });

      video.addEventListener("ended", () => {
        stGoNext();
      });

      video.addEventListener("error", () => {
        previewShell.innerHTML = "";
        stRenderUnavailableContent(
          previewShell,
          "this video could not be loaded",
          "video-off",
        );
        stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
      });

      previewShell.style.position = "relative";
      previewShell.appendChild(video);
      previewShell.appendChild(muteBtn);
      stMountPreviewShell(previewShell, direction);
      video.play().catch(() => {
        previewShell.innerHTML = "";
        stRenderUnavailableContent(
          previewShell,
          "this video could not be loaded",
          "video-off",
        );
        stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
      });
      return;
    }

    if (!story.mediaUrl) {
      stRenderUnavailableContent(
        previewShell,
        "This story is no longer available.",
      );
      stMountPreviewShell(previewShell, direction);
      stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
      return;
    }

    const image = document.createElement("img");
    image.className = "sn-story-viewer-image-preview";
    image.src = story.mediaUrl;
    image.alt = "";
    image.addEventListener("error", () => {
      previewShell.innerHTML = "";
      stRenderUnavailableContent(
        previewShell,
        "this image could not be loaded",
        "image-off",
      );
    });
    previewShell.appendChild(image);
    stMountPreviewShell(previewShell, direction);
    stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
  }

  function stRenderCurrentStory(direction = "fade") {
    stCloseViewersList();
    const story = stCurrentStory();
    if (!story) {
      stCloseViewer();
      return;
    }

    stRememberCurrentStoryPosition(
      viewerState.author?.accountId,
      story.storyId,
    );

    stRenderNavButtons();

    // Animate UI elements if direction is provided
    const animatingEls = [
      viewerState.dom.progress,
      viewerState.dom.header,
      viewerState.dom.insight,
      viewerState.dom.actions,
    ].filter(Boolean);

    animatingEls.forEach((el) => {
      el.classList.remove(
        "snsv-animate-next",
        "snsv-animate-prev",
        "snsv-animate-fade",
      );
      void el.offsetWidth; // Force reflow
      el.classList.add(`snsv-animate-${direction}`);
    });

    if (viewerState.dom.avatar) {
      const avatarUrl =
        viewerState.author?.avatarUrl ||
        global.APP_CONFIG?.DEFAULT_AVATAR ||
        "";
      viewerState.dom.avatar.src = avatarUrl;
    }
    if (viewerState.dom.username) {
      viewerState.dom.username.textContent = stResolveViewerHeaderName();
    }
    if (viewerState.dom.time) {
      if (global.PostUtils?.timeAgo && story.createdAt) {
        viewerState.dom.time.textContent = global.PostUtils.timeAgo(
          story.createdAt,
        );
        if (global.PostUtils?.formatFullDateTime) {
          viewerState.dom.time.title =
            global.PostUtils.formatFullDateTime(story.createdAt) || "";
        } else {
          const createdAtDate = new Date(story.createdAt);
          viewerState.dom.time.title = Number.isNaN(createdAtDate.getTime())
            ? ""
            : createdAtDate.toLocaleString();
        }
      } else {
        viewerState.dom.time.textContent = "";
        viewerState.dom.time.title = "";
      }
    }

    // Privacy icon
    if (viewerState.dom.privacy) {
      if (stIsHighlightMode()) {
        viewerState.dom.privacy.innerHTML = "";
        viewerState.dom.privacy.classList.add("sn-story-viewer-hidden");
        if (viewerState.dom.privacyDivider) {
          viewerState.dom.privacyDivider.classList.add(
            "sn-story-viewer-hidden",
          );
        }
      } else {
        const privacy = story.privacy ?? 0;
        const iconName = global.PostUtils?.getPrivacyIconName
          ? global.PostUtils.getPrivacyIconName(privacy)
          : privacy === 2
            ? "lock"
            : privacy === 1
              ? "users"
              : "globe";
        viewerState.dom.privacy.classList.remove("sn-story-viewer-hidden");
        if (viewerState.dom.privacyDivider) {
          viewerState.dom.privacyDivider.classList.remove(
            "sn-story-viewer-hidden",
          );
        }
        viewerState.dom.privacy.innerHTML = `<i data-lucide="${stEscapeAttr(iconName)}"></i>`;
        if (global.lucide) global.lucide.createIcons();
      }
    }

    stUpdateProgressFill(0);
    stRenderStoryContent(story, direction);
    stHighlightUserReact(story.currentUserReactType);
    stSyncUrlStory(story.storyId);
    stMaybePrefetchArchiveStories();
  }

  function stMergeStories(existingStories, incomingStories, authorId) {
    const existing = Array.isArray(existingStories) ? existingStories : [];
    const incoming = Array.isArray(incomingStories) ? incomingStories : [];
    if (!incoming.length) return existing;

    const seen = new Set(existing.map((item) => stNormalizeId(item?.storyId)));
    const merged = existing.slice();

    incoming.forEach((story) => {
      const normalizedStoryId = stNormalizeId(story?.storyId);
      if (!normalizedStoryId || seen.has(normalizedStoryId)) {
        return;
      }

      merged.push(story);
      seen.add(normalizedStoryId);

      if (authorId) {
        stCacheStoryAuthor(story.storyId, authorId);
      }
    });

    return merged;
  }

  async function stFetchArchivePage(page, pageSize) {
    if (!global.API?.Stories?.getArchived) {
      return { response: null, payload: null };
    }

    const response = await global.API.Stories.getArchived(page, pageSize);

    if (!response?.ok) {
      return { response, payload: null };
    }

    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  function stGetCurrentProgressRate() {
    if (viewerState.progressDurationMs <= 0) return 0;

    const elapsed = viewerState.isProgressPaused
      ? viewerState.progressPausedElapsedMs
      : Date.now() - viewerState.progressStartedAt;

    return stClamp(elapsed / viewerState.progressDurationMs, 0, 1);
  }

  async function stLoadMoreArchiveStories() {
    if (!stIsArchiveMode()) return false;
    if (!viewerState.archiveHasMore) return false;
    if (!viewerState.isOpen) return false;
    if (viewerState.archiveIsLoadingMore) {
      return viewerState.archiveLoadPromise || false;
    }

    const authorId = (viewerState.author?.accountId || "").toString().trim();

    const requestId = viewerState.requestId;
    const pageSize = Math.max(1, stParseInt(viewerState.archivePageSize, 12));
    const loadPromise = (async () => {
      let usedCustomLoader = false;
      let rawStories = [];
      let nextHasMore = viewerState.archiveHasMore;

      try {
        if (typeof viewerState.archiveLoadMoreFn === "function") {
          usedCustomLoader = true;
          const result = await viewerState.archiveLoadMoreFn();
          if (requestId !== viewerState.requestId || !viewerState.isOpen) {
            return false;
          }

          if (Array.isArray(result)) {
            rawStories = result;
            if (!result.length) {
              nextHasMore = false;
            }
          } else {
            rawStories = Array.isArray(result?.items) ? result.items : [];
            if (typeof result?.hasMore === "boolean") {
              nextHasMore = result.hasMore;
            } else if (!rawStories.length) {
              nextHasMore = false;
            }
          }
        } else {
          const nextPage = viewerState.archivePage + 1;
          const { response, payload } = await stFetchArchivePage(
            nextPage,
            pageSize,
          );

          if (requestId !== viewerState.requestId || !viewerState.isOpen) {
            return false;
          }

          if (!response?.ok) {
            if (response?.status === 404 || response?.status === 403) {
              viewerState.archiveHasMore = false;
            }
            return false;
          }

          rawStories = Array.isArray(payload?.items ?? payload?.Items)
            ? (payload.items ?? payload.Items)
            : Array.isArray(payload?.stories ?? payload?.Stories)
              ? (payload.stories ?? payload.Stories)
              : [];
          viewerState.archivePage = nextPage;
          nextHasMore = Boolean(payload?.hasNextPage ?? payload?.HasNextPage);
        }

        const mappedStories = rawStories
          .map(stResolveStoryItem)
          .filter((story) => !!story.storyId);
        const prevStoryCount = viewerState.stories.length;

        viewerState.stories = stMergeStories(
          viewerState.stories,
          mappedStories,
          authorId,
        );
        if (usedCustomLoader && mappedStories.length > 0) {
          viewerState.archivePage += 1;
        }
        viewerState.archiveHasMore = Boolean(nextHasMore);

        if (viewerState.stories.length !== prevStoryCount) {
          stRenderProgressBars(viewerState.stories.length);
          stUpdateProgressFill(stGetCurrentProgressRate());
        }
        stRenderNavButtons();

        return viewerState.stories.length > prevStoryCount;
      } catch (_) {
        return false;
      }
    })();

    viewerState.archiveIsLoadingMore = true;
    viewerState.archiveLoadPromise = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (viewerState.archiveLoadPromise === loadPromise) {
        viewerState.archiveLoadPromise = null;
      }
      viewerState.archiveIsLoadingMore = false;
    }
  }

  function stMaybePrefetchArchiveStories() {
    if (!stIsArchiveMode()) return;
    if (stHasQueue()) return;
    if (!viewerState.archiveHasMore) return;

    const remaining = viewerState.stories.length - 1 - viewerState.currentIndex;
    if (remaining >= ARCHIVE_PREFETCH_THRESHOLD) return;

    stLoadMoreArchiveStories();
  }

  /* ─── Story list (queue) mode helpers ─── */

  function stHasQueue() {
    return viewerState.authorQueue.length > 0;
  }

  /** Render story strip (mini avatar list) beside viewer card - Vertical Sidebar */
  function stRenderStrip() {
    if (!viewerState.modal) return;
    // Remove existing strip
    viewerState.modal
      .querySelectorAll(".sn-story-viewer-strip-wrapper")
      .forEach((btn) => btn.remove());
    // Remove old nav buttons if they were directly in card
    viewerState.modal
      .querySelectorAll(".sn-story-viewer-author-nav")
      .forEach((btn) => btn.remove());

    if (!stHasQueue()) return;

    const defaultAvatar =
      global.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    const queue = viewerState.authorQueue;
    const activeIndex = viewerState.authorQueueIndex;
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();

    // Build strip HTML
    let stripHtml = "";
    queue.forEach((author, i) => {
      const isActive = i === activeIndex;
      const viewedState = stGetViewedAuthorState(author.accountId);

      let finalRingClass = "ring-none";
      let isSeen = viewedState === "seen";
      let isUnseen = false;

      if (viewedState === "seen") {
        finalRingClass = "ring-seen";
        isSeen = true;
      } else if (viewedState === "partial") {
        finalRingClass = "ring-unseen";
        isUnseen = true;
      } else {
        // No session state, use initial backend state
        const srs = author.storyRingState;
        if (srs === 2 || srs === "unseen" || String(srs) === "2") {
          finalRingClass = "ring-unseen";
          isUnseen = true;
        } else if (srs === 1 || srs === "seen" || String(srs) === "1") {
          finalRingClass = "ring-seen";
          isSeen = true;
        }
      }

      const displayName =
        author.isCurrentUser || author.accountId === myId
          ? "You"
          : stEscapeHtml(author.username);

      const classes = [
        "sn-story-viewer-strip-item",
        isActive ? "active" : "",
        isSeen ? "strip-seen" : "",
        isUnseen ? "strip-unseen" : "",
      ]
        .filter(Boolean)
        .join(" ");

      stripHtml += `
        <div class="${classes}" data-strip-index="${i}" data-strip-author="${stEscapeAttr(author.accountId)}">
          <div class="sn-story-viewer-strip-ring ${finalRingClass}">
            <img class="sn-story-viewer-strip-avatar" src="${stEscapeAttr(author.avatarUrl || defaultAvatar)}" alt="" loading="lazy">
          </div>
          <span class="sn-story-viewer-strip-name">${displayName}</span>
        </div>`;
    });

    // Add a sentinel
    if (viewerState.queueHasMore) {
      stripHtml += `<div class="sn-story-viewer-strip-sentinel"></div>`;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "sn-story-viewer-strip-wrapper";
    wrapper.innerHTML = `<div class="sn-story-viewer-strip">${stripHtml}</div>`;

    wrapper.addEventListener("click", (e) => {
      const item = e.target.closest(".sn-story-viewer-strip-item");
      if (!item) return;
      const index = parseInt(item.getAttribute("data-strip-index"), 10);
      if (!isNaN(index) && index !== viewerState.authorQueueIndex) {
        stJumpToAuthor(index);
      }
    });

    const card = viewerState.modal.querySelector(".sn-story-viewer-card");
    if (card) card.appendChild(wrapper);

    // Show main card navigation buttons (for switching stories within same user)
    if (viewerState.dom.prevBtn) viewerState.dom.prevBtn.style.display = "";
    if (viewerState.dom.nextBtn) viewerState.dom.nextBtn.style.display = "";

    const stripEl = wrapper.querySelector(".sn-story-viewer-strip");
    if (stripEl) {
      // 1. Infinity Scroll Logic
      stripEl.addEventListener("scroll", async () => {
        if (!viewerState.queueHasMore || viewerState.isLoadingMore) return;
        const nearEnd =
          stripEl.scrollHeight - stripEl.scrollTop - stripEl.clientHeight < 100;
        if (!nearEnd) return;

        if (global.loadMoreStoryFeedAuthors) {
          viewerState.isLoadingMore = true;
          const newAuthors = await global.loadMoreStoryFeedAuthors();
          viewerState.isLoadingMore = false;
          if (newAuthors && newAuthors.length > 0) {
            viewerState.authorQueue =
              viewerState.authorQueue.concat(newAuthors);
            stRenderStrip();
          } else {
            viewerState.queueHasMore = false;
            const sentinel = stripEl.querySelector(
              ".sn-story-viewer-strip-sentinel",
            );
            if (sentinel) sentinel.remove();
          }
        }
      });

      // 2. Drag to Scroll Logic (Mobile-like)
      let isDown = false;
      let startY;
      let scrollTop;
      let dragged = false;

      stripEl.addEventListener("mousedown", (e) => {
        isDown = true;
        stripEl.classList.add("active");
        startY = e.pageY - stripEl.offsetTop;
        scrollTop = stripEl.scrollTop;
        dragged = false;
        // Temporarily disable smooth scroll for better drag response
        stripEl.style.scrollBehavior = "auto";
      });

      stripEl.addEventListener("mouseleave", () => {
        isDown = false;
        stripEl.style.scrollBehavior = "smooth";
      });

      stripEl.addEventListener("mouseup", () => {
        isDown = false;
        stripEl.style.scrollBehavior = "smooth";
      });

      stripEl.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const y = e.pageY - stripEl.offsetTop;
        const walk = (y - startY) * 1.5; // multiplier for faster scroll
        if (Math.abs(walk) > 5) dragged = true;
        stripEl.scrollTop = scrollTop - walk;
      });

      // Prevent click if dragged
      stripEl.addEventListener(
        "click",
        (e) => {
          if (dragged) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true,
      );
    }

    stScrollStripToActive();
  }

  /** Auto-scroll strip */
  function stScrollStripToActive() {
    if (!viewerState.modal) return;
    const strip = viewerState.modal.querySelector(".sn-story-viewer-strip");
    const active = strip?.querySelector(".sn-story-viewer-strip-item.active");
    if (!strip || !active) return;

    active.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }

  /** Update highlight */
  function stUpdateStripHighlight() {
    if (!viewerState.modal) return;
    const strip = viewerState.modal.querySelector(".sn-story-viewer-strip");
    if (!strip) return;
    const previousActive = strip.querySelector(
      ".sn-story-viewer-strip-item.active",
    );

    strip.querySelectorAll(".sn-story-viewer-strip-item").forEach((item) => {
      const idx = parseInt(item.getAttribute("data-strip-index"), 10);
      const authId = stNormalizeId(
        item.getAttribute("data-strip-author") || "",
      );
      const isActive = idx === viewerState.authorQueueIndex;
      const viewedState = stGetViewedAuthorState(authId);
      const author = viewerState.authorQueue[idx];

      let isSeen = viewedState === "seen";
      let isUnseen = false;
      let finalRingClass = "ring-none";

      if (viewedState === "seen") {
        isSeen = true;
        finalRingClass = "ring-seen";
      } else if (viewedState === "partial") {
        isUnseen = true;
        finalRingClass = "ring-unseen";
      } else if (author) {
        const srs = author.storyRingState;
        if (srs === 2 || srs === "unseen" || String(srs) === "2") {
          isUnseen = true;
          finalRingClass = "ring-unseen";
        } else if (srs === 1 || srs === "seen" || String(srs) === "1") {
          isSeen = true;
          finalRingClass = "ring-seen";
        }
      }

      item.classList.toggle("active", isActive);
      item.classList.toggle("strip-seen", isSeen);
      item.classList.toggle("strip-unseen", isUnseen);

      const ring = item.querySelector(".sn-story-viewer-strip-ring");
      if (ring) {
        ring.className = `sn-story-viewer-strip-ring ${finalRingClass}`;
      }
    });

    stScrollStripToActive();
  }

  /** Sync ring state for current author before switching */
  function stSyncCurrentAuthorRing() {
    if (stIsArchiveLikeMode()) return;
    const authorId = stNormalizeId(viewerState.author?.accountId);
    if (!authorId || stIsOwnStory()) return;

    if (stAllStoriesViewed()) {
      stSetViewedAuthorState(authorId, "seen");
      stSyncRingGlobally(authorId, "seen");
    } else {
      stSetViewedAuthorState(authorId, "partial");
    }
  }

  /** Switch to a specific author by queue index */
  async function stSwitchToAuthor(targetIndex, options = {}) {
    const queue = viewerState.authorQueue;
    if (targetIndex < 0 || targetIndex >= queue.length) return false;

    const author = queue[targetIndex];
    if (!author) return false;

    // Sync current author ring before switching
    stSyncCurrentAuthorRing();

    // Save queue state
    const savedQueue = viewerState.authorQueue;
    const savedQueueHasMore = viewerState.queueHasMore;
    const savedViewedAuthors = viewerState.viewedAuthors;
    const resumeStoryId = stGetAuthorResumeStoryId(author.accountId);

    viewerState.authorQueueIndex = targetIndex;

    // Open the new author (this resets some state, but we restore queue)
    const openStatus = await stOpenViewerByAuthorId(author.accountId, {
      syncUrl: true,
      startAtUnviewed: options.startAtUnviewed !== false,
      startAtLastStory: options.startAtLastStory || false,
      resumeStoryId,
      direction: options.direction || "fade",
      _keepQueue: true, // internal flag to prevent queue reset
    });

    // Restore queue state after open
    viewerState.authorQueue = savedQueue;
    viewerState.authorQueueIndex = targetIndex;
    viewerState.queueHasMore = savedQueueHasMore;
    viewerState.viewedAuthors = savedViewedAuthors;
    stPruneAuthorResumeMap(savedQueue);

    if (openStatus !== STORY_OPEN_STATUS.SUCCESS) {
      // Author unavailable -> remove from queue and continue to next author.
      if (
        openStatus === STORY_OPEN_STATUS.UNAVAILABLE &&
        typeof global.removeStoryFeedAuthor === "function"
      ) {
        global.removeStoryFeedAuthor(author.accountId);
      }
      return false;
    }

    stUpdateStripHighlight();
    return true;
  }

  /** Go to next author in queue. Returns false if at end. */
  async function stGoNextAuthor() {
    if (!stHasQueue()) return false;

    const queue = viewerState.authorQueue;
    let nextIndex = viewerState.authorQueueIndex + 1;

    // If at end and has more pages, try loading more
    if (nextIndex >= queue.length && viewerState.queueHasMore) {
      if (global.loadMoreStoryFeedAuthors) {
        const newAuthors = await global.loadMoreStoryFeedAuthors();
        if (newAuthors.length > 0) {
          viewerState.authorQueue = viewerState.authorQueue.concat(newAuthors);
          // Re-render strip with new authors
          stRenderStrip();
        } else {
          viewerState.queueHasMore = false;
        }
      }
    }

    // Try next authors, skip unavailable ones
    while (nextIndex < viewerState.authorQueue.length) {
      const success = await stSwitchToAuthor(nextIndex, { direction: "next" });
      if (success && viewerState.isOpen) return true;
      // Author was unavailable, try next
      nextIndex++;
    }

    // No more authors — close viewer
    stSyncCurrentAuthorRing();
    stCloseViewer();
    return false;
  }

  /** Go to previous author in queue */
  async function stGoPrevAuthor() {
    if (!stHasQueue() || viewerState.authorQueueIndex <= 0) return false;
    return stSwitchToAuthor(viewerState.authorQueueIndex - 1, {
      startAtLastStory: true,
      direction: "prev",
    });
  }

  /** Jump directly to any author in queue (from strip click) */
  async function stJumpToAuthor(index) {
    if (!stHasQueue()) return false;
    if (index === viewerState.authorQueueIndex) return true;
    const direction = index > viewerState.authorQueueIndex ? "next" : "prev";
    return stSwitchToAuthor(index, { direction });
  }

  /** Sync all viewed authors' ring states on viewer close */
  function stSyncAllRingsOnClose() {
    viewerState.viewedAuthors.forEach((state, authorId) => {
      if (state === "seen") {
        stSyncRingGlobally(authorId, "seen");
      }
    });
  }

  /* ─── Modified navigation (queue-aware) ─── */

  async function stGoNext() {
    if (!viewerState.isOpen) return;
    stCloseMoreMenu();
    if (viewerState.currentIndex >= viewerState.stories.length - 1) {
      // At last story — if in queue mode, go to next author
      if (stHasQueue()) {
        stGoNextAuthor();
      } else if (stIsArchiveMode() && viewerState.archiveHasMore) {
        const loadedMore = await stLoadMoreArchiveStories();
        if (
          loadedMore &&
          viewerState.currentIndex < viewerState.stories.length - 1
        ) {
          viewerState.currentIndex += 1;
          stRenderCurrentStory("next");
          return;
        }
        stCloseViewer();
      } else {
        stCloseViewer();
      }
      return;
    }
    viewerState.currentIndex += 1;
    stRenderCurrentStory("next");
  }

  function stGoPrev() {
    if (!viewerState.isOpen) return;
    stCloseMoreMenu();
    if (viewerState.currentIndex <= 0) {
      // At first story — if in queue mode, go to prev author
      if (stHasQueue() && viewerState.authorQueueIndex > 0) {
        stGoPrevAuthor();
      }
      return;
    }
    viewerState.currentIndex -= 1;
    stRenderCurrentStory("prev");
  }

  function stHandleAuthorClick() {
    if (!viewerState.author) return;

    const profileTarget =
      viewerState.author.username || viewerState.author.accountId;
    if (!profileTarget) return;

    // Navigate to profile
    if (global.RouteHelper?.buildProfileHash) {
      global.location.hash = global.RouteHelper.buildProfileHash(profileTarget);
    } else {
      global.location.hash = `#/${encodeURIComponent(profileTarget)}`;
    }

    // Note: router() will be triggered by hashchange, which calls closeAllOverlayModals(),
    // which in turn calls stCloseViewer().
    // So we don't strictly need to call stCloseViewer() here, but it doesn't hurt.
    stCloseViewer();
  }

  /**
   * Parse the hash fragment into path + query params.
   * e.g. "#/messages?id=abc" → { hashPath: "#/messages", hashParams: URLSearchParams("id=abc") }
   */
  function stParseHashRaw(rawHash) {
    const raw = (rawHash || "").toString();
    const qIndex = raw.indexOf("?");
    if (qIndex === -1) {
      return { hashPath: raw, hashParams: new URLSearchParams() };
    }
    return {
      hashPath: raw.substring(0, qIndex),
      hashParams: new URLSearchParams(raw.substring(qIndex + 1)),
    };
  }

  function stParseHash() {
    return stParseHashRaw(global.location.hash || "");
  }

  function stParseHashFromUrlString(urlString) {
    const rawUrl = (urlString || "").toString();
    const hashIndex = rawUrl.indexOf("#");
    if (hashIndex === -1) {
      return { hashPath: "", hashParams: new URLSearchParams() };
    }
    return stParseHashRaw(rawUrl.slice(hashIndex));
  }

  function stBuildHashString(hashPath, hashParams) {
    const qs = hashParams.toString();
    return qs ? `${hashPath}?${qs}` : hashPath;
  }

  function stDecodeRouteSegment(segment) {
    try {
      return decodeURIComponent(segment);
    } catch (_) {
      return segment;
    }
  }

  function stExtractProfileHashPath(hashPath) {
    const normalizedHashPath = (hashPath || "").toString().trim();
    if (!normalizedHashPath.startsWith("#")) return "";

    if (
      global.RouteHelper?.parseHash &&
      global.RouteHelper?.extractProfileTargetFromHash &&
      global.RouteHelper?.buildProfileHash
    ) {
      const parsed = global.RouteHelper.parseHash(normalizedHashPath);
      const profileTarget =
        global.RouteHelper.extractProfileTargetFromHash(normalizedHashPath);
      if (profileTarget) {
        return global.RouteHelper.buildProfileHash(profileTarget);
      }

      if (global.RouteHelper.isProfilePath?.(parsed.path)) {
        const currentUsername = (localStorage.getItem("username") || "")
          .toString()
          .trim();
        return global.RouteHelper.buildProfileHash(currentUsername || "");
      }
    }

    const rawPath = normalizedHashPath.slice(1);
    const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const segments = normalizedPath.split("/").filter(Boolean);
    if (!segments.length) return "";

    const firstSegment = (segments[0] || "").toString().trim();
    if (!firstSegment || firstSegment.toLowerCase() === "story") return "";
    return `#/${encodeURIComponent(stDecodeRouteSegment(firstSegment))}`;
  }

  function stIsStoryHashRoute(hashPath) {
    const normalizedHashPath = (hashPath || "").toString().trim();
    const normalizedLowerHashPath = normalizedHashPath.toLowerCase();
    const isProfileHighlightRoute =
      !!stExtractProfileHighlightRouteContext(normalizedHashPath);
    const isLegacyHighlightRoute =
      normalizedLowerHashPath.startsWith("#/story/highlight/");

    return (
      normalizedHashPath === "#/stories" ||
      normalizedHashPath.startsWith(`#${STORY_HASH_ROUTE_PREFIX}`) ||
      normalizedHashPath === "#/story" ||
      normalizedHashPath.startsWith(`#${STORY_HASH_ROUTE_LEGACY_PREFIX}`) ||
      isLegacyHighlightRoute ||
      isProfileHighlightRoute
    );
  }

  function stExtractHighlightRouteContext(hashPath) {
    const normalizedHashPath = (hashPath || "").toString().trim();
    if (!normalizedHashPath.startsWith("#")) return null;

    const rawPath = normalizedHashPath.slice(1);
    const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (!normalizedPath.startsWith(STORY_HIGHLIGHT_HASH_ROUTE_PREFIX)) {
      return null;
    }

    const remainder = normalizedPath.slice(
      STORY_HIGHLIGHT_HASH_ROUTE_PREFIX.length,
    );
    const segments = remainder.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    const decodeSegment = (segment) => {
      try {
        return decodeURIComponent(segment);
      } catch (_) {
        return segment;
      }
    };

    return {
      targetAccountId: decodeSegment(segments[0]),
      groupId: decodeSegment(segments[1]),
      storyId: segments[2] ? decodeSegment(segments[2]) : "",
    };
  }

  function stExtractProfileHighlightRouteContext(hashPath) {
    const normalizedHashPath = (hashPath || "").toString().trim();
    if (!normalizedHashPath.startsWith("#")) return null;

    const routeHelper = global.RouteHelper;
    if (
      routeHelper?.parseHash &&
      routeHelper?.extractProfileHighlightContext &&
      routeHelper?.buildProfileHash
    ) {
      const parsed = routeHelper.parseHash(normalizedHashPath);
      const context = routeHelper.extractProfileHighlightContext(parsed.path);
      if (!context?.profileTarget || !context?.groupId) {
        return null;
      }

      return {
        profileHashPath: routeHelper.buildProfileHash(context.profileTarget),
        profileTarget: context.profileTarget,
        groupId: context.groupId,
        storyId: context.storyId || "",
      };
    }

    const rawPath = normalizedHashPath.slice(1);
    const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const segments = normalizedPath.split("/").filter(Boolean);
    if (segments.length < 4) return null;

    const profileTarget = stDecodeRouteSegment(segments[0] || "");
    const routeSegment = stDecodeRouteSegment(segments[1] || "").toLowerCase();
    const highlightSegment = stDecodeRouteSegment(
      segments[2] || "",
    ).toLowerCase();
    const groupSegment = stDecodeRouteSegment(segments[3] || "");

    if (
      !profileTarget ||
      routeSegment !== "stories" ||
      highlightSegment !== "highlight" ||
      !groupSegment
    ) {
      return null;
    }

    return {
      profileHashPath: `#/${encodeURIComponent(profileTarget)}`,
      profileTarget,
      groupId: groupSegment,
      storyId: "",
    };
  }

  function stExtractStoryIdFromHashPath(hashPath) {
    if (!stIsStoryHashRoute(hashPath)) return "";
    if (stExtractHighlightRouteContext(hashPath)) return "";
    if (stExtractProfileHighlightRouteContext(hashPath)) return "";

    const normalizedHashPath = (hashPath || "").toString().trim();
    const rawPath = normalizedHashPath.startsWith("#")
      ? normalizedHashPath.slice(1)
      : normalizedHashPath;
    const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (normalizedPath.startsWith("/profile")) return "";

    let rawStoryId = "";
    if (normalizedPath.startsWith(STORY_HASH_ROUTE_PREFIX)) {
      rawStoryId = normalizedPath.slice(STORY_HASH_ROUTE_PREFIX.length);
    } else if (normalizedPath.startsWith(STORY_HASH_ROUTE_LEGACY_PREFIX)) {
      rawStoryId = normalizedPath.slice(STORY_HASH_ROUTE_LEGACY_PREFIX.length);
    }
    if (!rawStoryId) return "";

    const firstSlash = rawStoryId.indexOf("/");
    const rawId = (
      firstSlash >= 0 ? rawStoryId.slice(0, firstSlash) : rawStoryId
    ).trim();
    if (!rawId) return "";

    try {
      return decodeURIComponent(rawId);
    } catch (_) {
      return rawId;
    }
  }

  function stBuildStoryHashPath(storyId) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId) return "#/home";
    return `#${STORY_HASH_ROUTE_PREFIX}${encodeURIComponent(normalizedStoryId)}`;
  }

  function stBuildProfileHighlightHashPath(profileHashPath, groupId) {
    const normalizedProfileHashPath =
      stExtractProfileHashPath(profileHashPath) || "";
    const normalizedGroupId = (groupId || "").toString().trim();
    if (!normalizedGroupId || !normalizedProfileHashPath)
      return normalizedProfileHashPath || "#/";
    return `${normalizedProfileHashPath}${STORY_HIGHLIGHT_PROFILE_ROUTE_SEGMENT}${encodeURIComponent(normalizedGroupId)}`;
  }

  function stBuildHighlightStoryHashPath(targetAccountId, groupId, storyId) {
    const normalizedTargetAccountId = (targetAccountId || "").toString().trim();
    const normalizedGroupId = (groupId || "").toString().trim();
    const normalizedStoryId = (storyId || "").toString().trim();

    if (!normalizedTargetAccountId || !normalizedGroupId) {
      return stBuildStoryHashPath(normalizedStoryId);
    }

    const basePath = `#${STORY_HIGHLIGHT_HASH_ROUTE_PREFIX}${encodeURIComponent(normalizedTargetAccountId)}/${encodeURIComponent(normalizedGroupId)}`;
    if (!normalizedStoryId) return basePath;
    return `${basePath}/${encodeURIComponent(normalizedStoryId)}`;
  }

  function stGetFallbackHashPath() {
    const lastSafeHashRaw = (global._lastSafeHash || "").toString().trim();
    const fallbackHash = lastSafeHashRaw || "#/home";
    const qIndex = fallbackHash.indexOf("?");
    const fallbackHashPath =
      qIndex >= 0 ? fallbackHash.slice(0, qIndex) : fallbackHash;
    return stIsStoryHashRoute(fallbackHashPath) ? "#/home" : fallbackHashPath;
  }

  function stGetBaseUrlWithoutStoryParam() {
    const { hashPath, hashParams } = stParseHash();
    hashParams.delete(STORY_URL_PARAM);
    hashParams.delete("storyAuthorId");

    const profileHighlightContext =
      stExtractProfileHighlightRouteContext(hashPath);
    const effectiveHashPath = profileHighlightContext?.profileHashPath
      ? profileHighlightContext.profileHashPath
      : stIsStoryHashRoute(hashPath)
        ? stGetFallbackHashPath()
        : hashPath;
    const base = global.location.pathname + global.location.search;
    return base + stBuildHashString(effectiveHashPath, hashParams);
  }

  function stSyncUrlStory(storyId) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId || !viewerState.shouldSyncUrl) return;
    if (!viewerState.baseUrl) {
      viewerState.baseUrl = stGetBaseUrlWithoutStoryParam();
    }
    const base = global.location.pathname + global.location.search;
    let nextHash = stBuildStoryHashPath(normalizedStoryId);

    if (stIsHighlightMode()) {
      const { hashPath } = stParseHashFromUrlString(viewerState.baseUrl);
      const profileHashPath =
        stExtractProfileHashPath(hashPath) ||
        stExtractProfileHashPath(stParseHash().hashPath) ||
        "";
      const profileUsername = (viewerState.author?.username || "")
        .toString()
        .trim();
      const resolvedProfileHashPath =
        profileHashPath || !profileUsername
          ? profileHashPath
          : global.RouteHelper?.buildProfileHash
            ? global.RouteHelper.buildProfileHash(profileUsername)
            : `#/${encodeURIComponent(profileUsername)}`;

      if (resolvedProfileHashPath) {
        nextHash = stBuildProfileHighlightHashPath(
          resolvedProfileHashPath,
          viewerState.highlightGroupId,
        );
      } else {
        nextHash = stBuildProfileHighlightHashPath(
          global.RouteHelper?.buildProfileHash
            ? global.RouteHelper.buildProfileHash("")
            : "#/",
          viewerState.highlightGroupId,
        );
      }
    }

    const nextUrl = base + nextHash;
    history.replaceState(history.state, "", nextUrl);
  }

  function stSyncUrlClose() {
    if (!viewerState.baseUrl) return;
    const { hashPath } = stParseHash();

    // If URL is currently in story route form, always restore pre-open URL.
    if (stIsStoryHashRoute(hashPath)) {
      history.replaceState(history.state, "", viewerState.baseUrl);
      viewerState.baseUrl = null;
      return;
    }

    // Compare current URL (without story params) to baseUrl.
    // If they match → normal close → restore baseUrl (remove ?storyId).
    // If they differ → user navigated to a new page → don't overwrite the new URL.
    const currentClean = stGetBaseUrlWithoutStoryParam();
    const baseClean = viewerState.baseUrl;
    if (currentClean !== baseClean) {
      // Hash path changed (user navigated away), don't overwrite
      viewerState.baseUrl = null;
      return;
    }
    history.replaceState(history.state, "", viewerState.baseUrl);
    viewerState.baseUrl = null;
  }

  function stMarkStoryReplyPreviewExpired(storyId) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId) return;

    const expiredElements = document.querySelectorAll(
      `.msg-story-reply-preview[data-story-id="${normalizedStoryId}"]`,
    );
    expiredElements.forEach((el) => {
      el.removeAttribute("onclick");
      el.removeAttribute("style");
      el.removeAttribute("data-story-id");
      el.className = "msg-story-reply-preview msg-story-reply-expired";
      el.innerHTML = `
          <div class="msg-story-reply-expired-icon"><i data-lucide="image-off"></i></div>
          <span>Story is no longer available</span>
        `;
      if (global.lucide && typeof global.lucide.createIcons === "function") {
        global.lucide.createIcons({ root: el });
      }
    });
  }

  async function stResolveStoryAuthorContextByStoryId(storyId) {
    const result = {
      authorId: "",
      notFound: false,
      forbidden: false,
      error: false,
    };

    const normalizedStoryId = stNormalizeId(storyId);
    if (!normalizedStoryId) {
      result.notFound = true;
      return result;
    }
    if (!stIsGuidLike(normalizedStoryId)) {
      result.notFound = true;
      return result;
    }

    if (viewerState.storyToAuthorCache.has(normalizedStoryId)) {
      result.authorId =
        viewerState.storyToAuthorCache.get(normalizedStoryId) || "";
      if (!result.authorId) {
        result.notFound = true;
      }
      return result;
    }
    if (!global.API?.Stories?.resolveByStoryId) {
      result.error = true;
      return result;
    }

    try {
      const resolveRes =
        await global.API.Stories.resolveByStoryId(normalizedStoryId);
      if (resolveRes?.status === 404) {
        result.notFound = true;
        return result;
      }
      if (resolveRes?.status === 403) {
        result.forbidden = true;
        return result;
      }
      if (!resolveRes?.ok) {
        result.error = true;
        return result;
      }

      const payload = await resolveRes.json().catch(() => null);
      const authorId = stReadString(payload, "authorId", "AuthorId", "").trim();
      if (!authorId) {
        result.notFound = true;
        return result;
      }

      stCacheStoryAuthor(normalizedStoryId, authorId);
      result.authorId = authorId;
      return result;
    } catch (_) {
      result.error = true;
      return result;
    }
  }

  async function stOpenViewerByStoryId(storyId, options = {}) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId) return STORY_OPEN_STATUS.ERROR;

    const resolveResult =
      await stResolveStoryAuthorContextByStoryId(normalizedStoryId);

    if (resolveResult.notFound) {
      if (options.redirectOnNotFound) {
        stNavigateToNotFoundRoute();
      } else if (typeof global.toastInfo === "function") {
        global.toastInfo("This story is no longer available.");
      }
      stMarkStoryReplyPreviewExpired(normalizedStoryId);
      return STORY_OPEN_STATUS.UNAVAILABLE;
    }

    if (resolveResult.forbidden) {
      if (typeof global.toastInfo === "function") {
        global.toastInfo("You no longer have permission to view this story.");
      }
      if (options.redirectOnForbidden) {
        const fallbackHashPath = stGetFallbackHashPath();
        if (global.RouteHelper?.goTo && global.RouteHelper?.parseHash) {
          const parsed = global.RouteHelper.parseHash(fallbackHashPath);
          global.RouteHelper.goTo(parsed.path, {
            query: parsed.params,
            replace: true,
          });
        } else {
          global.location.hash = fallbackHashPath;
        }
      }
      return STORY_OPEN_STATUS.UNAVAILABLE;
    }

    if (!resolveResult.authorId) {
      if (typeof global.toastError === "function") {
        global.toastError("Failed to resolve story route.");
      }
      return STORY_OPEN_STATUS.ERROR;
    }

    const openStatus = await stOpenViewerByAuthorId(resolveResult.authorId, {
      syncUrl: options.syncUrl !== false,
      startAtUnviewed: false,
      targetStoryId: normalizedStoryId,
    });

    if (
      openStatus !== STORY_OPEN_STATUS.SUCCESS &&
      options.redirectOnForbidden
    ) {
      if (typeof global.toastInfo === "function") {
        global.toastInfo("You no longer have permission to view this story.");
      }
      const fallbackHashPath = stGetFallbackHashPath();
      if (global.RouteHelper?.goTo && global.RouteHelper?.parseHash) {
        const parsed = global.RouteHelper.parseHash(fallbackHashPath);
        global.RouteHelper.goTo(parsed.path, {
          query: parsed.params,
          replace: true,
        });
      } else {
        global.location.hash = fallbackHashPath;
      }
    }

    return openStatus;
  }

  function stShowLoading() {
    stEnsureModal();
    if (viewerState.dom.content) {
      const existingShell = viewerState.dom.content.querySelector(
        ".sn-story-viewer-preview-shell:not(.snsv-preview-shell-leaving)",
      );

      if (existingShell) {
        const outgoingVideo = existingShell.querySelector("video");
        if (outgoingVideo && !outgoingVideo.paused) {
          try {
            outgoingVideo.pause();
          } catch (_) {}
        }

        const oldOverlay = existingShell.querySelector(
          ".sn-story-viewer-loading-overlay",
        );
        if (oldOverlay) oldOverlay.remove();

        const overlay = document.createElement("div");
        overlay.className = "sn-story-viewer-loading-overlay";
        overlay.innerHTML = '<div class="spinner spinner-medium"></div>';
        existingShell.appendChild(overlay);
      } else {
        viewerState.dom.content.innerHTML =
          '<div class="sn-story-viewer-loading"><div class="spinner spinner-medium"></div></div>';
      }
    }
    if (viewerState.dom.progress) {
      viewerState.dom.progress.innerHTML = "";
    }
    viewerState.progressPausedElapsedMs = 0;
    viewerState.isProgressPaused = false;
    if (viewerState.dom.insight) {
      viewerState.dom.insight.classList.add("sn-story-viewer-hidden");
      viewerState.dom.insight.innerHTML = "";
    }
    if (viewerState.dom.actions) {
      viewerState.dom.actions.classList.add("sn-story-viewer-hidden");
    }
    if (viewerState.dom.replyInput) {
      viewerState.dom.replyInput.value = "";
    }
    if (viewerState.dom.prevBtn) {
      viewerState.dom.prevBtn.classList.add("sn-story-viewer-hidden");
    }
    if (viewerState.dom.nextBtn) {
      viewerState.dom.nextBtn.classList.add("sn-story-viewer-hidden");
    }
  }

  async function stOpenArchiveViewerByAuthorId(
    normalizedAuthorId,
    options = {},
  ) {
    if (!viewerState.baseUrl) {
      viewerState.baseUrl = stGetBaseUrlWithoutStoryParam();
    }
    viewerState.shouldSyncUrl = options.syncUrl !== false;

    stEnsureModal();
    stShowLoading();

    viewerState.modal.classList.remove("sn-story-viewer-hidden");
    viewerState.isOpen = true;
    viewerState.markedStoryIds.clear();
    viewerState.requestId += 1;
    const requestId = viewerState.requestId;

    viewerState.storyMode = STORY_VIEW_MODE.ARCHIVE;
    viewerState.highlightTargetAccountId = "";
    viewerState.highlightGroupId = "";
    viewerState.highlightGroupName = "";
    viewerState.highlightOnRemoveStory = null;
    viewerState.archivePage = 0;
    viewerState.archivePageSize = Math.max(
      1,
      stParseInt(
        options.pageSize,
        global.APP_CONFIG?.PROFILE_ARCHIVED_STORIES_PAGE_SIZE || 12,
      ),
    );
    viewerState.archiveHasMore = Boolean(options.archiveHasMore);
    viewerState.archiveIsLoadingMore = false;
    viewerState.archiveLoadPromise = null;
    viewerState.archiveLoadMoreFn =
      typeof options.loadMoreArchiveStories === "function"
        ? options.loadMoreArchiveStories
        : null;

    viewerState.authorQueue = [];
    viewerState.authorQueueIndex = -1;
    viewerState.queueHasMore = false;
    viewerState.viewedAuthors = new Map();
    stPruneAuthorResumeMap([]);

    const targetStoryId = stNormalizeId(options.targetStoryId);
    const authorPayload = options.archiveAuthor || {};
    const rawStories = Array.isArray(options.archiveStories)
      ? options.archiveStories
      : [];
    const stories = rawStories
      .map(stResolveStoryItem)
      .filter((story) => !!story.storyId);

    if (requestId !== viewerState.requestId) {
      return STORY_OPEN_STATUS.ERROR;
    }

    if (!stories.length) {
      if (global.toastInfo) {
        global.toastInfo("This story is no longer available.");
      }
      stCloseViewer();
      return STORY_OPEN_STATUS.UNAVAILABLE;
    }

    viewerState.author = {
      accountId:
        authorPayload.accountId ??
        authorPayload.AccountId ??
        normalizedAuthorId,
      username:
        authorPayload.username ??
        authorPayload.Username ??
        localStorage.getItem("username") ??
        "",
      fullName:
        authorPayload.fullName ??
        authorPayload.FullName ??
        localStorage.getItem("fullname") ??
        "",
      avatarUrl:
        (authorPayload.avatarUrl ??
          authorPayload.AvatarUrl ??
          localStorage.getItem("avatarUrl") ??
          global.APP_CONFIG?.DEFAULT_AVATAR) ||
        "",
    };
    viewerState.stories = stories;
    stories.forEach((story) => {
      stCacheStoryAuthor(story.storyId, normalizedAuthorId);
    });
    viewerState.archivePage = Math.max(1, stParseInt(options.page, 1));

    const targetStoryIndex = targetStoryId
      ? stories.findIndex(
          (story) => stNormalizeId(story.storyId) === targetStoryId,
        )
      : -1;
    const resumeStoryId = stNormalizeId(options.resumeStoryId);
    const resumeStoryIndex = resumeStoryId
      ? stories.findIndex(
          (story) => stNormalizeId(story.storyId) === resumeStoryId,
        )
      : -1;

    if (targetStoryId && targetStoryIndex === -1) {
      if (global.toastInfo) {
        global.toastInfo("This story is no longer available.");
      }
      stCloseViewer();
      return STORY_OPEN_STATUS.UNAVAILABLE;
    }

    if (targetStoryIndex >= 0) {
      viewerState.currentIndex = targetStoryIndex;
    } else if (resumeStoryIndex >= 0) {
      viewerState.currentIndex = resumeStoryIndex;
    } else if (options.startAtLastStory) {
      viewerState.currentIndex = stories.length - 1;
    } else {
      viewerState.currentIndex = 0;
    }

    stRenderProgressBars(stories.length);
    stRenderCurrentStory(options.direction || "fade");
    return STORY_OPEN_STATUS.SUCCESS;
  }

  async function stOpenHighlightViewerByGroup(
    targetAccountId,
    groupId,
    options = {},
  ) {
    const normalizedTargetAccountId = (targetAccountId || "").toString().trim();
    const normalizedGroupId = (groupId || "").toString().trim();
    if (!normalizedTargetAccountId || !normalizedGroupId) {
      return STORY_OPEN_STATUS.ERROR;
    }

    if (!global.API?.Stories?.getHighlightGroupStories) {
      if (global.toastError) {
        global.toastError("Story highlight API is unavailable.");
      }
      return STORY_OPEN_STATUS.ERROR;
    }

    if (!viewerState.baseUrl) {
      viewerState.baseUrl = stGetBaseUrlWithoutStoryParam();
    }
    viewerState.shouldSyncUrl = options.syncUrl !== false;

    stEnsureModal();
    stShowLoading();

    viewerState.modal.classList.remove("sn-story-viewer-hidden");
    viewerState.isOpen = true;
    viewerState.markedStoryIds.clear();
    viewerState.requestId += 1;
    const requestId = viewerState.requestId;

    viewerState.storyMode = STORY_VIEW_MODE.HIGHLIGHT;
    viewerState.highlightTargetAccountId = normalizedTargetAccountId;
    viewerState.highlightGroupId = normalizedGroupId;
    viewerState.highlightGroupName = "";
    viewerState.highlightOnRemoveStory =
      typeof options.onRemoveCurrentStory === "function"
        ? options.onRemoveCurrentStory
        : null;

    viewerState.archivePage = 0;
    viewerState.archiveHasMore = false;
    viewerState.archiveIsLoadingMore = false;
    viewerState.archiveLoadPromise = null;
    viewerState.archiveLoadMoreFn = null;

    viewerState.authorQueue = [];
    viewerState.authorQueueIndex = -1;
    viewerState.queueHasMore = false;
    viewerState.viewedAuthors = new Map();
    stPruneAuthorResumeMap([]);

    try {
      let payload = options.prefetchedGroup || null;
      if (!payload) {
        const response = await global.API.Stories.getHighlightGroupStories(
          normalizedTargetAccountId,
          normalizedGroupId,
        );

        if (requestId !== viewerState.requestId) {
          return STORY_OPEN_STATUS.ERROR;
        }

        if (!response?.ok) {
          if (response?.status === 404 || response?.status === 403) {
            if (global.toastInfo) {
              global.toastInfo("This highlight group is no longer available.");
            }
            stCloseViewer();
            return STORY_OPEN_STATUS.UNAVAILABLE;
          }

          if (global.toastError) {
            global.toastError("Failed to load highlight stories.");
          }
          stCloseViewer();
          return STORY_OPEN_STATUS.ERROR;
        }

        payload = await response.json().catch(() => null);
      }

      if (requestId !== viewerState.requestId) {
        return STORY_OPEN_STATUS.ERROR;
      }

      const rawStories = Array.isArray(payload?.stories ?? payload?.Stories)
        ? (payload.stories ?? payload.Stories)
        : [];
      const stories = rawStories
        .map(stResolveStoryItem)
        .filter((story) => !!story.storyId);

      viewerState.highlightGroupName = (payload?.name ?? payload?.Name ?? "")
        .toString()
        .trim();

      if (!stories.length) {
        if (global.toastInfo) {
          global.toastInfo("This highlight group is no longer available.");
        }
        stCloseViewer();
        return STORY_OPEN_STATUS.UNAVAILABLE;
      }

      const highlightAuthor = options.highlightAuthor || {};
      viewerState.author = {
        accountId:
          highlightAuthor.accountId ??
          highlightAuthor.AccountId ??
          payload?.accountId ??
          payload?.AccountId ??
          normalizedTargetAccountId,
        username:
          highlightAuthor.username ??
          highlightAuthor.Username ??
          payload?.username ??
          payload?.Username ??
          "user",
        fullName:
          highlightAuthor.fullName ??
          highlightAuthor.FullName ??
          payload?.fullName ??
          payload?.FullName ??
          "",
        avatarUrl:
          (highlightAuthor.avatarUrl ??
            highlightAuthor.AvatarUrl ??
            payload?.avatarUrl ??
            payload?.AvatarUrl ??
            global.APP_CONFIG?.DEFAULT_AVATAR) ||
          "",
      };

      viewerState.stories = stories;
      stories.forEach((story) => {
        stCacheStoryAuthor(story.storyId, viewerState.author.accountId);
      });

      const targetStoryId = stNormalizeId(options.targetStoryId);
      const targetStoryIndex = targetStoryId
        ? stories.findIndex(
            (story) => stNormalizeId(story.storyId) === targetStoryId,
          )
        : -1;
      const resumeStoryId = stNormalizeId(options.resumeStoryId);
      const resumeStoryIndex = resumeStoryId
        ? stories.findIndex(
            (story) => stNormalizeId(story.storyId) === resumeStoryId,
          )
        : -1;

      if (targetStoryId && targetStoryIndex === -1) {
        if (global.toastInfo) {
          global.toastInfo("This story is no longer available in this group.");
        }
        stCloseViewer();
        return STORY_OPEN_STATUS.UNAVAILABLE;
      }

      if (targetStoryIndex >= 0) {
        viewerState.currentIndex = targetStoryIndex;
      } else if (resumeStoryIndex >= 0) {
        viewerState.currentIndex = resumeStoryIndex;
      } else {
        viewerState.currentIndex = 0;
      }

      stRenderProgressBars(stories.length);
      stRenderCurrentStory(options.direction || "fade");
      return STORY_OPEN_STATUS.SUCCESS;
    } catch (error) {
      if (requestId !== viewerState.requestId) {
        return STORY_OPEN_STATUS.ERROR;
      }
      if (global.toastError) {
        global.toastError("Failed to load highlight stories.");
      }
      stCloseViewer();
      return STORY_OPEN_STATUS.ERROR;
    }
  }

  async function stOpenViewerByAuthorId(authorId, options = {}) {
    const normalizedAuthorId = (authorId || "").toString().trim();
    if (!normalizedAuthorId) return STORY_OPEN_STATUS.ERROR;

    const requestedMode = stNormalizeStoryMode(options.storyMode);
    if (requestedMode === STORY_VIEW_MODE.ARCHIVE) {
      return stOpenArchiveViewerByAuthorId(normalizedAuthorId, options);
    }
    if (requestedMode === STORY_VIEW_MODE.HIGHLIGHT) {
      return stOpenHighlightViewerByGroup(
        options.highlightTargetAccountId || normalizedAuthorId,
        options.highlightGroupId,
        options,
      );
    }

    if (!global.API?.Stories?.getActiveByAuthor) {
      if (global.toastError) {
        global.toastError("Story API is unavailable.");
      }
      return STORY_OPEN_STATUS.ERROR;
    }

    if (!viewerState.baseUrl) {
      viewerState.baseUrl = stGetBaseUrlWithoutStoryParam();
    }
    viewerState.shouldSyncUrl = options.syncUrl !== false;

    stEnsureModal();
    stShowLoading();

    viewerState.modal.classList.remove("sn-story-viewer-hidden");
    viewerState.isOpen = true;
    viewerState.markedStoryIds.clear();
    viewerState.requestId += 1;
    const requestId = viewerState.requestId;

    viewerState.storyMode = STORY_VIEW_MODE.ACTIVE;
    viewerState.highlightTargetAccountId = "";
    viewerState.highlightGroupId = "";
    viewerState.highlightGroupName = "";
    viewerState.highlightOnRemoveStory = null;
    viewerState.archivePage = 0;
    viewerState.archiveHasMore = false;
    viewerState.archiveIsLoadingMore = false;
    viewerState.archiveLoadPromise = null;
    viewerState.archiveLoadMoreFn = null;

    // Initialize queue mode if options provide authorQueue
    if (options.authorQueue && !options._keepQueue) {
      viewerState.authorQueue = options.authorQueue;
      viewerState.queueHasMore = options.queueHasMore || false;
      viewerState.viewedAuthors = new Map();
      stPruneAuthorResumeMap(options.authorQueue);
      // Find index of this author in queue
      const qIdx = options.authorQueue.findIndex(
        (a) =>
          stNormalizeId(a?.accountId) === stNormalizeId(normalizedAuthorId),
      );
      viewerState.authorQueueIndex = qIdx >= 0 ? qIdx : 0;
    }

    try {
      const response =
        await global.API.Stories.getActiveByAuthor(normalizedAuthorId);
      if (requestId !== viewerState.requestId) {
        return STORY_OPEN_STATUS.ERROR;
      }

      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          if (global.toastInfo) {
            global.toastInfo("This story is no longer available.");
          }
          stSyncRingGlobally(normalizedAuthorId, "none");
          global.dispatchEvent(
            new CustomEvent("story:unavailable", {
              detail: { authorId: normalizedAuthorId },
            }),
          );
        } else if (global.toastError) {
          global.toastError("Failed to load story.");
        }
        // In queue mode: don't close viewer, just return (caller will skip)
        if (options._keepQueue) {
          viewerState.isOpen = true; // ensure stays open
          return response.status === 404 || response.status === 403
            ? STORY_OPEN_STATUS.UNAVAILABLE
            : STORY_OPEN_STATUS.ERROR;
        }
        stCloseViewer();
        return response.status === 404 || response.status === 403
          ? STORY_OPEN_STATUS.UNAVAILABLE
          : STORY_OPEN_STATUS.ERROR;
      }

      const payload = await response.json();
      const rawStories = Array.isArray(payload?.stories ?? payload?.Stories)
        ? (payload.stories ?? payload.Stories)
        : [];

      const stories = rawStories
        .map(stResolveStoryItem)
        .filter((story) => !!story.storyId);
      if (!stories.length) {
        if (global.toastInfo) {
          global.toastInfo("This story is no longer available.");
        }
        stSyncRingGlobally(normalizedAuthorId, "none");
        global.dispatchEvent(
          new CustomEvent("story:unavailable", {
            detail: { authorId: normalizedAuthorId },
          }),
        );
        // In queue mode: don't close viewer, just return (caller will skip)
        if (options._keepQueue) {
          viewerState.isOpen = true;
          return STORY_OPEN_STATUS.UNAVAILABLE;
        }
        stCloseViewer();
        return STORY_OPEN_STATUS.UNAVAILABLE;
      }

      viewerState.author = {
        accountId: payload.accountId ?? payload.AccountId ?? normalizedAuthorId,
        username: payload.username ?? payload.Username ?? "",
        fullName: payload.fullName ?? payload.FullName ?? "",
        avatarUrl:
          (payload.avatarUrl ??
            payload.AvatarUrl ??
            global.APP_CONFIG?.DEFAULT_AVATAR) ||
          "",
      };
      viewerState.stories = stories;
      stories.forEach((story) => {
        stCacheStoryAuthor(story.storyId, normalizedAuthorId);
      });

      const targetStoryId = stNormalizeId(options.targetStoryId);
      const targetStoryIndex = targetStoryId
        ? stories.findIndex(
            (story) => stNormalizeId(story.storyId) === targetStoryId,
          )
        : -1;
      const resumeStoryId = stNormalizeId(options.resumeStoryId);
      const resumeStoryIndex = resumeStoryId
        ? stories.findIndex(
            (story) => stNormalizeId(story.storyId) === resumeStoryId,
          )
        : -1;

      if (targetStoryId && targetStoryIndex === -1) {
        if (global.toastInfo) {
          global.toastInfo("This story is no longer available.");
        }
        stCloseViewer();

        const expiredElements = document.querySelectorAll(
          `.msg-story-reply-preview[data-story-id="${targetStoryId}"]`,
        );
        expiredElements.forEach((el) => {
          el.removeAttribute("onclick");
          el.removeAttribute("style");
          el.removeAttribute("data-story-id");
          el.className = "msg-story-reply-preview msg-story-reply-expired";
          el.innerHTML = `
            <div class="msg-story-reply-expired-icon"><i data-lucide="image-off"></i></div>
            <span>Story is no longer available</span>
          `;
          if (
            global.lucide &&
            typeof global.lucide.createIcons === "function"
          ) {
            global.lucide.createIcons({ root: el });
          }
        });
        return STORY_OPEN_STATUS.UNAVAILABLE;
      }

      const firstUnviewedIndex = stories.findIndex(
        (story) => !story.isViewedByCurrentUser,
      );
      const preferUnviewed = options.startAtUnviewed !== false;

      if (targetStoryIndex >= 0) {
        viewerState.currentIndex = targetStoryIndex;
      } else if (preferUnviewed && firstUnviewedIndex >= 0) {
        viewerState.currentIndex =
          resumeStoryIndex >= 0 && resumeStoryIndex <= firstUnviewedIndex
            ? resumeStoryIndex
            : firstUnviewedIndex;
      } else if (options.startAtLastStory) {
        // Keep legacy behavior only when author has no unseen story.
        viewerState.currentIndex = stories.length - 1;
      } else {
        viewerState.currentIndex = 0;
      }

      stRenderProgressBars(stories.length);
      stRenderCurrentStory(options.direction || "fade");

      // Render strip if in queue mode
      if (stHasQueue() && !options._keepQueue) {
        stRenderStrip();
      }
      return STORY_OPEN_STATUS.SUCCESS;
    } catch (error) {
      if (requestId !== viewerState.requestId) {
        return STORY_OPEN_STATUS.ERROR;
      }
      if (global.toastError) {
        global.toastError("Failed to load story.");
      }
      if (options._keepQueue) {
        viewerState.isOpen = true;
        return STORY_OPEN_STATUS.ERROR;
      }
      stCloseViewer();
      return STORY_OPEN_STATUS.ERROR;
    }
  }

  function stCloseViewer() {
    if (
      viewerState.dom.replyEmojiPicker &&
      viewerState.dom.replyEmojiPicker.classList.contains("show") &&
      global.EmojiUtils
    ) {
      global.EmojiUtils.closePicker(viewerState.dom.replyEmojiPicker);
    }

    stCloseViewersList();
    stStopProgressTimer();
    stPauseAnyVideo();
    stCloseMoreMenu();

    // Sync ring state for current author
    const authorId = viewerState.author?.accountId;
    if (authorId && !stIsOwnStory()) {
      if (stAllStoriesViewed()) {
        stSetViewedAuthorState(authorId, "seen");
        stSyncRingGlobally(authorId, "seen");
      }
    }

    // If in queue mode, sync ALL viewed authors' rings
    if (stHasQueue()) {
      stSyncAllRingsOnClose();
    }

    viewerState.requestId += 1;
    viewerState.isOpen = false;
    viewerState.storyMode = STORY_VIEW_MODE.ACTIVE;
    viewerState.highlightTargetAccountId = "";
    viewerState.highlightGroupId = "";
    viewerState.highlightGroupName = "";
    viewerState.highlightOnRemoveStory = null;
    viewerState.author = null;
    viewerState.stories = [];
    viewerState.currentIndex = 0;
    viewerState.shouldSyncUrl = true;
    viewerState.progressPausedElapsedMs = 0;
    viewerState.isProgressPaused = false;
    viewerState.markedStoryIds.clear();
    viewerState.authorResumeMap.clear();
    viewerState.archivePage = 0;
    viewerState.archiveHasMore = false;
    viewerState.archiveIsLoadingMore = false;
    viewerState.archiveLoadPromise = null;
    viewerState.archiveLoadMoreFn = null;

    // Reset queue state
    viewerState.authorQueue = [];
    viewerState.authorQueueIndex = -1;
    viewerState.queueHasMore = false;
    viewerState.viewedAuthors = new Map();

    if (viewerState.dom.privacy) {
      viewerState.dom.privacy.classList.remove("sn-story-viewer-hidden");
      viewerState.dom.privacy.innerHTML = "";
    }
    if (viewerState.dom.privacyDivider) {
      viewerState.dom.privacyDivider.classList.remove("sn-story-viewer-hidden");
    }

    // Remove strip and author-nav DOM
    if (viewerState.modal) {
      const strip = viewerState.modal.querySelector(
        ".sn-story-viewer-strip-wrapper",
      );
      if (strip) strip.remove();
      viewerState.modal
        .querySelectorAll(".sn-story-viewer-author-nav")
        .forEach((btn) => btn.remove());
      viewerState.modal.classList.add("sn-story-viewer-hidden");
    }

    stSyncUrlClose();
  }

  function stHandleKeydown(event) {
    if (!viewerState.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      stCloseViewer();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stGoNext();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stGoPrev();
    }
  }

  function stHandleFeedRingClick(event) {
    const ring = event.target.closest(
      ".post-avatar-ring.story-ring-unseen[data-story-author-id], .post-avatar-ring.story-ring-seen[data-story-author-id]",
    );
    if (!ring) return;

    const authorId = ring.getAttribute("data-story-author-id") || "";
    if (!authorId) return;

    event.preventDefault();
    event.stopPropagation();

    // Close profile-preview popup if it's open
    if (typeof global.hidePreview === "function") {
      global.hidePreview();
    }

    // Check if click is from story feed (home page) → enable queue mode
    const isFromFeed = !!ring.closest("#story-feed");
    const openOptions = { syncUrl: true, startAtUnviewed: true };

    if (isFromFeed && global.getStoryFeedQueue) {
      const feedData = global.getStoryFeedQueue();
      if (feedData.authors && feedData.authors.length > 1) {
        openOptions.authorQueue = feedData.authors;
        openOptions.queueHasMore = feedData.hasMore;
      }
    }

    stOpenViewerByAuthorId(authorId, openOptions);
  }

  function stIsGuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      (value || "").toString().trim(),
    );
  }

  function stNavigateToNotFoundRoute() {
    if (global.RouteHelper?.goTo) {
      const notFoundPath = global.RouteHelper.PATHS?.ERROR_404 || "/404";
      global.RouteHelper.goTo(notFoundPath, { replace: true });
      return;
    }
    global.location.hash = "#/404";
  }

  function stNavigateToProfileRoot(profileTarget) {
    const normalizedTarget = (profileTarget || "").toString().trim();
    if (global.RouteHelper?.goTo) {
      const path = global.RouteHelper.buildProfilePath
        ? global.RouteHelper.buildProfilePath(normalizedTarget)
        : normalizedTarget
          ? `/${encodeURIComponent(normalizedTarget)}`
          : "/";
      global.RouteHelper.goTo(path, { replace: true });
      return;
    }

    if (normalizedTarget) {
      global.location.hash = `#/${encodeURIComponent(normalizedTarget)}`;
      return;
    }
    global.location.hash = "#/";
  }

  async function stResolveHighlightTargetAccount(profileTarget) {
    const result = {
      accountId: "",
      notFound: false,
      error: false,
    };

    const normalizedProfileTarget = (profileTarget || "").toString().trim();
    if (!normalizedProfileTarget) {
      result.accountId = (localStorage.getItem("accountId") || "")
        .toString()
        .trim();
      return result;
    }

    if (stIsGuidLike(normalizedProfileTarget)) {
      result.accountId = normalizedProfileTarget;
      return result;
    }

    const currentAccountId = (localStorage.getItem("accountId") || "")
      .toString()
      .trim();
    const currentUsername = (localStorage.getItem("username") || "")
      .toString()
      .trim();
    if (
      currentUsername &&
      currentUsername.toLowerCase() === normalizedProfileTarget.toLowerCase()
    ) {
      result.accountId = currentAccountId || normalizedProfileTarget;
      return result;
    }

    if (!global.API?.Accounts?.getProfileByUsername) {
      result.error = true;
      return result;
    }

    try {
      const response = await global.API.Accounts.getProfileByUsername(
        normalizedProfileTarget,
      );
      if (response?.status === 404) {
        result.notFound = true;
        return result;
      }
      if (!response?.ok) {
        result.error = true;
        return result;
      }

      const payload = await response.json().catch(() => null);
      const accountInfo =
        payload?.accountInfo ||
        payload?.AccountInfo ||
        payload?.account ||
        payload?.Account ||
        {};
      result.accountId = (
        accountInfo.accountId ??
        accountInfo.AccountId ??
        accountInfo.id ??
        accountInfo.Id ??
        ""
      )
        .toString()
        .trim();
      if (!result.accountId) {
        result.notFound = true;
      }
      return result;
    } catch (_) {
      result.error = true;
      return result;
    }
  }

  async function stTryOpenFromUrl(options = {}) {
    try {
      const useSearchParam = options.useSearchParam !== false;
      const { hashPath, hashParams } = stParseHash();
      const lowerHashPath = (hashPath || "").toString().toLowerCase();
      const looksLikeProfileHighlightRoute =
        lowerHashPath.includes("/stories/highlight/") ||
        (lowerHashPath.startsWith("#/profile") &&
          lowerHashPath.includes("/highlight/"));
      const looksLikeLegacyHighlightRoute =
        lowerHashPath.startsWith("#/story/highlight/");

      const profileHighlightContext =
        stExtractProfileHighlightRouteContext(hashPath);
      if (looksLikeProfileHighlightRoute && !profileHighlightContext) {
        if (global.toastInfo) {
          global.toastInfo("Invalid highlight link.");
        }
        return;
      }

      if (
        profileHighlightContext?.groupId &&
        profileHighlightContext?.profileTarget
      ) {
        const resolveResult = await stResolveHighlightTargetAccount(
          profileHighlightContext.profileTarget,
        );
        if (resolveResult.notFound) {
          stNavigateToNotFoundRoute();
          return;
        }
        if (!resolveResult.accountId) {
          if (global.toastInfo) {
            global.toastInfo("Unable to open this highlight link right now.");
          }
          return;
        }

        const openStatus = await stOpenHighlightViewerByGroup(
          resolveResult.accountId,
          profileHighlightContext.groupId,
          {
            syncUrl: true,
            targetStoryId: profileHighlightContext.storyId || "",
          },
        );
        if (openStatus === STORY_OPEN_STATUS.UNAVAILABLE) {
          stNavigateToProfileRoot(profileHighlightContext.profileTarget);
        }
        return;
      }

      const highlightContext = stExtractHighlightRouteContext(hashPath);
      if (looksLikeLegacyHighlightRoute && !highlightContext) {
        if (global.toastInfo) {
          global.toastInfo("Invalid highlight link.");
        }
        return;
      }

      if (highlightContext?.targetAccountId && highlightContext?.groupId) {
        stOpenHighlightViewerByGroup(
          highlightContext.targetAccountId,
          highlightContext.groupId,
          {
            syncUrl: true,
            targetStoryId: highlightContext.storyId || "",
          },
        );
        return;
      }

      const storyIdFromPath = stExtractStoryIdFromHashPath(hashPath);
      const storyIdFromHashQuery = (
        hashParams.get(STORY_URL_PARAM) || ""
      ).trim();
      const storyIdFromSearch = useSearchParam
        ? (
            new URLSearchParams(global.location.search || "").get(
              STORY_URL_PARAM,
            ) || ""
          ).trim()
        : "";
      const storyId =
        storyIdFromPath || storyIdFromHashQuery || storyIdFromSearch;
      if (!storyId) return;
      const openedFromStoryPath = !!storyIdFromPath;
      await stOpenViewerByStoryId(storyId, {
        syncUrl: true,
        redirectOnNotFound: openedFromStoryPath,
        redirectOnForbidden: openedFromStoryPath,
      });
    } catch (_) {
      // Ignore deep-link parsing errors to avoid blocking page scripts.
    }
  }

  document.addEventListener("click", stHandleFeedRingClick, true);
  document.addEventListener("keydown", stHandleKeydown);
  global.addEventListener("hashchange", () =>
    stTryOpenFromUrl({ useSearchParam: false }),
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stTryOpenFromUrl);
  } else {
    stTryOpenFromUrl();
  }

  global.openStoryViewerByAuthorId = stOpenViewerByAuthorId;
  global.openStoryViewerByStoryId = stOpenViewerByStoryId;
  global.openStoryViewerByHighlightGroup = stOpenHighlightViewerByGroup;
  global.handleStoryHighlightPrivacyRealtime = stHandleHighlightPrivacyRealtime;
  global.closeStoryViewer = stCloseViewer;
  global.syncStoryRingState = stSyncRingGlobally;
})(window);
