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
    pendingSeenByConv: new Map(),

    async init() {
        // Close all roaming chat windows when entering Chat Page to avoid redundancy
        if (window.ChatWindow && typeof window.ChatWindow.closeAll === 'function') {
            window.ChatWindow.closeAll();
        }

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
        
        this.cacheElements();
        this.attachEventListeners();
        this.initScrollListener();
        this.handleUrlNavigation();
        this.registerRealtimeHandlers();
    },

    cacheElements() {
        this.mainArea = document.getElementById('chat-main-area');
        this.chatView = document.getElementById('chat-view');
    },

    attachEventListeners() {
        const input = document.getElementById('chat-message-input');
        if (input) {
            // Set max length from config
            const maxLen = window.APP_CONFIG?.MAX_CHAT_MESSAGE_LENGTH || 1000;
            input.setAttribute('maxlength', maxLen);

            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
                this.updateInputState();
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.currentChatId && this.currentMetaData) {
                        this.sendMessage();
                    } else if (this.currentChatId) {
                        // Try fallback one last time
                        this.sendMessage();
                    }
                }
            });
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
            document.addEventListener('click', (e) => {
                if (!expansion.contains(e.target)) {
                    expansion.classList.remove('is-show');
                }
            });
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
            window.EmojiUtils?.setupClickOutsideHandler('#chat-emoji-picker-container', '#chat-emoji-btn');
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

        // Attachment button (coming soon)
        const attachBtn = document.getElementById('chat-attachment-btn');
        if (attachBtn) {
            attachBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.toastInfo) window.toastInfo("Feature coming soon");
            };
        }
    },

    queuePendingSeen(conversationId, messageId, accountId, memberInfo = null) {
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
    },

    handleRealtimeMessage(msg) {
        // --- ROBUST PROPERTY RESOLUTION ---
        const convId = (msg.ConversationId || msg.conversationId || '').toLowerCase();
        const messageIdRaw = msg.MessageId || msg.messageId;
        const messageId = messageIdRaw ? messageIdRaw.toString().toLowerCase() : null;
        const tempId = msg.TempId || msg.tempId;
        const rawSenderId = msg.Sender?.AccountId || msg.sender?.accountId || msg.SenderId || msg.senderId || '';
        const senderId = rawSenderId.toLowerCase();
        const content = (msg.Content || msg.content || '').trim();

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();

        if (this.currentChatId?.toLowerCase() === convId) {
            // 1. Check if message already exists in DOM (by real ID)
            if (messageId && document.querySelector(`[data-message-id="${messageId}"]`)) {
                return;
            }

            // 2. Check tempId duplication
            if (tempId && document.querySelector(`[data-temp-id="${tempId}"]`)) {
                return;
            }

            // 3. Merge check for our own messages
            if (senderId === myId) {
                const msgContainer = document.getElementById('chat-view-messages');
                const optimisticMsgs = msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="pending"]');
                let matched = false;
                
                if (optimisticMsgs) {
                    for (let opt of optimisticMsgs) {
                        const optContent = opt.querySelector('.msg-bubble')?.innerText.trim();
                        if (optContent === content) {
                            if (messageId) opt.dataset.messageId = messageId;
                            delete opt.dataset.status;
                            opt.querySelector('.msg-status')?.remove();
                            
                            const seenRow = opt.querySelector('.msg-seen-row');
                            if (seenRow && messageId) seenRow.id = `seen-row-${messageId}`;

                            this.markConversationSeen(convId, messageId);
                            if (messageId) {
                                this.applyPendingSeenForMessage(convId, messageId);
                            }
                            if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                                window.ChatSidebar.incrementUnread(convId, msg);
                            }
                            matched = true;
                            break;
                        }
                    }
                }
                if (matched) return; 
            } else {
                // Incoming message from others: clear "Sent" status
                const msgContainer = document.getElementById('chat-view-messages');
                msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                    el.removeAttribute('data-status');
                    el.querySelector('.msg-status')?.remove();
                });
            }

            this.appendMessage(msg);
            if (messageId) {
                this.applyPendingSeenForMessage(convId, messageId);
            }
            const lastId = messageId || this.getLastMessageId();
            if (lastId) this.markConversationSeen(convId, lastId);
            
            if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                window.ChatSidebar.incrementUnread(convId, msg);
            }
        } else {
            if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                window.ChatSidebar.incrementUnread(convId, msg);
            }
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
    },

    /**
     * Initial render for all members' seen indicators
     */
    updateMemberSeenStatuses(meta) {
        if (!meta || !meta.memberSeenStatuses) return;

        const myId = localStorage.getItem('accountId');

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
        const existing = document.querySelector(`.seen-avatar[data-account-id="${accountId}"]`);
        if (existing) {
            existing.remove();
        }

        // 3. Find target bubble (by messageId), then pick correct seen-row
        const normMessageId = messageId ? messageId.toString().toLowerCase() : messageId;
        let bubbleWrapper = normMessageId ? document.querySelector(`.msg-bubble-wrapper[data-message-id="${normMessageId}"]`) : null;
        let targetRow = bubbleWrapper?.querySelector('.msg-seen-row') || null;

        // If target isn't our message (or row missing), move to latest previous message sent by us
        if (!bubbleWrapper || (bubbleWrapper.dataset.senderId || '').toLowerCase() !== myId) {
            let cursor = bubbleWrapper ? bubbleWrapper.previousElementSibling : null;
            // If bubbleWrapper is null, start from LAST element in container
            if (!cursor && !bubbleWrapper) {
                const msgContainer = document.getElementById('chat-view-messages');
                cursor = msgContainer?.lastElementChild;
            }
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

        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'seen-avatar';
        img.dataset.accountId = accountId;
        img.title = displayName;
        img.onerror = () => img.src = APP_CONFIG.DEFAULT_AVATAR;

        targetRow.appendChild(img);
    },

    handleUrlNavigation() {
        const hash = window.location.hash;
        if (hash.includes('?id=')) {
            const id = hash.split('?id=')[1].split('&')[0];
            if (id) this.loadConversation(id);
        }
    },

    leaveCurrentConversation() {
        if (this.currentChatId) {
            const oldId = this.currentChatId;
            this.pendingSeenByConv.delete(oldId.toLowerCase());
            
            // Only leave if not open in any floating ChatWindow
            const isOpenInWindow = window.ChatWindow && window.ChatWindow.openChats && window.ChatWindow.openChats.has(oldId);
            
            if (!isOpenInWindow && window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
                window.ChatRealtime.leaveConversation(oldId)
                    .then(() => console.log(`👋 Left Conv-${oldId} group`))
                    .catch(err => console.error("Error leaving conversation group:", err));
            }
            this.currentChatId = null;
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
        
        if (this.currentChatId && window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
            console.log("🚪 Leaving group", this.currentChatId);
            window.ChatRealtime.leaveConversation(this.currentChatId).catch(err => console.error("Error leaving conversation group:", err));
        }

        this.currentChatId = conversationId;
        this.currentMetaData = null;
        this.messages = [];
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;
        

        // Visual update in Sidebar anyway
        if (window.ChatSidebar) {
            window.ChatSidebar.updateActiveId(conversationId);
            
            // PRE-LOAD MetaData from Sidebar if available (improves fast-clicking send experience)
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

        // Stale check: if user already navigated away, don't join group
        if (this._loadGeneration !== gen) return;

        // Join the SignalR group for this conversation
        if (window.ChatRealtime && typeof window.ChatRealtime.joinConversation === 'function') {
            window.ChatRealtime.joinConversation(conversationId)
                .then(() => console.log(`✅ Joined Conv-${conversationId} group`))
                .catch(err => console.error("Error joining conversation group:", err));
        }
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
                    msgContainer.insertAdjacentHTML('afterbegin', html);
                    requestAnimationFrame(() => {
                        msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                    });
                } else {
                    msgContainer.innerHTML = html;
                    this.scrollToBottom();
                    
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
        const myId = localStorage.getItem('accountId');
        let html = '';
        let lastTime = null;

        messages.forEach((m, idx) => {
            // Support both camelCase and PascalCase for medias
            if (!m.medias && m.Medias) m.medias = m.Medias;

            // Normalize casing for ids/timestamps
            if (!m.messageId && m.MessageId) m.messageId = m.MessageId.toString().toLowerCase();
            if (!m.sentAt && m.SentAt) m.sentAt = m.SentAt;
            
            m.isOwn = (m.sender?.accountId || m.senderId) === myId;

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
                authorName
            });

            lastTime = currentTime;
        });

        return html;
    },

    appendMessage(msg) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        const isGroup = !!this.currentMetaData?.isGroup;
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        
        // --- ROBUST PROPERTY RESOLUTION ---
        const rawSenderId = msg.Sender?.AccountId || msg.sender?.accountId || msg.SenderId || msg.senderId || '';
        let senderId = rawSenderId.toLowerCase();
        
        // If it's an optimistic message (no senderId yet), it MUST be own
        const isOwn = (senderId === myId) || (msg.tempId && !senderId);
        msg.isOwn = isOwn;

        // FIX: Ensure optimistic messages have the correct senderId for seen-avatar fallback
        if (isOwn && !senderId) {
            senderId = myId;
        }

        const messageIdRaw = msg.MessageId || msg.messageId;
        const messageId = messageIdRaw ? messageIdRaw.toString().toLowerCase() : null;
        const tempId = msg.TempId || msg.tempId;

        // Time separator
        const lastMsgEl = msgContainer.querySelector('.msg-bubble-wrapper:last-of-type');
        const lastTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
        const sentAt = msg.SentAt || msg.sentAt;
        const currentTime = new Date(sentAt);
        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        if (!lastTime || (currentTime - lastTime > gap)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(sentAt));
        }

        // Determine grouping with the previous message in DOM
        let prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        let prevTime = lastTime;
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === senderId;
        const closeTime = prevTime && (currentTime - prevTime < groupGap);
        const groupedWithPrev = sameSender && closeTime;

        // New message is always 'last' or 'single' in its group (nothing comes after)
        const groupPos = groupedWithPrev ? 'last' : 'single';

        // Update previous message's groupPos if we're grouping with it
        if (groupedWithPrev && lastMsgEl) {
            if (lastMsgEl.classList.contains('msg-group-single')) {
                lastMsgEl.classList.replace('msg-group-single', 'msg-group-first');
            } else if (lastMsgEl.classList.contains('msg-group-last')) {
                lastMsgEl.classList.replace('msg-group-last', 'msg-group-middle');
            }
            // Update avatar visibility on previous message
            const prevAvatar = lastMsgEl.querySelector('.msg-avatar');
            if (prevAvatar && !prevAvatar.classList.contains('msg-avatar-spacer')) {
                prevAvatar.classList.add('msg-avatar-spacer');
                prevAvatar.innerHTML = '';
            }
        }

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
            authorName
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
            
            // render initial status immediately
            const statusEl = document.createElement('div');
            statusEl.className = 'msg-status';
            
            if (msg.status === 'pending') {
                statusEl.className += ' msg-status-sending';
                statusEl.innerHTML = '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
            } else if (msg.status === 'sent') {
                statusEl.className += ' msg-status-sent';
                statusEl.textContent = 'Sent';
            } else if (msg.status === 'failed') {
                statusEl.className += ' msg-status-failed';
                statusEl.textContent = 'Failed to send. Click to retry.';
            }
            
            bubble.appendChild(statusEl);
        }
        
        msgContainer.appendChild(bubble);
        if (messageId) {
            this.applyPendingSeenForMessage(this.currentChatId, messageId);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    async sendMessage() {
        const input = document.getElementById('chat-message-input');
        const content = input.value.trim();
        if ((!content && this.pendingFiles.length === 0) || !this.currentChatId) return;

        // generate temp message id
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Prepare local preview URLs for optimistic UI if there are files
        const medias = this.pendingFiles.map(file => ({
            mediaUrl: URL.createObjectURL(file), // Local preview link
            mediaType: file.type.startsWith('video/') ? 1 : 0
        }));

        // New outgoing message: clear any previous "Sent" indicators
        const msgContainer = document.getElementById('chat-view-messages');
        msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
            el.removeAttribute('data-status');
            el.querySelector('.msg-status')?.remove();
        });

        // optimistic ui - show message immediately with pending state
        this.appendMessage({ 
            tempId,
            content, 
            medias: medias.length > 0 ? medias : null,
            sentAt: new Date(), 
            isOwn: true,
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

        // Clear input and pending state immediately
        input.value = '';
        input.style.height = 'auto';
        this.pendingFiles = [];
        this.updateAttachmentPreview();
        this.updateInputState();

        const formData = new FormData();
        if (content) formData.append('Content', content);
        filesToSend.forEach(file => {
            formData.append('MediaFiles', file);
        });

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
                this.updateMessageStatus(tempId, 'sent', content, msg?.messageId || msg?.MessageId);
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

        previewEl.innerHTML = '';
        
        this.pendingFiles.forEach((file, index) => {
            const isVideo = file.type.startsWith('video/');
            const url = URL.createObjectURL(file);

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

    updateMessageStatus(tempId, status, content, realId = null) {
        const bubble = document.querySelector(`[data-temp-id="${tempId}"]`);
        if (!bubble) return;

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
        
        // Remove existing status indicators from THIS bubble
        const existingStatus = bubble.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();
        
        // If this message is being marked as SENT, remove "Sent" status from all PREVIOUS messages
        if (status === 'sent') {
            document.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
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
        
        const formData = new FormData();
        formData.append('Content', content);
        
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
                this.updateMessageStatus(tempId, 'sent', content, msg?.messageId || msg?.MessageId);
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
