/**
 * Chat Common Utilities
 * Reusable functions for chat components (Sidebar, Windows, Full Page)
 */
const ChatCommon = {
    /**
     * Helper to get avatar URL with fallback
     */
    getAvatar(conv) {
        return conv.displayAvatar || APP_CONFIG.DEFAULT_AVATAR;
    },

    /**
     * Helper to get display name (Username for private, DisplayName for group)
     */
    getDisplayName(conv) {
        return conv.displayName || 'Unknown';
    },

    /**
     * Determine grouping position for a message within a consecutive group.
     * Returns: 'single' | 'first' | 'middle' | 'last'
     *
     * @param {Object} msg - Current message
     * @param {Object|null} prevMsg - Previous message (above in display order)
     * @param {Object|null} nextMsg - Next message (below in display order)
     */
    getGroupPosition(msg, prevMsg, nextMsg) {
        const sameSenderAsPrev = prevMsg && prevMsg.sender?.accountId === msg.sender?.accountId;
        const sameSenderAsNext = nextMsg && nextMsg.sender?.accountId === msg.sender?.accountId;

        // Also break grouping if time gap > configured threshold (default 2 mins)
        const gap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const closeTimePrev = prevMsg && (new Date(msg.sentAt) - new Date(prevMsg.sentAt) < gap);
        const closeTimeNext = nextMsg && (new Date(nextMsg.sentAt) - new Date(msg.sentAt) < gap);

        const groupedWithPrev = sameSenderAsPrev && closeTimePrev;
        const groupedWithNext = sameSenderAsNext && closeTimeNext;

        if (groupedWithPrev && groupedWithNext) return 'middle';
        if (groupedWithPrev && !groupedWithNext) return 'last';
        if (!groupedWithPrev && groupedWithNext) return 'first';
        return 'single';
    },

    /**
     * Generate HTML for a message bubble with grouping, avatar, and author name support.
     *
     * @param {Object} msg - Message object (must have .isOwn set)
     * @param {Object} options
     * @param {boolean} options.isGroup - Is this a group conversation?
     * @param {string}  options.groupPos - 'single' | 'first' | 'middle' | 'last'
     * @param {string}  options.senderAvatar - Avatar URL (for 1:1 received messages)
     * @param {string}  options.authorName - Display name (for group received messages)
     */
    renderMessageBubble(msg, options = {}) {
        const {
            isGroup = false,
            groupPos = 'single',
            senderAvatar = '',
            authorName = ''
        } = options;

        const isOwn = msg.isOwn;
        const isReceived = !isOwn;
        const wrapperClass = isOwn ? 'sent' : 'received';
        const rawMessageId = msg.messageId || msg.MessageId || '';
        const messageId = rawMessageId ? rawMessageId.toString().toLowerCase() : '';
        const dataMessageIdAttr = messageId ? ` data-message-id="${messageId}"` : '';

        // --- Media ---
        const allMedias = msg.medias || msg.Medias || [];
        const hasMedia = allMedias.length > 0;
        let mediaHtml = '';
        if (hasMedia) {
            // Only show up to 4 items in the grid
            const displayMedias = allMedias.slice(0, 4);
            const remainingCount = allMedias.length - 4;
            const gridClass = `count-${Math.min(allMedias.length, 4)}`;

            mediaHtml = `
                <div class="msg-media-grid ${gridClass}">
                    ${displayMedias.map((m, idx) => {
                        const isLast = idx === 3 && remainingCount > 0;
                        let inner = '';
                        if (m.mediaType === 0) {
                            inner = `<img src="${m.mediaUrl}" alt="image" loading="lazy" onclick="window.previewImage && window.previewImage('${m.mediaUrl}')">`;
                        } else if (m.mediaType === 1) {
                            inner = `<video src="${m.mediaUrl}"></video>`; // Removed controls for clean grid
                        }

                        return `
                            <div class="msg-media-item" onclick="window.previewImage && window.previewImage('${m.mediaUrl}')">
                                ${inner}
                                ${isLast ? `<div class="msg-media-more-overlay">+${remainingCount}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // --- Author name (Group chat only, received only, first or single in group) ---
        const showAuthor = isGroup && isReceived && (groupPos === 'first' || groupPos === 'single');
        const authorHtml = showAuthor && authorName
            ? `<div class="msg-author">${escapeHtml(authorName)}</div>`
            : '';

        // --- Avatar (Received messages only) ---
        // Show avatar on 'last' or 'single' position (bottom of group) like Messenger
        const showAvatar = isReceived && (groupPos === 'last' || groupPos === 'single');
        
        let avatarSrc = senderAvatar || msg.sender?.avatarUrl || msg.sender?.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        const avatarHtml = isReceived
            ? `<div class="msg-avatar ${showAvatar ? '' : 'msg-avatar-spacer'}">
                ${showAvatar ? `<img src="${avatarSrc}" alt="" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">` : ''}
               </div>`
            : '';

        // --- Build HTML ---
        const seenRowHtml = isOwn
            ? `<div class="msg-seen-row"${messageId ? ` id="seen-row-${messageId}"` : ''}></div>`
            : '';

        return `
            <div class="msg-bubble-wrapper ${wrapperClass} msg-group-${groupPos}" data-sent-at="${msg.sentAt || ''}" data-sender-id="${msg.sender?.accountId || msg.senderId || ''}"${dataMessageIdAttr}>
                ${authorHtml}
                <div class="msg-row">
                    ${avatarHtml}
                    <div class="msg-content-container">
                        ${mediaHtml}
                        ${msg.content ? `<div class="msg-bubble">${escapeHtml(msg.content)}</div>` : ''}
                    </div>
                </div>
                ${seenRowHtml}
            </div>
        `;
    },

    /**
     * Render a centered time separator
     * @param {string|Date} date
     */
    renderChatSeparator(date) {
        const timeStr = PostUtils.formatChatSeparatorTime(date);
        return `<div class="chat-time-separator">${timeStr}</div>`;
    },

    /**
     * Format last message preview
     */
    getLastMsgPreview(conv) {
        if (conv.lastMessagePreview) return conv.lastMessagePreview;
        return conv.isGroup ? 'Group created' : 'Started a conversation';
    }
};

window.ChatCommon = ChatCommon;
