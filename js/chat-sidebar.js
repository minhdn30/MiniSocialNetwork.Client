/**
 * Chat Sidebar Component (formerly ChatPanel)
 * Handles the conversation list sidebar
 */
const ChatSidebar = {
    isOpen: false,
    conversations: [],
    currentFilter: null, // null = All, true = Private, false = Group
    searchTimeout: null,
    searchTerm: '',
    page: 1,
    isLoading: false,
    hasMore: true,
    pageSize: window.APP_CONFIG?.CONVERSATIONS_PAGE_SIZE || 20,
    currentActiveId: null, // ID of the currently active chat (for highlighting)

    async init() {
        if (!document.getElementById('chat-panel')) {
            const panel = document.createElement('div');
            panel.id = 'chat-panel';
            panel.className = 'chat-sidebar-panel'; // Renamed class for clarity
            document.body.appendChild(panel);
            this.renderLayout();
            this.initScrollListener();
        }

        document.addEventListener('click', (e) => {
            const isMessagesPage = window.location.hash.startsWith('#/messages');
            if (isMessagesPage) return; 
            
            const panel = document.getElementById('chat-panel');
            if (this.isOpen && 
                !panel.contains(e.target) && 
                !e.target.closest('[data-route="/messages"]')) {
                this.close();
            }
        });

        if (window.location.hash.startsWith('#/messages')) {
            this.open();
        }

        // Auto-highlight based on URL change
        window.addEventListener('hashchange', () => {
            if (window.location.hash.includes('?id=')) {
                const id = window.location.hash.split('?id=')[1].split('&')[0];
                this.updateActiveId(id);
            } else if (!window.location.hash.startsWith('#/messages')) {
                // Clear active if we left chat area
                this.updateActiveId(null);
            }
        });
    },

    renderLayout() {
        const panel = document.getElementById('chat-panel');
        const username = localStorage.getItem('username') || 'User';

        panel.innerHTML = `
            <div class="chat-sidebar-header">
                <h2>${username} <i data-lucide="chevron-down" size="18"></i></h2>
                <div class="chat-header-actions">
                    <button class="chat-icon-btn" title="New Message">
                        <i data-lucide="square-pen" size="22"></i>
                    </button>
                </div>
            </div>
            
            <div class="chat-search-container">
                <div class="chat-search-wrapper">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search" id="chat-search-input">
                </div>
            </div>

            <div class="chat-tabs">
                <div class="chat-tab ${this.currentFilter === null ? 'active' : ''}" data-filter="null">All</div>
                <div class="chat-tab ${this.currentFilter === true ? 'active' : ''}" data-filter="true">Private</div>
                <div class="chat-tab ${this.currentFilter === false ? 'active' : ''}" data-filter="false">Group</div>
            </div>

            <div class="chat-list" id="chat-conversation-list">
                <div class="loading-conversations" style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                    Loading...
                </div>
            </div>
        `;
        
        this.initTabs();
        this.initSearch();
        lucide.createIcons();
    },

    initTabs() {
        const tabs = document.querySelectorAll('.chat-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const filterVal = tab.dataset.filter;
                this.currentFilter = filterVal === 'null' ? null : filterVal === 'true';
                this.page = 1;
                this.hasMore = true;
                this.loadConversations(false);
            };
        });
    },

    initSearch() {
        const searchInput = document.getElementById('chat-search-input');
        if (!searchInput) return;

        searchInput.oninput = (e) => {
            this.searchTerm = e.target.value.trim();
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.page = 1;
                this.hasMore = true;
                this.loadConversations(false);
            }, 500);
        };
    },

    initScrollListener() {
        const listContainer = document.getElementById('chat-conversation-list');
        if (!listContainer) return;

        listContainer.onscroll = () => {
            if (this.isLoading || !this.hasMore) return;
            
            const { scrollTop, scrollHeight, clientHeight } = listContainer;
            if (scrollTop + clientHeight >= scrollHeight - 50) {
                this.loadConversations(true);
            }
        };
    },

    async toggle() {
        this.isOpen ? this.close() : await this.open();
    },

    async open() {
        const panel = document.getElementById('chat-panel');
        panel.classList.add('show');
        this.isOpen = true;
        document.body.classList.add('chat-sidebar-open');
        
        document.querySelectorAll('.sidebar .menu-item').forEach(item => {
            if (item.dataset.route === '/messages') item.classList.add('active');
        });

        await this.loadConversations();
    },

    close() {
        if (window.location.hash.startsWith('#/messages')) return;

        const panel = document.getElementById('chat-panel');
        panel.classList.remove('show');
        this.isOpen = false;
        document.body.classList.remove('chat-sidebar-open');
        
        if (window.setActiveSidebar) window.setActiveSidebar();
    },

    async loadConversations(isLoadMore = false) {
        if (this.isLoading || (!isLoadMore && !this.page === 1)) return;
        if (isLoadMore && !this.hasMore) return;

        const listContainer = document.getElementById('chat-conversation-list');
        this.isLoading = true;

        if (!isLoadMore) {
            this.page = 1;
            this.hasMore = true;
            // Show skeleton or loader for fresh load
            listContainer.innerHTML = '<div class="loading-conversations" style="padding: 20px; text-align: center; color: var(--text-tertiary);">Loading...</div>';
        }

        try {
            const res = await window.API.Conversations.getConversations(this.currentFilter, this.searchTerm, this.page, this.pageSize);
            
            if (res.ok) {
                const data = await res.json();
                const items = data.items || [];
                
                if (isLoadMore) {
                    this.conversations = [...this.conversations, ...items];
                } else {
                    this.conversations = items;
                    listContainer.innerHTML = ''; // Clear loader
                }

                if (items.length < this.pageSize) {
                    this.hasMore = false;
                }

                this.renderConversations(items, isLoadMore);
                this.page++;
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
            if (!isLoadMore) {
                listContainer.innerHTML = '<div style="padding:20px; text-align:center;">Error loading messages</div>';
            }
        } finally {
            this.isLoading = false;
        }
    },

    renderConversations(items, isAppend = false) {
        const listContainer = document.getElementById('chat-conversation-list');
        
        if (!isAppend && items.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary);">No messages yet</div>';
            return;
        }

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();

        const html = items.map(conv => {
            const avatar = ChatCommon.getAvatar(conv);
            const name = escapeHtml(ChatCommon.getDisplayName(conv));
            
            // --- Improved Last Message Preview ---
            let previewText = ChatCommon.getLastMsgPreview(conv);
            const lastMsgSenderId = (conv.lastMessage?.sender?.accountId || '').toLowerCase();
            if (lastMsgSenderId) {
                if (lastMsgSenderId === myId) {
                    previewText = `You: ${previewText}`;
                } else if (conv.isGroup) {
                    const sender = conv.lastMessage.sender;
                    const senderName = sender.nickname || sender.username || sender.fullName || 'User';
                    previewText = `${senderName}: ${previewText}`;
                }
            }
            const lastMsgEscaped = escapeHtml(previewText);

            const time = conv.lastMessageSentAt ? PostUtils.timeAgo(conv.lastMessageSentAt, true) : '';
            const unread = conv.unreadCount > 0;
            const isOnline = !conv.isGroup && conv.otherMember && conv.otherMember.isActive;
            
            // Only highlight if on the Messages Page
            const isChatPage = window.location.hash.startsWith('#/messages');
            const isActive = isChatPage && conv.conversationId === this.currentActiveId;

            // --- Seen Avatars Logic ---
            let seenHtml = '';
            if (!unread && lastMsgSenderId === myId && conv.lastMessageSeenBy && conv.lastMessageSeenBy.length > 0) {
                const seenCount = conv.lastMessageSeenCount || conv.lastMessageSeenBy.length;
                const extraCount = Math.max(0, seenCount - conv.lastMessageSeenBy.length);
                seenHtml = `
                    <div class="chat-seen-avatars">
                        ${conv.lastMessageSeenBy.map(m => `
                            <img src="${m.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}" 
                                 title="Seen by ${escapeHtml(m.displayName)}" 
                                 class="chat-mini-seen-avatar">
                        `).join('')}
                        ${extraCount > 0 ? `<span class="chat-seen-more">+${extraCount}</span>` : ''}
                    </div>
                `;
            }

            return `
                <div class="chat-item ${unread ? 'unread' : ''} ${isActive ? 'active' : ''}" 
                     data-conversation-id="${conv.conversationId}"
                     onclick="ChatSidebar.openConversation('${conv.conversationId}')">
                    <div class="chat-avatar-wrapper">
                        <img src="${avatar}" alt="${name}" class="chat-avatar" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
                        ${isOnline ? '<div class="chat-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${name}</span>
                        </div>
                        <div class="chat-msg-row">
                            <span class="chat-last-msg">${lastMsgEscaped}</span>
                            ${time ? `<span class="chat-msg-dot">·</span><span class="chat-meta">${time}</span>` : ''}
                        </div>
                    </div>
                    <div class="chat-item-end">
                        ${unread ? `<div class="chat-unread-badge">${conv.unreadCount > 9 ? '9+' : conv.unreadCount}</div>` : seenHtml}
                    </div>
                </div>
            `;
        }).join('');
        
        if (isAppend) {
            listContainer.insertAdjacentHTML('beforeend', html);
        } else {
            listContainer.innerHTML = html;
        }
        
        lucide.createIcons();
    },

    openConversation(id) {
        const targetHash = `#/messages?id=${id}`;
        if (window.location.hash !== targetHash) {
            window.location.hash = targetHash;
            // The router (app.js) will handle the navigation/update
        } else {
            // Already on this specific conversation hash, just ensure UI is updated
            if (window.ChatPage && typeof window.ChatPage.loadConversation === 'function') {
                window.ChatPage.loadConversation(id);
            }
            this.updateActiveId(id);
        }
    },

    /**
     * Clear unread badge for a specific conversation.
     * Called after SeenConversation succeeds.
     */
    clearUnread(conversationId) {
        // Update in-memory data
        const conv = this.conversations.find(c => c.conversationId === conversationId);
        if (conv) {
            conv.unreadCount = 0;
        }

        // Update DOM: find the chat-item and remove unread styling + badge
        const item = document.querySelector(`.chat-item[data-conversation-id="${conversationId}"]`);
        if (item) {
            item.classList.remove('unread');
            const badge = item.querySelector('.chat-unread-badge');
            if (badge) badge.remove();
        }
    },

    /**
     * Increment unread badge for a specific conversation.
     * Updates preview text, time, moves item to top. Like Facebook/Instagram.
     */
    incrementUnread(conversationId, message) {
        const listContainer = document.getElementById('chat-conversation-list');
        if (!listContainer) return;

        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const senderId = (message?.sender?.accountId || message?.Sender?.AccountId || '').toLowerCase();
        const isMe = senderId === myId;

        // Update in-memory data
        const conv = this.conversations.find(c => c.conversationId === conversationId);
        if (conv) {
            if (!isMe) {
                conv.unreadCount = (conv.unreadCount || 0) + 1;
            }
            if (message) {
                conv.lastMessage = message;
                conv.lastMessageSentAt = message.sentAt || message.SentAt || new Date().toISOString();
                // Reset seen-by since it's a new message
                conv.lastMessageSeenBy = [];
                conv.lastMessageSeenCount = 0;
            }
        }

        // Find existing DOM item
        let item = document.querySelector(`.chat-item[data-conversation-id="${conversationId}"]`);

        if (item) {
            // Update unread styling
            if (!isMe) {
                item.classList.add('unread');
            }

            // Update or create badge
            let badge = item.querySelector('.chat-unread-badge');
            const newCount = conv?.unreadCount || 1;
            if (badge) {
                badge.textContent = newCount > 9 ? '9+' : newCount;
            } else {
                badge = document.createElement('div');
                badge.className = 'chat-unread-badge';
                badge.textContent = newCount > 9 ? '9+' : newCount;
                item.appendChild(badge);
            }

        // Update preview text
        if (message) {
            let content = message.content || message.Content || '';
            const isMedia = (message.medias?.length > 0) || (message.Medias?.length > 0);
            
            if (!content && isMedia) {
                const firstMedia = (message.medias || message.Medias)[0];
                const type = firstMedia.mediaType === 0 ? '[Image]' : '[Video]';
                content = type;
            }

            // Group chat sender name prefix
            const senderId = (message.sender?.accountId || message.Sender?.AccountId || '').toLowerCase();
            const myId = (localStorage.getItem('accountId') || '').toLowerCase();
            
            let prefix = "";
            if (senderId === myId) {
                prefix = "You: ";
            } else if (conv?.isGroup) {
                const senderName = message.sender?.nickname || message.sender?.fullName || message.sender?.username || 
                                 message.Sender?.Nickname || message.Sender?.FullName || message.Sender?.Username || 'User';
                prefix = `${senderName}: `;
            }

            const previewText = prefix + content;
            const preview = item.querySelector('.chat-last-msg');
            if (preview) preview.textContent = previewText;

            // Clear any seen avatars when new message arrives
            const endArea = item.querySelector('.chat-item-end');
            const existingSeen = endArea?.querySelector('.chat-seen-avatars');
            if (existingSeen) existingSeen.remove();

            // Update time
            const timeMeta = item.querySelector('.chat-meta');
            if (timeMeta) {
                timeMeta.textContent = 'now';
            } else {
                const msgRow = item.querySelector('.chat-msg-row');
                if (msgRow) {
                    const dot = document.createElement('span');
                    dot.className = 'chat-msg-dot';
                    dot.textContent = '·';
                    const time = document.createElement('span');
                    time.className = 'chat-meta';
                    time.textContent = 'now';
                    msgRow.appendChild(dot);
                    msgRow.appendChild(time);
                }
            }
        }

        // Move to top of list
        listContainer.prepend(item);
    }
    // If item not in DOM (e.g. new conversation), do a reload IF it matches filter
    else {
        // Simple logic: if searching, don't auto-add. 
        if (this.searchTerm) return;

        // If filtering by type, we should ideally check if the message matches the filter
        // For simplicity, we just reload effectively.
        this.page = 1;
        this.hasMore = true;
        this.loadConversations(false);
    }
    },

    /**
     * Update the active ID using data-conversation-id attribute.
     */
    updateActiveId(id, retryCount = 0) {
        this.currentActiveId = id;
        
        const items = document.querySelectorAll('.chat-item');
        
        if (items.length === 0 && retryCount < 5 && window.location.hash.startsWith('#/messages')) {
            setTimeout(() => this.updateActiveId(id, retryCount + 1), 200);
            return;
        }

        if (items.length > 0) {
            const isChatPage = window.location.hash.startsWith('#/messages');
            items.forEach(item => {
                const convId = item.dataset.conversationId;
                const isTarget = isChatPage && id && convId === id;
                item.classList.toggle('active', !!isTarget);
            });
        }
    },

    /**
     * Called by ChatWindow/ChatPage when a MemberSeen event is received.
     * Updates the seen indicator in the sidebar for the given conversation.
     */
    updateSeenInSidebar(conversationId, accountId) {
        const convIdNorm = (conversationId || '').toLowerCase();
        const accIdNorm = (accountId || '').toLowerCase();
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();

        if (accIdNorm === myId) {
            return;
        }

        const conv = this.conversations.find(c => (c.conversationId || '').toLowerCase() === convIdNorm);
        if (!conv) {
            return;
        }

        // Only update if the last message was sent by us
        const lastMsgSenderId = (conv.lastMessage?.sender?.accountId || conv.lastMessage?.sender?.AccountId || conv.lastMessage?.Sender?.AccountId || conv.lastMessage?.Sender?.accountId || '').toLowerCase();
        if (lastMsgSenderId !== myId) {
            return;
        }

        // Initialize array if needed
        if (!conv.lastMessageSeenBy) conv.lastMessageSeenBy = [];

        // Check if this member already seen
        const alreadySeen = conv.lastMessageSeenBy.find(m =>
            (m.accountId || '').toLowerCase() === accIdNorm
        );
        if (alreadySeen) {
            return;
        }

        // Resolve member info
        let memberInfo = null;
        if (!conv.isGroup && conv.otherMember && (conv.otherMember.accountId || '').toLowerCase() === accIdNorm) {
            memberInfo = {
                accountId: conv.otherMember.accountId,
                avatarUrl: conv.otherMember.avatarUrl,
                displayName: conv.otherMember.username || conv.otherMember.fullName
            };
        }
        // For group chats, try to find memberInfo from lastMessage sender context or members list
        // For now, use a fallback
        if (!memberInfo) {
            memberInfo = {
                accountId: accountId,
                avatarUrl: APP_CONFIG.DEFAULT_AVATAR,
                displayName: 'User'
            };
        }

        conv.lastMessageSeenBy.push(memberInfo);
        conv.lastMessageSeenCount = (conv.lastMessageSeenCount || 0) + 1;

        // Update DOM
        const item = document.querySelector(`.chat-item[data-conversation-id="${conv.conversationId}"]`);
        if (!item) {
            return;
        }

        const endArea = item.querySelector('.chat-item-end');
        if (!endArea) {
            return;
        }

        const unread = (conv.unreadCount > 0) || item.classList.contains('unread');
        if (unread) {
            return;
        }

        const seenCount = conv.lastMessageSeenCount || conv.lastMessageSeenBy.length;
        const extraCount = Math.max(0, seenCount - conv.lastMessageSeenBy.length);

        endArea.innerHTML = `
            <div class="chat-seen-avatars">
                ${conv.lastMessageSeenBy.map(m => `
                    <img src="${m.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}" 
                         title="Seen by ${escapeHtml(m.displayName)}" 
                         class="chat-mini-seen-avatar">
                `).join('')}
                ${extraCount > 0 ? `<span class="chat-seen-more">+${extraCount}</span>` : ''}
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => ChatSidebar.init());

window.toggleChatSidebar = () => ChatSidebar.toggle();
window.closeChatSidebar = () => ChatSidebar.close();
window.ChatSidebar = ChatSidebar;

// For backward compatibility during migration
window.toggleChatPanel = window.toggleChatSidebar;
window.closeChatPanel = window.closeChatSidebar;
