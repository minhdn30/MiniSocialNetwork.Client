const TOAST_CONTAINER_ID = "cloudm-toast-container";
const TOAST_HIDE_TRANSITION_MS = 420;
const toastStateMap = new WeakMap();

function getDefaultToastDuration() {
  return Math.max(0, Number(window.APP_CONFIG?.DEFAULT_TOAST_DURATION_MS) || 4000);
}

function resolveToastDuration(duration) {
  if (duration === 0) {
    return 0;
  }

  const parsedDuration = Number(duration);
  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    return parsedDuration;
  }

  return getDefaultToastDuration();
}

function escapeToastHtml(input) {
  return (input || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getToastContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (container) {
    return container;
  }

  container = document.createElement("div");
  container.id = TOAST_CONTAINER_ID;
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

function getToastState(toast) {
  if (!toast) return null;

  let state = toastStateMap.get(toast);
  if (!state) {
    state = {
      timeoutId: null,
      hideAt: 0,
      remainingDuration: 0,
      removalTimerId: null,
    };
    toastStateMap.set(toast, state);
  }

  return state;
}

function clearToastRemovalTimer(toast) {
  const state = getToastState(toast);
  if (!state || !state.removalTimerId) return;

  clearTimeout(state.removalTimerId);
  state.removalTimerId = null;
}

function clearToastTimer(toast) {
  const state = getToastState(toast);
  if (!state || !state.timeoutId) {
    return;
  }

  clearTimeout(state.timeoutId);
  state.timeoutId = null;
  state.hideAt = 0;
}

function removeToast(toast) {
  if (!toast) return;

  clearToastTimer(toast);
  clearToastRemovalTimer(toast);
  toastStateMap.delete(toast);
  toast.remove();

  const container = document.getElementById(TOAST_CONTAINER_ID);
  if (container && !container.children.length) {
    container.remove();
  }
}

function hideToast(toast) {
  const state = getToastState(toast);
  if (!toast || !state) {
    return;
  }

  clearToastTimer(toast);
  clearToastRemovalTimer(toast);
  state.remainingDuration = 0;
  toast.classList.remove("show");
  state.removalTimerId = setTimeout(() => {
    removeToast(toast);
  }, TOAST_HIDE_TRANSITION_MS);
}

function startToastTimer(toast, duration) {
  const state = getToastState(toast);
  if (!toast || !state) {
    return;
  }

  clearToastTimer(toast);
  clearToastRemovalTimer(toast);

  if (duration <= 0) {
    state.remainingDuration = 0;
    return;
  }

  const safeDuration = Math.max(0, Number(duration) || 0);
  state.remainingDuration = safeDuration;
  state.hideAt = Date.now() + safeDuration;
  state.timeoutId = setTimeout(() => {
    hideToast(toast);
  }, safeDuration);
}

function pauseToastTimer(toast) {
  const state = getToastState(toast);
  if (!state || !state.timeoutId) {
    return;
  }

  state.remainingDuration = Math.max(0, state.hideAt - Date.now());
  clearToastTimer(toast);
}

function bindToastHoverHandlers(toast) {
  if (!toast || toast.dataset.hoverPauseBound === "1") {
    return;
  }

  toast.dataset.hoverPauseBound = "1";
  toast.addEventListener("mouseenter", () => {
    pauseToastTimer(toast);
  });
  toast.addEventListener("mouseleave", () => {
    hideToast(toast);
  });
}

function bindToastClickHandler(toast, onClick) {
  if (
    !toast ||
    typeof onClick !== "function" ||
    toast.dataset.clickBound === "1"
  ) {
    return;
  }

  toast.dataset.clickBound = "1";
  toast.classList.add("toast-notification-clickable");
  toast.addEventListener("click", async (event) => {
    if (event.target?.closest?.(".toast-btn, .toast-link, button, a")) {
      return;
    }

    try {
      const handled = await onClick(toast, event);
      if (handled) {
        hideToast(toast);
      }
    } catch (_) {
      // no-op
    }
  });
}

function getToastFallbackMessage(type = "info") {
  if (type === "success") {
    return window.I18n?.t
      ? window.I18n.t(
          "common.feedback.successGeneric",
          {},
          "Done",
        )
      : "Done";
  }

  if (type === "error") {
    return window.I18n?.t
      ? window.I18n.t(
          "errors.generic",
          {},
          "Something went wrong. Please try again.",
        )
      : "Something went wrong. Please try again.";
  }

  return window.I18n?.t
    ? window.I18n.t("common.feedback.infoGeneric", {}, "Action completed")
    : "Action completed";
}

function resolveToastMessage(message, type = "info") {
  const rawMessage = (message || "").toString().trim();
  if (!rawMessage) {
    return getToastFallbackMessage(type);
  }

  const unresolvedSentinel = "__CLOUDM_I18N_UNRESOLVED__";
  if (window.I18n && typeof window.I18n.translateServerText === "function") {
    const translated = window.I18n.translateServerText(
      rawMessage,
      {},
      unresolvedSentinel,
    );
    if (
      typeof translated === "string" &&
      translated.trim() &&
      translated !== unresolvedSentinel
    ) {
      return translated;
    }
  }

  return rawMessage;
}

function resolveToastAvatarUrl(avatarUrl) {
  const normalizedAvatarUrl = (avatarUrl || "").toString().trim();
  if (normalizedAvatarUrl) {
    return normalizedAvatarUrl;
  }

  const defaultAvatar = (window.APP_CONFIG?.DEFAULT_AVATAR || "")
    .toString()
    .trim();
  return defaultAvatar || "assets/images/default-avatar.jpg";
}

function buildNotificationToastHtml(message, options = {}) {
  const actorName = (options.actorName || "").toString().trim();
  const actionText = (options.actionText || "").toString().trim();
  const avatarUrl = resolveToastAvatarUrl(options.avatarUrl);
  const contentHtml =
    actorName && actionText
      ? `
        <div class="toast-notification-content">
          <div class="toast-notification-actor">${escapeToastHtml(actorName)}</div>
          <div class="toast-notification-action">${escapeToastHtml(actionText)}</div>
        </div>
      `
      : `<div class="toast-notification-message">${escapeToastHtml(message)}</div>`;

  return `
    <div class="toast-notification-layout">
      <div class="toast-notification-avatar-wrap">
        <img class="toast-notification-avatar" src="${escapeToastHtml(avatarUrl)}" alt="${escapeToastHtml(actorName)}" data-media-fallback-ignore="true">
      </div>
      ${contentHtml}
    </div>
  `;
}

function showToast(message, type = "info", duration = null, isHtml = false) {
  const container = getToastContainer();
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  bindToastHoverHandlers(toast);

  toast.classList.add(type);

  if (isHtml) {
    toast.innerHTML = message;
  } else {
    toast.textContent = resolveToastMessage(message, type);
  }

  container.appendChild(toast);
  toast.offsetHeight;
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  startToastTimer(toast, resolveToastDuration(duration));

  if (typeof toast.matches === "function" && toast.matches(":hover")) {
    pauseToastTimer(toast);
  }

  return toast;
}

window.closeToast = (trigger) => {
    let toast = null;

    if (trigger instanceof Element) {
      if (trigger.classList.contains("toast-notification")) {
        toast = trigger;
      } else if (typeof trigger.closest === "function") {
        toast = trigger.closest(".toast-notification");
      }
    }

    if (!toast) {
      const activeElement = document.activeElement;
      if (activeElement && typeof activeElement.closest === "function") {
        toast = activeElement.closest(".toast-notification");
      }
    }

    if (!toast) {
      const toasts = document.querySelectorAll(".toast-notification");
      toast = toasts.length ? toasts[toasts.length - 1] : null;
    }

    if (toast) hideToast(toast);
};

window.toastSuccess = (msg) => showToast(msg, "success");
window.toastError = (msg) => showToast(msg, "error");
window.toastInfo = (msg) => showToast(msg, "info");
window.toastNotification = (msg, options = {}) =>
  {
    const toast = showToast(
    buildNotificationToastHtml(resolveToastMessage(msg, "info"), options),
    "notification",
    options?.duration,
    true,
  );
    bindToastClickHandler(toast, options?.onClick);
    return toast;
  };
window.toastSuccessKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "success");
window.toastErrorKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "error");
window.toastInfoKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "info");
