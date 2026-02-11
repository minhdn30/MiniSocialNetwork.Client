/**
 * Chat Window Module (formerly ChatMessenger)
 * Handles floating chat windows for quick conversations.
 */
const ChatWindow = {
    openChats: new Map(), // conversationId -> DOM elements
    maxOpenChats: 3,
    retryFiles: new Map(), // tempId -> File[]
    pendingSeenByConv: new Map(),
    
    init() {
        if (!document.getElementById('chat-container')) {
            const container = document.createElement('div');
            container.id = 'chat-container';
            container.className = 'chat-window-container';
            document.body.appendChild(container);
        }

        // Setup global click-outside for ALL chat window emoji pickers
        if (window.EmojiUtils) {
            window.EmojiUtils.setupClickOutsideHandler('.chat-window-emoji-container', '.chat-action-btn');
        }

        // Click outside to lose focus
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.chat-box')) {
                document.querySelectorAll('.chat-box.is-focused').forEach(b => b.classList.remove('is-focused'));
            }
        });

        this.registerRealtimeHandlers();
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
            this.moveSeenAvatar(conversationId, item.accountId, msgId, item.memberInfo);
        });
        if (convMap.size === 0) {
            this.pendingSeenByConv.delete(convId);
        }
    },

    getOpenChatId(convId) {
        if (!convId) return null;
        if (this.openChats.has(convId)) return convId;
        const target = convId.toLowerCase();
        for (const id of this.openChats.keys()) {
            if (id.toLowerCase() === target) return id;
        }
        return null;
    },

    handleRealtimeMessage(msg) {
        const convIdRaw = msg.ConversationId || msg.conversationId;
        const convId = this.getOpenChatId(convIdRaw);
        if (!convId) return;

        const messageIdRaw = msg.MessageId || msg.messageId;
        const messageId = messageIdRaw ? messageIdRaw.toString().toLowerCase() : null;
        const tempId = msg.TempId || msg.tempId;
        const rawSenderId = msg.Sender?.AccountId || msg.sender?.accountId || msg.SenderId || msg.senderId || '';
        const senderId = rawSenderId.toLowerCase();
        const content = (msg.Content || msg.content || '').trim();

        // De-duplication check
        if (messageId && document.querySelector(`#chat-messages-${convId} [data-message-id="${messageId}"]`)) {
            return;
        }
        if (tempId && document.querySelector(`#chat-messages-${convId} [data-temp-id="${tempId}"]`)) {
            return;
        }

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const incomingMedias = msg.Medias || msg.medias || [];
        if (senderId === myId) {
            const msgContainer = document.getElementById(`chat-messages-${convId}`);
            const optimisticMsgs = msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="pending"], .msg-bubble-wrapper.sent[data-status="sent"]');
            let matched = false;
            if (optimisticMsgs) {
                for (let opt of optimisticMsgs) {
                    const optContent = opt.querySelector('.msg-bubble')?.innerText?.trim() || '';
                    const optMediaCount = opt.querySelectorAll('.msg-media-item')?.length || 0;

                    // Match by content text (when non-empty)
                    const matchByContent = content && optContent === content;
                    // Match by media count (for image-only messages with no text)
                    const matchByMedia = !content && !optContent && incomingMedias.length > 0 && optMediaCount === incomingMedias.length;

                    if (matchByContent || matchByMedia) {
                        if (messageId) opt.dataset.messageId = messageId;
                        delete opt.dataset.status;
                        opt.querySelector('.msg-status')?.remove();

                        // Replace local blob URLs with real server URLs
                        if (incomingMedias.length > 0) {
                            const localItems = opt.querySelectorAll('.msg-media-item');
                            incomingMedias.forEach((m, i) => {
                                if (localItems[i]) {
                                    const mediaUrl = m.MediaUrl || m.mediaUrl;
                                    const img = localItems[i].querySelector('img');
                                    const vid = localItems[i].querySelector('video');
                                    if (img) img.src = mediaUrl;
                                    if (vid) vid.src = mediaUrl;
                                }
                            });
                        }

                        const seenRow = opt.querySelector('.msg-seen-row');
                        if (seenRow && messageId) seenRow.id = `seen-row-${messageId}`;

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
            const msgContainer = document.getElementById(`chat-messages-${convId}`);
            msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                el.removeAttribute('data-status');
                el.querySelector('.msg-status')?.remove();
            });
        }

        this.appendMessage(convId, msg);
        if (messageId) {
            this.applyPendingSeenForMessage(convId, messageId);
        }

        // DO NOT mark as seen immediately. Only when focused/clicked.
        const chatBox = document.getElementById(`chat-box-${convId}`);
        if (chatBox) {
            if (chatBox.classList.contains('is-focused')) {
                const lastId = messageId || this.getLastMessageId(convId);
                if (lastId) this.markConversationSeen(convId, lastId);
            } else if (senderId !== myId) {
                // If not focused and received from others, mark as unread visually
                chatBox.classList.add('has-unread');
            }
        }
    },

    handleMemberSeen(data) {
        const convIdRaw = data.ConversationId || data.conversationId;
        const convId = this.getOpenChatId(convIdRaw);
        if (!convId) {
            // Still forward to sidebar even if no chat window is open
            const accId = data.AccountId || data.accountId;
            if (window.ChatSidebar && typeof window.ChatSidebar.updateSeenInSidebar === 'function') {
                window.ChatSidebar.updateSeenInSidebar(convIdRaw, accId);
            }
            return;
        }

        const accId = data.AccountId || data.accountId;
        const msgIdRaw = data.LastSeenMessageId || data.lastSeenMessageId;
        const msgId = msgIdRaw ? msgIdRaw.toString().toLowerCase() : msgIdRaw;
        this.moveSeenAvatar(convId, accId, msgId);

        // Forward to sidebar to update seen indicator
        if (window.ChatSidebar && typeof window.ChatSidebar.updateSeenInSidebar === 'function') {
            window.ChatSidebar.updateSeenInSidebar(convIdRaw, accId);
        }
    },

    /**
     * Mark a conversation as seen (read).
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
                        const conv = window.ChatSidebar.conversations.find(c => c.conversationId === conversationId);
                        const wasUnread = conv && conv.unreadCount > 0;
                        window.ChatSidebar.clearUnread(conversationId);
                        if (wasUnread && typeof scheduleGlobalUnreadRefresh === 'function') {
                            scheduleGlobalUnreadRefresh();
                        }
                    }
                })
                .catch(err => console.error('SeenConversation error:', err));
        }
    },

    /**
     * Get the last message ID from a chat window's message container.
     */
    getLastMessageId(conversationId) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return null;
        const allMsgs = msgContainer.querySelectorAll('[data-message-id]');
        if (allMsgs.length === 0) return null;
        return allMsgs[allMsgs.length - 1].dataset.messageId;
    },

    scrollToBottom(conversationId) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return;

        const doScroll = () => {
            msgContainer.scrollTop = msgContainer.scrollHeight;
        };

        doScroll();
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 100);
    },

    /**
     * Move (or create) a member's seen avatar to a specific message's seen row in a chat window
     */
    moveSeenAvatar(conversationId, accountId, messageId, memberInfo = null) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return;
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        if ((accountId || '').toLowerCase() === myId) return;

        // Resolve info from metadata if missing (realtime event)
        if (!memberInfo) {
            const chatObj = this.openChats.get(conversationId);
            const targetId = accountId.toLowerCase();
            if (chatObj?.metaData?.memberSeenStatuses) {
                const member = chatObj.metaData.memberSeenStatuses.find(m => {
                    const mId = (m.accountId || m.AccountId || '').toLowerCase();
                    return mId === targetId;
                });
                if (member) {
                    memberInfo = {
                        avatar: member.avatarUrl || member.AvatarUrl,
                        name: member.displayName || member.DisplayName
                    };
                }
            }
            // Fallback: use conv data (otherMember / displayAvatar) for 1:1 chats
            if (!memberInfo && chatObj?.data) {
                const other = chatObj.data.otherMember;
                if (other && (other.accountId || '').toLowerCase() === targetId) {
                    memberInfo = {
                        avatar: other.avatarUrl || other.AvatarUrl,
                        name: other.displayName || other.DisplayName || other.username || other.Username
                    };
                }
                // Final fallback: conversation display avatar (1:1 only)
                if (!memberInfo && !chatObj.data.isGroup) {
                    memberInfo = {
                        avatar: chatObj.data.displayAvatar,
                        name: chatObj.data.displayName
                    };
                }
            }
        }

        // 1. Remove existing if any in this window
        const existing = msgContainer.querySelector(`.seen-avatar[data-account-id="${accountId}"]`);
        if (existing) {
            existing.remove();
        }

        // 2. Find target bubble (by messageId), then pick correct seen-row
        const normMessageId = messageId ? messageId.toString().toLowerCase() : messageId;
        let bubbleWrapper = normMessageId ? msgContainer.querySelector(`.msg-bubble-wrapper[data-message-id="${normMessageId}"]`) : null;
        let targetRow = bubbleWrapper?.querySelector('.msg-seen-row') || null;

        // If target isn't our message (or row missing), move to latest previous message sent by us
        if (!bubbleWrapper || (bubbleWrapper.dataset.senderId || '').toLowerCase() !== myId) {
            let cursor = bubbleWrapper ? bubbleWrapper.previousElementSibling : null;
            // If bubbleWrapper is null, start from LAST element in container
            if (!cursor && !bubbleWrapper) {
                cursor = msgContainer.lastElementChild;
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
            this.queuePendingSeen(conversationId, normMessageId || messageId, accountId, memberInfo);
            return;
        }

        // Remove "Sent" status on the message that is now seen
        const statusEl = targetRow.closest('.msg-bubble-wrapper')?.querySelector('.msg-status');
        if (statusEl) {
            statusEl.remove();
        }
        const statusBubble = targetRow.closest('.msg-bubble-wrapper');
        if (statusBubble?.dataset?.status === 'sent') {
            statusBubble.removeAttribute('data-status');
        }

        // 3. Create or reconstruct avatar
        const avatarUrl = memberInfo?.avatar || existing?.src || APP_CONFIG.DEFAULT_AVATAR;
        const displayName = memberInfo?.name || existing?.title || 'User';

        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'seen-avatar';
        img.dataset.accountId = accountId;
        img.title = displayName;
        img.onerror = () => img.src = APP_CONFIG.DEFAULT_AVATAR;

        targetRow.appendChild(img);
    },

    /**
     * Initial render for all members' seen indicators in a chat window
     */
    updateMemberSeenStatuses(conversationId, meta) {
        if (!meta || !meta.memberSeenStatuses) return;
        const myId = localStorage.getItem('accountId');

        meta.memberSeenStatuses.forEach(member => {
            if (member.accountId === myId) return;
            if (!member.lastSeenMessageId) return;
            
            const lastSeenId = member.lastSeenMessageId ? member.lastSeenMessageId.toString().toLowerCase() : member.lastSeenMessageId;
            this.moveSeenAvatar(conversationId, member.accountId, lastSeenId, {
                avatar: member.avatarUrl,
                name: member.displayName
            });
        });
    },

    openChat(conv) {
        if (!conv) return;
        const convId = conv.conversationId;

        if (this.openChats.has(convId)) {
            const chatBox = this.openChats.get(convId).element;
            chatBox.classList.add('show');
            this.focusChat(convId);
            return;
        }

        if (this.openChats.size >= this.maxOpenChats) {
            const firstId = this.openChats.keys().next().value;
            this.closeChat(firstId);
        }

        this.renderChatBox(conv);

        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(convId);
        if (isGuid && window.ChatRealtime && typeof window.ChatRealtime.joinConversation === 'function') {
            window.ChatRealtime.joinConversation(convId)
                .then(() => console.log(`✅ Joined Conv-${convId} group`))
                .catch(err => console.error("Error joining conversation group:", err));
        }
    },

    async openByAccountId(accountId) {
        if (!accountId) return;
        
        // Find if already open
        for (const [id, chat] of this.openChats) {
            if (chat.data.otherMember?.accountId === accountId) {
                this.openChat(chat.data);
                return;
            }
        }

        try {
            const res = await window.API.Conversations.getPrivateWithMessages(accountId);
            if (res.ok) {
                const data = await res.json();
                const chatData = data.metaData;
                
                // If it's a new chat, we need a temp ID for the UI
                if (data.isNew || !chatData.conversationId || chatData.conversationId === '00000000-0000-0000-0000-000000000000') {
                    chatData.conversationId = `new-${accountId}`;
                }
                
                this.openChat(chatData);
            }
        } catch (error) {
            console.error("Failed to open chat by account ID:", error);
        }
    },

    renderChatBox(conv) {
        const container = document.getElementById('chat-container');
        const avatar = ChatCommon.getAvatar(conv);
        const name = escapeHtml(ChatCommon.getDisplayName(conv));
        const subtext = conv.isGroup ? 'Group Chat' : (conv.otherMember?.isActive ? 'Online' : 'Offline');

        const chatBox = document.createElement('div');
        chatBox.className = 'chat-box';
        chatBox.id = `chat-box-${conv.conversationId}`;
        chatBox.onclick = () => this.focusChat(conv.conversationId);

        chatBox.innerHTML = `
            <div class="chat-box-header" onclick="event.stopPropagation(); ChatWindow.toggleMinimize('${conv.conversationId}')">
                <div class="chat-header-info">
                    <div class="chat-header-avatar">
                        <img src="${avatar}" alt="${name}" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
                        ${!conv.isGroup && conv.otherMember?.isActive ? '<div class="chat-header-status"></div>' : ''}
                    </div>
                    <div class="chat-header-text">
                        <div class="chat-header-name" title="${name}">${name}</div>
                        <div class="chat-header-subtext">${subtext}</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-btn" onclick="event.stopPropagation(); ChatWindow.toggleMinimize('${conv.conversationId}')">
                        <i data-lucide="minus"></i>
                    </button>
                    <button class="chat-btn close" onclick="event.stopPropagation(); ChatWindow.closeChat('${conv.conversationId}')">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages-${conv.conversationId}">
                <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:12px;">
                    Starting chat...
                </div>
            </div>
            <div class="chat-input-area" id="chat-input-area-${conv.conversationId}">
                <div class="chat-window-attachment-preview" id="chat-window-preview-${conv.conversationId}"></div>
                
                <div class="chat-window-emoji-container" id="chat-emoji-container-${conv.conversationId}"></div>

                <div class="chat-input-wrapper">
                    <div class="chat-window-input-actions">
                         <button class="chat-toggle-actions" onclick="event.stopPropagation(); ChatWindow.toggleExpansionMenu('${conv.conversationId}')">
                            <i data-lucide="plus-circle"></i>
                        </button>
                        <div class="chat-actions-group" id="chat-actions-group-${conv.conversationId}">
                               <button class="chat-action-btn" title="Emoji" onclick="ChatWindow.openEmojiPicker(this, '${conv.conversationId}')">
                                    <i data-lucide="smile"></i>
                                </button>
                                <button class="chat-action-btn" title="Media" onclick="ChatWindow.openFilePicker('${conv.conversationId}')">
                                    <i data-lucide="image"></i>
                                </button>
                                <button class="chat-action-btn" title="File" onclick="window.toastInfo && window.toastInfo('Feature coming soon')">
                                    <i data-lucide="paperclip"></i>
                                </button>
                        </div>
                    </div>

                    <div class="chat-input-field" contenteditable="true" placeholder="Type a message..." 
                         oninput="ChatWindow.handleInput(this, '${conv.conversationId}')"
                         onkeydown="ChatWindow.handleKeyDown(event, '${conv.conversationId}')"
                         onpaste="ChatWindow.handlePaste(event)"
                         data-placeholder-visible="true"></div>
                    
                    <div class="chat-input-actions-end">
                        <button class="chat-send-btn" id="send-btn-${conv.conversationId}" disabled onclick="ChatWindow.sendMessage('${conv.conversationId}')">
                            <i data-lucide="send"></i>
                        </button>
                    </div>
                </div>
                <input type="file" id="chat-file-input-${conv.conversationId}" class="chat-window-file-input" multiple accept="image/*,video/*">
            </div>
        `;

        container.appendChild(chatBox);
        setTimeout(() => chatBox.classList.add('show'), 10);
        
        // Render Lucide icons for the new box
        if (window.lucide) window.lucide.createIcons();

        this.openChats.set(conv.conversationId, {
            element: chatBox,
            data: conv,
            page: 1,
            hasMore: true,
            isLoading: false,
            pendingFiles: []
        });

        const fileInput = chatBox.querySelector(`#chat-file-input-${conv.conversationId}`);
        if (fileInput) {
            fileInput.onchange = () => {
                const files = fileInput.files;
                if (files && files.length > 0) {
                    this.handleMediaUpload(conv.conversationId, files);
                    fileInput.value = '';
                }
            };
        }
        lucide.createIcons();
        this.loadInitialMessages(conv.conversationId);
        // Initial focus
        setTimeout(() => this.focusChat(conv.conversationId), 100);
    },

    toggleMinimize(id) {
        const chat = this.openChats.get(id);
        if (chat) {
            chat.element.classList.toggle('minimized');
            if (!chat.element.classList.contains('minimized')) {
                this.focusChat(id);
            } else {
                // If minimized, explicitly remove focus
                chat.element.classList.remove('is-focused');
            }
        }
    },

    focusChat(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        const chatBox = chat.element;
        
        // Remove unread state
        chatBox.classList.remove('has-unread');
        
        // Remove focus from all others
        document.querySelectorAll('.chat-box.is-focused').forEach(b => {
             if (b !== chatBox) b.classList.remove('is-focused');
        });

        if (!chatBox.classList.contains('is-focused')) {
            chatBox.classList.add('is-focused');
            
            // Mark as seen on focus
            const lastId = this.getLastMessageId(id);
            if (lastId) this.markConversationSeen(id, lastId);
        }

        // Auto-focus input if not minimized
        const inputField = chatBox.querySelector('.chat-input-field');
        if (inputField && !chatBox.classList.contains('minimized')) {
            inputField.focus();
        }
    },

    closeChat(id) {
        const chat = this.openChats.get(id);
        if (chat) {
            this.pendingSeenByConv.delete(id.toLowerCase());
            // Leave the SignalR group
            // Only leave if not open in ChatPage
            const isOpenInPage = window.ChatPage && window.ChatPage.currentChatId === id;
            if (!isOpenInPage && window.ChatRealtime && typeof window.ChatRealtime.leaveConversation === 'function') {
                window.ChatRealtime.leaveConversation(id)
                    .then(() => console.log(`👋 Left Conv-${id} group`))
                    .catch(err => console.error("Error leaving conversation group:", err));
            }

            chat.element.classList.remove('show');
            setTimeout(() => {
                chat.element.remove();
                this.openChats.delete(id);
            }, 300);
        }
    },

    closeAll() {
        for (const id of Array.from(this.openChats.keys())) {
            this.closeChat(id);
        }
    },

    handleInput(field, id) {
        this.updateSendButtonState(id);
        this.updatePlaceholderState(field);
        
        // Auto-resize
        field.style.height = 'auto';
        const newHeight = field.scrollHeight;
        
        const wrapper = field.closest('.chat-input-wrapper');
        const container = field.closest('.chat-input-area');
        
        if (wrapper) {
            wrapper.classList.toggle('expanded', newHeight > 34);
        }

        if (container) {
            const hasText = field.innerText.trim().length > 0;
            container.classList.toggle('has-content', hasText);
            
            // If has content, automatically hide action icons unless expanded
            if (hasText) {
                 const actionsGroup = container.querySelector('.chat-actions-group');
                 if (actionsGroup) actionsGroup.classList.remove('is-show');
            }
        }
    },

    updatePlaceholderState(field) {
        const text = field.innerText.trim();
        // If it's effectively empty (handling <br> or whitespace), mark it
        const isEmpty = text.length === 0;
        field.dataset.placeholderVisible = isEmpty ? "true" : "false";
        
        // Ensure it's truly empty if effectively empty (removes <br>)
        if (isEmpty && field.innerHTML !== '') {
            field.innerHTML = '';
        }
    },

    resetInput(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        const inputField = chat.element.querySelector('.chat-input-field');
        if (!inputField) return;

        inputField.innerHTML = ''; // Clear everything
        inputField.style.height = 'auto';
        inputField.dataset.placeholderVisible = "true";
        
        const wrapper = inputField.closest('.chat-input-wrapper');
        if (wrapper) wrapper.classList.remove('expanded');
        
        this.updateSendButtonState(id);
    },

    handleKeyDown(event, id) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage(id);
        }
    },

    handlePaste(e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    },

    toggleExpansionMenu(id) {
        const container = document.getElementById(`chat-input-area-${id}`);
        const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
        if (!actionsGroup) return;
        
        actionsGroup.classList.toggle('is-show');
        
        // Close when clicking outside
        if (actionsGroup.classList.contains('is-show')) {
            const closeHandler = (e) => {
                if (!actionsGroup.contains(e.target) && !e.target.closest('.chat-toggle-actions')) {
                    actionsGroup.classList.remove('is-show');
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 10);
        }
    },

    openEmojiPicker(btn, id) {
        const container = document.getElementById(`chat-emoji-container-${id}`);
        if (!container || !window.EmojiUtils) return;
        
        // Hide expansion menu first
        const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
        if (actionsGroup) actionsGroup.classList.remove('is-show');

        window.EmojiUtils.togglePicker(container, (emoji) => {
            const inputField = document.querySelector(`#chat-box-${id} .chat-input-field`);
            if (inputField) {
                // Focus input first
                inputField.focus();
                document.execCommand('insertText', false, emoji.native);
                this.handleInput(inputField, id);
            }
        });
    },

    openFilePicker(id) {
        const input = document.getElementById(`chat-file-input-${id}`);
        if (input) input.click();
        
        // Hide expansion menu
        const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
        if (actionsGroup) actionsGroup.classList.remove('is-show');
    },

    updateSendButtonState(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        const inputField = chat.element.querySelector('.chat-input-field');
        const sendBtn = document.getElementById(`send-btn-${id}`);
        const hasText = inputField?.innerText.trim().length > 0;
        const hasFiles = chat.pendingFiles && chat.pendingFiles.length > 0;
        if (sendBtn) sendBtn.disabled = !(hasText || hasFiles);
    },

    handleMediaUpload(id, files) {
        const chat = this.openChats.get(id);
        if (!chat || !files || files.length === 0) return;

        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 5;
        const maxSizeMB = window.APP_CONFIG?.MAX_CHAT_FILE_SIZE_MB || 10;
        const currentCount = chat.pendingFiles.length;

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

        chat.pendingFiles.push(...validFiles);
        this.updateAttachmentPreview(id);
        this.updateSendButtonState(id);
    },

    updateAttachmentPreview(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;

        const previewEl = document.getElementById(`chat-window-preview-${id}`);
        if (!previewEl) return;
        previewEl.innerHTML = '';

        chat.pendingFiles.forEach((file, index) => {
            const isVideo = file.type.startsWith('video/');
            const url = URL.createObjectURL(file);

            const item = document.createElement('div');
            item.className = 'chat-window-preview-item';
            item.innerHTML = `
                ${isVideo ? `<video src="${url}"></video>` : `<img src="${url}" alt="preview">`}
                <div class="chat-window-preview-remove" onclick="ChatWindow.removeAttachment('${id}', ${index})">
                    <i data-lucide="x"></i>
                </div>
            `;
            previewEl.appendChild(item);
        });

        // Add the "+" button like Facebook Messenger if under limit
        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 5;
        if (chat.pendingFiles.length > 0 && chat.pendingFiles.length < maxFiles) {
            const addBtn = document.createElement('div');
            addBtn.className = 'chat-window-preview-add-btn';
            addBtn.innerHTML = '<i data-lucide="plus"></i>';
            addBtn.onclick = () => document.getElementById(`chat-file-input-${id}`).click();
            previewEl.appendChild(addBtn);
        }

        if (window.lucide) lucide.createIcons();
    },

    removeAttachment(id, index) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        chat.pendingFiles.splice(index, 1);
        this.updateAttachmentPreview(id);
        this.updateSendButtonState(id);
    },

    async loadInitialMessages(id) {
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer) return;

        if (id.startsWith('new-')) {
            msgContainer.innerHTML = '<div style="padding:20px; font-size:12px; text-align:center; color:var(--text-tertiary);">Say hello!</div>';
            return;
        }

        const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
        const chat = this.openChats.get(id);
        const isGroup = chat?.data?.isGroup || false;
        const myId = localStorage.getItem('accountId');

        try {
            const res = await window.API.Conversations.getMessages(id, 1, pageSize);
            if (res.ok) {
                const data = await res.json();
                msgContainer.innerHTML = '';
                const messages = (data.messages?.items || []).reverse();

                let lastTime = null;

                messages.forEach((m, idx) => {
                    if (!m.messageId && m.MessageId) m.messageId = m.MessageId.toString().toLowerCase();
                    if (!m.sentAt && m.SentAt) m.sentAt = m.SentAt;
                    m.isOwn = m.sender?.accountId === myId;

                    // Time separator (same logic as chat-page: 15 min gap)
                    const currentTime = new Date(m.sentAt);
                    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
                    if (!lastTime || (currentTime - lastTime > gap)) {
                        msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(m.sentAt));
                    }
                    lastTime = currentTime;

                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

                    const senderAvatar = !m.isOwn ? (m.sender?.avatarUrl || '') : '';
                    const authorName = isGroup && !m.isOwn
                        ? (m.sender?.nickname || m.sender?.username || m.sender?.fullName || '')
                        : '';

                    const html = ChatCommon.renderMessageBubble(m, {
                        isGroup,
                        groupPos,
                        senderAvatar,
                        authorName
                    });

                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const bubble = tempDiv.firstElementChild;
                    bubble.dataset.sentAt = m.sentAt;
                    bubble.dataset.senderId = m.sender?.accountId || myId;
                    msgContainer.appendChild(bubble);
                });

                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                });

                // Update pagination state
                const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
                chat.page = 2;
                chat.hasMore = messages.length >= pageSize;

                // Attach scroll listener for load-more
                this.initScrollListener(id);

                // Scroll to bottom
                this.scrollToBottom(id);

                // DO NOT mark as seen immediately on load. 
                // Wait for interaction.

                // Initial render for seen indicators
                if (data.metaData) {
                    setTimeout(() => this.updateMemberSeenStatuses(id, data.metaData), 50);
                }
            }
        } catch (error) {
            console.error("Failed to load chat window messages:", error);
            msgContainer.innerHTML = '<div style="padding:10px; font-size:11px; text-align:center;">Error loading messages</div>';
        }
    },

    initScrollListener(id) {
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer) return;

        msgContainer.onscroll = () => {
            const chat = this.openChats.get(id);
            if (!chat || chat.isLoading || !chat.hasMore) return;

            // If scrolled near top (threshold 30px for compact window)
            if (msgContainer.scrollTop <= 30) {
                this.loadMoreMessages(id);
            }
        };
    },

    async loadMoreMessages(id) {
        const chat = this.openChats.get(id);
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!chat || !msgContainer || chat.isLoading || !chat.hasMore) return;

        chat.isLoading = true;
        const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
        const isGroup = chat.data?.isGroup || false;
        const myId = localStorage.getItem('accountId');
        const oldScrollHeight = msgContainer.scrollHeight;

        try {
            const res = await window.API.Conversations.getMessages(id, chat.page, pageSize);
            if (res.ok) {
                const data = await res.json();
                const messages = (data.messages?.items || []).reverse();

                if (messages.length < pageSize) {
                    chat.hasMore = false;
                }

                // Build HTML to prepend
                let html = '';
                let lastTime = null;

                messages.forEach((m, idx) => {
                    if (!m.messageId && m.MessageId) m.messageId = m.MessageId.toString().toLowerCase();
                    if (!m.sentAt && m.SentAt) m.sentAt = m.SentAt;
                    m.isOwn = m.sender?.accountId === myId;

                    const currentTime = new Date(m.sentAt);
                    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
                    if (!lastTime || (currentTime - lastTime > gap)) {
                        html += ChatCommon.renderChatSeparator(m.sentAt);
                    }
                    lastTime = currentTime;

                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

                    const senderAvatar = !m.isOwn ? (m.sender?.avatarUrl || '') : '';
                    const authorName = isGroup && !m.isOwn
                        ? (m.sender?.nickname || m.sender?.username || m.sender?.fullName || '')
                        : '';

                    html += ChatCommon.renderMessageBubble(m, {
                        isGroup,
                        groupPos,
                        senderAvatar,
                        authorName
                    });
                });

                msgContainer.insertAdjacentHTML('afterbegin', html);

                // Maintain scroll position
                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                });

                chat.page++;
            }
        } catch (error) {
            console.error("Failed to load more messages:", error);
        } finally {
            chat.isLoading = false;
        }
    },

    appendMessage(id, msg) {
        const chat = this.openChats.get(id);
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer || !chat) return;

        const isGroup = chat.data.isGroup;
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        
        if (msg.isOwn === undefined) {
            msg.isOwn = (msg.sender?.accountId || msg.senderId || '').toLowerCase() === myId;
        }
        if (!msg.messageId && msg.MessageId) {
            msg.messageId = msg.MessageId.toString().toLowerCase();
        }

        // Time separator
        const lastMsgEl = msgContainer.querySelector('.msg-bubble-wrapper:last-of-type');
        const prevTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
        const currentTime = new Date(msg.sentAt);
        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        if (!prevTime || (currentTime - prevTime > gap)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(msg.sentAt));
        }

        // Determine grouping
        const prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        
        let senderId = (msg.sender?.accountId || msg.SenderId || msg.senderId || '').toLowerCase();
        if (!senderId && msg.isOwn) senderId = myId;
        
        const sameSender = prevSenderId && prevSenderId === senderId;
        const closeTime = prevTime && (currentTime - prevTime < groupGap);
        const groupedWithPrev = sameSender && closeTime;
        const groupPos = groupedWithPrev ? 'last' : 'single';

        // Update previous message
        if (groupedWithPrev && lastMsgEl) {
            if (lastMsgEl.classList.contains('msg-group-single')) {
                lastMsgEl.classList.replace('msg-group-single', 'msg-group-first');
            } else if (lastMsgEl.classList.contains('msg-group-last')) {
                lastMsgEl.classList.replace('msg-group-last', 'msg-group-middle');
            }
            const prevAvatar = lastMsgEl.querySelector('.msg-avatar');
            if (prevAvatar && !prevAvatar.classList.contains('msg-avatar-spacer')) {
                prevAvatar.classList.add('msg-avatar-spacer');
                prevAvatar.innerHTML = '';
            }
        }

        const senderAvatar = !msg.isOwn ? (msg.sender?.avatarUrl || '') : '';
        const authorName = isGroup && !msg.isOwn
            ? (msg.sender?.nickname || msg.sender?.username || msg.sender?.fullName || '')
            : '';

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = ChatCommon.renderMessageBubble(msg, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName
        });

        const bubble = tempDiv.firstElementChild;
        bubble.dataset.sentAt = msg.sentAt;
        bubble.dataset.senderId = senderId;
        
        if (msg.tempId) bubble.dataset.tempId = msg.tempId;
        if (msg.messageId) bubble.dataset.messageId = msg.messageId;

        if (msg.status) {
            bubble.dataset.status = msg.status;
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
        if (msg.messageId) {
            this.applyPendingSeenForMessage(id, msg.messageId);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    async sendMessage(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        
        const inputField = chat.element.querySelector('.chat-input-field');
        const content = inputField.innerText.trim();
        const hasText = content.length > 0;
        const hasFiles = chat.pendingFiles && chat.pendingFiles.length > 0;
        
        if (!hasText && !hasFiles) return;

        // generate temp message id for tracking
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // optimistic ui - include local media previews if any
        const filesToSend = [...(chat.pendingFiles || [])];
        const medias = filesToSend.map(file => ({
            mediaUrl: URL.createObjectURL(file),
            mediaType: file.type.startsWith('video/') ? 1 : 0
        }));

        if (filesToSend.length > 0) {
            this.retryFiles.set(tempId, filesToSend);
        }

        // New outgoing message: clear any previous "Sent" indicators
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        msgContainer?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
            el.removeAttribute('data-status');
            el.querySelector('.msg-status')?.remove();
        });

        // optimistic ui - show message immediately with pending state
        this.appendMessage(id, { 
            tempId,
            content: hasText ? content : '', 
            medias: medias.length > 0 ? medias : null,
            sentAt: new Date(), 
            isOwn: true,
            status: 'pending'  // pending, sent, failed
        });
        
        // Update Sidebar immediately
        if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
            window.ChatSidebar.incrementUnread(id, {
                content,
                sender: { accountId: (localStorage.getItem('accountId') || '') },
                sentAt: new Date()
            });
        }
        
        // Clear input and state
        this.resetInput(id);
        inputField.focus();
        
        // Clear pending files and preview
        chat.pendingFiles = [];
        this.updateAttachmentPreview(id);

        const formData = new FormData();
        if (hasText) formData.append('Content', content);
        filesToSend.forEach(file => {
            formData.append('MediaFiles', file);
        });

        try {
            let res;
            
            if (chat.data.isGroup) {
                // group chat - use group API with conversationId
                res = await window.API.Messages.sendGroup(id, formData);
            } else {
                // private chat (1:1) - use private API with receiverId
                if (id.startsWith('new-')) {
                    // new conversation - extract receiverId from temp ID
                    const receiverId = id.replace('new-', '');
                    formData.append('ReceiverId', receiverId);
                } else if (chat.data.otherMember) {
                    // existing conversation - use otherMember's accountId
                    formData.append('ReceiverId', chat.data.otherMember.accountId);
                } else {
                    console.error("Cannot determine receiverId for private chat");
                    this.updateMessageStatus(id, tempId, 'failed', content);
                    return;
                }
                res = await window.API.Messages.sendPrivate(formData);
            }
            
            if (res.ok) {
                const msg = await res.json();
                
                // update message to sent status
                this.updateMessageStatus(id, tempId, 'sent', content, msg.messageId);
                this.retryFiles.delete(tempId);
                
                // if it was a 'new-' chat, update to real conversationId
                if (id.startsWith('new-')) {
                    const realId = msg.conversationId;
                    
                    // update mapping
                    this.openChats.delete(id);
                    chat.data.conversationId = realId;
                    this.openChats.set(realId, chat);
                    
                    // update DOM
                    chat.element.id = `chat-box-${realId}`;
                    const msgContainer = chat.element.querySelector('.chat-messages');
                    if (msgContainer) msgContainer.id = `chat-messages-${realId}`;

                    const sendBtn = chat.element.querySelector('.chat-send-btn');
                    if (sendBtn) sendBtn.id = `send-btn-${realId}`;

                    const fileInput = chat.element.querySelector('.chat-window-file-input');
                    if (fileInput) {
                        fileInput.id = `chat-file-input-${realId}`;
                        fileInput.onchange = () => {
                            const files = fileInput.files;
                            if (files && files.length > 0) {
                                this.handleMediaUpload(realId, files);
                                fileInput.value = '';
                            }
                        };
                    }

                    const preview = chat.element.querySelector('.chat-window-attachment-preview');
                    if (preview) preview.id = `chat-window-preview-${realId}`;

                    // update handlers
                    const header = chat.element.querySelector('.chat-box-header');
                    if (header) header.onclick = () => this.toggleMinimize(realId);

                    const minimizeBtn = chat.element.querySelector('.chat-header-actions .chat-btn:not(.close)');
                    if (minimizeBtn) minimizeBtn.onclick = (event) => {
                        event.stopPropagation();
                        this.toggleMinimize(realId);
                    };

                    const closeBtn = chat.element.querySelector('.chat-header-actions .chat-btn.close');
                    if (closeBtn) closeBtn.onclick = (event) => {
                        event.stopPropagation();
                        this.closeChat(realId);
                    };

                    const addMediaBtn = chat.element.querySelector('.chat-add-media-btn');
                    if (addMediaBtn) addMediaBtn.onclick = (event) => {
                        event.stopPropagation();
                        this.openFilePicker(realId);
                    };

                    const inputField = chat.element.querySelector('.chat-input-field');
                    if (inputField) {
                        inputField.onkeydown = (e) => this.handleKeyDown(e, realId);
                        inputField.oninput = (e) => this.handleInput(e, realId);
                    }

                    if (sendBtn) sendBtn.onclick = () => this.sendMessage(realId);

                    // Join the SignalR group for the newly created conversation
                    if (window.ChatRealtime && typeof window.ChatRealtime.joinConversation === 'function') {
                        window.ChatRealtime.joinConversation(realId)
                            .then(() => console.log(`✅ Joined Conv-${realId} group`))
                            .catch(err => console.error("Error joining conversation group:", err));
                    }
                }
            } else {
                // failed to send
                this.updateMessageStatus(id, tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to send message from window:", error);
            this.updateMessageStatus(id, tempId, 'failed', content);
        }
    },

    updateMessageStatus(chatId, tempId, status, content, realMessageId = null) {
        const msgContainer = document.getElementById(`chat-messages-${chatId}`);
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;

        msgEl.dataset.status = status;
        if (status === 'sent') {
            this.retryFiles.delete(tempId);
        }
        
        if (realMessageId) {
            const normRealId = realMessageId ? realMessageId.toString().toLowerCase() : null;
            if (normRealId) msgEl.dataset.messageId = normRealId;
            const seenRow = msgEl.querySelector('.msg-seen-row');
            if (seenRow && normRealId) seenRow.id = `seen-row-${normRealId}`;
            if (normRealId) {
                this.applyPendingSeenForMessage(chatId, normRealId);
            }
        }
        
        // Remove existing status indicators from THIS bubble
        const existingStatus = msgEl.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();

        // If this message is being marked as SENT, remove "Sent" status from all PREVIOUS messages in this window
        if (status === 'sent') {
            msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                if (el !== msgEl) {
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
            statusEl.onclick = () => this.retryMessage(chatId, tempId, content);
        }
        
        msgEl.appendChild(statusEl);
    },

    async retryMessage(chatId, tempId, content) {
        const msgContainer = document.getElementById(`chat-messages-${chatId}`);
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        // update to pending
        this.updateMessageStatus(chatId, tempId, 'pending', content);
        
        // retry sending
        const chat = this.openChats.get(chatId);
        if (!chat) return;
        
        const formData = new FormData();
        const files = this.retryFiles.get(tempId) || [];
        const hasText = content && content.trim().length > 0;
        if (!hasText && files.length === 0) return;
        if (hasText) formData.append('Content', content);
        files.forEach(file => formData.append('MediaFiles', file));
        
        try {
            let res;
            
            if (chat.data.isGroup) {
                res = await window.API.Messages.sendGroup(chatId, formData);
            } else {
                if (chatId.startsWith('new-')) {
                    const receiverId = chatId.replace('new-', '');
                    formData.append('ReceiverId', receiverId);
                } else if (chat.data.otherMember) {
                    formData.append('ReceiverId', chat.data.otherMember.accountId);
                } else {
                    this.updateMessageStatus(chatId, tempId, 'failed', content);
                    return;
                }
                res = await window.API.Messages.sendPrivate(formData);
            }
            
            if (res.ok) {
                const msg = await res.json();
                this.updateMessageStatus(chatId, tempId, 'sent', content, msg.messageId);
                this.retryFiles.delete(tempId);
            } else {
                this.updateMessageStatus(chatId, tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to retry message:", error);
            this.updateMessageStatus(chatId, tempId, 'failed', content);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ChatWindow.init());
window.ChatWindow = ChatWindow;
window.ChatMessenger = ChatWindow;
