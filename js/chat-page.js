/**
 * Chat Page Module
 * Logic for the full-screen /messages page.
 * Note: The conversation list is handled by the global ChatSidebar.
 */
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

    replaceOptimisticMediaUrls(bubble, messagePayload, tempId = null) {
        const ctx = this.getRuntimeCtx();
        if (ctx) {
            return window.ChatMessageRuntime.replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId);
        }
        if (!bubble || !messagePayload) return false;
        const medias = messagePayload.Medias || messagePayload.medias || [];
        if (!Array.isArray(medias) || medias.length === 0) return false;

        const localItems = bubble.querySelectorAll('.msg-media-item');
        if (!localItems || localItems.length === 0) return false;

        let replaced = false;
        medias.forEach((m, i) => {
            if (!localItems[i]) return;
            const mediaUrl = m.MediaUrl || m.mediaUrl;
            if (!mediaUrl) return;

            const img = localItems[i].querySelector('img');
            const vid = localItems[i].querySelector('video');
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
        const fileInput = document.getElementById('chat-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.onclick = (e) => {
                e.stopPropagation();
                fileInput.click();
            };
            fileInput.onchange = () => {
                const files = fileInput.files;
                if (files.length > 0) {
                    this.handleMediaUpload(files);
                    fileInput.value = ''; // Reset
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
            if (this.isLoading || !this.hasMore) return;
            
            // If scrolled to top (threshold 50px)
            if (msgContainer.scrollTop <= 50) {
                this.loadMessages(this.currentChatId, true);
            }
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

        const normMessageId = messageId ? messageId.toString().toLowerCase() : null;
        if (!normMessageId) return;

        if (window.ChatRealtime && typeof window.ChatRealtime.seenConversation === 'function') {
            window.ChatRealtime.seenConversation(conversationId, normMessageId)
                .then(() => {
                    if (window.ChatSidebar) {
                        // Check if conversation was actually unread before clearing
                        const conv = window.ChatSidebar.conversations.find(c => c.conversationId === conversationId);
                        const wasUnread = conv && conv.unreadCount > 0;
                        window.ChatSidebar.clearUnread(conversationId);
                        // Refresh global badge only if it was unread
                        if (wasUnread && typeof scheduleGlobalUnreadRefresh === 'function') {
                            scheduleGlobalUnreadRefresh();
                        }
                    }
                })
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

    scrollToBottom(force = false) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
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
                const hadBlobMedia = !!optimisticBubble.querySelector('img[src^="blob:"], video[src^="blob:"]');
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

            // If it's an own message from another device, mark it as 'sent'
            if (senderId === myId && !msg.status) {
                msg.status = 'sent';
            }

            this.appendMessage(msg);
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

        // If target exists but isn't our message, move to nearest previous message sent by us.
        if (bubbleWrapper && (bubbleWrapper.dataset.senderId || '').toLowerCase() !== myId) {
            let cursor = bubbleWrapper.previousElementSibling;
            while (cursor) {
                if (cursor.classList?.contains('msg-bubble-wrapper')) {
                    const senderId = (cursor.dataset.senderId || '').toLowerCase();
                    if (senderId === myId) {
                        targetRow = cursor.querySelector('.msg-seen-row');
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
        }
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
                    this.updateInputState();
                }
            }
        }

        await this.loadMessages(conversationId, false, gen);
    },

    renderHeader(meta) {
        if (!meta) return;

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
            ChatWindow.renderBubble(this.currentChatId, this.currentMetaData);
            ChatWindow.saveState();
        }
    },

    renderInfoSidebar(meta) {
        if (!meta || !this.infoContent) return;

        const avatarUrl = ChatCommon.getAvatar(meta);
        const displayName = ChatCommon.getDisplayName(meta);
        const isGroup = meta.isGroup;
        
        let statusHtml = '';
        if (!isGroup && meta.otherMember) {
            statusHtml = meta.otherMember.isActive ? 'Active now' : 'Offline';
        } else if (isGroup) {
            statusHtml = `${meta.members?.length || 0} Members`;
        }

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
                <button class="chat-info-quick-btn" onclick="window.toastInfo('Mute feature coming soon')">
                    <div class="chat-info-quick-icon"><i data-lucide="bell"></i></div>
                    <span>Mute</span>
                </button>
                <button class="chat-info-quick-btn" onclick="window.toastInfo('Search feature coming soon')">
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
                        <div class="chat-info-item" onclick="window.toastInfo('Pinned messages coming soon')">
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
                        <div class="chat-info-item" onclick="window.toastInfo('Theme coming soon')">
                            <i data-lucide="palette"></i>
                            <span>Change theme</span>
                        </div>
                        <div class="chat-info-item" onclick="window.toastInfo('Nicknames coming soon')">
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
                        ${(meta.members || []).map(m => `
                            <div class="chat-info-item chat-info-member">
                                <img src="${m.avatarUrl || window.APP_CONFIG?.DEFAULT_AVATAR}" class="chat-info-member-avatar">
                                <span class="chat-info-member-name">${m.displayName || m.nickname || 'Unknown'}</span>
                                ${m.role === 1 ? '<span class="chat-info-member-role">Admin</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="chat-info-section">
                    <div class="chat-info-section-title" onclick="ChatPage.toggleInfoSection(this)">
                        <span>Media & files</span>
                        <i data-lucide="chevron-down" class="chevron"></i>
                    </div>
                    <div class="chat-info-section-content">
                        <div class="chat-info-item" onclick="window.toastInfo('Media gallery coming soon')">
                            <i data-lucide="image"></i>
                            <span>Media</span>
                        </div>
                        <div class="chat-info-item" onclick="window.toastInfo('File gallery coming soon')">
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
                        <div class="chat-info-item" onclick="window.toastInfo('Mute coming soon')">
                            <i data-lucide="bell-off"></i>
                            <span>Mute notifications</span>
                        </div>
                        <div class="chat-info-item danger" onclick="window.toastInfo('Feature coming soon')">
                            <i data-lucide="${isGroup ? 'log-out' : 'slash'}"></i>
                            <span>${isGroup ? 'Leave group' : 'Block user'}</span>
                        </div>
                        <div class="chat-info-item danger" onclick="window.toastInfo('Delete conversation feature coming soon')">
                            <i data-lucide="trash-2"></i>
                            <span>Delete conversation</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.infoContent.innerHTML = html;
        if (window.lucide) lucide.createIcons();
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
                    this.currentMetaData = data.metaData;
                    this.renderHeader(data.metaData);
                    this.renderInfoSidebar(data.metaData);
                    this.updateInputState();
                    
                    // Render where members are currently at
                    setTimeout(() => this.updateMemberSeenStatuses(data.metaData), 100);
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

                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                });
                if (window.lucide) lucide.createIcons(); // Added lucide.createIcons() for prepend
            } else {
                    msgContainer.innerHTML = html;
                    this.scrollToBottom();
                    if (window.lucide) lucide.createIcons();
                    
                    // Render seen indicators after DOM is ready - use longer timeout for stability
                    if (data.metaData) {
                        setTimeout(() => this.updateMemberSeenStatuses(data.metaData), 200);
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

            // Set 'sent' status for the last message if it's ours and not prepending
            if (!isPrepend && idx === messages.length - 1 && m.isOwn) {
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

    appendMessage(msg) {
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
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === senderId;
        const closeTime = lastTime && (currentTime - lastTime < groupGap);
        const groupedWithPrev = sameSender && closeTime;

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
        if (msg.status) {
            bubble.dataset.status = msg.status;
        }
        
        this.insertNodeBeforeTypingIndicator(msgContainer, bubble);

        // Sync grouping with the PREVIOUS message in DOM
        if (lastMsgEl) {
            ChatCommon.syncMessageBoundary(lastMsgEl, bubble);
        }

        if (messageId) {
            this.applyPendingSeenForMessage(this.currentChatId, messageId);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
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
            mediaType: file.type.startsWith('video/') ? 1 : 0
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

    async handleMediaUpload(files) {
        if (!files || files.length === 0 || !this.currentChatId) return;

        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 5;
        const maxSizeMB = window.APP_CONFIG?.MAX_CHAT_FILE_SIZE_MB || 10;
        const currentCount = this.pendingFiles.length;
        
        if (currentCount + files.length > maxFiles) {
            if (window.toastError) window.toastError(`Maximum ${maxFiles} files allowed`);
            return;
        }

        const validFiles = [];
        for (let file of files) {
            if (file.size > maxSizeMB * 1024 * 1024) {
                if (window.toastError) window.toastError(`File "${file.name}" is too large (Max ${maxSizeMB}MB)`);
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
            const isVideo = file.type.startsWith('video/');
            const url = this.trackBlobUrl(URL.createObjectURL(file), 'preview');

            const item = document.createElement('div');
            item.className = 'chat-preview-item';
            
            if (isVideo) {
                item.innerHTML = `
                    <video src="${url}"></video>
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <img src="${url}" alt="preview">
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            }
            previewEl.appendChild(item);
        });

        // Add the "+" button like Facebook Messenger if under limit
        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 10;
        if (this.pendingFiles.length > 0 && this.pendingFiles.length < maxFiles) {
            const addBtn = document.createElement('div');
            addBtn.className = 'chat-preview-add-btn';
            addBtn.innerHTML = '<i data-lucide="plus"></i>';
            addBtn.onclick = () => document.getElementById('chat-file-input').click();
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
            const hadBlobMedia = !!bubble.querySelector('img[src^="blob:"], video[src^="blob:"]');
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
