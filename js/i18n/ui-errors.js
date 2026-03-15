(function (global) {
  function normalizeStatus(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeMessage(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function trimTrailingPunctuation(value) {
    return (value || "")
      .toString()
      .trim()
      .replace(/[.!?]+$/g, "")
      .trim();
  }

  function extractMessageSummary(rawServerMessage, patterns) {
    const raw = (rawServerMessage || "").toString().trim();
    if (!raw || !Array.isArray(patterns)) return "";

    for (const pattern of patterns) {
      if (!(pattern instanceof RegExp)) continue;
      const match = raw.match(pattern);
      const summary = trimTrailingPunctuation(match?.[1] || "");
      if (summary) return summary;
    }

    return "";
  }

  function localizeUserSummary(rawSummary, options = {}) {
    const summary = trimTrailingPunctuation(rawSummary);
    if (!summary) return "";

    const moreMatch = summary.match(/^(.*?)(?:,\s*)?and\s+(\d+)\s+more$/i);
    if (!moreMatch) return summary;

    const users = trimTrailingPunctuation((moreMatch[1] || "").replace(/,\s*$/g, ""));
    const count = Number(moreMatch[2] || 0);
    if (!Number.isFinite(count) || count <= 0) {
      return summary;
    }

    if (!users) {
      if (global.I18n?.t && options.moreOnlyKey) {
        return global.I18n.t(options.moreOnlyKey, { count }, `and ${count} more`);
      }

      return `and ${count} more`;
    }

    if (global.I18n?.t && options.listWithMoreKey) {
      return global.I18n.t(
        options.listWithMoreKey,
        { users, count },
        `${users} and ${count} more`,
      );
    }

    return `${users} and ${count} more`;
  }

  function deriveUiErrorDescriptor(
    feature,
    action,
    status,
    rawServerMessage,
    params = {},
  ) {
    const key = resolveUiErrorKey(feature, action, status, rawServerMessage);
    const normalizedFeature = (feature || "").toString().trim().toLowerCase();
    const normalizedAction = (action || "").toString().trim().toLowerCase();
    const normalizedMessage = normalizeMessage(rawServerMessage);
    const resolvedParams = { ...(params || {}) };
    let resolvedKey = key;

    if (
      normalizedFeature === "post" &&
      (normalizedAction === "edit-tags" || normalizedAction === "create")
    ) {
      if (normalizedMessage.includes("do not allow being tagged")) {
        const users = localizeUserSummary(
          extractMessageSummary(rawServerMessage, [
            /^these users do not allow being tagged:\s*(.+?)\.?$/i,
          ]),
          {
            listWithMoreKey: "post.editTagging.listWithMore",
          },
        );

        if (users) {
          resolvedKey = "post.editTagging.tagPermissionDeniedSpecific";
          resolvedParams.users = users;
        }
      } else if (
        normalizedMessage.includes("followers-only post") &&
        normalizedMessage.includes("not following you")
      ) {
        const users = localizeUserSummary(
          extractMessageSummary(rawServerMessage, [
            /^these users cannot be tagged in a followers-only post because they are not following you:\s*(.+?)\.?$/i,
          ]),
          {
            listWithMoreKey: "post.editTagging.listWithMore",
          },
        );

        if (users) {
          resolvedKey = "post.editTagging.followOnlyRestrictionSpecific";
          resolvedParams.users = users;
        }
      }
    }

    return {
      key: resolvedKey,
      params: resolvedParams,
    };
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

    if (normalizedMessage.includes("account has been suspended")) {
      return "auth.accountSuspended";
    }

    if (normalizedMessage.includes("account has been banned")) {
      return "auth.accountBanned";
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
      if (
        normalizedMessage.includes("posting stories too fast") ||
        normalizedMessage.includes("wait a few seconds") ||
        normalizedMessage.includes("tạo tin quá nhanh") ||
        normalizedMessage.includes("vui lòng chờ vài giây")
      ) {
        return "story.create.tooFast";
      }

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
    const descriptor = deriveUiErrorDescriptor(
      feature,
      action,
      status,
      rawServerMessage,
      params,
    );

    return {
      key: descriptor.key,
      message: global.I18n?.t
        ? global.I18n.t(descriptor.key, descriptor.params, descriptor.key)
        : descriptor.key,
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
