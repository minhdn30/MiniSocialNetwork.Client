(function (global) {
  const FALLBACK_APPLIED_ATTR = "data-media-fallback-applied";
  const FALLBACK_IGNORE_ATTR = "data-media-fallback-ignore";
  const FALLBACK_OVERLAY_CLASS = "sn-media-load-fallback";
  const FALLBACK_HOST_CLASS = "sn-media-load-fallback-host";
  const FALLBACK_HOST_RELATIVE_CLASS = "sn-media-load-fallback-host--relative";
  const FALLBACK_TARGET_CLASS = "sn-media-load-fallback-target";
  const VIDEO_CONTROLS_ATTR = "data-media-fallback-video-controls";
  const PROFILE_COVER_GRADIENT =
    "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";

  const fallbackOverlayMap = new WeakMap();
  let isInitialized = false;

  function toLowerText(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function normalizeUrl(url) {
    const value = (url || "").toString().trim();
    if (!value) return "";
    try {
      return new URL(value, global.location?.href || "").href;
    } catch (_) {
      return value;
    }
  }

  function getDefaultAvatar() {
    return (
      global.APP_CONFIG?.DEFAULT_AVATAR ||
      global.APP_CONFIG?.defaultAvatar ||
      "assets/images/default-avatar.jpg"
    );
  }

  function hasAvatarClassToken(token) {
    return /(^|-)avatar($|-)/.test(toLowerText(token));
  }

  function hasAvatarSemantics(imgEl) {
    if (!(imgEl instanceof HTMLImageElement)) return false;
    if (imgEl.hasAttribute("data-avatar")) return true;

    const elementId = toLowerText(imgEl.id);
    if (
      elementId === "profile-avatar" ||
      /^avatar(-|$)/.test(elementId) ||
      /-avatar$/.test(elementId)
    ) {
      return true;
    }

    const hasAvatarClass = Array.from(imgEl.classList || []).some(
      hasAvatarClassToken,
    );
    if (hasAvatarClass) return true;

    const onErrorHandler = toLowerText(imgEl.getAttribute("onerror"));
    if (
      onErrorHandler.includes("default_avatar") ||
      onErrorHandler.includes("default-avatar")
    ) {
      return true;
    }

    const altText = toLowerText(imgEl.alt);
    const ariaLabel = toLowerText(imgEl.getAttribute("aria-label"));
    if (
      altText === "avatar" ||
      altText.endsWith(" avatar") ||
      ariaLabel === "avatar" ||
      ariaLabel.endsWith(" avatar")
    ) {
      return true;
    }

    return false;
  }

  function isProfileCoverImage(imgEl) {
    if (!(imgEl instanceof HTMLImageElement)) return false;
    if (imgEl.id === "profile-cover-img") return true;
    return !!imgEl.closest(".profile-preview-cover");
  }

  function isProfileAvatarImage(imgEl) {
    if (!(imgEl instanceof HTMLImageElement)) return false;
    if (imgEl.id === "profile-avatar") return true;
    return !!imgEl.closest("#profile-preview .profile-preview-avatar-wrapper");
  }

  function shouldSkipFallback(target) {
    if (!target) return true;
    if (target.getAttribute(FALLBACK_IGNORE_ATTR) === "true") return true;

    // Story viewer has dedicated unavailable logic and timing.
    if (target.closest(".sn-story-viewer-modal")) {
      return true;
    }

    return false;
  }

  function resolveHostElement(target) {
    if (!target) return null;
    let host = target.parentElement;
    if (host && host.tagName === "PICTURE") {
      host = host.parentElement || host;
    }
    return host || null;
  }

  function ensureHostPosition(hostEl) {
    if (!hostEl) return;
    hostEl.classList.add(FALLBACK_HOST_CLASS);
    const computed = global.getComputedStyle(hostEl);
    if (computed.position === "static") {
      hostEl.classList.add(FALLBACK_HOST_RELATIVE_CLASS);
      hostEl.dataset.mediaFallbackRelative = "1";
    }
  }

  function cleanupHostPosition(hostEl) {
    if (!hostEl) return;
    if (hostEl.querySelector(`.${FALLBACK_OVERLAY_CLASS}`)) return;
    hostEl.classList.remove(FALLBACK_HOST_CLASS);

    if (hostEl.dataset.mediaFallbackRelative === "1") {
      hostEl.classList.remove(FALLBACK_HOST_RELATIVE_CLASS);
      delete hostEl.dataset.mediaFallbackRelative;
    }
  }

  function isCompactFallback(target, hostEl) {
    if (!target || !hostEl) return true;
    if (
      target.closest(".chat-window, .chat-page, .chat-sidebar, .msg, .message")
    ) {
      return true;
    }

    const width =
      target.clientWidth ||
      hostEl.clientWidth ||
      Number.parseFloat(target.getAttribute("width")) ||
      0;
    const height =
      target.clientHeight ||
      hostEl.clientHeight ||
      Number.parseFloat(target.getAttribute("height")) ||
      0;

    return width < 160 || height < 120;
  }

  function createFallbackOverlay(kind, compact) {
    const iconName = kind === "video" ? "video-off" : "image-off";
    const label = `this ${kind} could not be loaded`;
    const overlay = document.createElement("div");
    overlay.className = `${FALLBACK_OVERLAY_CLASS} sn-media-load-fallback--${kind}${compact ? " sn-media-load-fallback--compact" : ""}`;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <div class="sn-media-load-fallback-text">${label}</div>
    `;
    return overlay;
  }

  function clearMediaFallback(target) {
    if (
      !(target instanceof HTMLImageElement) &&
      !(target instanceof HTMLVideoElement)
    ) {
      return;
    }

    const overlay = fallbackOverlayMap.get(target);
    if (overlay && overlay.parentElement) {
      const hostEl = overlay.parentElement;
      overlay.remove();
      cleanupHostPosition(hostEl);
    }

    fallbackOverlayMap.delete(target);
    target.classList.remove(FALLBACK_TARGET_CLASS);
    target.removeAttribute(FALLBACK_APPLIED_ATTR);

    if (target instanceof HTMLVideoElement) {
      if (target.getAttribute(VIDEO_CONTROLS_ATTR) === "true") {
        target.controls = true;
      }
      target.removeAttribute(VIDEO_CONTROLS_ATTR);
    }
  }

  function applyMediaFallback(target, kind) {
    if (target.getAttribute(FALLBACK_APPLIED_ATTR) === "true") return;

    const hostEl = resolveHostElement(target);
    if (!hostEl) return;

    ensureHostPosition(hostEl);

    const compact = isCompactFallback(target, hostEl);
    const overlay = createFallbackOverlay(kind, compact);
    hostEl.appendChild(overlay);

    fallbackOverlayMap.set(target, overlay);
    target.classList.add(FALLBACK_TARGET_CLASS);
    target.setAttribute(FALLBACK_APPLIED_ATTR, "true");

    if (target instanceof HTMLVideoElement) {
      target.setAttribute(VIDEO_CONTROLS_ATTR, target.controls ? "true" : "false");
      target.pause?.();
      target.controls = false;
    }

    if (global.lucide && typeof global.lucide.createIcons === "function") {
      global.lucide.createIcons({ root: overlay });
    }
  }

  function applyGradientFromAvatar(avatarEl) {
    if (!isProfileAvatarImage(avatarEl)) return;
    if (typeof global.extractDominantColor !== "function") return;

    const avatarSrc = (avatarEl.currentSrc || avatarEl.src || "").toString();
    if (!avatarSrc) return;

    const applyColor = (coverEl, color) => {
      if (!coverEl) return;
      coverEl.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
    };

    const applyDefault = (coverEl) => {
      if (!coverEl) return;
      coverEl.style.background = PROFILE_COVER_GRADIENT;
    };

    const profileCover = document.querySelector(".profile-cover");
    if (avatarEl.id === "profile-avatar" && profileCover) {
      global
        .extractDominantColor(avatarSrc)
        .then((color) => applyColor(profileCover, color))
        .catch(() => applyDefault(profileCover));
    }

    const previewRoot = avatarEl.closest("#profile-preview");
    const previewCover = previewRoot?.querySelector(".profile-preview-cover");
    if (previewCover) {
      global
        .extractDominantColor(avatarSrc)
        .then((color) => applyColor(previewCover, color))
        .catch(() => applyDefault(previewCover));
    }
  }

  function applyAvatarFallback(target) {
    if (!(target instanceof HTMLImageElement)) return;
    const fallbackSrc = getDefaultAvatar();
    if (!fallbackSrc) return;

    const normalizedCurrent = normalizeUrl(target.currentSrc || target.src);
    const normalizedFallback = normalizeUrl(fallbackSrc);

    if (normalizedCurrent === normalizedFallback) {
      return;
    }

    if (isProfileAvatarImage(target)) {
      target.addEventListener(
        "load",
        () => {
          applyGradientFromAvatar(target);
        },
        { once: true },
      );
    }
    target.src = fallbackSrc;
  }

  function handleError(event) {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      if (hasAvatarSemantics(target)) {
        applyAvatarFallback(target);
        return;
      }

      if (isProfileCoverImage(target)) {
        target.style.display = "none";
        return;
      }

      if (shouldSkipFallback(target)) return;
      applyMediaFallback(target, "image");
      return;
    }

    if (target instanceof HTMLVideoElement) {
      if (shouldSkipFallback(target)) return;
      applyMediaFallback(target, "video");
    }
  }

  function handleLoad(event) {
    const target = event.target;
    if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
      clearMediaFallback(target);
    }
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;
    document.addEventListener("error", handleError, true);
    document.addEventListener("load", handleLoad, true);
  }

  global.MediaLoadFallback = {
    init,
    clearMediaFallback,
    applyMediaFallback,
    applyAvatarFallback,
  };

  init();
})(window);
