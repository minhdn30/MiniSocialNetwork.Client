/**
 * Story Media Editor v2 — Advanced editor for Create Story modal.
 * Features: Multiple images, text overlays, stickers, freehand drawing,
 *           8-handle resize (corner=proportional, edge=stretch),
 *           customizable background color (default from dominant color).
 * Export: html2canvas → 1080×1080 JPEG blob.
 */
(function (global) {
  "use strict";

  function smeT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback || key) : (fallback || key);
  }

  /* ===== Constants ===== */
  const EXPORT_QUALITY = 0.88;
  const EXPORT_TYPE = "image/jpeg";
  const EXPORT_SIZE = 1080;
  const DEFAULT_DRAW_COLOR = "#ffffff";
  const DEFAULT_DRAW_SIZE = 4;
  const DEFAULT_TEXT_COLOR = "#ffffff";
  const DEFAULT_TEXT_SIZE = 28;
  const DEFAULT_TEXT_FONT = "Inter, sans-serif";
  const DEFAULT_BG_COLOR = "#0f1115";
  const MAX_HISTORY = 30;
  const MIN_OBJ_SIZE = 20;
  const HANDLE_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  const STICKER_CATALOG = [
    {
      labelKey: "story.mediaEditor.stickers.categories.smileys",
      name: "Smileys",
      stickers: [
        { id: "grin", emoji: "😀" }, { id: "laugh", emoji: "😂" },
        { id: "rofl", emoji: "🤣" }, { id: "joy", emoji: "😊" },
        { id: "wink", emoji: "😉" }, { id: "cool", emoji: "😎" },
        { id: "love_eyes", emoji: "😍" }, { id: "kiss", emoji: "😘" },
        { id: "think", emoji: "🤔" }, { id: "shush", emoji: "🤫" },
        { id: "shock", emoji: "😱" }, { id: "cry", emoji: "😢" },
        { id: "angry", emoji: "😡" }, { id: "devil", emoji: "😈" },
        { id: "skull", emoji: "💀" }, { id: "ghost", emoji: "👻" },
        { id: "clown", emoji: "🤡" }, { id: "nerd", emoji: "🤓" },
        { id: "party_face", emoji: "🥳" }, { id: "pleading", emoji: "🥺" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.heartsLove",
      name: "Hearts & Love",
      stickers: [
        { id: "red_heart", emoji: "❤️" }, { id: "orange_heart", emoji: "🧡" },
        { id: "yellow_heart", emoji: "💛" }, { id: "green_heart", emoji: "💚" },
        { id: "blue_heart", emoji: "💙" }, { id: "purple_heart", emoji: "💜" },
        { id: "pink_heart", emoji: "🩷" }, { id: "black_heart", emoji: "🖤" },
        { id: "white_heart", emoji: "🤍" }, { id: "sparkling_heart", emoji: "💖" },
        { id: "heartbeat", emoji: "💓" }, { id: "broken_heart", emoji: "💔" },
        { id: "kiss_mark", emoji: "💋" }, { id: "cupid", emoji: "💘" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.handsPeople",
      name: "Hands & People",
      stickers: [
        { id: "thumbsup", emoji: "👍" }, { id: "thumbsdown", emoji: "👎" },
        { id: "clap", emoji: "👏" }, { id: "wave", emoji: "👋" },
        { id: "pray", emoji: "🙏" }, { id: "muscle", emoji: "💪" },
        { id: "ok", emoji: "👌" }, { id: "peace", emoji: "✌️" },
        { id: "point_up", emoji: "☝️" }, { id: "fist", emoji: "✊" },
        { id: "handshake", emoji: "🤝" }, { id: "eyes", emoji: "👀" },
        { id: "hundred", emoji: "💯" }, { id: "crown", emoji: "👑" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.animals",
      name: "Animals",
      stickers: [
        { id: "dog", emoji: "🐶" }, { id: "cat", emoji: "🐱" },
        { id: "bear", emoji: "🐻" }, { id: "panda", emoji: "🐼" },
        { id: "fox", emoji: "🦊" }, { id: "lion", emoji: "🦁" },
        { id: "unicorn", emoji: "🦄" }, { id: "butterfly", emoji: "🦋" },
        { id: "bee", emoji: "🐝" }, { id: "dolphin", emoji: "🐬" },
        { id: "owl", emoji: "🦉" }, { id: "penguin", emoji: "🐧" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.foodDrink",
      name: "Food & Drink",
      stickers: [
        { id: "pizza", emoji: "🍕" }, { id: "burger", emoji: "🍔" },
        { id: "fries", emoji: "🍟" }, { id: "sushi", emoji: "🍣" },
        { id: "cake", emoji: "🎂" }, { id: "donut", emoji: "🍩" },
        { id: "icecream", emoji: "🍦" }, { id: "coffee", emoji: "☕" },
        { id: "beer", emoji: "🍺" }, { id: "wine", emoji: "🍷" },
        { id: "cocktail", emoji: "🍸" }, { id: "bubble_tea", emoji: "🧋" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.activities",
      name: "Activities",
      stickers: [
        { id: "party", emoji: "🎉" }, { id: "gift", emoji: "🎁" },
        { id: "music", emoji: "🎵" }, { id: "guitar", emoji: "🎸" },
        { id: "mic", emoji: "🎤" }, { id: "camera", emoji: "📸" },
        { id: "movie", emoji: "🎬" }, { id: "gaming", emoji: "🎮" },
        { id: "trophy", emoji: "🏆" }, { id: "medal", emoji: "🏅" },
        { id: "soccer", emoji: "⚽" }, { id: "basketball", emoji: "🏀" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.travelWeather",
      name: "Travel & Weather",
      stickers: [
        { id: "airplane", emoji: "✈️" }, { id: "rocket", emoji: "🚀" },
        { id: "car", emoji: "🚗" }, { id: "ship", emoji: "🚢" },
        { id: "globe", emoji: "🌍" }, { id: "mountain", emoji: "🏔️" },
        { id: "beach", emoji: "🏖️" }, { id: "sunset", emoji: "🌅" },
        { id: "sun", emoji: "☀️" }, { id: "moon", emoji: "🌙" },
        { id: "rainbow", emoji: "🌈" }, { id: "snowflake", emoji: "❄️" },
        { id: "lightning", emoji: "⚡" }, { id: "fire", emoji: "🔥" },
      ],
    },
    {
      labelKey: "story.mediaEditor.stickers.categories.symbolsDecorations",
      name: "Symbols & Decorations",
      stickers: [
        { id: "star", emoji: "⭐" }, { id: "sparkles", emoji: "✨" },
        { id: "gem", emoji: "💎" }, { id: "ribbon", emoji: "🎀" },
        { id: "flower", emoji: "🌸" }, { id: "rose", emoji: "🌹" },
        { id: "sunflower", emoji: "🌻" }, { id: "clover", emoji: "🍀" },
        { id: "pin", emoji: "📍" }, { id: "check", emoji: "✅" },
        { id: "cross", emoji: "❌" }, { id: "warning", emoji: "⚠️" },
        { id: "arrow_up", emoji: "⬆️" }, { id: "arrow_right", emoji: "➡️" },
        { id: "arrow_down", emoji: "⬇️" }, { id: "arrow_left", emoji: "⬅️" },
      ],
    },
  ];

  const FONT_OPTIONS = [
    { label: "Modern", labelKey: "story.create.fontModern", value: "'Segoe UI', 'Inter', system-ui, sans-serif" },
    { label: "Classic", labelKey: "story.create.fontClassic", value: "Georgia, 'Times New Roman', serif" },
    { label: "Rounded", labelKey: "story.create.fontRounded", value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
    { label: "Mono", labelKey: "story.create.fontMono", value: "'Consolas', 'Courier New', monospace" },
    { label: "Elegant", labelKey: "story.create.fontElegant", value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
    { label: "Display", labelKey: "story.create.fontDisplay", value: "Impact, 'Arial Black', sans-serif" },
    { label: "Script", labelKey: "story.create.fontScript", value: "'Brush Script MT', 'Segoe Script', cursive" },
    { label: "Handwriting", labelKey: "story.create.fontHandwriting", value: "'Lucida Handwriting', 'Segoe Script', cursive" },
    { label: "Slab", labelKey: "story.create.fontSlab", value: "Rockwell, 'Courier New', serif" },
    { label: "Condensed", labelKey: "story.create.fontCondensed", value: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif" },
    { label: "Geometric", labelKey: "story.create.fontGeometric", value: "'Century Gothic', Futura, 'Trebuchet MS', sans-serif" },
    { label: "Humanist", labelKey: "story.create.fontHumanist", value: "'Gill Sans', Calibri, 'Segoe UI', sans-serif" },
    { label: "Clean", labelKey: "story.create.fontClean", value: "Verdana, Geneva, sans-serif" },
    { label: "Serif Modern", labelKey: "story.create.fontSerifModern", value: "Cambria, 'Times New Roman', serif" },
  ];

  const COLOR_PRESETS = [
    "#ffffff", "#000000", "#ff416c", "#ff4500",
    "#ffa500", "#ffd700", "#00c853", "#00bcd4",
    "#2979ff", "#7c4dff", "#e040fb", "#ff80ab",
    "#795548", "#9e9e9e", "#607d8b", "#263238",
  ];

  function smeColorSwatchesHtml(inputId, defaultColor) {
    let html = '<div class="sme-color-presets">';
    for (const c of COLOR_PRESETS) {
      const active = c.toLowerCase() === defaultColor.toLowerCase() ? ' sme-color-active' : '';
      html += `<div class="sme-color-swatch${active}" data-sme-color="${c}" data-sme-color-target="${inputId}" style="background:${c}" title="${c}"></div>`;
    }
    html += `<div class="sme-color-swatch sme-color-custom" data-sme-color-custom="${inputId}" data-sme-i18n-title="story.mediaEditor.options.customColor" title="${smeT("story.mediaEditor.options.customColor", {}, "Custom color")}">+</div>`;
    html += `<input type="color" class="sme-color-input-hidden" id="${inputId}" value="${defaultColor}" />`;
    html += '</div>';
    return html;
  }

  function smeRefreshLocalization() {
    const toolbar = editorState.toolbar;
    if (!toolbar) return;

    toolbar.querySelectorAll("[data-sme-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-sme-i18n-title") || "";
      const fallback = el.getAttribute("data-sme-i18n-fallback") || key;
      const text = smeT(key, {}, fallback);
      el.setAttribute("title", text);
      if (el.classList.contains("sme-toolbar-btn")) {
        el.setAttribute("aria-label", text);
      }
    });

    toolbar.querySelectorAll("[data-sme-i18n-text]").forEach((el) => {
      const key = el.getAttribute("data-sme-i18n-text") || "";
      const fallback = el.getAttribute("data-sme-i18n-fallback") || key;
      el.textContent = smeT(key, {}, fallback);
    });
  }

  /* ===== Editor State ===== */
  const editorState = {
    active: false,
    container: null,
    bgColor: DEFAULT_BG_COLOR,

    // DOM refs
    drawCanvas: null,
    drawCtx: null,
    objectsLayer: null,
    toolbar: null,
    toolbarMount: null, // external mount point for toolbar
    drawOptions: null,
    textOptions: null,
    stickerPicker: null,

    // Current tool
    activeTool: "select",

    // Draw state
    isDrawing: false,
    drawColor: DEFAULT_DRAW_COLOR,
    drawSize: DEFAULT_DRAW_SIZE,
    lastPoint: null,

    // Objects (image + text + stickers)
    objects: [],
    nextObjectId: 1,
    selectedObjectId: null,

    // Drag state
    isDragging: false,
    dragObjId: null,
    dragOffsetX: 0,
    dragOffsetY: 0,

    // Resize state
    isResizing: false,
    resizeObjId: null,
    resizeHandle: null,
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartObj: null,

    // Text editing
    editingTextId: null,

    // History
    history: [],
    historyIndex: -1,
    hasAnyEdit: false,

    // Cleanup
    _boundListeners: [],
    _addImageInput: null,
    _createdObjectUrls: [],

    // Callback when canvas becomes empty
    _onEmptyCallback: null,
  };

  /* ===== Utilities ===== */
  function smeGenerateId() {
    return editorState.nextObjectId++;
  }

  function smeGetContainerRect() {
    if (!editorState.container) return { width: 0, height: 0, left: 0, top: 0 };
    return editorState.container.getBoundingClientRect();
  }

  function smeClamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /* ===== Layer Setup ===== */
  function smeInitLayers() {
    const container = editorState.container;
    if (!container) return;

    // Objects layer (images, text, stickers)
    const objLayer = document.createElement("div");
    objLayer.className = "sme-objects-layer";
    container.appendChild(objLayer);
    editorState.objectsLayer = objLayer;

    // Drawing canvas (on top)
    const canvas = document.createElement("canvas");
    canvas.className = "sme-draw-canvas sme-canvas-inactive";
    container.appendChild(canvas);
    editorState.drawCanvas = canvas;
    editorState.drawCtx = canvas.getContext("2d");
    smeResizeCanvas();
  }

  function smeResizeCanvas() {
    const canvas = editorState.drawCanvas;
    if (!canvas || !editorState.container) return;
    const rect = smeGetContainerRect();
    let imageData = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try {
        imageData = editorState.drawCtx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } catch (_) {}
    }
    canvas.width = rect.width;
    canvas.height = rect.height;
    if (imageData) {
      try {
        editorState.drawCtx.putImageData(imageData, 0, 0);
      } catch (_) {}
    }
  }

  /* ===== Toolbar ===== */
  function smeCreateToolbar() {
    const container = editorState.container;
    if (!container) return;

    const toolbar = document.createElement("div");
    toolbar.className = "sme-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="sme-toolbar-btn" data-sme-tool="select" data-sme-i18n-title="story.mediaEditor.toolbar.selectMove" data-sme-i18n-fallback="Select / Move" title="${smeT("story.mediaEditor.toolbar.selectMove", {}, "Select / Move")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-tool="draw" data-sme-i18n-title="story.mediaEditor.toolbar.draw" data-sme-i18n-fallback="Draw" title="${smeT("story.mediaEditor.toolbar.draw", {}, "Draw")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-tool="text" data-sme-i18n-title="story.mediaEditor.toolbar.addText" data-sme-i18n-fallback="Add Text" title="${smeT("story.mediaEditor.toolbar.addText", {}, "Add Text")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-tool="sticker" data-sme-i18n-title="story.mediaEditor.toolbar.stickers" data-sme-i18n-fallback="Stickers" title="${smeT("story.mediaEditor.toolbar.stickers", {}, "Stickers")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-action="fitImage" data-sme-i18n-title="story.mediaEditor.toolbar.fitInsideFrame" data-sme-i18n-fallback="Fit Inside Frame" title="${smeT("story.mediaEditor.toolbar.fitInsideFrame", {}, "Fit Inside Frame")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-action="fillImage" data-sme-i18n-title="story.mediaEditor.toolbar.fillEntireFrame" data-sme-i18n-fallback="Fill Entire Frame" title="${smeT("story.mediaEditor.toolbar.fillEntireFrame", {}, "Fill Entire Frame")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </button>
      <div class="sme-toolbar-divider"></div>
      <button type="button" class="sme-toolbar-btn" data-sme-action="undo" data-sme-i18n-title="story.mediaEditor.toolbar.undo" data-sme-i18n-fallback="Undo" title="${smeT("story.mediaEditor.toolbar.undo", {}, "Undo")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
      </button>
      <button type="button" class="sme-toolbar-btn" data-sme-action="redo" data-sme-i18n-title="story.mediaEditor.toolbar.redo" data-sme-i18n-fallback="Redo" title="${smeT("story.mediaEditor.toolbar.redo", {}, "Redo")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 014-4h12"/></svg>
      </button>
      <div class="sme-toolbar-divider"></div>
      <button type="button" class="sme-toolbar-btn sme-btn-danger" data-sme-action="delete" data-sme-i18n-title="story.mediaEditor.toolbar.deleteSelected" data-sme-i18n-fallback="Delete Selected" title="${smeT("story.mediaEditor.toolbar.deleteSelected", {}, "Delete Selected")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    `;
    const mountTarget = editorState.toolbarMount || container;
    toolbar.classList.toggle("sme-toolbar-panel", !!editorState.toolbarMount);
    mountTarget.appendChild(toolbar);
    editorState.toolbar = toolbar;

    // Draw options
    const drawOpts = document.createElement("div");
    drawOpts.className = "sme-draw-options";
    drawOpts.innerHTML = `
      <div class="sme-option-group">
        <label data-sme-i18n-text="story.mediaEditor.options.color" data-sme-i18n-fallback="Color">${smeT("story.mediaEditor.options.color", {}, "Color")}</label>
        ${smeColorSwatchesHtml("smeDrawColor", DEFAULT_DRAW_COLOR)}
      </div>
      <div class="sme-option-group">
        <label data-sme-i18n-text="story.mediaEditor.options.size" data-sme-i18n-fallback="Size">${smeT("story.mediaEditor.options.size", {}, "Size")}</label>
        <span class="sme-size-val" id="smeDrawSizeVal">${DEFAULT_DRAW_SIZE}</span>
        <input type="range" class="sme-size-slider" id="smeDrawSize" min="1" max="20" value="${DEFAULT_DRAW_SIZE}" />
      </div>
    `;
    toolbar.appendChild(drawOpts);
    editorState.drawOptions = drawOpts;

    // Text options
    const textOpts = document.createElement("div");
    textOpts.className = "sme-text-options";
    const fontHtml = FONT_OPTIONS.map(
      (f) => `<option value="${f.value}" data-sme-i18n-text="${f.labelKey || ""}" data-sme-i18n-fallback="${f.label}" style="font-family:${f.value}">${smeT(f.labelKey || "", {}, f.label)}</option>`,
    ).join("");
    textOpts.innerHTML = `
      <div class="sme-option-group">
        <label data-sme-i18n-text="story.mediaEditor.options.color" data-sme-i18n-fallback="Color">${smeT("story.mediaEditor.options.color", {}, "Color")}</label>
        ${smeColorSwatchesHtml("smeTextColor", DEFAULT_TEXT_COLOR)}
      </div>
      <div class="sme-option-group">
        <label data-sme-i18n-text="story.mediaEditor.options.size" data-sme-i18n-fallback="Size">${smeT("story.mediaEditor.options.size", {}, "Size")}</label>
        <span class="sme-size-val" id="smeTextSizeVal">${DEFAULT_TEXT_SIZE}</span>
        <input type="range" class="sme-size-slider" id="smeTextSize" min="12" max="72" value="${DEFAULT_TEXT_SIZE}" />
      </div>
      <div class="sme-option-group">
        <label data-sme-i18n-text="story.mediaEditor.options.font" data-sme-i18n-fallback="Font">${smeT("story.mediaEditor.options.font", {}, "Font")}</label>
        <select class="sme-font-select" id="smeTextFont">${fontHtml}</select>
      </div>
    `;
    toolbar.appendChild(textOpts);
    editorState.textOptions = textOpts;

    // Sticker picker
    const stickerPicker = document.createElement("div");
    stickerPicker.className = "sme-sticker-picker";
    let sHtml = "";
    for (const cat of STICKER_CATALOG) {
      sHtml += `<p class="sme-sticker-category-title" data-sme-i18n-text="${cat.labelKey || ""}" data-sme-i18n-fallback="${cat.name}">${smeT(cat.labelKey || "", {}, cat.name)}</p><div class="sme-sticker-grid">`;
      for (const s of cat.stickers) {
        sHtml += `<button type="button" class="sme-sticker-item" data-sme-sticker="${s.emoji}" title="${s.id}">${s.emoji}</button>`;
      }
      sHtml += `</div>`;
    }
    stickerPicker.innerHTML = sHtml;
    toolbar.appendChild(stickerPicker);
    editorState.stickerPicker = stickerPicker;

    // Hidden file input for adding images
    const addImgInput = document.createElement("input");
    addImgInput.type = "file";
    addImgInput.accept = "image/*";
    addImgInput.multiple = true;
    addImgInput.style.display = "none";
    addImgInput.addEventListener("change", smeHandleAddImageFiles);
    container.appendChild(addImgInput);
    editorState._addImageInput = addImgInput;

    smeBindToolbarEvents(toolbar);
    smeRefreshLocalization();
  }

  /* ===== Toolbar Events ===== */
  function smeBindToolbarEvents(toolbar) {
    toolbar.addEventListener("click", (e) => {
      const toolBtn = e.target.closest("[data-sme-tool]");
      if (toolBtn) {
        e.stopPropagation();
        const clickedTool = toolBtn.getAttribute("data-sme-tool");
        // Toggle: if already active and not select, revert to select
        if (
          clickedTool === editorState.activeTool &&
          clickedTool !== "select"
        ) {
          smeSetActiveTool("select");
        } else {
          smeSetActiveTool(clickedTool);
        }
        return;
      }
      const actionBtn = e.target.closest("[data-sme-action]");
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.getAttribute("data-sme-action");
        if (action === "undo") smeUndo();
        if (action === "redo") smeRedo();
        if (action === "addImage" && editorState._addImageInput) {
          editorState._addImageInput.click();
        }
        if (action === "fitImage") smeFitImageToFrame();
        if (action === "fillImage") smeFillImageToFrame();
        if (action === "delete" && editorState.selectedObjectId) {
          smeDeleteObject(editorState.selectedObjectId);
        }
        return;
      }
      const stickerItem = e.target.closest("[data-sme-sticker]");
      if (stickerItem) {
        e.stopPropagation();
        smeAddStickerObject(stickerItem.getAttribute("data-sme-sticker"));
        return;
      }

      // Color swatch click
      const colorSwatch = e.target.closest("[data-sme-color]");
      if (colorSwatch) {
        e.stopPropagation();
        const color = colorSwatch.getAttribute("data-sme-color");
        const targetId = colorSwatch.getAttribute("data-sme-color-target");
        const hiddenInput = toolbar.querySelector("#" + targetId);
        if (hiddenInput) hiddenInput.value = color;
        if (targetId === "smeDrawColor") {
          editorState.drawColor = color;
        } else if (targetId === "smeTextColor") {
          const obj = editorState.objects.find(
            (o) => o.id === editorState.selectedObjectId && o.type === "text",
          );
          if (obj) { obj.color = color; smeRenderObject(obj); smeSaveHistory(); }
        }
        const parent = colorSwatch.closest(".sme-color-presets");
        if (parent) {
          parent.querySelectorAll(".sme-color-swatch").forEach(s => s.classList.remove("sme-color-active"));
          colorSwatch.classList.add("sme-color-active");
        }
        return;
      }

      // Custom color button → open hidden picker
      const customBtn = e.target.closest("[data-sme-color-custom]");
      if (customBtn) {
        e.stopPropagation();
        const targetId = customBtn.getAttribute("data-sme-color-custom");
        const hiddenInput = toolbar.querySelector("#" + targetId);
        if (hiddenInput) hiddenInput.click();
        return;
      }
    });

    // Draw color from hidden picker
    const drawColorEl = toolbar.querySelector("#smeDrawColor");
    if (drawColorEl)
      drawColorEl.addEventListener("input", (e) => {
        editorState.drawColor = e.target.value;
      });
    const drawSizeEl = toolbar.querySelector("#smeDrawSize");
    if (drawSizeEl)
      drawSizeEl.addEventListener("input", (e) => {
        editorState.drawSize = Number(e.target.value) || DEFAULT_DRAW_SIZE;
        const lbl = toolbar.querySelector("#smeDrawSizeVal");
        if (lbl) lbl.textContent = e.target.value;
      });

    // Text color from hidden picker
    const textColorEl = toolbar.querySelector("#smeTextColor");
    if (textColorEl) {
      textColorEl.addEventListener("input", (e) => {
        const obj = editorState.objects.find(
          (o) => o.id === editorState.selectedObjectId && o.type === "text",
        );
        if (obj) {
          obj.color = e.target.value;
          smeRenderObject(obj);
          smeSaveHistory();
        }
      });
    }
    const textSizeEl = toolbar.querySelector("#smeTextSize");
    if (textSizeEl) {
      textSizeEl.addEventListener("input", (e) => {
        const val = smeClamp(Number(e.target.value) || DEFAULT_TEXT_SIZE, 12, 72);
        const lbl = toolbar.querySelector("#smeTextSizeVal");
        if (lbl) lbl.textContent = val;
        const obj = editorState.objects.find(
          (o) => o.id === editorState.selectedObjectId && o.type === "text",
        );
        if (obj) {
          obj.fontSize = val;
          smeRenderObject(obj);
          smeSaveHistory();
        }
      });
    }
    const textFontEl = toolbar.querySelector("#smeTextFont");
    if (textFontEl) {
      textFontEl.addEventListener("change", (e) => {
        const obj = editorState.objects.find(
          (o) => o.id === editorState.selectedObjectId && o.type === "text",
        );
        if (obj) {
          obj.fontFamily = e.target.value;
          smeRenderObject(obj);
          smeSaveHistory();
        }
      });
    }
  }

  /* ===== Handle Add Image Files ===== */
  function smeHandleAddImageFiles(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      editorState._createdObjectUrls.push(url);
      const img = new Image();
      img.onload = () => {
        const rect = smeGetContainerRect();
        const maxW = rect.width * 0.6;
        const maxH = rect.height * 0.6;
        const scale = Math.min(
          maxW / img.naturalWidth,
          maxH / img.naturalHeight,
          1,
        );
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        const x = (rect.width - w) / 2;
        const y = (rect.height - h) / 2;
        smeAddImageObject(url, w, h, x, y);
      };
      img.src = url;
    }
    e.target.value = "";
  }

  /* ===== Tool Switching ===== */
  function smeSetActiveTool(toolName) {
    editorState.activeTool = toolName;
    if (editorState.toolbar) {
      editorState.toolbar.querySelectorAll("[data-sme-tool]").forEach((btn) => {
        btn.classList.toggle(
          "sme-active",
          btn.getAttribute("data-sme-tool") === toolName,
        );
      });
    }
    const canvas = editorState.drawCanvas;
    if (canvas)
      canvas.classList.toggle("sme-canvas-inactive", toolName !== "draw");
    if (editorState.drawOptions)
      editorState.drawOptions.classList.toggle("sme-show", toolName === "draw");
    if (editorState.textOptions)
      editorState.textOptions.classList.toggle("sme-show", toolName === "text");
    if (editorState.stickerPicker)
      editorState.stickerPicker.classList.toggle(
        "sme-show",
        toolName === "sticker",
      );
    if (toolName === "draw") smeDeselectAll();

    // If switching AWAY from text tool, cleanup empty text objects
    if (toolName !== "text") {
      smeCleanupEmptyTextObjects();
    }
  }

  function smeCleanupEmptyTextObjects() {
    const toDelete = editorState.objects.filter(
      (o) => o.type === "text" && !o.text.trim() && o.id !== editorState.editingTextId,
    );
    toDelete.forEach((obj) => smeDeleteObject(obj.id));
  }

  /* ===== Drawing ===== */
  function smeGetPointerPos(e) {
    const canvas = editorState.drawCanvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function smeStartDraw(e) {
    if (editorState.activeTool !== "draw") return;
    editorState.isDrawing = true;
    editorState.lastPoint = smeGetPointerPos(e);
    const ctx = editorState.drawCtx;
    if (!ctx) return;
    ctx.strokeStyle = editorState.drawColor;
    ctx.lineWidth = editorState.drawSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(editorState.lastPoint.x, editorState.lastPoint.y);
  }

  function smeMoveDraw(e) {
    if (!editorState.isDrawing) return;
    const pos = smeGetPointerPos(e);
    const ctx = editorState.drawCtx;
    if (!ctx || !editorState.lastPoint) return;
    const mid = {
      x: (editorState.lastPoint.x + pos.x) / 2,
      y: (editorState.lastPoint.y + pos.y) / 2,
    };
    ctx.quadraticCurveTo(
      editorState.lastPoint.x,
      editorState.lastPoint.y,
      mid.x,
      mid.y,
    );
    ctx.stroke();
    editorState.lastPoint = pos;
  }

  function smeEndDraw() {
    if (!editorState.isDrawing) return;
    editorState.isDrawing = false;
    editorState.lastPoint = null;
    editorState.hasAnyEdit = true;
    smeSaveHistory();
  }

  function smeBindDrawEvents() {
    const canvas = editorState.drawCanvas;
    if (!canvas) return;
    const onDown = (e) => {
      e.preventDefault();
      smeStartDraw(e);
    };
    const onMove = (e) => {
      e.preventDefault();
      smeMoveDraw(e);
    };
    const onUp = () => smeEndDraw();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);
    editorState._boundListeners.push(
      { el: canvas, type: "pointerdown", fn: onDown },
      { el: canvas, type: "pointermove", fn: onMove },
      { el: canvas, type: "pointerup", fn: onUp },
      { el: canvas, type: "pointerleave", fn: onUp },
    );
  }

  /* ===== Object Management ===== */
  function smeAddImageObject(src, w, h, x, y) {
    const obj = {
      id: smeGenerateId(),
      type: "image",
      src: src,
      x: x,
      y: y,
      width: w,
      height: h,
      rotation: 0,
    };
    editorState.objects.push(obj);
    smeRenderObject(obj);
    smeSelectObject(obj.id);
    editorState.hasAnyEdit = true;
    smeSaveHistory();
    smeSetActiveTool("select");
  }

  /* ===== Fit Image to Frame ===== */
  function smeFitImageToFrame() {
    const obj = editorState.objects.find(
      (o) => o.id === editorState.selectedObjectId && o.type === "image",
    );
    if (!obj) return;
    const rect = smeGetContainerRect();
    const ar = obj.width / obj.height;
    const frameAr = rect.width / rect.height;
    let newW, newH;
    if (ar > frameAr) {
      // Image is wider than frame → match width
      newW = rect.width;
      newH = newW / ar;
    } else {
      // Image is taller (or equal) → match height
      newH = rect.height;
      newW = newH * ar;
    }
    obj.width = newW;
    obj.height = newH;
    obj.x = (rect.width - newW) / 2;
    obj.y = (rect.height - newH) / 2;
    smeRenderObject(obj);
    editorState.hasAnyEdit = true;
    smeSaveHistory();
  }

  /* ===== Fill Entire Frame (Cover) ===== */
  function smeFillImageToFrame() {
    const obj = editorState.objects.find(
      (o) => o.id === editorState.selectedObjectId && o.type === "image",
    );
    if (!obj) return;
    const rect = smeGetContainerRect();
    const ar = obj.width / obj.height;
    const frameAr = rect.width / rect.height;
    let newW, newH;
    if (ar > frameAr) {
      // Image is wider than frame → scale so height fills the frame
      newH = rect.height;
      newW = newH * ar;
    } else {
      // Image is taller than frame → scale so width fills the frame
      newW = rect.width;
      newH = newW / ar;
    }
    obj.width = newW;
    obj.height = newH;
    obj.x = (rect.width - newW) / 2;
    obj.y = (rect.height - newH) / 2;
    smeRenderObject(obj);
    editorState.hasAnyEdit = true;
    smeSaveHistory();
  }

  function smeAddTextObject(clickX, clickY) {
    const rect = smeGetContainerRect();
    const w = 180;
    const h = 50;
    let x = (rect.width - w) / 2;
    let y = (rect.height - h) / 2;
    if (typeof clickX === "number" && typeof clickY === "number") {
      x = Math.max(0, Math.min(clickX - w / 2, rect.width - w));
      y = Math.max(0, Math.min(clickY - h / 2, rect.height - h));
    }
    // Use current panel values (if user pre-selected) or defaults
    const curColor = editorState.toolbar?.querySelector("#smeTextColor")?.value || DEFAULT_TEXT_COLOR;
    const curSize = Number(editorState.toolbar?.querySelector("#smeTextSize")?.value) || DEFAULT_TEXT_SIZE;
    const curFont = editorState.toolbar?.querySelector("#smeTextFont")?.value || DEFAULT_TEXT_FONT;
    const obj = {
      id: smeGenerateId(),
      type: "text",
      x,
      y,
      width: w,
      height: h,
      text: "",
      color: curColor,
      fontSize: curSize,
      fontFamily: curFont,
      rotation: 0,
    };
    editorState.objects.push(obj);
    smeRenderObject(obj);
    smeSelectObject(obj.id);
    editorState.hasAnyEdit = true;
    smeSaveHistory();
    setTimeout(() => smeStartEditText(obj.id), 50);
  }

  function smeAddStickerObject(emoji) {
    const rect = smeGetContainerRect();
    const size = 72;
    const obj = {
      id: smeGenerateId(),
      type: "sticker",
      x: (rect.width - size) / 2,
      y: (rect.height - size) / 2,
      width: size,
      height: size,
      emoji: emoji,
      rotation: 0,
    };
    editorState.objects.push(obj);
    smeRenderObject(obj);
    smeSelectObject(obj.id);
    editorState.hasAnyEdit = true;
    smeSaveHistory();
  }

  /* ===== Object Rendering ===== */
  function smeRenderObject(obj) {
    if (!editorState.objectsLayer) return;
    let el = editorState.objectsLayer.querySelector(
      `[data-sme-obj-id="${obj.id}"]`,
    );
    const isNew = !el;

    if (isNew) {
      el = document.createElement("div");
      el.className = "sme-object";
      el.setAttribute("data-sme-obj-id", String(obj.id));

      // Delete handle
      const delBtn = document.createElement("button");
      delBtn.className = "sme-delete-handle";
      delBtn.innerHTML = "×";
      delBtn.type = "button";
      el.appendChild(delBtn);

      // 8 resize handles
      const handlesContainer = document.createElement("div");
      handlesContainer.className = "sme-handles-container";
      for (const dir of HANDLE_DIRS) {
        const h = document.createElement("div");
        h.className = `sme-handle sme-handle-${dir}`;
        h.setAttribute("data-sme-handle", dir);
        handlesContainer.appendChild(h);
      }
      // Rotation handle
      const rotH = document.createElement("div");
      rotH.className = "sme-handle sme-handle-rotate";
      rotH.setAttribute("data-sme-handle", "rotate");
      handlesContainer.appendChild(rotH);
      el.appendChild(handlesContainer);
    }

    // Position, size, rotation
    el.style.left = `${obj.x}px`;
    el.style.top = `${obj.y}px`;
    el.style.width = `${obj.width}px`;
    el.style.height = `${obj.height}px`;
    el.style.transform = `rotate(${obj.rotation || 0}deg)`;

    // Type-specific content
    if (obj.type === "image") {
      el.classList.add("sme-image-object");
      el.classList.remove("sme-text-object", "sme-sticker-object");
      let imgEl = el.querySelector(".sme-image-content");
      if (!imgEl) {
        imgEl = document.createElement("img");
        imgEl.className = "sme-image-content";
        imgEl.draggable = false;
        imgEl.crossOrigin = "anonymous";
        el.insertBefore(imgEl, el.firstChild);
      }
      imgEl.src = obj.src;
    } else if (obj.type === "text") {
      el.classList.add("sme-text-object");
      el.classList.remove("sme-image-object", "sme-sticker-object");
      let textNode = el.querySelector(".sme-text-content");
      if (!textNode) {
        textNode = document.createElement("span");
        textNode.className = "sme-text-content";
        el.insertBefore(textNode, el.firstChild);
      }
      // Don't overwrite text content while user is actively editing
      if (editorState.editingTextId !== obj.id) {
        textNode.textContent = obj.text;
      }
      textNode.style.color = obj.color;
      textNode.style.fontSize = `${obj.fontSize}px`;
      textNode.style.fontFamily = obj.fontFamily;
      // Auto-fit height to content (keep width fixed)
      el.style.height = "auto";
      const fitH = Math.max(textNode.scrollHeight + 4, obj.fontSize + 16);
      obj.height = fitH;
      el.style.height = `${fitH}px`;
    } else if (obj.type === "sticker") {
      el.classList.add("sme-sticker-object");
      el.classList.remove("sme-image-object", "sme-text-object");
      let stickerNode = el.querySelector(".sme-sticker-content");
      if (!stickerNode) {
        stickerNode = document.createElement("span");
        stickerNode.className = "sme-sticker-content";
        el.insertBefore(stickerNode, el.firstChild);
      }
      stickerNode.textContent = obj.emoji;
      stickerNode.style.fontSize = `${Math.min(obj.width, obj.height) * 0.85}px`;
    }

    if (isNew) {
      editorState.objectsLayer.appendChild(el);
      smeBindObjectEvents(el, obj.id);
    }

    el.classList.toggle(
      "sme-selected",
      obj.id === editorState.selectedObjectId,
    );
  }

  /* ===== Delete / Select / Deselect ===== */
  function smeRemoveObjectDOM(objId) {
    if (!editorState.objectsLayer) return;
    const el = editorState.objectsLayer.querySelector(
      `[data-sme-obj-id="${objId}"]`,
    );
    if (el) el.remove();
  }

  function smeDeleteObject(objId) {
    editorState.objects = editorState.objects.filter((o) => o.id !== objId);
    smeRemoveObjectDOM(objId);
    if (editorState.selectedObjectId === objId)
      editorState.selectedObjectId = null;
    editorState.hasAnyEdit = true;
    smeSaveHistory();

    // When all objects are removed, notify parent to reset
    if (
      editorState.objects.length === 0 &&
      typeof editorState._onEmptyCallback === "function"
    ) {
      editorState._onEmptyCallback();
    }
  }

  function smeSelectObject(objId) {
    editorState.selectedObjectId = objId;
    if (editorState.objectsLayer) {
      editorState.objectsLayer.querySelectorAll(".sme-object").forEach((el) => {
        el.classList.toggle(
          "sme-selected",
          el.getAttribute("data-sme-obj-id") === String(objId),
        );
      });
    }
    const obj = editorState.objects.find((o) => o.id === objId);
    if (obj && obj.type === "text") {
      const colorEl = editorState.toolbar?.querySelector("#smeTextColor");
      const sizeEl = editorState.toolbar?.querySelector("#smeTextSize");
      const fontEl = editorState.toolbar?.querySelector("#smeTextFont");
      if (colorEl) colorEl.value = obj.color;
      if (sizeEl) sizeEl.value = String(obj.fontSize);
      if (fontEl) fontEl.value = obj.fontFamily;
    }
  }

  function smeDeselectAll() {
    editorState.selectedObjectId = null;
    if (editorState.objectsLayer) {
      editorState.objectsLayer
        .querySelectorAll(".sme-selected")
        .forEach((el) => el.classList.remove("sme-selected"));
    }
    smeStopEditText();
  }

  /* ===== Text Editing ===== */
  function smeStartEditText(objId) {
    const obj = editorState.objects.find(
      (o) => o.id === objId && o.type === "text",
    );
    if (!obj) return;
    editorState.editingTextId = objId;
    const el = editorState.objectsLayer?.querySelector(
      `[data-sme-obj-id="${objId}"]`,
    );
    if (!el) return;
    const textNode = el.querySelector(".sme-text-content");
    if (!textNode) return;

    textNode.contentEditable = "true";
    textNode.focus();
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // Auto-expand height only (width stays fixed)
    const autoHeight = () => {
      el.style.height = "auto";
      const fitH = Math.max(textNode.scrollHeight + 4, obj.fontSize + 16);
      obj.height = fitH;
      el.style.height = `${fitH}px`;
    };

    const onInput = () => autoHeight();

    const onBlur = () => {
      textNode.contentEditable = "false";
      textNode.removeEventListener("blur", onBlur);
      textNode.removeEventListener("keydown", onKeyDown);
      textNode.removeEventListener("input", onInput);
      const finalText = (textNode.textContent || "").trim();
      editorState.editingTextId = null;

      // Don't delete immediately if we are still using the text tool
      // Just update the object's text (can be empty)
      obj.text = finalText;
      textNode.textContent = finalText;
      autoHeight();
      smeSaveHistory();
    };
    const onKeyDown = (e) => {
      // Escape finishes editing
      if (e.key === "Escape") {
        e.preventDefault();
        textNode.blur();
      }
      // Enter is allowed (inserts newline via contentEditable default)
    };
    textNode.addEventListener("blur", onBlur);
    textNode.addEventListener("keydown", onKeyDown);
    textNode.addEventListener("input", onInput);
  }

  function smeStopEditText() {
    if (!editorState.editingTextId) return;
    const el = editorState.objectsLayer?.querySelector(
      `[data-sme-obj-id="${editorState.editingTextId}"]`,
    );
    if (el) {
      const textNode = el.querySelector(".sme-text-content");
      if (textNode) {
        textNode.contentEditable = "false";
        textNode.blur();
      }
    }
    editorState.editingTextId = null;
  }

  /* ===== Object Events (Drag + Resize) ===== */
  function smeBindObjectEvents(el, objId) {
    // Delete button
    const delBtn = el.querySelector(".sme-delete-handle");
    if (delBtn) {
      delBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        smeDeleteObject(objId);
      });
    }

    // Resize handles
    el.querySelectorAll(".sme-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const obj = editorState.objects.find((o) => o.id === objId);
        if (!obj) return;
        editorState.isResizing = true;
        editorState.resizeObjId = objId;
        editorState.resizeHandle = handle.getAttribute("data-sme-handle");
        editorState.resizeStartX = e.clientX;
        editorState.resizeStartY = e.clientY;
        editorState.resizeStartObj = {
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        };
      });
    });

    // Drag
    el.addEventListener("pointerdown", (e) => {
      if (
        e.target.closest(".sme-delete-handle") ||
        e.target.closest(".sme-handle")
      )
        return;

      // Text tool: clicking an existing text → edit it; clicking anything else → create text here
      if (editorState.activeTool === "text") {
        const obj = editorState.objects.find((o) => o.id === objId);
        if (obj && obj.type === "text") {
          smeSelectObject(objId);
          smeStartEditText(objId);
          return;
        }
        // Non-text object clicked while text tool active → create text at click pos
        e.stopPropagation();
        const containerRect = editorState.container.getBoundingClientRect();
        smeAddTextObject(e.clientX - containerRect.left, e.clientY - containerRect.top);
        return;
      }
      if (editorState.editingTextId === objId) return;

      e.preventDefault();
      e.stopPropagation();
      smeSelectObject(objId);

      const obj = editorState.objects.find((o) => o.id === objId);
      if (!obj) return;

      const containerRect = smeGetContainerRect();
      editorState.isDragging = true;
      editorState.dragObjId = objId;
      editorState.dragOffsetX = e.clientX - containerRect.left - obj.x;
      editorState.dragOffsetY = e.clientY - containerRect.top - obj.y;
      el.classList.add("sme-dragging");
    });

    // Dblclick edit text
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const obj = editorState.objects.find((o) => o.id === objId);
      if (obj && obj.type === "text") {
        smeSelectObject(objId);
        smeStartEditText(objId);
      }
    });
  }

  /* ===== Global Drag/Resize Handlers ===== */
  function smeBindGlobalDragEvents() {
    const onMove = (e) => {
      // Resize
      if (editorState.isResizing) {
        const obj = editorState.objects.find(
          (o) => o.id === editorState.resizeObjId,
        );
        if (!obj || !editorState.resizeStartObj) return;

        const dx = e.clientX - editorState.resizeStartX;
        const dy = e.clientY - editorState.resizeStartY;
        const s = editorState.resizeStartObj;
        const ar = s.width / s.height;
        const h = editorState.resizeHandle;

        let newX = s.x,
          newY = s.y,
          newW = s.width,
          newH = s.height;

        // Corner handles – proportional
        if (h === "se") {
          newW = Math.max(MIN_OBJ_SIZE, s.width + dx);
          newH = newW / ar;
        } else if (h === "sw") {
          newW = Math.max(MIN_OBJ_SIZE, s.width - dx);
          newH = newW / ar;
          newX = s.x + s.width - newW;
        } else if (h === "ne") {
          newW = Math.max(MIN_OBJ_SIZE, s.width + dx);
          newH = newW / ar;
          newY = s.y + s.height - newH;
        } else if (h === "nw") {
          newW = Math.max(MIN_OBJ_SIZE, s.width - dx);
          newH = newW / ar;
          newX = s.x + s.width - newW;
          newY = s.y + s.height - newH;
        }
        // Edge handles – stretch
        else if (h === "e") {
          newW = Math.max(MIN_OBJ_SIZE, s.width + dx);
        } else if (h === "w") {
          newW = Math.max(MIN_OBJ_SIZE, s.width - dx);
          newX = s.x + s.width - newW;
        } else if (h === "s") {
          newH = Math.max(MIN_OBJ_SIZE, s.height + dy);
        } else if (h === "n") {
          newH = Math.max(MIN_OBJ_SIZE, s.height - dy);
          newY = s.y + s.height - newH;
        } else if (h === "rotate") {
          const containerRect = smeGetContainerRect();
          const centerX = obj.x + obj.width / 2;
          const centerY = obj.y + obj.height / 2;
          const mouseX = e.clientX - containerRect.left;
          const mouseY = e.clientY - containerRect.top;

          const dxMouse = mouseX - centerX;
          const dyMouse = mouseY - centerY;

          // atan2 returns angle in radians. convert to degrees.
          // Adjust by 90deg because the rotate handle is at the top
          let angle = Math.atan2(dyMouse, dxMouse) * (180 / Math.PI) + 90;
          obj.rotation = angle;
          smeRenderObject(obj);
          return;
        }

        obj.x = newX;
        obj.y = newY;
        obj.width = newW;
        obj.height = newH;
        smeRenderObject(obj);
        return;
      }

      // Drag
      if (editorState.isDragging) {
        const obj = editorState.objects.find(
          (o) => o.id === editorState.dragObjId,
        );
        if (!obj) return;
        const containerRect = smeGetContainerRect();
        obj.x = e.clientX - containerRect.left - editorState.dragOffsetX;
        obj.y = e.clientY - containerRect.top - editorState.dragOffsetY;
        smeRenderObject(obj);
      }
    };

    const onUp = () => {
      if (editorState.isResizing) {
        editorState.isResizing = false;
        editorState.resizeObjId = null;
        editorState.resizeHandle = null;
        editorState.resizeStartObj = null;
        editorState.hasAnyEdit = true;
        smeSaveHistory();
      }
      if (editorState.isDragging) {
        const el = editorState.objectsLayer?.querySelector(
          `[data-sme-obj-id="${editorState.dragObjId}"]`,
        );
        if (el) el.classList.remove("sme-dragging");
        editorState.isDragging = false;
        editorState.dragObjId = null;
        editorState.hasAnyEdit = true;
        smeSaveHistory();
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    editorState._boundListeners.push(
      { el: document, type: "pointermove", fn: onMove },
      { el: document, type: "pointerup", fn: onUp },
    );
  }

  /* ===== Objects Layer Click ===== */
  function smeBindObjectsLayerClick() {
    if (!editorState.objectsLayer) return;
    const onClick = (e) => {
      if (e.target.closest(".sme-object")) return;
      if (editorState.activeTool === "text") {
        const containerRect = editorState.container.getBoundingClientRect();
        smeAddTextObject(e.clientX - containerRect.left, e.clientY - containerRect.top);
        return;
      }
      smeDeselectAll();
    };
    editorState.objectsLayer.addEventListener("pointerdown", onClick);
    editorState._boundListeners.push({
      el: editorState.objectsLayer,
      type: "pointerdown",
      fn: onClick,
    });
  }

  /* ===== Keyboard ===== */
  function smeBindKeyboard() {
    const onKeyDown = (e) => {
      if (!editorState.active) return;
      if (editorState.editingTextId) return;

      // Delete/Backspace → delete selected
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        editorState.selectedObjectId
      ) {
        e.preventDefault();
        smeDeleteObject(editorState.selectedObjectId);
        return;
      }
      // Ctrl+Z / Cmd+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        smeUndo();
        return;
      }
      // Ctrl+Shift+Z / Ctrl+Y → redo
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        smeRedo();
        return;
      }
      // Escape → deselect
      if (e.key === "Escape") {
        smeDeselectAll();
        smeSetActiveTool("select");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    editorState._boundListeners.push({
      el: document,
      type: "keydown",
      fn: onKeyDown,
    });

    // Click outside editor → reset tool to select
    const onClickOutside = (e) => {
      if (!editorState.active) return;
      if (editorState.container && !editorState.container.contains(e.target) &&
          (!editorState.toolbar || !editorState.toolbar.contains(e.target))) {
        smeSetActiveTool("select");
        smeDeselectAll();
      }
    };
    document.addEventListener("pointerdown", onClickOutside);
    editorState._boundListeners.push({
      el: document,
      type: "pointerdown",
      fn: onClickOutside,
    });
  }

  /* ===== History ===== */
  function smeSaveHistory() {
    const snapshot = {
      objects: JSON.parse(JSON.stringify(editorState.objects)),
      bgColor: editorState.bgColor,
      drawingDataUrl: null,
    };
    try {
      if (editorState.drawCanvas && editorState.drawCanvas.width > 0) {
        snapshot.drawingDataUrl = editorState.drawCanvas.toDataURL();
      }
    } catch (_) {}

    // Trim future history
    if (editorState.historyIndex < editorState.history.length - 1) {
      editorState.history = editorState.history.slice(
        0,
        editorState.historyIndex + 1,
      );
    }
    editorState.history.push(snapshot);
    if (editorState.history.length > MAX_HISTORY) {
      editorState.history.shift();
    }
    editorState.historyIndex = editorState.history.length - 1;
  }

  function smeRestoreSnapshot(snapshot) {
    // Restore objects
    const oldIds = editorState.objects.map((o) => o.id);
    editorState.objects = JSON.parse(JSON.stringify(snapshot.objects));
    // Remove old DOM
    oldIds.forEach((id) => smeRemoveObjectDOM(id));
    // Render new
    editorState.objects.forEach((obj) => smeRenderObject(obj));

    // Restore bg color
    editorState.bgColor = snapshot.bgColor || DEFAULT_BG_COLOR;
    if (editorState.container)
      editorState.container.style.background = editorState.bgColor;
    const bgInput = editorState.toolbar?.querySelector("#smeBgColor");
    if (bgInput) bgInput.value = editorState.bgColor;

    // Restore drawing
    if (snapshot.drawingDataUrl && editorState.drawCanvas) {
      const img = new Image();
      img.onload = () => {
        const ctx = editorState.drawCtx;
        ctx.clearRect(
          0,
          0,
          editorState.drawCanvas.width,
          editorState.drawCanvas.height,
        );
        ctx.drawImage(img, 0, 0);
      };
      img.src = snapshot.drawingDataUrl;
    } else if (editorState.drawCanvas) {
      editorState.drawCtx.clearRect(
        0,
        0,
        editorState.drawCanvas.width,
        editorState.drawCanvas.height,
      );
    }

    editorState.selectedObjectId = null;
    editorState.nextObjectId =
      Math.max(1, ...editorState.objects.map((o) => o.id)) + 1;
  }

  function smeUndo() {
    if (editorState.historyIndex <= 0) return;
    editorState.historyIndex--;
    smeRestoreSnapshot(editorState.history[editorState.historyIndex]);
  }

  function smeRedo() {
    if (editorState.historyIndex >= editorState.history.length - 1) return;
    editorState.historyIndex++;
    smeRestoreSnapshot(editorState.history[editorState.historyIndex]);
  }

  /* ===== Export ===== */
  async function smeExportBlob() {
    if (!editorState.container) throw new Error("Editor not active");

    editorState.container.classList.add("sme-exporting");
    smeDeselectAll();
    await new Promise((r) => setTimeout(r, 50));

    try {
      if (typeof global.html2canvas !== "function") {
        throw new Error("html2canvas is not loaded.");
      }

      const rect = editorState.container.getBoundingClientRect();
      const scaleFactor = EXPORT_SIZE / Math.max(rect.width, 1);

      const canvasResult = await global.html2canvas(editorState.container, {
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
        scale: scaleFactor,
        logging: false,
        ignoreElements: (el) => {
          return (
            el.classList?.contains("sme-toolbar") ||
            el.classList?.contains("sme-delete-handle") ||
            el.classList?.contains("sme-handles-container")
          );
        },
      });

      let finalCanvas = canvasResult;
      if (
        canvasResult.width !== EXPORT_SIZE ||
        canvasResult.height !== EXPORT_SIZE
      ) {
        finalCanvas = document.createElement("canvas");
        finalCanvas.width = EXPORT_SIZE;
        finalCanvas.height = EXPORT_SIZE;
        const fCtx = finalCanvas.getContext("2d");
        // Only fill solid colors; gradients are already captured by html2canvas
        const bg = editorState.bgColor || "";
        if (bg.startsWith("#") || bg.startsWith("rgb")) {
          fCtx.fillStyle = bg;
          fCtx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
        }
        fCtx.drawImage(canvasResult, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
      }

      return new Promise((resolve, reject) => {
        finalCanvas.toBlob(
          (blob) => {
            blob ? resolve(blob) : reject(new Error("Failed to export"));
          },
          EXPORT_TYPE,
          EXPORT_QUALITY,
        );
      });
    } finally {
      editorState.container.classList.remove("sme-exporting");
    }
  }

  /* ===== Init / Destroy ===== */
  async function smeInit(containerEl, imageUrl, options) {
    if (editorState.active) smeDestroy();

    // Sync setup
    editorState.active = true;
    editorState.container = containerEl;
    editorState.activeTool = "select";
    editorState.objects = [];
    editorState.nextObjectId = 1;
    editorState.selectedObjectId = null;
    editorState.history = [];
    editorState.historyIndex = -1;
    editorState.hasAnyEdit = false;
    editorState.isDrawing = false;
    editorState.isDragging = false;
    editorState.isResizing = false;
    editorState.editingTextId = null;
    editorState.drawColor = DEFAULT_DRAW_COLOR;
    editorState.drawSize = DEFAULT_DRAW_SIZE;
    editorState.bgColor = DEFAULT_BG_COLOR;
    editorState._boundListeners = [];
    editorState._createdObjectUrls = [];
    editorState._onEmptyCallback =
      typeof options?.onEmpty === "function" ? options.onEmpty : null;
    editorState.toolbarMount =
      options?.toolbarMount instanceof HTMLElement
        ? options.toolbarMount
        : null;

    containerEl.classList.add("sme-active");
    containerEl.style.background = DEFAULT_BG_COLOR;

    smeInitLayers();
    smeCreateToolbar();
    smeBindDrawEvents();
    smeBindGlobalDragEvents();
    smeBindObjectsLayerClick();
    smeBindKeyboard();

    const onResize = () => smeResizeCanvas();
    window.addEventListener("resize", onResize);
    editorState._boundListeners.push({
      el: window,
      type: "resize",
      fn: onResize,
    });

    // Async: load image & extract color
    try {
      // Extract dominant color
      if (typeof global.extractDominantColor === "function") {
        try {
          const color = await global.extractDominantColor(imageUrl);
          editorState.bgColor = color;
          containerEl.style.background = color;
          const bgInput = editorState.toolbar?.querySelector("#smeBgColor");
          if (bgInput) bgInput.value = smeRgbToHex(color);
        } catch (_) {}
      }

      // Load image to get dimensions
      const img = await smeLoadImage(imageUrl);
      const rect = smeGetContainerRect();
      const maxW = rect.width * 0.9;
      const maxH = rect.height * 0.9;
      const scale = Math.min(
        maxW / img.naturalWidth,
        maxH / img.naturalHeight,
        1,
      );
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (rect.width - w) / 2;
      const y = (rect.height - h) / 2;
      smeAddImageObject(imageUrl, w, h, x, y);
    } catch (err) {
      console.error("StoryMediaEditor: failed to load initial image", err);
    }

    smeSaveHistory();
  }

  function smeLoadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function smeRgbToHex(rgb) {
    if (rgb.startsWith("#")) return rgb;
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return DEFAULT_BG_COLOR;
    const r = parseInt(match[0]).toString(16).padStart(2, "0");
    const g = parseInt(match[1]).toString(16).padStart(2, "0");
    const b = parseInt(match[2]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  function smeDestroy() {
    // Remove listeners
    editorState._boundListeners.forEach(({ el, type, fn }) => {
      el.removeEventListener(type, fn);
    });
    editorState._boundListeners = [];

    // Revoke created object URLs
    editorState._createdObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    });
    editorState._createdObjectUrls = [];

    // Clear toolbar from mount point
    if (editorState.toolbarMount) {
      editorState.toolbarMount.innerHTML = "";
    }

    // Clear container
    if (editorState.container) {
      editorState.container.classList.remove("sme-active", "sme-exporting");
      editorState.container.style.background = "";
      editorState.container.innerHTML = "";
    }

    // Reset state
    editorState.active = false;
    editorState.container = null;
    editorState.drawCanvas = null;
    editorState.drawCtx = null;
    editorState.objectsLayer = null;
    editorState.toolbar = null;
    editorState.drawOptions = null;
    editorState.textOptions = null;
    editorState.stickerPicker = null;
    editorState._addImageInput = null;
    editorState.objects = [];
    editorState.history = [];
    editorState.historyIndex = -1;
    editorState.selectedObjectId = null;
    editorState.editingTextId = null;
    editorState.hasAnyEdit = false;
    editorState._onEmptyCallback = null;
  }

  /* ===== Public API ===== */
  global.StoryMediaEditor = {
    init: smeInit,
    destroy: smeDestroy,
    refreshLocalization: smeRefreshLocalization,
    isActive: () => editorState.active,
    exportBlob: smeExportBlob,
    hasEdits: () => editorState.hasAnyEdit,
    getBgColor: () => editorState.bgColor,
    setBgColor: (css) => {
      if (!editorState.active || !editorState.container) return;
      editorState.bgColor = css || DEFAULT_BG_COLOR;
      editorState.container.style.background = editorState.bgColor;
      editorState.hasAnyEdit = true;
      smeSaveHistory();
    },
  };
})(window);
