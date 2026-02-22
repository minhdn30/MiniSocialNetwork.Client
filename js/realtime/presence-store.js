/**
 * presence-store.js
 * Shared online presence state + snapshot cache + timeago bucket refresh.
 */
(function (global) {
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;
  const MINUTE_BUCKET_REFRESH_MS = 2 * MINUTE_MS;
  const HOUR_BUCKET_REFRESH_MS = 10 * MINUTE_MS;
  const SNAPSHOT_STALE_MS =
    Number(global.APP_CONFIG?.PRESENCE_SNAPSHOT_STALE_MS) || 90 * 1000;
  const SNAPSHOT_MAX_BATCH_SIZE =
    Number(global.APP_CONFIG?.PRESENCE_SNAPSHOT_MAX_BATCH_SIZE) || 100;

  const stateByAccountId = new Map();
  const snapshotFetchedAtByAccountId = new Map();
  const subscribers = new Set();

  let pendingSnapshotIds = new Set();
  let snapshotFlushPromise = null;
  let tickTimer = null;

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function parseTimestampToMs(value) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueNormalizedIds(values) {
    const out = [];
    const seen = new Set();
    ensureArray(values).forEach((value) => {
      const id = normalizeAccountId(value);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function normalizeSnapshotItem(rawItem) {
    const accountId = normalizeAccountId(
      rawItem?.accountId ?? rawItem?.AccountId ?? "",
    );
    if (!accountId) return null;

    const canShowStatus = !!(
      rawItem?.canShowStatus ??
      rawItem?.CanShowStatus ??
      false
    );
    const isOnline = !!(rawItem?.isOnline ?? rawItem?.IsOnline ?? false);
    const lastActiveAtRaw =
      rawItem?.lastOnlineAt ??
      rawItem?.LastOnlineAt ??
      rawItem?.lastActiveAt ??
      rawItem?.LastActiveAt;
    const lastActiveAtMs = parseTimestampToMs(lastActiveAtRaw);

    return {
      accountId,
      canShowStatus,
      isOnline,
      lastActiveAtMs: isOnline ? null : lastActiveAtMs,
      updatedAtMs: Date.now(),
    };
  }

  function areStatesEqual(a, b) {
    return (
      !!a?.canShowStatus === !!b?.canShowStatus &&
      !!a?.isOnline === !!b?.isOnline &&
      (a?.lastActiveAtMs || null) === (b?.lastActiveAtMs || null)
    );
  }

  function setState(accountId, nextState) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId || !nextState) return false;

    const previous = stateByAccountId.get(normalizedAccountId) || null;
    if (areStatesEqual(previous, nextState)) return false;

    stateByAccountId.set(normalizedAccountId, {
      accountId: normalizedAccountId,
      canShowStatus: !!nextState.canShowStatus,
      isOnline: !!nextState.isOnline,
      lastActiveAtMs:
        nextState.isOnline ? null : nextState.lastActiveAtMs || null,
      updatedAtMs: Date.now(),
    });
    return true;
  }

  function getOfflineBucketRefreshMs(state, nowMs) {
    if (!state || !state.canShowStatus || state.isOnline || !state.lastActiveAtMs) {
      return 0;
    }

    const ageMs = Math.max(0, nowMs - state.lastActiveAtMs);
    if (ageMs >= DAY_MS) return 0;
    if (ageMs < HOUR_MS) return MINUTE_BUCKET_REFRESH_MS;
    return HOUR_BUCKET_REFRESH_MS;
  }

  function clearTickTimer() {
    if (tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  function scheduleTickIfNeeded() {
    clearTickTimer();

    const nowMs = Date.now();
    let nextDelayMs = 0;

    stateByAccountId.forEach((state) => {
      const bucketMs = getOfflineBucketRefreshMs(state, nowMs);
      if (!bucketMs) return;
      if (!nextDelayMs || bucketMs < nextDelayMs) {
        nextDelayMs = bucketMs;
      }
    });

    if (!nextDelayMs) return;

    tickTimer = setTimeout(() => {
      tickTimer = null;
      notifySubscribers({
        changedAccountIds: Array.from(stateByAccountId.keys()),
        reason: "tick",
      });
      scheduleTickIfNeeded();
    }, nextDelayMs);
  }

  function notifySubscribers(payload) {
    const normalizedPayload = {
      changedAccountIds: uniqueNormalizedIds(payload?.changedAccountIds),
      reason: payload?.reason || "update",
    };

    subscribers.forEach((callback) => {
      try {
        callback(normalizedPayload);
      } catch (error) {
        console.error("[PresenceStore] subscriber callback failed:", error);
      }
    });
  }

  function formatOfflineTimeAgo(lastActiveAtMs, nowMs) {
    if (!Number.isFinite(lastActiveAtMs)) return "";
    const ageMs = Math.max(0, nowMs - lastActiveAtMs);
    if (ageMs >= DAY_MS) return "";

    if (ageMs < HOUR_MS) {
      const minutes = Math.max(1, Math.floor(ageMs / MINUTE_MS));
      return `Active ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    const hours = Math.max(1, Math.floor(ageMs / HOUR_MS));
    return `Active ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  function buildStatusFromState(state, legacyIsOnline = false, nowMs = Date.now()) {
    if (state) {
      if (!state.canShowStatus) {
        return {
          canShowStatus: false,
          isOnline: false,
          showDot: false,
          text: "",
        };
      }

      if (state.isOnline) {
        return {
          canShowStatus: true,
          isOnline: true,
          showDot: true,
          text: "Online",
        };
      }

      const text = formatOfflineTimeAgo(state.lastActiveAtMs, nowMs);
      if (!text) {
        return {
          canShowStatus: false,
          isOnline: false,
          showDot: false,
          text: "",
        };
      }

      return {
        canShowStatus: true,
        isOnline: false,
        showDot: false,
        text,
      };
    }

    if (legacyIsOnline) {
      return {
        canShowStatus: true,
        isOnline: true,
        showDot: true,
        text: "Online",
      };
    }

    return {
      canShowStatus: false,
      isOnline: false,
      showDot: false,
      text: "",
    };
  }

  function extractOtherAccountIdsFromConversations(conversations) {
    const ids = new Set();
    ensureArray(conversations).forEach((conversation) => {
      const isGroup = !!(conversation?.isGroup ?? conversation?.IsGroup);
      if (isGroup) return;

      const otherAccountId = normalizeAccountId(
        conversation?.otherMember?.accountId ||
          conversation?.otherMember?.AccountId ||
          conversation?.otherMemberId ||
          conversation?.OtherMemberId ||
          "",
      );
      if (otherAccountId) ids.add(otherAccountId);
    });

    return Array.from(ids);
  }

  function queueSnapshotIds(accountIds, force = false) {
    const nowMs = Date.now();
    uniqueNormalizedIds(accountIds).forEach((accountId) => {
      if (!force) {
        const fetchedAt = snapshotFetchedAtByAccountId.get(accountId) || 0;
        if (fetchedAt && nowMs - fetchedAt < SNAPSHOT_STALE_MS) return;
      }
      pendingSnapshotIds.add(accountId);
    });
  }

  function markSnapshotFetched(accountIds, atMs = Date.now()) {
    uniqueNormalizedIds(accountIds).forEach((accountId) => {
      snapshotFetchedAtByAccountId.set(accountId, atMs);
    });
  }

  async function fetchSnapshotBatch(accountIds) {
    const normalizedIds = uniqueNormalizedIds(accountIds);
    if (!normalizedIds.length) return;

    if (!global.API?.Presence?.snapshot) return;

    const fetchedAtMs = Date.now();
    markSnapshotFetched(normalizedIds, fetchedAtMs);

    let response = null;
    try {
      response = await global.API.Presence.snapshot(normalizedIds);
    } catch (error) {
      console.warn("[PresenceStore] snapshot request failed:", error);
      return;
    }

    if (!response?.ok) {
      // Keep quiet on rate-limit; UI can continue with cached state.
      if (response?.status && response.status !== 429) {
        let message = "";
        try {
          const data = await response.json();
          message = data?.message || data?.title || "";
        } catch (_) {
          // no-op
        }
        console.warn(
          `[PresenceStore] snapshot failed (${response.status})${message ? `: ${message}` : ""}`,
        );
      }
      return;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      console.warn("[PresenceStore] snapshot response is not valid JSON:", error);
      return;
    }

    const items = ensureArray(data?.items ?? data?.Items);
    const changedAccountIds = [];
    items.forEach((rawItem) => {
      const normalizedState = normalizeSnapshotItem(rawItem);
      if (!normalizedState) return;
      if (setState(normalizedState.accountId, normalizedState)) {
        changedAccountIds.push(normalizedState.accountId);
      }
    });

    if (changedAccountIds.length) {
      notifySubscribers({ changedAccountIds, reason: "snapshot" });
    }
    scheduleTickIfNeeded();
  }

  async function flushSnapshotQueue() {
    if (snapshotFlushPromise) return snapshotFlushPromise;

    snapshotFlushPromise = (async () => {
      while (pendingSnapshotIds.size > 0) {
        const batch = Array.from(pendingSnapshotIds).slice(
          0,
          SNAPSHOT_MAX_BATCH_SIZE,
        );
        batch.forEach((accountId) => pendingSnapshotIds.delete(accountId));
        await fetchSnapshotBatch(batch);
      }
    })()
      .catch((error) => {
        console.error("[PresenceStore] flush snapshot queue failed:", error);
      })
      .finally(() => {
        snapshotFlushPromise = null;
        if (pendingSnapshotIds.size > 0) {
          flushSnapshotQueue();
        }
      });

    return snapshotFlushPromise;
  }

  function applyOnlineEvent(payload) {
    const accountId = normalizeAccountId(
      payload?.accountId ?? payload?.AccountId ?? payload,
    );
    if (!accountId) return;

    const changed = setState(accountId, {
      accountId,
      canShowStatus: true,
      isOnline: true,
      lastActiveAtMs: null,
    });

    if (changed) {
      notifySubscribers({ changedAccountIds: [accountId], reason: "online" });
      scheduleTickIfNeeded();
    }
  }

  function applyOfflineEvent(payload) {
    const accountId = normalizeAccountId(
      payload?.accountId ?? payload?.AccountId ?? payload,
    );
    if (!accountId) return;

    const lastActiveAtMs = parseTimestampToMs(
      payload?.lastOnlineAt ??
      payload?.LastOnlineAt ??
      payload?.lastActiveAt ??
      payload?.LastActiveAt,
    );
    const canShowStatus = !!lastActiveAtMs && Date.now() - lastActiveAtMs < DAY_MS;

    const changed = setState(accountId, {
      accountId,
      canShowStatus,
      isOnline: false,
      lastActiveAtMs,
    });

    if (changed) {
      notifySubscribers({ changedAccountIds: [accountId], reason: "offline" });
      scheduleTickIfNeeded();
    }
  }

  function applyHiddenEvent(payload) {
    const accountId = normalizeAccountId(
      payload?.accountId ?? payload?.AccountId ?? payload,
    );
    if (!accountId) return;

    const changed = setState(accountId, {
      accountId,
      canShowStatus: false,
      isOnline: false,
      lastActiveAtMs: null,
    });

    if (changed) {
      notifySubscribers({ changedAccountIds: [accountId], reason: "hidden" });
      scheduleTickIfNeeded();
    }
  }

  function clearState() {
    const changedAccountIds = Array.from(stateByAccountId.keys());
    stateByAccountId.clear();
    snapshotFetchedAtByAccountId.clear();
    pendingSnapshotIds = new Set();
    clearTickTimer();
    notifySubscribers({ changedAccountIds, reason: "clear" });
  }

  const PresenceStore = {
    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    getState(accountId) {
      const normalizedAccountId = normalizeAccountId(accountId);
      if (!normalizedAccountId) return null;
      const state = stateByAccountId.get(normalizedAccountId);
      return state ? { ...state } : null;
    },

    resolveStatus({ accountId, legacyIsOnline = false, nowMs = Date.now() } = {}) {
      const normalizedAccountId = normalizeAccountId(accountId);
      const state = normalizedAccountId
        ? stateByAccountId.get(normalizedAccountId) || null
        : null;
      return buildStatusFromState(state, !!legacyIsOnline, nowMs);
    },

    ensureSnapshotForAccountIds(accountIds, options = {}) {
      queueSnapshotIds(accountIds, !!options?.force);
      return flushSnapshotQueue();
    },

    ensureSnapshotForConversations(conversations, options = {}) {
      const accountIds = extractOtherAccountIdsFromConversations(conversations);
      return this.ensureSnapshotForAccountIds(accountIds, options);
    },

    applyOnlineEvent,
    applyOfflineEvent,
    applyHiddenEvent,
    clear: clearState,
  };

  const authEventName = global.AuthStore?.EVENT || "auth:token-changed";
  global.addEventListener(authEventName, (event) => {
    if (!event?.detail?.hasToken) {
      clearState();
    }
  });

  global.PresenceStore = PresenceStore;
})(window);
