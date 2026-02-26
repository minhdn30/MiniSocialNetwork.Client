const STORY_TEXT_CONFIG_FALLBACK = {
  options: {
    backgrounds: {
      accent: {
        label: "Accent",
        css: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 55%, var(--accent-active) 100%)",
      },
    },
    textColors: {
      light: { label: "Light", css: "#ffffff" },
      ink: { label: "Ink", css: "#0f172a" },
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

function csIsPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function csGetObjectByKeys(source, keys) {
  if (!csIsPlainObject(source) || !Array.isArray(keys)) return null;
  for (const rawKey of keys) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key) continue;
    const value = source[key];
    if (csIsPlainObject(value)) return value;
  }
  return null;
}

function csResolveConfigKey(collection, rawKey, fallbackKey) {
  const map = csIsPlainObject(collection) ? collection : {};
  const normalizeKey = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

  const directKey = normalizeKey(rawKey);
  if (directKey && Object.prototype.hasOwnProperty.call(map, directKey)) {
    return directKey;
  }

  const normalizedFallback = normalizeKey(fallbackKey);
  if (
    normalizedFallback &&
    Object.prototype.hasOwnProperty.call(map, normalizedFallback)
  ) {
    return normalizedFallback;
  }

  const firstKey = Object.keys(map)[0];
  return typeof firstKey === "string" ? firstKey : "";
}

function csToInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csNormalizeStoryTextConfig(rawConfig) {
  const sourceConfig = csIsPlainObject(rawConfig) ? rawConfig : {};
  const fallback = STORY_TEXT_CONFIG_FALLBACK;

  const rawOptions =
    csGetObjectByKeys(sourceConfig, ["options", "styleOptions"]) ||
    fallback.options;
  const rawBackgrounds = csGetObjectByKeys(rawOptions, [
    "backgrounds",
    "bgColors",
    "backgroundOptions",
  ]);
  const rawTextColors = csGetObjectByKeys(rawOptions, [
    "textColors",
    "colors",
    "textColorOptions",
  ]);
  const rawFonts = csGetObjectByKeys(rawOptions, [
    "fonts",
    "fontOptions",
    "fontFamilies",
  ]);

  const backgrounds =
    csIsPlainObject(rawBackgrounds) && Object.keys(rawBackgrounds).length > 0
      ? rawBackgrounds
      : fallback.options.backgrounds;
  const textColors =
    csIsPlainObject(rawTextColors) && Object.keys(rawTextColors).length > 0
      ? rawTextColors
      : fallback.options.textColors;
  const fonts =
    csIsPlainObject(rawFonts) && Object.keys(rawFonts).length > 0
      ? rawFonts
      : fallback.options.fonts;

  const rawFontSize =
    csGetObjectByKeys(sourceConfig, ["fontSize", "fontSizeConfig"]) ||
    fallback.fontSize;
  let minSize = csToInt(rawFontSize.min, fallback.fontSize.min);
  let maxSize = csToInt(rawFontSize.max, fallback.fontSize.max);
  if (minSize < 1) minSize = fallback.fontSize.min;
  if (maxSize < minSize) maxSize = minSize;

  let defaultFontSize = csToInt(rawFontSize.default, fallback.fontSize.default);
  if (defaultFontSize < minSize) defaultFontSize = minSize;
  if (defaultFontSize > maxSize) defaultFontSize = maxSize;

  const rawDefaults =
    csGetObjectByKeys(sourceConfig, [
      "defaults",
      "defaultStyle",
      "defaultStyles",
    ]) || fallback.defaults;
  const defaultBackgroundKey = csResolveConfigKey(
    backgrounds,
    rawDefaults.backgroundColorKey ??
      rawDefaults.backgroundKey ??
      rawDefaults.bgKey,
    fallback.defaults.backgroundColorKey,
  );
  const defaultTextColorKey = csResolveConfigKey(
    textColors,
    rawDefaults.textColorKey ?? rawDefaults.colorKey,
    fallback.defaults.textColorKey,
  );
  const defaultFontKey = csResolveConfigKey(
    fonts,
    rawDefaults.fontTextKey ?? rawDefaults.fontKey,
    fallback.defaults.fontTextKey,
  );

  let defaultFontSizePx = csToInt(
    rawDefaults.fontSizePx ?? rawDefaults.fontSize,
    defaultFontSize,
  );
  if (defaultFontSizePx < minSize) defaultFontSizePx = minSize;
  if (defaultFontSizePx > maxSize) defaultFontSizePx = maxSize;

  return {
    options: {
      backgrounds,
      textColors,
      fonts,
    },
    fontSize: {
      min: minSize,
      max: maxSize,
      default: defaultFontSize,
    },
    defaults: {
      backgroundColorKey: defaultBackgroundKey,
      textColorKey: defaultTextColorKey,
      fontTextKey: defaultFontKey,
      fontSizePx: defaultFontSizePx,
    },
  };
}

const STORY_TEXT_EDITOR_CONFIG = csNormalizeStoryTextConfig(
  window.STORY_TEXT_EDITOR_CONFIG,
);
const STORY_TEXT_STYLE_OPTIONS = STORY_TEXT_EDITOR_CONFIG.options;
const STORY_TEXT_FONT_SIZE = STORY_TEXT_EDITOR_CONFIG.fontSize;
const STORY_TEXT_STYLE_DEFAULTS = STORY_TEXT_EDITOR_CONFIG.defaults;

const STORY_TEXT_MAX_LENGTH_FALLBACK = 1000;
const STORY_TEXT_MAX_LENGTH =
  Number(window.APP_CONFIG?.MAX_STORY_TEXT_LENGTH) > 0
    ? Math.floor(Number(window.APP_CONFIG.MAX_STORY_TEXT_LENGTH))
    : STORY_TEXT_MAX_LENGTH_FALLBACK;

const createStoryModalState = {
  isInitialized: false,
  isSubmitting: false,
  currentStep: "mode", // "mode" | "editor"
  storyMode: null, // "text" | "media"
  selectedFile: null,
  mediaContentType: null, // 0=image, 1=video
  previewObjectUrl: null,
  documentEventsBound: false,
  isPaletteRendered: false,
  isMediaPaletteRendered: false,

  backgroundColorKey: STORY_TEXT_STYLE_DEFAULTS.backgroundColorKey,
  textColorKey: STORY_TEXT_STYLE_DEFAULTS.textColorKey,
  fontTextKey: STORY_TEXT_STYLE_DEFAULTS.fontTextKey,
  fontSizePx: STORY_TEXT_STYLE_DEFAULTS.fontSizePx,

  mediaBgKey: null, // current bg key for media stories

  privacy: 0,
  expires: 24,
  activeDropdown: null,
  lastTextSelectionRange: null,
};

function csGetElements() {
  return {
    modal: document.getElementById("createStoryModal"),
    modeStep: document.getElementById("createStoryModeStep"),
    editorStep: document.getElementById("createStoryEditorStep"),
    modeChoiceButtons: Array.from(
      document.querySelectorAll(
        "#createStoryModal .create-story-mode-choice-btn",
      ),
    ),
    submitBtn: document.getElementById("createStorySubmitBtn"),
    backBtn: document.getElementById("createStoryBackBtn"),
    closeBtn: document.querySelector(
      "#createStoryModal .create-story-close-btn",
    ),
    cancelBtn: document.querySelector(
      "#createStoryModal .create-story-cancel-btn",
    ),

    mediaSection: document.getElementById("createStoryMediaSection"),
    textSection: document.getElementById("createStoryTextSection"),
    mediaInput: document.getElementById("createStoryMediaInput"),
    mediaBgPalette: document.getElementById("createStoryMediaBgPalette"),
    mediaBgButtons: Array.from(
      document.querySelectorAll("#createStoryModal .create-story-media-bg-btn"),
    ),
    uploadBtn: document.getElementById("createStoryUploadBtn"),
    textCount: document.getElementById("createStoryTextCount"),
    textMaxCount: document.getElementById("createStoryTextMaxCount"),

    previewHint: document.getElementById("createStoryPreviewHint"),
    previewEmpty: document.getElementById("createStoryPreviewEmpty"),
    imagePreview: document.getElementById("createStoryImagePreview"),
    videoPreview: document.getElementById("createStoryVideoPreview"),
    editorContainer: document.getElementById("createStoryMediaEditorContainer"),
    textPreview: document.getElementById("createStoryTextPreview"),
    textEditor: document.getElementById("createStoryTextEditor"),

    backgroundPalette: document.getElementById("createStoryBackgroundPalette"),
    textColorPalette: document.getElementById("createStoryTextColorPalette"),
    backgroundButtons: Array.from(
      document.querySelectorAll("#createStoryModal .create-story-bg-btn"),
    ),
    textColorButtons: Array.from(
      document.querySelectorAll("#createStoryModal .create-story-color-btn"),
    ),
    fontButtons: Array.from(
      document.querySelectorAll(
        "#createStoryModal .create-story-pill-btn[data-font-key]",
      ),
    ),

    fontSizeRange: document.getElementById("createStoryFontSizeRange"),
    fontSizeNumber: document.getElementById("createStoryFontSizeNumber"),

    emojiBtn: document.getElementById("createStoryEmojiBtn"),
    emojiPickerContainer: document.getElementById(
      "createStoryEmojiPickerContainer",
    ),

    privacySelector: document.getElementById("csPrivacySelector"),
    expiresSelector: document.getElementById("csExpiresSelector"),
    privacyDropdown: document.getElementById("csPrivacyDropdown"),
    expiresDropdown: document.getElementById("csExpiresDropdown"),
  };
}

function csResolveStyleKey(collection, rawKey, fallbackKey) {
  return csResolveConfigKey(collection, rawKey, fallbackKey);
}

function csClampFontSize(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (Number.isNaN(parsed)) return STORY_TEXT_FONT_SIZE.default;
  return Math.min(
    STORY_TEXT_FONT_SIZE.max,
    Math.max(STORY_TEXT_FONT_SIZE.min, parsed),
  );
}

function csGetResolvedTextStyle() {
  return {
    backgroundColorKey: csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.backgrounds,
      createStoryModalState.backgroundColorKey,
      STORY_TEXT_STYLE_DEFAULTS.backgroundColorKey,
    ),
    textColorKey: csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.textColors,
      createStoryModalState.textColorKey,
      STORY_TEXT_STYLE_DEFAULTS.textColorKey,
    ),
    fontTextKey: csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.fonts,
      createStoryModalState.fontTextKey,
      STORY_TEXT_STYLE_DEFAULTS.fontTextKey,
    ),
    fontSizePx: csClampFontSize(createStoryModalState.fontSizePx),
  };
}

function csGetRawTextContent() {
  const { textEditor } = csGetElements();
  if (!textEditor) return "";
  return (textEditor.textContent || "").replace(/\r/g, "");
}

function csGetTrimmedTextContent() {
  return csGetRawTextContent().trim();
}

function csMoveCaretToEnd(element) {
  if (!element) return;
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  createStoryModalState.lastTextSelectionRange = range.cloneRange();
}

function csIsNodeInsideEditor(node, editor) {
  if (!node || !editor) return false;
  return node === editor || editor.contains(node);
}

function csSaveTextSelection() {
  const { textEditor } = csGetElements();
  if (!textEditor) return;
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (
    csIsNodeInsideEditor(range.startContainer, textEditor) &&
    csIsNodeInsideEditor(range.endContainer, textEditor)
  ) {
    createStoryModalState.lastTextSelectionRange = range.cloneRange();
  }
}

function csInsertTextAtCursor(insertText) {
  const text = typeof insertText === "string" ? insertText : "";
  if (!text) return false;

  const { textEditor } = csGetElements();
  if (!textEditor) return false;
  textEditor.focus();

  const selection = window.getSelection?.();
  let range = null;

  if (
    selection &&
    selection.rangeCount > 0 &&
    csIsNodeInsideEditor(selection.getRangeAt(0).startContainer, textEditor)
  ) {
    range = selection.getRangeAt(0);
  } else if (
    createStoryModalState.lastTextSelectionRange &&
    csIsNodeInsideEditor(
      createStoryModalState.lastTextSelectionRange.startContainer,
      textEditor,
    )
  ) {
    range = createStoryModalState.lastTextSelectionRange.cloneRange();
  } else {
    range = document.createRange();
    range.selectNodeContents(textEditor);
    range.collapse(false);
  }

  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);

  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }

  createStoryModalState.lastTextSelectionRange = range.cloneRange();
  return true;
}

function csNormalizeTextLength() {
  const { textEditor } = csGetElements();
  if (!textEditor) return;

  const currentText = csGetRawTextContent();
  if (currentText.length === 0 && textEditor.innerHTML !== "") {
    textEditor.innerHTML = "";
  }

  if (currentText.length <= STORY_TEXT_MAX_LENGTH) return;
  textEditor.textContent = currentText.slice(0, STORY_TEXT_MAX_LENGTH);
  csMoveCaretToEnd(textEditor);
}

function csSetTextCount() {
  const { textCount } = csGetElements();
  if (!textCount) return;
  textCount.textContent = String(csGetRawTextContent().length);
}

function csApplyTextLengthLimitUI() {
  const { textEditor, textMaxCount } = csGetElements();
  if (textEditor) {
    textEditor.setAttribute("data-maxlength", String(STORY_TEXT_MAX_LENGTH));
  }
  if (textMaxCount) {
    textMaxCount.textContent = String(STORY_TEXT_MAX_LENGTH);
  }
}

function csReleasePreviewObjectUrl() {
  if (createStoryModalState.previewObjectUrl) {
    URL.revokeObjectURL(createStoryModalState.previewObjectUrl);
    createStoryModalState.previewObjectUrl = null;
  }
}

function csReadSelectedFileName(file) {
  if (!file || !file.name) return "No file selected";
  const maxLength = 34;
  if (file.name.length <= maxLength) return file.name;
  return `${file.name.slice(0, maxLength - 3)}...`;
}

function csGetPreviewHintByMode() {
  if (createStoryModalState.storyMode === "text") {
    return "Type directly on preview to compose your story.";
  }
  return "Upload image or video to preview your story.";
}

function csCloseAllDropdowns() {
  const { privacyDropdown, expiresDropdown } = csGetElements();
  privacyDropdown?.classList.remove("show");
  expiresDropdown?.classList.remove("show");
  createStoryModalState.activeDropdown = null;
}

function csCloseEmojiPicker() {
  const { emojiPickerContainer } = csGetElements();
  if (
    !emojiPickerContainer ||
    !emojiPickerContainer.classList.contains("show")
  ) {
    return;
  }

  if (window.EmojiUtils?.closePicker) {
    window.EmojiUtils.closePicker(emojiPickerContainer);
  } else {
    emojiPickerContainer.classList.remove("show");
    setTimeout(() => {
      emojiPickerContainer.innerHTML = "";
    }, 200);
  }
}

function csApplyStepUI() {
  const { modeStep, editorStep, submitBtn, backBtn } = csGetElements();
  const isModeStep = createStoryModalState.currentStep === "mode";

  if (modeStep) {
    modeStep.classList.toggle("create-story-hidden", !isModeStep);
  }
  if (editorStep) {
    editorStep.classList.toggle("create-story-hidden", isModeStep);
  }
  if (submitBtn) {
    submitBtn.classList.toggle("create-story-hidden", isModeStep);
  }
  if (backBtn) {
    backBtn.classList.toggle("create-story-hidden", isModeStep);
  }

  if (isModeStep) {
    csCloseAllDropdowns();
    csCloseEmojiPicker();
  }
}

function csCreatePaletteButton({
  className,
  key,
  title,
  cssValue,
  dataKeyName,
  onClick,
}) {
  const el = document.createElement("div");
  el.className = className;
  el.dataset[dataKeyName] = key;
  el.title = title;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", title);
  el.style.background = cssValue;
  el.addEventListener("click", onClick);
  return el;
}

function csEnsurePalettesRendered() {
  if (createStoryModalState.isPaletteRendered) return;
  const { backgroundPalette, textColorPalette } = csGetElements();
  if (!backgroundPalette || !textColorPalette) return;

  const bgFragment = document.createDocumentFragment();
  Object.entries(STORY_TEXT_STYLE_OPTIONS.backgrounds).forEach(
    ([key, option]) => {
      bgFragment.appendChild(
        csCreatePaletteButton({
          className: "create-story-bg-btn",
          key,
          title: `${option.label || key} background`,
          cssValue: option.css,
          dataKeyName: "bgKey",
          onClick: () => window.selectCreateStoryBackground(key),
        }),
      );
    },
  );
  backgroundPalette.innerHTML = "";
  backgroundPalette.appendChild(bgFragment);

  const textFragment = document.createDocumentFragment();
  Object.entries(STORY_TEXT_STYLE_OPTIONS.textColors).forEach(
    ([key, option]) => {
      textFragment.appendChild(
        csCreatePaletteButton({
          className: "create-story-color-btn",
          key,
          title: `${option.label || key} text`,
          cssValue: option.css,
          dataKeyName: "textColorKey",
          onClick: () => window.selectCreateStoryTextColor(key),
        }),
      );
    },
  );
  textColorPalette.innerHTML = "";
  textColorPalette.appendChild(textFragment);

  createStoryModalState.isPaletteRendered = true;
}

function csEnsureMediaBgPaletteRendered() {
  if (createStoryModalState.isMediaPaletteRendered) return;
  const { mediaBgPalette } = csGetElements();
  if (!mediaBgPalette) return;

  const fragment = document.createDocumentFragment();
  Object.entries(STORY_TEXT_STYLE_OPTIONS.backgrounds).forEach(
    ([key, option]) => {
      fragment.appendChild(
        csCreatePaletteButton({
          className: "create-story-media-bg-btn",
          key,
          title: `${option.label || key} background`,
          cssValue: option.css,
          dataKeyName: "mediaBgKey",
          onClick: () => window.selectCreateStoryMediaBg(key),
        }),
      );
    },
  );
  mediaBgPalette.innerHTML = "";
  mediaBgPalette.appendChild(fragment);
  createStoryModalState.isMediaPaletteRendered = true;
}

function csApplyTextStyleUI() {
  const {
    backgroundButtons,
    textColorButtons,
    fontButtons,
    fontSizeRange,
    fontSizeNumber,
  } = csGetElements();

  const resolved = csGetResolvedTextStyle();

  createStoryModalState.backgroundColorKey = resolved.backgroundColorKey;
  createStoryModalState.textColorKey = resolved.textColorKey;
  createStoryModalState.fontTextKey = resolved.fontTextKey;
  createStoryModalState.fontSizePx = resolved.fontSizePx;

  backgroundButtons.forEach((button) => {
    const key = button.dataset.bgKey || "";
    const option = STORY_TEXT_STYLE_OPTIONS.backgrounds[key];
    if (option?.css) {
      button.style.background = option.css;
    }
    button.classList.toggle("active", key === resolved.backgroundColorKey);
  });

  textColorButtons.forEach((button) => {
    const key = button.dataset.textColorKey || "";
    const option = STORY_TEXT_STYLE_OPTIONS.textColors[key];
    if (option?.css) {
      button.style.background = option.css;
    }
    button.classList.toggle("active", key === resolved.textColorKey);
  });

  fontButtons.forEach((button) => {
    const key = button.dataset.fontKey || "";
    const option = STORY_TEXT_STYLE_OPTIONS.fonts[key];
    if (option?.css) {
      button.style.fontFamily = option.css;
    }
    button.classList.toggle("active", key === resolved.fontTextKey);
  });

  if (fontSizeRange) {
    fontSizeRange.value = String(resolved.fontSizePx);
  }
  if (fontSizeNumber) {
    fontSizeNumber.value = String(resolved.fontSizePx);
  }
}

function csClearMediaSelection() {
  const { mediaInput, imagePreview, videoPreview } = csGetElements();

  // Destroy media editor if active
  if (window.StoryMediaEditor && window.StoryMediaEditor.isActive()) {
    window.StoryMediaEditor.destroy();
  }

  createStoryModalState.selectedFile = null;
  createStoryModalState.mediaContentType = null;
  csReleasePreviewObjectUrl();

  if (mediaInput) {
    mediaInput.value = "";
  }
  if (imagePreview) {
    imagePreview.src = "";
  }
  if (videoPreview) {
    videoPreview.pause();
    videoPreview.removeAttribute("src");
    videoPreview.load();
  }
}

function csClearTextContent() {
  const { textEditor } = csGetElements();
  if (textEditor) {
    textEditor.textContent = "";
  }
  createStoryModalState.lastTextSelectionRange = null;
  csSetTextCount();
}

function csApplyStoryModeUI() {
  const { textSection, mediaSection, previewHint, modeChoiceButtons } =
    csGetElements();

  modeChoiceButtons.forEach((button) => {
    const mode = button.dataset.storyModeChoice;
    button.classList.toggle("active", mode === createStoryModalState.storyMode);
  });
  if (textSection) {
    textSection.classList.toggle(
      "create-story-hidden",
      createStoryModalState.storyMode !== "text",
    );
  }
  if (mediaSection) {
    mediaSection.classList.toggle(
      "create-story-hidden",
      createStoryModalState.storyMode !== "media",
    );
  }

  if (createStoryModalState.storyMode !== "text") {
    csCloseEmojiPicker();
  }

  if (createStoryModalState.storyMode === "media") {
    csEnsureMediaBgPaletteRendered();
    csApplyMediaBgUI();
  }

  if (previewHint) {
    previewHint.textContent = csGetPreviewHintByMode();
  }

  csRenderPreview();
  csUpdateSubmitState();
}

function csRenderPreview() {
  const { previewEmpty, imagePreview, videoPreview, textPreview, textEditor } =
    csGetElements();
  if (
    !previewEmpty ||
    !imagePreview ||
    !videoPreview ||
    !textPreview ||
    !textEditor
  ) {
    return;
  }

  if (createStoryModalState.currentStep !== "editor") {
    previewEmpty.style.display = "none";
    imagePreview.style.display = "none";
    videoPreview.style.display = "none";
    textPreview.style.display = "none";
    textEditor.setAttribute("contenteditable", "false");
    videoPreview.pause();
    return;
  }

  if (createStoryModalState.storyMode === "text") {
    previewEmpty.style.display = "none";
    imagePreview.style.display = "none";
    videoPreview.style.display = "none";
    videoPreview.pause();

    const style = csGetResolvedTextStyle();
    const bgStyle =
      STORY_TEXT_STYLE_OPTIONS.backgrounds[style.backgroundColorKey];
    const textColorStyle =
      STORY_TEXT_STYLE_OPTIONS.textColors[style.textColorKey];
    const fontStyle = STORY_TEXT_STYLE_OPTIONS.fonts[style.fontTextKey];
    const fallbackBackgroundKey = csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.backgrounds,
      STORY_TEXT_STYLE_DEFAULTS.backgroundColorKey,
      "",
    );
    const fallbackTextColorKey = csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.textColors,
      STORY_TEXT_STYLE_DEFAULTS.textColorKey,
      "",
    );
    const fallbackFontKey = csResolveStyleKey(
      STORY_TEXT_STYLE_OPTIONS.fonts,
      STORY_TEXT_STYLE_DEFAULTS.fontTextKey,
      "",
    );

    textPreview.style.background =
      bgStyle?.css ||
      STORY_TEXT_STYLE_OPTIONS.backgrounds[fallbackBackgroundKey]?.css ||
      STORY_TEXT_CONFIG_FALLBACK.options.backgrounds.accent.css;
    textEditor.style.color =
      textColorStyle?.css ||
      STORY_TEXT_STYLE_OPTIONS.textColors[fallbackTextColorKey]?.css ||
      STORY_TEXT_CONFIG_FALLBACK.options.textColors.light.css;
    textEditor.style.fontFamily =
      fontStyle?.css ||
      STORY_TEXT_STYLE_OPTIONS.fonts[fallbackFontKey]?.css ||
      STORY_TEXT_CONFIG_FALLBACK.options.fonts.modern.css;
    textEditor.style.fontSize = `${style.fontSizePx}px`;

    if (textPreview.style.display !== "flex") {
      textPreview.style.display = "flex";
    }
    textEditor.setAttribute(
      "contenteditable",
      createStoryModalState.isSubmitting ? "false" : "true",
    );
    return;
  }

  textPreview.style.display = "none";
  textEditor.setAttribute("contenteditable", "false");
  imagePreview.style.display = "none";
  videoPreview.style.display = "none";
  videoPreview.pause();

  if (
    !createStoryModalState.selectedFile ||
    !createStoryModalState.previewObjectUrl ||
    createStoryModalState.mediaContentType === null
  ) {
    previewEmpty.style.display = "flex";
    return;
  }

  previewEmpty.style.display = "none";

  if (createStoryModalState.mediaContentType === 1) {
    // Video: show standard player, no editor
    videoPreview.src = createStoryModalState.previewObjectUrl;
    videoPreview.style.display = "block";
    csToggleMediaToolsGroup(false);
    return;
  }

  // Image: initialize media editor
  imagePreview.style.display = "none"; // hide raw img, editor handles display
  const editorContainer = document.getElementById(
    "createStoryMediaEditorContainer",
  );
  if (editorContainer && window.StoryMediaEditor) {
    if (!window.StoryMediaEditor.isActive()) {
      window.StoryMediaEditor.init(
        editorContainer,
        createStoryModalState.previewObjectUrl,
        {
          toolbarMount: document.getElementById("createStoryMediaToolbarMount"),
          onEmpty: () => {
            csClearMediaSelection();
            csRenderPreview();
            csUpdateSubmitState();
          },
        },
      );
    }
    csToggleMediaToolsGroup(true);
  } else {
    // Fallback: show raw image if editor not available
    imagePreview.src = createStoryModalState.previewObjectUrl;
    imagePreview.style.display = "block";
    csToggleMediaToolsGroup(false);
  }
}

function csToggleMediaToolsGroup(visible) {
  const toolsGroup = document.getElementById("createStoryMediaToolsGroup");
  if (toolsGroup) {
    toolsGroup.classList.toggle("create-story-hidden", !visible);
  }
}

function csValidateBeforeSubmit(showToast = false) {
  if (createStoryModalState.currentStep !== "editor") {
    if (showToast && window.toastError) {
      toastError("Please choose Text or Media first.");
    }
    return false;
  }

  if (!createStoryModalState.storyMode) {
    if (showToast && window.toastError) {
      toastError("Please choose Text or Media for your story.");
    }
    return false;
  }

  if (createStoryModalState.storyMode === "text") {
    const text = csGetTrimmedTextContent();
    if (!text) {
      if (showToast && window.toastError) {
        toastError("Text content is required for text story.");
      }
      return false;
    }
    return true;
  }

  if (
    !createStoryModalState.selectedFile ||
    createStoryModalState.mediaContentType === null
  ) {
    if (showToast && window.toastError) {
      toastError("Please upload an image or video first.");
    }
    return false;
  }

  return true;
}

function csUpdateSubmitState() {
  const { submitBtn } = csGetElements();
  if (!submitBtn) return;

  if (createStoryModalState.isSubmitting) {
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = !csValidateBeforeSubmit(false);
}

function csSetSubmitting(isSubmitting) {
  const {
    submitBtn,
    backBtn,
    modeChoiceButtons,
    mediaInput,
    closeBtn,
    cancelBtn,
    backgroundButtons,
    textColorButtons,
    fontButtons,
    fontSizeRange,
    fontSizeNumber,
    emojiBtn,
    textEditor,
    privacySelector,
    expiresSelector,
  } = csGetElements();

  createStoryModalState.isSubmitting = isSubmitting;

  const controlsToToggle = [
    submitBtn,
    backBtn,
    ...modeChoiceButtons,
    mediaInput,
    closeBtn,
    cancelBtn,
    ...backgroundButtons,
    ...textColorButtons,
    ...fontButtons,
    fontSizeRange,
    fontSizeNumber,
    emojiBtn,
  ];

  controlsToToggle.forEach((control) => {
    if (!control) return;
    control.disabled = isSubmitting;
  });

  privacySelector?.classList.toggle("is-disabled", isSubmitting);
  expiresSelector?.classList.toggle("is-disabled", isSubmitting);

  if (textEditor && createStoryModalState.storyMode === "text") {
    textEditor.setAttribute("contenteditable", isSubmitting ? "false" : "true");
  }

  if (submitBtn) {
    const defaultText =
      submitBtn.dataset.defaultText || submitBtn.textContent || "Share Story";
    submitBtn.dataset.defaultText = defaultText;
    submitBtn.textContent = isSubmitting ? "Sharing..." : defaultText;

    if (window.LoadingUtils?.setButtonLoading) {
      window.LoadingUtils.setButtonLoading(submitBtn, isSubmitting);
    } else {
      submitBtn.disabled = isSubmitting;
    }
  }

  if (!isSubmitting) {
    csUpdateSubmitState();
  }
}

function csResetForm() {
  const { textPreview, textEditor } = csGetElements();

  // Destroy media editor if active
  if (window.StoryMediaEditor && window.StoryMediaEditor.isActive()) {
    window.StoryMediaEditor.destroy();
  }

  createStoryModalState.isSubmitting = false;
  createStoryModalState.currentStep = "mode";
  createStoryModalState.storyMode = null;
  createStoryModalState.backgroundColorKey =
    STORY_TEXT_STYLE_DEFAULTS.backgroundColorKey;
  createStoryModalState.textColorKey = STORY_TEXT_STYLE_DEFAULTS.textColorKey;
  createStoryModalState.fontTextKey = STORY_TEXT_STYLE_DEFAULTS.fontTextKey;
  createStoryModalState.fontSizePx = STORY_TEXT_STYLE_DEFAULTS.fontSizePx;
  createStoryModalState.mediaBgKey = null;
  createStoryModalState.lastTextSelectionRange = null;

  csCloseAllDropdowns();
  csCloseEmojiPicker();
  csSelectPrivacy(0);
  csSelectExpires(24);

  csClearMediaSelection();
  csClearTextContent();
  csApplyTextLengthLimitUI();

  if (textPreview) {
    textPreview.removeAttribute("style");
  }
  if (textEditor) {
    textEditor.removeAttribute("style");
    textEditor.setAttribute("contenteditable", "true");
  }

  csEnsurePalettesRendered();
  csApplyTextStyleUI();
  csApplyStepUI();
  csApplyStoryModeUI();
}

async function csReadErrorMessage(res, fallback = "Failed to create story.") {
  let message = fallback;

  try {
    const data = await res.json();
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
    if (typeof data?.title === "string" && data.title.trim()) {
      return data.title.trim();
    }
    if (data?.errors && typeof data.errors === "object") {
      const firstKey = Object.keys(data.errors)[0];
      const firstValue = firstKey ? data.errors[firstKey] : null;
      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return String(firstValue[0]);
      }
    }
  } catch (_) {}

  try {
    const text = await res.text();
    if (typeof text === "string" && text.trim()) {
      message = text.trim();
    }
  } catch (_) {}

  return message;
}

function csDetectMediaContentType(file) {
  if (!file || typeof file.type !== "string") return null;
  if (file.type.startsWith("image/")) return 0;
  if (file.type.startsWith("video/")) return 1;
  return null;
}

function csHandleMediaChange(event) {
  const { mediaInput, fileName } = csGetElements();
  const file = event?.target?.files?.[0] || null;

  if (!file) {
    csClearMediaSelection();
    csRenderPreview();
    csUpdateSubmitState();
    return;
  }

  const maxSizeMb = window.APP_CONFIG?.MAX_UPLOAD_SIZE_MB || 5;
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    if (window.toastError) {
      toastError(`File is too large. Maximum size is ${maxSizeMb}MB.`);
    }
    if (mediaInput) {
      mediaInput.value = "";
    }
    return;
  }

  const contentType = csDetectMediaContentType(file);
  if (contentType === null) {
    if (window.toastError) {
      toastError("Only image or video files are supported.");
    }
    if (mediaInput) {
      mediaInput.value = "";
    }
    return;
  }

  createStoryModalState.selectedFile = file;
  createStoryModalState.mediaContentType = contentType;
  csReleasePreviewObjectUrl();
  createStoryModalState.previewObjectUrl = URL.createObjectURL(file);

  csRenderPreview();
  csUpdateSubmitState();
}

function csHandleFontSizeInput(rawValue) {
  createStoryModalState.fontSizePx = csClampFontSize(rawValue);
  csApplyTextStyleUI();
  csRenderPreview();
}

function csHandleTextPaste(event) {
  event.preventDefault();

  const clipboardText = event.clipboardData?.getData("text/plain") || "";
  if (!clipboardText) return;

  const currentText = csGetRawTextContent();
  const remaining = STORY_TEXT_MAX_LENGTH - currentText.length;
  if (remaining <= 0) return;

  const insertedText = clipboardText.slice(0, remaining);
  const inserted = csInsertTextAtCursor(insertedText);
  if (!inserted) return;

  csNormalizeTextLength();
  csSetTextCount();
  csUpdateSubmitState();
}

function csInsertEmojiIntoEditor(emojiText) {
  const emoji = typeof emojiText === "string" ? emojiText : "";
  if (!emoji) return;

  const currentLength = csGetRawTextContent().length;
  if (currentLength >= STORY_TEXT_MAX_LENGTH) return;
  const remaining = STORY_TEXT_MAX_LENGTH - currentLength;
  const safeEmoji = emoji.slice(0, remaining);
  if (!safeEmoji) return;

  const inserted = csInsertTextAtCursor(safeEmoji);
  if (!inserted) return;

  csNormalizeTextLength();
  csSetTextCount();
  csUpdateSubmitState();
}

function csBindEvents() {
  if (createStoryModalState.isInitialized) return;

  csEnsurePalettesRendered();
  csApplyTextLengthLimitUI();

  const { uploadBtn, mediaInput, textEditor, fontSizeRange, fontSizeNumber } =
    csGetElements();

  if (!mediaInput || !textEditor) return;

  // Upload button in preview-empty placeholder
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      if (createStoryModalState.isSubmitting) return;
      mediaInput.click();
    });
  }

  mediaInput.addEventListener("change", csHandleMediaChange);

  textEditor.addEventListener("input", () => {
    csNormalizeTextLength();
    csSetTextCount();
    csSaveTextSelection();
    csUpdateSubmitState();
  });

  textEditor.addEventListener("paste", csHandleTextPaste);
  textEditor.addEventListener("keyup", csSaveTextSelection);
  textEditor.addEventListener("mouseup", csSaveTextSelection);
  textEditor.addEventListener("focus", csSaveTextSelection);

  fontSizeRange?.addEventListener("input", (event) => {
    csHandleFontSizeInput(event.target.value);
  });

  fontSizeNumber?.addEventListener("change", (event) => {
    csHandleFontSizeInput(event.target.value);
  });

  fontSizeNumber?.addEventListener("blur", (event) => {
    const value = event.target.value;
    if (value === "") {
      csHandleFontSizeInput(STORY_TEXT_FONT_SIZE.default);
      return;
    }
    csHandleFontSizeInput(value);
  });

  createStoryModalState.isInitialized = true;
}

function csBindDocumentEvents() {
  if (createStoryModalState.documentEventsBound) return;

  document.addEventListener("click", (event) => {
    const { modal, emojiPickerContainer, emojiBtn } = csGetElements();
    if (!modal || !modal.classList.contains("show")) return;

    if (createStoryModalState.activeDropdown) {
      const dropName = createStoryModalState.activeDropdown;
      const dropdown = document.getElementById(
        `cs${dropName.charAt(0).toUpperCase() + dropName.slice(1)}Dropdown`,
      );
      const selector = document.getElementById(
        `cs${dropName.charAt(0).toUpperCase() + dropName.slice(1)}Selector`,
      );
      if (
        dropdown &&
        selector &&
        !dropdown.contains(event.target) &&
        !selector.contains(event.target)
      ) {
        dropdown.classList.remove("show");
        createStoryModalState.activeDropdown = null;
      }
    }

    if (
      emojiPickerContainer &&
      emojiPickerContainer.classList.contains("show") &&
      !emojiPickerContainer.contains(event.target) &&
      !emojiBtn?.contains(event.target)
    ) {
      csCloseEmojiPicker();
    }

    if (event.target === modal) {
      closeCreateStoryModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const { modal, emojiPickerContainer } = csGetElements();
    if (!modal || !modal.classList.contains("show")) return;

    if (createStoryModalState.activeDropdown) {
      csCloseAllDropdowns();
      return;
    }

    if (emojiPickerContainer?.classList.contains("show")) {
      csCloseEmojiPicker();
      return;
    }

    closeCreateStoryModal();
  });

  createStoryModalState.documentEventsBound = true;
}

window.setCreateStoryMode = function (nextMode) {
  if (createStoryModalState.isSubmitting) return;

  const normalizedMode =
    typeof nextMode === "string" ? nextMode.trim().toLowerCase() : "";
  if (!["text", "media"].includes(normalizedMode)) return;

  createStoryModalState.storyMode = normalizedMode;
  createStoryModalState.currentStep = "editor";
  csCloseAllDropdowns();

  if (normalizedMode === "text") {
    csClearMediaSelection();
  } else {
    csCloseEmojiPicker();
    csClearTextContent();
  }

  csApplyStepUI();
  csApplyStoryModeUI();

  if (normalizedMode === "text") {
    const { textEditor } = csGetElements();
    if (textEditor && !createStoryModalState.isSubmitting) {
      textEditor.focus();
      csMoveCaretToEnd(textEditor);
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
};

window.backCreateStoryMode = function () {
  if (createStoryModalState.isSubmitting) return;

  createStoryModalState.currentStep = "mode";
  createStoryModalState.storyMode = null;
  csCloseAllDropdowns();
  csCloseEmojiPicker();
  csClearMediaSelection();
  csClearTextContent();
  csApplyStepUI();
  csApplyStoryModeUI();
};

window.selectCreateStoryBackground = function (nextKey) {
  if (createStoryModalState.isSubmitting) return;
  createStoryModalState.backgroundColorKey = csResolveStyleKey(
    STORY_TEXT_STYLE_OPTIONS.backgrounds,
    nextKey,
    STORY_TEXT_STYLE_DEFAULTS.backgroundColorKey,
  );
  csApplyTextStyleUI();
  csRenderPreview();
};

// ==== Media Background ====

function csApplyMediaBgUI() {
  const { mediaBgButtons } = csGetElements();
  const currentKey = createStoryModalState.mediaBgKey;
  mediaBgButtons.forEach((button) => {
    const key = button.dataset.mediaBgKey || "";
    button.classList.toggle("active", key === currentKey);
  });
}

window.selectCreateStoryMediaBg = function (nextKey) {
  if (createStoryModalState.isSubmitting) return;
  if (createStoryModalState.storyMode !== "media") return;

  const resolvedKey = csResolveStyleKey(
    STORY_TEXT_STYLE_OPTIONS.backgrounds,
    nextKey,
    Object.keys(STORY_TEXT_STYLE_OPTIONS.backgrounds)[0],
  );
  createStoryModalState.mediaBgKey = resolvedKey;

  // Apply the gradient/color to the SME container as background
  const bgOption = STORY_TEXT_STYLE_OPTIONS.backgrounds[resolvedKey];
  if (bgOption?.css && window.StoryMediaEditor?.setBgColor) {
    window.StoryMediaEditor.setBgColor(bgOption.css);
  }

  csApplyMediaBgUI();
};

window.selectCreateStoryTextColor = function (nextKey) {
  if (createStoryModalState.isSubmitting) return;
  createStoryModalState.textColorKey = csResolveStyleKey(
    STORY_TEXT_STYLE_OPTIONS.textColors,
    nextKey,
    STORY_TEXT_STYLE_DEFAULTS.textColorKey,
  );
  csApplyTextStyleUI();
  csRenderPreview();
};

window.selectCreateStoryFont = function (nextKey) {
  if (createStoryModalState.isSubmitting) return;
  createStoryModalState.fontTextKey = csResolveStyleKey(
    STORY_TEXT_STYLE_OPTIONS.fonts,
    nextKey,
    STORY_TEXT_STYLE_DEFAULTS.fontTextKey,
  );
  csApplyTextStyleUI();
  csRenderPreview();
};

window.selectCreateStoryFontSize = function (nextValue) {
  if (createStoryModalState.isSubmitting) return;
  csHandleFontSizeInput(nextValue);
};

window.toggleCreateStoryEmojiPicker = async function (event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (createStoryModalState.isSubmitting) return;
  if (createStoryModalState.storyMode !== "text") return;

  const { emojiPickerContainer, textEditor } = csGetElements();
  if (!emojiPickerContainer || !textEditor) return;

  csSaveTextSelection();

  if (!window.EmojiUtils?.togglePicker) {
    if (window.toastError) {
      toastError("Emoji picker is unavailable.");
    }
    return;
  }

  await window.EmojiUtils.togglePicker(emojiPickerContainer, (emoji) => {
    csInsertEmojiIntoEditor(emoji?.native || "");
  });
};

window.openCreateStoryModal = function () {
  const { modal } = csGetElements();
  if (!modal) return;

  csBindEvents();
  csBindDocumentEvents();
  csResetForm();

  modal.classList.add("show");
  if (window.lockScroll) {
    window.lockScroll();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
};

window.closeCreateStoryModal = function (forceClose = false) {
  if (createStoryModalState.isSubmitting && !forceClose) return;

  const { modal } = csGetElements();
  if (!modal) return;

  if (!forceClose && window.csHasUnsavedChanges()) {
    window.csShowDiscardConfirmation();
    return;
  }

  modal.classList.remove("show");
  if (window.unlockScroll) {
    window.unlockScroll();
  }

  csResetForm();
};

window.csHasUnsavedChanges = function () {
  if (createStoryModalState.storyMode === "text") {
    return csGetTrimmedTextContent().length > 0;
  }
  if (createStoryModalState.storyMode === "media") {
    if (window.StoryMediaEditor && window.StoryMediaEditor.hasEdits()) {
      return true;
    }
    return createStoryModalState.selectedFile !== null;
  }
  return false;
};

window.csShowDiscardConfirmation = function () {
  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "csDiscardOverlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
      <div class="post-options-header">
          <h3>Discard story?</h3>
          <p>If you leave, your edits won't be saved.</p>
      </div>
      <button class="post-option post-option-danger" onclick="csConfirmDiscard()">
          Discard
      </button>
      <button class="post-option post-option-cancel" onclick="csCancelDiscard()">
          Cancel
      </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  if (window.lucide) {
    lucide.createIcons();
  }

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      window.csCancelDiscard();
    }
  };
};

window.csConfirmDiscard = function () {
  const overlay = document.getElementById("csDiscardOverlay");
  if (overlay) overlay.remove();

  window.closeCreateStoryModal(true);
};

window.csCancelDiscard = function () {
  const overlay = document.getElementById("csDiscardOverlay");
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  }
};

window.csToggleDropdown = function (dropdownName, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (createStoryModalState.isSubmitting) return;

  const normalizedName =
    typeof dropdownName === "string" ? dropdownName.trim().toLowerCase() : "";
  if (!["privacy", "expires"].includes(normalizedName)) return;

  const dropId = `cs${normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1)}Dropdown`;
  const btnId = `cs${normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1)}Selector`;
  const dropdown = document.getElementById(dropId);
  const selector = document.getElementById(btnId);
  if (!dropdown || !selector) return;

  const isSameDropdown =
    createStoryModalState.activeDropdown === normalizedName;
  csCloseAllDropdowns();
  if (isSameDropdown) return;

  const rect = selector.getBoundingClientRect();
  dropdown.style.left = `${rect.left}px`;

  // Measure dropdown height
  dropdown.style.visibility = "hidden";
  dropdown.style.display = "block";
  dropdown.classList.add("show");
  const dropdownHeight = dropdown.offsetHeight;
  dropdown.classList.remove("show");
  dropdown.style.display = "";
  dropdown.style.visibility = "";

  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow >= dropdownHeight + 10) {
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.bottom = "auto";
    dropdown.classList.remove("dropup");
  } else {
    dropdown.style.top = "auto";
    dropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    dropdown.classList.add("dropup");
  }

  dropdown.classList.add("show");
  createStoryModalState.activeDropdown = normalizedName;
};

window.csSelectPrivacy = function (rawValue) {
  const parsed = Number.parseInt(String(rawValue), 10);
  const value = [0, 1, 2].includes(parsed) ? parsed : 0;
  createStoryModalState.privacy = value;

  const iconMap = {
    0: { icon: "globe", text: "Public" },
    1: { icon: "users", text: "Followers Only" },
    2: { icon: "lock", text: "Private" },
  };
  const selected = iconMap[value];

  const icon = document.getElementById("csPrivacyIcon");
  const text = document.getElementById("csPrivacyText");
  if (icon && text) {
    icon.setAttribute("data-lucide", selected.icon);
    text.textContent = selected.text;
  }

  const options = document.querySelectorAll(
    "#csPrivacyDropdown .privacy-option",
  );
  options.forEach((opt) => {
    const optionValue = Number.parseInt(
      opt.getAttribute("data-privacy") || "0",
      10,
    );
    opt.classList.toggle("active", optionValue === value);
  });

  document.getElementById("csPrivacyDropdown")?.classList.remove("show");
  createStoryModalState.activeDropdown = null;

  if (window.lucide) {
    lucide.createIcons();
  }
};

window.csSelectExpires = function (rawValue) {
  const parsed = Number.parseInt(String(rawValue), 10);
  const value = [6, 12, 24].includes(parsed) ? parsed : 24;
  createStoryModalState.expires = value;

  const iconMap = {
    6: { icon: "clock-1", text: "6 hours" },
    12: { icon: "clock-2", text: "12 hours" },
    24: { icon: "clock-3", text: "24 hours" },
  };
  const selected = iconMap[value];

  const icon = document.getElementById("csExpiresIcon");
  const text = document.getElementById("csExpiresText");
  if (icon && text) {
    icon.setAttribute("data-lucide", selected.icon);
    text.textContent = selected.text;
  }

  const options = document.querySelectorAll(
    "#csExpiresDropdown .privacy-option",
  );
  options.forEach((opt) => {
    const optionValue = Number.parseInt(
      opt.getAttribute("data-expires") || "24",
      10,
    );
    opt.classList.toggle("active", optionValue === value);
  });

  document.getElementById("csExpiresDropdown")?.classList.remove("show");
  createStoryModalState.activeDropdown = null;

  if (window.lucide) {
    lucide.createIcons();
  }
};

window.submitCreateStory = async function () {
  if (createStoryModalState.isSubmitting) return;

  if (!window.API?.Stories?.create) {
    if (window.toastError) {
      toastError("Story API is unavailable.");
    }
    return;
  }

  if (!csValidateBeforeSubmit(true)) return;

  // Lock UI immediately to prevent double-submit
  csSetSubmitting(true);
  if (typeof window.showGlobalLoader === "function") {
    window.showGlobalLoader();
  }

  const formData = new FormData();

  if (createStoryModalState.storyMode === "text") {
    const style = csGetResolvedTextStyle();
    formData.append("ContentType", "2");
    formData.append("TextContent", csGetTrimmedTextContent());
    formData.append("BackgroundColorKey", style.backgroundColorKey);
    formData.append("TextColorKey", style.textColorKey);
    formData.append("FontTextKey", style.fontTextKey);
    formData.append("FontSizeKey", String(style.fontSizePx));
  } else {
    const mediaFile = createStoryModalState.selectedFile;
    const mediaContentType = createStoryModalState.mediaContentType;
    if (!mediaFile || mediaContentType === null) {
      if (window.toastError) {
        toastError("Please upload an image or video first.");
      }
      csSetSubmitting(false);
      if (typeof window.hideGlobalLoader === "function") {
        window.hideGlobalLoader();
      }
      return;
    }

    // If media editor is active (image), export the edited image
    let fileToUpload = mediaFile;
    if (
      window.StoryMediaEditor &&
      window.StoryMediaEditor.isActive() &&
      mediaContentType === 0
    ) {
      try {
        const editedBlob = await window.StoryMediaEditor.exportBlob();
        fileToUpload = new File([editedBlob], "story-edited.jpg", {
          type: "image/jpeg",
        });
      } catch (exportErr) {
        console.error("StoryMediaEditor export failed:", exportErr);
        if (window.toastError) {
          toastError("Failed to process image. Uploading original.");
        }
        // Fallback to original file
      }
    }

    formData.append("ContentType", String(mediaContentType));
    formData.append("MediaFile", fileToUpload, fileToUpload.name);
  }

  formData.append("Privacy", String(createStoryModalState.privacy));
  formData.append("ExpiresEnum", String(createStoryModalState.expires));

  try {
    const res = await window.API.Stories.create(formData);
    if (!res.ok) {
      const message = await csReadErrorMessage(res, "Failed to create story.");
      if (window.toastError) {
        toastError(message);
      }
      return;
    }

    const story = await res.json().catch(() => null);
    if (window.toastSuccess) {
      toastSuccess("Story created successfully.");
    }

    window.closeCreateStoryModal(true);
    window.dispatchEvent(new CustomEvent("story:created", { detail: story }));
  } catch (error) {
    console.error("submitCreateStory failed:", error);
    if (window.toastError) {
      toastError("Could not connect to server.");
    }
  } finally {
    if (typeof window.hideGlobalLoader === "function") {
      window.hideGlobalLoader();
    }
    csSetSubmitting(false);
  }
};
