(function () {
  "use strict";

  /* ─── author queue for story-list viewer ─── */
  const DEFAULT_FEED_INITIAL_LOAD_COUNT = 6;
  const DEFAULT_FEED_LOAD_MORE_PAGE_SIZE = 3;
  const DEFAULT_FEED_API_PAGE_SIZE = 15;
  const DEFAULT_FEED_MIN_SKELETON_MS = 300;
  const DEFAULT_FEED_ITEM_WIDTH_PX = 82;
  const DEFAULT_FEED_GAP_PX = 16;
  const DEFAULT_FEED_AVATAR_WRAPPER_SIZE_PX = 72;
  const DEFAULT_FEED_RING_AVATAR_SIZE_PX = 60;
  const DEFAULT_FEED_NAME_FONT_SIZE_PX = 13;
  const DEFAULT_FEED_ADD_BTN_SIZE_PX = 32;
  const DEFAULT_FEED_ADD_ICON_SIZE_PX = 18;
  const DEFAULT_FEED_NAV_TOP_PX = 52;
  const DEFAULT_FEED_FILL_MIN_COUNT = 5;
  const DEFAULT_FEED_FILL_MIN_SCALE = 0.92;
  const DEFAULT_FEED_FILL_MAX_SCALE = 1.22;
  const STORY_FEED_SIZING_VARIABLES = [
    "--story-feed-item-width",
    "--story-feed-gap",
    "--story-feed-avatar-wrapper-size",
    "--story-feed-ring-avatar-size",
    "--story-feed-name-max-width",
    "--story-feed-name-font-size",
    "--story-feed-add-btn-size",
    "--story-feed-add-icon-size",
    "--story-feed-nav-top",
  ];
  const QUICK_MOOD_STORY_CONFIG_FALLBACK = {
    options: {
      backgrounds: {
        accent: {},
      },
      textColors: {
        light: {},
        ink: {},
      },
      fonts: {
        modern: {},
      },
    },
    defaults: {
      backgroundColorKey: "accent",
      textColorKey: "light",
      fontTextKey: "modern",
      fontSizePx: 32,
    },
  };
  const STORY_QUICK_MOOD_PRESETS = [
    {
      id: "happy",
      emoji: "😄",
      accent: "#f59e0b",
      backgroundKeys: ["sun", "mango", "lemon", "accent"],
      textColorKeys: ["ink", "light"],
    },
    {
      id: "sad",
      emoji: "😢",
      accent: "#6366f1",
      backgroundKeys: ["royal", "midnight", "dusk", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "calm",
      emoji: "😌",
      accent: "#06b6d4",
      backgroundKeys: ["sky", "aqua", "cloud", "accent"],
      textColorKeys: ["ink", "light"],
    },
    {
      id: "grateful",
      emoji: "🙏",
      accent: "#10b981",
      backgroundKeys: ["emerald", "forest", "gold", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "excited",
      emoji: "🤩",
      accent: "#ec4899",
      backgroundKeys: ["fuchsia", "neon", "berry", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "sleepy",
      emoji: "😴",
      accent: "#8b5cf6",
      backgroundKeys: ["lavender", "twilight", "dusk", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "tired",
      emoji: "🥱",
      accent: "#64748b",
      backgroundKeys: ["slate", "graphite", "charcoal", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "love",
      emoji: "🥰",
      accent: "#ef4444",
      backgroundKeys: ["rose", "coral", "ruby", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "determined",
      emoji: "😤",
      accent: "#14b8a6",
      backgroundKeys: ["lagoon", "forest", "emerald", "accent"],
      textColorKeys: ["light", "ink"],
    },
    {
      id: "chill",
      emoji: "😎",
      accent: "#0ea5e9",
      backgroundKeys: ["ocean", "sky", "aqua", "accent"],
      textColorKeys: ["light", "ink"],
    },
  ];

  function parsePositiveInt(value, fallbackValue) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallbackValue;
    return parsed > 0 ? Math.trunc(parsed) : fallbackValue;
  }

  function parsePixelValue(value, fallbackValue = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  function clampNumber(value, minValue, maxValue) {
    if (!Number.isFinite(value)) return minValue;
    return Math.min(maxValue, Math.max(minValue, value));
  }

  function parseHexColor(value) {
    const normalized =
      typeof value === "string" ? value.trim().replace("#", "") : "";
    if (!normalized) return null;
    const hex =
      normalized.length === 3
        ? normalized
            .split("")
            .map((char) => char + char)
            .join("")
        : normalized;
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  function getRelativeLuminance(hexColor) {
    const rgb = parseHexColor(hexColor);
    if (!rgb) return null;
    const toLinear = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function getContrastRatio(foregroundHex, backgroundHex) {
    const foregroundLuminance = getRelativeLuminance(foregroundHex);
    const backgroundLuminance = getRelativeLuminance(backgroundHex);
    if (
      !Number.isFinite(foregroundLuminance) ||
      !Number.isFinite(backgroundLuminance)
    ) {
      return null;
    }

    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function resolveCssVariableValue(rawValue) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value || !value.startsWith("var(")) return value;

    const match = value.match(
      /^var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+?)\s*)?\)$/i,
    );
    if (!match) return value;

    const [, variableName, fallbackValue] = match;
    const resolved = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();

    return resolved || (fallbackValue ? fallbackValue.trim() : "");
  }

  function normalizeCssColorToken(rawValue) {
    const value = resolveCssVariableValue(rawValue);
    if (!value || !document?.createElement) return "";

    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = value;
    return probe.style.color ? probe.style.color.trim() : "";
  }

  function parseCssColor(value) {
    const normalized = normalizeCssColorToken(value);
    if (!normalized) return null;

    const rgbMatch = normalized.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
    );
    if (!rgbMatch) {
      return parseHexColor(normalized);
    }

    return {
      r: clampNumber(Number.parseFloat(rgbMatch[1]), 0, 255),
      g: clampNumber(Number.parseFloat(rgbMatch[2]), 0, 255),
      b: clampNumber(Number.parseFloat(rgbMatch[3]), 0, 255),
    };
  }

  function getCssColorLuminance(value) {
    const rgb = parseCssColor(value);
    if (!rgb) return null;

    const toLinear = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function getContrastRatioAgainstLuminance(foregroundHex, backgroundLuminance) {
    const foregroundLuminance = getRelativeLuminance(foregroundHex);
    if (
      !Number.isFinite(foregroundLuminance) ||
      !Number.isFinite(backgroundLuminance)
    ) {
      return null;
    }

    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function extractBackgroundColorLuminances(backgroundCss, fallbackColor) {
    const cssText = typeof backgroundCss === "string" ? backgroundCss : "";
    const resolvedCssText = cssText.replace(
      /var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+?)\s*)?\)/gi,
      (_, variableName, fallbackValue) => {
        const resolved = window
          .getComputedStyle(document.documentElement)
          .getPropertyValue(variableName)
          .trim();
        return resolved || (fallbackValue ? fallbackValue.trim() : "");
      },
    );

    const colorTokens = resolvedCssText.match(
      /#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})\b|rgba?\([^)]+\)/gi,
    );
    const luminances = (colorTokens || [])
      .map((token) => getCssColorLuminance(token))
      .filter((value) => Number.isFinite(value));

    if (luminances.length > 0) {
      return luminances;
    }

    const fallbackLuminance = getCssColorLuminance(fallbackColor);
    return Number.isFinite(fallbackLuminance) ? [fallbackLuminance] : [];
  }

  function toPixelValue(value) {
    return `${Math.max(0, value).toFixed(3)}px`;
  }

  const FEED_INITIAL_LOAD_COUNT = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_INITIAL_LOAD_COUNT,
    DEFAULT_FEED_INITIAL_LOAD_COUNT,
  );
  const FEED_LOAD_MORE_PAGE_SIZE = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_LOAD_MORE_PAGE_SIZE,
    DEFAULT_FEED_LOAD_MORE_PAGE_SIZE,
  );
  const FEED_API_PAGE_SIZE = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_API_PAGE_SIZE,
    DEFAULT_FEED_API_PAGE_SIZE,
  );
  const FEED_MIN_SKELETON_MS = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_MIN_SKELETON_MS,
    DEFAULT_FEED_MIN_SKELETON_MS,
  );

  let feedAuthorItems = [];
  let feedRenderItems = [];
  let feedLoadMorePage = 0;
  let feedHasMore = true;
  let feedIsLoadingMore = false;
  let feedNavActionInFlight = false;
  let feedResizeBound = false;
  let feedLanguageBound = false;
  let feedWindowStart = 0;
  let feedTransitionCleanupTimer = null;
  let feedQuickMoodPickerOpen = false;
  let feedQuickMoodSubmitting = false;
  let feedQuickMoodDismissBound = false;

  function normalizeAuthorId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function parseCount(value, fallbackValue = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function getObjectByKeys(source, keys) {
    if (!isPlainObject(source) || !Array.isArray(keys)) return null;
    for (const rawKey of keys) {
      const key = typeof rawKey === "string" ? rawKey.trim() : "";
      if (!key) continue;
      const value = source[key];
      if (isPlainObject(value)) return value;
    }
    return null;
  }

  function resolveConfigMap(collection, fallbackCollection) {
    return isPlainObject(collection) && Object.keys(collection).length > 0
      ? collection
      : fallbackCollection;
  }

  function resolveConfigKey(collection, preferredKeys, fallbackKey) {
    const map = isPlainObject(collection) ? collection : {};
    const candidates = Array.isArray(preferredKeys)
      ? preferredKeys
      : [preferredKeys];

    for (const rawKey of candidates) {
      const key =
        typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
      if (key && Object.prototype.hasOwnProperty.call(map, key)) {
        return key;
      }
    }

    const normalizedFallback =
      typeof fallbackKey === "string" ? fallbackKey.trim().toLowerCase() : "";
    if (
      normalizedFallback &&
      Object.prototype.hasOwnProperty.call(map, normalizedFallback)
    ) {
      return normalizedFallback;
    }

    const firstKey = Object.keys(map)[0];
    return typeof firstKey === "string" ? firstKey : "";
  }

  function getQuickMoodStoryConfig() {
    const rawConfig = isPlainObject(window.STORY_TEXT_EDITOR_CONFIG)
      ? window.STORY_TEXT_EDITOR_CONFIG
      : {};
    const rawOptions =
      getObjectByKeys(rawConfig, ["options", "styleOptions"]) || {};
    const rawDefaults =
      getObjectByKeys(rawConfig, ["defaults", "defaultStyle", "defaultStyles"]) ||
      {};
    const rawFontSize =
      getObjectByKeys(rawConfig, ["fontSize", "fontSizeConfig"]) || {};

    const backgrounds = resolveConfigMap(
      getObjectByKeys(rawOptions, [
        "backgrounds",
        "bgColors",
        "backgroundOptions",
      ]),
      QUICK_MOOD_STORY_CONFIG_FALLBACK.options.backgrounds,
    );
    const textColors = resolveConfigMap(
      getObjectByKeys(rawOptions, ["textColors", "colors", "textColorOptions"]),
      QUICK_MOOD_STORY_CONFIG_FALLBACK.options.textColors,
    );
    const fonts = resolveConfigMap(
      getObjectByKeys(rawOptions, ["fonts", "fontOptions", "fontFamilies"]),
      QUICK_MOOD_STORY_CONFIG_FALLBACK.options.fonts,
    );

    return {
      backgrounds,
      textColors,
      fonts,
      backgroundColorKey: resolveConfigKey(
        backgrounds,
        [
          rawDefaults.backgroundColorKey,
          rawDefaults.backgroundKey,
          rawDefaults.bgKey,
        ],
        QUICK_MOOD_STORY_CONFIG_FALLBACK.defaults.backgroundColorKey,
      ),
      textColorKey: resolveConfigKey(
        textColors,
        [rawDefaults.textColorKey, rawDefaults.colorKey],
        QUICK_MOOD_STORY_CONFIG_FALLBACK.defaults.textColorKey,
      ),
      fontTextKey: resolveConfigKey(
        fonts,
        [rawDefaults.fontTextKey, rawDefaults.fontKey],
        QUICK_MOOD_STORY_CONFIG_FALLBACK.defaults.fontTextKey,
      ),
      fontSizePx: parsePositiveInt(
        rawDefaults.fontSizePx ?? rawDefaults.fontSize ?? rawFontSize.default,
        QUICK_MOOD_STORY_CONFIG_FALLBACK.defaults.fontSizePx,
      ),
    };
  }

  function resolveQuickMoodTextColorKey(
    quickMoodConfig,
    preset,
    backgroundColorKey,
  ) {
    const textColors = quickMoodConfig?.textColors || {};
    const backgrounds = quickMoodConfig?.backgrounds || {};
    const lightKey = resolveConfigKey(
      textColors,
      ["light", "white", quickMoodConfig?.textColorKey],
      quickMoodConfig?.textColorKey,
    );
    const darkKey = resolveConfigKey(
      textColors,
      ["ink", "dark", "black", lightKey],
      lightKey,
    );

    if (!preset?.accent || !lightKey || lightKey === darkKey) {
      return lightKey || darkKey || quickMoodConfig?.textColorKey || "";
    }

    const backgroundOption = backgrounds[backgroundColorKey] || null;
    const backgroundLuminances = extractBackgroundColorLuminances(
      backgroundOption?.css || "",
      preset.accent,
    );
    const whiteContrastFloor = backgroundLuminances.reduce(
      (lowestContrast, luminance) => {
        const contrast = getContrastRatioAgainstLuminance("#ffffff", luminance);
        if (!Number.isFinite(contrast)) return lowestContrast;
        return Math.min(lowestContrast, contrast);
      },
      Number.POSITIVE_INFINITY,
    );

    if (
      !Number.isFinite(whiteContrastFloor) ||
      whiteContrastFloor >= 2.8
    ) {
      return lightKey;
    }

    return darkKey || lightKey;
  }

  function resolveHasMoreFromPayload(payload, page, pageSize, fallbackCount) {
    const totalPages = Number(payload?.totalPages ?? payload?.TotalPages);
    if (Number.isFinite(totalPages) && totalPages > 0) {
      return page < totalPages;
    }

    const totalItems = Number(payload?.totalItems ?? payload?.TotalItems);
    if (Number.isFinite(totalItems) && totalItems >= 0) {
      return page * pageSize < totalItems;
    }

    return fallbackCount >= pageSize;
  }

  function normalizeFeedItem(raw) {
    const defaultAvatar =
      window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    const activeStoryCount = parseCount(
      raw?.activeStoryCount ?? raw?.ActiveStoryCount,
      0,
    );

    return {
      accountId: normalizeAuthorId(raw?.accountId || raw?.AccountId || ""),
      avatarUrl: raw?.avatarUrl || raw?.AvatarUrl || defaultAvatar,
      username:
        raw?.username ||
        raw?.Username ||
        raw?.fullName ||
        raw?.FullName ||
        (window.I18n?.t
          ? window.I18n.t("common.labels.user", {}, "User")
          : "User"),
      fullName: raw?.fullName || raw?.FullName || "",
      isCurrentUser: !!(raw?.isCurrentUser || raw?.IsCurrentUser),
      storyRingState: raw?.storyRingState ?? raw?.StoryRingState ?? 0,
      activeStoryCount,
    };
  }

  function buildFeedDisplayItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((it) => normalizeFeedItem(it))
      .filter((it) => {
        if (!it.accountId) return false;
        // Keep current user for "Your Story" placeholder.
        if (it.isCurrentUser) return true;
        return it.activeStoryCount > 0;
      });
  }

  function getCurrentViewerStoryId() {
    return normalizeAuthorId(localStorage.getItem("accountId"));
  }

  function getYouStoryLabel() {
    return window.I18n?.t
      ? window.I18n.t("common.labels.you", {}, "You")
      : "You";
  }

  function refreshCurrentUserStoryLabels() {
    const nextLabel = getYouStoryLabel();
    [feedAuthorItems, feedRenderItems].forEach((items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item?.isCurrentUser) return;
        item.username = nextLabel;
      });
    });
  }

  function bindStoryFeedLanguageChange() {
    if (feedLanguageBound || !window.I18n?.onChange) return;
    feedLanguageBound = true;
    window.I18n.onChange(() => {
      refreshCurrentUserStoryLabels();
      refreshStoryFeedNavLocalization();
      renderCurrentStoryWindow("");
    });
  }

  function refreshStoryFeedNavLocalization() {
    const { prevBtn, nextBtn } = getStoryFeedElements();
    if (prevBtn) {
      prevBtn.setAttribute(
        "aria-label",
        window.I18n?.t
          ? window.I18n.t(
              "story.feed.previousStoriesAria",
              {},
              "Previous stories",
            )
          : "Previous stories",
      );
    }
    if (nextBtn) {
      nextBtn.setAttribute(
        "aria-label",
        window.I18n?.t
          ? window.I18n.t("story.feed.nextStoriesAria", {}, "Next stories")
          : "Next stories",
      );
    }
  }

  function buildOwnStoryPlaceholder(accountId) {
    return {
      accountId,
      avatarUrl:
        localStorage.getItem("avatarUrl") ||
        window.APP_CONFIG?.DEFAULT_AVATAR ||
        "assets/images/default-avatar.jpg",
      username: localStorage.getItem("username") || getYouStoryLabel(),
      fullName: "",
      isCurrentUser: true,
      storyRingState: 0,
      activeStoryCount: 0,
    };
  }

  function normalizeFeedRenderItems(items = feedRenderItems) {
    const seenIds = new Set();
    const normalized = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item?.accountId) return;
      const id = normalizeAuthorId(item.accountId);
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      normalized.push({
        ...item,
        accountId: id,
      });
    });
    return normalized;
  }

  function applyFeedRenderNormalization() {
    feedRenderItems = normalizeFeedRenderItems(feedRenderItems);
    return feedRenderItems;
  }

  function buildFeedVisualItems(items = feedRenderItems) {
    const normalizedItems = normalizeFeedRenderItems(items);
    return normalizedItems.map((item) => ({
      ...item,
      visualId: item.accountId,
      visualType: item.isCurrentUser ? "own-story" : "story",
    }));
  }

  function getQuickMoodPresetById(presetId) {
    const normalizedId =
      typeof presetId === "string" ? presetId.trim().toLowerCase() : "";
    return (
      STORY_QUICK_MOOD_PRESETS.find((preset) => preset.id === normalizedId) ||
      null
    );
  }

  function getQuickMoodLabel(presetId) {
    const preset = getQuickMoodPresetById(presetId);
    if (!preset) return "";
    return window.I18n?.t
      ? window.I18n.t(
          `story.feed.quickMood.${preset.id}.label`,
          {},
          preset.id,
        )
      : preset.id;
  }

  function getQuickMoodText(presetId, options = {}) {
    const preset = getQuickMoodPresetById(presetId);
    if (!preset) return "";
    const includeEmoji = options?.includeEmoji !== false;
    const text = window.I18n?.t
      ? window.I18n.t(`story.feed.quickMood.${preset.id}.text`, {}, preset.id)
      : preset.id;
    const normalizedText =
      typeof text === "string" ? text.trim() : text?.toString?.().trim() || "";
    if (!normalizedText) {
      return includeEmoji ? preset.emoji || "" : "";
    }
    if (!includeEmoji || !preset.emoji || normalizedText.includes(preset.emoji)) {
      return normalizedText;
    }
    return `${normalizedText} ${preset.emoji}`;
  }

  function getQuickMoodActionAria(presetId) {
    const label = getQuickMoodLabel(presetId);
    return window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.actionAria",
          { label },
          `Create a quick story for ${label}`,
        )
      : `Create a quick story for ${label}`;
  }

  function shouldShowQuickMoodFillers(windowState, visibleCount) {
    const actualCount = Array.isArray(windowState?.items)
      ? windowState.items.filter((item) => item?.visualType !== "quick-mood-more")
          .length
      : 0;
    const hasPrev = (windowState?.normalizedStart || 0) > 0;
    const hasLoadedNext =
      (windowState?.normalizedStart || 0) + visibleCount <
      (windowState?.allItems?.length || 0);
    const hasNext = hasLoadedNext || feedHasMore;
    const hasCurrentUser = (windowState?.items || []).some(
      (item) => item?.isCurrentUser,
    );

    return (
      visibleCount >= 2 &&
      hasCurrentUser &&
      !hasPrev &&
      !hasNext &&
      actualCount >= 1 &&
      actualCount < visibleCount
    );
  }

  function buildQuickMoodFillerItems(windowState, visibleCount) {
    if (!shouldShowQuickMoodFillers(windowState, visibleCount)) {
      return [];
    }

    const actualCount = (windowState?.items || []).length;
    const fillerSlotCount = Math.max(0, visibleCount - actualCount);
    if (!fillerSlotCount) {
      return [];
    }

    const quickMoodCount = Math.max(0, Math.min(fillerSlotCount - 1, 4));
    const quickMoodItems = STORY_QUICK_MOOD_PRESETS.slice(0, quickMoodCount).map(
      (preset) => ({
        visualId: `quick-mood::${preset.id}`,
        visualType: "quick-mood",
        presetId: preset.id,
        emoji: preset.emoji,
        accent: preset.accent,
      }),
    );

    return quickMoodItems.concat([
      {
        visualId: "quick-mood::more",
        visualType: "quick-mood-more",
        accent: "#3b82f6",
      },
    ]);
  }

  function buildStoryWindowDisplayItems(windowState) {
    const baseItems = Array.isArray(windowState?.items)
      ? windowState.items.slice()
      : [];
    const visibleCount = getVisibleWindowCount();
    const quickMoodItems = buildQuickMoodFillerItems(windowState, visibleCount);
    if (!quickMoodItems.length) {
      return baseItems;
    }
    return baseItems.concat(quickMoodItems);
  }

  function getVisibleWindowCount() {
    const { container } = getStoryFeedElements();
    if (!container) {
      return Math.max(1, FEED_INITIAL_LOAD_COUNT);
    }

    const visibleCount = resolveStoryFeedVisibleCount(container);
    return Math.max(1, Math.min(FEED_INITIAL_LOAD_COUNT, visibleCount));
  }

  function getStoryFeedAvailableWidth(container) {
    if (!container) return 0;

    const style = window.getComputedStyle(container);
    const paddingInline =
      parsePixelValue(style.paddingLeft) + parsePixelValue(style.paddingRight);
    const containerWidth = Math.ceil(container.clientWidth || 0);
    return Math.max(0, containerWidth - paddingInline);
  }

  function getStoryFeedBaseTrackWidth(itemCount) {
    if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
    return (
      itemCount * DEFAULT_FEED_ITEM_WIDTH_PX +
      Math.max(0, itemCount - 1) * DEFAULT_FEED_GAP_PX
    );
  }

  function shouldApplyStoryFeedSizing(renderedCount) {
    return renderedCount >= DEFAULT_FEED_FILL_MIN_COUNT;
  }

  function getStoryFeedScaleBounds() {
    return {
      minScale: DEFAULT_FEED_FILL_MIN_SCALE,
      maxScale: DEFAULT_FEED_FILL_MAX_SCALE,
      allowPartialFill: false,
    }
  }

  function resolveStoryFeedVisibleCount(container) {
    const availableWidth = getStoryFeedAvailableWidth(container);
    if (!availableWidth) {
      return Math.max(1, FEED_INITIAL_LOAD_COUNT);
    }

    const maxVisibleCount = Math.max(1, FEED_INITIAL_LOAD_COUNT);
    for (
      let candidateCount = maxVisibleCount;
      candidateCount >= DEFAULT_FEED_FILL_MIN_COUNT;
      candidateCount -= 1
    ) {
      const baseTrackWidth = getStoryFeedBaseTrackWidth(candidateCount);
      if (!baseTrackWidth) continue;

      const fillScale = availableWidth / baseTrackWidth;
      if (
        fillScale >= DEFAULT_FEED_FILL_MIN_SCALE &&
        fillScale <= DEFAULT_FEED_FILL_MAX_SCALE
      ) {
        return candidateCount;
      }
    }

    const measuredCount = Math.max(
      1,
      Math.floor(
        (availableWidth + DEFAULT_FEED_GAP_PX) /
          (DEFAULT_FEED_ITEM_WIDTH_PX + DEFAULT_FEED_GAP_PX),
      ),
    );

    return Math.max(1, Math.min(maxVisibleCount, measuredCount));
  }

  function clearStoryFeedSizing(shell) {
    if (!shell) return;
    STORY_FEED_SIZING_VARIABLES.forEach((variableName) => {
      shell.style.removeProperty(variableName);
    });
  }

  function applyStoryFeedSizing(renderedCount) {
    const { container, shell } = getStoryFeedElements();
    if (!container || !shell || !shouldApplyStoryFeedSizing(renderedCount)) {
      clearStoryFeedSizing(shell);
      return;
    }

    const availableWidth = getStoryFeedAvailableWidth(container);
    const baseTrackWidth = getStoryFeedBaseTrackWidth(renderedCount);
    if (!availableWidth || !baseTrackWidth) {
      clearStoryFeedSizing(shell);
      return;
    }

    const fillScale = availableWidth / baseTrackWidth;
    const { minScale, maxScale, allowPartialFill } =
      getStoryFeedScaleBounds(renderedCount);
    const scale = clampNumber(
      fillScale,
      minScale,
      maxScale,
    );

    if (!Number.isFinite(fillScale) || fillScale < minScale) {
      clearStoryFeedSizing(shell);
      return;
    }

    const avatarWrapperSize = DEFAULT_FEED_AVATAR_WRAPPER_SIZE_PX * scale;
    const nameFontSize = clampNumber(
      DEFAULT_FEED_NAME_FONT_SIZE_PX * scale,
      12,
      14,
    );
    const navTopBaseOffset =
      DEFAULT_FEED_NAV_TOP_PX - DEFAULT_FEED_AVATAR_WRAPPER_SIZE_PX / 2;

    shell.style.setProperty(
      "--story-feed-item-width",
      toPixelValue(DEFAULT_FEED_ITEM_WIDTH_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-gap",
      toPixelValue(DEFAULT_FEED_GAP_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-avatar-wrapper-size",
      toPixelValue(avatarWrapperSize),
    );
    shell.style.setProperty(
      "--story-feed-ring-avatar-size",
      toPixelValue(DEFAULT_FEED_RING_AVATAR_SIZE_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-name-max-width",
      toPixelValue(DEFAULT_FEED_ITEM_WIDTH_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-name-font-size",
      toPixelValue(nameFontSize),
    );
    shell.style.setProperty(
      "--story-feed-add-btn-size",
      toPixelValue(DEFAULT_FEED_ADD_BTN_SIZE_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-add-icon-size",
      toPixelValue(DEFAULT_FEED_ADD_ICON_SIZE_PX * scale),
    );
    shell.style.setProperty(
      "--story-feed-nav-top",
      toPixelValue(navTopBaseOffset + avatarWrapperSize / 2),
    );
  }

  function getFeedNavStep() {
    // Guard invalid config: step should not exceed visible window size.
    const visibleCount = getVisibleWindowCount();
    return Math.max(1, Math.min(FEED_LOAD_MORE_PAGE_SIZE, visibleCount));
  }

  function clampFeedWindowStart() {
    applyFeedRenderNormalization();
    const items = buildFeedVisualItems(feedRenderItems);
    const maxStart = Math.max(0, items.length - getVisibleWindowCount());
    feedWindowStart = Math.max(0, Math.min(feedWindowStart, maxStart));
    return { items, maxStart };
  }

  function getVisibleWindowItems() {
    const allItems = buildFeedVisualItems(feedRenderItems);
    const visibleCount = getVisibleWindowCount();
    const maxStart = Math.max(0, allItems.length - visibleCount);
    const normalizedStart = Math.max(0, Math.min(feedWindowStart, maxStart));
    const items = allItems.slice(
      normalizedStart,
      normalizedStart + visibleCount,
    );
    return {
      allItems,
      normalizedStart,
      maxStart,
      items,
    };
  }

  /**
   * Build queue from raw items array.
   * Excludes "Your Story" placeholder (no stories).
   */
  function buildAuthorQueue(items) {
    return buildFeedDisplayItems(items)
      .filter((it) => {
        const hasStories = it.activeStoryCount > 0;
        // Skip "Your Story" placeholder that has no stories
        if (it.isCurrentUser && !hasStories) return false;
        return hasStories && !!it.accountId;
      })
      .map((it) => ({
        accountId: it.accountId,
        avatarUrl: it.avatarUrl,
        username: it.username,
        isCurrentUser: it.isCurrentUser,
        storyRingState: it.storyRingState,
      }));
  }

  function upsertStoryFeedAuthor(rawAuthor, options = {}) {
    const queueItems = buildAuthorQueue([rawAuthor]);
    const displayItems = buildFeedDisplayItems([rawAuthor]);
    const normalizedId = normalizeAuthorId(
      rawAuthor?.accountId || rawAuthor?.AccountId || "",
    );
    if (!normalizedId) return;

    feedAuthorItems = feedAuthorItems.filter(
      (a) => a.accountId !== normalizedId,
    );
    feedRenderItems = feedRenderItems.filter(
      (a) => a.accountId !== normalizedId,
    );

    if (displayItems.length > 0) {
      const displayItem = displayItems[0];
      if (options.prepend) {
        feedRenderItems.unshift(displayItem);
      } else {
        feedRenderItems.push(displayItem);
      }
    }

    if (!queueItems.length) return;

    const author = queueItems[0];
    if (options.prepend) {
      feedAuthorItems.unshift(author);
      return;
    }
    feedAuthorItems.push(author);
  }

  /* ─── helpers ─── */
  function resolveStoryRingClass(storyRingState) {
    const s = (storyRingState ?? "").toString().trim().toLowerCase();
    if (storyRingState === 2 || s === "2" || s === "unseen")
      return "story-ring-unseen";
    if (storyRingState === 1 || s === "1" || s === "seen")
      return "story-ring-seen";
    return "";
  }

  function normalizeStoryRingStateValue(nextState) {
    const normalized = (nextState ?? "").toString().trim().toLowerCase();
    if (nextState === 2 || normalized === "2" || normalized === "unseen") {
      return 2;
    }
    if (nextState === 1 || normalized === "1" || normalized === "seen") {
      return 1;
    }
    return 0;
  }

  function syncStoryFeedRingState(authorId, nextState) {
    const id = normalizeAuthorId(authorId);
    if (!id) return false;

    const ringState = normalizeStoryRingStateValue(nextState);
    let changed = false;

    const renderIndex = feedRenderItems.findIndex(
      (item) => item.accountId === id,
    );
    if (
      renderIndex >= 0 &&
      feedRenderItems[renderIndex].storyRingState !== ringState
    ) {
      feedRenderItems[renderIndex] = {
        ...feedRenderItems[renderIndex],
        storyRingState: ringState,
      };
      changed = true;
    }

    const queueIndex = feedAuthorItems.findIndex(
      (item) => item.accountId === id,
    );
    if (
      queueIndex >= 0 &&
      feedAuthorItems[queueIndex].storyRingState !== ringState
    ) {
      feedAuthorItems[queueIndex] = {
        ...feedAuthorItems[queueIndex],
        storyRingState: ringState,
      };
      changed = true;
    }

    return changed;
  }

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ─── skeleton ─── */
  function renderSkeletons(container, count) {
    let html = "";
    for (let i = 0; i < count; i++) {
      const storyClass =
        i === 0 ? "story story-skeleton story-own" : "story story-skeleton";
      html += `
        <div class="${storyClass}">
          <div class="story-avatar-skeleton skeleton"></div>
          <div class="story-name-skeleton skeleton"></div>
        </div>`;
    }
    container.innerHTML = html;
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function ensureMinimumSkeletonDuration(startedAt) {
    const elapsed = Date.now() - startedAt;
    const remaining = FEED_MIN_SKELETON_MS - elapsed;
    if (remaining > 0) {
      await wait(remaining);
    }
  }

  /* ─── render ─── */
  function renderStoryItems(container, items) {
    if (!items || items.length === 0) {
      container.innerHTML = "";
      return;
    }

    const defaultAvatar =
      window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    const quickMoodMoreLabel = window.I18n?.t
      ? window.I18n.t("story.feed.quickMood.moreLabel", {}, "More")
      : "More";
    const quickMoodMoreAria = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.moreAria",
          {},
          "Open more quick story moods",
        )
      : "Open more quick story moods";
    let html = "";

    items.forEach((item) => {
      if (item?.visualType === "quick-mood") {
        const label = getQuickMoodLabel(item.presetId);
        html += `
          <button
            type="button"
            class="story story-quick-mood"
            data-preset-id="${escapeAttr(item.presetId)}"
            style="--story-quick-mood-color: ${escapeAttr(item.accent || "#3b82f6")}"
            aria-label="${escapeAttr(getQuickMoodActionAria(item.presetId))}"
            ${feedQuickMoodSubmitting ? "disabled" : ""}
          >
            <span class="story-avatar-wrapper story-quick-mood-wrapper" aria-hidden="true">
              <span class="story-quick-mood-ring">
                <span class="story-quick-mood-core">
                  <span class="story-quick-mood-emoji">${item.emoji || ""}</span>
                </span>
              </span>
            </span>
            <span class="story-name">${escapeAttr(label)}</span>
          </button>`;
        return;
      }

      if (item?.visualType === "quick-mood-more") {
        html += `
          <button
            type="button"
            class="story story-quick-mood story-quick-mood-more${feedQuickMoodPickerOpen ? " is-active" : ""}"
            aria-label="${escapeAttr(quickMoodMoreAria)}"
            ${feedQuickMoodSubmitting ? "disabled" : ""}
          >
            <span class="story-avatar-wrapper story-quick-mood-wrapper" aria-hidden="true">
              <span class="story-quick-mood-ring">
                <span class="story-quick-mood-core">
                  <span class="story-quick-mood-plus">+</span>
                </span>
              </span>
            </span>
            <span class="story-name">${escapeAttr(quickMoodMoreLabel)}</span>
          </button>`;
        return;
      }

      const avatarUrl = escapeAttr(item.avatarUrl || defaultAvatar);
      const isOwn = !!item.isCurrentUser;
      const hasStories = item.activeStoryCount > 0;

      /* ── Ring logic ── */
      let ringClass = "";
      if (isOwn) {
        ringClass = hasStories ? "story-ring-unseen" : "story-ring-none";
      } else {
        ringClass = resolveStoryRingClass(item.storyRingState);
      }

      const displayName = isOwn
        ? window.I18n?.t
          ? window.I18n.t("common.labels.you", {}, "You")
          : "You"
        : escapeAttr(item.username || item.fullName || "User");
      const dataAuthorAttr =
        ringClass && ringClass !== "story-ring-none"
          ? ` data-story-author-id="${escapeAttr(item.accountId)}"`
          : "";

      /* ── Button/Overlay logic cho Your story ── */
      let addBtnHtml = "";
      if (isOwn && !hasStories) {
        addBtnHtml = `
          <div class="story-add-overlay">
            <div class="story-add-center-btn">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 6V18M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>`;
      }

      html += `
        <div class="story ${isOwn ? "story-own" : ""}" data-account-id="${escapeAttr(item.accountId)}" data-has-stories="${hasStories}">
          <div class="story-avatar-wrapper">
            <a class="post-avatar-ring ${ringClass}"${dataAuthorAttr} href="javascript:void(0)">
              <img class="post-avatar" src="${avatarUrl}" alt="" loading="lazy">
            </a>
            ${addBtnHtml}
          </div>
          <span class="story-name">${displayName}</span>
        </div>`;
    });

    container.innerHTML = html;

    /* ── Event Listeners cho Your Story ── */
    container.querySelectorAll(".story-own").forEach((storyEl) => {
      const hasStories = storyEl.getAttribute("data-has-stories") === "true";

      storyEl.addEventListener("click", () => {
        if (hasStories) {
          // Nếu có story, click vào wrapper hoặc cả item sẽ mở story viewer
          // Mặc định post-avatar-ring có attribute data-story-author-id sẽ được story-viewer.js xử lý
          // Nhưng ta trigger thêm ở đây để đảm bảo click vào khoảng trống quanh avatar cũng chạy
          const ring = storyEl.querySelector(".post-avatar-ring");
          if (ring) ring.click();
        } else {
          // Nếu không có story, mở modal tạo mới
          if (window.openCreateStoryModal) {
            window.openCreateStoryModal();
          }
        }
      });
    });

    container
      .querySelectorAll(".story-quick-mood[data-preset-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const presetId = button.getAttribute("data-preset-id") || "";
          if (!presetId) return;
          confirmQuickMoodStory(presetId);
        });
      });

    container.querySelectorAll(".story-quick-mood-more").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (feedQuickMoodSubmitting) return;
        feedQuickMoodPickerOpen = !feedQuickMoodPickerOpen;
        renderQuickMoodPicker();
      });
    });
  }

  function getQuickMoodPopoverHtml() {
    const title = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.pickerTitle",
          {},
          "Create story quickly",
        )
      : "Create story quickly";
    const hint = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.pickerHint",
          {},
          "Pick a mood to post a text story instantly",
        )
      : "Pick a mood to post a text story instantly";

    const optionsHtml = STORY_QUICK_MOOD_PRESETS.map((preset) => {
      const label = getQuickMoodLabel(preset.id);
      return `
        <button
          type="button"
          class="story-quick-mood-option"
          data-preset-id="${escapeAttr(preset.id)}"
          style="--story-quick-mood-color: ${escapeAttr(preset.accent)}"
          aria-label="${escapeAttr(getQuickMoodActionAria(preset.id))}"
          ${feedQuickMoodSubmitting ? "disabled" : ""}
        >
          <span class="story-quick-mood-option-icon" aria-hidden="true">${preset.emoji}</span>
          <span class="story-quick-mood-option-copy">
            <span class="story-quick-mood-option-label">${escapeAttr(label)}</span>
            <span class="story-quick-mood-option-text">${escapeAttr(
              getQuickMoodText(preset.id, { includeEmoji: false }),
            )}</span>
          </span>
        </button>`;
    }).join("");

    return `
      <div class="story-quick-mood-popover-card">
        <div class="story-quick-mood-popover-head">
          <h3>${escapeAttr(title)}</h3>
          <p>${escapeAttr(hint)}</p>
        </div>
        <div class="story-quick-mood-popover-grid">${optionsHtml}</div>
      </div>`;
  }

  function ensureQuickMoodPickerDismissBinding() {
    if (feedQuickMoodDismissBound) return;
    feedQuickMoodDismissBound = true;

    document.addEventListener("click", (event) => {
      if (!feedQuickMoodPickerOpen) return;
      const { shell } = getStoryFeedElements();
      if (!shell) return;

      const popover = shell.querySelector(".story-quick-mood-popover");
      const moreButton = shell.querySelector(".story-quick-mood-more");
      const target = event.target;

      if (popover?.contains(target) || moreButton?.contains(target)) {
        return;
      }

      feedQuickMoodPickerOpen = false;
      renderQuickMoodPicker();
    });

    document.addEventListener("keydown", (event) => {
      if (!feedQuickMoodPickerOpen) return;
      if (event.key !== "Escape") return;
      feedQuickMoodPickerOpen = false;
      renderQuickMoodPicker();
    });
  }

  function renderQuickMoodPicker() {
    const { shell, container } = getStoryFeedElements();
    if (!shell) return;

    let popover = shell.querySelector(".story-quick-mood-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.className = "story-quick-mood-popover";
      popover.setAttribute("hidden", "hidden");
      shell.appendChild(popover);
    }

    container
      ?.querySelectorAll(".story-quick-mood-more")
      .forEach((button) =>
        button.classList.toggle("is-active", feedQuickMoodPickerOpen),
      );

    const pickerButton = container?.querySelector(".story-quick-mood-more");
    if (!feedQuickMoodPickerOpen || !pickerButton) {
      popover.innerHTML = "";
      popover.setAttribute("hidden", "hidden");
      return;
    }

    popover.innerHTML = getQuickMoodPopoverHtml();
    popover.removeAttribute("hidden");
    const popoverRect = popover.getBoundingClientRect();
    const pickerButtonRect = pickerButton.getBoundingClientRect();
    const pointerCenterX =
      pickerButtonRect.left -
      popoverRect.left +
      pickerButtonRect.width / 2;
    const boundedPointerCenterX = clampNumber(
      pointerCenterX,
      24,
      Math.max(24, popoverRect.width - 24),
    );
    popover.style.setProperty(
      "--story-quick-mood-tail-left",
      `${boundedPointerCenterX.toFixed(2)}px`,
    );

    popover
      .querySelectorAll(".story-quick-mood-option[data-preset-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const presetId = button.getAttribute("data-preset-id") || "";
          if (!presetId) return;
          confirmQuickMoodStory(presetId);
        });
      });
  }

  function confirmQuickMoodStory(presetId) {
    if (feedQuickMoodSubmitting) return;

    const preset = getQuickMoodPresetById(presetId);
    if (!preset) return;

    const label = getQuickMoodLabel(preset.id);
    const title = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.confirmTitle",
          {},
          "Create this story?",
        )
      : "Create this story?";
    const message = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.confirmMessage",
          { label },
          `This will create a quick story with the mood ${label}`,
        )
      : `This will create a quick story with the mood ${label}`;
    const confirmText = window.I18n?.t
      ? window.I18n.t(
          "story.feed.quickMood.confirmAction",
          {},
          "Create story",
        )
      : "Create story";
    const cancelText = window.I18n?.t
      ? window.I18n.t("common.buttons.cancel", {}, "Cancel")
      : "Cancel";

    feedQuickMoodPickerOpen = false;
    renderQuickMoodPicker();

    const onConfirm = () => {
      submitQuickMoodStory(preset.id);
    };

    if (window.ChatCommon?.showConfirm) {
      window.ChatCommon.showConfirm({
        title,
        message,
        confirmText,
        cancelText,
        isDanger: false,
        onConfirm,
      });
      return;
    }

    if (window.confirm(message)) {
      onConfirm();
    }
  }

  async function submitQuickMoodStory(presetId) {
    if (feedQuickMoodSubmitting) return;

    const preset = getQuickMoodPresetById(presetId);
    if (!preset) return;

    if (!window.API?.Stories?.create) {
      if (window.toastError) {
        window.toastError(
          window.I18n?.t
            ? window.I18n.t(
                "story.create.apiUnavailable",
                {},
                "Story API isn't available",
              )
            : "Story API isn't available",
        );
      }
      return;
    }

    feedQuickMoodSubmitting = true;
    feedQuickMoodPickerOpen = false;
    renderCurrentStoryWindow("");
    renderQuickMoodPicker();

    const quickMoodConfig = getQuickMoodStoryConfig();
    const resolvedBackgroundColorKey = resolveConfigKey(
      quickMoodConfig.backgrounds,
      preset.backgroundKeys,
      quickMoodConfig.backgroundColorKey,
    );
    const formData = new FormData();
    formData.append("ContentType", "2");
    formData.append("TextContent", getQuickMoodText(preset.id));
    formData.append(
      "BackgroundColorKey",
      resolvedBackgroundColorKey,
    );
    formData.append(
      "TextColorKey",
      resolveQuickMoodTextColorKey(
        quickMoodConfig,
        preset,
        resolvedBackgroundColorKey,
      ),
    );
    formData.append("FontTextKey", quickMoodConfig.fontTextKey);
    formData.append("FontSizeKey", String(quickMoodConfig.fontSizePx));
    formData.append("Privacy", "0");
    formData.append("ExpiresEnum", "24");

    try {
      const res = await window.API.Stories.create(formData);
      if (!res.ok) {
        if (window.toastError) {
          window.toastError(
            window.I18n?.t
              ? window.I18n.t(
                  "story.create.createFailed",
                  {},
                  "Failed to create story",
                )
              : "Failed to create story",
          );
        }
        return;
      }

      const story = await res.json().catch(() => null);
      if (window.toastSuccess) {
        window.toastSuccess(
          window.I18n?.t
            ? window.I18n.t(
                "story.create.createSuccess",
                {},
                "Story created successfully",
              )
            : "Story created successfully",
        );
      }
      window.dispatchEvent(new CustomEvent("story:created", { detail: story }));
    } catch (error) {
      console.error("submitQuickMoodStory failed:", error);
      if (window.toastError) {
        window.toastError(
          window.I18n?.t
            ? window.I18n.t(
                "story.create.serverUnavailable",
                {},
                "Can't connect to the server",
              )
            : "Can't connect to the server",
        );
      }
    } finally {
      feedQuickMoodSubmitting = false;
      renderCurrentStoryWindow("");
      renderQuickMoodPicker();
    }
  }

  function getStoryFeedElements() {
    const container = document.getElementById("story-feed");
    const shell = document.getElementById("story-feed-shell");
    if (!container || !shell)
      return { container: null, shell: null, prevBtn: null, nextBtn: null };
    return {
      container,
      shell,
      prevBtn: document.getElementById("storyFeedPrevBtn"),
      nextBtn: document.getElementById("storyFeedNextBtn"),
    };
  }

  function getStoryFeedScrollStep(container) {
    const configStep = parseCount(
      window.APP_CONFIG?.STORY_FEED_NAV_SCROLL_STEP_PX,
      0,
    );
    if (configStep > 0) return configStep;
    return Math.max(220, Math.round((container?.clientWidth || 0) * 0.82));
  }

  function getStoryTransitionShiftPx(container, shiftCount = 0) {
    if (!container) return 0;
    const normalizedShiftCount = Math.max(0, Math.trunc(shiftCount));
    if (!normalizedShiftCount) return 0;

    const storyEls = container.querySelectorAll(".story");
    if (!storyEls.length) {
      const fallbackUnit = Math.max(
        DEFAULT_FEED_ITEM_WIDTH_PX + DEFAULT_FEED_GAP_PX,
        Math.round((container.clientWidth || 0) * 0.72),
      );
      const fallbackShift = fallbackUnit * normalizedShiftCount;
      return Math.min(
        fallbackShift,
        Math.max(fallbackUnit, (container.clientWidth || fallbackShift) - 24),
      );
    }

    let unitStep = 0;
    if (storyEls.length > 1) {
      unitStep = storyEls[1].offsetLeft - storyEls[0].offsetLeft;
    }
    if (!unitStep || unitStep <= 0) {
      const firstRect = storyEls[0].getBoundingClientRect();
      const style = window.getComputedStyle(container);
      const rawGap = parseFloat(style.gap || style.columnGap || "16");
      const gap = Number.isFinite(rawGap) ? rawGap : 16;
      unitStep = Math.round(firstRect.width + gap);
    }

    const desiredShift = Math.max(unitStep, unitStep * normalizedShiftCount);
    const maxShift = Math.max(
      unitStep,
      (container.clientWidth || desiredShift) - 24,
    );
    return Math.min(desiredShift, maxShift);
  }

  function clearStoryFeedTransition(shell, container) {
    if (feedTransitionCleanupTimer) {
      clearTimeout(feedTransitionCleanupTimer);
      feedTransitionCleanupTimer = null;
    }
    if (shell) {
      const activeOverlay = shell.querySelector(".stories-transition-overlay");
      if (activeOverlay) activeOverlay.remove();
    }
    if (container) {
      container.classList.remove("stories-transitioning");
    }
  }

  function runStoryFeedTransition(
    container,
    direction,
    previousHtml = "",
    shiftCount = 0,
  ) {
    if (!container) return;
    const { shell } = getStoryFeedElements();
    clearStoryFeedTransition(shell, container);

    if (direction !== "next" && direction !== "prev") return;
    if (!shell || !previousHtml || !previousHtml.trim()) return;
    if (!shiftCount) return;

    const shiftPx = getStoryTransitionShiftPx(container, shiftCount);
    if (!shiftPx || shiftPx <= 0) return;

    const overlay = document.createElement("div");
    overlay.className = "stories-transition-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const oldTrack = document.createElement("div");
    oldTrack.className =
      "stories-transition-track stories-transition-track-old";
    oldTrack.innerHTML = previousHtml;

    const newTrack = document.createElement("div");
    newTrack.className =
      "stories-transition-track stories-transition-track-new";
    newTrack.innerHTML = container.innerHTML;

    const incomingFrom = direction === "next" ? shiftPx : -shiftPx;
    const outgoingTo = direction === "next" ? -shiftPx : shiftPx;

    oldTrack.style.transform = "translate3d(0,0,0)";
    oldTrack.style.opacity = "1";
    newTrack.style.transform = `translate3d(${incomingFrom}px,0,0)`;
    newTrack.style.opacity = "1";

    overlay.appendChild(oldTrack);
    overlay.appendChild(newTrack);
    shell.appendChild(overlay);
    container.classList.add("stories-transitioning");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        oldTrack.style.transform = `translate3d(${outgoingTo}px,0,0)`;
        oldTrack.style.opacity = "0.82";
        newTrack.style.transform = "translate3d(0,0,0)";
      });
    });

    const finish = () => {
      clearStoryFeedTransition(shell, container);
    };

    newTrack.addEventListener("transitionend", finish, { once: true });
    feedTransitionCleanupTimer = setTimeout(finish, 320);
  }

  function renderCurrentStoryWindow(direction = "", transitionOptions = {}) {
    const { container } = getStoryFeedElements();
    if (!container) return;
    const previousHtml =
      direction === "next" || direction === "prev" ? container.innerHTML : "";
    const shiftCount = Math.max(
      0,
      Math.trunc(transitionOptions.shiftCount || 0),
    );

    clampFeedWindowStart();
    const windowState = getVisibleWindowItems();
    const displayItems = buildStoryWindowDisplayItems(windowState);
    renderStoryItems(container, displayItems);
    applyStoryFeedSizing(displayItems.length);
    runStoryFeedTransition(container, direction, previousHtml, shiftCount);
    updateStoryFeedNavButtons();
    renderQuickMoodPicker();
  }

  async function ensureStoryWindowData(requiredItemsCount) {
    const targetCount = Math.max(0, requiredItemsCount);
    let guard = 0;
    while (feedHasMore) {
      const beforeCount = normalizeFeedRenderItems(feedRenderItems).length;
      if (beforeCount >= targetCount) break;

      const newAuthors = await loadMoreStoryFeedAuthors();
      const afterCount = normalizeFeedRenderItems(feedRenderItems).length;
      guard += 1;

      if ((newAuthors?.length || 0) === 0 && afterCount <= beforeCount) {
        break;
      }
      if (guard >= 20) {
        break;
      }
    }
  }

  function updateStoryFeedNavButtons() {
    const { container, shell, prevBtn, nextBtn } = getStoryFeedElements();
    if (!container || !shell || !prevBtn || !nextBtn) return;

    const renderedCount = container.querySelectorAll(".story").length;
    applyStoryFeedSizing(renderedCount);

    const { allItems, normalizedStart } = getVisibleWindowItems();
    const visibleCount = getVisibleWindowCount();
    const hasPrev = normalizedStart > 0;
    const hasLoadedNext = normalizedStart + visibleCount < allItems.length;
    const hasNext = hasLoadedNext || feedHasMore;
    prevBtn.classList.toggle("is-hidden", !hasPrev);
    nextBtn.classList.toggle("is-hidden", !hasNext);
    nextBtn.classList.toggle("is-loading", feedNavActionInFlight);
    shell.classList.toggle("stories-shell-scrollable", hasPrev || hasNext);
    refreshStoryFeedNavLocalization();
  }

  function bindStoryFeedNavigation() {
    const { container, prevBtn, nextBtn } = getStoryFeedElements();
    if (!container || !prevBtn || !nextBtn) return;

    ensureQuickMoodPickerDismissBinding();

    prevBtn.onclick = () => {
      if (feedNavActionInFlight) return;
      const step = getFeedNavStep();
      if (feedWindowStart <= 0) return;
      const previousStart = feedWindowStart;
      feedWindowStart = Math.max(0, feedWindowStart - step);
      renderCurrentStoryWindow("prev", {
        shiftCount: previousStart - feedWindowStart,
      });
    };

    nextBtn.onclick = async () => {
      if (feedNavActionInFlight) return;
      const step = getFeedNavStep();
      const visibleCount = getVisibleWindowCount();
      const targetStart = feedWindowStart + step;

      feedNavActionInFlight = true;
      updateStoryFeedNavButtons();
      try {
        await ensureStoryWindowData(targetStart + visibleCount);
      } finally {
        feedNavActionInFlight = false;
      }

      const { items } = clampFeedWindowStart();
      const maxStart = Math.max(0, items.length - visibleCount);
      const nextStart = Math.min(targetStart, maxStart);
      if (nextStart === feedWindowStart) {
        updateStoryFeedNavButtons();
        return;
      }

      const shiftCount = nextStart - feedWindowStart;
      feedWindowStart = nextStart;
      renderCurrentStoryWindow("next", { shiftCount });
    };

    if (!feedResizeBound) {
      window.addEventListener("resize", () => renderCurrentStoryWindow(""));
      feedResizeBound = true;
    }

    updateStoryFeedNavButtons();
  }

  /* ─── sync own story UI (no re-fetch) ─── */

  /**
   * Update current user story state in feed and re-render current window.
   * @param {boolean} hasStories – whether the current user now has active stories.
   */
  function syncOwnStoryUI(hasStories) {
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    if (!myId) return;

    const ownIndex = feedRenderItems.findIndex(
      (item) => item.accountId === myId,
    );
    if (ownIndex >= 0) {
      feedRenderItems[ownIndex] = {
        ...feedRenderItems[ownIndex],
        isCurrentUser: true,
        activeStoryCount: hasStories ? 1 : 0,
        storyRingState: hasStories ? 2 : 0,
      };
    } else {
      feedRenderItems.unshift({
        ...buildOwnStoryPlaceholder(myId),
        activeStoryCount: hasStories ? 1 : 0,
        storyRingState: hasStories ? 2 : 0,
      });
    }

    renderCurrentStoryWindow("");
  }

  /* ─── event listeners for real-time sync ─── */
  window.addEventListener("story:created", (event) => {
    const detail = event?.detail || {};
    syncOwnStoryUI(true);

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    if (!myId) return;

    upsertStoryFeedAuthor(
      {
        accountId: detail.accountId || detail.AccountId || myId,
        avatarUrl:
          detail.avatarUrl ||
          detail.AvatarUrl ||
          localStorage.getItem("avatarUrl") ||
          "",
        username:
          detail.username ||
          detail.Username ||
          localStorage.getItem("username") ||
          (window.I18n?.t
            ? window.I18n.t("common.labels.you", {}, "You")
            : "You"),
        isCurrentUser: true,
        activeStoryCount: Math.max(
          1,
          parseCount(detail.activeStoryCount ?? detail.ActiveStoryCount, 1),
        ),
        storyRingState: detail.storyRingState ?? detail.StoryRingState ?? 2,
      },
      { prepend: true },
    );
    updateStoryFeedNavButtons();
  });

  window.addEventListener("story:deleted", (e) => {
    const detail = e.detail || {};
    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    const authorId = normalizeAuthorId(detail.authorId || detail.AuthorId);
    const remainingRaw = detail.remainingCount ?? detail.RemainingCount;
    const hasRemainingInfo =
      remainingRaw !== undefined && remainingRaw !== null;
    const remaining = parseCount(remainingRaw, 0);

    if (authorId && authorId !== myId) {
      if (hasRemainingInfo && remaining <= 0) {
        removeStoryFeedAuthor(authorId);
        renderCurrentStoryWindow("");
        return;
      }
      updateStoryFeedNavButtons();
      return;
    }

    syncOwnStoryUI(remaining > 0);

    if (remaining > 0) {
      upsertStoryFeedAuthor(
        {
          accountId: myId,
          avatarUrl: localStorage.getItem("avatarUrl") || "",
          username:
            localStorage.getItem("username") ||
            (window.I18n?.t
              ? window.I18n.t("common.labels.you", {}, "You")
              : "You"),
          isCurrentUser: true,
          activeStoryCount: remaining,
          storyRingState: 2,
        },
        { prepend: true },
      );
      updateStoryFeedNavButtons();
      return;
    }

    if (hasRemainingInfo || authorId === myId) {
      removeStoryFeedAuthor(authorId || myId);
    }
    updateStoryFeedNavButtons();
  });

  window.addEventListener("story:unavailable", (e) => {
    const detail = e.detail || {};
    const authorId = normalizeAuthorId(detail.authorId || detail.AuthorId);
    if (!authorId) return;

    const container = document.getElementById("story-feed");
    if (!container) return;

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    removeStoryFeedAuthor(authorId);

    if (authorId === myId) {
      // Own story became unavailable → sync to "no stories" state
      syncOwnStoryUI(false);
      updateStoryFeedNavButtons();
      return;
    }

    // Other user's story became unavailable → remove from feed
    const storyEl = container.querySelector(
      `.story[data-account-id="${CSS.escape(authorId)}"]`,
    );
    if (!storyEl) return;

    storyEl.style.transition =
      "opacity 0.3s ease, transform 0.3s ease, max-width 0.3s ease";
    storyEl.style.opacity = "0";
    storyEl.style.transform = "scale(0.8)";
    storyEl.style.maxWidth = "0";
    storyEl.style.overflow = "hidden";

    storyEl.addEventListener("transitionend", () => storyEl.remove(), {
      once: true,
    });
    // Fallback removal in case transitionend never fires
    setTimeout(() => {
      if (storyEl.parentNode) storyEl.remove();
      updateStoryFeedNavButtons();
    }, 400);
  });

  /* ─── init ─── */
  async function initStoryFeed() {
    const container = document.getElementById("story-feed");
    if (!container) return;
    bindStoryFeedLanguageChange();

    feedNavActionInFlight = false;
    const skeletonStartedAt = Date.now();

    // Hiển thị skeleton ngay lập tức
    renderSkeletons(container, 7);

    try {
      const res = await API.Stories.getViewableAuthors(1, FEED_API_PAGE_SIZE);
      if (!res.ok) throw new Error("Failed to load story feed");

      const data = await res.json();
      const rawItems = data.items || data.Items || [];
      let items = Array.isArray(rawItems) ? rawItems.slice() : [];

      // Luôn đảm bảo "Your Story" ở đầu danh sách
      const myId = normalizeAuthorId(localStorage.getItem("accountId"));
      const hasCurrentUser = items.some(
        (it) => normalizeAuthorId(it.accountId || it.AccountId) === myId,
      );

      if (!hasCurrentUser && myId) {
        // User hiện tại không có story sống → tự tạo item "Your Story"
        const myAvatar = localStorage.getItem("avatarUrl") || "";
        items = [
          {
            accountId: myId,
            username: getYouStoryLabel(),
            fullName: "",
            avatarUrl: myAvatar,
            activeStoryCount: 0,
            unseenCount: 0,
            storyRingState: 0,
            isCurrentUser: true,
          },
          ...items,
        ];
      }

      feedRenderItems = buildFeedDisplayItems(items);
      feedWindowStart = 0;

      // Build author queue for story-list viewer
      feedAuthorItems = buildAuthorQueue(items);
      refreshCurrentUserStoryLabels();
      feedLoadMorePage = 1;
      feedHasMore = resolveHasMoreFromPayload(
        data,
        1,
        FEED_API_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );
      await ensureMinimumSkeletonDuration(skeletonStartedAt);
      bindStoryFeedNavigation();
      renderCurrentStoryWindow("");
    } catch (err) {
      await ensureMinimumSkeletonDuration(skeletonStartedAt);
      console.error("Story feed load failed:", err);
      container.innerHTML = "";
      updateStoryFeedNavButtons();
    }
  }

  /* ─── queue API for story-viewer ─── */

  /** Get current author queue + pagination state */
  function getStoryFeedQueue() {
    return {
      authors: feedAuthorItems.slice(), // shallow copy
      hasMore: feedHasMore,
    };
  }

  /** Fetch next page of authors and append to queue. Returns new items. */
  async function loadMoreStoryFeedAuthors() {
    if (feedIsLoadingMore || !feedHasMore) return [];
    feedIsLoadingMore = true;
    try {
      const nextPage = feedLoadMorePage + 1;
      const res = await API.Stories.getViewableAuthors(
        nextPage,
        FEED_API_PAGE_SIZE,
      );
      if (!res.ok) {
        feedHasMore = false;
        return [];
      }
      const data = await res.json();
      const rawItems = data.items || data.Items || [];
      feedHasMore = resolveHasMoreFromPayload(
        data,
        nextPage,
        FEED_API_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );

      const newAuthors = buildAuthorQueue(rawItems);
      const newRenderItems = buildFeedDisplayItems(rawItems).filter(
        (item) => item.activeStoryCount > 0 || item.isCurrentUser,
      );
      const existingIds = new Set(feedAuthorItems.map((a) => a.accountId));
      const uniqueAuthors = newAuthors.filter((author) => {
        if (!author?.accountId || existingIds.has(author.accountId)) {
          return false;
        }
        existingIds.add(author.accountId);
        return true;
      });

      feedAuthorItems = feedAuthorItems.concat(uniqueAuthors);
      newRenderItems.forEach((item) => {
        if (!item?.accountId) return;
        const existingIndex = feedRenderItems.findIndex(
          (existing) => existing.accountId === item.accountId,
        );
        if (existingIndex < 0) {
          feedRenderItems.push(item);
          return;
        }

        const existingItem = feedRenderItems[existingIndex];
        if (
          (existingItem?.activeStoryCount || 0) <= 0 &&
          (item?.activeStoryCount || 0) > 0
        ) {
          feedRenderItems[existingIndex] = {
            ...existingItem,
            ...item,
          };
        }
      });
      feedLoadMorePage = nextPage;
      return uniqueAuthors;
    } catch (_) {
      feedHasMore = false;
      return [];
    } finally {
      feedIsLoadingMore = false;
    }
  }

  /** Remove an author from the queue (e.g. stories became unavailable) */
  function removeStoryFeedAuthor(authorId) {
    const id = normalizeAuthorId(authorId);
    if (!id) return;
    feedAuthorItems = feedAuthorItems.filter((a) => a.accountId !== id);

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    if (id !== myId) {
      feedRenderItems = feedRenderItems.filter((a) => a.accountId !== id);
    }
  }

  /* ─── expose ─── */
  window.initStoryFeed = initStoryFeed;
  window.getStoryFeedQueue = getStoryFeedQueue;
  window.loadMoreStoryFeedAuthors = loadMoreStoryFeedAuthors;
  window.removeStoryFeedAuthor = removeStoryFeedAuthor;
  window.syncStoryFeedRingState = syncStoryFeedRingState;
})();
