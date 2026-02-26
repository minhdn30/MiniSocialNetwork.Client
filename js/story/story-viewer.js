(function (global) {
  const STORY_URL_PARAM = "storyId";
  const DEFAULT_STORY_DURATION_MS = 5000;
  const PROGRESS_TICK_MS = 50;
  const URL_STORY_RESOLVE_PAGE_SIZE = 20;
  const URL_STORY_RESOLVE_MAX_PAGES = 10;
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
    baseUrl: null,
    shouldSyncUrl: true,
    modal: null,
    dom: {},
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

  function stCurrentAccountId() {
    return stNormalizeId(localStorage.getItem("accountId"));
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
                <div class="sn-story-viewer-time" id="storyViewerTime"></div>
                <span class="sn-story-viewer-privacy" id="storyViewerPrivacy"></span>
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
            <div class="sn-story-viewer-reply-frame">
              <input
                id="storyViewerReplyInput"
                class="sn-story-viewer-reply-input"
                type="text"
                maxlength="500"
                placeholder="Reply to story..."
              />
              <button type="button" id="storyViewerReplySendBtn" class="sn-story-viewer-reply-send-btn" aria-label="Send reply">
                Send
              </button>
            </div>
            <div class="sn-story-viewer-react-frame" id="storyViewerReactFrame">
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="❤" aria-label="Heart">❤</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😂" aria-label="Laugh">😂</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😮" aria-label="Wow">😮</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😢" aria-label="Sad">😢</button>
              <button type="button" class="sn-story-viewer-react-btn" data-story-react="😡" aria-label="Angry">😡</button>
            </div>
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
      avatar: modal.querySelector("#storyViewerAvatar"),
      username: modal.querySelector("#storyViewerUsername"),
      time: modal.querySelector("#storyViewerTime"),
      content: modal.querySelector("#storyViewerContent"),
      insight: modal.querySelector("#storyViewerSelfInsight"),
      actions: modal.querySelector("#storyViewerActions"),
      replyInput: modal.querySelector("#storyViewerReplyInput"),
      replySendBtn: modal.querySelector("#storyViewerReplySendBtn"),
      reactFrame: modal.querySelector("#storyViewerReactFrame"),
      prevBtn: modal.querySelector("#storyViewerPrevBtn"),
      nextBtn: modal.querySelector("#storyViewerNextBtn"),
      moreBtn: modal.querySelector("#storyViewerMoreBtn"),
      moreMenu: modal.querySelector("#storyViewerMoreMenu"),
      privacy: modal.querySelector("#storyViewerPrivacy"),
    };

    modal.addEventListener("click", (event) => {
      const closeTrigger = event.target.closest(
        "[data-story-viewer-close='true']",
      );
      if (closeTrigger) {
        stCloseViewer();
      }
    });

    if (viewerState.dom.prevBtn) {
      viewerState.dom.prevBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stGoPrev();
      });
    }
    if (viewerState.dom.nextBtn) {
      viewerState.dom.nextBtn.addEventListener("click", (event) => {
        event.stopPropagation();
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

  function stUpdateProgressFill(progressRate) {
    if (!viewerState.dom.progress) return;

    const bars = viewerState.dom.progress.querySelectorAll(
      ".sn-story-viewer-progress-fill",
    );
    bars.forEach((bar, index) => {
      if (index < viewerState.currentIndex) {
        bar.style.width = "100%";
      } else if (index > viewerState.currentIndex) {
        bar.style.width = "0%";
      } else {
        const clamped = Math.max(0, Math.min(1, progressRate || 0));
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

    const bars = [];
    for (let index = 0; index < totalStories; index += 1) {
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

    if (totalStories <= 1) {
      prevBtn.classList.add("sn-story-viewer-hidden");
      nextBtn.classList.add("sn-story-viewer-hidden");
      return;
    }

    prevBtn.classList.toggle(
      "sn-story-viewer-hidden",
      viewerState.currentIndex <= 0,
    );
    nextBtn.classList.toggle(
      "sn-story-viewer-hidden",
      viewerState.currentIndex >= totalStories - 1,
    );
  }

  function stIsOwnStory() {
    return (
      stNormalizeId(viewerState.author?.accountId) === stCurrentAccountId()
    );
  }

  function stRenderViewerActions() {
    if (!viewerState.dom.actions) return;

    if (stIsOwnStory()) {
      viewerState.dom.actions.classList.add("sn-story-viewer-hidden");
      return;
    }

    viewerState.dom.actions.classList.remove("sn-story-viewer-hidden");
  }

  function stRenderSelfInsight(story) {
    if (!viewerState.dom.insight) return;

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

    const topViewersHtml = topViewers
      .slice(0, 3)
      .map((viewer) => {
        const username = viewer.username ?? viewer.Username ?? "user";
        const avatarUrl =
          viewer.avatarUrl ??
          viewer.AvatarUrl ??
          global.APP_CONFIG.DEFAULT_AVATAR;
        return `
          <div class="sn-story-viewer-top-viewer" title="${stEscapeAttr(username)}">
            <img class="sn-story-viewer-top-viewer-image" src="${stEscapeAttr(avatarUrl)}" alt="${stEscapeAttr(username)}">
          </div>
        `;
      })
      .join("");

    viewerState.dom.insight.classList.remove("sn-story-viewer-hidden");
    viewerState.dom.insight.innerHTML = `
      <div class="sn-story-viewer-self-total">${totalViews} views</div>
      <div class="sn-story-viewer-top-viewers">${topViewersHtml}</div>
    `;
  }

  function stHandleReplySubmit() {
    if (stIsOwnStory()) return;
    const inputEl = viewerState.dom.replyInput;
    if (!inputEl) return;

    const value = (inputEl.value || "").trim();
    if (!value) return;
    inputEl.value = "";

    if (typeof global.toastInfo === "function") {
      global.toastInfo("Story reply will be connected in the next step.");
    }
  }

  function stHandleQuickReact(emoji) {
    if (stIsOwnStory()) return;
    if (!emoji) return;
    if (typeof global.toastInfo === "function") {
      global.toastInfo(
        `Reacted ${emoji}. Story react will be connected in the next step.`,
      );
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
      // Privacy label
      const privacyLabels = { 0: "Public", 1: "Friends Only", 2: "Only Me" };
      const currentPrivacy = story?.privacy ?? 0;
      const currentLabel = privacyLabels[currentPrivacy] || "Public";

      menuHtml += `
        <button class="sn-story-viewer-menu-item" data-action="edit-privacy">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>
          </svg>
          <span>Edit Privacy</span>
        </button>
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
      case "report-story":
        stReportStory();
        break;
    }
  }

  function stShowPrivacyEditor() {
    const story = stCurrentStory();
    if (!story) return;

    stPauseProgressTimer();

    const currentPrivacy = story.privacy ?? 0;
    const options = [
      { value: 0, label: "Public", icon: "globe" },
      { value: 1, label: "Friends Only", icon: "users" },
      { value: 2, label: "Only Me", icon: "lock" },
    ];

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

    if (
      global.ChatCommon &&
      typeof global.ChatCommon.showConfirm === "function"
    ) {
      global.ChatCommon.showConfirm({
        title: "Delete Story",
        message:
          "Are you sure you want to delete this story? This action cannot be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
        isDanger: true,
        onConfirm: () => stDeleteStory(story),
        onCancel: () => stResumeProgressTimer(),
      });
    } else {
      // Fallback if ChatCommon not available
      if (confirm("Are you sure you want to delete this story?")) {
        stDeleteStory(story);
      } else {
        stResumeProgressTimer();
      }
    }
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

        if (!viewerState.stories.length) {
          // No more stories, close viewer and remove ring
          const authorId = viewerState.author?.accountId;
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
    const id = (authorId || "").toString().trim();
    if (!id) return;

    const selector = `.post-avatar-ring[data-story-author-id="${CSS.escape(id)}"]`;
    const rings = document.querySelectorAll(selector);

    rings.forEach((ring) => {
      ring.classList.remove("story-ring-unseen", "story-ring-seen");

      if (newState === "unseen") {
        ring.classList.add("story-ring-unseen");
      } else if (newState === "seen") {
        ring.classList.add("story-ring-seen");
      } else {
        // "none" → remove ring entirely
        ring.classList.remove("post-avatar-ring");
        ring.removeAttribute("data-story-author-id");
      }
    });
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
          stSyncRingGlobally(
            authorId,
            stAllStoriesViewed() ? "seen" : "unseen",
          );
        }
      }
    } catch (_) {
      // Ignore mark-view failures to avoid blocking viewer UX.
    }
  }

  function stRenderUnavailableContent(parentShell, reason) {
    const unavailableEl = document.createElement("div");
    unavailableEl.className = "sn-story-viewer-unavailable";
    unavailableEl.innerHTML = `
      <i data-lucide="eye-off" style="width:48px;height:48px;opacity:0.5;"></i>
      <p style="margin-top:12px;font-size:15px;opacity:0.7;">${reason || "This story is no longer available."}</p>
    `;
    parentShell.appendChild(unavailableEl);
    if (global.lucide) global.lucide.createIcons();
  }

  function stRenderStoryContent(story) {
    if (!viewerState.dom.content) return;

    viewerState.dom.content.innerHTML = "";
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
      viewerState.dom.content.appendChild(previewShell);
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
        const unmutedIcon = muteBtn.querySelector(".sn-story-mute-icon--unmuted");
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
          "This story could not be loaded.",
        );
        stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
      });

      previewShell.style.position = "relative";
      previewShell.appendChild(video);
      previewShell.appendChild(muteBtn);
      viewerState.dom.content.appendChild(previewShell);
      video.play().catch(() => {
        previewShell.innerHTML = "";
        stRenderUnavailableContent(
          previewShell,
          "This story could not be loaded.",
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
      viewerState.dom.content.appendChild(previewShell);
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
        "This story could not be loaded.",
      );
    });
    previewShell.appendChild(image);
    viewerState.dom.content.appendChild(previewShell);
    stStartProgressTimer(DEFAULT_STORY_DURATION_MS);
  }

  function stRenderCurrentStory() {
    const story = stCurrentStory();
    if (!story) {
      stCloseViewer();
      return;
    }

    stRenderNavButtons();

    if (viewerState.dom.avatar) {
      const avatarUrl =
        viewerState.author?.avatarUrl ||
        global.APP_CONFIG?.DEFAULT_AVATAR ||
        "";
      viewerState.dom.avatar.src = avatarUrl;
    }
    if (viewerState.dom.username) {
      viewerState.dom.username.textContent =
        viewerState.author?.username || viewerState.author?.fullName || "user";
    }
    if (viewerState.dom.time) {
      if (global.PostUtils?.timeAgo && story.createdAt) {
        viewerState.dom.time.textContent = global.PostUtils.timeAgo(
          story.createdAt,
        );
      } else {
        viewerState.dom.time.textContent = "";
      }
    }

    // Privacy icon
    if (viewerState.dom.privacy) {
      const privacy = story.privacy ?? 0;
      const iconName = global.PostUtils?.getPrivacyIconName
        ? global.PostUtils.getPrivacyIconName(privacy)
        : privacy === 2
          ? "lock"
          : privacy === 1
            ? "users"
            : "globe";
      viewerState.dom.privacy.innerHTML = `<i data-lucide="${stEscapeAttr(iconName)}"></i>`;
      if (global.lucide) global.lucide.createIcons();
    }

    stUpdateProgressFill(0);
    stRenderStoryContent(story);
    stSyncUrlStory(story.storyId);
  }

  function stGoNext() {
    if (!viewerState.isOpen) return;
    stCloseMoreMenu();
    if (viewerState.currentIndex >= viewerState.stories.length - 1) {
      stCloseViewer();
      return;
    }
    viewerState.currentIndex += 1;
    stRenderCurrentStory();
  }

  function stGoPrev() {
    if (!viewerState.isOpen) return;
    stCloseMoreMenu();
    if (viewerState.currentIndex <= 0) {
      return;
    }
    viewerState.currentIndex -= 1;
    stRenderCurrentStory();
  }

  /**
   * Parse the hash fragment into path + query params.
   * e.g. "#/messages?id=abc" → { hashPath: "#/messages", hashParams: URLSearchParams("id=abc") }
   */
  function stParseHash() {
    const raw = global.location.hash || "";
    const qIndex = raw.indexOf("?");
    if (qIndex === -1) {
      return { hashPath: raw, hashParams: new URLSearchParams() };
    }
    return {
      hashPath: raw.substring(0, qIndex),
      hashParams: new URLSearchParams(raw.substring(qIndex + 1)),
    };
  }

  function stBuildHashString(hashPath, hashParams) {
    const qs = hashParams.toString();
    return qs ? `${hashPath}?${qs}` : hashPath;
  }

  function stGetBaseUrlWithoutStoryParam() {
    const { hashPath, hashParams } = stParseHash();
    hashParams.delete(STORY_URL_PARAM);
    hashParams.delete("storyAuthorId");
    const base = global.location.pathname + global.location.search;
    return base + stBuildHashString(hashPath, hashParams);
  }

  function stSyncUrlStory(storyId) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId || !viewerState.shouldSyncUrl) return;
    if (!viewerState.baseUrl) {
      viewerState.baseUrl = stGetBaseUrlWithoutStoryParam();
    }
    const { hashPath, hashParams } = stParseHash();
    hashParams.set(STORY_URL_PARAM, normalizedStoryId);
    const base = global.location.pathname + global.location.search;
    const nextUrl = base + stBuildHashString(hashPath, hashParams);
    history.replaceState(history.state, "", nextUrl);
  }

  function stSyncUrlClose() {
    if (!viewerState.baseUrl) return;
    history.replaceState(history.state, "", viewerState.baseUrl);
    viewerState.baseUrl = null;
  }

  async function stResolveAuthorIdByStoryId(storyId) {
    const normalizedStoryId = stNormalizeId(storyId);
    if (!normalizedStoryId) return null;

    if (viewerState.storyToAuthorCache.has(normalizedStoryId)) {
      return viewerState.storyToAuthorCache.get(normalizedStoryId) || null;
    }
    if (
      !global.API?.Stories?.getViewableAuthors ||
      !global.API?.Stories?.getActiveByAuthor
    ) {
      return null;
    }

    let page = 1;
    while (page <= URL_STORY_RESOLVE_MAX_PAGES) {
      let authorsPayload = null;
      try {
        const authorsRes = await global.API.Stories.getViewableAuthors(
          page,
          URL_STORY_RESOLVE_PAGE_SIZE,
        );
        if (!authorsRes?.ok) return null;
        authorsPayload = await authorsRes.json().catch(() => null);
      } catch (_) {
        return null;
      }

      const authorItems = stReadArray(authorsPayload, "items", "Items");
      if (!authorItems.length) return null;

      for (const author of authorItems) {
        const authorId = stReadString(
          author,
          "accountId",
          "AccountId",
          "",
        ).trim();
        if (!authorId) continue;

        try {
          const activeRes =
            await global.API.Stories.getActiveByAuthor(authorId);
          if (!activeRes?.ok) continue;
          const activePayload = await activeRes.json().catch(() => null);
          const activeStories = stReadArray(
            activePayload,
            "stories",
            "Stories",
          );

          for (const item of activeStories) {
            const id = stNormalizeId(item?.storyId ?? item?.StoryId ?? "");
            if (!id) continue;
            viewerState.storyToAuthorCache.set(id, authorId);
          }

          if (
            viewerState.storyToAuthorCache.get(normalizedStoryId) === authorId
          ) {
            return authorId;
          }
        } catch (_) {
          // Skip inaccessible/expired author stories and continue lookup.
        }
      }

      const totalPagesRaw =
        authorsPayload?.totalPages ?? authorsPayload?.TotalPages;
      const totalPages = Number(totalPagesRaw);
      if (Number.isFinite(totalPages) && totalPages > 0 && page >= totalPages) {
        break;
      }
      page += 1;
    }

    return null;
  }

  async function stOpenViewerByStoryId(storyId, options = {}) {
    const normalizedStoryId = (storyId || "").toString().trim();
    if (!normalizedStoryId) return;

    const authorId = await stResolveAuthorIdByStoryId(normalizedStoryId);
    if (!authorId) {
      if (typeof global.toastInfo === "function") {
        global.toastInfo("Story is unavailable or you do not have permission.");
      }
      return;
    }

    await stOpenViewerByAuthorId(authorId, {
      syncUrl: options.syncUrl !== false,
      startAtUnviewed: false,
      targetStoryId: normalizedStoryId,
    });
  }

  function stShowLoading() {
    stEnsureModal();
    if (viewerState.dom.content) {
      viewerState.dom.content.innerHTML =
        '<div class="sn-story-viewer-loading"><div class="spinner spinner-medium"></div></div>';
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

  async function stOpenViewerByAuthorId(authorId, options = {}) {
    const normalizedAuthorId = (authorId || "").toString().trim();
    if (!normalizedAuthorId) return;
    if (!global.API?.Stories?.getActiveByAuthor) {
      if (global.toastError) {
        global.toastError("Story API is unavailable.");
      }
      return;
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

    try {
      const response =
        await global.API.Stories.getActiveByAuthor(normalizedAuthorId);
      if (requestId !== viewerState.requestId) {
        return;
      }

      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          if (global.toastInfo) {
            global.toastInfo("This story is no longer available.");
          }
          stSyncRingGlobally(normalizedAuthorId, "none");
        } else if (global.toastError) {
          global.toastError("Failed to load story.");
        }
        stCloseViewer();
        return;
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
        stCloseViewer();
        return;
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
        const normalizedStoryId = stNormalizeId(story.storyId);
        if (!normalizedStoryId) return;
        viewerState.storyToAuthorCache.set(
          normalizedStoryId,
          normalizedAuthorId,
        );
      });

      const targetStoryId = stNormalizeId(options.targetStoryId);
      const targetStoryIndex = targetStoryId
        ? stories.findIndex(
            (story) => stNormalizeId(story.storyId) === targetStoryId,
          )
        : -1;

      if (targetStoryIndex >= 0) {
        viewerState.currentIndex = targetStoryIndex;
      } else {
        const firstUnviewedIndex = stories.findIndex(
          (story) => !story.isViewedByCurrentUser,
        );
        const preferUnviewed = options.startAtUnviewed !== false;
        viewerState.currentIndex =
          preferUnviewed && firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0;
      }

      stRenderProgressBars(stories.length);
      stRenderCurrentStory();
    } catch (error) {
      if (requestId !== viewerState.requestId) {
        return;
      }
      if (global.toastError) {
        global.toastError("Failed to load story.");
      }
      stCloseViewer();
    }
  }

  function stCloseViewer() {
    stStopProgressTimer();
    stPauseAnyVideo();
    stCloseMoreMenu();
    // Sync ring state before clearing viewer state
    const authorId = viewerState.author?.accountId;
    if (authorId && !stIsOwnStory()) {
      if (stAllStoriesViewed()) {
        stSyncRingGlobally(authorId, "seen");
      }
      // If not all viewed, keep current ring state (don't change)
    }

    viewerState.requestId += 1;
    viewerState.isOpen = false;
    viewerState.author = null;
    viewerState.stories = [];
    viewerState.currentIndex = 0;
    viewerState.shouldSyncUrl = true;
    viewerState.progressPausedElapsedMs = 0;
    viewerState.isProgressPaused = false;
    viewerState.markedStoryIds.clear();

    if (viewerState.modal) {
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

    stOpenViewerByAuthorId(authorId, { syncUrl: true, startAtUnviewed: true });
  }

  function stTryOpenFromUrl() {
    const { hashParams } = stParseHash();
    const storyId = hashParams.get(STORY_URL_PARAM);
    if (!storyId) return;
    stOpenViewerByStoryId(storyId, { syncUrl: true });
  }

  document.addEventListener("click", stHandleFeedRingClick, true);
  document.addEventListener("keydown", stHandleKeydown);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stTryOpenFromUrl);
  } else {
    stTryOpenFromUrl();
  }

  global.openStoryViewerByAuthorId = stOpenViewerByAuthorId;
  global.openStoryViewerByStoryId = stOpenViewerByStoryId;
  global.closeStoryViewer = stCloseViewer;
  global.syncStoryRingState = stSyncRingGlobally;
})(window);
