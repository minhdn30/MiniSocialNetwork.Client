/**
 * chat-hub.js
 * Centralized SignalR handlers for ChatHub.
 * Optional: app still works if this file is removed.
 */
(function (global) {
    const messageHandlers = new Set();
    const seenHandlers = new Set();
    const groupRefCount = new Map(); // conversationId -> count
    let currentConnection = null;
    const pendingInvokes = new Map(); // key -> { method, args, resolve, timeoutId }

    function isGuid(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
    }

    function attachHandlers(conn) {
        if (!conn || typeof conn.on !== 'function') return;

        try {
            conn.off('ReceiveNewMessage');
            conn.off('MemberSeen');
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
        joinConversation(conversationId) {
            if (!isGuid(conversationId)) return Promise.reject(new Error('Invalid conversationId'));
            
            const count = groupRefCount.get(conversationId) || 0;
            const newCount = count + 1;
            groupRefCount.set(conversationId, newCount);

            if (count === 0) {
                // First joiner, actually tell server
                return invokeOrQueue('JoinConversation', [conversationId], `join:${conversationId}`)
                    .then(res => {
                        console.log(`✅ [SignalR] Network Join: ${conversationId}`);
                        return res;
                    });
            } else {
                console.log(`📡 [Realtime] Session Added: ${conversationId} (Total: ${newCount})`);
                return Promise.resolve(true);
            }
        },
        leaveConversation(conversationId) {
            if (!isGuid(conversationId)) return Promise.reject(new Error('Invalid conversationId'));
            
            const count = groupRefCount.get(conversationId) || 0;
            if (count <= 0) return Promise.resolve(true);

            const newCount = count - 1;
            if (newCount === 0) {
                // Last joiner, actually tell server
                groupRefCount.delete(conversationId);
                return invokeOrQueue('LeaveConversation', [conversationId], `leave:${conversationId}`)
                    .then(res => {
                        console.log(`👋 [SignalR] Network Leave: ${conversationId}`);
                        return res;
                    });
            } else {
                groupRefCount.set(conversationId, newCount);
                console.log(`🚪 [Realtime] Session Removed: ${conversationId} (Remaining: ${newCount})`);
                return Promise.resolve(true);
            }
        },
        seenConversation(conversationId, messageId) {
            if (!isGuid(conversationId) || !messageId) return Promise.reject(new Error('Invalid seen payload'));
            return invokeOrQueue('SeenConversation', [conversationId, messageId], `seen:${conversationId}`);
        },
        typing(conversationId, isTyping) {
            if (!isGuid(conversationId)) return Promise.reject(new Error('Invalid conversationId'));
            return invokeOrQueue('Typing', [conversationId, !!isTyping], `typing:${conversationId}`);
        }
    };

    global.ChatRealtime = ChatRealtime;

    // Start polling for connection availability
    ensureAttached();
})(window);
