/**
 * chat-hub.js
 * Centralized SignalR handlers for ChatHub.
 * Optional: app still works if this file is removed.
 */
(function (global) {
    const messageHandlers = new Set();
    const seenHandlers = new Set();
    const typingHandlers = new Set();
    const themeHandlers = new Set();
    const groupInfoHandlers = new Set();
    const groupRefCount = new Map(); // legacy: conversationId -> count
    const groupOwnerRefs = new Map(); // conversationId -> Set(ownerKey)
    let currentConnection = null;
    const pendingInvokes = new Map(); // key -> { method, args, resolve, timeoutId }
    const REJOIN_RETRY_DELAY_MS = 1500;
    let hasScheduledRejoinRetry = false;
    let lastRejoinConnectionId = '';

    function isGuid(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
    }

    function normalizeConversationId(id) {
        return (id || '').toString().toLowerCase();
    }

    function normalizeOwnerKey(ownerKey) {
        return (ownerKey || '').toString().trim();
    }

    function getLegacyRefCount(conversationId) {
        const count = groupRefCount.get(conversationId) || 0;
        return Number.isFinite(count) && count > 0 ? count : 0;
    }

    function getOwnerRefCount(conversationId) {
        const owners = groupOwnerRefs.get(conversationId);
        return owners ? owners.size : 0;
    }

    function getTotalRefCount(conversationId) {
        return getLegacyRefCount(conversationId) + getOwnerRefCount(conversationId);
    }

    function addLegacyRef(conversationId) {
        const before = getTotalRefCount(conversationId);
        const nextLegacy = getLegacyRefCount(conversationId) + 1;
        groupRefCount.set(conversationId, nextLegacy);
        return { changed: true, before, after: before + 1 };
    }

    function removeLegacyRef(conversationId) {
        const currentLegacy = getLegacyRefCount(conversationId);
        const before = getTotalRefCount(conversationId);
        if (currentLegacy <= 0) {
            return { changed: false, before, after: before };
        }

        if (currentLegacy === 1) {
            groupRefCount.delete(conversationId);
        } else {
            groupRefCount.set(conversationId, currentLegacy - 1);
        }
        return { changed: true, before, after: Math.max(0, before - 1) };
    }

    function addOwnerRef(conversationId, ownerKey) {
        const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
        if (!normalizedOwnerKey) {
            return addLegacyRef(conversationId);
        }

        const before = getTotalRefCount(conversationId);
        let owners = groupOwnerRefs.get(conversationId);
        if (!owners) {
            owners = new Set();
            groupOwnerRefs.set(conversationId, owners);
        }

        if (owners.has(normalizedOwnerKey)) {
            return { changed: false, before, after: before };
        }

        owners.add(normalizedOwnerKey);
        return { changed: true, before, after: before + 1, ownerKey: normalizedOwnerKey };
    }

    function removeOwnerRef(conversationId, ownerKey) {
        const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
        if (!normalizedOwnerKey) {
            return removeLegacyRef(conversationId);
        }

        const before = getTotalRefCount(conversationId);
        const owners = groupOwnerRefs.get(conversationId);
        if (!owners || !owners.has(normalizedOwnerKey)) {
            return { changed: false, before, after: before };
        }

        owners.delete(normalizedOwnerKey);
        if (!owners.size) {
            groupOwnerRefs.delete(conversationId);
        }

        return { changed: true, before, after: Math.max(0, before - 1), ownerKey: normalizedOwnerKey };
    }

    function getTrackedConversationIds() {
        const ids = new Set();

        for (const [conversationId, refCount] of groupRefCount.entries()) {
            if (!conversationId || !isGuid(conversationId)) continue;
            if (!Number.isFinite(refCount) || refCount <= 0) continue;
            ids.add(conversationId);
        }

        for (const [conversationId, owners] of groupOwnerRefs.entries()) {
            if (!conversationId || !isGuid(conversationId)) continue;
            if (!owners || owners.size <= 0) continue;
            ids.add(conversationId);
        }

        return Array.from(ids);
    }

    function scheduleRejoinRetry() {
        if (hasScheduledRejoinRetry) return;
        hasScheduledRejoinRetry = true;
        setTimeout(() => {
            hasScheduledRejoinRetry = false;
            rejoinTrackedConversations('retry');
        }, REJOIN_RETRY_DELAY_MS);
    }

    function rollbackJoinRefCount(conversationId, ownerKey = '') {
        const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
        if (normalizedOwnerKey) {
            removeOwnerRef(conversationId, normalizedOwnerKey);
            return;
        }
        removeLegacyRef(conversationId);
    }

    async function rejoinTrackedConversations(trigger = 'unknown') {
        if (!isReady()) return false;

        const trackedIds = getTrackedConversationIds();
        if (!trackedIds.length) return true;

        const connectionId = (currentConnection?.connectionId || '').toString().toLowerCase();
        if (connectionId && lastRejoinConnectionId === connectionId) {
            return true;
        }

        if (connectionId) {
            lastRejoinConnectionId = connectionId;
        }

        const joinResults = await Promise.allSettled(
            trackedIds.map((conversationId) =>
                currentConnection.invoke('JoinConversation', conversationId)
            )
        );

        const failed = joinResults.filter((item) => item.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`[ChatRealtime] Rejoin failed for ${failed.length}/${trackedIds.length} conversations after ${trigger}.`);
            lastRejoinConnectionId = '';
            scheduleRejoinRetry();
            return false;
        }

        console.log(`[ChatRealtime] Rejoined ${trackedIds.length} conversation groups after ${trigger}.`);
        return true;
    }

    function attachHandlers(conn) {
        if (!conn || typeof conn.on !== 'function') return;

        try {
            conn.off('ReceiveNewMessage');
            conn.off('MemberSeen');
            conn.off('Typing');
            conn.off('ReceiveMessageRecalled');
            conn.off('ReceiveMessageReactUpdated');
            conn.off('ReceiveConversationThemeUpdated');
            conn.off('ReceiveGroupConversationInfoUpdated');
        } catch (err) {
            console.warn('[ChatRealtime] Failed to clear handlers:', err);
        }

        conn.on('ReceiveNewMessage', (msg) => {
            const normalizedPayload = normalizeMessagePayload(msg);
            messageHandlers.forEach((handler) => {
                try {
                    handler(normalizedPayload);
                } catch (err) {
                    console.error('[ChatRealtime] Message handler error:', err);
                }
            });
        });

        conn.on('MemberSeen', (data) => {
            seenHandlers.forEach((handler) => {
                try {
                    handler(data);
                } catch (err) {
                    console.error('[ChatRealtime] Seen handler error:', err);
                }
            });
        });

        conn.on('Typing', (data) => {
            const rawIsTyping = data?.IsTyping ?? data?.isTyping;
            const normalized = {
                conversationId: (data?.ConversationId || data?.conversationId || data?.conversationID || data?.ConversationID || '').toString().toLowerCase(),
                accountId: (data?.AccountId || data?.accountId || data?.accountID || data?.AccountID || '').toString().toLowerCase(),
                isTyping: (typeof rawIsTyping === 'string')
                    ? rawIsTyping.toLowerCase() === 'true'
                    : !!rawIsTyping
            };
            typingHandlers.forEach((handler) => {
                try {
                    handler(normalized);
                } catch (err) {
                    console.error('[ChatRealtime] Typing handler error:', err);
                }
            });
        });

        conn.on('ReceiveMessageRecalled', (data) => {
            try {
                if (global.ChatActions && typeof global.ChatActions.recallFromRealtime === 'function') {
                    global.ChatActions.recallFromRealtime(data);
                }
            } catch (err) {
                console.error('[ChatRealtime] Recall handler error:', err);
            }
        });

        conn.on('ReceiveMessageReactUpdated', (data) => {
            try {
                if (global.ChatActions && typeof global.ChatActions.reactFromRealtime === 'function') {
                    global.ChatActions.reactFromRealtime(data);
                }
            } catch (err) {
                console.error('[ChatRealtime] Reaction handler error:', err);
            }
        });

        conn.on('ReceiveConversationThemeUpdated', (data) => {
            const rawTheme = data?.Theme ?? data?.theme;
            const normalized = {
                conversationId: (data?.ConversationId || data?.conversationId || '').toString().toLowerCase(),
                theme: (typeof rawTheme === 'string' && rawTheme.trim().length > 0)
                    ? rawTheme.trim().toLowerCase()
                    : null,
                updatedBy: (data?.UpdatedBy || data?.updatedBy || '').toString().toLowerCase()
            };

            themeHandlers.forEach((handler) => {
                try {
                    handler(normalized);
                } catch (err) {
                    console.error('[ChatRealtime] Theme handler error:', err);
                }
            });
        });

        conn.on('ReceiveGroupConversationInfoUpdated', (data) => {
            const rawName = data?.ConversationName ?? data?.conversationName;
            const hasAvatarField =
                Object.prototype.hasOwnProperty.call(data || {}, 'ConversationAvatar') ||
                Object.prototype.hasOwnProperty.call(data || {}, 'conversationAvatar');
            const rawAvatar = data?.ConversationAvatar ?? data?.conversationAvatar;
            const hasOwnerField =
                Object.prototype.hasOwnProperty.call(data || {}, 'Owner') ||
                Object.prototype.hasOwnProperty.call(data || {}, 'owner');
            const rawOwner = data?.Owner ?? data?.owner;

            const normalized = {
                conversationId: (data?.ConversationId || data?.conversationId || '').toString().toLowerCase(),
                conversationName: (typeof rawName === 'string' && rawName.trim().length > 0)
                    ? rawName.trim()
                    : null,
                hasConversationAvatarField: hasAvatarField,
                conversationAvatar: hasAvatarField
                    ? ((typeof rawAvatar === 'string' && rawAvatar.trim().length > 0) ? rawAvatar.trim() : null)
                    : undefined,
                hasOwnerField,
                owner: hasOwnerField
                    ? ((rawOwner || '').toString().trim().toLowerCase() || null)
                    : undefined,
                updatedBy: (data?.UpdatedBy || data?.updatedBy || '').toString().toLowerCase()
            };

            groupInfoHandlers.forEach((handler) => {
                try {
                    handler(normalized);
                } catch (err) {
                    console.error('[ChatRealtime] Group info handler error:', err);
                }
            });
        });

        if (!conn.__chatRealtimeRejoinBound) {
            conn.onreconnected(() => {
                rejoinTrackedConversations('signalr.onreconnected').catch((err) => {
                    console.warn('[ChatRealtime] Rejoin on reconnect error:', err);
                    lastRejoinConnectionId = '';
                    scheduleRejoinRetry();
                });
            });

            conn.onclose(() => {
                lastRejoinConnectionId = '';
            });

            conn.__chatRealtimeRejoinBound = true;
        }
    }

    function normalizeMessagePayload(msg) {
        if (!msg || typeof msg !== 'object') return msg;
        if (!global.ChatMessageRuntime || typeof global.ChatMessageRuntime.normalizeIncomingMessage !== 'function') {
            return msg;
        }

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const normalized = global.ChatMessageRuntime.normalizeIncomingMessage(msg, myId);
        if (!normalized) return msg;

        return {
            ...msg,
            conversationId: normalized.conversationId || msg.conversationId || msg.ConversationId,
            messageId: normalized.messageId || msg.messageId || msg.MessageId,
            tempId: normalized.tempId || msg.tempId || msg.TempId,
            senderId: normalized.senderId || msg.senderId || msg.SenderId,
            content: normalized.content ?? msg.content ?? msg.Content,
            sentAt: normalized.sentAt || msg.sentAt || msg.SentAt,
            medias: normalized.medias || msg.medias || msg.Medias,
            isOwn: normalized.isOwn,
            __normalized: true,
            raw: msg
        };
    }

    function isReady() {
        return !!(currentConnection && global.signalR && currentConnection.state === global.signalR.HubConnectionState.Connected);
    }

    function enqueueInvoke(method, args, key, timeoutMs = 8000) {
        if (!key) key = `${method}:${JSON.stringify(args)}`;

        // Replace existing pending call for the same key
        const existing = pendingInvokes.get(key);
        if (existing) {
            clearTimeout(existing.timeoutId);
            existing.resolve(false);
            pendingInvokes.delete(key);
        }

        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        const timeoutId = setTimeout(() => {
            pendingInvokes.delete(key);
            resolve(false);
        }, timeoutMs);

        pendingInvokes.set(key, { method, args, resolve, timeoutId });
        return promise;
    }

    function flushPending() {
        if (!isReady()) return;
        for (const [key, item] of pendingInvokes.entries()) {
            clearTimeout(item.timeoutId);
            pendingInvokes.delete(key);
            currentConnection.invoke(item.method, ...item.args)
                .then(item.resolve)
                .catch(() => item.resolve(false));
        }
    }

    function ensureAttached() {
        const conn = global.chatHubConnection;
        if (conn && conn !== currentConnection) {
            currentConnection = conn;
            attachHandlers(conn);
        }
        if (isReady()) {
            flushPending();
        }
        setTimeout(ensureAttached, 1000);
    }

    function invokeOrQueue(method, args, key) {
        if (!global.signalR) {
            return Promise.resolve(false);
        }
        if (isReady()) {
            return currentConnection.invoke(method, ...args)
                .catch(() => false);
        }
        return enqueueInvoke(method, args, key);
    }

    const ChatRealtime = {
        onMessage(handler) {
            if (typeof handler !== 'function') return () => { };
            messageHandlers.add(handler);
            return () => {
                messageHandlers.delete(handler);
            };
        },
        onSeen(handler) {
            if (typeof handler !== 'function') return () => { };
            seenHandlers.add(handler);
            return () => {
                seenHandlers.delete(handler);
            };
        },
        onTyping(handler) {
            if (typeof handler !== 'function') return () => { };
            typingHandlers.add(handler);
            return () => {
                typingHandlers.delete(handler);
            };
        },
        onTheme(handler) {
            if (typeof handler !== 'function') return () => { };
            themeHandlers.add(handler);
            return () => {
                themeHandlers.delete(handler);
            };
        },
        onGroupInfo(handler) {
            if (typeof handler !== 'function') return () => { };
            groupInfoHandlers.add(handler);
            return () => {
                groupInfoHandlers.delete(handler);
            };
        },
        joinConversation(conversationId, ownerKey = '') {
            const normalizedConversationId = normalizeConversationId(conversationId);
            if (!isGuid(normalizedConversationId)) return Promise.reject(new Error('Invalid conversationId'));

            const change = addOwnerRef(normalizedConversationId, ownerKey);
            if (!change.changed) return Promise.resolve(true);

            if (change.before === 0) {
                // First joiner, actually tell server
                return invokeOrQueue('JoinConversation', [normalizedConversationId], `join:${normalizedConversationId}`)
                    .then(res => {
                        if (res === false) {
                            rollbackJoinRefCount(normalizedConversationId, ownerKey);
                            console.warn(`[SignalR] Join denied/failed: ${normalizedConversationId}`);
                            scheduleRejoinRetry();
                            return false;
                        }
                        console.log(`[SignalR] Network Join: ${normalizedConversationId}`);

                        // Owner might have been released while JoinConversation was in flight.
                        // In that case, immediately send a leave to prevent stale network membership.
                        if (getTotalRefCount(normalizedConversationId) <= 0) {
                            return invokeOrQueue('LeaveConversation', [normalizedConversationId], `leave:${normalizedConversationId}`)
                                .then(() => true)
                                .catch(() => true);
                        }
                        return true;
                    });
            }

            console.log(`[Realtime] Session Added: ${normalizedConversationId} (Total: ${change.after})`);
            return Promise.resolve(true);
        },
        leaveConversation(conversationId, ownerKey = '') {
            const normalizedConversationId = normalizeConversationId(conversationId);
            if (!isGuid(normalizedConversationId)) return Promise.reject(new Error('Invalid conversationId'));

            const change = removeOwnerRef(normalizedConversationId, ownerKey);
            if (!change.changed) return Promise.resolve(true);

            if (change.after === 0) {
                // Last joiner, actually tell server
                return invokeOrQueue('LeaveConversation', [normalizedConversationId], `leave:${normalizedConversationId}`)
                    .then(res => {
                        if (res === false) {
                            console.warn(`[SignalR] Leave denied/failed: ${normalizedConversationId}`);
                            return false;
                        }
                        console.log(`[SignalR] Network Leave: ${normalizedConversationId}`);

                        // A new owner may have been added while LeaveConversation was in flight.
                        // Re-join immediately to keep network membership aligned with local refs.
                        if (getTotalRefCount(normalizedConversationId) > 0) {
                            return invokeOrQueue('JoinConversation', [normalizedConversationId], `join:${normalizedConversationId}`)
                                .then(() => true)
                                .catch(() => true);
                        }
                        return true;
                    });
            }

            console.log(`[Realtime] Session Removed: ${normalizedConversationId} (Remaining: ${change.after})`);
            return Promise.resolve(true);
        },
        hasConversationOwner(conversationId, ownerKey = '') {
            const normalizedConversationId = normalizeConversationId(conversationId);
            if (!isGuid(normalizedConversationId)) return false;

            const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
            if (!normalizedOwnerKey) {
                return getTotalRefCount(normalizedConversationId) > 0;
            }

            const owners = groupOwnerRefs.get(normalizedConversationId);
            return !!owners && owners.has(normalizedOwnerKey);
        },
        hasAnyConversationOwner(conversationId) {
            const normalizedConversationId = normalizeConversationId(conversationId);
            if (!isGuid(normalizedConversationId)) return false;
            return getTotalRefCount(normalizedConversationId) > 0;
        },
        getConversationRefCount(conversationId) {
            const normalizedConversationId = normalizeConversationId(conversationId);
            if (!isGuid(normalizedConversationId)) return 0;
            return getTotalRefCount(normalizedConversationId);
        },
        seenConversation(conversationId, messageId) {
            if (!isGuid(conversationId) || !messageId) return Promise.reject(new Error('Invalid seen payload'));
            return invokeOrQueue('SeenConversation', [conversationId, messageId], `seen:${conversationId}`);
        },
        typing(conversationId, isTyping) {
            if (!isGuid(conversationId)) return Promise.reject(new Error('Invalid conversationId'));
            return invokeOrQueue('Typing', [conversationId, !!isTyping], `typing:${conversationId}`);
        },
        rejoinActiveConversations(trigger = 'manual') {
            return rejoinTrackedConversations(trigger);
        }
    };

    global.ChatRealtime = ChatRealtime;

    // Start polling for connection availability
    ensureAttached();
})(window);
