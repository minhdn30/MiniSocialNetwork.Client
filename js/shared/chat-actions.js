/**
 * Chat Actions Handler
 * Handles message-specific actions like React, Reply, Recall, Hide, etc.
 */
const ChatActions = {
    currentMenu: null,
    currentConfirm: null,
    currentPinnedModal: null,
    currentReactorsModal: null,
    _isThemeSyncBound: false,
    _onThemeChanged: null,
    _reactOptions: [
        { type: 0, key: 'like', label: 'Like', emoji: '👍' },
        { type: 1, key: 'love', label: 'Love', emoji: '❤️' },
        { type: 2, key: 'haha', label: 'Haha', emoji: '😆' },
        { type: 3, key: 'wow', label: 'Wow', emoji: '😮' },
        { type: 4, key: 'sad', label: 'Sad', emoji: '😢' },
        { type: 5, key: 'angry', label: 'Angry', emoji: '😡' }
    ],
    _reactInFlight: new Set(),
    _hiddenMessageIds: new Set(),

    /**
     * Find previous/next real message bubble (skip separators, typing indicator, etc.).
     */
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

    parseReactType(value) {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    },

    getReactionThemeVars() {
        return [
            '--chat-theme-surface',
            '--chat-theme-border',
            '--chat-theme-action-color',
            '--chat-theme-action-hover-bg',
            '--chat-theme-tooltip-bg',
            '--chat-theme-tooltip-border',
            '--chat-theme-tooltip-text',
            '--chat-theme-system-text'
        ];
    },

    getThemeTargetFromElement(element) {
        if (element?.closest) {
            const scopedTarget = element.closest('.chat-box, .chat-view, .chat-panel-container');
            if (scopedTarget) return scopedTarget;
        }

        return document.querySelector('.chat-box, .chat-view, .chat-panel-container');
    },

    getThemeTargetByMessageId(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return null;

        const bubble = document.querySelector(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        return this.getThemeTargetFromElement(bubble);
    },

    getThemeTargetByConversationId(conversationId) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        if (normalizedConversationId) {
            const chatBox = document.getElementById(`chat-box-${normalizedConversationId}`)
                || document.querySelector(`.chat-box[data-id="${normalizedConversationId}"]`);
            if (chatBox) return this.getThemeTargetFromElement(chatBox);

            const messageList = document.getElementById(`chat-messages-${normalizedConversationId}`);
            if (messageList) return this.getThemeTargetFromElement(messageList);

            const pageConversationId = (window.ChatPage?.currentChatId || '').toString().toLowerCase();
            if (pageConversationId && pageConversationId === normalizedConversationId) {
                const pageMessages = document.getElementById('chat-view-messages');
                if (pageMessages) return this.getThemeTargetFromElement(pageMessages);
                const pageView = document.getElementById('chat-view') || document.querySelector('.chat-view');
                if (pageView) return this.getThemeTargetFromElement(pageView);
            }
        }

        const fallback = document.getElementById('chat-view-messages')
            || document.querySelector('.chat-box, .chat-view, .chat-panel-container');
        return this.getThemeTargetFromElement(fallback);
    },

    applyFloatingThemeVars(targetElement, themeTarget, vars = null) {
        if (!targetElement) return null;

        const resolvedThemeTarget = themeTarget
            || targetElement.__chatThemeSource
            || this.getThemeTargetByConversationId(targetElement.dataset?.conversationId)
            || this.getThemeTargetByMessageId(targetElement.dataset?.messageId)
            || this.getThemeTargetFromElement(targetElement);
        if (!resolvedThemeTarget) return null;

        const varNames = Array.isArray(vars) && vars.length > 0
            ? vars
            : this.getReactionThemeVars();
        const computed = getComputedStyle(resolvedThemeTarget);
        varNames.forEach((varName) => {
            const value = computed.getPropertyValue(varName);
            if (value && value.trim()) {
                targetElement.style.setProperty(varName, value.trim());
            } else {
                targetElement.style.removeProperty(varName);
            }
        });

        [...targetElement.classList]
            .filter((className) => className.startsWith('chat-theme-'))
            .forEach((className) => targetElement.classList.remove(className));
        const themeClass = [...resolvedThemeTarget.classList].find((className) => className.startsWith('chat-theme-'));
        if (themeClass) targetElement.classList.add(themeClass);

        targetElement.__chatThemeSource = resolvedThemeTarget;
        return resolvedThemeTarget;
    },

    syncReactionThemeStyles() {
        const currentMenu = this.currentMenu;
        if (currentMenu?.classList?.contains('msg-react-menu') || currentMenu?.classList?.contains('chat-pinned-more-menu')) {
            const messageId = currentMenu.dataset?.messageId;
            const conversationId = currentMenu.dataset?.conversationId;
            let themeTarget = null;
            if (messageId) themeTarget = this.getThemeTargetByMessageId(messageId);
            else if (conversationId) themeTarget = this.getThemeTargetByConversationId(conversationId);
            
            this.applyFloatingThemeVars(currentMenu, themeTarget, this.getReactionThemeVars());
        }

        const reactorsOverlay = this.currentReactorsModal;
        if (reactorsOverlay?.classList?.contains('msg-reactors-overlay')) {
            const themeTarget = this.getThemeTargetByMessageId(reactorsOverlay.dataset?.messageId);
            this.applyFloatingThemeVars(reactorsOverlay, themeTarget, this.getReactionThemeVars());
        }

        const pinnedOverlay = this.currentPinnedModal;
        if (pinnedOverlay?.classList?.contains('chat-pinned-overlay')) {
            const themeTarget = this.getThemeTargetByConversationId(pinnedOverlay.dataset?.conversationId);
            this.applyFloatingThemeVars(pinnedOverlay, themeTarget, this.getReactionThemeVars());
        }
    },

    ensureThemeSyncListener() {
        if (this._isThemeSyncBound) return;

        this._onThemeChanged = () => {
            this.syncReactionThemeStyles();
            requestAnimationFrame(() => this.syncReactionThemeStyles());
        };

        const themeEventName = window.themeManager?.EVENT || 'app:theme-changed';
        window.addEventListener(themeEventName, this._onThemeChanged);
        if (themeEventName !== 'app:theme-changed') {
            window.addEventListener('app:theme-changed', this._onThemeChanged);
        }

        this._isThemeSyncBound = true;
    },

    normalizeReactState(payload, fallbackMessageId = '') {
        const reactType = this.parseReactType(
            payload?.currentUserReactType
            ?? payload?.CurrentUserReactType
            ?? payload?.reactType
            ?? payload?.ReactType
        );
        const rawIsReacted = payload?.isReacted ?? payload?.IsReacted;
        const reacts = window.ChatCommon?.normalizeMessageReactSummaries
            ? window.ChatCommon.normalizeMessageReactSummaries(payload?.reacts || payload?.Reacts)
            : [];
        const reactedBy = window.ChatCommon?.normalizeMessageReactedBy
            ? window.ChatCommon.normalizeMessageReactedBy(payload?.reactedBy || payload?.ReactedBy)
            : [];

        const reactionData = window.ChatCommon?.getMessageReactionData
            ? window.ChatCommon.getMessageReactionData({ reacts, reactedBy })
            : {
                reacts,
                reactedBy,
                totalReacts: reacts.reduce((sum, item) => sum + Number(item?.count || 0), 0)
            };

        let currentUserReactType = reactType;
        if (currentUserReactType === null && Array.isArray(reactionData.reactedBy)) {
            const myId = this.getCurrentAccountId();
            if (myId) {
                const currentUserReact = reactionData.reactedBy.find(
                    (item) => (item?.accountId || '').toString().toLowerCase() === myId
                );
                currentUserReactType = this.parseReactType(currentUserReact?.reactType);
            }
        }

        const isReacted = typeof rawIsReacted === 'boolean'
            ? rawIsReacted
            : currentUserReactType !== null;

        return {
            messageId: (payload?.messageId || payload?.MessageId || fallbackMessageId || '').toString().toLowerCase(),
            isReacted,
            currentUserReactType: isReacted ? currentUserReactType : null,
            reacts: reactionData.reacts || [],
            reactedBy: reactionData.reactedBy || [],
            totalReacts: Number(reactionData.totalReacts || 0)
        };
    },

    updateMessageReactStateUI(messageId, state) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return;

        const reactType = this.parseReactType(state?.currentUserReactType);
        const isReacted = !!state?.isReacted && reactType !== null;
        const reactValue = isReacted ? String(reactType) : '';
        const reacts = Array.isArray(state?.reacts) ? state.reacts : [];
        const reactedBy = Array.isArray(state?.reactedBy) ? state.reactedBy : [];
        const totalReacts = Number.isFinite(Number(state?.totalReacts))
            ? Number(state.totalReacts)
            : (window.ChatCommon?.getMessageReactionData
                ? Number(window.ChatCommon.getMessageReactionData({ reacts, reactedBy }).totalReacts || 0)
                : 0);

        const bubbles = document.querySelectorAll(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        bubbles.forEach((bubble) => {
            bubble.dataset.currentReactType = reactValue;
            const reactBtn = bubble.querySelector('.msg-action-btn.react[data-action="react"]');
            if (reactBtn) {
                reactBtn.dataset.reactType = reactValue;
                reactBtn.classList.toggle('is-reacted', isReacted);
            }

            if (window.ChatCommon?.applyMessageReactionStateToBubble) {
                window.ChatCommon.applyMessageReactionStateToBubble(bubble, {
                    messageId: normalizedMessageId,
                    currentUserReactType: isReacted ? reactType : null,
                    reacts,
                    reactedBy,
                    totalReacts
                });
            }
        });
    },

    markReactMenuActiveOption(menuEl, reactType) {
        if (!menuEl) return;
        const normalizedType = this.parseReactType(reactType);
        menuEl.querySelectorAll('.msg-react-option').forEach((btn) => {
            const optionType = this.parseReactType(btn.dataset.reactType);
            btn.classList.toggle('active', normalizedType !== null && optionType === normalizedType);
        });
    },

    async getMessageReactState(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId || !window.API?.Messages?.getReact) return null;

        const res = await window.API.Messages.getReact(normalizedMessageId);
        if (!res?.ok) {
            const errorData = await res.json().catch(() => null);
            throw new Error(errorData?.message || errorData?.Message || 'Failed to get message reaction.');
        }

        const payload = await res.json().catch(() => ({}));
        const state = this.normalizeReactState(payload, normalizedMessageId);
        this.updateMessageReactStateUI(normalizedMessageId, state);
        return state;
    },

    async setMessageReact(messageId, reactType) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        const normalizedType = this.parseReactType(reactType);
        if (!normalizedMessageId || normalizedType === null || !window.API?.Messages?.setReact) return null;

        const res = await window.API.Messages.setReact(normalizedMessageId, normalizedType);
        if (!res?.ok) {
            const errorData = await res.json().catch(() => null);
            throw new Error(errorData?.message || errorData?.Message || 'Failed to react message.');
        }

        const payload = await res.json().catch(() => ({}));
        const state = this.normalizeReactState(payload, normalizedMessageId);
        this.updateMessageReactStateUI(normalizedMessageId, state);
        return state;
    },

    async removeMessageReact(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId || !window.API?.Messages?.removeReact) return null;

        const res = await window.API.Messages.removeReact(normalizedMessageId);
        if (!res?.ok) {
            const errorData = await res.json().catch(() => null);
            throw new Error(errorData?.message || errorData?.Message || 'Failed to remove reaction.');
        }

        const payload = await res.json().catch(() => ({}));
        const state = this.normalizeReactState(payload, normalizedMessageId);
        this.updateMessageReactStateUI(normalizedMessageId, state);
        return state;
    },

    openReactMenu(e, messageId) {
        e.stopPropagation();
        this.closeAllMenus();

        const btn = e.currentTarget;
        const wrapper = btn?.closest('.msg-bubble-wrapper');
        const resolvedMessageId = (messageId || wrapper?.dataset?.messageId || '').toString().toLowerCase();
        if (!resolvedMessageId) return;

        const isRecalled = (wrapper?.dataset?.isRecalled || '').toString().toLowerCase() === 'true';
        if (isRecalled) return;

        if (wrapper) wrapper.classList.add('menu-active');
        btn.classList.add('active');

        const menu = document.createElement('div');
        menu.className = 'msg-react-menu';
        menu.innerHTML = this._reactOptions.map((option) => `
            <button type="button" class="msg-react-option" data-react-type="${option.type}" title="${option.label}">
                <span class="msg-react-emoji" aria-hidden="true">${option.emoji}</span>
            </button>
        `).join('');

        const themeTarget = this.getThemeTargetFromElement(btn);
        menu.dataset.messageId = resolvedMessageId;
        this.applyFloatingThemeVars(menu, themeTarget, this.getReactionThemeVars());
        this.ensureThemeSyncListener();

        document.body.appendChild(menu);

        const currentTypeFromDom = this.parseReactType(
            wrapper?.dataset?.currentReactType ?? btn?.dataset?.reactType
        );
        this.markReactMenuActiveOption(menu, currentTypeFromDom);

        const rect = btn.getBoundingClientRect();
        const menuWidth = menu.offsetWidth || 246;
        const menuHeight = menu.offsetHeight || 56;

        let top = rect.top - menuHeight - 8;
        if (top < 10) {
            top = rect.bottom + 8;
        }

        let left = rect.left + (rect.width / 2) - (menuWidth / 2);
        if (left < 8) left = 8;
        if (left + menuWidth > window.innerWidth - 8) {
            left = window.innerWidth - menuWidth - 8;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.addEventListener('click', (evt) => evt.stopPropagation());

        menu.querySelectorAll('.msg-react-option').forEach((optionBtn) => {
            optionBtn.onclick = async (evt) => {
                evt.stopPropagation();

                const selectedType = this.parseReactType(optionBtn.dataset.reactType);
                if (selectedType === null) return;
                if (this._reactInFlight.has(resolvedMessageId)) return;

                this._reactInFlight.add(resolvedMessageId);
                menu.classList.add('is-loading');

                try {
                    const nextState = await this.setMessageReact(resolvedMessageId, selectedType);
                    this.markReactMenuActiveOption(menu, nextState?.currentUserReactType ?? null);
                } catch (err) {
                    console.error('Failed to react message:', err);
                    if (window.toastError) {
                        window.toastError(err?.message || 'Failed to react message.');
                    }
                } finally {
                    this._reactInFlight.delete(resolvedMessageId);
                    menu.classList.remove('is-loading');
                    this.closeAllMenus();
                }
            };
        });

        // Sync latest react state from API for accurate highlight.
        this.getMessageReactState(resolvedMessageId)
            .then((state) => {
                if (this.currentMenu !== menu) return;
                this.markReactMenuActiveOption(menu, state?.currentUserReactType ?? null);
            })
            .catch(() => {
                // Keep optimistic DOM state if API call fails.
            });

        this.currentMenu = menu;

        setTimeout(() => {
            window.addEventListener('click', this.handleOutsideClick);
        }, 10);
    },

    getReactOption(reactType) {
        const normalizedType = this.parseReactType(reactType);
        if (normalizedType === null) return null;
        return this._reactOptions.find((option) => option.type === normalizedType) || null;
    },

    getReactLabel(reactType) {
        const option = this.getReactOption(reactType);
        return option?.label || 'React';
    },

    getReactEmoji(reactType) {
        if (window.ChatCommon?.getReactEmoji) {
            return window.ChatCommon.getReactEmoji(reactType);
        }
        const option = this.getReactOption(reactType);
        return option?.emoji || '👍';
    },

    closeReactorsModal() {
        const overlay = this.currentReactorsModal;
        if (!overlay) return;

        overlay.classList.remove('show');
        if (window.unlockScroll) unlockScroll();
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (this.currentReactorsModal === overlay) this.currentReactorsModal = null;
        }, 180);
    },

    async openReactorsModal(messageId, event = null, prefetchedState = null) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return;

        let state = prefetchedState;
        if (!state) {
            try {
                state = await this.getMessageReactState(normalizedMessageId);
            } catch (err) {
                console.error('Failed to load message reactions:', err);
                if (window.toastError) window.toastError('Failed to load reactions.');
                return;
            }
        }

        const reactedBy = Array.isArray(state?.reactedBy) ? state.reactedBy : [];
        if (!reactedBy.length) return;

        this.closeReactorsModal();

        const overlay = document.createElement('div');
        overlay.className = 'msg-reactors-overlay';
        overlay.dataset.messageId = normalizedMessageId;

        const popup = document.createElement('div');
        popup.className = 'msg-reactors-modal';
        popup.innerHTML = `
            <div class="msg-reactors-header">
                <h3>Reactions</h3>
                <button type="button" class="msg-reactors-close" aria-label="Close">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="msg-reactors-list">
                ${reactedBy.map((item) => {
                    const displayName = window.ChatCommon?.getMessageReactionDisplayName
                        ? window.ChatCommon.getMessageReactionDisplayName(item)
                        : (item?.nickname || item?.username || item?.fullName || 'Unknown');
                    const username = (item?.username || '').toString();
                    const avatarUrl = item?.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR || '';
                    const reactType = this.parseReactType(item?.reactType);
                    const reactEmoji = this.getReactEmoji(reactType);
                    const reactLabel = this.getReactLabel(reactType);

                    const safeDisplay = this.escapeHtml(displayName);
                    const safeUsername = this.escapeHtml(username);
                    const safeAvatar = this.escapeHtml(avatarUrl);
                    const safeReactLabel = this.escapeHtml(reactLabel);

                    return `
                        <div class="msg-reactors-item">
                            <img class="msg-reactors-avatar" src="${safeAvatar}" alt="" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                            <div class="msg-reactors-meta">
                                <div class="msg-reactors-name">${safeDisplay}</div>
                                ${username ? `<div class="msg-reactors-username">@${safeUsername}</div>` : ''}
                            </div>
                            <div class="msg-reactors-type" title="${safeReactLabel}">
                                <span class="msg-reactors-type-emoji">${reactEmoji}</span>
                                <span class="msg-reactors-type-label">${safeReactLabel}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        this.currentReactorsModal = overlay;

        if (window.lockScroll) lockScroll();
        if (window.lucide) lucide.createIcons({ container: popup });

        const closeBtn = popup.querySelector('.msg-reactors-close');
        if (closeBtn) closeBtn.onclick = () => this.closeReactorsModal();
        overlay.onclick = (evt) => {
            if (evt.target === overlay) {
                this.closeReactorsModal();
            }
        };

        requestAnimationFrame(() => overlay.classList.add('show'));
    },

    async reactFromRealtime(data) {
        const messageId = (data?.messageId || data?.MessageId || '').toString().toLowerCase();
        if (!messageId) return;
        if (!document.querySelector(`.msg-bubble-wrapper[data-message-id="${messageId}"]`)) return;

        try {
            const state = await this.getMessageReactState(messageId);
            const modalMessageId = (this.currentReactorsModal?.dataset?.messageId || '').toString().toLowerCase();
            if (modalMessageId && modalMessageId === messageId) {
                await this.openReactorsModal(messageId, null, state);
            }
        } catch (err) {
            console.error('Failed to refresh message reaction from realtime:', err);
        }
    },

    /**
     * Placeholder for Reply Logic
     */
    replyTo(messageId) {
        if (!messageId) return;
        const bubble = document.querySelector(`.msg-bubble-wrapper[data-message-id="${messageId}"]`);
        if (!bubble) return;

        // Extract sender info from the DOM bubble
        const isOwn = bubble.classList.contains('sent');
        const senderId = (bubble.dataset.senderId || '').toLowerCase();

        // Resolve sender display name: prioritize nickname from metaData (authoritative)
        let senderName = '';

        // 1. MetaData lookup (has nickname info)
        if (senderId) {
            const meta = window.ChatPage?.currentMetaData || null;
            if (meta) {
                if (!meta.isGroup && meta.otherMember) {
                    const otherId = (meta.otherMember.accountId || '').toLowerCase();
                    if (senderId === otherId) {
                        senderName = meta.otherMember.nickname || meta.otherMember.username || meta.otherMember.fullName || '';
                    }
                }
                if (!senderName && Array.isArray(meta.members)) {
                    const member = meta.members.find(m => (m.accountId || '').toLowerCase() === senderId);
                    if (member) {
                        senderName = member.nickname || member.username || member.displayName || '';
                    }
                }
            }
            // Also try ChatWindow
            if (!senderName && window.ChatWindow) {
                for (const [, chat] of window.ChatWindow.openChats || []) {
                    const chatMeta = chat.data;
                    if (!chatMeta) continue;
                    if (chatMeta.otherMember && (chatMeta.otherMember.accountId || '').toLowerCase() === senderId) {
                        senderName = chatMeta.otherMember.nickname || chatMeta.otherMember.username || chatMeta.otherMember.fullName || '';
                        break;
                    }
                }
            }
        }

        // 2. Fallback to DOM attributes
        if (!senderName) {
            senderName = bubble.dataset.senderName
                || bubble.dataset.authorName
                || bubble.querySelector('.msg-author')?.textContent
                || '';
        }

        const displayName = isOwn ? 'yourself' : (senderName || 'User');
        const isRecalled = bubble.dataset.isRecalled === 'true';
        let contentPreview = '';
        if (isRecalled) {
            contentPreview = 'Message was recalled';
        } else {
            const bubbleText = bubble.querySelector('.msg-bubble')?.textContent?.trim() || '';
            if (bubbleText) {
                contentPreview = bubbleText.length > 60 ? bubbleText.substring(0, 60) + '\u2026' : bubbleText;
            } else if (bubble.querySelector('.msg-media-grid') || bubble.querySelector('.msg-file-list')) {
                contentPreview = 'Media';
            }
        }


        // Dispatch event for chat-page or chat-window to handle
        document.dispatchEvent(new CustomEvent('chat:reply', {
            detail: {
                messageId,
                senderName: displayName,
                contentPreview,
                isRecalled,
                senderId,
                isOwnReplyAuthor: isOwn
            }
        }));
    },

    isGuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((value || '').toString());
    },

    normalizeBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return !!value;
    },

    escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    getCurrentAccountId() {
        return (
            localStorage.getItem('accountId') ||
            sessionStorage.getItem('accountId') ||
            window.APP_CONFIG?.CURRENT_USER_ID ||
            ''
        ).toString().toLowerCase();
    },

    getHiddenMessageText() {
        return window.APP_CONFIG?.CHAT_HIDDEN_MESSAGE_TEXT || 'Message hidden';
    },

    getRecalledMessageText() {
        return window.APP_CONFIG?.CHAT_RECALLED_MESSAGE_TEXT || 'Message was recalled';
    },

    markMessageHiddenForCurrentUser(messageId, hidden = true) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return;
        if (hidden) this._hiddenMessageIds.add(normalizedMessageId);
        else this._hiddenMessageIds.delete(normalizedMessageId);
    },

    isMessageHiddenForCurrentUser(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return false;
        return this._hiddenMessageIds.has(normalizedMessageId);
    },

    updateReplyBarsForParentState(messageId, state = {}) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return;

        const isHidden = !!state.hidden;
        const isRecalled = !!state.recalled;
        const previewText = isHidden
            ? this.getHiddenMessageText()
            : (isRecalled ? this.getRecalledMessageText() : '');
        if (!previewText) return;

        if (
            window.ChatPage
            && (window.ChatPage._replyToMessageId || '').toString().toLowerCase() === normalizedMessageId
        ) {
            window.ChatPage._replyContentPreview = previewText;
            const pagePreviewEl = document
                .querySelector('.chat-view-input-container .chat-reply-bar .chat-reply-bar-preview');
            if (pagePreviewEl) pagePreviewEl.textContent = previewText;
        }

        if (window.ChatWindow?.openChats) {
            for (const [chatId, chat] of window.ChatWindow.openChats.entries()) {
                if ((chat?._replyToMessageId || '').toString().toLowerCase() !== normalizedMessageId) continue;
                chat._replyContentPreview = previewText;
                const inputArea = document.getElementById(`chat-input-area-${chatId}`);
                const previewEl = inputArea?.querySelector('.chat-reply-bar .chat-reply-bar-preview');
                if (previewEl) previewEl.textContent = previewText;
            }
        }
    },

    updateReplyPreviewStateForParent(messageId, state = {}) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return 0;

        const isHidden = !!state.hidden;
        const isRecalled = !!state.recalled;
        const previewText = isHidden
            ? this.getHiddenMessageText()
            : (isRecalled ? this.getRecalledMessageText() : '');
        if (!previewText) return 0;

        const previews = document.querySelectorAll(`.msg-reply-preview[data-reply-id="${normalizedMessageId}"]`);
        if (!previews.length) {
            this.updateReplyBarsForParentState(normalizedMessageId, state);
            return 0;
        }

        previews.forEach((previewEl) => {
            if (!previewEl) return;
            const wasHidden = (previewEl.dataset.replyParentHidden || '').toLowerCase() === 'true';
            if (!isHidden && wasHidden) return; // Hidden state has priority for current user.

            previewEl.dataset.replyParentHidden = isHidden ? 'true' : (wasHidden ? 'true' : 'false');
            previewEl.dataset.replyParentRecalled = isRecalled ? 'true' : 'false';

            const textEl = previewEl.querySelector('.msg-reply-text');
            if (textEl) {
                textEl.innerHTML = `<em>${this.escapeHtml(previewText)}</em>`;
            }
        });

        this.updateReplyBarsForParentState(normalizedMessageId, state);
        return previews.length;
    },

    resolveConversationId(wrapper) {
        const fromWrapper = (wrapper?.dataset?.conversationId || '').toString().toLowerCase();
        if (this.isGuid(fromWrapper)) return fromWrapper;

        const box = wrapper?.closest?.('.chat-box');
        const fromBoxData = (box?.dataset?.id || '').toString().toLowerCase();
        if (this.isGuid(fromBoxData)) return fromBoxData;

        const fromBoxId = (box?.id || '').toString().toLowerCase();
        if (fromBoxId.startsWith('chat-box-')) {
            const extracted = fromBoxId.substring('chat-box-'.length);
            if (this.isGuid(extracted)) return extracted;
        }

        const list = wrapper?.closest?.('.chat-messages');
        const listId = (list?.id || '').toString().toLowerCase();
        if (listId.startsWith('chat-messages-')) {
            const extracted = listId.substring('chat-messages-'.length);
            if (this.isGuid(extracted)) return extracted;
        }

        const pageId = (window.ChatPage?.currentChatId || '').toString().toLowerCase();
        if (this.isGuid(pageId)) return pageId;

        return '';
    },

    resolveConversationIdByMessageId(messageId) {
        const normId = (messageId || '').toString().toLowerCase();
        if (!normId) return '';

        const bubble =
            document.querySelector(`.msg-bubble-wrapper[data-message-id="${normId}"]`) ||
            document.querySelector(`[data-message-id="${normId}"]`);
        if (!bubble) return '';

        return this.resolveConversationId(bubble);
    },

    extractSidebarMessageFromBubble(bubble) {
        if (!bubble || !bubble.classList?.contains('msg-bubble-wrapper')) return null;
        const isSystemMessage = window.ChatCommon?.isSystemMessageElement?.(bubble);

        const messageId = (bubble.dataset?.messageId || '').toString().toLowerCase();
        const senderId = (bubble.dataset?.senderId || '').toString().toLowerCase();
        const sentAt = bubble.dataset?.sentAt || new Date().toISOString();
        const isRecalled = (bubble.dataset?.isRecalled || '').toString().toLowerCase() === 'true';

        if (isSystemMessage) {
            const systemText = (bubble.querySelector('.msg-system-text')?.textContent || '').trim();
            return {
                messageId,
                sentAt,
                sender: { accountId: senderId },
                content: systemText,
                messageType: 3,
                MessageType: 3,
                medias: [],
                isRecalled: false,
                IsRecalled: false
            };
        }

        let content = '';
        const textBubble = bubble.querySelector('.msg-bubble');
        if (textBubble && !textBubble.classList.contains('msg-bubble-recalled')) {
            content = (textBubble.textContent || '').trim();
        }

        let medias = [];
        const mediaGrid = bubble.querySelector('.msg-media-grid');
        if (mediaGrid?.dataset?.medias) {
            try {
                const parsed = JSON.parse(mediaGrid.dataset.medias);
                if (Array.isArray(parsed)) {
                    medias = parsed.map((m) => ({
                        mediaUrl: m?.mediaUrl || m?.MediaUrl || '',
                        mediaType: Number(m?.mediaType ?? m?.MediaType ?? 0),
                        thumbnailUrl: m?.thumbnailUrl || m?.ThumbnailUrl || null,
                        fileName: m?.fileName || m?.FileName || '',
                        fileSize: m?.fileSize || m?.FileSize || 0
                    }));
                }
            } catch (_err) {
                medias = [];
            }
        }

        if ((!Array.isArray(medias) || medias.length === 0) && bubble.querySelector('.msg-file-item')) {
            const firstFile = bubble.querySelector('.msg-file-item');
            const link = firstFile?.querySelector('.msg-file-link');
            const href = (link?.getAttribute('href') || '').trim();
            const fileName = (firstFile?.querySelector('.msg-file-name')?.textContent || '').trim();
            medias = [{
                mediaUrl: href,
                mediaType: 3,
                fileName
            }];
        }

        return {
            messageId,
            sentAt,
            sender: { accountId: senderId },
            content,
            medias,
            isRecalled,
            IsRecalled: isRecalled
        };
    },

    getConversationMeta(conversationId) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        if (!normalizedConversationId) return null;

        if (window.ChatPage && (window.ChatPage.currentChatId || '').toString().toLowerCase() === normalizedConversationId) {
            return window.ChatPage.currentMetaData || null;
        }

        if (window.ChatWindow?.openChats instanceof Map) {
            for (const [id, chat] of window.ChatWindow.openChats.entries()) {
                if ((id || '').toString().toLowerCase() === normalizedConversationId) {
                    return chat?.data || null;
                }
            }
        }

        if (Array.isArray(window.ChatSidebar?.conversations)) {
            const found = window.ChatSidebar.conversations.find(c =>
                (c?.conversationId || c?.ConversationId || '').toString().toLowerCase() === normalizedConversationId
            );
            return found || null;
        }

        return null;
    },

    canPinConversation(conversationId) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        if (!this.isGuid(normalizedConversationId)) return false;

        const meta = this.getConversationMeta(normalizedConversationId);
        if (!meta) return true;

        const isGroup = this.normalizeBool(meta?.isGroup ?? meta?.IsGroup);
        if (!isGroup) return true;

        const members = meta?.members || meta?.Members || [];
        if (!Array.isArray(members) || members.length === 0) return true;

        const myId = this.getCurrentAccountId();
        if (!myId) return false;

        const myMember = members.find(m =>
            (m?.accountId || m?.AccountId || '').toString().toLowerCase() === myId
        );
        if (!myMember) return false;

        const role = Number(myMember?.role ?? myMember?.Role);
        const isAdmin = this.normalizeBool(myMember?.isAdmin ?? myMember?.IsAdmin);
        return isAdmin || role === 1;
    },

    setMessagePinnedState(messageId, isPinned) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return false;

        const shouldPin = !!isPinned;
        const bubbles = document.querySelectorAll(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        if (!bubbles.length) return false;

        const ensurePinHostWrapper = (target, wrapperClass) => {
            if (!target || !wrapperClass) return target;
            const parent = target.parentElement;
            if (!parent) return target;
            if (parent.classList?.contains(wrapperClass)) return parent;

            const wrapper = document.createElement('div');
            wrapper.className = wrapperClass;
            parent.insertBefore(wrapper, target);
            wrapper.appendChild(target);
            return wrapper;
        };

        bubbles.forEach((bubble) => {
            if (!bubble.classList?.contains('msg-bubble-wrapper')) return;
            if (window.ChatCommon?.isSystemMessageElement?.(bubble)) return;

            bubble.dataset.isPinned = shouldPin ? 'true' : 'false';
            const contentContainer = bubble.querySelector('.msg-content-container');
            if (!contentContainer) return;

            contentContainer.querySelectorAll('.msg-pinned-badge').forEach((badge) => badge.remove());

            if (shouldPin) {
                let pinHost = contentContainer;
                let isMediaAnchor = false;

                const mediaGrid = contentContainer.querySelector('.msg-media-grid');
                const fileList = contentContainer.querySelector('.msg-file-list');
                if (mediaGrid) {
                    pinHost = ensurePinHostWrapper(mediaGrid, 'msg-media-anchor');
                    isMediaAnchor = true;
                } else if (fileList) {
                    pinHost = ensurePinHostWrapper(fileList, 'msg-file-anchor');
                    isMediaAnchor = true;
                }

                const badge = document.createElement('div');
                badge.className = `msg-pinned-badge${isMediaAnchor ? ' msg-pinned-badge-media-anchor' : ''}`;
                badge.title = 'Pinned message';
                badge.innerHTML = '<i data-lucide="pin"></i>';
                pinHost.prepend(badge);
                if (window.lucide) lucide.createIcons({ container: badge });
            }
        });

        return true;
    },

    removePinnedModalItem(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId || !this.currentPinnedModal) return;

        this.currentPinnedModal
            .querySelectorAll(`.chat-pinned-item[data-message-id="${normalizedMessageId}"]`)
            .forEach(el => el.remove());

        const list = this.currentPinnedModal.querySelector('.chat-pinned-list');
        if (!list) return;

        if (!list.querySelector('.chat-pinned-item')) {
            list.innerHTML = '<div class="chat-pinned-empty">No pinned messages in this conversation.</div>';
        }
    },

    markPinnedModalMessageRecalled(messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId || !this.currentPinnedModal) return;

        const recalledText = window.APP_CONFIG?.CHAT_RECALLED_MESSAGE_TEXT || 'Message was recalled';
        const items = this.currentPinnedModal.querySelectorAll(`.chat-pinned-item[data-message-id="${normalizedMessageId}"]`);
        items.forEach((item) => {
            const contentEl = item.querySelector('.chat-pinned-item-message');
            if (contentEl) {
                contentEl.textContent = recalledText;
                contentEl.classList.add('recalled');
            }
            item.querySelector('.chat-pinned-item-actions')?.remove();
        });
    },

    extractSystemPinAction(message) {
        const parsed = window.ChatCommon?.parseSystemMessageData?.(message);
        if (!parsed) return null;

        const action = Number(parsed?.action ?? parsed?.Action);
        if (!Number.isFinite(action)) return null;

        if (action === 10) {
            const messageId = (parsed?.pinnedMessageId || parsed?.PinnedMessageId || '').toString().toLowerCase();
            return messageId ? { action: 'pin', messageId } : null;
        }

        if (action === 11) {
            const messageId = (parsed?.unpinnedMessageId || parsed?.UnpinnedMessageId || '').toString().toLowerCase();
            return messageId ? { action: 'unpin', messageId } : null;
        }

        return null;
    },

    syncPinStateFromSystemMessage(message, conversationId = '') {
        const pinAction = this.extractSystemPinAction(message);
        if (!pinAction) return false;

        if (pinAction.action === 'pin') {
            this.setMessagePinnedState(pinAction.messageId, true);
        } else if (pinAction.action === 'unpin') {
            this.setMessagePinnedState(pinAction.messageId, false);
            this.removePinnedModalItem(pinAction.messageId);
        }

        const normalizedConversationId = (conversationId || message?.conversationId || message?.ConversationId || '').toString().toLowerCase();
        this.refreshPinnedModalIfOpen(normalizedConversationId);
        return true;
    },

    async pinMessage(conversationId, messageId) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!this.isGuid(normalizedConversationId) || !normalizedMessageId) {
            window.toastError && window.toastError('Failed to pin message');
            return false;
        }

        this.closeAllMenus();
        try {
            const res = await window.API.Messages.pin(normalizedConversationId, normalizedMessageId);
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                window.toastError && window.toastError(data?.message || data?.Message || 'Failed to pin message');
                return false;
            }

            this.setMessagePinnedState(normalizedMessageId, true);
            window.toastSuccess && window.toastSuccess('Message pinned');
            this.refreshPinnedModalIfOpen(normalizedConversationId);
            return true;
        } catch (error) {
            console.error('Error pinning message:', error);
            window.toastError && window.toastError('Failed to pin message');
            return false;
        }
    },

    async unpinMessage(conversationId, messageId) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!this.isGuid(normalizedConversationId) || !normalizedMessageId) {
            window.toastError && window.toastError('Failed to unpin message');
            return false;
        }

        this.closeAllMenus();
        try {
            const res = await window.API.Messages.unpin(normalizedConversationId, normalizedMessageId);
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                window.toastError && window.toastError(data?.message || data?.Message || 'Failed to unpin message');
                return false;
            }

            this.setMessagePinnedState(normalizedMessageId, false);
            this.removePinnedModalItem(normalizedMessageId);
            window.toastSuccess && window.toastSuccess('Message unpinned');
            this.refreshPinnedModalIfOpen(normalizedConversationId);
            return true;
        } catch (error) {
            console.error('Error unpinning message:', error);
            window.toastError && window.toastError('Failed to unpin message');
            return false;
        }
    },

    closePinnedMessagesModal() {
        const overlay = this.currentPinnedModal;
        if (!overlay) return;
        overlay.classList.remove('show');
        if (window.unlockScroll) unlockScroll();
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (this.currentPinnedModal === overlay) this.currentPinnedModal = null;
        }, 200);
    },

    getPinnedMediaLabel(medias) {
        if (!Array.isArray(medias) || !medias.length) return '';
        const first = medias[0] || {};
        const mediaType = Number(first?.mediaType ?? first?.MediaType);
        if (window.ChatCommon && typeof ChatCommon.getMediaTypeLabel === 'function') {
            return ChatCommon.getMediaTypeLabel(mediaType);
        }
        if (mediaType === 1) return '[Video]';
        if (mediaType === 3) return '[File]';
        return '[Image]';
    },

    getPinnedConversationTitle(conversationId, fallbackTitle = 'Pinned messages') {
        return fallbackTitle;
    },

    _truncateLength: 150,

    togglePinnedTruncate(btn) {
        const msgEl = btn?.closest('.chat-pinned-item-content')?.querySelector('.chat-pinned-item-message');
        if (!msgEl) return;
        msgEl.classList.toggle('truncated');
        btn.textContent = msgEl.classList.contains('truncated') ? 'more' : 'less';
    },



    openPinnedItemMenu(e, conversationId, messageId) {
        e.stopPropagation();
        this.closeAllMenus(); // Close other menus first

        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'chat-pinned-more-menu';
        menu.dataset.conversationId = conversationId;
        menu.dataset.messageId = messageId;
        
        menu.innerHTML = `
            <div class="chat-pinned-more-menu-item" data-action="view">
                <i data-lucide="message-circle"></i>
                <span>View in chat</span>
            </div>
            <div class="chat-pinned-more-menu-item danger" data-action="unpin">
                <i data-lucide="pin-off"></i>
                <span>Unpin</span>
            </div>
        `;
        document.body.appendChild(menu);

        const menuH = menu.offsetHeight || 80;
        let top = rect.bottom + 4;
        let left = rect.right - menu.offsetWidth;
        if (top + menuH > window.innerHeight) top = rect.top - menuH - 4;
        if (left < 8) left = 8;
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        this.currentMenu = menu;

        if (window.lucide) lucide.createIcons({ container: menu });

        menu.querySelector('[data-action="view"]').onclick = (ev) => {
            ev.stopPropagation();
            this.closeAllMenus();
            this.jumpToMessage(conversationId, messageId);
        };
        menu.querySelector('[data-action="unpin"]').onclick = (ev) => {
            ev.stopPropagation();
            this.closeAllMenus();
            this.unpinMessage(conversationId, messageId);
        };

        const closeHandler = (ev) => {
            if (this.currentMenu === menu && !menu.contains(ev.target) && ev.target !== btn) {
                this.closeAllMenus();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    },

    async renderPinnedModalContent(conversationId, listEl) {
        if (!listEl) return;
        listEl.innerHTML = '<div class="chat-pinned-empty">Loading...</div>';

        try {
            const res = await window.API.Messages.getPinned(conversationId);
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                listEl.innerHTML = `<div class="chat-pinned-empty">${this.escapeHtml(data?.message || data?.Message || 'Failed to load pinned messages')}</div>`;
                return;
            }

            const items = await res.json().catch(() => []);
            const pinnedItems = Array.isArray(items) ? items : [];
            if (!pinnedItems.length) {
                listEl.innerHTML = '<div class="chat-pinned-empty">No pinned messages in this conversation.</div>';
                return;
            }

            const recalledText = window.APP_CONFIG?.CHAT_RECALLED_MESSAGE_TEXT || 'Message was recalled';
            listEl.innerHTML = pinnedItems.map((item) => {
                const messageId = (item?.messageId || item?.MessageId || '').toString().toLowerCase();
                const sender = item?.sender || item?.Sender || {};
                const senderName = sender?.nickname || sender?.Nickname || sender?.username || sender?.Username || sender?.fullName || sender?.FullName || 'Unknown';
                const avatarUrl = sender?.avatarUrl || sender?.AvatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;
                const medias = item?.medias || item?.Medias || [];
                const isRecalled = this.normalizeBool(item?.isRecalled ?? item?.IsRecalled);
                const contentRaw = item?.content ?? item?.Content;
                const hasContent = typeof contentRaw === 'string' && contentRaw.trim().length > 0;
                const messageText = isRecalled
                    ? recalledText
                    : (hasContent ? contentRaw.trim() : '');

                const pinnedAt = item?.pinnedAt || item?.PinnedAt;
                const sentAt = item?.sentAt || item?.SentAt;
                const sentLabel = window.ChatCommon?.formatTime?.(sentAt) || '';
                const pinnedLabel = window.ChatCommon?.formatTime?.(pinnedAt) || '';

                // Truncation
                const needsTruncate = !isRecalled && hasContent && messageText.length > this._truncateLength;
                const truncateClass = needsTruncate ? ' truncated' : '';
                const truncateBtn = needsTruncate ? `<button class="chat-pinned-toggle-btn" onclick="event.stopPropagation(); window.ChatActions.togglePinnedTruncate(this)">more</button>` : '';

                // Media thumbnails
                let mediaThumbs = '';
                if (!isRecalled && Array.isArray(medias) && medias.length) {
                    const thumbItems = medias.slice(0, 4).map(m => {
                        const mtype = Number(m?.mediaType ?? m?.MediaType);
                        const thumbUrl = m?.thumbnailUrl || m?.ThumbnailUrl;
                        const mediaUrl = m?.mediaUrl || m?.MediaUrl || '';
                        const fallbackUrl = thumbUrl || mediaUrl || '';

                        if (mtype === 1) {
                            // Video
                            if (thumbUrl) {
                                return `<div class="chat-pinned-media-thumb video"><img src="${this.escapeHtml(thumbUrl)}" alt="" onerror="this.style.display='none'"><div class="chat-pinned-media-play"><i data-lucide="play"></i></div></div>`;
                            } else {
                                return `<div class="chat-pinned-media-thumb video"><video src="${this.escapeHtml(mediaUrl)}#t=0.5" preload="metadata" muted playsinline></video><div class="chat-pinned-media-play"><i data-lucide="play"></i></div></div>`;
                            }
                        }
                        if (mtype === 3) {
                            // File
                            return `<div class="chat-pinned-media-thumb file"><div class="chat-pinned-media-file-icon"><i data-lucide="file-text"></i></div></div>`;
                        }
                        // Image or unknown
                        return `<div class="chat-pinned-media-thumb"><img src="${this.escapeHtml(fallbackUrl)}" alt="" onerror="this.style.display='none'"></div>`;
                    }).join('');
                    mediaThumbs = `<div class="chat-pinned-media-preview">${thumbItems}</div>`;
                }

                // More button (replaces Jump button)
                const moreBtn = isRecalled ? '' : `<button class="chat-pinned-more-btn" onclick="event.stopPropagation(); window.ChatActions.openPinnedItemMenu(event, '${conversationId}', '${messageId}')" title="More options"><i data-lucide="ellipsis"></i></button>`;
                const messageTextHtml = (isRecalled || hasContent)
                    ? `<div class="chat-pinned-item-message${isRecalled ? ' recalled' : ''}${truncateClass}">${this.escapeHtml(messageText)}</div>`
                    : '';

                return `
                    <div class="chat-pinned-item" data-message-id="${this.escapeHtml(messageId)}">
                        <img class="chat-pinned-item-avatar" src="${this.escapeHtml(avatarUrl)}" alt="" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                        <div class="chat-pinned-item-content" onclick="window.ChatActions.jumpToMessage('${conversationId}', '${messageId}')">
                            <div class="chat-pinned-item-top">
                                <div class="chat-pinned-item-author" title="${this.escapeHtml(senderName)}">${this.escapeHtml(senderName)}</div>
                                <div class="chat-pinned-item-time">${this.escapeHtml(sentLabel)}</div>
                            </div>
                            ${messageTextHtml}
                            ${truncateBtn}
                            ${mediaThumbs}
                            <div class="chat-pinned-item-message-meta">Pinned ${this.escapeHtml(pinnedLabel)}</div>
                        </div>
                        ${moreBtn}
                    </div>
                `;
            }).join('');
            if (window.lucide) lucide.createIcons({ container: listEl });
        } catch (error) {
            console.error('Error loading pinned messages:', error);
            listEl.innerHTML = '<div class="chat-pinned-empty">Failed to load pinned messages.</div>';
        }
    },

    async showPinnedMessages(conversationId, options = {}) {
        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        if (!this.isGuid(normalizedConversationId)) {
            window.toastInfo && window.toastInfo('Pinned messages are available after the conversation is created');
            return;
        }

        this.closePinnedMessagesModal();
        this.closeAllMenus();

        const title = options.title || this.getPinnedConversationTitle(normalizedConversationId);
        const overlay = document.createElement('div');
        overlay.className = 'chat-common-confirm-overlay chat-pinned-overlay';
        overlay.dataset.conversationId = normalizedConversationId;
        overlay.innerHTML = `
            <div class="chat-common-confirm-popup chat-pinned-popup">
                <div class="chat-nicknames-header">
                    <h3>${this.escapeHtml(title)}</h3>
                    <div class="chat-nicknames-close" id="chatPinnedCloseBtn">
                        <i data-lucide="x"></i>
                    </div>
                </div>
                <div class="chat-pinned-list"></div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentPinnedModal = overlay;

        if (window.lockScroll) lockScroll();
        if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: overlay });
        requestAnimationFrame(() => overlay.classList.add('show'));

        const closeBtn = overlay.querySelector('#chatPinnedCloseBtn');
        if (closeBtn) closeBtn.onclick = () => this.closePinnedMessagesModal();
        overlay.onclick = (evt) => {
            if (evt.target === overlay) this.closePinnedMessagesModal();
        };

        const listEl = overlay.querySelector('.chat-pinned-list');
        await this.renderPinnedModalContent(normalizedConversationId, listEl);
    },

    refreshPinnedModalIfOpen(conversationId) {
        const overlay = this.currentPinnedModal;
        if (!overlay) return;

        const currentConversationId = (overlay.dataset?.conversationId || '').toString().toLowerCase();
        const targetConversationId = (conversationId || '').toString().toLowerCase();
        if (!currentConversationId || !targetConversationId || currentConversationId !== targetConversationId) return;

        const listEl = overlay.querySelector('.chat-pinned-list');
        this.renderPinnedModalContent(currentConversationId, listEl);
    },

    highlightMessage(target) {
        if (!target) return;
        target.classList.remove('msg-jump-highlight');
        void target.offsetWidth;
        target.classList.add('msg-jump-highlight');
        setTimeout(() => target.classList.remove('msg-jump-highlight'), 1600);
    },

    findMessageElementInContainer(container, normalizedMessageId) {
        if (!container || !normalizedMessageId) return null;

        const exact = container.querySelector(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        if (exact) return exact;

        const bubbles = container.querySelectorAll('.msg-bubble-wrapper[data-message-id]');
        for (const bubble of bubbles) {
            const currentId = (bubble?.dataset?.messageId || '').toString().toLowerCase();
            if (currentId && currentId === normalizedMessageId) return bubble;
        }

        return null;
    },

    findMessageElementForConversation(conversationId, normalizedMessageId) {
        const normalizedConvId = (conversationId || '').toString().toLowerCase();
        if (!normalizedMessageId) return null;

        if (window.ChatPage && normalizedConvId &&
            (window.ChatPage.currentChatId || '').toLowerCase() === normalizedConvId) {
            const pageContainer = document.getElementById('chat-view-messages');
            const pageTarget = this.findMessageElementInContainer(pageContainer, normalizedMessageId);
            if (pageTarget) return pageTarget;
        }

        if (window.ChatWindow && normalizedConvId) {
            const openId = window.ChatWindow.getOpenChatId?.(normalizedConvId);
            if (openId) {
                const windowContainer = document.getElementById(`chat-messages-${openId}`);
                const windowTarget = this.findMessageElementInContainer(windowContainer, normalizedMessageId);
                if (windowTarget) return windowTarget;
            }
        }

        const globalExact = document.querySelector(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        if (globalExact) return globalExact;

        const allBubbles = document.querySelectorAll('.msg-bubble-wrapper[data-message-id]');
        for (const bubble of allBubbles) {
            const currentId = (bubble?.dataset?.messageId || '').toString().toLowerCase();
            if (currentId && currentId === normalizedMessageId) return bubble;
        }

        return null;
    },

    handleReplyClick(element, messageId) {
        if (!element || !messageId) return;

        // Try to find chat window container first
        const windowContainer = element.closest('[id^="chat-messages-"]');
        if (windowContainer) {
            const conversationId = windowContainer.id.replace('chat-messages-', '');
            this.jumpToMessage(conversationId, messageId);
            return;
        }

        // Try to find chat page container
        const pageContainer = element.closest('#chat-view-messages');
        if (pageContainer) {
            // Get current chat ID from page context
            const conversationId = window.ChatPage?.currentChatId;
            if (conversationId) {
                this.jumpToMessage(conversationId, messageId);
            }
        }
    },

    jumpToMessage(conversationId, messageId) {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        const normalizedConvId = (conversationId || '').toString().toLowerCase();
        if (!normalizedMessageId) return false;

        this.closeAllMenus();

        // Case 1: Message is in the DOM
        const target = this.findMessageElementForConversation(normalizedConvId, normalizedMessageId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.highlightMessage(target);
            this.closePinnedMessagesModal();
            return true;
        }

        // Case 2: Message not in DOM — load context from API
        // Try ChatPage first
        if (window.ChatPage && normalizedConvId &&
            (window.ChatPage.currentChatId || '').toLowerCase() === normalizedConvId) {
            this.closePinnedMessagesModal();
            window.ChatPage.loadMessageContext(normalizedConvId, normalizedMessageId);
            return true;
        }

        // Try ChatWindow
        if (window.ChatWindow && normalizedConvId) {
            const openId = window.ChatWindow.getOpenChatId?.(normalizedConvId);
            if (openId && window.ChatWindow.openChats?.has(openId)) {
                this.closePinnedMessagesModal();
                window.ChatWindow.loadMessageContext(openId, normalizedMessageId);
                return true;
            }
        }

        window.toastInfo && window.toastInfo('Could not locate message in current chat.');
        return false;
    },

    /**
     * Open the "More Options" context menu
     */
    openMoreMenu(e, messageId, isOwn) {
        e.stopPropagation();
        this.closeAllMenus();

        const btn = e.currentTarget;
        const wrapper = btn.closest('.msg-bubble-wrapper');
        const resolvedMessageId = (messageId || wrapper?.dataset?.messageId || '').toString().toLowerCase();
        const isRecalled = (wrapper?.dataset?.isRecalled || '').toString().toLowerCase() === 'true';
        const isPinned = (wrapper?.dataset?.isPinned || '').toString().toLowerCase() === 'true';
        const conversationId = this.resolveConversationId(wrapper);
        const canPin = this.canPinConversation(conversationId);
        
        // Mark as active so CSS can keep buttons visible
        if (wrapper) wrapper.classList.add('menu-active');
        btn.classList.add('active');

        const rect = btn.getBoundingClientRect();

        const menu = document.createElement('div');
        menu.className = 'msg-more-menu';

        // Inherit theme
        const themeTarget = btn.closest('.chat-box') || btn.closest('.chat-view') || btn.closest('.chat-panel-container');
        if (themeTarget) {
            const vars = ['--chat-theme-surface', '--chat-theme-border', '--chat-theme-action-color', '--chat-theme-action-hover-bg'];
            vars.forEach(v => {
                const val = getComputedStyle(themeTarget).getPropertyValue(v);
                if (val) menu.style.setProperty(v, val);
            });
            const themeClass = [...themeTarget.classList].find(c => c.startsWith('chat-theme-'));
            if (themeClass) menu.classList.add(themeClass);
        }

        
        let itemsHtml = `
            <div class="msg-more-item" onclick="window.ChatActions.hideForYou('${resolvedMessageId}')">
                <i data-lucide="eye-off"></i>
                <span>Hide for you</span>
            </div>
        `;

        if (!isRecalled) {
            itemsHtml += `
            <div class="msg-more-item" onclick="window.toastInfo('Forwarding coming soon')">
                <i data-lucide="forward"></i>
                <span>Forward</span>
            </div>
            `;
        }

        if (resolvedMessageId && canPin && !isRecalled) {
            itemsHtml += isPinned
                ? `
                    <div class="msg-more-item" onclick="window.ChatActions.unpinMessage('${conversationId}', '${resolvedMessageId}')">
                        <i data-lucide="pin-off"></i>
                        <span>Unpin</span>
                    </div>
                `
                : `
                    <div class="msg-more-item" onclick="window.ChatActions.pinMessage('${conversationId}', '${resolvedMessageId}')">
                        <i data-lucide="pin"></i>
                        <span>Pin</span>
                    </div>
                `;
        }

        if (isOwn && !isRecalled) {
            itemsHtml = `
                <div class="msg-more-item danger" onclick="window.ChatActions.recallMessage('${resolvedMessageId}')">
                    <i data-lucide="undo"></i>
                    <span>Recall</span>
                </div>
            ` + itemsHtml;
        }

        if (!isOwn) {
            itemsHtml += `
                <div class="msg-more-item danger" onclick="window.toastInfo('Reported successfully')">
                    <i data-lucide="alert-triangle"></i>
                    <span>Report</span>
                </div>
            `;
        }

        menu.innerHTML = itemsHtml;
        document.body.appendChild(menu);

        // Position the menu
        const menuWidth = 180;
        const menuHeight = menu.offsetHeight || 150;
        
        // Add vertical padding for the arrow
        let top = rect.bottom + 8;
        let left = rect.left - menuWidth + rect.width + 5;
        let posClass = 'pos-bottom';

        // Upward if close to bottom
        if (top + menuHeight > window.innerHeight) {
            top = rect.top - menuHeight - 8;
            posClass = 'pos-top';
        }
        
        // Rightward if close to left edge
        if (left < 10) {
            left = rect.left - 5;
        }

        // Leftward if close to right edge
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }

        menu.classList.add(posClass);
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        this.currentMenu = menu;

        // Render icons
        if (window.lucide) lucide.createIcons();

        // Close on click outside
        setTimeout(() => {
            window.addEventListener('click', this.handleOutsideClick);
        }, 10);
    },

    closeAllMenus() {
        if (this.currentMenu) {
            this.currentMenu.remove();
            this.currentMenu = null;
        }

        if (this.currentReactorsModal) {
            this.closeReactorsModal();
        }
        
        // Close ChatWindow header menu if open
        if (window.ChatWindow && typeof window.ChatWindow.closeHeaderMenu === 'function') {
            window.ChatWindow.closeHeaderMenu();
        }

        // Remove active state from any buttons or wrappers
        document.querySelectorAll('.msg-bubble-wrapper.menu-active').forEach(w => w.classList.remove('menu-active'));
        document.querySelectorAll('.msg-action-btn.active').forEach(b => b.classList.remove('active'));

        window.removeEventListener('click', this.handleOutsideClick);
    },

    handleOutsideClick(e) {
        if (ChatActions.currentMenu && !ChatActions.currentMenu.contains(e.target)) {
            ChatActions.closeAllMenus();
        }
    },

    /**
     * Hide message for current user with confirmation
     */
    hideForYou(messageId) {
        const normId = (messageId || '').toString().toLowerCase();
        if (!normId) {
            window.toastError && window.toastError('Failed to hide message');
            return;
        }
        this.closeAllMenus();
        this.showConfirm(
            'Hide Message?',
            'This message will be removed for you. Others in the chat will still be able to see it.',
            async () => {
                try {
                    const res = await window.API.Messages.hide(normId);
                    if (res.ok) {
                        // Success - Remove from UI
                        this.removeMessageFromUI(normId);
                    } else {
                        window.toastError && window.toastError('Failed to hide message');
                    }
                } catch (error) {
                    console.error('Error hiding message:', error);
                    window.toastError && window.toastError('An error occurred');
                }
            }
        );
    },

    /**
     * Remove message from UI (used by both manual hide and realtime)
     */
    removeMessageFromUI(messageId, fallbackConversationId = '') {
        if (!messageId) return false;
        const normId = messageId.toString().toLowerCase();
        const fallbackConvId = (fallbackConversationId || '').toString().toLowerCase();
        this.markMessageHiddenForCurrentUser(normId, true);
        const updatedReplyPreviews = this.updateReplyPreviewStateForParent(normId, { hidden: true });
        const modalMessageId = (this.currentReactorsModal?.dataset?.messageId || '').toString().toLowerCase();
        if (modalMessageId && modalMessageId === normId) {
            this.closeReactorsModal();
        }
        this.removePinnedModalItem(normId);
        
        // We use querySelectorAll because the same message might be in both chat-page and chat-window
        const bubbles = document.querySelectorAll(`[data-message-id="${normId}"]`);
        if (!bubbles.length) return updatedReplyPreviews > 0;

        bubbles.forEach(bubble => {
            const prev = this.findPreviousMessageBubble(bubble);
            const next = this.findNextMessageBubble(bubble);
            const container = bubble.closest('.chat-messages') || bubble.closest('.chat-view-messages');
            const conversationId = this.resolveConversationId(bubble) || fallbackConvId;

            // Capture "Sent" status info BEFORE removal
            const hadSentStatus = bubble.dataset.status === 'sent';
            const isLastBubbleInContainer = !!(container && !next);
            const replacementLastMessage = isLastBubbleInContainer
                ? this.extractSidebarMessageFromBubble(prev)
                : null;

            bubble.style.transition = 'all 0.3s ease';
            bubble.style.opacity = '0';
            bubble.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                bubble.remove();
                
                // RE-GROUPING LOGIC after removal
                if (next) this.refreshMessageState(next);
                if (prev) this.refreshMessageState(prev);

                // RE-ASSIGN "Sent" status if the hidden message was showing it
                if ((hadSentStatus || isLastBubbleInContainer) && container) {
                    this.reassignSentStatus(container);
                }

                // Check if we left an orphaned time separator
                this.cleanTimeSeparators(container);

                if (
                    isLastBubbleInContainer
                    && conversationId
                    && window.ChatSidebar
                    && typeof window.ChatSidebar.applyMessageHidden === 'function'
                ) {
                    try {
                        window.ChatSidebar.applyMessageHidden(conversationId, normId, replacementLastMessage);
                    } catch (err) {
                        console.error('Failed to sync sidebar after hide:', err);
                    }
                }
            }, 300);
        });
        return true;
    },

    /**
     * Callback for realtime hidden message
     */
    hideFromRealtime(data) {
        const messageId = data.messageId || data.MessageId;
        const conversationId = (data?.conversationId || data?.ConversationId || '').toString().toLowerCase();
        if (messageId) {
            this.removeMessageFromUI(messageId, conversationId);
        }
    },

    /**
     * After hiding a message, check if the new last own message
     * should display "Sent" status (if it's ours and unseen).
     */
    reassignSentStatus(container) {
        if (!container) return;

        // Find all remaining message bubbles
        const allBubbles = container.querySelectorAll('.msg-bubble-wrapper');
        if (allBubbles.length === 0) return;

        const lastBubble = allBubbles[allBubbles.length - 1];
        const isLastRecalled = (lastBubble.dataset?.isRecalled || '').toString().toLowerCase() === 'true';
        if (isLastRecalled || window.ChatCommon?.isSystemMessageElement?.(lastBubble)) return;

        // Only apply if the last message is ours (.sent class)
        if (!lastBubble.classList.contains('sent')) return;

        // Don't apply if it already has a status (pending, failed, or sent)
        if (lastBubble.dataset.status) return;

        // Don't apply if someone has already seen it (seen row has avatar children)
        const seenRow = lastBubble.querySelector('.msg-seen-row');
        if (seenRow && seenRow.children.length > 0) return;

        // Apply "Sent" status
        lastBubble.dataset.status = 'sent';
        
        // Add the status element if not present
        let statusEl = lastBubble.querySelector('.msg-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'msg-status msg-status-sent';
            statusEl.textContent = 'Sent';
            lastBubble.appendChild(statusEl);
        } else {
            statusEl.className = 'msg-status msg-status-sent';
            statusEl.textContent = 'Sent';
        }
    },

    /**
     * Fix message classes and UI when its neighbors change
     */
    buildMessageShapeFromElement(el) {
        if (!el || !el.classList?.contains('msg-bubble-wrapper')) return null;

        const typeRaw = (el.dataset?.messageType || '').toString().trim().toLowerCase();
        let messageType = null;
        if (el.classList.contains('msg-system') || typeRaw === 'system' || typeRaw === '3') {
            messageType = 3;
        } else if (typeRaw.length) {
            const numericType = Number(typeRaw);
            if (Number.isFinite(numericType)) {
                messageType = numericType;
            } else if (typeRaw === 'text') {
                messageType = 1;
            } else if (typeRaw === 'media') {
                messageType = 2;
            }
        }

        return {
            sender: { accountId: (el.dataset?.senderId || '').toString().toLowerCase() },
            sentAt: el.dataset?.sentAt,
            messageType
        };
    },

    /**
     * Fix message classes and UI when its neighbors change
     */
    refreshMessageState(el) {
        if (!el || !el.classList.contains('msg-bubble-wrapper')) return;
        
        const prev = this.findPreviousMessageBubble(el);
        const next = this.findNextMessageBubble(el);
        const m = this.buildMessageShapeFromElement(el);
        if (!m) return;

        if (m.messageType === 3 || window.ChatCommon?.isSystemMessageElement?.(el)) {
            const classes = ['msg-group-first', 'msg-group-middle', 'msg-group-last', 'msg-group-single'];
            classes.forEach(c => el.classList.remove(c));
            el.classList.add('msg-group-single');
            return;
        }
        
        // Re-call grouping logic
        const pM = this.buildMessageShapeFromElement(prev);
        const nM = this.buildMessageShapeFromElement(next);
        
        const newGroupPos = window.ChatCommon.getGroupPosition(m, pM, nM);
        
        // Update classes
        const classes = ['msg-group-first', 'msg-group-middle', 'msg-group-last', 'msg-group-single'];
        classes.forEach(c => el.classList.remove(c));
        el.classList.add(`msg-group-${newGroupPos}`);
        
        // Update Avatar showing
        const isOwn = el.classList.contains('sent');
        const avatarContainer = el.querySelector('.msg-avatar');
        if (avatarContainer) {
            const shouldShowAvatar = !isOwn && (newGroupPos === 'last' || newGroupPos === 'single');
            if (shouldShowAvatar) {
                avatarContainer.classList.remove('msg-avatar-spacer');
                if (!avatarContainer.querySelector('img')) {
                    const avatarUrl = el.dataset.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;
                    avatarContainer.innerHTML = `<img src="${avatarUrl}" alt="" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">`;
                }
            } else {
                avatarContainer.classList.add('msg-avatar-spacer');
                avatarContainer.innerHTML = '';
            }
        }

        // Handle Author Name for group chats (show if first/single)
        const authorName = el.dataset.authorName;
        if (authorName && !isOwn) {
            const shouldShowName = (newGroupPos === 'first' || newGroupPos === 'single');
            let authorNameEl = el.querySelector('.msg-author');
            
            if (shouldShowName) {
                if (!authorNameEl) {
                    const newAuthor = document.createElement('div');
                    newAuthor.className = 'msg-author';
                    newAuthor.textContent = authorName;
                    el.prepend(newAuthor);
                }
            } else {
                if (authorNameEl) authorNameEl.remove();
            }
        }
    },

    /**
     * Remove time separators that no longer have messages between them
     */
    cleanTimeSeparators(container) {
        if (!container) return;
        if (window.ChatCommon?.cleanTimeSeparators) {
            window.ChatCommon.cleanTimeSeparators(container);
            return;
        }

        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        const separators = Array.from(container.children).filter((child) =>
            child.classList?.contains('chat-time-separator')
        );

        let keptLeadingSeparator = false;
        separators.forEach((sep) => {
            const prevMsg = this.findPreviousMessageBubble(sep);
            const nextMsg = this.findNextMessageBubble(sep);

            // Separator without any following message is always orphaned.
            if (!nextMsg) {
                sep.remove();
                return;
            }

            // Keep leading separator before the first message in list.
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
            const shouldKeep = Number.isFinite(prevTime.getTime())
                && Number.isFinite(nextTime.getTime())
                && ((nextTime - prevTime) > gap);

            if (!shouldKeep) {
                sep.remove();
            }
        });
    },

    handleMediaRecallEffects(messageId, conversationId = '') {
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!normalizedMessageId) return;

        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        let removedFromPanel = 0;

        if (window.ChatPage && typeof window.ChatPage.removeRecalledMediaFromPanel === 'function') {
            try {
                removedFromPanel = Number(
                    window.ChatPage.removeRecalledMediaFromPanel(normalizedMessageId, normalizedConversationId)
                ) || 0;
            } catch (err) {
                console.error('Failed to remove recalled media from panel:', err);
            }
        }

        if (window.ChatPage && typeof window.ChatPage.removeRecalledFilesFromPanel === 'function') {
            try {
                window.ChatPage.removeRecalledFilesFromPanel(normalizedMessageId, normalizedConversationId);
            } catch (err) {
                console.error('Failed to remove recalled files from panel:', err);
            }
        }

        const previewer = window.MediaPreviewer;
        if (!previewer || typeof previewer.isOpen !== 'function' || !previewer.isOpen()) return;

        const previewSource = (typeof previewer.getSource === 'function' ? previewer.getSource() : '').toLowerCase();
        const previewConversationId = (typeof previewer.getConversationId === 'function'
            ? previewer.getConversationId()
            : '').toLowerCase();

        if (previewSource === 'conversation-media-panel') {
            if (normalizedConversationId && previewConversationId && normalizedConversationId !== previewConversationId) {
                return;
            }

            const affected = removedFromPanel > 0
                || (typeof previewer.isViewingMessage === 'function'
                    && previewer.isViewingMessage(normalizedMessageId, { checkAny: true }));
            if (!affected) return;

            if (typeof previewer.syncAfterExternalListMutation === 'function') {
                previewer.syncAfterExternalListMutation({ closeIfEmpty: true });
            }
            return;
        }

        const isViewingRecalled = typeof previewer.isViewingMessage === 'function'
            && previewer.isViewingMessage(normalizedMessageId, { checkAny: true });
        if (!isViewingRecalled) return;

        if (typeof previewer.close === 'function') {
            previewer.close();
        }
        if (window.toastInfo) {
            window.toastInfo('This media is no longer available because the message was recalled.');
        }
    },

    applyRecalledState(messageId, options = {}) {
        if (!messageId) return false;
        const recalledText = options.recalledText || this.getRecalledMessageText();
        const normalizedMessageId = messageId.toString().toLowerCase();
        const updatedReplyPreviews = this.updateReplyPreviewStateForParent(normalizedMessageId, { recalled: true });
        const bubbles = document.querySelectorAll(`.msg-bubble-wrapper[data-message-id="${normalizedMessageId}"]`);
        if (!bubbles.length) {
            this.markPinnedModalMessageRecalled(normalizedMessageId);
            return updatedReplyPreviews > 0;
        }

        bubbles.forEach((bubble) => {
            if (!bubble.classList?.contains('msg-bubble-wrapper')) return;
            if (window.ChatCommon?.isSystemMessageElement?.(bubble)) return;

            bubble.dataset.isRecalled = 'true';
            bubble.dataset.currentReactType = '';
            bubble.dataset.reacts = '[]';
            bubble.dataset.reactedBy = '[]';
            bubble.dataset.totalReacts = '0';
            bubble.removeAttribute('data-status');

            const reactBtn = bubble.querySelector('.msg-action-btn.react[data-action="react"]');
            if (reactBtn) {
                reactBtn.classList.remove('is-reacted');
                reactBtn.dataset.reactType = '';
            }

            const statusEl = bubble.querySelector('.msg-status');
            if (statusEl) statusEl.remove();

            const contentContainer = bubble.querySelector('.msg-content-container');
            if (!contentContainer) return;

            contentContainer
                .querySelectorAll('.msg-media-anchor, .msg-file-anchor, .msg-media-grid, .msg-file-list, .msg-file-item, .msg-reactions-summary')
                .forEach((el) => el.remove());

            let textBubble = contentContainer.querySelector('.msg-bubble');
            if (!textBubble) {
                textBubble = document.createElement('div');
                textBubble.className = 'msg-bubble';
                contentContainer.appendChild(textBubble);
            }

            textBubble.classList.add('msg-bubble-recalled');
            textBubble.textContent = recalledText;
        });

        const modalMessageId = (this.currentReactorsModal?.dataset?.messageId || '').toString().toLowerCase();
        if (modalMessageId && modalMessageId === normalizedMessageId) {
            this.closeReactorsModal();
        }

        this.markPinnedModalMessageRecalled(normalizedMessageId);
        return true;
    },

    recallFromRealtime(data) {
        const messageId = data?.messageId || data?.MessageId;
        let conversationId = (data?.conversationId || data?.ConversationId || '').toString().toLowerCase();
        if (!messageId) return;
        if (!conversationId) {
            conversationId = this.resolveConversationIdByMessageId(messageId);
        }
        this.applyRecalledState(messageId);
        if (conversationId && window.ChatSidebar && typeof window.ChatSidebar.applyMessageRecalled === 'function') {
            window.ChatSidebar.applyMessageRecalled(conversationId, messageId);
        }
        this.handleMediaRecallEffects(messageId, conversationId);
    },

    recallMessage(messageId) {
        this.closeAllMenus();
        const normId = (messageId || '').toString().toLowerCase();
        if (!normId) {
            window.toastError && window.toastError('Failed to recall message');
            return;
        }

        this.showConfirm(
            'Recall Message?',
            'This message will be replaced with "Message was recalled" for everyone in this conversation.',
            async () => {
                try {
                    const res = await window.API.Messages.recall(normId);
                    if (!res.ok) {
                        window.toastError && window.toastError('Failed to recall message');
                        return;
                    }

                    const data = await res.json().catch(() => null);
                    this.applyRecalledState(normId);

                    let conversationId = (data?.conversationId || data?.ConversationId || '').toString().toLowerCase();
                    if (!conversationId) {
                        conversationId = this.resolveConversationIdByMessageId(normId);
                    }
                    if (conversationId && window.ChatSidebar && typeof window.ChatSidebar.applyMessageRecalled === 'function') {
                        window.ChatSidebar.applyMessageRecalled(conversationId, normId);
                    }
                    this.handleMediaRecallEffects(normId, conversationId);
                } catch (error) {
                    console.error('Error recalling message:', error);
                    window.toastError && window.toastError('An error occurred');
                }
            },
            { confirmText: 'Recall' }
        );
    },

    showConfirm(title, message, onConfirm, options = {}) {
        const confirmText = options.confirmText || 'Hide';
        const overlay = document.createElement('div');
        overlay.className = 'msg-confirm-overlay';

        // Inherit theme
        const activeMenu = this.currentMenu;
        if (activeMenu) {
            const themeClass = [...activeMenu.classList].find(c => c.startsWith('chat-theme-'));
            if (themeClass) overlay.classList.add(themeClass);
        }
        
        overlay.innerHTML = `
            <div class="msg-confirm-popup">
                <div class="msg-confirm-content">
                    <h3>${title}</h3>
                    <p>${message}</p>
                </div>
                <div class="msg-confirm-actions">
                    <button class="msg-confirm-btn cancel">Cancel</button>
                    <button class="msg-confirm-btn confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentConfirm = overlay;

        setTimeout(() => overlay.classList.add('show'), 10);

        const cancelBtn = overlay.querySelector('.cancel');
        const confirmBtn = overlay.querySelector('.confirm');

        cancelBtn.onclick = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            this.currentConfirm = null;
        };

        confirmBtn.onclick = async () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            this.currentConfirm = null;
            if (onConfirm) await onConfirm();
        };
    }
};

window.ChatActions = ChatActions;
ChatActions.ensureThemeSyncListener();
