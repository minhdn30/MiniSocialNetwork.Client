/**
 * Chat Page Module
 * Logic for the full-screen /messages page.
 * Note: The conversation list is handled by the global ChatSidebar.
 */
const CHAT_DOCUMENT_EXT_REGEX = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z)$/i;
const CHAT_DOCUMENT_MIME_SET = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed'
]);

const ChatPage = {
    currentChatId: null,
    page: 1,
    isLoading: false,
    hasMore: true,
    pageSize: window.APP_CONFIG?.CHATPAGE_MESSAGES_PAGE_SIZE || 20,
    currentMetaData: null,
    pendingFiles: [], // Store files before sending
    retryFiles: new Map(), // tempId -> File[]
    pendingSeenByConv: new Map(),
    _listenerRefs: [],
    _blobUrls: new Map(), // key -> Set<blobUrl>
    _emojiOutsideBound: false,
    runtimeCtx: null,
    // Context mode state (for "Jump to message" feature)
    _isContextMode: false,
    _contextPage: null,
    _hasMoreNewer: false,
    _newerPage: null,

    async init() {
        this.cleanupEventListeners();
        this.revokeAllBlobUrls();

        // Cleanup old group if exists (prevent leaks across re-initializations)
        if (this.currentChatId) {
            this.leaveCurrentConversation();
        }
        
        console.log("ChatPage initialized");
        this.currentChatId = null; 
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;
        this.pendingFiles = []; 
        this.retryFiles.clear();
        this.runtimeCtx = null;
        this._isContextMode = false;
        this._contextPage = null;
        this._hasMoreNewer = false;
        this._newerPage = null;
        this._savedInfoHtml = null;
        this._activeInfoPanel = null;
        this.resetMediaPanelState();
        this.removeJumpToBottomBtn();
        
        this.cacheElements();
        this.getRuntimeCtx();
        this.attachEventListeners();
        this.initScrollListener();
        this.handleUrlNavigation();
        this.registerRealtimeHandlers();
    },

    cacheElements() {
        this.mainArea = document.getElementById('chat-main-area');
        this.chatView = document.getElementById('chat-view');
        this.infoSidebar = document.getElementById('chat-info');
        this.infoContent = document.getElementById('chat-info-content');
    },

    getRuntimeCtx() {
        if (!window.ChatMessageRuntime) return null;
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        if (!this.runtimeCtx) {
            this.runtimeCtx = window.ChatMessageRuntime.createContext({
                scope: 'page',
                conversationId: this.currentChatId || null,
                myAccountId: myId,
                retryFiles: this.retryFiles,
                pendingSeenByConv: this.pendingSeenByConv,
                blobUrls: this._blobUrls,
                now: () => new Date()
            });
        }
        this.runtimeCtx.scope = 'page';
        this.runtimeCtx.conversationId = this.currentChatId || null;
        this.runtimeCtx.myAccountId = myId;
        this.runtimeCtx.retryFiles = this.retryFiles;
        this.runtimeCtx.pendingSeenByConv = this.pendingSeenByConv;
        this.runtimeCtx.blobUrls = this._blobUrls;
        return this.runtimeCtx;
    },

    trackBlobUrl(url, key = 'global') {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            return window.ChatMessageRuntime.trackBlobUrl(ctx, key, url);
        }
        if (!url) return null;
        if (!this._blobUrls.has(key)) {
            this._blobUrls.set(key, new Set());
        }
        this._blobUrls.get(key).add(url);
        return url;
    },

    revokeBlobUrl(url) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            window.ChatMessageRuntime.revokeBlobUrlIfNeeded(ctx, url);
            return;
        }
        if (!url) return;
        try {
            URL.revokeObjectURL(url);
        } catch (e) {
            console.warn('Failed to revoke blob URL:', e);
        }
        this._blobUrls.forEach(set => set.delete(url));
    },

    revokeAllPreviewBlobUrls() {
        const previewUrls = this._blobUrls.get('preview');
        if (!previewUrls || previewUrls.size === 0) return;
        Array.from(previewUrls).forEach(url => this.revokeBlobUrl(url));
        this._blobUrls.delete('preview');
    },

    revokeAllBlobUrls() {
        if (!this._blobUrls || this._blobUrls.size === 0) return;
        const allUrls = [];
        this._blobUrls.forEach(set => {
            set.forEach(url => allUrls.push(url));
        });
        allUrls.forEach(url => this.revokeBlobUrl(url));
        this._blobUrls.clear();
    },

    cleanupEventListeners() {
        if (!Array.isArray(this._listenerRefs) || this._listenerRefs.length === 0) return;
        this._listenerRefs.forEach(ref => {
            if (!ref?.target || !ref?.type || !ref?.handler) return;
            ref.target.removeEventListener(ref.type, ref.handler, ref.options);
        });
        this._listenerRefs = [];
    },

    cleanupRetryPayload(tempId) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            window.ChatMessageRuntime.revokeMediaUrlsForTemp(ctx, tempId);
            return;
        }
        if (!tempId) return;
        this.retryFiles.delete(tempId);
        const messageBlobUrls = this._blobUrls.get(tempId);
        if (messageBlobUrls && messageBlobUrls.size > 0) {
            Array.from(messageBlobUrls).forEach(url => this.revokeBlobUrl(url));
        }
        this._blobUrls.delete(tempId);
    },

    getPendingMediaType(file) {
        if (!file) return 0;
        const mime = (file.type || '').toLowerCase();
        const fileName = (file.name || '').toLowerCase();

        if (mime.startsWith('video/')) return 1;
        if (mime.startsWith('image/')) return 0;

        if (CHAT_DOCUMENT_MIME_SET.has(mime) || CHAT_DOCUMENT_EXT_REGEX.test(fileName)) return 3;
        return 0;
    },

    formatFileSize(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = value;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        const display = size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
        return `${display} ${units[unitIndex]}`;
    },

    replaceOptimisticMediaUrls(bubble, messagePayload, tempId = null) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            return window.ChatMessageRuntime.replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId);
        }
        if (!bubble || !messagePayload) return false;
        const medias = messagePayload.Medias || messagePayload.medias || [];
        if (!Array.isArray(medias) || medias.length === 0) return false;

        let replaced = false;
        medias.forEach((m, i) => {
            const mediaUrl = m.MediaUrl || m.mediaUrl;
            const mediaId = (m.MessageMediaId || m.messageMediaId || '').toString().toLowerCase();
            if (!mediaUrl) return;

            const targetItem = bubble.querySelector(`[data-media-index="${i}"]`);
            if (!targetItem) return;

            const img = targetItem.querySelector('img');
            const vid = targetItem.querySelector('video');
            const fileLink = targetItem.querySelector('.msg-file-link');
            if (img) {
                if (img.src?.startsWith('blob:')) this.revokeBlobUrl(img.src);
                img.src = mediaUrl;
                replaced = true;
            }
            if (vid) {
                if (vid.src?.startsWith('blob:')) this.revokeBlobUrl(vid.src);
                vid.src = mediaUrl;
                replaced = true;
            }
            if (fileLink) {
                const oldHref = fileLink.getAttribute('href') || '';
                if (oldHref.startsWith('blob:')) this.revokeBlobUrl(oldHref);
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
            this.cleanupRetryPayload(tempId);
        }

        return replaced;
    },

    attachEventListeners() {
        const input = document.getElementById('chat-message-input');
        if (input) {
            // Set max length from config
            const maxLen = window.APP_CONFIG?.MAX_CHAT_MESSAGE_LENGTH || 1000;
            input.setAttribute('maxlength', maxLen);

            const onInput = () => {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
                this.updateInputState();
                // Emit typing (debounced via shared module)
                if (window.ChatTyping && this.currentChatId) {
                    ChatTyping.emitTyping(this.currentChatId);
                }
            };
            input.addEventListener('input', onInput);
            this._listenerRefs.push({ target: input, type: 'input', handler: onInput });
            
            const onKeyDown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.currentChatId && this.currentMetaData) {
                        this.sendMessage();
                    } else if (this.currentChatId) {
                        // Try fallback one last time
                        this.sendMessage();
                    }
                }
            };
            input.addEventListener('keydown', onKeyDown);
            this._listenerRefs.push({ target: input, type: 'keydown', handler: onKeyDown });
        }

        const sendBtn = document.getElementById('chat-page-send-btn');
        if (sendBtn) {
            sendBtn.onclick = () => this.sendMessage();
        }

        // Toggle actions menu on click (+)
        const toggleBtn = document.querySelector('.chat-toggle-actions');
        const expansion = document.querySelector('.chat-input-expansion');
        if (toggleBtn && expansion) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                expansion.classList.toggle('is-show');
            };

            // Close menu when clicking outside
            const onDocumentClick = (e) => {
                if (!expansion.contains(e.target)) {
                    expansion.classList.remove('is-show');
                }
            };
            document.addEventListener('click', onDocumentClick);
            this._listenerRefs.push({ target: document, type: 'click', handler: onDocumentClick });
        }

        // --- NEW ACTION BUTTONS ---

        // Emoji button
        const emojiBtn = document.getElementById('chat-emoji-btn');
        const emojiContainer = document.getElementById('chat-emoji-picker-container');
        if (emojiBtn && emojiContainer) {
            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                window.EmojiUtils?.togglePicker(emojiContainer, (emoji) => {
                    const input = document.getElementById('chat-message-input');
                    window.EmojiUtils.insertAtCursor(input, emoji.native);
                });
            };
            // Setup click outside to close
            if (!this._emojiOutsideBound) {
                window.EmojiUtils?.setupClickOutsideHandler('#chat-emoji-picker-container', '#chat-emoji-btn');
                this._emojiOutsideBound = true;
            }
        }

        // Upload media button
        const uploadBtn = document.getElementById('chat-upload-btn');
        const mediaInput = document.getElementById('chat-file-input');
        if (uploadBtn && mediaInput) {
            uploadBtn.onclick = (e) => {
                e.stopPropagation();
                mediaInput.click();
            };
            mediaInput.onchange = () => {
                const files = mediaInput.files;
                if (files.length > 0) {
                    this.handleMediaUpload(files, { source: 'media' });
                    mediaInput.value = ''; // Reset
                }
            };
        }

        // Upload document button
        const attachmentBtn = document.getElementById('chat-attachment-btn');
        const documentInput = document.getElementById('chat-document-input');
        if (attachmentBtn && documentInput) {
            attachmentBtn.onclick = (e) => {
                e.stopPropagation();
                documentInput.click();
            };
            documentInput.onchange = () => {
                const files = documentInput.files;
                if (files.length > 0) {
                    this.handleMediaUpload(files, { source: 'file' });
                    documentInput.value = ''; // Reset
                }
            };
        }

        // Info Sidebar Toggle
        const infoBtn = document.getElementById('chat-info-btn');
        if (infoBtn) {
            infoBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.infoSidebar) {
                    const isHidden = this.infoSidebar.classList.toggle('hidden');
                    infoBtn.classList.toggle('active', !isHidden);
                }
            };
        }

        const onThemeModeChanged = () => {
            const activeTheme = this.currentMetaData
                ? (this.currentMetaData.theme ?? this.currentMetaData.Theme ?? null)
                : null;
            this.applyThemeVisual(activeTheme);
        };
        const themeEvent = window.themeManager?.EVENT || 'app:theme-changed';
        window.addEventListener(themeEvent, onThemeModeChanged);
        this._listenerRefs.push({ target: window, type: themeEvent, handler: onThemeModeChanged });
    },

    queuePendingSeen(conversationId, messageId, accountId, memberInfo = null) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            window.ChatMessageRuntime.queuePendingSeen(ctx, conversationId, messageId, accountId, memberInfo);
            return;
        }
        if (!conversationId || !messageId || !accountId) return;
        const convId = conversationId.toString().toLowerCase();
        const msgId = messageId.toString().toLowerCase();
        let convMap = this.pendingSeenByConv.get(convId);
        if (!convMap) {
            convMap = new Map();
            this.pendingSeenByConv.set(convId, convMap);
        }
        let arr = convMap.get(msgId);
        if (!arr) {
            arr = [];
            convMap.set(msgId, arr);
        }
        arr.push({ accountId, memberInfo });
    },

    applyPendingSeenForMessage(conversationId, messageId) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            window.ChatMessageRuntime.applyPendingSeenForMessage(
                ctx,
                conversationId,
                messageId,
                (accountId, msgId, memberInfo) => this.moveSeenAvatar(accountId, msgId, memberInfo)
            );
            return;
        }
        if (!conversationId || !messageId) return;
        const convId = conversationId.toString().toLowerCase();
        const msgId = messageId.toString().toLowerCase();
        const convMap = this.pendingSeenByConv.get(convId);
        if (!convMap) return;
        const arr = convMap.get(msgId);
        if (!arr || arr.length === 0) return;
        convMap.delete(msgId);
        arr.forEach(item => {
            this.moveSeenAvatar(item.accountId, msgId, item.memberInfo);
        });
        if (convMap.size === 0) {
            this.pendingSeenByConv.delete(convId);
        }
    },

    initScrollListener() {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        msgContainer.onscroll = () => {
            if (this.isLoading) return;

            const ctx = this._getContextAdapter();
            
            // Scroll UP → load older
            if (msgContainer.scrollTop <= 50 && this.hasMore) {
                this.loadMessages(this.currentChatId, true);
            }

            // Scroll DOWN → load newer (context mode)
            ChatCommon.contextHandleScroll(ctx, msgContainer);

            // Show/hide jump-to-bottom button based on scroll position
            ChatCommon.updateJumpBtnOnScroll(ctx, msgContainer);
        };
    },

    /**
     * Mark the current conversation as seen (read).
     * Sends SeenConversation to ChatHub and updates sidebar badge.
     */
    markConversationSeen(conversationId, messageId) {
        if (!conversationId || !messageId) return;
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId);
        if (!isGuid) return;

        const normConversationId = conversationId.toString().toLowerCase();
        const normMessageId = messageId ? messageId.toString().toLowerCase() : null;
        if (!normMessageId) return;

        let wasUnread = false;
        if (window.ChatSidebar && typeof window.ChatSidebar.clearUnread === 'function') {
            const sidebarConv = window.ChatSidebar.conversations?.find(
                c => (c.conversationId || '').toLowerCase() === normConversationId
            );
            wasUnread = !!sidebarConv && (sidebarConv.unreadCount || 0) > 0;
            window.ChatSidebar.clearUnread(conversationId);
        }

        if ((this.currentChatId || '').toLowerCase() === normConversationId && this.currentMetaData) {
            this.currentMetaData.unreadCount = 0;
        }

        if (window.ChatWindow && typeof window.ChatWindow.syncUnreadFromSidebar === 'function') {
            window.ChatWindow.syncUnreadFromSidebar(conversationId);
        }

        if (wasUnread && typeof scheduleGlobalUnreadRefresh === 'function') {
            scheduleGlobalUnreadRefresh();
        }

        if (window.ChatRealtime && typeof window.ChatRealtime.seenConversation === 'function') {
            window.ChatRealtime.seenConversation(conversationId, normMessageId)
                .catch(err => console.error('SeenConversation error:', err));
        }
    },

    /**
     * Get the last message ID from the current chat view DOM.
     */
    getLastMessageId() {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return null;
        const allMsgs = msgContainer.querySelectorAll('[data-message-id]');
        if (allMsgs.length === 0) return null;
        return allMsgs[allMsgs.length - 1].dataset.messageId;
    },

    getLastMessageBubble(msgContainer) {
        if (!msgContainer) return null;
        const bubbles = msgContainer.querySelectorAll('.msg-bubble-wrapper');
        if (!bubbles.length) return null;
        return bubbles[bubbles.length - 1];
    },

    findPreviousMessageBubble(startElement) {
        let cursor = startElement?.previousElementSibling || null;
        while (cursor) {
            if (cursor.classList?.contains('msg-bubble-wrapper')) {
                return cursor;
            }
            cursor = cursor.previousElementSibling;
        }
        return null;
    },

    insertHtmlBeforeTypingIndicator(msgContainer, html) {
        if (!msgContainer || !html) return;
        const typingIndicator = msgContainer.querySelector('.typing-indicator');
        if (!typingIndicator || typingIndicator.parentElement !== msgContainer) {
            msgContainer.insertAdjacentHTML('beforeend', html);
            return;
        }

        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) {
            msgContainer.insertBefore(temp.firstChild, typingIndicator);
        }
    },

    insertNodeBeforeTypingIndicator(msgContainer, node) {
        if (!msgContainer || !node) return;
        const typingIndicator = msgContainer.querySelector('.typing-indicator');
        if (typingIndicator && typingIndicator.parentElement === msgContainer) {
            msgContainer.insertBefore(node, typingIndicator);
            return;
        }
        msgContainer.appendChild(node);
    },

    isNearBottom(threshold = 150) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return true;
        return msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight <= threshold;
    },

    scrollToBottom(behavior = 'auto') {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        if (behavior === 'smooth') {
            msgContainer.scrollTo({
                top: msgContainer.scrollHeight,
                behavior: 'smooth'
            });
            return;
        }

        const doScroll = () => {
            msgContainer.scrollTop = msgContainer.scrollHeight;
        };

        doScroll();
        requestAnimationFrame(doScroll);
        
        // Multiple checks to ensure it stays at bottom even if content (images) expand
        setTimeout(doScroll, 50);
        setTimeout(doScroll, 150);
        setTimeout(doScroll, 300);
    },

    // ─── Context mode methods (shared via ChatCommon) ──────────────────

    _getContextAdapter() {
        const self = this;
        return {
            getState: () => ({
                isLoading: self.isLoading,
                page: self.page,
                hasMore: self.hasMore,
                _isContextMode: self._isContextMode,
                _contextPage: self._contextPage,
                _newerPage: self._newerPage,
                _hasMoreNewer: self._hasMoreNewer,
            }),
            setState: (patch) => { Object.assign(self, patch); },
            getContainerId: () => 'chat-view-messages',
            getPageSize: () => self.pageSize,
            getConversationId: () => self.currentChatId,
            getMyId: () => (localStorage.getItem('accountId') || sessionStorage.getItem('accountId') || '').toLowerCase(),
            isGroup: () => self.currentMetaData?.isGroup || false,
            renderMessages: (items, container) => {
                const html = self.renderMessageList(items, false);
                if (html) self.insertHtmlBeforeTypingIndicator(container, html);
            },
            reloadLatest: () => { self.loadMessages(self.currentChatId, false); },
            scrollToBottom: (behavior) => { self.scrollToBottom(behavior); },
            getBtnParent: () => document.querySelector('.chat-view'),
            getBtnId: () => 'chatJumpBottomBtn',
            getMetaData: () => self.currentMetaData,
            setMetaData: (meta) => { self.currentMetaData = meta; },
        };
    },

    async loadMessageContext(conversationId, messageId) {
        await ChatCommon.contextLoadMessageContext(this._getContextAdapter(), messageId);
    },

    async loadNewerMessages() {
        await ChatCommon.contextLoadNewerMessages(this._getContextAdapter());
    },

    jumpToBottom() {
        ChatCommon.contextJumpToBottom(this._getContextAdapter());
    },

    resetContextMode() {
        ChatCommon.contextResetMode(this._getContextAdapter());
    },

    showJumpToBottomBtn() {
        ChatCommon.contextShowJumpBtn(this._getContextAdapter());
    },

    removeJumpToBottomBtn() {
        ChatCommon.contextRemoveJumpBtn(this._getContextAdapter());
    },

    registerRealtimeHandlers() {
        if (this._realtimeBound) return;
        this._realtimeBound = true;

        if (window.ChatRealtime && typeof window.ChatRealtime.onMessage === 'function') {
            window.ChatRealtime.onMessage((msg) => this.handleRealtimeMessage(msg));
        }
        if (window.ChatRealtime && typeof window.ChatRealtime.onSeen === 'function') {
            window.ChatRealtime.onSeen((data) => this.handleMemberSeen(data));
        }
        if (window.ChatRealtime && typeof window.ChatRealtime.onTyping === 'function') {
            window.ChatRealtime.onTyping((data) => this.handleTypingEvent(data));
        }
        if (window.ChatRealtime && typeof window.ChatRealtime.onTheme === 'function') {
            window.ChatRealtime.onTheme((data) => this.handleThemeEvent(data));
        }
    },

    handleRealtimeMessage(msg) {
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const normalized = window.ChatMessageRuntime
            ? window.ChatMessageRuntime.normalizeIncomingMessage(msg, myId)
            : null;

        const convId = (normalized?.conversationId || msg.ConversationId || msg.conversationId || '').toLowerCase();
        const messageId = normalized?.messageId || (msg.MessageId || msg.messageId || '').toString().toLowerCase() || null;
        const tempId = normalized?.tempId || msg.TempId || msg.tempId;
        const senderId = normalized?.senderId || (msg.Sender?.AccountId || msg.sender?.accountId || msg.SenderId || msg.senderId || '').toLowerCase();

        if (this.currentChatId?.toLowerCase() === convId) {
            const msgContainer = document.getElementById('chat-view-messages');
            if (!msgContainer) return;

            // 1. Check if message already exists in DOM (by real ID)
            if (messageId && msgContainer.querySelector(`[data-message-id="${messageId}"]`)) {
                return;
            }

            // 2. Identify and handle optimistic UI confirmation (Merging)
            let optimisticBubble = null;
            if (window.ChatMessageRuntime && normalized) {
                optimisticBubble = window.ChatMessageRuntime.findOptimisticBubble(msgContainer, normalized, myId);
            }
            if (!optimisticBubble && tempId) {
                optimisticBubble = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
            }

            if (optimisticBubble) {
                // Confirm optimistic message
                if (messageId) optimisticBubble.dataset.messageId = messageId;
                delete optimisticBubble.dataset.status;
                optimisticBubble.querySelector('.msg-status')?.remove();

                // Clear "Sent" from all OTHER messages so only the latest shows it
                msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                    if (el !== optimisticBubble) {
                        el.removeAttribute('data-status');
                        el.querySelector('.msg-status')?.remove();
                    }
                });

                // Replace local blob URLs with real server URLs
                const hadBlobMedia = !!optimisticBubble.querySelector('img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]');
                const replaced = this.replaceOptimisticMediaUrls(optimisticBubble, msg, tempId);

                const seenRow = optimisticBubble.querySelector('.msg-seen-row');
                if (seenRow && messageId) seenRow.id = `seen-row-${messageId}`;

                if (messageId) {
                    this.markConversationSeen(convId, messageId);
                    this.applyPendingSeenForMessage(convId, messageId);
                }
                if (tempId) {
                    this.retryFiles.delete(tempId);
                    if (!hadBlobMedia || replaced) {
                        this.cleanupRetryPayload(tempId);
                    }
                }
                return;
            } else {
                // Incoming message from others: clear "Sent" status
                msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                    el.removeAttribute('data-status');
                    el.querySelector('.msg-status')?.remove();
                });
            }

            // If it's an own message from another device, mark it as 'sent' (exclude system messages)
            if (senderId === myId && !msg.status && !ChatCommon.isSystemMessage(msg) && !msg.isRecalled) {
                msg.status = 'sent';
            }

            const wasNearBottom = this.isNearBottom();
            this.appendMessage(msg, wasNearBottom);
            if (window.ChatActions && typeof window.ChatActions.syncPinStateFromSystemMessage === 'function') {
                window.ChatActions.syncPinStateFromSystemMessage(msg, convId);
            }
            if (messageId) {
                this.applyPendingSeenForMessage(convId, messageId);
            }
            const lastId = messageId || this.getLastMessageId();
            if (lastId) this.markConversationSeen(convId, lastId);
        }
    },

    handleMemberSeen(data) {
        // Handle both PascalCase (SignalR default) and camelCase
        const convId = data.ConversationId || data.conversationId;
        const accId = data.AccountId || data.accountId;
        const msgIdRaw = data.LastSeenMessageId || data.lastSeenMessageId;
        const msgId = msgIdRaw ? msgIdRaw.toString().toLowerCase() : msgIdRaw;

        const currentNorm = (this.currentChatId || '').toLowerCase();
        const eventNorm = (convId || '').toLowerCase();

        if (currentNorm === eventNorm) {
            this.moveSeenAvatar(accId, msgId);
        }

        // Forward to sidebar to update seen indicator
        if (window.ChatSidebar && typeof window.ChatSidebar.updateSeenInSidebar === 'function') {
            window.ChatSidebar.updateSeenInSidebar(convId, accId);
        }
    },

    /**
     * Initial render for all members' seen indicators
     */
    updateMemberSeenStatuses(meta) {
        if (!meta || !meta.memberSeenStatuses) return;

        const myId = (localStorage.getItem('accountId') || sessionStorage.getItem('accountId') || window.APP_CONFIG?.CURRENT_USER_ID || '').toLowerCase();

        meta.memberSeenStatuses.forEach(member => {
            if (member.accountId === myId) return; 
            if (!member.lastSeenMessageId) return;
            
            const lastSeenId = member.lastSeenMessageId ? member.lastSeenMessageId.toString().toLowerCase() : member.lastSeenMessageId;
            this.moveSeenAvatar(member.accountId, lastSeenId, {
                avatar: member.avatarUrl,
                name: member.displayName
            });
        });
    },

    /**
     * Move (or create) a member's seen avatar to a specific message's seen row
     */
    moveSeenAvatar(accountId, messageId, memberInfo = null) {
        if (!accountId || !messageId) return;
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const targetAccountId = accountId.toLowerCase();

        // 0. DO NOT show our own seen indicator to ourselves!
        if (targetAccountId === myId) return;

        // 1. Resolve avatar/name if not provided (from metadata)
        if (!memberInfo && this.currentMetaData?.memberSeenStatuses) {
            const member = this.currentMetaData.memberSeenStatuses.find(m => {
                const mId = (m.accountId || m.AccountId || '').toLowerCase();
                return mId === targetAccountId;
            });
            if (member) {
                memberInfo = {
                    avatar: member.avatarUrl || member.AvatarUrl,
                    name: member.displayName || member.DisplayName
                };
            }
        }

        // 2. Remove existing avatar for THIS member in THIS conversation
        const existing = msgContainer.querySelector(`.seen-avatar-wrapper[data-account-id="${accountId}"]`);
        if (existing) {
            existing.remove();
        }

        // 3. Find target bubble (by messageId), then pick correct seen-row
        const normMessageId = messageId ? messageId.toString().toLowerCase() : messageId;
        let bubbleWrapper = normMessageId ? msgContainer.querySelector(`.msg-bubble-wrapper[data-message-id="${normMessageId}"]`) : null;
        let targetRow = bubbleWrapper?.querySelector('.msg-seen-row') || null;

        // If target message isn't loaded yet (pagination), defer until that message appears in DOM.
        if (normMessageId && !bubbleWrapper) {
            this.queuePendingSeen(this.currentChatId, normMessageId, accountId, memberInfo);
            return;
        }

        // If target isn't our message OR target has no seen row (e.g. system message),
        // move to nearest previous message sent by us that has a seen row.
        if (bubbleWrapper && (
            (bubbleWrapper.dataset.senderId || '').toLowerCase() !== myId ||
            !targetRow
        )) {
            let cursor = bubbleWrapper.previousElementSibling;
            while (cursor) {
                if (cursor.classList?.contains('msg-bubble-wrapper')) {
                    const senderId = (cursor.dataset.senderId || '').toLowerCase();
                    const candidateSeenRow = cursor.querySelector('.msg-seen-row');
                    if (senderId === myId && candidateSeenRow) {
                        targetRow = candidateSeenRow;
                        break;
                    }
                }
                cursor = cursor.previousElementSibling;
            }
        }

        if (!targetRow) {
            this.queuePendingSeen(this.currentChatId, normMessageId || messageId, accountId, memberInfo);
            return;
        }

        // 3.5 Remove "Sent" status on the message that is now seen
        const statusEl = targetRow.closest('.msg-bubble-wrapper')?.querySelector('.msg-status');
        if (statusEl) {
            statusEl.remove();
        }
        const statusBubble = targetRow.closest('.msg-bubble-wrapper');
        if (statusBubble?.dataset?.status === 'sent') {
            statusBubble.removeAttribute('data-status');
        }

        // 4. Create avatar element
        const avatarUrl = memberInfo?.avatar || APP_CONFIG.DEFAULT_AVATAR;
        const displayName = memberInfo?.name || 'User';

        const wrapper = document.createElement('div');
        wrapper.className = 'seen-avatar-wrapper';
        wrapper.dataset.accountId = accountId;

        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'seen-avatar';
        img.onerror = () => img.src = APP_CONFIG.DEFAULT_AVATAR;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'seen-avatar-name';
        nameLabel.textContent = displayName;

        wrapper.appendChild(img);
        wrapper.appendChild(nameLabel);
        targetRow.appendChild(wrapper);
    },

    handleUrlNavigation() {
        const hash = window.location.hash;
        if (hash.includes('?id=')) {
            const id = hash.split('?id=')[1].split('&')[0];
            if (id) this.loadConversation(id);
            return;
        }
        this.renderNoConversationState();
    },

    // ── Typing Indicator (delegates to shared ChatTyping) ──

    handleTypingEvent(data) {
        if (!window.ChatTyping) return;
        const conversationId = (data?.conversationId || data?.ConversationId || '').toString().toLowerCase();
        const accountId = (data?.accountId || data?.AccountId || '').toString().toLowerCase();
        const isTyping = (typeof data?.isTyping === 'boolean')
            ? data.isTyping
            : ((typeof data?.IsTyping === 'boolean') ? data.IsTyping : false);
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        if (accountId === myId) return;
        if (!conversationId) return;
        if (this.currentChatId?.toLowerCase() !== conversationId) return;

        const convId = this.currentChatId;
        if (isTyping) {
            ChatTyping.showIndicator('typing-indicator-page', convId, {
                accountId,
                metaData: this.currentMetaData
            });
        } else {
            ChatTyping.hideIndicator('typing-indicator-page', convId);
        }
    },

    handleThemeEvent(data) {
        const conversationId = (data?.conversationId || data?.ConversationId || '').toString().toLowerCase();
        if (!conversationId) return;

        const theme = (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function')
            ? window.ChatCommon.resolveConversationTheme(data?.theme ?? data?.Theme)
            : (typeof (data?.theme ?? data?.Theme) === 'string'
                ? (data.theme ?? data.Theme).trim().toLowerCase()
                : null);

        if (window.ChatSidebar && typeof window.ChatSidebar.applyThemeUpdate === 'function') {
            window.ChatSidebar.applyThemeUpdate(conversationId, theme);
        }
        if (window.ChatWindow && typeof window.ChatWindow.setThemeStatus === 'function') {
            window.ChatWindow.setThemeStatus(conversationId, theme);
        }
        this.applyThemeStatus(conversationId, theme);
    },

    leaveCurrentConversation() {
        if (this.currentChatId) {
            // Automatically minimize to bubble when leaving page (requested feature)
            this.minimizeToBubble();

            const oldId = this.currentChatId;
            this.pendingSeenByConv.delete(oldId.toLowerCase());
            this.revokeAllBlobUrls();
            this.retryFiles.clear();
            this.pendingFiles = [];
            this.updateAttachmentPreview();
            this.updateInputState();
            if (window.ChatTyping) {
                ChatTyping.cancelTyping(oldId);
                ChatTyping.hideIndicator('typing-indicator-page', oldId);
            }
            
            // Only leave if not open in any floating ChatWindow
            const isOpenInWindow = window.ChatWindow && window.ChatWindow.openChats && window.ChatWindow.openChats.has(oldId);
            
            if (window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
                window.ChatRealtime.leaveConversation(oldId);
            }
            this.currentChatId = null;
            this.getRuntimeCtx();
        }
    },

    async loadConversation(conversationId) {
        if (!conversationId) return;
        
        // 1. If clicking the same conversation, skip only when it already has content
        if (this.currentChatId === conversationId) {
            const msgContainer = document.getElementById('chat-view-messages');
            const hasMessages = !!msgContainer?.querySelector('.msg-bubble-wrapper');
            if (hasMessages || this.isLoading) {
                console.log("Already in this conversation, skipping re-load.");
                return;
            }
        }

        // 2. Increment generation to cancel any in-flight requests from previous conversation
        this._loadGeneration = (this._loadGeneration || 0) + 1;
        const gen = this._loadGeneration;

        // 3. Cleanup previous state
        const msgContainer = document.getElementById('chat-view-messages');
        if (msgContainer) msgContainer.innerHTML = '';
        
        // Optimization: Leave PREVIOUS conversation if it's different
        if (this.currentChatId && this.currentChatId !== conversationId) {
            if (window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
                window.ChatRealtime.leaveConversation(this.currentChatId);
            }
        }

        this.currentChatId = conversationId;
        this.currentMetaData = null;
        this.messages = [];
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;
        this.resetContextMode();
        this._savedInfoHtml = null;
        this._activeInfoPanel = null;
        this.resetMediaPanelState(conversationId);
        this.getRuntimeCtx();
        
        // 4. Optimization: Join target FIRST to maintain session during handoff from Bubble
        if (window.ChatRealtime && typeof window.ChatRealtime.joinConversation === 'function') {
            window.ChatRealtime.joinConversation(conversationId);
        }

        // 5. Cleanup overlapping floating windows for THIS conversationId
        if (window.ChatWindow && typeof window.ChatWindow.closeChat === 'function') {
            window.ChatWindow.closeChat(conversationId);
        }

        // 6. Visual update in Sidebar and Header pre-load
        if (window.ChatSidebar) {
            window.ChatSidebar.updateActiveId(conversationId);
            if (window.ChatSidebar.conversations) {
                const sidebarConv = window.ChatSidebar.conversations.find(c => c.conversationId === conversationId);
                if (sidebarConv) {
                    this.currentMetaData = sidebarConv;
                    this.renderHeader(sidebarConv);
                    this.renderInfoSidebar(sidebarConv);
                    this.updateInputState();
                }
            }
        }

        await this.loadMessages(conversationId, false, gen);
    },

    renderHeader(meta) {
        if (!meta) return;
        this.applyThemeVisual(meta.theme ?? meta.Theme ?? null);

        const img = document.getElementById('chat-view-img');
        const nameEl = document.getElementById('chat-view-name');
        const statusText = document.getElementById('chat-view-status-text');
        const statusDot = document.getElementById('chat-view-status-dot');

        if (img) {
            const avatarUrl = ChatCommon.getAvatar(meta);
            img.src = avatarUrl;
            // Ensure image is visible or use default if load fails
            img.onerror = () => { img.src = window.APP_CONFIG?.DEFAULT_AVATAR; };
        }
        if (nameEl) nameEl.innerText = ChatCommon.getDisplayName(meta) || 'Chat';
        
        // --- Profile Navigation Support ---
        const headerUser = document.querySelector('.chat-view-user');
        if (headerUser) {
            headerUser.onclick = () => {
                // When moving to ANY profile from chat-page, minimize the current chat
                this.minimizeToBubble();
                
                const targetId = meta.otherMember?.accountId || meta.otherMemberId;
                if (!meta.isGroup && targetId) {
                    window.location.hash = `#/profile/${targetId}`;
                }
            };
            // Style hint
            if (!meta.isGroup) headerUser.style.cursor = 'pointer';
            else headerUser.style.cursor = 'default';
        }

        if (statusText) {
            if (!meta.isGroup && meta.otherMember) {
                statusText.innerText = meta.otherMember.isActive ? 'Active now' : 'Offline';
                if (statusDot) statusDot.classList.toggle('hidden', !meta.otherMember.isActive);
            } else {
                statusText.innerText = 'Group chat';
                if (statusDot) statusDot.classList.add('hidden');
            }
        }
    },

    minimizeToBubble() {
        if (window.ChatWindow && this.currentChatId && this.currentMetaData) {
            const conversationId = this.currentChatId;
            const normConversationId = conversationId.toLowerCase();
            const sidebarConv = window.ChatSidebar?.conversations?.find(
                c => (c.conversationId || '').toLowerCase() === normConversationId
            );
            const syncedUnread = sidebarConv ? (sidebarConv.unreadCount || 0) : 0;
            const bubbleMeta = {
                ...this.currentMetaData,
                unreadCount: syncedUnread
            };

            this.currentMetaData.unreadCount = syncedUnread;
            ChatWindow.renderBubble(conversationId, bubbleMeta);
            if (typeof ChatWindow.syncUnreadFromSidebar === 'function') {
                ChatWindow.syncUnreadFromSidebar(conversationId);
            }
            ChatWindow.saveState();
        }
    },

    renderNoConversationState() {
        this.currentChatId = null;
        this.currentMetaData = null;
        this._savedInfoHtml = null;
        this._activeInfoPanel = null;
        this.resetMediaPanelState();
        this.getRuntimeCtx();
        this.applyThemeVisual(null);

        const img = document.getElementById('chat-view-img');
        const nameEl = document.getElementById('chat-view-name');
        const statusText = document.getElementById('chat-view-status-text');
        const statusDot = document.getElementById('chat-view-status-dot');
        const msgContainer = document.getElementById('chat-view-messages');

        if (img) img.src = window.APP_CONFIG?.DEFAULT_AVATAR;
        if (nameEl) nameEl.textContent = 'Select a conversation';
        if (statusText) statusText.textContent = '';
        if (statusDot) statusDot.classList.add('hidden');
        if (msgContainer) {
            msgContainer.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-tertiary);">Select a conversation from the sidebar</div>';
        }
        if (this.infoContent) {
            this.infoContent.innerHTML = '';
        }
        this.updateInputState();
    },

    applyConversationRemoved(conversationId, _reason = '') {
        const target = (conversationId || '').toLowerCase();
        if (!target) return;

        if ((this.currentChatId || '').toLowerCase() !== target) {
            return;
        }

        if (window.ChatTyping) {
            ChatTyping.cancelTyping(this.currentChatId);
            ChatTyping.hideIndicator('typing-indicator-page', this.currentChatId);
        }
        if (window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
            window.ChatRealtime.leaveConversation(this.currentChatId);
        }

        this.renderNoConversationState();
        if (window.ChatSidebar && typeof window.ChatSidebar.updateActiveId === 'function') {
            window.ChatSidebar.updateActiveId(null);
        }

        if (window.location.hash.startsWith('#/messages?id=')) {
            window.location.hash = '#/messages';
        }
    },

    applyMuteStatus(conversationId, isMuted) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;
        let changed = false;

        if ((this.currentChatId || '').toLowerCase() === target && this.currentMetaData) {
            const nextMuted = !!isMuted;
            if ((this.currentMetaData.isMuted ?? false) !== nextMuted) {
                this.currentMetaData.isMuted = nextMuted;
                changed = true;
            }
            this.renderInfoSidebar(this.currentMetaData);
        }

        return changed;
    },

    applyThemeVisual(theme) {
        const normalizedTheme = (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function')
            ? window.ChatCommon.resolveConversationTheme(theme)
            : (typeof theme === 'string' ? theme.trim().toLowerCase() : null);

        if (window.ChatCommon && typeof window.ChatCommon.applyConversationTheme === 'function') {
            if (this.mainArea) window.ChatCommon.applyConversationTheme(this.mainArea, normalizedTheme);
            if (this.infoSidebar) window.ChatCommon.applyConversationTheme(this.infoSidebar, normalizedTheme);
            // Apply to .main-content so its scrollbar follows chat theme
            const mainContent = document.querySelector('.main-content');
            if (mainContent && mainContent !== this.mainArea) {
                window.ChatCommon.applyConversationTheme(mainContent, normalizedTheme);
            }
            return normalizedTheme;
        }

        const targets = [this.mainArea, this.infoSidebar].filter(Boolean);
        targets.forEach(el => {
            if (!normalizedTheme) {
                el.style.removeProperty('--accent-primary');
                el.style.removeProperty('--chat-theme-bg');
                return;
            }
            el.style.setProperty('--accent-primary', normalizedTheme);
        });
        return normalizedTheme;
    },

    applyThemeStatus(conversationId, theme) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;

        if ((this.currentChatId || '').toLowerCase() !== target || !this.currentMetaData) {
            return false;
        }

        const normalizedTheme = (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function')
            ? window.ChatCommon.resolveConversationTheme(theme)
            : (typeof theme === 'string' ? theme.trim().toLowerCase() : null);
        const previousTheme = (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function')
            ? window.ChatCommon.resolveConversationTheme(this.currentMetaData.theme ?? this.currentMetaData.Theme)
            : (typeof (this.currentMetaData.theme ?? this.currentMetaData.Theme) === 'string'
                ? (this.currentMetaData.theme ?? this.currentMetaData.Theme).trim().toLowerCase()
                : null);

        this.currentMetaData.theme = normalizedTheme;
        this.currentMetaData.Theme = normalizedTheme;
        this.applyThemeVisual(normalizedTheme);
        this.renderInfoSidebar(this.currentMetaData);

        return previousTheme !== normalizedTheme;
    },

    applyNicknameUpdate(conversationId, accountId, nickname) {
        const convTarget = (conversationId || '').toLowerCase();
        const accTarget = (accountId || '').toLowerCase();
        if (!convTarget || !accTarget || !this.currentMetaData) return false;
        if ((this.currentChatId || '').toLowerCase() !== convTarget) return false;

        const normalizeNickname = (value) => {
            if (window.ChatCommon && typeof window.ChatCommon.normalizeNickname === 'function') {
                return window.ChatCommon.normalizeNickname(value);
            }
            if (typeof value !== 'string') return value ?? null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        };
        const normalizedNickname = normalizeNickname(nickname);
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const resolveBaseDisplayName = () => {
            if (accTarget === myId) {
                return localStorage.getItem('username') || localStorage.getItem('fullname') || 'You';
            }

            if (this.currentMetaData.otherMember &&
                (this.currentMetaData.otherMember.accountId || '').toLowerCase() === accTarget) {
                return this.currentMetaData.otherMember.username ||
                    this.currentMetaData.otherMember.Username ||
                    this.currentMetaData.otherMember.fullName ||
                    this.currentMetaData.otherMember.FullName ||
                    'User';
            }

            if (Array.isArray(this.currentMetaData.members)) {
                const member = this.currentMetaData.members.find(m =>
                    (m.accountId || m.AccountId || '').toString().toLowerCase() === accTarget
                );
                if (member) {
                    return member.username ||
                        member.userName ||
                        member.Username ||
                        member.UserName ||
                        member.fullName ||
                        member.FullName ||
                        member.displayName ||
                        member.DisplayName ||
                        'User';
                }
            }

            return 'User';
        };
        const fallbackDisplayName = resolveBaseDisplayName();

        let changed = false;
        if (accTarget === myId) {
            if (this.currentMetaData) this.currentMetaData.myNickname = normalizedNickname;
            changed = true;
        }

        if (this.currentMetaData.otherMember && (this.currentMetaData.otherMember.accountId || '').toLowerCase() === accTarget) {
            this.currentMetaData.otherMember.nickname = normalizedNickname;
            changed = true;
        }

        if (Array.isArray(this.currentMetaData.members)) {
            this.currentMetaData.members.forEach(m => {
                if ((m.accountId || m.AccountId || '').toString().toLowerCase() !== accTarget) return;
                const memberBaseName =
                    m.username ||
                    m.userName ||
                    m.Username ||
                    m.UserName ||
                    m.fullName ||
                    m.FullName ||
                    fallbackDisplayName;

                m.nickname = normalizedNickname;
                m.displayName = normalizedNickname || memberBaseName || 'User';
                changed = true;
            });
        }
        if (Array.isArray(this.currentMetaData.memberSeenStatuses)) {
            this.currentMetaData.memberSeenStatuses.forEach(m => {
                if ((m.accountId || m.AccountId || '').toString().toLowerCase() !== accTarget) return;
                m.displayName = normalizedNickname || fallbackDisplayName;
                changed = true;
            });
        }

        const msgContainer = document.getElementById('chat-view-messages');
        if (msgContainer) {
            msgContainer
                .querySelectorAll(`.seen-avatar-wrapper[data-account-id="${accTarget}"] .seen-avatar-name`)
                .forEach(el => {
                    el.textContent = normalizedNickname || fallbackDisplayName;
                });
        }

        if (changed) {
            this.renderHeader(this.currentMetaData);
            this.renderInfoSidebar(this.currentMetaData);
        }
        return changed;
    },

    async toggleMuteCurrentConversation() {
        if (!this.currentChatId) return;

        const conversationId = this.currentChatId;
        const previous = !!(this.currentMetaData?.isMuted ?? false);
        const nextMuted = !previous;

        this.applyMuteStatus(conversationId, nextMuted);
        if (window.ChatSidebar && typeof window.ChatSidebar.setMuteStatus === 'function') {
            window.ChatSidebar.setMuteStatus(conversationId, nextMuted, { forceRender: true });
        }
        if (window.ChatWindow && typeof window.ChatWindow.setMuteStatus === 'function') {
            window.ChatWindow.setMuteStatus(conversationId, nextMuted);
        }

        try {
            const res = await window.API.Conversations.updateMute(conversationId, nextMuted);
            if (!res.ok) {
                this.applyMuteStatus(conversationId, previous);
                if (window.ChatSidebar && typeof window.ChatSidebar.setMuteStatus === 'function') {
                    window.ChatSidebar.setMuteStatus(conversationId, previous, { forceRender: true });
                }
                if (window.ChatWindow && typeof window.ChatWindow.setMuteStatus === 'function') {
                    window.ChatWindow.setMuteStatus(conversationId, previous);
                }
                if (window.toastError) window.toastError('Failed to update mute status');
                return;
            }
            if (window.toastSuccess) window.toastSuccess(nextMuted ? 'Conversation muted' : 'Conversation unmuted');
        } catch (error) {
            console.error('Failed to update mute status:', error);
            this.applyMuteStatus(conversationId, previous);
            if (window.ChatSidebar && typeof window.ChatSidebar.setMuteStatus === 'function') {
                window.ChatSidebar.setMuteStatus(conversationId, previous, { forceRender: true });
            }
            if (window.ChatWindow && typeof window.ChatWindow.setMuteStatus === 'function') {
                window.ChatWindow.setMuteStatus(conversationId, previous);
            }
            if (window.toastError) window.toastError('Failed to update mute status');
        }
    },

    openPinnedMessagesCurrentConversation() {
        const conversationId = (this.currentChatId || '').toString().toLowerCase();
        if (!conversationId) return;
        if (!window.ChatActions || typeof window.ChatActions.showPinnedMessages !== 'function') {
            if (window.toastError) window.toastError('Pinned messages are unavailable');
            return;
        }

        const title = (typeof window.ChatActions.getPinnedConversationTitle === 'function')
            ? window.ChatActions.getPinnedConversationTitle(conversationId)
            : 'Pinned messages';
        window.ChatActions.showPinnedMessages(conversationId, { title });
    },

    resetMediaPanelState(conversationId = null) {
        const targetConversationId = (conversationId || this.currentChatId || '').toString().toLowerCase() || null;
        const pageSize = Number(window.APP_CONFIG?.CHAT_MEDIA_PAGE_SIZE) || this._mediaPanel?.pageSize || 60;
        this._mediaPanel = {
            conversationId: targetConversationId,
            page: 1,
            hasMore: true,
            isLoading: false,
            items: [],
            keySet: new Set(),
            scrollTop: 0,
            pageSize
        };
    },

    openMediaPanel() {
        if (!this.currentChatId) return;

        if (this.infoSidebar?.classList.contains('hidden')) {
            this.infoSidebar.classList.remove('hidden');
            const infoBtn = document.getElementById('chat-info-btn');
            if (infoBtn) infoBtn.classList.add('active');
        }

        const infoContent = document.getElementById('chat-info-content');
        if (!infoContent) return;

        this._savedInfoHtml = infoContent.innerHTML;
        this._activeInfoPanel = 'media';
        this.resetMediaPanelState(this.currentChatId);
        this._mediaPanel.activeTab = 'media';

        infoContent.innerHTML = `
            <div class="chat-media-panel-inline">
                <div class="chat-media-header">
                    <button class="chat-media-back-btn" id="chat-media-back-btn" title="Close media panel">
                        <i data-lucide="arrow-left"></i>
                    </button>
                    <span class="chat-media-title">Media and files</span>
                </div>
                <div class="chat-media-tabs">
                    <button class="chat-media-tab active" id="chat-media-tab-media" data-tab="media">Media files</button>
                    <button class="chat-media-tab" id="chat-media-tab-file" data-tab="file">Files</button>
                    <div class="chat-media-tab-indicator" id="chat-media-tab-indicator"></div>
                </div>
                <div class="chat-media-results" id="chat-media-results"></div>
            </div>
        `;

        if (window.lucide) lucide.createIcons({ container: infoContent });

        const backBtn = infoContent.querySelector('#chat-media-back-btn');
        if (backBtn) backBtn.onclick = () => this.closeMediaPanel();

        const tabMedia = infoContent.querySelector('#chat-media-tab-media');
        const tabFile = infoContent.querySelector('#chat-media-tab-file');
        if (tabMedia) tabMedia.onclick = () => this.switchMediaPanelTab('media');
        if (tabFile) tabFile.onclick = () => this.switchMediaPanelTab('file');

        const resultsEl = infoContent.querySelector('#chat-media-results');
        if (resultsEl) {
            resultsEl.onscroll = () => {
                const state = this._mediaPanel;
                if (!state) return;
                state.scrollTop = resultsEl.scrollTop;
                if (state.activeTab !== 'media' || state.isLoading || !state.hasMore) return;
                if (resultsEl.scrollHeight - resultsEl.scrollTop - resultsEl.clientHeight <= 180) {
                    this.loadMoreConversationMedia();
                }
            };
        }

        this.switchMediaPanelTab('media');
    },

    closeMediaPanel() {
        const infoContent = document.getElementById('chat-info-content');
        if (!infoContent) return;

        const resultsEl = infoContent.querySelector('#chat-media-results');
        if (resultsEl && this._mediaPanel) {
            this._mediaPanel.scrollTop = resultsEl.scrollTop;
        }

        if (this._savedInfoHtml !== null) {
            infoContent.innerHTML = `<div class="chat-info-main-reveal">${this._savedInfoHtml}</div>`;
            this._savedInfoHtml = null;
            if (window.lucide) lucide.createIcons({ container: infoContent });
            this._reattachInfoSidebarListeners();
        }
        this._activeInfoPanel = null;
    },

    switchMediaPanelTab(tabKey = 'media') {
        const state = this._mediaPanel;
        const infoContent = document.getElementById('chat-info-content');
        if (!state || !infoContent) return;

        const normalizedTab = (tabKey || '').toLowerCase() === 'file' ? 'file' : 'media';
        state.activeTab = normalizedTab;

        infoContent.querySelectorAll('.chat-media-tab').forEach((tabEl) => {
            const isActive = (tabEl.dataset.tab || '').toLowerCase() === normalizedTab;
            tabEl.classList.toggle('active', isActive);
        });

        // Update sliding indicator position
        const activeTabEl = infoContent.querySelector(`.chat-media-tab[data-tab="${normalizedTab}"]`);
        const indicator = infoContent.querySelector('#chat-media-tab-indicator');
        if (activeTabEl && indicator) {
            indicator.style.width = `${activeTabEl.offsetWidth}px`;
            indicator.style.left = `${activeTabEl.offsetLeft}px`;
        }

        if (normalizedTab === 'file') {
            const resultsEl = document.getElementById('chat-media-results');
            if (resultsEl) {
                resultsEl.innerHTML = `
                    <div class="chat-media-empty-state">
                        <i data-lucide="file-text"></i>
                        <p>File gallery will be added in a next update.</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons({ container: resultsEl });
            }
            return;
        }

        this.renderMediaPanelResults({ preserveScrollTop: state.scrollTop });
        if (state.items.length === 0 && state.hasMore && !state.isLoading) {
            this.ensureConversationMediaAtIndex(0);
        }
    },

    _extractConversationMediaItems(rawItems) {
        if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
        const normalized = [];

        rawItems.forEach((item, itemIndex) => {
            const mediaType = Number(item?.mediaType ?? item?.MediaType ?? 0);
            if (mediaType !== 0 && mediaType !== 1) return;

            const mediaUrl = item?.mediaUrl || item?.MediaUrl || '';
            if (!mediaUrl) return;

            const sentAt = item?.sentAt || item?.SentAt || item?.createdAt || item?.CreatedAt || null;
            const sentTime = sentAt ? new Date(sentAt).getTime() : 0;
            const messageId = (item?.messageId || item?.MessageId || '').toString().toLowerCase();
            const messageMediaId = (item?.messageMediaId || item?.MessageMediaId || '').toString().toLowerCase();
            const key = messageMediaId || `${messageId}:${mediaUrl}:${itemIndex}`;
            const thumbnailUrl = item?.thumbnailUrl || item?.ThumbnailUrl || mediaUrl;

            normalized.push({
                key,
                messageId,
                messageMediaId,
                mediaUrl,
                thumbnailUrl,
                mediaType,
                sentAt,
                sentTime: Number.isFinite(sentTime) ? sentTime : 0
            });
        });

        return normalized;
    },

    removeRecalledMediaFromPanel(messageId, conversationId = '') {
        const state = this._mediaPanel;
        const normalizedMessageId = (messageId || '').toString().toLowerCase();
        if (!state || !normalizedMessageId || !Array.isArray(state.items) || state.items.length === 0) return 0;

        const normalizedConversationId = (conversationId || '').toString().toLowerCase();
        const stateConversationId = (state.conversationId || '').toString().toLowerCase();
        if (normalizedConversationId && stateConversationId && normalizedConversationId !== stateConversationId) {
            return 0;
        }

        let removedCount = 0;
        const nextItems = [];
        const nextKeySet = new Set();

        state.items.forEach((item) => {
            const itemMessageId = (item?.messageId || item?.MessageId || '').toString().toLowerCase();
            if (itemMessageId === normalizedMessageId) {
                removedCount += 1;
                return;
            }
            nextItems.push(item);
            if (item?.key) nextKeySet.add(item.key);
        });

        if (removedCount === 0) return 0;

        state.items = nextItems;
        state.keySet = nextKeySet;

        if (state.activeTab === 'media' && this._activeInfoPanel === 'media') {
            const resultsEl = document.getElementById('chat-media-results');
            const preserveScrollTop = resultsEl ? resultsEl.scrollTop : state.scrollTop;
            this.renderMediaPanelResults({ preserveScrollTop });
        }

        return removedCount;
    },

    renderMediaPanelResults({ preserveScrollTop = null } = {}) {
        const state = this._mediaPanel;
        const resultsEl = document.getElementById('chat-media-results');
        if (!state || !resultsEl || state.activeTab !== 'media') return;

        if (state.items.length === 0 && state.isLoading) {
            resultsEl.innerHTML = `
                <div class="chat-media-loading-state">
                    <div class="spinner chat-spinner"></div>
                    <p>Loading media...</p>
                </div>
            `;
            return;
        }

        if (state.items.length === 0 && !state.hasMore) {
            resultsEl.innerHTML = `
                <div class="chat-media-empty-state">
                    <i data-lucide="image-off"></i>
                    <p>No media files in this conversation yet.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons({ container: resultsEl });
            return;
        }

        if (state.items.length === 0 && state.hasMore) {
            resultsEl.innerHTML = `
                <div class="chat-media-loading-state">
                    <div class="spinner chat-spinner"></div>
                    <p>Looking for media files...</p>
                </div>
            `;
            return;
        }

        let animatedCount = 0;
        const cells = state.items.map((item, index) => {
            const safeThumb = (item.thumbnailUrl || item.mediaUrl || '').replace(/"/g, '&quot;');
            const safeMedia = (item.mediaUrl || '').replace(/"/g, '&quot;');
            const shouldAnimate = !!item.animateOnRender;
            const revealClass = shouldAnimate ? ' chat-media-thumb-reveal' : '';
            const revealOrder = shouldAnimate ? Math.min(animatedCount++, 24) : 0;
            const revealStyle = shouldAnimate
                ? ` style="--media-reveal-delay:${revealOrder * 30}ms"`
                : '';

            if (item.mediaType === 1) {
                return `
                    <button class="chat-media-thumb chat-media-thumb-video${revealClass}"${revealStyle} onclick="ChatPage.openConversationMediaPreview(${index})" title="Open media">
                        <video src="${safeMedia}" muted playsinline preload="metadata"></video>
                        <span class="chat-media-video-badge"><i data-lucide="play"></i></span>
                    </button>
                `;
            }

            return `
                <button class="chat-media-thumb${revealClass}"${revealStyle} onclick="ChatPage.openConversationMediaPreview(${index})" title="Open media">
                    <img src="${safeThumb}" alt="media" loading="lazy">
                </button>
            `;
        }).join('');

        const html = `<div class="chat-media-grid">${cells}</div>`;

        const footer = state.isLoading
            ? `<div class="chat-media-inline-loader"><div class="spinner chat-spinner"></div><span>Loading more...</span></div>`
            : (!state.hasMore ? `<div class="chat-media-end">All media loaded</div>` : '');

        resultsEl.innerHTML = `${html}${footer}`;
        if (window.lucide) lucide.createIcons({ container: resultsEl });

        if (state.items.some(item => item?.animateOnRender)) {
            requestAnimationFrame(() => {
                state.items.forEach((item) => {
                    if (item) item.animateOnRender = false;
                });
            });
        }

        if (preserveScrollTop !== null) {
            resultsEl.scrollTop = preserveScrollTop;
            state.scrollTop = preserveScrollTop;
        } else if (state.scrollTop > 0) {
            resultsEl.scrollTop = state.scrollTop;
        }
    },

    async loadMoreConversationMedia() {
        const state = this._mediaPanel;
        if (!state || state.isLoading || !state.hasMore || !this.currentChatId) return false;
        if ((state.conversationId || '') !== (this.currentChatId || '').toString().toLowerCase()) return false;

        const resultsEl = document.getElementById('chat-media-results');
        const preserveScrollTop = resultsEl ? resultsEl.scrollTop : state.scrollTop;

        state.isLoading = true;
        if (state.activeTab === 'media') {
            this.renderMediaPanelResults({ preserveScrollTop });
        }

        let loadedAnyItem = false;
        try {
            const res = await window.API.Conversations.getMedia(this.currentChatId, state.page, state.pageSize);
            if (!res.ok) return false;

            const data = await res.json();
            const rawItems = data?.items || [];
            const extractedItems = this._extractConversationMediaItems(rawItems);

            extractedItems.forEach((item) => {
                if (state.keySet.has(item.key)) return;
                item.animateOnRender = true;
                state.keySet.add(item.key);
                state.items.push(item);
                loadedAnyItem = true;
            });

            if (rawItems.length < state.pageSize) {
                state.hasMore = false;
            } else if (typeof data?.hasNextPage === 'boolean') {
                state.hasMore = data.hasNextPage;
            }
            state.page += 1;
            return loadedAnyItem;
        } catch (error) {
            console.error('Failed to load conversation media:', error);
            return false;
        } finally {
            state.isLoading = false;
            if (state.activeTab === 'media') {
                this.renderMediaPanelResults({ preserveScrollTop });
            }
        }
    },

    async ensureConversationMediaAtIndex(targetIndex) {
        const state = this._mediaPanel;
        const normalizedTarget = Number(targetIndex);
        if (!state || !Number.isFinite(normalizedTarget)) return false;

        if (normalizedTarget < state.items.length) return true;

        while (normalizedTarget >= state.items.length && state.hasMore) {
            const beforeCount = state.items.length;
            const loaded = await this.loadMoreConversationMedia();
            if (!loaded && state.items.length === beforeCount) {
                break;
            }
        }

        return normalizedTarget < state.items.length;
    },

    openConversationMediaPreview(startIndex = 0) {
        const state = this._mediaPanel;
        if (!state || !Array.isArray(state.items) || state.items.length === 0) return;

        const index = Number(startIndex);
        if (!Number.isFinite(index) || index < 0 || index >= state.items.length) return;

        if (typeof window.previewMedia !== 'function') return;

        window.previewMedia('', index, state.items, {
            source: 'conversation-media-panel',
            conversationId: (this.currentChatId || '').toString().toLowerCase(),
            loop: false,
            thumbnailMode: 'windowed',
            thumbnailWindowSize: 7,
            getMediaList: () => this._mediaPanel?.items || [],
            canNavigatePrev: ({ currentIndex }) => currentIndex > 0,
            canNavigateNext: ({ currentIndex }) => {
                const latest = this._mediaPanel;
                if (!latest) return false;
                return currentIndex < latest.items.length - 1 || latest.hasMore;
            },
            requestNext: async ({ currentIndex }) => this.ensureConversationMediaAtIndex(currentIndex + 1)
        });
    },

    // --- Message Search ---
    searchPage: 1,
    searchKeyword: '',
    isSearching: false,
    hasMoreSearch: false,
    _searchDebounceTimer: null,
    _savedInfoHtml: null,
    _activeInfoPanel: null,
    _mediaPanel: {
        conversationId: null,
        page: 1,
        hasMore: true,
        isLoading: false,
        items: [],
        keySet: new Set(),
        scrollTop: 0,
        pageSize: window.APP_CONFIG?.CHAT_MEDIA_PAGE_SIZE || 60
    },

    openSearchPanel() {
        if (!this.currentChatId) return;
        this._activeInfoPanel = 'search';

        // Ensure info sidebar is visible
        if (this.infoSidebar?.classList.contains('hidden')) {
            this.infoSidebar.classList.remove('hidden');
            const infoBtn = document.getElementById('chat-info-btn');
            if (infoBtn) infoBtn.classList.add('active');
        }

        const infoContent = document.getElementById('chat-info-content');
        if (!infoContent) return;

        // Save current info HTML so we can restore on close
        this._savedInfoHtml = infoContent.innerHTML;

        // Reset search state
        this.searchKeyword = '';
        this.searchPage = 1;
        this.isSearching = false;
        this.hasMoreSearch = false;

        infoContent.innerHTML = `
            <div class="chat-search-panel-inline">
                <div class="chat-search-header">
                    <button class="chat-search-back-btn" id="chat-search-back-btn" title="Back">
                        <i data-lucide="arrow-left"></i>
                    </button>
                    <span class="chat-search-title">Search</span>
                </div>
                <div class="chat-search-input-wrapper">
                    <i data-lucide="search" class="chat-search-icon"></i>
                    <input type="text" class="chat-search-input" id="chat-search-input" placeholder="Search in conversation..." autocomplete="off">
                    <span class="chat-search-count hidden" id="chat-search-count"></span>
                    <button class="chat-search-clear-btn hidden" id="chat-search-clear-btn" title="Clear">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="chat-search-results" id="chat-search-results">
                    <div class="chat-search-empty">
                        <i data-lucide="search" style="width: 40px; height: 40px; opacity: 0.18;"></i>
                        <p>Enter keywords to search</p>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons({ container: infoContent });

        const input = infoContent.querySelector('#chat-search-input');
        const clearBtn = infoContent.querySelector('#chat-search-clear-btn');
        const backBtn = infoContent.querySelector('#chat-search-back-btn');

        requestAnimationFrame(() => input?.focus());

        input.oninput = (e) => {
            const val = e.target.value.trim();
            clearBtn.classList.toggle('hidden', val.length === 0);

            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = setTimeout(() => {
                this.performSearch(val);
            }, 400);
        };

        clearBtn.onclick = () => {
            input.value = '';
            input.focus();
            clearBtn.classList.add('hidden');
            this.performSearch('');
        };

        backBtn.onclick = () => this.closeSearchPanel();

        // Scroll-based load more
        const resultsEl = infoContent.querySelector('#chat-search-results');
        if (resultsEl) {
            resultsEl.onscroll = () => {
                if (this.isSearching || !this.hasMoreSearch) return;
                if (resultsEl.scrollHeight - resultsEl.scrollTop - resultsEl.clientHeight <= 80) {
                    this.performSearch(this.searchKeyword, true);
                }
            };
        }
    },

    closeSearchPanel() {
        const infoContent = document.getElementById('chat-info-content');
        if (!infoContent) return;

        // Restore original info sidebar content
        if (this._savedInfoHtml !== null) {
            infoContent.innerHTML = `<div class="chat-info-main-reveal">${this._savedInfoHtml}</div>`;
            this._savedInfoHtml = null;
            if (window.lucide) lucide.createIcons({ container: infoContent });
            // Re-attach event listeners for info sidebar buttons
            this._reattachInfoSidebarListeners();
        }

        this.searchKeyword = '';
        this.searchPage = 1;
        this.isSearching = false;
        this.hasMoreSearch = false;
        this._activeInfoPanel = null;
    },

    /**
     * Re-attach event listeners for info sidebar buttons after restoring HTML.
     * This mirrors the event binding done at the end of renderInfoSidebar().
     */
    _reattachInfoSidebarListeners() {
        const muteBtn = document.getElementById('chat-info-mute-btn');
        if (muteBtn) muteBtn.onclick = () => this.toggleMuteCurrentConversation();

        const muteDetailBtn = document.getElementById('chat-info-mute-detail-btn');
        if (muteDetailBtn) muteDetailBtn.onclick = () => this.toggleMuteCurrentConversation();

        const deleteBtn = document.getElementById('chat-info-delete-conversation-btn');
        if (deleteBtn) deleteBtn.onclick = () => this.softDeleteCurrentConversation();

        const editNicknamesBtn = document.getElementById('chat-info-edit-nicknames-btn');
        if (editNicknamesBtn) editNicknamesBtn.onclick = () => this.promptEditNicknames();

        const changeThemeBtn = document.getElementById('chat-info-change-theme-btn');
        if (changeThemeBtn) changeThemeBtn.onclick = () => this.promptChangeThemeCurrentConversation();

        const viewPinnedBtn = document.getElementById('chat-info-view-pinned-btn');
        if (viewPinnedBtn) viewPinnedBtn.onclick = () => this.openPinnedMessagesCurrentConversation();

        const mediaBtn = document.getElementById('chat-info-open-media-btn');
        if (mediaBtn) mediaBtn.onclick = () => this.openMediaPanel();

        const filesBtn = document.getElementById('chat-info-open-files-btn');
        if (filesBtn) filesBtn.onclick = () => window.toastInfo?.('File gallery will be added in a next update.');

        const infoContent = document.getElementById('chat-info-content');
        if (infoContent) {
            infoContent.querySelectorAll('.chat-info-member-edit').forEach(el => {
                el.onclick = () => {
                    const accountId = (el.dataset.accountId || '').toLowerCase();
                    const displayName = el.dataset.displayName || 'User';
                    const nickname = el.dataset.nickname || '';
                    this.promptEditNickname(accountId, displayName, nickname);
                };
            });
        }
    },

    /**
     * Build a smart keyword-in-context (KWIC) snippet.
     * If the keyword is near the start, show from the start.
     * Otherwise, show a window around the first keyword occurrence.
     * Returns HTML with keyword highlighted.
     */
    _buildSearchSnippet(rawContent, keyword, maxLen = 100) {
        if (!rawContent) return '';
        const escaped = escapeHtml(rawContent);
        if (!keyword || keyword.length < 2) return escaped;

        // Escape regex special characters
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const words = keyword.split(/\s+/).filter(w => w.length >= 2);
        if (words.length === 0) return escaped;

        // Find the earliest position of any keyword word (case-insensitive, in original text)
        const lowerContent = rawContent.toLowerCase();
        let earliestPos = -1;
        let matchedWord = '';
        for (const word of words) {
            const idx = lowerContent.indexOf(word.toLowerCase());
            if (idx !== -1 && (earliestPos === -1 || idx < earliestPos)) {
                earliestPos = idx;
                matchedWord = word;
            }
        }

        let snippet;
        if (earliestPos === -1) {
            // No match found in text, show beginning
            snippet = rawContent.length > maxLen
                ? rawContent.substring(0, maxLen) + '...'
                : rawContent;
        } else {
            // Build a window around the keyword
            const contextBefore = 20;
            let start = Math.max(0, earliestPos - contextBefore);
            let end = Math.min(rawContent.length, start + maxLen);

            // Adjust end if content is shorter
            if (end - start < maxLen && start > 0) {
                start = Math.max(0, end - maxLen);
            }

            snippet = '';
            if (start > 0) snippet += '...';
            snippet += rawContent.substring(start, end);
            if (end < rawContent.length) snippet += '...';
        }

        // Now escape and highlight
        let result = escapeHtml(snippet);
        for (const word of words) {
            const regex = new RegExp(`(${escapeRegex(escapeHtml(word))})`, 'gi');
            result = result.replace(regex, '<mark class="chat-search-highlight">$1</mark>');
        }
        return result;
    },

    async performSearch(keyword, isLoadMore = false) {
        if (!keyword || keyword.length < 1) {
            this.searchKeyword = '';
            this.searchPage = 1;
            const resultsTarget = document.getElementById('chat-search-results');
            const countEl = document.getElementById('chat-search-count');
            if (countEl) { countEl.textContent = ''; countEl.classList.add('hidden'); }
            if (resultsTarget) {
                resultsTarget.innerHTML = `
                    <div class="chat-search-empty">
                        <i data-lucide="search" style="width: 40px; height: 40px; opacity: 0.18;"></i>
                        <p>Enter keywords to search</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons({ container: resultsTarget });
            }
            return;
        }

        if (keyword.length < 2) return;

        const pageSize = window.APP_CONFIG?.CHAT_SEARCH_PAGE_SIZE || 20;

        if (isLoadMore) {
            this.searchPage++;
        } else {
            this.searchPage = 1;
            this.searchKeyword = keyword;
            const resultsTarget = document.getElementById('chat-search-results');
            if (resultsTarget) {
                resultsTarget.innerHTML = `
                    <div class="chat-search-loading">
                        <div class="spinner chat-spinner"></div>
                        <p>Searching...</p>
                    </div>
                `;
            }
        }

        this.isSearching = true;
        try {
            const res = await window.API.Conversations.searchMessages(this.currentChatId, this.searchKeyword, this.searchPage, pageSize);
            if (res.ok) {
                const data = await res.json();
                this.hasMoreSearch = data.hasNextPage;
                this.renderSearchResults(data.items, data.totalItems, isLoadMore);
            } else {
                window.toastError?.('Search failed');
            }
        } catch (err) {
            console.error('Search error:', err);
            window.toastError?.('Search error');
        } finally {
            this.isSearching = false;
        }
    },

    renderSearchResults(items, totalCount, isLoadMore) {
        const resultsTarget = document.getElementById('chat-search-results');
        if (!resultsTarget) return;

        // Update count badge
        const countEl = document.getElementById('chat-search-count');
        if (countEl) {
            if (totalCount > 0) {
                countEl.textContent = `${totalCount} result${totalCount > 1 ? 's' : ''}`;
                countEl.classList.remove('hidden');
            } else {
                countEl.textContent = '';
                countEl.classList.add('hidden');
            }
        }

        if (!isLoadMore) {
            resultsTarget.innerHTML = '';
        } else {
            // Remove previous loading indicator
            const oldLoader = resultsTarget.querySelector('.chat-search-loading');
            if (oldLoader) oldLoader.remove();
        }

        if (items.length === 0 && !isLoadMore) {
            resultsTarget.innerHTML = `
                <div class="chat-search-empty">
                    <i data-lucide="frown" style="width: 40px; height: 40px; opacity: 0.18;"></i>
                    <p>No results for "${escapeHtml(this.searchKeyword)}"</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons({ container: resultsTarget });
            return;
        }

        const container = document.createElement('div');
        container.className = 'chat-search-list';

        items.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'chat-search-item';

            const sender = msg.sender || msg.Sender || {};
            const avatar = sender.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR;
            const name = sender.username || sender.fullName || 'User';
            const messageId = (msg.messageId || msg.MessageId || msg.id || msg.Id || '').toString().toLowerCase();
            const messageContent = msg.content ?? msg.Content ?? '';
            const messageSentAt = msg.sentAt || msg.SentAt;

            // Build smart snippet with keyword highlighted
            const contentHtml = this._buildSearchSnippet(messageContent, this.searchKeyword);

            const timeLabel = window.PostUtils?.timeAgo ? window.PostUtils.timeAgo(messageSentAt) : '';

            item.innerHTML = `
                <img class="chat-search-item-avatar" src="${avatar}" alt="" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                <div class="chat-search-item-info">
                    <div class="chat-search-item-name">${escapeHtml(name)}</div>
                    <div class="chat-search-item-content">${contentHtml}</div>
                    <div class="chat-search-item-time">${escapeHtml(timeLabel)}</div>
                </div>
            `;

            item.onclick = () => {
                if (!messageId) {
                    window.toastInfo && window.toastInfo('Could not locate this message.');
                    return;
                }
                if (window.ChatActions && typeof window.ChatActions.jumpToMessage === 'function') {
                    window.ChatActions.jumpToMessage(this.currentChatId || '', messageId);
                }
            };

            container.appendChild(item);
        });

        resultsTarget.appendChild(container);

        if (window.lucide) lucide.createIcons({ container: resultsTarget });
    },


    async promptChangeThemeCurrentConversation() {
        if (!this.currentChatId || !this.currentMetaData) return;
        const conversationId = this.currentChatId;
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId);
        if (!isGuid) {
            if (window.toastInfo) window.toastInfo('Theme can be changed after conversation is created');
            return;
        }

        const getNormalizedTheme = (value) => {
            if (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function') {
                return window.ChatCommon.resolveConversationTheme(value);
            }
            if (typeof value !== 'string') return null;
            const trimmed = value.trim().toLowerCase();
            return trimmed.length ? trimmed : null;
        };

        const previousTheme = getNormalizedTheme(this.currentMetaData.theme ?? this.currentMetaData.Theme);
        if (!window.ChatCommon || typeof window.ChatCommon.showThemePicker !== 'function') {
            if (window.toastError) window.toastError('Theme picker is unavailable');
            return;
        }

        window.ChatCommon.showThemePicker({
            title: 'Change theme',
            currentTheme: previousTheme,
            onSelect: async (nextTheme) => {
                const normalizedNextTheme = getNormalizedTheme(nextTheme);
                if (normalizedNextTheme === previousTheme) return;

                this.applyThemeStatus(conversationId, normalizedNextTheme);
                if (window.ChatSidebar && typeof window.ChatSidebar.applyThemeUpdate === 'function') {
                    window.ChatSidebar.applyThemeUpdate(conversationId, normalizedNextTheme);
                }
                if (window.ChatWindow && typeof window.ChatWindow.setThemeStatus === 'function') {
                    window.ChatWindow.setThemeStatus(conversationId, normalizedNextTheme);
                }

                try {
                    const res = await window.API.Conversations.updateTheme(conversationId, normalizedNextTheme);
                    if (!res.ok) {
                        this.applyThemeStatus(conversationId, previousTheme);
                        if (window.ChatSidebar && typeof window.ChatSidebar.applyThemeUpdate === 'function') {
                            window.ChatSidebar.applyThemeUpdate(conversationId, previousTheme);
                        }
                        if (window.ChatWindow && typeof window.ChatWindow.setThemeStatus === 'function') {
                            window.ChatWindow.setThemeStatus(conversationId, previousTheme);
                        }
                        if (window.toastError) window.toastError('Failed to update theme');
                        return;
                    }
                    if (window.toastSuccess) window.toastSuccess('Theme updated');
                } catch (error) {
                    console.error('Failed to update theme:', error);
                    this.applyThemeStatus(conversationId, previousTheme);
                    if (window.ChatSidebar && typeof window.ChatSidebar.applyThemeUpdate === 'function') {
                        window.ChatSidebar.applyThemeUpdate(conversationId, previousTheme);
                    }
                    if (window.ChatWindow && typeof window.ChatWindow.setThemeStatus === 'function') {
                        window.ChatWindow.setThemeStatus(conversationId, previousTheme);
                    }
                    if (window.toastError) window.toastError('Failed to update theme');
                }
            }
        });
    },

    async softDeleteCurrentConversation() {
        if (!this.currentChatId) return;
        const conversationId = this.currentChatId;

        ChatCommon.showConfirm({
            title: 'Delete chat history?',
            message: 'This will remove the conversation from your list. Other members will still see the history.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true,
            onConfirm: async () => {
                try {
                    const res = await window.API.Conversations.deleteHistory(conversationId);
                    if (!res.ok) {
                        if (window.toastError) window.toastError('Failed to delete conversation');
                        return;
                    }

                    if (window.ChatSidebar && typeof window.ChatSidebar.removeConversation === 'function') {
                        window.ChatSidebar.removeConversation(conversationId);
                    }
                    if (window.ChatWindow && typeof window.ChatWindow.removeConversation === 'function') {
                        window.ChatWindow.removeConversation(conversationId);
                    }
                    this.applyConversationRemoved(conversationId, 'soft-delete');

                    if (typeof scheduleGlobalUnreadRefresh === 'function') {
                        scheduleGlobalUnreadRefresh();
                    }
                    if (window.toastSuccess) window.toastSuccess('Conversation removed from your sidebar');
                } catch (error) {
                    console.error('Failed to soft delete conversation:', error);
                    if (window.toastError) window.toastError('Failed to delete conversation');
                }
            }
        });
    },

    async promptEditNickname(accountId, displayName = 'User', currentNickname = null) {
        if (!this.currentChatId || !accountId) return;
        const normalizeNickname = (value) => {
            if (window.ChatCommon && typeof window.ChatCommon.normalizeNickname === 'function') {
                return window.ChatCommon.normalizeNickname(value);
            }
            if (typeof value !== 'string') return value ?? null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        };
        const truncateDisplayText = (value, maxLength) => {
            if (window.ChatCommon && typeof window.ChatCommon.truncateDisplayText === 'function') {
                return window.ChatCommon.truncateDisplayText(value, maxLength);
            }
            const raw = value === null || value === undefined ? '' : String(value);
            const limit = Number(maxLength);
            if (!Number.isFinite(limit) || limit <= 0 || raw.length <= limit) {
                return raw;
            }
            return raw.substring(0, Math.floor(limit)) + '...';
        };
        const nicknameMaxLength = window.APP_CONFIG?.MAX_CHAT_NICKNAME_LENGTH || 50;
        const currentLabel = normalizeNickname(currentNickname) || '';
        const promptDisplayName = truncateDisplayText(displayName || 'User', 40);

        ChatCommon.showPrompt({
            title: `Edit nickname for ${promptDisplayName}`,
            placeholder: 'Enter nickname...',
            value: currentLabel,
            maxLength: nicknameMaxLength,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: async (input) => {
                const nextNickname = normalizeNickname(input);
                const payload = {
                    accountId,
                    nickname: nextNickname
                };

                try {
                    const res = await window.API.Conversations.updateNickname(this.currentChatId, payload);
                    if (!res.ok) {
                        if (window.toastError) window.toastError('Failed to update nickname');
                        return;
                    }
                    this.applyNicknameUpdate(this.currentChatId, accountId, payload.nickname);
                    if (window.ChatSidebar && typeof window.ChatSidebar.applyNicknameUpdate === 'function') {
                        window.ChatSidebar.applyNicknameUpdate(this.currentChatId, accountId, payload.nickname);
                    }
                    if (window.ChatWindow && typeof window.ChatWindow.applyNicknameUpdate === 'function') {
                        window.ChatWindow.applyNicknameUpdate(this.currentChatId, accountId, payload.nickname);
                    }
                    if (window.toastSuccess) window.toastSuccess('Nickname updated');
                } catch (error) {
                    console.error('Failed to update nickname:', error);
                    if (window.toastError) window.toastError('Failed to update nickname');
                }
            }
        });
    },

    async promptEditNicknames() {
        if (!this.currentChatId || !this.currentMetaData) return;

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const myName = localStorage.getItem('fullname') || 'You';
        const myUsername = localStorage.getItem('username') || '';
        const myAvatar = localStorage.getItem('avatarUrl') || window.APP_CONFIG?.DEFAULT_AVATAR;
        const normalizeMember = (member, options = {}) => {
            if (window.ChatCommon && typeof window.ChatCommon.normalizeConversationMember === 'function') {
                return window.ChatCommon.normalizeConversationMember(member, options);
            }

            const normalized = member || {};
            const accountId = (normalized.accountId || normalized.AccountId || '').toString().toLowerCase();
            const displayName =
                normalized.displayName ||
                normalized.DisplayName ||
                normalized.fullName ||
                normalized.FullName ||
                '';
            const nickname = normalized.nickname ?? normalized.Nickname ?? null;
            const usernameRaw =
                normalized.username ||
                normalized.userName ||
                normalized.Username ||
                normalized.UserName ||
                '';
            const username =
                usernameRaw ||
                ((options.fallbackUsernameToDisplayName && displayName && !nickname) ? displayName : '');

            return {
                accountId,
                displayName,
                username,
                avatarUrl: normalized.avatarUrl || normalized.AvatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR,
                nickname
            };
        };
        
        let members = [];
        // Priority 1: Use the members list from metaData (contains all info if available)
        if (this.currentMetaData.members && this.currentMetaData.members.length > 0) {
            members = this.currentMetaData.members.map(m =>
                normalizeMember(m, { fallbackUsernameToDisplayName: true })
            );
        } 
        
        // Priority 2: Ensure I and the other member are in the list if it's a private chat or if members list is incomplete
        if (!members.length) {
            if (this.currentMetaData.otherMember) {
                const normalizedOther = normalizeMember(this.currentMetaData.otherMember, {
                    fallbackUsernameToDisplayName: true
                });
                if (!normalizedOther.displayName) normalizedOther.displayName = 'User';
                members.push(normalizedOther);
            }
        }

        // Always ensure I am in the list
        if (!members.find(m => (m.accountId || '').toLowerCase() === myId)) {
            members.unshift(normalizeMember({
                accountId: myId,
                displayName: myName,
                username: myUsername,
                avatarUrl: myAvatar,
                nickname: this.currentMetaData.myNickname || members.find(m => (m.accountId || '').toLowerCase() === myId)?.nickname || null
            }));
        }

        ChatCommon.showNicknamesModal({
            title: 'Nicknames',
            conversationId: this.currentChatId,
            members: members,
            onNicknameUpdated: (accountId, nickname) => {
                this.applyNicknameUpdate(this.currentChatId, accountId, nickname);
                if (window.ChatSidebar && typeof window.ChatSidebar.applyNicknameUpdate === 'function') {
                    window.ChatSidebar.applyNicknameUpdate(this.currentChatId, accountId, nickname);
                }
                if (window.ChatWindow && typeof window.ChatWindow.applyNicknameUpdate === 'function') {
                    window.ChatWindow.applyNicknameUpdate(this.currentChatId, accountId, nickname);
                }
            }
        });
    },

    renderInfoSidebar(meta) {
        if (!meta || !this.infoContent) return;
        this._savedInfoHtml = null;
        this._activeInfoPanel = null;

        const avatarUrl = ChatCommon.getAvatar(meta);
        const displayName = ChatCommon.getDisplayName(meta);
        const isGroup = meta.isGroup;
        const isMuted = !!(meta.isMuted ?? meta.IsMuted ?? false);
        const muteLabel = isMuted ? 'Unmute' : 'Mute';
        const muteIcon = isMuted ? 'bell' : 'bell-off';
        const muteDescription = isMuted ? 'Unmute notifications' : 'Mute notifications';
        const themeLabel = (window.ChatCommon && typeof window.ChatCommon.getConversationThemeLabel === 'function')
            ? window.ChatCommon.getConversationThemeLabel(meta.theme ?? meta.Theme, { fallbackToDefault: true })
            : 'Default';
        const privateTargetId = meta.otherMember?.accountId || meta.otherMemberId || '';
        const privateTargetName = meta.otherMember?.fullName || meta.otherMember?.username || 'User';
        const privateTargetNickname = meta.otherMember?.nickname || '';
        
        let statusHtml = '';
        if (!isGroup && meta.otherMember) {
            statusHtml = meta.otherMember.isActive ? 'Active now' : 'Offline';
        } else if (isGroup) {
            statusHtml = `${meta.members?.length || 0} Members`;
        }
        const getMemberEditableName = (member) =>
            member?.nickname ||
            member?.Nickname ||
            member?.username ||
            member?.userName ||
            member?.Username ||
            member?.UserName ||
            member?.displayName ||
            member?.DisplayName ||
            'Unknown';
        const truncateDisplayText = (value, maxLength) => {
            if (window.ChatCommon && typeof window.ChatCommon.truncateDisplayText === 'function') {
                return window.ChatCommon.truncateDisplayText(value, maxLength);
            }
            const raw = value === null || value === undefined ? '' : String(value);
            const limit = Number(maxLength);
            if (!Number.isFinite(limit) || limit <= 0 || raw.length <= limit) {
                return raw;
            }
            return raw.substring(0, Math.floor(limit)) + '...';
        };
        const memberNameMaxLength = window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25;

        const html = `
            <div class="chat-info-header">
                <div class="chat-info-avatar">
                    <img src="${avatarUrl}" alt="${displayName}" onerror="this.src='${window.APP_CONFIG?.DEFAULT_AVATAR}'">
                    ${(!isGroup && meta.otherMember?.isActive) ? '<div class="status-dot"></div>' : ''}
                </div>
                <div class="chat-info-name">${displayName}</div>
                <div class="chat-info-status">${statusHtml}</div>
            </div>

            <div class="chat-info-quick-actions">
                <button class="chat-info-quick-btn" onclick="${(!isGroup && (meta.otherMember?.accountId || meta.otherMemberId)) ? `ChatPage.minimizeToBubble(); window.location.hash = '#/profile/${meta.otherMember?.accountId || meta.otherMemberId}'` : "window.toastInfo('Profile only available for private chats')" }">
                    <div class="chat-info-quick-icon"><i data-lucide="user"></i></div>
                    <span>Profile</span>
                </button>
                <button class="chat-info-quick-btn" id="chat-info-mute-btn">
                    <div class="chat-info-quick-icon"><i data-lucide="${muteIcon}"></i></div>
                    <span>${muteLabel}</span>
                </button>
                <button class="chat-info-quick-btn" onclick="ChatPage.openSearchPanel()">
                    <div class="chat-info-quick-icon"><i data-lucide="search"></i></div>
                    <span>Search</span>
                </button>
            </div>

            <div class="chat-info-sections">
                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Chat info</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        <div class="chat-info-item" id="chat-info-view-pinned-btn">
                            <i data-lucide="pin"></i>
                            <span>View pinned messages</span>
                        </div>
                    </div>
                </div>

                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Customize chat</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        <div class="chat-info-item" id="chat-info-change-theme-btn">
                            <i data-lucide="palette"></i>
                            <span>Change theme (${escapeHtml(themeLabel)})</span>
                        </div>
                        <div class="chat-info-item" id="chat-info-edit-nicknames-btn">
                            <i data-lucide="at-sign"></i>
                            <span>Edit nicknames</span>
                        </div>
                    </div>
                </div>

                ${isGroup ? `
                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Chat members</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        ${(meta.members || []).map(m => {
                            const rawMemberName = getMemberEditableName(m);
                            const displayMemberName = truncateDisplayText(rawMemberName, memberNameMaxLength);
                            const escapedRawMemberName = escapeHtml(rawMemberName);
                            return `
                            <div class="chat-info-item chat-info-member chat-info-member-edit"
                                data-account-id="${(m.accountId || m.AccountId || '').toString().toLowerCase()}"
                                data-display-name="${escapedRawMemberName}"
                                data-nickname="${escapeHtml((m.nickname || m.Nickname || ''))}">
                                <img src="${m.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR}" class="chat-info-member-avatar">
                                <span class="chat-info-member-name" title="${escapedRawMemberName}">${escapeHtml(displayMemberName)}</span>
                                ${(m.role === 1 || m.Role === 1) ? '<span class="chat-info-member-role">Admin</span>' : ''}
                                <i data-lucide="pencil" style="margin-left:auto;"></i>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Media & files</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        <div class="chat-info-item" id="chat-info-open-media-btn">
                            <i data-lucide="image"></i>
                            <span>Media</span>
                        </div>
                        <div class="chat-info-item" id="chat-info-open-files-btn">
                            <i data-lucide="file-text"></i>
                            <span>Files</span>
                        </div>
                    </div>
                </div>

                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Privacy & support</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        <div class="chat-info-item" id="chat-info-mute-detail-btn">
                            <i data-lucide="${muteIcon}"></i>
                            <span>${muteDescription}</span>
                        </div>
                        <div class="chat-info-item danger" onclick="window.toastInfo('Feature coming soon')">
                            <i data-lucide="${isGroup ? 'log-out' : 'slash'}"></i>
                            <span>${isGroup ? 'Leave group' : 'Block user'}</span>
                        </div>
                        <div class="chat-info-item danger" id="chat-info-delete-conversation-btn">
                            <i data-lucide="trash-2"></i>
                            <span>Delete chat history</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.infoContent.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        const muteBtn = document.getElementById('chat-info-mute-btn');
        if (muteBtn) {
            muteBtn.onclick = () => this.toggleMuteCurrentConversation();
        }

        const muteDetailBtn = document.getElementById('chat-info-mute-detail-btn');
        if (muteDetailBtn) {
            muteDetailBtn.onclick = () => this.toggleMuteCurrentConversation();
        }

        const deleteBtn = document.getElementById('chat-info-delete-conversation-btn');
        if (deleteBtn) {
            deleteBtn.onclick = () => this.softDeleteCurrentConversation();
        }

        const editNicknamesBtn = document.getElementById('chat-info-edit-nicknames-btn');
        if (editNicknamesBtn) {
            editNicknamesBtn.onclick = () => this.promptEditNicknames();
        }

        const changeThemeBtn = document.getElementById('chat-info-change-theme-btn');
        if (changeThemeBtn) {
            changeThemeBtn.onclick = () => this.promptChangeThemeCurrentConversation();
        }

        const viewPinnedBtn = document.getElementById('chat-info-view-pinned-btn');
        if (viewPinnedBtn) {
            viewPinnedBtn.onclick = () => this.openPinnedMessagesCurrentConversation();
        }

        const mediaBtn = document.getElementById('chat-info-open-media-btn');
        if (mediaBtn) {
            mediaBtn.onclick = () => this.openMediaPanel();
        }

        const filesBtn = document.getElementById('chat-info-open-files-btn');
        if (filesBtn) {
            filesBtn.onclick = () => window.toastInfo?.('File gallery will be added in a next update.');
        }

        this.infoContent.querySelectorAll('.chat-info-member-edit').forEach(el => {
            el.onclick = () => {
                const accountId = (el.dataset.accountId || '').toLowerCase();
                const displayName = el.dataset.displayName || 'User';
                const nickname = el.dataset.nickname || '';
                this.promptEditNickname(accountId, displayName, nickname);
            };
        });
    },

    toggleInfoSection(titleEl) {
        const section = titleEl.closest('.chat-info-section');
        if (section) {
            section.classList.toggle('collapsed');
        }
    },

    async loadMessages(id, isLoadMore = false, gen = null) {
        if (this.isLoading) return;
        if (isLoadMore && !this.hasMore) return;

        // Use current generation if not provided (for load-more scrolls)
        if (gen === null) gen = this._loadGeneration || 0;

        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        this.isLoading = true;
        const oldScrollHeight = msgContainer.scrollHeight;

        if (!isLoadMore) {
            msgContainer.innerHTML = '<div class="chat-messages-loader"><div class="spinner spinner-large"></div></div>';
        }

        try {
            const res = await window.API.Conversations.getMessages(id, this.page, this.pageSize);

            // Stale check: if user switched conversations while awaiting, discard results
            if (this._loadGeneration !== gen) {
                console.log('Discarding stale loadMessages response for', id);
                return;
            }

            if (res.ok) {
                const data = await res.json();
                
                if (data.metaData) {
                    this.currentMetaData = {
                        ...(this.currentMetaData || {}),
                        ...data.metaData
                    };
                    this.renderHeader(this.currentMetaData);
                    this.renderInfoSidebar(this.currentMetaData);
                    this.updateInputState();
                    
                    // Render where members are currently at
                    setTimeout(() => this.updateMemberSeenStatuses(this.currentMetaData), 100);
                }

                const messages = data.messages.items || [];
                if (!isLoadMore) msgContainer.innerHTML = '';
                
                if (messages.length < this.pageSize) {
                    this.hasMore = false;
                }

                // API returns newest first, we want oldest first for display
                const chatItems = [...messages].reverse();
                
                // Determine if we need a separator between the prepend-batch and existing messages
                // or between messages within the batch.
                const html = this.renderMessageList(chatItems, isLoadMore);
                
            if (isLoadMore) {
                // Find old first message
                const oldFirstMsg = msgContainer.querySelector('.msg-bubble-wrapper');
                
                msgContainer.insertAdjacentHTML('afterbegin', html);

                // Resolve queued seen markers for messages that were just loaded via scroll.
                chatItems.forEach(m => {
                    const loadedMsgId = (m.messageId || m.MessageId)?.toString().toLowerCase();
                    if (loadedMsgId) {
                        this.applyPendingSeenForMessage(id, loadedMsgId);
                    }
                });
                
                // If there was an existing first message, sync it with its new predecessor
                if (oldFirstMsg) {
                    const newPredecessor = this.findPreviousMessageBubble(oldFirstMsg);
                    if (newPredecessor) {
                        ChatCommon.syncMessageBoundary(newPredecessor, oldFirstMsg);
                    }
                }

                ChatCommon.cleanTimeSeparators(msgContainer);

                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                });
                if (window.lucide) lucide.createIcons(); // Added lucide.createIcons() for prepend
            } else {
                    msgContainer.innerHTML = html;
                    ChatCommon.cleanTimeSeparators(msgContainer);
                    this.scrollToBottom();
                    if (window.lucide) lucide.createIcons();
                    
                    // Render seen indicators after DOM is ready - use longer timeout for stability
                    if (data.metaData) {
                        setTimeout(() => this.updateMemberSeenStatuses(this.currentMetaData), 200);
                    }

                    // Auto mark seen when opening chat-page
                    const lastId = this.getLastMessageId();
                    if (lastId) {
                        this.markConversationSeen(id, lastId);
                    }
                }

                this.page++;
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
            if (!isLoadMore) msgContainer.innerHTML = '<div style="text-align:center; padding:20px;">Error loading messages</div>';
        } finally {
            this.isLoading = false;
        }
    },

    renderMessageList(messages, isPrepend = false) {
        if (!messages.length) return '';
        
        const isGroup = !!this.currentMetaData?.isGroup;
        const myId = (localStorage.getItem('accountId') || sessionStorage.getItem('accountId') || window.APP_CONFIG?.CURRENT_USER_ID || '').toLowerCase();
        let html = '';
        let lastTime = null;

        messages.forEach((m, idx) => {
            ChatCommon.normalizeMessage(m, myId);

            // Set 'sent' status for the last own non-system message if not prepending
            if (!isPrepend && idx === messages.length - 1 && m.isOwn && !ChatCommon.isSystemMessage(m) && !m.isRecalled) {
                m.status = 'sent';
            }

            const currentTime = new Date(m.sentAt);
            const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
            if (!lastTime || (currentTime - lastTime > gap)) {
                html += ChatCommon.renderChatSeparator(m.sentAt);
            }

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
            const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

            // Access avatar with case-insensitive fallback
            const avatarRaw = m.sender?.avatarUrl || m.sender?.AvatarUrl || '';
            const senderAvatar = !m.isOwn ? avatarRaw : '';
            
            const authorName = isGroup && !m.isOwn
                ? (m.sender?.nickname || m.sender?.Nickname || m.sender?.username || m.sender?.Username || m.sender?.fullName || m.sender?.FullName || '')
                : '';

            html += ChatCommon.renderMessageBubble(m, {
                isGroup,
                groupPos,
                senderAvatar,
                authorName,
                isPage: true
            });

            lastTime = currentTime;
        });

        return html;
    },

    appendMessage(msg, autoScroll = true) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        // Clear ANY existing "Sent" indicators in this chat before adding a new message
        msgContainer.querySelectorAll('.msg-bubble-wrapper[data-status="sent"]').forEach(el => {
            el.removeAttribute('data-status');
            el.querySelector('.msg-status')?.remove();
        });

        const isGroup = !!this.currentMetaData?.isGroup;
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        
        ChatCommon.normalizeMessage(msg, myId);
        const isOwn = !!msg.isOwn;
        const isSystemMessage = ChatCommon.isSystemMessage(msg);
        
        // Ensure optimistic messages have the correct senderId for seen-avatar fallback
        if (msg.isOwn && !msg.sender?.accountId) {
            msg.sender.accountId = myId.toLowerCase();
        }

        const messageId = msg.messageId;
        const sentAt = msg.sentAt;
        const senderId = (msg.sender?.accountId || '').toLowerCase();

        // Time separator
        const lastMsgEl = this.getLastMessageBubble(msgContainer);
        const lastTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
        const currentTime = new Date(sentAt);
        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        if (!lastTime || (currentTime - lastTime > gap)) {
            this.insertHtmlBeforeTypingIndicator(msgContainer, ChatCommon.renderChatSeparator(sentAt));
        }

        // Determine grouping with the previous message in DOM
        const prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        const prevIsSystemMessage = !!lastMsgEl && ChatCommon.isSystemMessageElement(lastMsgEl);
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === senderId;
        const closeTime = lastTime && (currentTime - lastTime < groupGap);
        const groupedWithPrev = !isSystemMessage && !prevIsSystemMessage && sameSender && closeTime;

        // New message is always 'last' or 'single' when appended
        const groupPos = groupedWithPrev ? 'last' : 'single';

        const avatarRaw = msg.Sender?.AvatarUrl || msg.sender?.avatarUrl || msg.sender?.AvatarUrl || '';
        const senderAvatar = !isOwn ? avatarRaw : '';
        
        const authorRaw = msg.sender?.nickname || msg.sender?.Nickname || msg.sender?.username || msg.sender?.Username || msg.sender?.fullName || msg.sender?.FullName || '';
        const authorName = isGroup && !isOwn ? authorRaw : '';
        
        // Ensure msg.sender object exists for renderMessageBubble if missing
        if (!msg.sender) {
            msg.sender = { accountId: senderId, avatarUrl: avatarRaw };
        }
        if (!msg.sentAt) msg.sentAt = sentAt;
        if (!msg.messageId && messageId) msg.messageId = messageId;

        const div = document.createElement('div');
        div.innerHTML = ChatCommon.renderMessageBubble(msg, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName,
            isPage: true
        });

        const bubble = div.firstElementChild;
        bubble.dataset.sentAt = sentAt;
        bubble.dataset.senderId = senderId;
        if (messageId) bubble.dataset.messageId = messageId;
        
        // track temp id and status for optimistic UI
        if (msg.tempId) {
            bubble.dataset.tempId = msg.tempId;
        }
        if (msg.status && !isSystemMessage) {
            bubble.dataset.status = msg.status;
        }
        
        this.insertNodeBeforeTypingIndicator(msgContainer, bubble);

        // Sync grouping with the PREVIOUS message in DOM
        if (lastMsgEl) {
            ChatCommon.syncMessageBoundary(lastMsgEl, bubble);
        }
        ChatCommon.cleanTimeSeparators(msgContainer);

        if (messageId) {
            this.applyPendingSeenForMessage(this.currentChatId, messageId);
        }
        if (autoScroll) msgContainer.scrollTop = msgContainer.scrollHeight;
        if (window.lucide) lucide.createIcons();
    },

    async sendMessage() {
        const input = document.getElementById('chat-message-input');
        const content = input.value.trim();
        if ((!content && this.pendingFiles.length === 0) || !this.currentChatId) return;

        // Cancel typing indicator immediately
        if (window.ChatTyping) ChatTyping.cancelTyping(this.currentChatId);

        // generate temp message id
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Prepare local preview URLs for optimistic UI if there are files
        const medias = this.pendingFiles.map(file => ({
            mediaUrl: this.trackBlobUrl(URL.createObjectURL(file), tempId), // Local preview link
            mediaType: this.getPendingMediaType(file),
            fileName: file.name || '',
            fileSize: Number(file.size) || 0
        }));

        // New outgoing message: clear any previous "Sent" indicators
        const msgContainer = document.getElementById('chat-view-messages');
        msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
            el.removeAttribute('data-status');
            el.querySelector('.msg-status')?.remove();
        });

        // optimistic ui - show message immediately with pending state
        const myId = (localStorage.getItem('accountId') || '');
        this.appendMessage({ 
            tempId,
            content, 
            medias: medias.length > 0 ? medias : null,
            sentAt: new Date(), 
            isOwn: true,
            sender: { accountId: myId },
            status: 'pending'
        });
        
        // Update Sidebar immediately
        if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
            window.ChatSidebar.incrementUnread(this.currentChatId, {
                content,
                medias: medias.length > 0 ? medias : null,
                sender: { accountId: (localStorage.getItem('accountId') || '') },
                sentAt: new Date()
            });
        }
        
        // Prepare data for real upload
        const filesToSend = [...this.pendingFiles];
        if (filesToSend.length > 0) {
            this.retryFiles.set(tempId, filesToSend);
        }

        // Clear input and pending state immediately
        input.value = '';
        input.style.height = 'auto';
        this.pendingFiles = [];
        this.updateAttachmentPreview();
        this.updateInputState();

        const runtimePayload = window.ChatMessageRuntime
            ? window.ChatMessageRuntime.buildRetryFormData({
                content,
                tempId,
                files: filesToSend
            })
            : null;
        const formData = runtimePayload?.formData || new FormData();
        if (!runtimePayload) {
            if (content) formData.append('Content', content);
            if (tempId) formData.append('TempId', tempId);
            filesToSend.forEach(file => {
                formData.append('MediaFiles', file);
            });
        }

        try {
            let res;
            
            // Final fallback check for metadata
            if (!this.currentMetaData && window.ChatSidebar && window.ChatSidebar.conversations) {
                const sidebarConv = window.ChatSidebar.conversations.find(c => c.conversationId === this.currentChatId);
                if (sidebarConv) {
                    this.currentMetaData = sidebarConv;
                }
            }

            if (this.currentMetaData && this.currentMetaData.isGroup) {
                // group chat - use group API
                res = await window.API.Messages.sendGroup(this.currentChatId, formData);
            } else if (this.currentMetaData && this.currentMetaData.otherMember) {
                // private chat - use private API with receiverId
                formData.append('ReceiverId', this.currentMetaData.otherMember.accountId);
                res = await window.API.Messages.sendPrivate(formData);
            } else {
                console.error("Cannot determine chat type or missing metadata", { meta: this.currentMetaData, id: this.currentChatId });
                this.updateMessageStatus(tempId, 'failed', content);
                return;
            }
            
            if (res.ok) {
                const msg = await res.json();
                if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                    const sidebarConversationId = (msg?.conversationId || msg?.ConversationId || this.currentChatId || '').toString().toLowerCase();
                    if (sidebarConversationId) {
                        window.ChatSidebar.incrementUnread(sidebarConversationId, msg, true);
                    }
                }
                this.updateMessageStatus(tempId, 'sent', content, msg?.messageId || msg?.MessageId, msg);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            this.updateMessageStatus(tempId, 'failed', content);
        }
    },

    updateInputState() {
        const input = document.getElementById('chat-message-input');
        const container = document.querySelector('.chat-view-input-container');
        const sendBtn = document.getElementById('chat-page-send-btn');
        
        const hasText = input?.value.trim().length > 0;
        const hasFiles = this.pendingFiles.length > 0;
        const hasContent = hasText || hasFiles;

        if (container) container.classList.toggle('has-content', hasContent);
        
        // Block send if no content OR metadata not yet available
        const canSend = hasContent && (this.currentMetaData || (window.ChatSidebar?.conversations?.find(c => c.conversationId === this.currentChatId)));
        
        if (sendBtn) sendBtn.disabled = !canSend;
    },

    async handleMediaUpload(files, options = {}) {
        if (!files || files.length === 0 || !this.currentChatId) return;

        const maxFiles = window.APP_CONFIG?.MAX_CHAT_ATTACHMENTS_PER_MESSAGE
            || window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES
            || 5;
        const maxSizeMB = window.APP_CONFIG?.MAX_CHAT_ATTACHMENT_SIZE_MB
            || window.APP_CONFIG?.MAX_CHAT_FILE_SIZE_MB
            || 10;
        const currentCount = this.pendingFiles.length;
        const source = (options?.source || 'media').toString().toLowerCase();
        const documentOnly = source === 'file';
        
        if (currentCount + files.length > maxFiles) {
            if (window.toastError) window.toastError(`Maximum ${maxFiles} files allowed`);
            return;
        }

        const validFiles = [];
        for (let file of files) {
            if (file.size > maxSizeMB * 1024 * 1024) {
                if (window.toastError) window.toastError(`Attachment "${file.name}" is too large (Max ${maxSizeMB}MB)`);
                continue;
            }
            const mediaType = this.getPendingMediaType(file);
            if (documentOnly && mediaType !== 3) {
                if (window.toastError) window.toastError(`"${file.name}" is not a supported document file`);
                continue;
            }
            if (!documentOnly && mediaType === 3) {
                if (window.toastInfo) window.toastInfo(`Use the File button to send "${file.name}"`);
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) return;

        // Add to pending list instead of sending
        this.pendingFiles.push(...validFiles);
        this.updateAttachmentPreview();
        this.updateInputState();
    },

    updateAttachmentPreview() {
        const previewEl = document.getElementById('chat-attachment-preview');
        if (!previewEl) return;

        this.revokeAllPreviewBlobUrls();
        previewEl.innerHTML = '';
        
        this.pendingFiles.forEach((file, index) => {
            const mediaType = this.getPendingMediaType(file);
            const isVideo = mediaType === 1;
            const isImage = mediaType === 0;
            const isDocument = mediaType === 3;
            const url = (isVideo || isImage)
                ? this.trackBlobUrl(URL.createObjectURL(file), 'preview')
                : '';
            const safeName = escapeHtml(file.name || 'Document');
            const sizeText = this.formatFileSize(file.size);

            const item = document.createElement('div');
            item.className = `chat-preview-item${isDocument ? ' file' : ''}`;
            
            if (isVideo) {
                item.innerHTML = `
                    <video src="${url}"></video>
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            } else if (isImage) {
                item.innerHTML = `
                    <img src="${url}" alt="preview">
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <div class="chat-preview-file-card" title="${safeName}">
                        <div class="chat-preview-file-icon"><i data-lucide="file-text"></i></div>
                        <div class="chat-preview-file-meta">
                            <div class="chat-preview-file-name">${safeName}</div>
                            <div class="chat-preview-file-size">${escapeHtml(sizeText || 'File')}</div>
                        </div>
                    </div>
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            }
            previewEl.appendChild(item);
        });

        // Add the "+" button like Facebook Messenger if under limit
        const maxFiles = window.APP_CONFIG?.MAX_CHAT_ATTACHMENTS_PER_MESSAGE
            || window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES
            || 5;
        if (this.pendingFiles.length > 0 && this.pendingFiles.length < maxFiles) {
            const hasOnlyDocuments = this.pendingFiles.every(file => this.getPendingMediaType(file) === 3);
            const addBtn = document.createElement('div');
            addBtn.className = 'chat-preview-add-btn';
            addBtn.innerHTML = '<i data-lucide="plus"></i>';
            addBtn.onclick = () => {
                const targetInputId = hasOnlyDocuments ? 'chat-document-input' : 'chat-file-input';
                document.getElementById(targetInputId)?.click();
            };
            previewEl.appendChild(addBtn);
        }

        if (window.lucide) lucide.createIcons();
    },

    removeAttachment(index) {
        this.pendingFiles.splice(index, 1);
        this.updateAttachmentPreview();
        this.updateInputState();
    },

    updateMessageStatus(tempId, status, content, realId = null, messagePayload = null) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        const bubble = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!bubble) {
            if (status === 'sent') this.cleanupRetryPayload(tempId);
            return;
        }

        const runtimeCtx = this.getRuntimeCtx();
        if (runtimeCtx && window.ChatMessageRuntime) {
            window.ChatMessageRuntime.applyMessageStatus(runtimeCtx, {
                container: msgContainer,
                bubble,
                status,
                content,
                tempId,
                realMessageId: realId,
                messagePayload,
                retryHandler: (retryTempId, retryContent) => this.retryMessage(retryTempId, retryContent),
                onPendingSeen: (normRealId) => {
                    if (this.currentChatId) {
                        this.applyPendingSeenForMessage(this.currentChatId, normRealId);
                    }
                },
                removePreviousSent: (currentBubble) => {
                    msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                        if (el !== currentBubble) {
                            el.removeAttribute('data-status');
                            el.querySelector('.msg-status')?.remove();
                        }
                    });
                }
            });
            return;
        }

        bubble.dataset.status = status;
        if (realId) {
            const normRealId = realId ? realId.toString().toLowerCase() : null;
            if (normRealId) bubble.dataset.messageId = normRealId;
            // SYNC SEEN ROW ID: This is critical so moveSeenAvatar can find it!
            const seenRow = bubble.querySelector('.msg-seen-row');
            if (seenRow && normRealId) seenRow.id = `seen-row-${normRealId}`;
            if (normRealId) {
                this.applyPendingSeenForMessage(this.currentChatId, normRealId);
            }
        }

        if (status === 'sent') {
            const hadBlobMedia = !!bubble.querySelector('img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]');
            const replaced = this.replaceOptimisticMediaUrls(bubble, messagePayload, tempId);
            this.retryFiles.delete(tempId);
            if (!hadBlobMedia || replaced) {
                this.cleanupRetryPayload(tempId);
            }
        }
        
        // Remove existing status indicators from THIS bubble
        const existingStatus = bubble.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();
        
        // If this message is being marked as SENT, remove "Sent" status from all PREVIOUS messages
        if (status === 'sent') {
            msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                if (el !== bubble) {
                    el.removeAttribute('data-status');
                    el.querySelector('.msg-status')?.remove();
                }
            });
        }
        
        // create status element below bubble
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
            statusEl.onclick = () => this.retryMessage(tempId, content);
        }
        
        bubble.appendChild(statusEl);
    },

    async retryMessage(tempId, content) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        // update to pending
        this.updateMessageStatus(tempId, 'pending', content);
        
        const files = this.retryFiles.get(tempId) || [];
        const runtimePayload = window.ChatMessageRuntime
            ? window.ChatMessageRuntime.buildRetryFormData({
                content,
                tempId,
                files
            })
            : null;
        const hasText = runtimePayload ? runtimePayload.hasText : (content && content.trim().length > 0);
        const formData = runtimePayload?.formData || new FormData();
        if (!hasText && files.length === 0) {
            this.updateMessageStatus(tempId, 'failed', content);
            return;
        }
        if (!runtimePayload) {
            if (hasText) formData.append('Content', content);
            formData.append('TempId', tempId);
            files.forEach(file => formData.append('MediaFiles', file));
        }
        
        try {
            let res;
            
            if (this.currentMetaData && this.currentMetaData.isGroup) {
                res = await window.API.Messages.sendGroup(this.currentChatId, formData);
            } else if (this.currentMetaData && this.currentMetaData.otherMember) {
                formData.append('ReceiverId', this.currentMetaData.otherMember.accountId);
                res = await window.API.Messages.sendPrivate(formData);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
                return;
            }
            
            if (res.ok) {
                const msg = await res.json();
                if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                    const sidebarConversationId = (msg?.conversationId || msg?.ConversationId || this.currentChatId || '').toString().toLowerCase();
                    if (sidebarConversationId) {
                        window.ChatSidebar.incrementUnread(sidebarConversationId, msg, true);
                    }
                }
                this.updateMessageStatus(tempId, 'sent', content, msg?.messageId || msg?.MessageId, msg);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to retry message:", error);
            this.updateMessageStatus(tempId, 'failed', content);
        }
    }
};

window.initChatPage = () => ChatPage.init();
window.ChatPage = ChatPage;
