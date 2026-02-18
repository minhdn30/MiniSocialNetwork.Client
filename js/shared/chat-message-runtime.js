/**
 * Chat Message Runtime
 * Shared internal runtime for chat-page and chat-window message flow.
 */
(function (global) {
    function toLowerSafe(value) {
        if (value === null || value === undefined) return '';
        return value.toString().toLowerCase();
    }

    function createContext(options = {}) {
        const myId = toLowerSafe(options.myAccountId || localStorage.getItem('accountId') || '');
        return {
            scope: options.scope === 'window' ? 'window' : 'page',
            conversationId: options.conversationId || null,
            myAccountId: myId,
            retryFiles: options.retryFiles instanceof Map ? options.retryFiles : new Map(),
            pendingSeenByConv: options.pendingSeenByConv instanceof Map ? options.pendingSeenByConv : new Map(),
            blobUrls: options.blobUrls instanceof Map ? options.blobUrls : new Map(),
            now: typeof options.now === 'function' ? options.now : () => new Date()
        };
    }

    function normalizeIncomingMessage(raw, myAccountId = '') {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.__normalized === true) {
            return raw;
        }

        const myId = toLowerSafe(myAccountId || localStorage.getItem('accountId') || '');
        const convRaw = raw.ConversationId || raw.conversationId || raw.conversationID || raw.conversation;
        const msgRaw = raw.MessageId || raw.messageId || raw.messageID;
        const tempId = raw.TempId || raw.tempId || null;
        const senderRaw =
            raw.Sender?.AccountId ||
            raw.sender?.accountId ||
            raw.SenderId ||
            raw.senderId ||
            '';
        const senderId = toLowerSafe(senderRaw);
        const messageId = msgRaw ? toLowerSafe(msgRaw) : null;
        const conversationId = convRaw ? toLowerSafe(convRaw) : '';
        const sentAt = raw.SentAt || raw.sentAt || new Date().toISOString();
        const contentRaw = raw.Content ?? raw.content ?? '';
        const content = typeof contentRaw === 'string' ? contentRaw.trim() : '';
        const medias = raw.Medias || raw.medias || [];
        const isRecalledRaw = raw.IsRecalled ?? raw.isRecalled;
        const isRecalled = (typeof isRecalledRaw === 'boolean')
            ? isRecalledRaw
            : (typeof isRecalledRaw === 'string' ? isRecalledRaw.toLowerCase() === 'true' : !!isRecalledRaw);
        const normalizeContentFn = global.ChatCommon && typeof global.ChatCommon.normalizeContent === 'function'
            ? global.ChatCommon.normalizeContent
            : (txt) => (txt || '').trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ');

        return {
            __normalized: true,
            raw,
            conversationId,
            messageId,
            tempId,
            senderId,
            isOwn: !!(senderId && myId && senderId === myId),
            content,
            normalizedContent: normalizeContentFn(content),
            sentAt,
            medias,
            isRecalled
        };
    }

    function queuePendingSeen(ctx, conversationId, messageId, accountId, memberInfo = null) {
        if (!ctx || !conversationId || !messageId || !accountId) return;

        const convId = toLowerSafe(conversationId);
        const msgId = toLowerSafe(messageId);
        const accId = toLowerSafe(accountId);

        let convMap = ctx.pendingSeenByConv.get(convId);
        if (!convMap) {
            convMap = new Map();
            ctx.pendingSeenByConv.set(convId, convMap);
        }

        let entries = convMap.get(msgId);
        if (!entries) {
            entries = [];
            convMap.set(msgId, entries);
        }

        entries.push({ accountId: accId, memberInfo });
    }

    function applyPendingSeenForMessage(ctx, conversationId, messageId, moveSeenAvatarFn) {
        if (!ctx || !conversationId || !messageId || typeof moveSeenAvatarFn !== 'function') return;
        const convId = toLowerSafe(conversationId);
        const msgId = toLowerSafe(messageId);

        const convMap = ctx.pendingSeenByConv.get(convId);
        if (!convMap) return;

        const entries = convMap.get(msgId);
        if (!entries || entries.length === 0) return;

        convMap.delete(msgId);
        entries.forEach(item => {
            moveSeenAvatarFn(item.accountId, msgId, item.memberInfo);
        });
        if (convMap.size === 0) {
            ctx.pendingSeenByConv.delete(convId);
        }
    }

    function trackBlobUrl(ctx, key, url) {
        if (!ctx || !url) return null;
        const safeKey = key || 'global';
        if (!ctx.blobUrls.has(safeKey)) {
            ctx.blobUrls.set(safeKey, new Set());
        }
        ctx.blobUrls.get(safeKey).add(url);
        return url;
    }

    function revokeBlobUrlIfNeeded(ctx, url) {
        if (!ctx || !url) return;
        try {
            URL.revokeObjectURL(url);
        } catch (err) {
            console.warn('Failed to revoke blob URL:', err);
        }
        ctx.blobUrls.forEach(set => set.delete(url));
    }

    function revokeMediaUrlsForTemp(ctx, tempId) {
        if (!ctx || !tempId) return;
        ctx.retryFiles.delete(tempId);
        const urls = ctx.blobUrls.get(tempId);
        if (urls && urls.size > 0) {
            Array.from(urls).forEach((url) => revokeBlobUrlIfNeeded(ctx, url));
        }
        ctx.blobUrls.delete(tempId);
    }

    function findOptimisticBubble(container, normalizedMsg, myAccountId = '') {
        if (!container || !normalizedMsg) return null;
        const myId = toLowerSafe(myAccountId || localStorage.getItem('accountId') || '');
        const tempId = normalizedMsg.tempId || normalizedMsg.TempId || null;
        if (tempId) {
            const bubble = container.querySelector(`[data-temp-id="${tempId}"]`);
            if (bubble) return bubble;
        }

        const senderId = toLowerSafe(normalizedMsg.senderId || normalizedMsg.SenderId || normalizedMsg.sender?.accountId);
        const isOwn = typeof normalizedMsg.isOwn === 'boolean' ? normalizedMsg.isOwn : !!(myId && senderId === myId);
        if (!isOwn) return null;

        const incomingMedias = normalizedMsg.medias || normalizedMsg.Medias || [];
        const incomingContent = normalizedMsg.normalizedContent || (global.ChatCommon?.normalizeContent
            ? global.ChatCommon.normalizeContent(normalizedMsg.content || '')
            : (normalizedMsg.content || '').trim());

        const optimisticMsgs = container.querySelectorAll('.msg-bubble-wrapper.sent[data-status="pending"]');
        for (const opt of optimisticMsgs) {
            const optContentRaw = opt.querySelector('.msg-bubble')?.innerText || '';
            const optContent = global.ChatCommon?.normalizeContent
                ? global.ChatCommon.normalizeContent(optContentRaw)
                : optContentRaw.trim();
            const optMediaCount = opt.querySelectorAll('.msg-media-item')?.length || 0;

            const matchByContent = incomingContent && optContent === incomingContent;
            const matchByMedia = !incomingContent && !optContent && incomingMedias.length > 0 && optMediaCount === incomingMedias.length;
            if (matchByContent || matchByMedia) {
                return opt;
            }
        }

        return null;
    }

    function replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId = null) {
        if (!ctx || !bubble || !messagePayload) return false;
        const medias = messagePayload.Medias || messagePayload.medias || [];
        if (!Array.isArray(medias) || medias.length === 0) return false;

        let replaced = false;
        medias.forEach((m, i) => {
            const mediaUrl = m.MediaUrl || m.mediaUrl;
            const mediaId = toLowerSafe(m.MessageMediaId || m.messageMediaId || '');
            if (!mediaUrl) return;

            const targetItem = bubble.querySelector(`[data-media-index="${i}"]`);
            if (!targetItem) return;

            const img = targetItem.querySelector('img');
            const vid = targetItem.querySelector('video');
            const fileLink = targetItem.querySelector('.msg-file-link');
            if (img) {
                if (img.src?.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, img.src);
                img.src = mediaUrl;
                replaced = true;
            }
            if (vid) {
                if (vid.src?.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, vid.src);
                vid.src = mediaUrl;
                replaced = true;
            }
            if (fileLink) {
                const oldHref = fileLink.getAttribute('href') || '';
                if (oldHref.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, oldHref);
                fileLink.setAttribute('href', mediaUrl);
                if (mediaId) {
                    fileLink.setAttribute('data-message-media-id', mediaId);
                } else {
                    fileLink.removeAttribute('data-message-media-id');
                }
                replaced = true;
            }
        });

        if (replaced && tempId) {
            revokeMediaUrlsForTemp(ctx, tempId);
        }

        // Update data-medias JSON on the grid so previewGridMedia reads the correct URLs
        if (replaced) {
            const grid = bubble.querySelector('.msg-media-grid');
            if (grid && grid.dataset.medias) {
                try {
                    const oldMedias = JSON.parse(grid.dataset.medias);
                    medias.forEach((m, i) => {
                        if (oldMedias[i]) {
                            const url = m.MediaUrl || m.mediaUrl;
                            const mediaId = toLowerSafe(m.MessageMediaId || m.messageMediaId || '');
                            if (url) {
                                oldMedias[i].mediaUrl = url;
                                if (oldMedias[i].MediaUrl) oldMedias[i].MediaUrl = url;
                            }
                            if (mediaId) {
                                oldMedias[i].messageMediaId = mediaId;
                                if (oldMedias[i].MessageMediaId) oldMedias[i].MessageMediaId = mediaId;
                            }
                        }
                    });
                    grid.dataset.medias = JSON.stringify(oldMedias);
                } catch (e) { /* ignore parse errors */ }
            }
        }

        return replaced;
    }

    function buildRetryFormData({ content, tempId, files, receiverId, replyToMessageId }) {
        const formData = new FormData();
        const safeContent = typeof content === 'string' ? content.trim() : '';
        const safeFiles = Array.isArray(files) ? files : [];
        const hasText = safeContent.length > 0;

        if (hasText) formData.append('Content', safeContent);
        if (tempId) formData.append('TempId', tempId);
        safeFiles.forEach(file => formData.append('MediaFiles', file));
        if (receiverId) formData.append('ReceiverId', receiverId);
        if (replyToMessageId) formData.append('ReplyToMessageId', replyToMessageId);

        return {
            formData,
            hasText,
            hasFiles: safeFiles.length > 0
        };
    }

    function applyMessageStatus(ctx, params) {
        const {
            container,
            bubble,
            status,
            content,
            tempId,
            realMessageId,
            messagePayload,
            retryHandler,
            onPendingSeen,
            removePreviousSent
        } = params || {};

        if (!ctx || !container || !bubble) return false;

        bubble.dataset.status = status;

        const normalizedMessageId = realMessageId ? toLowerSafe(realMessageId) : null;
        if (normalizedMessageId) {
            bubble.dataset.messageId = normalizedMessageId;
            const seenRow = bubble.querySelector('.msg-seen-row');
            if (seenRow) {
                seenRow.id = `seen-row-${normalizedMessageId}`;
            }
            if (typeof onPendingSeen === 'function') {
                onPendingSeen(normalizedMessageId);
            }
        }

        if (status === 'sent') {
            const hadBlobMedia = !!bubble.querySelector('img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]');
            const replaced = replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId);
            ctx.retryFiles.delete(tempId);
            if (!hadBlobMedia || replaced) {
                revokeMediaUrlsForTemp(ctx, tempId);
            }

            if (typeof removePreviousSent === 'function') {
                removePreviousSent(bubble);
            } else {
                container.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach((el) => {
                    if (el !== bubble) {
                        el.removeAttribute('data-status');
                        el.querySelector('.msg-status')?.remove();
                    }
                });
            }
        }

        const existingStatus = bubble.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();

        const statusEl = document.createElement('div');
        statusEl.className = 'msg-status';

        if (status === 'pending') {
            statusEl.className += ' msg-status-sending';
            statusEl.innerHTML = '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
        } else if (status === 'sent') {
            statusEl.className += ' msg-status-sent';
            statusEl.textContent = 'Sent';
        } else if (status === 'failed') {
            statusEl.className += ' msg-status-failed';
            statusEl.textContent = 'Failed to send. Click to retry.';
            if (typeof retryHandler === 'function') {
                statusEl.onclick = () => retryHandler(tempId, content);
            }
        }

        bubble.appendChild(statusEl);
        return true;
    }

    global.ChatMessageRuntime = {
        createContext,
        normalizeIncomingMessage,
        queuePendingSeen,
        applyPendingSeenForMessage,
        trackBlobUrl,
        revokeBlobUrlIfNeeded,
        revokeMediaUrlsForTemp,
        findOptimisticBubble,
        replaceOptimisticMediaUrls,
        buildRetryFormData,
        applyMessageStatus
    };
})(window);
