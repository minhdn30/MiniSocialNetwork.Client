let toastTimeout;

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

function showToast(message, type = "info", duration = 3000, isHtml = false) {
  let toast = document.querySelector(".toast-notification");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast-notification";
  }
  document.body.appendChild(toast);
  toast.style.zIndex = "2147483647";

  toast.className = "toast-notification";
  toast.classList.add(type);

  if (isHtml) {
    toast.innerHTML = message;
  } else {
    toast.textContent = resolveToastMessage(message, type);
  }

  toast.offsetHeight;

  toast.classList.add("show");

  clearTimeout(toastTimeout);
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
}

window.closeToast = () => {
    const toast = document.querySelector(".toast-notification");
    if (toast) toast.classList.remove("show");
};

window.toastSuccess = (msg) => showToast(msg, "success");
window.toastError = (msg) => showToast(msg, "error");
window.toastInfo = (msg) => showToast(msg, "info");
window.toastSuccessKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "success");
window.toastErrorKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "error");
window.toastInfoKey = (key, params) =>
  showToast(window.I18n?.t ? window.I18n.t(key, params, key) : key, "info");
