(function (global) {
  function presenceUiT(key, params = {}, fallback = "") {
    if (global.I18n?.t) {
      return global.I18n.t(key, params, fallback);
    }
    return fallback;
  }

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function hasPresenceStore() {
    return (
      !!global.PresenceStore &&
      typeof global.PresenceStore.resolveStatus === "function"
    );
  }

  function getPrivateOtherAccountId(conversation = {}) {
    const isGroup = !!(conversation?.isGroup ?? conversation?.IsGroup);
    if (isGroup) return "";

    return normalizeAccountId(
      conversation?.otherMember?.accountId ||
        conversation?.otherMember?.AccountId ||
        conversation?.otherMemberId ||
        conversation?.OtherMemberId ||
        "",
    );
  }

  function resolveStatusByAccountId(accountId, fallbackOnline = false) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (hasPresenceStore() && normalizedAccountId) {
      return global.PresenceStore.resolveStatus({
        accountId: normalizedAccountId,
      });
    }

    const legacyIsOnline = !!fallbackOnline;
    return {
      canShowStatus: legacyIsOnline,
      isOnline: legacyIsOnline,
      showDot: legacyIsOnline,
      text: legacyIsOnline
        ? presenceUiT("chat.presence.online", {}, "Online")
        : "",
    };
  }

  function resolveConversationStatus(conversation = {}, groupText = "Group chat") {
    const isGroup = !!(conversation?.isGroup ?? conversation?.IsGroup);
    if (isGroup) {
      return {
        canShowStatus: false,
        isOnline: false,
        showDot: false,
        text: groupText || "",
      };
    }

    const accountId = getPrivateOtherAccountId(conversation);
    const legacyIsOnline = !!(
      conversation?.otherMember?.isOnline ??
      conversation?.otherMember?.IsOnline ??
      false
    );
    return resolveStatusByAccountId(accountId, legacyIsOnline);
  }

  function ensureSnapshotForAccountIds(accountIds, options = {}) {
    if (
      !global.PresenceStore ||
      typeof global.PresenceStore.ensureSnapshotForAccountIds !== "function"
    ) {
      return Promise.resolve();
    }

    return global.PresenceStore.ensureSnapshotForAccountIds(accountIds, options);
  }

  function ensureSnapshotForConversations(conversations, options = {}) {
    if (
      !global.PresenceStore ||
      typeof global.PresenceStore.ensureSnapshotForConversations !== "function"
    ) {
      return Promise.resolve();
    }

    return global.PresenceStore.ensureSnapshotForConversations(conversations, options);
  }

  function subscribe(callback) {
    if (!global.PresenceStore || typeof global.PresenceStore.subscribe !== "function") {
      return () => {};
    }
    return global.PresenceStore.subscribe(callback);
  }

  function syncDot(container, { dotSelector, dotHtml, showDot }) {
    if (!container || !dotSelector || !dotHtml) return;
    const existingDot = container.querySelector(dotSelector);
    if (showDot) {
      if (!existingDot) {
        container.insertAdjacentHTML("beforeend", dotHtml);
      }
    } else if (existingDot) {
      existingDot.remove();
    }
  }

  global.PresenceUI = {
    normalizeAccountId,
    getPrivateOtherAccountId,
    resolveStatusByAccountId,
    resolveConversationStatus,
    ensureSnapshotForAccountIds,
    ensureSnapshotForConversations,
    subscribe,
    syncDot,
  };
})(window);
