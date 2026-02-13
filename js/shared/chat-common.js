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

    getMessageType(msg) {
        if (!msg) return null;

        const rawType =
            msg.messageType ??
            msg.MessageType ??
            msg.message_type ??
            msg.Type ??
            null;

        if (rawType === null || rawType === undefined || rawType === '') {
            return null;
        }

        if (typeof rawType === 'number' && Number.isFinite(rawType)) {
            return rawType;
        }

        if (typeof rawType === 'string') {
            const normalized = rawType.trim().toLowerCase();
            if (!normalized.length) return null;

            const numericType = Number(normalized);
            if (Number.isFinite(numericType)) {
                return numericType;
            }

            if (normalized === 'text') return 1;
            if (normalized === 'media') return 2;
            if (normalized === 'system') return 3;
        }

        return rawType;
    },

    isSystemMessage(msg) {
        return this.getMessageType(msg) === 3;
    },

    isSystemMessageElement(el) {
        if (!el || !el.classList || !el.classList.contains('msg-bubble-wrapper')) {
            return false;
        }

        if (el.classList.contains('msg-system')) {
            return true;
        }

        const typeRaw = (el.dataset?.messageType || '').toString().toLowerCase();
        return typeRaw === 'system' || typeRaw === '3';
    },

    toMentionUsername(value) {
        const normalized = (value === null || value === undefined) ? '' : String(value).trim();
        if (!normalized.length) return '';
        return normalized.startsWith('@') ? normalized : `@${normalized}`;
    },

    getSystemMessageText(msg) {
        const systemDataRaw = msg?.systemMessageDataJson ?? msg?.SystemMessageDataJson ?? '';
        if (typeof systemDataRaw === 'string' && systemDataRaw.trim().length) {
            try {
                const parsed = JSON.parse(systemDataRaw);
                const actor = this.toMentionUsername(parsed?.actorUsername || parsed?.actorDisplayName || '');
                const target = this.toMentionUsername(parsed?.targetUsername || parsed?.targetDisplayName || '');
                const hasNicknameField = Object.prototype.hasOwnProperty.call(parsed || {}, 'nickname');
                const nickname = this.normalizeNickname(parsed?.nickname);

                if (actor && target && hasNicknameField) {
                    return nickname
                        ? `${actor} set nickname for ${target} to "${nickname}".`
                        : `${actor} removed nickname for ${target}.`;
                }
            } catch (_err) {
                // Keep silent fallback for malformed JSON payloads.
            }
        }

        const contentRaw = msg?.content ?? msg?.Content ?? '';
        if (typeof contentRaw === 'string' && contentRaw.trim().length) {
            const content = contentRaw.trim();

            const setNicknameMatch = content.match(/^@?([^\s@]+)\s+set nickname for\s+@?([^\s@]+)\s+to\s+"([\s\S]*)"\.$/i);
            if (setNicknameMatch) {
                const actor = this.toMentionUsername(setNicknameMatch[1]);
                const target = this.toMentionUsername(setNicknameMatch[2]);
                const nickname = setNicknameMatch[3];
                return `${actor} set nickname for ${target} to "${nickname}".`;
            }

            const removeNicknameMatch = content.match(/^@?([^\s@]+)\s+removed nickname for\s+@?([^\s@]+)\.$/i);
            if (removeNicknameMatch) {
                const actor = this.toMentionUsername(removeNicknameMatch[1]);
                const target = this.toMentionUsername(removeNicknameMatch[2]);
                return `${actor} removed nickname for ${target}.`;
            }

            return content;
        }

        return 'System message';
    },

    /**
     * Normalize a conversation member object to one consistent shape.
     * @param {Object} member
     * @param {Object} options
     * @param {boolean} options.fallbackUsernameToDisplayName - Use displayName as username only when nickname is empty.
     */
    normalizeConversationMember(member = {}, options = {}) {
        const { fallbackUsernameToDisplayName = false } = options;
        const normalized = member || {};
        const accountId = (normalized.accountId || normalized.AccountId || '').toString().toLowerCase();
        const displayName =
            normalized.displayName ||
            normalized.DisplayName ||
                normalized.fullName ||
                normalized.FullName ||
                '';
        const nickname = this.normalizeNickname(normalized.nickname ?? normalized.Nickname ?? null);
        const usernameRaw =
            normalized.username ||
            normalized.userName ||
            normalized.Username ||
            normalized.UserName ||
            '';
        const username =
            usernameRaw ||
            ((fallbackUsernameToDisplayName && displayName && !nickname) ? displayName : '');
        const avatarUrl = normalized.avatarUrl || normalized.AvatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;

        return {
            accountId,
            displayName,
            username,
            avatarUrl,
            nickname
        };
    },

    getNicknameMaxLength() {
        const configured = Number(window.APP_CONFIG?.MAX_CHAT_NICKNAME_LENGTH);
        if (!Number.isFinite(configured) || configured <= 0) {
            return 50;
        }
        return Math.floor(configured);
    },

    truncateDisplayText(text, maxLength = 50) {
        if (text === null || text === undefined) return '';
        const rawText = String(text);
        const configured = Number(maxLength);
        if (!Number.isFinite(configured) || configured <= 0 || rawText.length <= configured) {
            return rawText;
        }

        if (typeof truncateSmart === 'function') {
            return truncateSmart(rawText, Math.floor(configured));
        }
        if (typeof truncateText === 'function') {
            return truncateText(rawText, Math.floor(configured));
        }
        return rawText.substring(0, Math.floor(configured)) + '...';
    },

    normalizeNickname(value) {
        if (typeof value !== 'string') {
            return value ?? null;
        }
        const trimmed = value.trim();
        if (!trimmed.length) return null;

        const maxLength = this.getNicknameMaxLength();
        return trimmed.length > maxLength
            ? trimmed.substring(0, maxLength)
            : trimmed;
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

        // Content
        if ((m.content === undefined || m.content === null) && m.Content !== undefined) {
            m.content = m.Content;
        }
        
        // Medias
        if (!m.medias && m.Medias) m.medias = m.Medias;

        // Message type / system payload
        const messageType = this.getMessageType(m);
        if (messageType !== null && messageType !== undefined && messageType !== '') {
            m.messageType = messageType;
        }
        if (!m.systemMessageDataJson && m.SystemMessageDataJson) {
            m.systemMessageDataJson = m.SystemMessageDataJson;
        }
        
        // Sender/Ownership
        const senderId = (
            m.sender?.accountId ||
            m.sender?.AccountId ||
            m.Sender?.accountId ||
            m.Sender?.AccountId ||
            m.SenderId ||
            m.senderId ||
            ''
        ).toString().toLowerCase();
        if (myId && typeof m.isOwn !== 'boolean') {
            m.isOwn = (senderId === myId.toLowerCase());
        }
        
        // Ensure sender object exists with at least accountId
        if (!m.sender && m.Sender) {
            m.sender = {
                accountId: senderId,
                username: m.Sender.username || m.Sender.Username || '',
                fullName: m.Sender.fullName || m.Sender.FullName || '',
                nickname: this.normalizeNickname(m.Sender.nickname ?? m.Sender.Nickname ?? null),
                avatarUrl: m.Sender.avatarUrl || m.Sender.AvatarUrl || ''
            };
        } else if (!m.sender) {
            m.sender = { accountId: senderId };
        } else {
            if (!m.sender.accountId && m.sender.AccountId) {
                m.sender.accountId = m.sender.AccountId.toString().toLowerCase();
            } else if (m.sender.accountId) {
                m.sender.accountId = m.sender.accountId.toString().toLowerCase();
            } else if (senderId) {
                m.sender.accountId = senderId;
            }
        }

        if (!m.senderId && senderId) {
            m.senderId = senderId;
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
        if (this.isSystemMessage(msg)) {
            return 'single';
        }

        const msgId = msg.sender?.accountId;
        const prevId = prevMsg?.sender?.accountId;
        const nextId = nextMsg?.sender?.accountId;
        const prevIsSystem = this.isSystemMessage(prevMsg);
        const nextIsSystem = this.isSystemMessage(nextMsg);

        const sameSenderAsPrev = prevMsg && !prevIsSystem && prevId === msgId;
        const sameSenderAsNext = nextMsg && !nextIsSystem && nextId === msgId;

        // Also break grouping if time gap > configured threshold (default 2 mins)
        const gap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const diffPrev = prevMsg ? (new Date(msg.sentAt) - new Date(prevMsg.sentAt)) : Number.POSITIVE_INFINITY;
        const diffNext = nextMsg ? (new Date(nextMsg.sentAt) - new Date(msg.sentAt)) : Number.POSITIVE_INFINITY;
        const closeTimePrev = prevMsg && !prevIsSystem && Number.isFinite(diffPrev) && diffPrev >= 0 && diffPrev < gap;
        const closeTimeNext = nextMsg && !nextIsSystem && Number.isFinite(diffNext) && diffNext >= 0 && diffNext < gap;

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
        const messageType = this.getMessageType(msg);
        const isSystemMessage = this.isSystemMessage(msg);

        const dataMessageIdAttr = messageId ? ` data-message-id="${messageId}"` : '';
        const dataMessageTypeAttr = (messageType !== null && messageType !== undefined && messageType !== '')
            ? ` data-message-type="${String(messageType).replace(/"/g, '&quot;')}"`
            : '';

        if (isSystemMessage) {
            const senderId = msg.sender?.accountId || msg.senderId || '';
            const systemText = this.getSystemMessageText(msg);
            return `
                <div class="msg-bubble-wrapper msg-system msg-group-single"
                     data-sent-at="${msg.sentAt || ''}"
                     data-sender-id="${senderId}"
                     data-message-type="system"
                     ${dataMessageIdAttr}>
                    <div class="msg-system-text">${linkify(escapeHtml(systemText))}</div>
                </div>
            `;
        }

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
                 ${dataMessageTypeAttr}
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

    findPreviousMessageBubble(el) {
        let cursor = el?.previousElementSibling || null;
        while (cursor) {
            if (cursor.classList?.contains('msg-bubble-wrapper')) return cursor;
            cursor = cursor.previousElementSibling;
        }
        return null;
    },

    findNextMessageBubble(el) {
        let cursor = el?.nextElementSibling || null;
        while (cursor) {
            if (cursor.classList?.contains('msg-bubble-wrapper')) return cursor;
            cursor = cursor.nextElementSibling;
        }
        return null;
    },

    cleanTimeSeparators(container) {
        if (!container) return;

        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        const separators = Array.from(container.children).filter((child) =>
            child.classList?.contains('chat-time-separator')
        );
        if (!separators.length) return;

        const messageBubbles = Array.from(container.children).filter((child) =>
            child.classList?.contains('msg-bubble-wrapper')
        );
        if (!messageBubbles.length) {
            separators.forEach((sep) => sep.remove());
            return;
        }

        let keptLeadingSeparator = false;
        const keptBoundaryKeys = new Set();
        separators.forEach((sep) => {
            const prevMsg = this.findPreviousMessageBubble(sep);
            const nextMsg = this.findNextMessageBubble(sep);

            // Separator without any following message is always orphaned.
            if (!nextMsg) {
                sep.remove();
                return;
            }

            // Keep only one leading separator before first message.
            if (!prevMsg) {
                if (keptLeadingSeparator) {
                    sep.remove();
                } else {
                    keptLeadingSeparator = true;
                }
                return;
            }

            const prevTime = new Date(prevMsg.dataset.sentAt || 0);
            const nextTime = new Date(nextMsg.dataset.sentAt || 0);
            const prevValid = Number.isFinite(prevTime.getTime());
            const nextValid = Number.isFinite(nextTime.getTime());
            const shouldKeep = prevValid && nextValid && ((nextTime - prevTime) > gap);

            if (!shouldKeep) {
                sep.remove();
                return;
            }

            // Keep at most one separator per message boundary.
            const prevKey = prevMsg.dataset.messageId || prevMsg.dataset.sentAt || `prev-${prevTime.getTime()}`;
            const nextKey = nextMsg.dataset.messageId || nextMsg.dataset.sentAt || `next-${nextTime.getTime()}`;
            const boundaryKey = `${prevKey}|${nextKey}`;
            if (keptBoundaryKeys.has(boundaryKey)) {
                sep.remove();
                return;
            }
            keptBoundaryKeys.add(boundaryKey);
        });

        // Safety pass: never allow 2 adjacent separators after cleanup.
        let lastKeptSeparator = null;
        Array.from(container.children).forEach((child) => {
            if (!child.classList?.contains('chat-time-separator')) {
                if (child.classList?.contains('msg-bubble-wrapper')) {
                    lastKeptSeparator = null;
                }
                return;
            }

            if (lastKeptSeparator) {
                child.remove();
                return;
            }
            lastKeptSeparator = child;
        });
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
        if (this.isSystemMessageElement(msgAbove) || this.isSystemMessageElement(msgBelow)) return;

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
    },

    /**
     * Show a generic chat confirmation modal (Specific classes to avoid overlap)
     * @param {Object} options - { title, message, confirmText, cancelText, onConfirm, onCancel, isDanger }
     */
    showConfirm(options = {}) {
        const {
            title = 'Are you sure?',
            message = '',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            onConfirm = null,
            onCancel = null,
            isDanger = false
        } = options;

        const overlay = document.createElement("div");
        overlay.className = "chat-common-confirm-overlay";

        const popup = document.createElement("div");
        popup.className = "chat-common-confirm-popup";

        popup.innerHTML = `
            <div class="chat-common-confirm-content">
                <h3>${title}</h3>
                <p>${message}</p>
            </div>
            <div class="chat-common-confirm-actions">
                <button class="chat-common-confirm-btn chat-common-confirm-confirm ${isDanger ? 'danger' : ''}" id="genericConfirmBtn">${confirmText}</button>
                <button class="chat-common-confirm-btn chat-common-confirm-cancel" id="genericCancelBtn">${cancelText}</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (window.lockScroll) lockScroll();

        requestAnimationFrame(() => overlay.classList.add("show"));

        const close = () => {
            overlay.classList.remove("show");
            if (window.unlockScroll) unlockScroll();
            setTimeout(() => overlay.remove(), 200);
        };

        const confirmBtn = document.getElementById("genericConfirmBtn");
        const cancelBtn = document.getElementById("genericCancelBtn");

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                if (onConfirm) onConfirm();
                close();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                if (onCancel) onCancel();
                close();
            };
        }

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                if (onCancel) onCancel();
                close();
            }
        };
    },

    /**
     * Show a generic chat prompt modal (Specific classes to avoid overlap)
     * @param {Object} options - { title, message, placeholder, value, confirmText, cancelText, onConfirm, onCancel }
     */
    showPrompt(options = {}) {
        const {
            title = 'Input required',
            message = '',
            placeholder = '',
            value = '',
            confirmText = 'Save',
            cancelText = 'Cancel',
            onConfirm = null,
            onCancel = null,
            maxLength = null
        } = options;

        const resolvedMaxLength = Number(maxLength);
        const normalizedMaxLength = Number.isFinite(resolvedMaxLength) && resolvedMaxLength > 0
            ? Math.floor(resolvedMaxLength)
            : null;
        const normalizedValue = normalizedMaxLength
            ? String(value || '').substring(0, normalizedMaxLength)
            : String(value || '');
        const maxLengthAttr = normalizedMaxLength ? ` maxlength="${normalizedMaxLength}"` : '';

        const overlay = document.createElement("div");
        overlay.className = "chat-common-confirm-overlay";

        const popup = document.createElement("div");
        popup.className = "chat-common-confirm-popup";

        popup.innerHTML = `
            <div class="chat-common-confirm-content">
                <h3>${title}</h3>
                ${message ? `<p>${message}</p>` : ''}
                <div class="chat-common-confirm-input-wrapper">
                    <input type="text" id="genericPromptInput" class="chat-common-confirm-input" placeholder="${placeholder}" value="${normalizedValue.replace(/"/g, '&quot;')}" autocomplete="off"${maxLengthAttr}>
                </div>
            </div>
            <div class="chat-common-confirm-actions">
                <button class="chat-common-confirm-btn chat-common-confirm-confirm" id="genericConfirmBtn">${confirmText}</button>
                <button class="chat-common-confirm-btn chat-common-confirm-cancel" id="genericCancelBtn">${cancelText}</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (window.lockScroll) lockScroll();

        const input = document.getElementById("genericPromptInput");
        requestAnimationFrame(() => {
            overlay.classList.add("show");
            if (input) {
                input.focus();
                input.select();
            }
        });

        const close = () => {
            overlay.classList.remove("show");
            if (window.unlockScroll) unlockScroll();
            setTimeout(() => overlay.remove(), 200);
        };

        const handleConfirm = () => {
            if (onConfirm) onConfirm(input.value);
            close();
        };

        const confirmBtn = document.getElementById("genericConfirmBtn");
        const cancelBtn = document.getElementById("genericCancelBtn");

        if (confirmBtn) confirmBtn.onclick = handleConfirm;
        
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    close();
                }
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                if (onCancel) onCancel();
                close();
            };
        }

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                if (onCancel) onCancel();
                close();
            }
        };
    },

    /**
     * Show a modal to manage nicknames of all members in a conversation.
     * @param {Object} options - { title, members, conversationId, onNicknameUpdated }
     */
    showNicknamesModal(options = {}) {
        const {
            title = 'Nicknames',
            members = [],
            conversationId = '',
            onNicknameUpdated = null
        } = options;

        const normalizedMembers = (members || []).map(m =>
            this.normalizeConversationMember(m, { fallbackUsernameToDisplayName: true })
        );
        const nicknameMaxLength = this.getNicknameMaxLength();

        if (!conversationId || !normalizedMembers.length) return;

        const overlay = document.createElement("div");
        overlay.className = "chat-common-confirm-overlay chat-nicknames-overlay";

        const popup = document.createElement("div");
        popup.className = "chat-common-confirm-popup chat-nicknames-popup";

        // Layout
        popup.innerHTML = `
            <div class="chat-nicknames-header">
                <h3>${title}</h3>
                <div class="chat-nicknames-close" id="nicknamesCloseBtn">
                    <i data-lucide="x"></i>
                </div>
            </div>
            <div class="chat-nicknames-list" id="nicknamesList">
                <!-- List items will be rendered here -->
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (window.lockScroll) lockScroll();
        if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: popup });

        requestAnimationFrame(() => overlay.classList.add("show"));

        const close = () => {
            overlay.classList.remove("show");
            if (window.unlockScroll) unlockScroll();
            setTimeout(() => overlay.remove(), 200);
        };

        const findMemberById = (accountId) => {
            const normalizedAccountId = (accountId || '').toString().toLowerCase();
            return normalizedMembers.find(m => m.accountId === normalizedAccountId) || null;
        };

        const renderNicknameItem = (member) => {
            const usernameRawLabel = member.username || 'unknown';
            const usernameLabel = ChatCommon.truncateDisplayText(
                usernameRawLabel,
                window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25
            );
            const nicknameRawLabel = member.nickname || 'Set nickname';
            const nicknameLabel = member.nickname
                ? ChatCommon.truncateDisplayText(member.nickname, nicknameMaxLength)
                : nicknameRawLabel;
            const nicknameEmptyClass = member.nickname ? '' : 'empty';
            const avatarUrl = member.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;

            return `
                <div class="chat-nickname-item" data-account-id="${member.accountId}">
                    <img src="${avatarUrl}" class="chat-nickname-avatar" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                    <div class="chat-nickname-info">
                        <div class="chat-nickname-name" title="@${escapeHtml(usernameRawLabel)}">@${escapeHtml(usernameLabel)}</div>
                        <div class="chat-nickname-label ${nicknameEmptyClass}" title="${escapeHtml(nicknameRawLabel)}">${escapeHtml(nicknameLabel)}</div>
                    </div>
                    <div class="chat-nickname-edit-btn" onclick="ChatCommon._toggleNicknameEdit('${member.accountId}')">
                        <i data-lucide="pencil"></i>
                    </div>
                </div>
            `;
        };

        const updateNicknameInfoArea = (infoArea, member) => {
            if (!infoArea) return;
            const nameEl = infoArea.querySelector('.chat-nickname-name');
            const labelEl = infoArea.querySelector('.chat-nickname-label');
            const usernameRawLabel = member.username || 'unknown';
            const usernameLabel = ChatCommon.truncateDisplayText(
                usernameRawLabel,
                window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25
            );
            if (nameEl) {
                nameEl.textContent = `@${usernameLabel}`;
                nameEl.title = `@${usernameRawLabel}`;
            }
            if (labelEl) {
                const nicknameRawLabel = member.nickname || 'Set nickname';
                const nicknameLabel = member.nickname
                    ? ChatCommon.truncateDisplayText(member.nickname, nicknameMaxLength)
                    : nicknameRawLabel;
                labelEl.textContent = nicknameLabel;
                labelEl.title = nicknameRawLabel;
                labelEl.classList.toggle('empty', !member.nickname);
            }
        };

        const renderList = () => {
            const list = document.getElementById('nicknamesList');
            if (!list) return;

            list.innerHTML = normalizedMembers.map(renderNicknameItem).join('');

            if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: list });
        };

        // Internal helper to handle the toggle
        ChatCommon._toggleNicknameEdit = (accountId) => {
            const normalizedAccountId = (accountId || '').toString().toLowerCase();
            const item = document.querySelector(`.chat-nickname-item[data-account-id="${normalizedAccountId}"]`);
            if (!item || item.classList.contains('is-editing')) return;

            const member = findMemberById(normalizedAccountId);
            if (!member) return;

            const infoArea = item.querySelector('.chat-nickname-info');
            const editBtn = item.querySelector('.chat-nickname-edit-btn');
            const currentNickname = ChatCommon.normalizeNickname(member.nickname);
            const currentNicknameValue = currentNickname || '';

            item.classList.add('is-editing');

            // Replace info area with input
            infoArea.style.display = 'none';
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'chat-nickname-input-wrapper';
            inputWrapper.innerHTML = `<input type="text" class="chat-nickname-input" value="${escapeHtml(currentNicknameValue)}" placeholder="Set nickname..." maxlength="${nicknameMaxLength}">`;
            item.insertBefore(inputWrapper, editBtn);

            const input = inputWrapper.querySelector('input');
            input.focus();
            input.select();

            // Replace pencil with checkmark
            editBtn.innerHTML = '<i data-lucide="check"></i>';
            editBtn.classList.add('chat-nickname-save-btn');
            if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: editBtn });

            const handleSave = async () => {
                const nicknameToSave = ChatCommon.normalizeNickname(input.value);

                if (nicknameToSave === currentNickname) {
                    cancelEdit();
                    return;
                }

                // Call API
                try {
                    const payload = { accountId: normalizedAccountId, nickname: nicknameToSave };
                    const res = await window.API.Conversations.updateNickname(conversationId, payload);
                    
                    if (res.ok) {
                        member.nickname = nicknameToSave;
                        if (onNicknameUpdated) onNicknameUpdated(normalizedAccountId, nicknameToSave);
                        cancelEdit({ applyUpdatedData: true });
                    } else {
                        if (window.toastError) window.toastError('Failed to update nickname');
                        cancelEdit();
                    }
                } catch (err) {
                    console.error('Nickname update error:', err);
                    if (window.toastError) window.toastError('Failed to update nickname');
                    cancelEdit();
                }
            };

            const cancelEdit = ({ applyUpdatedData = false } = {}) => {
                inputWrapper.remove();
                infoArea.style.display = '';
                if (applyUpdatedData) {
                    updateNicknameInfoArea(infoArea, member);
                }
                editBtn.innerHTML = '<i data-lucide="pencil"></i>';
                editBtn.classList.remove('chat-nickname-save-btn');
                item.classList.remove('is-editing');
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    ChatCommon._toggleNicknameEdit(normalizedAccountId);
                };
                if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: editBtn });
            };

            editBtn.onclick = (e) => {
                e.stopPropagation();
                handleSave();
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') cancelEdit();
            };
        };

        const closeBtn = document.getElementById('nicknamesCloseBtn');
        if (closeBtn) closeBtn.onclick = close;

        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };

        renderList();
    }
};

window.ChatCommon = ChatCommon;
