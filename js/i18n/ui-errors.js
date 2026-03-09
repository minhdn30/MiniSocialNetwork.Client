(function (global) {
  function normalizeStatus(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeMessage(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function resolveAuthMessageKey(action, status, rawServerMessage) {
    const normalizedAction = (action || "").toString().trim().toLowerCase();
    const safeStatus = normalizeStatus(status);
    const normalizedMessage = normalizeMessage(rawServerMessage);
    if (!normalizedMessage) return "";

    if (
      normalizedAction === "login" &&
      (normalizedMessage.includes("invalid credentials") ||
        normalizedMessage.includes("invalid email or password") ||
        normalizedMessage.includes("wrong username or password") ||
        normalizedMessage.includes("username or password is incorrect") ||
        normalizedMessage.includes("sai tài khoản hoặc mật khẩu"))
    ) {
      return "auth.invalidCredentials";
    }

    if (
      (normalizedAction === "signup" || normalizedAction === "complete-profile") &&
      (normalizedMessage.includes("username already exists") ||
        normalizedMessage.includes("username already exist"))
    ) {
      return "auth.usernameAlreadyExists";
    }

    if (
      (normalizedAction === "signup" || normalizedAction === "complete-profile") &&
      (normalizedMessage.includes("email already exists") ||
        normalizedMessage.includes("email already exist"))
    ) {
      return "auth.emailAlreadyExists";
    }

    if (
      normalizedAction === "login" &&
      (normalizedMessage.includes("email is not verified") ||
        normalizedMessage.includes("verify your email"))
    ) {
      return "auth.emailNotVerifiedLogin";
    }

    if (normalizedAction === "verify" && safeStatus === 400) {
      if (
        normalizedMessage.includes("invalid code") ||
        normalizedMessage.includes("code is invalid") ||
        normalizedMessage.includes("code has expired")
      ) {
        return "auth.verifyFailed";
      }
    }

    return "";
  }

  function resolveUiErrorKey(feature, action, status, rawServerMessage) {
    const normalizedFeature = (feature || "").toString().trim().toLowerCase();
    const normalizedAction = (action || "").toString().trim().toLowerCase();
    const safeStatus = normalizeStatus(status);
    const normalizedMessage = normalizeMessage(rawServerMessage);

    if (
      safeStatus === 403 &&
      (normalizedMessage.includes("status") ||
        normalizedMessage.includes("reactivate") ||
        normalizedMessage.includes("restricted"))
    ) {
      return "errors.account.restricted";
    }

    if (normalizedFeature === "auth") {
      if (normalizedAction === "google") return "errors.auth.google";
      if (normalizedAction === "login") return "errors.auth.login";
      if (normalizedAction === "signup") return "errors.auth.signup";
      if (normalizedAction === "verify") return "errors.auth.verify";
      if (normalizedAction === "complete-profile") {
        return "errors.auth.completeProfile";
      }
      if (normalizedAction === "forgot-password") {
        return "errors.auth.forgotPassword";
      }
    }

    if (normalizedFeature === "story" && normalizedAction === "reply") {
      return "errors.story.reply";
    }

    if (normalizedFeature === "story" && normalizedAction === "load") {
      return "errors.story.load";
    }

    if (normalizedFeature === "story" && normalizedAction === "load-highlight") {
      return "errors.story.loadHighlight";
    }

    if (normalizedFeature === "story" && normalizedAction === "create") {
      return "errors.story.create";
    }

    if (normalizedFeature === "comment" && normalizedAction === "create") {
      return "errors.comment.create";
    }

    if (normalizedFeature === "comment" && normalizedAction === "delete") {
      return "errors.comment.delete";
    }

    if (normalizedFeature === "comment" && normalizedAction === "update") {
      return "errors.comment.update";
    }

    if (normalizedFeature === "comment" && normalizedAction === "react") {
      return "errors.comment.react";
    }

    if (
      normalizedFeature === "post" &&
      (normalizedAction === "edit-tags" || normalizedAction === "create")
    ) {
      if (
        normalizedMessage.includes("private post") &&
        normalizedMessage.includes("tag")
      ) {
        return "post.editTagging.privateTagRestriction";
      }
      if (normalizedMessage.includes("unavailable for tagging")) {
        return "post.editTagging.selectedUnavailable";
      }
      if (normalizedMessage.includes("do not allow being tagged")) {
        return "post.editTagging.tagPermissionDenied";
      }
      if (
        normalizedMessage.includes("followers-only post") &&
        normalizedMessage.includes("not following you")
      ) {
        return "post.editTagging.followOnlyRestriction";
      }
      return normalizedAction === "edit-tags"
        ? "errors.post.editTags"
        : "errors.post.create";
    }

    if (normalizedFeature === "post" && normalizedAction === "share-chat") {
      return "errors.post.shareChat";
    }

    if (normalizedFeature === "post" && normalizedAction === "share-forward") {
      return "errors.post.shareForward";
    }

    if (normalizedFeature === "post" && normalizedAction === "create") {
      return "errors.post.create";
    }

    if (normalizedFeature === "chat" && normalizedAction === "create-group") {
      return "errors.chat.createGroup";
    }

    if (normalizedFeature === "account" && normalizedAction === "reactivate") {
      if (safeStatus >= 200 && safeStatus < 300) {
        return "errors.account.reactivationSuccess";
      }
      if (safeStatus) return "errors.account.reactivationFailed";
      return "errors.account.reactivationError";
    }

    if (safeStatus === 401) {
      return "common.auth.sessionExpired";
    }

    return "errors.generic";
  }

  function formatUiError(feature, action, status, rawServerMessage, params = {}) {
    const key = resolveUiErrorKey(feature, action, status, rawServerMessage);
    return {
      key,
      message: global.I18n?.t ? global.I18n.t(key, params, key) : key,
    };
  }

  function resolveUiErrorMessage(
    feature,
    action,
    status,
    rawServerMessage,
    fallbackKey = "",
    fallbackMessage = "",
    params = {},
  ) {
    const normalizedRaw = (rawServerMessage || "").toString().trim();
    const normalizedFeature = (feature || "").toString().trim().toLowerCase();
    const authMessageKey =
      normalizedFeature === "auth"
        ? resolveAuthMessageKey(action, status, rawServerMessage)
        : "";
    if (authMessageKey && global.I18n?.t) {
      return global.I18n.t(authMessageKey, params, authMessageKey);
    }

    const formatted = formatUiError(feature, action, status, rawServerMessage, params);
    const fallback =
      global.I18n?.t && fallbackKey
        ? global.I18n.t(fallbackKey, params, fallbackMessage || fallbackKey)
        : fallbackMessage || fallbackKey || formatted.message;

    if (
      formatted?.key &&
      formatted.key !== "errors.generic" &&
      (!fallbackKey || formatted.key !== fallbackKey)
    ) {
      return formatted.message;
    }

    if (normalizedRaw) {
      if (global.I18n?.translateServerText) {
        const translatedServerText = global.I18n.translateServerText(
          normalizedRaw,
        );
        if (translatedServerText) {
          return translatedServerText;
        }
      }

      if (global.I18n?.translateLiteral) {
        const translatedLiteral = global.I18n.translateLiteral(normalizedRaw);
        if (translatedLiteral) {
          return translatedLiteral;
        }
      }
    }

    return fallback;
  }

  global.UIErrors = {
    resolveKey: resolveUiErrorKey,
    format: formatUiError,
    resolveMessage: resolveUiErrorMessage,
  };
})(window);
