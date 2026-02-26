/**
 * Media Previewer Utility
 * Handles full-screen preview of images and videos with navigation, thumbnails, and dynamic background
 */
const MediaPreviewer = {
  overlay: null,
  body: null,
  counter: null,
  thumbsContainer: null,
  mediaList: [],
  currentIndex: 0,
  options: {},
  lastRenderId: 0,
  currentRenderId: 0,
  backdropColorCache: new Map(),

  init() {
    if (this.overlay) return;

    // Create DOM elements
    const html = `
            <div id="media-preview-overlay" class="media-preview-overlay">
                <div class="media-preview-toolbar">
                    <button class="preview-tool-btn" onclick="MediaPreviewer.downloadCurrent()" title="Download">
                        <i data-lucide="download"></i>
                    </button>
                    <button class="preview-tool-btn" onclick="MediaPreviewer.close()" title="Close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="media-preview-container">
                    <div class="media-preview-nav prev" id="preview-nav-prev" onclick="MediaPreviewer.prev(event)">
                        <i data-lucide="chevron-left"></i>
                    </div>
                    
                    <div id="media-preview-body">
                        <!-- Content will be injected here -->
                    </div>
                    
                    <div class="media-preview-nav next" id="preview-nav-next" onclick="MediaPreviewer.next(event)">
                        <i data-lucide="chevron-right"></i>
                    </div>
                </div>

                <div id="media-preview-footer" class="media-preview-footer">
                    <div id="media-preview-thumbs" class="media-preview-thumbs"></div>
                </div>
            </div>
        `;

    document.body.insertAdjacentHTML("beforeend", html);
    this.overlay = document.getElementById("media-preview-overlay");
    this.body = document.getElementById("media-preview-body");
    this.thumbsContainer = document.getElementById("media-preview-thumbs");

    // Close on background click
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (!this.overlay.classList.contains("active")) return;

      if (e.key === "Escape") this.close();
      if (e.key === "ArrowLeft") this.prev();
      if (e.key === "ArrowRight") this.next();
    });

    if (window.lucide) lucide.createIcons();
  },

  normalizeId(value) {
    if (value === undefined || value === null) return "";
    return value.toString().trim().toLowerCase();
  },

  clampColor(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(255, Math.round(value)));
  },

  toRgba(r, g, b, alpha = 1) {
    const rr = this.clampColor(r);
    const gg = this.clampColor(g);
    const bb = this.clampColor(b);
    const aa = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    return `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
  },

  parseRgbColor(rawColor) {
    if (typeof rawColor !== "string") return null;
    const color = rawColor.trim();
    if (!color) return null;

    const rgbMatch = color.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
    );
    if (rgbMatch) {
      return {
        r: this.clampColor(Number(rgbMatch[1])),
        g: this.clampColor(Number(rgbMatch[2])),
        b: this.clampColor(Number(rgbMatch[3])),
      };
    }

    const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        };
      }
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }

    return null;
  },

  buildVideoBackdropColors(baseColor) {
    const parsed = this.parseRgbColor(baseColor);
    if (!parsed) {
      return {
        glow: "rgba(56, 125, 255, 0.35)",
        linearFrom: "rgba(12, 18, 38, 0.92)",
        linearTo: "rgba(2, 4, 12, 0.98)",
      };
    }

    const { r, g, b } = parsed;
    return {
      glow: this.toRgba(r, g, b, 0.4),
      linearFrom: this.toRgba(r * 0.45 + 10, g * 0.45 + 10, b * 0.5 + 12, 0.9),
      linearTo: this.toRgba(r * 0.12, g * 0.12, b * 0.15, 0.98),
    };
  },

  buildImageBackdropColors(baseColor) {
    const parsed = this.parseRgbColor(baseColor);
    if (!parsed) return null;

    const { r, g, b } = parsed;
    return {
      glow: this.toRgba(r, g, b, 0.3),
      linearFrom: this.toRgba(r * 0.35 + 8, g * 0.35 + 8, b * 0.4 + 10, 0.88),
      linearTo: this.toRgba(0, 0, 0, 0.98),
    };
  },

  async getDominantColor(sourceUrl) {
    if (!sourceUrl || typeof sourceUrl !== "string") return null;
    if (this.backdropColorCache.has(sourceUrl)) {
      return this.backdropColorCache.get(sourceUrl);
    }
    if (typeof window.extractDominantColor !== "function") {
      this.backdropColorCache.set(sourceUrl, null);
      return null;
    }

    try {
      const color = await window.extractDominantColor(sourceUrl);
      const normalized =
        typeof color === "string" && color.trim() ? color.trim() : null;
      this.backdropColorCache.set(sourceUrl, normalized);
      return normalized;
    } catch (_) {
      this.backdropColorCache.set(sourceUrl, null);
      return null;
    }
  },

  async applyBackdropForItem(item, renderId) {
    if (!this.overlay) return;

    const isVideo = Number(item?.mediaType ?? 0) === 1;
    const colorSource = isVideo
      ? item?.thumbnailUrl ||
        item?.ThumbnailUrl ||
        item?.mediaUrl ||
        item?.MediaUrl ||
        ""
      : item?.mediaUrl || item?.MediaUrl || "";

    const dominantColor = await this.getDominantColor(colorSource);
    if (this.currentRenderId !== renderId) return;

    if (isVideo) {
      this.overlay.classList.add("video-mode");
      const backdrop = this.buildVideoBackdropColors(dominantColor);
      this.overlay.style.setProperty("--dynamic-bg", backdrop.glow);
      this.overlay.style.setProperty(
        "--dynamic-linear-from",
        backdrop.linearFrom,
      );
      this.overlay.style.setProperty("--dynamic-linear-to", backdrop.linearTo);
      return;
    }

    this.overlay.classList.remove("video-mode");
    if (dominantColor) {
      const backdrop = this.buildImageBackdropColors(dominantColor);
      if (backdrop) {
        this.overlay.style.setProperty("--dynamic-bg", backdrop.glow);
        this.overlay.style.setProperty(
          "--dynamic-linear-from",
          backdrop.linearFrom,
        );
        this.overlay.style.setProperty(
          "--dynamic-linear-to",
          backdrop.linearTo,
        );
      } else {
        this.overlay.style.setProperty("--dynamic-bg", dominantColor);
        this.overlay.style.removeProperty("--dynamic-linear-from");
        this.overlay.style.removeProperty("--dynamic-linear-to");
      }
    } else {
      this.overlay.style.removeProperty("--dynamic-bg");
      this.overlay.style.removeProperty("--dynamic-linear-from");
      this.overlay.style.removeProperty("--dynamic-linear-to");
    }
  },

  isOpen() {
    return !!(this.overlay && this.overlay.classList.contains("active"));
  },

  getSource() {
    return (this.options?.source || "").toString().toLowerCase();
  },

  getConversationId() {
    return this.normalizeId(
      this.options?.conversationId || this.options?.ConversationId,
    );
  },

  getCurrentItem() {
    if (!Array.isArray(this.mediaList) || this.mediaList.length === 0)
      return null;
    if (!Number.isFinite(this.currentIndex)) return null;
    if (this.currentIndex < 0 || this.currentIndex >= this.mediaList.length)
      return null;
    return this.mediaList[this.currentIndex] || null;
  },

  _getItemMessageId(item) {
    return this.normalizeId(item?.messageId || item?.MessageId);
  },

  _getItemStableKey(item, index) {
    const messageMediaId = this.normalizeId(
      item?.messageMediaId || item?.MessageMediaId,
    );
    if (messageMediaId) return `mm:${messageMediaId}`;

    const itemKey = (item?.key || "").toString();
    if (itemKey) return `k:${itemKey}`;

    const messageId = this._getItemMessageId(item);
    const mediaUrl = (item?.mediaUrl || item?.MediaUrl || "").toString();
    return `u:${messageId}:${mediaUrl}:${index}`;
  },

  normalizeMediaList(mediaList) {
    if (!Array.isArray(mediaList)) return [];
    return mediaList
      .map((item) => {
        if (typeof item === "string") {
          return { mediaUrl: item, mediaType: 0, thumbnailUrl: "" };
        }
        const mediaUrl = item?.mediaUrl || item?.MediaUrl || "";
        const thumbnailUrl = item?.thumbnailUrl || item?.ThumbnailUrl || "";
        const mediaType =
          item?.mediaType !== undefined
            ? Number(item.mediaType)
            : Number(item?.MediaType ?? 0);
        return {
          ...item,
          mediaUrl,
          thumbnailUrl,
          mediaType: Number.isFinite(mediaType) ? mediaType : 0,
        };
      })
      .filter((item) => !!item.mediaUrl);
  },

  _getNavigationContext() {
    return {
      currentIndex: this.currentIndex,
      mediaLength: this.mediaList.length,
    };
  },

  syncMediaListFromOptions(options = {}) {
    const allowEmpty = !!options.allowEmpty;
    if (typeof this.options?.getMediaList !== "function") return;
    try {
      const provided = this.options.getMediaList(this._getNavigationContext());
      const normalized = this.normalizeMediaList(provided);
      if (!Array.isArray(normalized)) return;
      if (!allowEmpty && normalized.length === 0) return;
      this.mediaList = normalized;
      if (this.currentIndex >= this.mediaList.length) {
        this.currentIndex = this.mediaList.length - 1;
      }
      if (this.currentIndex < 0) this.currentIndex = 0;
    } catch (err) {
      console.error("MediaPreviewer getMediaList failed:", err);
    }
  },

  isViewingMessage(messageId, options = {}) {
    const normalizedMessageId = this.normalizeId(messageId);
    if (!normalizedMessageId || !this.isOpen()) return false;

    this.syncMediaListFromOptions();
    const checkAny = !!options.checkAny;
    const currentItem = this.getCurrentItem();
    if (
      currentItem &&
      this._getItemMessageId(currentItem) === normalizedMessageId
    )
      return true;

    if (!checkAny) return false;
    return this.mediaList.some(
      (item) => this._getItemMessageId(item) === normalizedMessageId,
    );
  },

  syncAfterExternalListMutation(options = {}) {
    if (!this.isOpen()) return false;

    const closeIfEmpty = options.closeIfEmpty !== false;
    const previousIndex = Number.isFinite(this.currentIndex)
      ? this.currentIndex
      : 0;
    const previousItem = this.mediaList[previousIndex] || null;
    const previousKey = previousItem
      ? this._getItemStableKey(previousItem, previousIndex)
      : "";

    this.syncMediaListFromOptions({ allowEmpty: true });

    if (!Array.isArray(this.mediaList) || this.mediaList.length === 0) {
      if (closeIfEmpty) {
        this.close();
      } else {
        if (this.body) this.body.innerHTML = "";
        if (this.thumbsContainer) this.thumbsContainer.innerHTML = "";
        this.updateNavigationButtons();
      }
      return true;
    }

    if (previousKey) {
      const matchedIndex = this.mediaList.findIndex(
        (item, idx) => this._getItemStableKey(item, idx) === previousKey,
      );
      if (matchedIndex >= 0) {
        this.currentIndex = matchedIndex;
      } else {
        this.currentIndex = Math.min(previousIndex, this.mediaList.length - 1);
      }
    } else {
      this.currentIndex = Math.min(previousIndex, this.mediaList.length - 1);
    }

    if (this.currentIndex < 0) this.currentIndex = 0;
    this.render();
    return true;
  },

  shouldLoopNavigation() {
    return this.options?.loop !== false;
  },

  canNavigatePrev() {
    if (this.shouldLoopNavigation()) return this.mediaList.length > 1;
    if (typeof this.options?.canNavigatePrev === "function") {
      try {
        return !!this.options.canNavigatePrev(this._getNavigationContext());
      } catch (err) {
        console.error("MediaPreviewer canNavigatePrev failed:", err);
      }
    }
    return this.currentIndex > 0;
  },

  canNavigateNext() {
    if (this.shouldLoopNavigation()) return this.mediaList.length > 1;
    if (typeof this.options?.canNavigateNext === "function") {
      try {
        return !!this.options.canNavigateNext(this._getNavigationContext());
      } catch (err) {
        console.error("MediaPreviewer canNavigateNext failed:", err);
      }
    }
    return this.currentIndex < this.mediaList.length - 1;
  },

  async requestBoundaryMedia(direction) {
    const fn =
      direction === "prev"
        ? this.options?.requestPrev
        : this.options?.requestNext;
    if (typeof fn !== "function") return false;

    try {
      const loaded = await Promise.resolve(fn(this._getNavigationContext()));
      if (loaded) this.syncMediaListFromOptions();
      return !!loaded;
    } catch (err) {
      console.error(
        `MediaPreviewer request${direction === "prev" ? "Prev" : "Next"} failed:`,
        err,
      );
      return false;
    }
  },

  /**
   * Open previewer with set of media
   * @param {Array} mediaList - Array of {mediaUrl, mediaType} or just strings
   * @param {number} startIndex - Index to start at
   */
  open(mediaList, startIndex = 0, options = null) {
    this.init();

    this.options = options || {};
    this.mediaList = this.normalizeMediaList(mediaList);
    this.syncMediaListFromOptions();
    if (!this.mediaList.length) return;

    const initialIndex = Number(startIndex);
    if (Number.isFinite(initialIndex)) {
      this.currentIndex = Math.min(
        Math.max(initialIndex, 0),
        this.mediaList.length - 1,
      );
    } else {
      this.currentIndex = 0;
    }

    this.render();
    this.overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  async render() {
    this.syncMediaListFromOptions();
    if (this.currentIndex >= this.mediaList.length) {
      this.currentIndex = Math.max(0, this.mediaList.length - 1);
    }

    const item = this.mediaList[this.currentIndex];
    if (!item) return;

    // Use a render version ID to prevent race conditions from rapid calls
    const currentRenderId = ++this.lastRenderId;
    this.currentRenderId = currentRenderId;

    this.body.innerHTML = "";

    await this.applyBackdropForItem(item, currentRenderId);

    // If a newer render has started, stop here
    if (this.currentRenderId !== currentRenderId) return;

    // Render main content
    if (item.mediaType === 0) {
      const img = document.createElement("img");
      img.src = item.mediaUrl;
      img.className = "media-preview-content";
      this.body.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.src = item.mediaUrl;
      if (item.thumbnailUrl) video.poster = item.thumbnailUrl;
      video.className = "media-preview-content";
      video.controls = true;
      video.autoplay = true;
      this.body.appendChild(video);
    }
    this.renderThumbs();
    this.updateNavigationButtons();
    if (window.lucide) lucide.createIcons();
  },

  updateNavigationButtons() {
    const prevBtn = document.getElementById("preview-nav-prev");
    const nextBtn = document.getElementById("preview-nav-next");
    if (!prevBtn || !nextBtn) return;

    const showNav = this.mediaList.length > 1 || !this.shouldLoopNavigation();
    prevBtn.style.display = showNav ? "flex" : "none";
    nextBtn.style.display = showNav ? "flex" : "none";

    if (this.shouldLoopNavigation()) {
      prevBtn.classList.remove("disabled");
      nextBtn.classList.remove("disabled");
      prevBtn.removeAttribute("aria-disabled");
      nextBtn.removeAttribute("aria-disabled");
      return;
    }

    const canPrev = this.canNavigatePrev();
    const canNext = this.canNavigateNext();

    prevBtn.classList.toggle("disabled", !canPrev);
    nextBtn.classList.toggle("disabled", !canNext);

    if (!canPrev) prevBtn.setAttribute("aria-disabled", "true");
    else prevBtn.removeAttribute("aria-disabled");
    if (!canNext) nextBtn.setAttribute("aria-disabled", "true");
    else nextBtn.removeAttribute("aria-disabled");
  },

  renderThumbs() {
    const mode =
      this.options?.thumbnailMode === "windowed" ? "windowed" : "all";
    const total = this.mediaList.length;
    if (total === 0) {
      this.thumbsContainer.innerHTML = "";
      return;
    }

    let start = 0;
    let end = total;
    if (mode === "windowed") {
      let desired = Number(this.options?.thumbnailWindowSize);
      if (!Number.isFinite(desired) || desired < 3) desired = 7;
      if (desired % 2 === 0) desired -= 1;

      const half = Math.floor(desired / 2);
      start = Math.max(0, this.currentIndex - half);
      end = Math.min(total, start + desired);
      start = Math.max(0, end - desired);
    }

    const displayList = this.mediaList.slice(start, end);
    this.thumbsContainer.style.display = "flex";
    this.thumbsContainer.classList.toggle("windowed", mode === "windowed");
    this.thumbsContainer.innerHTML = displayList
      .map((m, idx) => {
        const absoluteIndex = start + idx;
        const rawThumb = (m.thumbnailUrl || "").toString().trim();
        const hasUsableThumbnail =
          !!rawThumb &&
          rawThumb.toLowerCase() !== "null" &&
          rawThumb.toLowerCase() !== "undefined";
        const thumbImage = hasUsableThumbnail ? rawThumb : m.mediaUrl;
        const safeThumb = (thumbImage || "").toString().replace(/"/g, "&quot;");
        const safeMedia = (m.mediaUrl || "").toString().replace(/"/g, "&quot;");
        return `
            <div class="preview-thumb ${absoluteIndex === this.currentIndex ? "active" : ""}" onclick="MediaPreviewer.goTo(${absoluteIndex})">
                ${
                  m.mediaType === 0
                    ? `<img src="${safeThumb}">`
                    : `
                        <div class="preview-thumb-media preview-thumb-video use-video-fallback">
                            ${
                              hasUsableThumbnail
                                ? `<img class="preview-thumb-video-img" src="${safeThumb}" alt="" loading="lazy">`
                                : ""
                            }
                            <video class="preview-thumb-video-fallback" src="${safeMedia}" muted playsinline preload="metadata"></video>
                            <span class="preview-thumb-video-indicator"><i data-lucide="play"></i></span>
                        </div>
                    `
                }
            </div>
        `;
      })
      .join("");

    this.setupVideoThumbFallbacks();

    if (window.lucide) lucide.createIcons();
  },

  setupVideoThumbFallbacks() {
    if (!this.thumbsContainer) return;
    const thumbVideos = this.thumbsContainer.querySelectorAll(
      ".preview-thumb-video",
    );
    thumbVideos.forEach((thumbEl) => {
      const imageEl = thumbEl.querySelector(".preview-thumb-video-img");
      const videoEl = thumbEl.querySelector(".preview-thumb-video-fallback");
      if (!videoEl) return;

      const useVideoFallback = () => {
        thumbEl.classList.add("use-video-fallback");
        try {
          videoEl.currentTime = 0;
        } catch (_) {}
        try {
          videoEl.load();
        } catch (_) {}
      };

      if (!imageEl) {
        useVideoFallback();
        return;
      }

      const markImageLoaded = () => {
        const ok =
          Number(imageEl.naturalWidth) > 0 && Number(imageEl.naturalHeight) > 0;
        if (!ok) {
          useVideoFallback();
          return;
        }
        thumbEl.classList.remove("use-video-fallback");
      };

      if (imageEl.complete) {
        markImageLoaded();
        return;
      }

      imageEl.addEventListener("load", markImageLoaded, { once: true });
      imageEl.addEventListener("error", useVideoFallback, { once: true });
    });
  },

  goTo(index) {
    this.currentIndex = index;
    this.render();
  },

  async next(e) {
    if (e) e.stopPropagation();
    this.syncMediaListFromOptions();
    if (this.mediaList.length === 0) return;

    if (this.shouldLoopNavigation()) {
      if (this.mediaList.length <= 1) return;
      this.currentIndex = (this.currentIndex + 1) % this.mediaList.length;
      this.render();
      return;
    }

    if (this.currentIndex < this.mediaList.length - 1) {
      this.currentIndex += 1;
      this.render();
      return;
    }

    const loaded = await this.requestBoundaryMedia("next");
    if (loaded && this.currentIndex < this.mediaList.length - 1) {
      this.currentIndex += 1;
      this.render();
      return;
    }

    this.updateNavigationButtons();
  },

  async prev(e) {
    if (e) e.stopPropagation();
    this.syncMediaListFromOptions();
    if (this.mediaList.length === 0) return;

    if (this.shouldLoopNavigation()) {
      if (this.mediaList.length <= 1) return;
      this.currentIndex =
        (this.currentIndex - 1 + this.mediaList.length) % this.mediaList.length;
      this.render();
      return;
    }

    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      this.render();
      return;
    }

    const loaded = await this.requestBoundaryMedia("prev");
    if (loaded && this.currentIndex > 0) {
      this.currentIndex -= 1;
      this.render();
      return;
    }

    this.updateNavigationButtons();
  },

  async downloadCurrent() {
    const item = this.mediaList[this.currentIndex];
    if (!item) return;

    try {
      // Use fetch and blob to try and bypass cross-origin download restrictions
      const response = await fetch(item.mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      // Get filename from URL or fallback
      const fileName =
        item.mediaUrl.split("/").pop().split("?")[0] || `media_${Date.now()}`;
      a.download = fileName;

      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback for simple link opening if fetch fails
      window.open(item.mediaUrl, "_blank");
    }
  },

  close() {
    if (this.overlay) {
      this.overlay.classList.remove("active");
      this.overlay.classList.remove("video-mode");
      document.body.style.overflow = "";
      this.body.innerHTML = "";
      this.overlay.style.removeProperty("--dynamic-bg");
      this.overlay.style.removeProperty("--dynamic-linear-from");
      this.overlay.style.removeProperty("--dynamic-linear-to");
    }
    const onClose = this.options?.onClose;
    this.options = {};
    this.mediaList = [];
    this.currentIndex = 0;
    if (typeof onClose === "function") {
      try {
        onClose();
      } catch (err) {
        console.error("MediaPreviewer onClose failed:", err);
      }
    }
  },
};

window.previewMedia = (media, index = 0, allMedias = null, options = null) => {
  if (allMedias) {
    MediaPreviewer.open(allMedias, index, options);
  } else {
    MediaPreviewer.open([media], 0, options);
  }
};

window.MediaPreviewer = MediaPreviewer;

window.previewImage = (url) => window.previewMedia(url);
