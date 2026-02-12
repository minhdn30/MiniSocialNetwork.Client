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

    getDisplayName(conv) {
        if (!conv) return 'Chat';
        if (conv.isGroup) return conv.displayName || 'Group Chat';
        
        // Defensive check: ensure we prioritize the OTHER member's info
        const other = conv.otherMember;
        if (other) {
            return other.nickname || other.username || other.fullName || 'Chat';
        }

        // Fallback for cases where otherMember might be temporarily missing from the object
        return conv.displayName || 'Chat';
    },

    /**
     * Normalize message object to have consistent property names and casing.
     */
    normalizeMessage(m, myId) {
        if (!m) return null;
        
        // IDs
        if (!m.messageId && m.MessageId) m.messageId = m.MessageId.toString().toLowerCase();
        if (m.messageId) m.messageId = m.messageId.toString().toLowerCase();
        
        // Timestamps
        if (!m.sentAt && m.SentAt) m.sentAt = m.SentAt;
        
        // Medias
        if (!m.medias && m.Medias) m.medias = m.Medias;
        
        // Sender/Ownership
        const senderId = (m.sender?.accountId || m.SenderId || m.senderId || '').toLowerCase();
        if (myId && typeof m.isOwn !== 'boolean') {
            m.isOwn = (senderId === myId.toLowerCase());
        }
        
        // Ensure sender object exists with at least accountId
        if (!m.sender) {
            m.sender = { accountId: senderId };
        } else if (!m.sender.accountId && senderId) {
            m.sender.accountId = senderId;
        }
        return m;
    },

    /**
     * Normalize text for comparison by stripping whitespace and standardizing newlines.
     */
    normalizeContent(text) {
        if (!text) return "";
        return text.trim()
            .replace(/\r\n/g, "\n")    // Standardize newlines
            .replace(/\s+/g, " ");      // Collapse all whitespace (including newlines) to a single space for maximum robustness
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
        const msgId = msg.sender?.accountId;
        const prevId = prevMsg?.sender?.accountId;
        const nextId = nextMsg?.sender?.accountId;

        const sameSenderAsPrev = prevMsg && prevId === msgId;
        const sameSenderAsNext = nextMsg && nextId === msgId;

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

            // Escaping JSON for HTML attribute safely
            const mediaListJson = JSON.stringify(allMedias).replace(/"/g, '&quot;');

            mediaHtml = `
                <div class="msg-media-grid ${gridClass}">
                    ${displayMedias.map((m, idx) => {
                        const isLast = idx === 3 && remainingCount > 0;
                        let inner = '';
                        let onclickStr = '';
                        let dblclickStr = `ondblclick="window.previewMedia && window.previewMedia('', ${idx}, ${mediaListJson})"`;

                        if (m.mediaType === 0) {
                            inner = `<img src="${m.mediaUrl}" alt="media" loading="lazy">`;
                            // Image: single click opens preview
                            onclickStr = `onclick="window.previewMedia && window.previewMedia('', ${idx}, ${mediaListJson})"`;
                            dblclickStr = ''; 
                        } else if (m.mediaType === 1) {
                            inner = `
                                <div class="msg-video-container">
                                    <video src="${m.mediaUrl}" loop muted playsinline></video>
                                    <div class="msg-video-overlay" onclick="ChatCommon.toggleChatVideo(event, this)">
                                        <div class="play-button-wrapper">
                                            <i data-lucide="play" class="play-icon"></i>
                                        </div>
                                    </div>
                                </div>
                            `;
                            // Video: dblclick to zoom, single click handled by overlay
                        }

                        return `
                            <div class="msg-media-item" ${onclickStr} ${dblclickStr}>
                                ${inner}
                                ${isLast ? `<div class="msg-media-more-overlay" onclick="event.stopPropagation(); window.previewMedia && window.previewMedia('', 3, ${mediaListJson})">+${remainingCount}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // --- Author name (Group chat only, received only, first or single in group) ---
        const senderId = msg.sender?.accountId || msg.senderId || '';
        const showAuthor = isGroup && isReceived && (groupPos === 'first' || groupPos === 'single');
        const authorHtml = showAuthor && authorName
            ? `<div class="msg-author" onclick="window.ChatCommon.goToProfile('${senderId}')">${escapeHtml(authorName)}</div>`
            : '';

        // --- Avatar (Received messages only) ---
        // Show avatar on 'last' or 'single' position (bottom of group) like Messenger
        const showAvatar = isReceived && (groupPos === 'last' || groupPos === 'single');
        
        let avatarSrc = senderAvatar || msg.sender?.avatarUrl || msg.sender?.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        const avatarHtml = isReceived
            ? `<div class="msg-avatar ${showAvatar ? '' : 'msg-avatar-spacer'}">
                ${showAvatar ? `<img src="${avatarSrc}" alt="" onclick="window.ChatCommon.goToProfile('${senderId}')" style="cursor: pointer;" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">` : ''}
               </div>`
            : '';

        // --- Build Actions (Messenger Style) ---
        const isPage = !!options.isPage;
        const msgActionsHtml = `
            <div class="msg-actions">
                ${isPage ? `
                    <button class="msg-action-btn" title="React" onclick="window.ChatActions && ChatActions.openReactMenu(event, '${messageId}')">
                        <i data-lucide="smile"></i>
                    </button>
                    <button class="msg-action-btn" title="Reply" onclick="window.ChatActions && ChatActions.replyTo('${messageId}')">
                        <i data-lucide="reply"></i>
                    </button>
                ` : ''}
                <button class="msg-action-btn more" title="More" onclick="window.ChatActions && ChatActions.openMoreMenu(event, '${messageId}', ${isOwn})">
                    <i data-lucide="more-horizontal"></i>
                </button>
            </div>
        `;

        // --- Build HTML ---
        const seenRowHtml = isOwn
            ? `<div class="msg-seen-row"${messageId ? ` id="seen-row-${messageId}"` : ''}></div>`
            : '';

        return `
            <div class="msg-bubble-wrapper ${wrapperClass} msg-group-${groupPos}" 
                 data-sent-at="${msg.sentAt || ''}" 
                 data-sender-id="${msg.sender?.accountId || msg.senderId || ''}"
                 data-avatar-url="${avatarSrc}"
                 data-author-name="${(authorName || '').replace(/"/g, '&quot;')}"
                 ${dataMessageIdAttr}
                 ${msg.status ? `data-status="${msg.status}"` : ''}>
                ${authorHtml}
                <div class="msg-row">
                    ${avatarHtml}
                    <div class="msg-content-container">
                        ${mediaHtml}
                        ${msg.content ? `<div class="msg-bubble">${linkify(escapeHtml(msg.content))}</div>` : ''}
                    </div>
                    <span class="msg-time-tooltip">${this.formatTime(msg.sentAt)}</span>
                    ${msgActionsHtml}
                </div>
                ${seenRowHtml}
                ${msg.status ? `
                    <div class="msg-status ${msg.status === 'pending' ? 'msg-status-sending' : (msg.status === 'sent' ? 'msg-status-sent' : 'msg-status-failed')}">
                        ${msg.status === 'pending' ? '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>' : (msg.status === 'sent' ? 'Sent' : 'Failed to send. Click to retry.')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Toggle video play/pause in chat bubble
     */
    toggleChatVideo(e, overlay) {
        if (e) e.stopPropagation();
        const container = overlay.closest('.msg-video-container');
        const video = container.querySelector('video');
        const icon = overlay.querySelector('i');

        if (video.paused) {
            video.play();
            container.classList.add('playing');
            if (icon) icon.setAttribute('data-lucide', 'pause');
        } else {
            video.pause();
            container.classList.remove('playing');
            if (icon) icon.setAttribute('data-lucide', 'play');
        }

        if (window.lucide) lucide.createIcons();
    },

    /**
     * Format time for chat separators (e.g. "13:58", "13:58 Yesterday", "Feb 12, 10:35")
     */
    formatTime(dateVal) {
        if (!dateVal) return '';
        const date = new Date(dateVal);
        const now = new Date();
        const pad = (num) => num.toString().padStart(2, '0');
        
        const HH = pad(date.getHours());
        const mm = pad(date.getMinutes());
        const timeStr = `${HH}:${mm}`;
        
        const isToday = date.toDateString() === now.toDateString();
        
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        
        if (isToday) return timeStr;
        if (isYesterday) return `${timeStr} Yesterday`;
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = monthNames[date.getMonth()];
        const day = date.getDate();
        const isSameYear = date.getFullYear() === now.getFullYear();

        if (isSameYear) {
            return `${month} ${day}, ${timeStr}`;
        }

        const year = date.getFullYear();
        return `${month} ${day}, ${year}, ${timeStr}`;
    },

    /**
     * Render a centered time separator
     * @param {string|Date} date
     */
    renderChatSeparator(date) {
        const timeStr = this.formatTime(date);
        return `<div class="chat-time-separator">${timeStr}</div>`;
    },

    goToProfile(accountId) {
        if (!accountId) return;
        // If we are leaving chat-page, ensure we minimize the current chat session
        if (window.ChatPage && typeof window.ChatPage.minimizeToBubble === 'function') {
            window.ChatPage.minimizeToBubble();
        }
        window.location.hash = `#/profile/${accountId}`;
    },

    /**
     * Format last message preview
     */
    getLastMsgPreview(conv) {
        if (conv.lastMessagePreview) return conv.lastMessagePreview;
        return conv.isGroup ? 'Group created' : 'Started a conversation';
    },


    /**
     * Sync the boundary between two consecutive message bubbles in the DOM.
     * Use this when prepending or appending messages to ensure correct grouping (border-radius, avatars).
     * 
     * @param {HTMLElement} msgAbove - The message element above
     * @param {HTMLElement} msgBelow - The message element below
     */
    syncMessageBoundary(msgAbove, msgBelow) {
        if (!msgAbove || !msgBelow || 
            !msgAbove.classList.contains('msg-bubble-wrapper') || 
            !msgBelow.classList.contains('msg-bubble-wrapper')) return;

        const senderAbove = msgAbove.dataset.senderId;
        const senderBelow = msgBelow.dataset.senderId;
        const timeAbove = new Date(msgAbove.dataset.sentAt);
        const timeBelow = new Date(msgBelow.dataset.sentAt);

        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = (senderAbove && senderAbove === senderBelow);
        const closeTime = (timeBelow - timeAbove < groupGap);

        if (sameSender && closeTime) {
            // --- Update Classes ---
            // Above: single -> first, last -> middle
            if (msgAbove.classList.contains('msg-group-single')) {
                msgAbove.classList.replace('msg-group-single', 'msg-group-first');
            } else if (msgAbove.classList.contains('msg-group-last')) {
                msgAbove.classList.replace('msg-group-last', 'msg-group-middle');
            }

            // Below: single -> last, first -> middle
            if (msgBelow.classList.contains('msg-group-single')) {
                msgBelow.classList.replace('msg-group-single', 'msg-group-last');
            } else if (msgBelow.classList.contains('msg-group-first')) {
                msgBelow.classList.replace('msg-group-first', 'msg-group-middle');
            }

            // --- Update UI (Avatar/Author) ---
            // If grouped, 'Above' message is NEVER 'last' or 'single', so it should NOT have avatar
            const avatarAbove = msgAbove.querySelector('.msg-avatar');
            if (avatarAbove && !avatarAbove.classList.contains('msg-avatar-spacer')) {
                avatarAbove.classList.add('msg-avatar-spacer');
                avatarAbove.innerHTML = '';
            }

            // If grouped, 'Below' message is NEVER 'first' or 'single', so it should NOT have author name (group chat)
            const authorBelow = msgBelow.querySelector('.msg-author');
            if (authorBelow) {
                authorBelow.remove();
            }
        }
    }
};

window.ChatCommon = ChatCommon;
