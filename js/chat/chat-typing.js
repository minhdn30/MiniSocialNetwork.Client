/**
 * ChatTyping — Shared typing indicator logic for chat-page and chat-window.
 * Handles emitting typing events (debounced), receiving typing events,
 * and showing/hiding the typing indicator UI.
 */
(function (global) {
    const EMIT_DEBOUNCE_MS = 3000;  // After 3s of no keystrokes, send typing=false
    const TYPING_TRUE_HEARTBEAT_MS = 1000;

    // Per-conversation timer state: conversationId -> { emitTimeout, isTyping, lastTrueEmitAt }
    const timerMap = new Map();

    function getTimers(convId) {
        if (!timerMap.has(convId)) {
            timerMap.set(convId, { emitTimeout: null, isTyping: false, lastTrueEmitAt: 0 });
        }
        return timerMap.get(convId);
    }

    function extractMeta(input) {
        if (!input || typeof input !== 'object') {
            return { accountId: '', metaData: null, avatarUrl: '' };
        }
        return {
            accountId: (input.accountId || '').toString().toLowerCase(),
            metaData: input.metaData || null,
            avatarUrl: input.avatarUrl || ''
        };
    }

    function findMessageContainer(indicatorEl) {
        if (!indicatorEl) return null;
        const chatBox = indicatorEl.closest('.chat-box');
        if (chatBox) {
            return chatBox.querySelector('.chat-messages');
        }
        const chatView = indicatorEl.closest('.chat-view');
        if (chatView) {
            return chatView.querySelector('.chat-view-messages');
        }
        return null;
    }

    function isNearBottom(container) {
        if (!container) return false;
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distance <= 120;
    }

    function pinToBottom(container) {
        if (!container) return;
        const snap = () => {
            container.scrollTop = container.scrollHeight;
        };
        requestAnimationFrame(snap);
        setTimeout(snap, 0);
        setTimeout(snap, 120);
    }

    function buildIndicatorHtml(defaultAvatar) {
        const avatar = defaultAvatar || '';
        return `
            <div class="typing-message-shell received msg-group-single">
                <div class="msg-row">
                    <div class="msg-avatar">
                        <img class="typing-avatar" src="${avatar}" alt="typing avatar">
                    </div>
                    <div class="msg-bubble typing-bubble" aria-label="Typing">
                        <span class="typing-dots">
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    function resolveMessageContainerByContext(elementId, conversationId) {
        if (elementId === 'typing-indicator-page') {
            return document.getElementById('chat-view-messages');
        }
        if (conversationId) {
            const byConversation = document.getElementById(`chat-messages-${conversationId}`);
            if (byConversation) return byConversation;
        }
        if (elementId && elementId.startsWith('typing-indicator-')) {
            const inferredConvId = elementId.replace('typing-indicator-', '');
            if (inferredConvId) {
                return document.getElementById(`chat-messages-${inferredConvId}`);
            }
        }
        return null;
    }

    function getOrCreateIndicator(elementId, conversationId) {
        let indicator = document.getElementById(elementId);
        if (indicator) return indicator;

        const container = resolveMessageContainerByContext(elementId, conversationId);
        if (!container) return null;

        indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = elementId;
        indicator.innerHTML = buildIndicatorHtml(global.APP_CONFIG?.DEFAULT_AVATAR || '');
        container.appendChild(indicator);
        return indicator;
    }

    function ensureIndicatorStructure(el) {
        if (!el) return;
        const hasAvatar = !!el.querySelector('.typing-avatar');
        const hasBubble = !!el.querySelector('.typing-bubble');
        if (hasAvatar && hasBubble) return;
        el.innerHTML = buildIndicatorHtml(global.APP_CONFIG?.DEFAULT_AVATAR || '');
    }

    /**
     * Emit typing status over SignalR (debounced).
     * Call this on every keystroke in the input field.
     * @param {string} conversationId
     */
    function emitTyping(conversationId) {
        if (!conversationId) return;
        if (!global.ChatRealtime || typeof global.ChatRealtime.typing !== 'function') return;

        const timers = getTimers(conversationId);
        const now = Date.now();

        // Send typing=true on first keystroke and heartbeat periodically while typing.
        if (!timers.isTyping || (now - (timers.lastTrueEmitAt || 0) >= TYPING_TRUE_HEARTBEAT_MS)) {
            timers.isTyping = true;
            timers.lastTrueEmitAt = now;
            global.ChatRealtime.typing(conversationId, true);
        }

        // Reset debounce — after EMIT_DEBOUNCE_MS of silence, send typing=false
        clearTimeout(timers.emitTimeout);
        timers.emitTimeout = setTimeout(() => {
            timers.isTyping = false;
            timers.lastTrueEmitAt = 0;
            global.ChatRealtime.typing(conversationId, false);
        }, EMIT_DEBOUNCE_MS);
    }

    /**
     * Immediately cancel typing emission (e.g. on send or close).
     * @param {string} conversationId
     */
    function cancelTyping(conversationId) {
        if (!conversationId) return;

        const timers = getTimers(conversationId);

        if (timers.isTyping) {
            timers.isTyping = false;
            timers.lastTrueEmitAt = 0;
            if (global.ChatRealtime && typeof global.ChatRealtime.typing === 'function') {
                global.ChatRealtime.typing(conversationId, false);
            }
        }

        clearTimeout(timers.emitTimeout);
        timers.emitTimeout = null;
    }

    /**
     * Resolve avatar for typing account from conversation metadata.
     * @param {string} accountId
     * @param {object} metaData
     * @returns {string}
     */
    function resolveTypingAvatar(accountId, metaData) {
        const normalizedAccountId = (accountId || '').toString().toLowerCase();
        if (metaData?.isGroup && Array.isArray(metaData.members) && normalizedAccountId) {
            const member = metaData.members.find((m) =>
                ((m.accountId || m.AccountId || '').toString().toLowerCase() === normalizedAccountId)
            );
            const groupAvatar = member?.avatarUrl || member?.AvatarUrl || member?.avatar;
            if (groupAvatar) return groupAvatar;
        }

        if (metaData?.isGroup && Array.isArray(metaData.memberSeenStatuses) && normalizedAccountId) {
            const member = metaData.memberSeenStatuses.find((m) =>
                ((m.accountId || m.AccountId || '').toString().toLowerCase() === normalizedAccountId)
            );
            const groupAvatar = member?.avatarUrl || member?.AvatarUrl || member?.avatar;
            if (groupAvatar) return groupAvatar;
        }

        const other = metaData?.otherMember || null;
        const privateAvatar = other?.avatarUrl || other?.AvatarUrl || other?.avatar;
        if (privateAvatar) return privateAvatar;

        return metaData?.displayAvatar || global.APP_CONFIG?.DEFAULT_AVATAR || '';
    }

    /**
     * Show the typing indicator in the given DOM element.
     * @param {string} elementId - ID of the .typing-indicator element
     * @param {string} conversationId - used for timer tracking
     * @param {object|string} metaOrLegacyName - new shape: {accountId, metaData, avatarUrl}
     */
    function showIndicator(elementId, conversationId, metaOrLegacyName) {
        const el = getOrCreateIndicator(elementId, conversationId);
        if (!el) return;

        ensureIndicatorStructure(el);

        const msgContainer = findMessageContainer(el);
        const shouldStickBottom = isNearBottom(msgContainer);

        // Keep typing row at the bottom of current message list (like newest incoming message).
        if (msgContainer && el.parentElement !== msgContainer) {
            msgContainer.appendChild(el);
        } else if (msgContainer) {
            msgContainer.appendChild(el);
        }

        const meta = extractMeta(metaOrLegacyName);
        const avatarEl = el.querySelector('.typing-avatar');
        if (avatarEl) {
            const avatar =
                meta.avatarUrl ||
                resolveTypingAvatar(meta.accountId, meta.metaData) ||
                global.APP_CONFIG?.DEFAULT_AVATAR ||
                '';
            avatarEl.src = avatar;
            avatarEl.alt = 'typing avatar';
        }

        el.classList.add('active');
        if (global.lucide) {
            global.lucide.createIcons({ container: el });
        }
        if (shouldStickBottom) {
            pinToBottom(msgContainer);
        }
    }

    /**
     * Hide the typing indicator.
     * @param {string} elementId
     * @param {string} conversationId
     */
    function hideIndicator(elementId, _conversationId) {
        const el = document.getElementById(elementId);
        if (el) {
            const msgContainer = findMessageContainer(el);
            const shouldStickBottom = isNearBottom(msgContainer);
            el.classList.remove('active');
            if (shouldStickBottom) {
                pinToBottom(msgContainer);
            }
        }
    }

    /**
     * Resolve the display name from metadata for the typing user.
     * @param {string} accountId - the account typing
     * @param {object} metaData - conversation metadata (has isGroup, members, otherMember)
     * @returns {string}
     */
    function resolveTypingName(accountId, metaData) {
        if (!metaData) return '';

        if (metaData.isGroup && metaData.members) {
            const member = metaData.members.find(m =>
                (m.accountId || m.AccountId || '').toLowerCase() === accountId
            );
            return member?.nickname || member?.username || member?.fullName || '';
        }

        const other = metaData.otherMember;
        return other?.nickname || other?.username || other?.fullName || '';
    }

    /**
     * Clean up all timers for a conversation (e.g. on close).
     * @param {string} conversationId
     */
    function cleanup(conversationId) {
        const timers = timerMap.get(conversationId);
        if (timers) {
            clearTimeout(timers.emitTimeout);
        }
        timerMap.delete(conversationId);
    }

    global.ChatTyping = {
        emitTyping,
        cancelTyping,
        showIndicator,
        hideIndicator,
        resolveTypingName,
        resolveTypingAvatar,
        cleanup
    };
})(window);
