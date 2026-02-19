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

    normalizeId(value) {
        return (value || '').toString().toLowerCase();
    },

    getGroupSenderName(sender = {}, conv = null) {
        if (window.ChatCommon && typeof ChatCommon.getPreferredSenderName === 'function') {
            const resolved = ChatCommon.getPreferredSenderName(sender, {
                conversation: conv,
                conversationId: conv?.conversationId || conv?.ConversationId || '',
                fallback: 'User'
            });
            if (resolved) return resolved;
        }

        const nickname = sender.nickname ?? sender.Nickname ?? null;
        if (typeof nickname === 'string' && nickname.trim().length > 0) {
            return nickname.trim();
        }

        const username =
            sender.username ??
            sender.userName ??
            sender.Username ??
            sender.UserName ??
            null;
        if (typeof username === 'string' && username.trim().length > 0) {
            return username.trim();
        }

        return 'User';
    },

    getMemberAvatarUrl(member = {}) {
        return member.avatarUrl || member.AvatarUrl || member.avatar || APP_CONFIG.DEFAULT_AVATAR;
    },

    getMemberDisplayName(member = {}) {
        const nickname = member.nickname ?? member.Nickname ?? null;
        if (typeof nickname === 'string' && nickname.trim().length > 0) {
            return nickname.trim();
        }

        const username =
            member.username ??
            member.userName ??
            member.Username ??
            member.UserName ??
            null;
        if (typeof username === 'string' && username.trim().length > 0) {
            return username.trim();
        }

        const displayName = member.displayName ?? member.DisplayName ?? null;
        if (typeof displayName === 'string' && displayName.trim().length > 0) {
            return displayName.trim();
        }

        const fullName = member.fullName ?? member.FullName ?? null;
        if (typeof fullName === 'string' && fullName.trim().length > 0) {
            return fullName.trim();
        }

        return 'User';
    },

    getOpenChatData(conversationId) {
        const openChats = window.ChatWindow?.openChats;
        if (!openChats || typeof openChats.entries !== 'function') {
            return null;
        }

        const targetId = this.normalizeId(conversationId);
        if (!targetId) return null;

        for (const [openId, chat] of openChats.entries()) {
            if (this.normalizeId(openId) !== targetId) continue;
            return chat?.data || chat?.metaData || null;
        }

        return null;
    },

    resolveSeenMemberInfo(conv, accountId) {
        if (!conv) return null;

        const targetAccId = this.normalizeId(accountId);
        if (!targetAccId) return null;

        const candidates = [];
        const addCandidate = (member) => {
            if (!member || typeof member !== 'object') return;
            const memberId = this.normalizeId(
                member.accountId ||
                member.AccountId
            );
            if (!memberId || memberId !== targetAccId) return;
            candidates.push(member);
        };
        const addMany = (members) => {
            if (!Array.isArray(members)) return;
            members.forEach(addCandidate);
        };

        addCandidate(conv.otherMember);
        addCandidate(conv.lastMessage?.sender);
        addCandidate(conv.lastMessage?.Sender);
        addMany(conv.members);
        addMany(conv.memberSeenStatuses);
        addMany(conv.lastMessageSeenBy);

        const convIdNorm = this.normalizeId(conv.conversationId || conv.ConversationId);
        const pageMeta = window.ChatPage?.currentMetaData;
        if (pageMeta && this.normalizeId(pageMeta.conversationId || pageMeta.ConversationId) === convIdNorm) {
            addCandidate(pageMeta.otherMember);
            addMany(pageMeta.members);
            addMany(pageMeta.memberSeenStatuses);
        }

        const openChatData = this.getOpenChatData(conv.conversationId || conv.ConversationId);
        if (openChatData) {
            addCandidate(openChatData.otherMember);
            addMany(openChatData.members);
            addMany(openChatData.memberSeenStatuses);
        }

        if (!candidates.length) return null;

        let best = null;
        let bestScore = -1;
        candidates.forEach((candidate) => {
            const avatarUrl = this.getMemberAvatarUrl(candidate);
            const displayName = this.getMemberDisplayName(candidate);

            let score = 0;
            if (avatarUrl && avatarUrl !== APP_CONFIG.DEFAULT_AVATAR) score += 2;
            if (displayName && displayName !== 'User') score += 1;
            if (candidate === conv.otherMember) score += 1;

            if (score > bestScore) {
                bestScore = score;
                best = {
                    accountId: targetAccId,
                    avatarUrl: avatarUrl || APP_CONFIG.DEFAULT_AVATAR,
                    displayName: displayName || 'User'
                };
            }
        });

        return best;
    },

    normalizeSeenMembers(conv) {
        if (!conv || !Array.isArray(conv.lastMessageSeenBy)) return;

        const seenMap = new Map();
        conv.lastMessageSeenBy.forEach((member, idx) => {
            const rawId = member?.accountId || member?.AccountId || '';
            const normalizedId = this.normalizeId(rawId);
            const resolved = this.resolveSeenMemberInfo(conv, normalizedId || rawId);
            const fallback = {
                accountId: normalizedId || `${idx}`,
                avatarUrl: this.getMemberAvatarUrl(member),
                displayName: this.getMemberDisplayName(member)
            };
            const normalizedMember = resolved || fallback;
            if (!normalizedMember.accountId) return;
            seenMap.set(normalizedMember.accountId, normalizedMember);
        });

        conv.lastMessageSeenBy = Array.from(seenMap.values());
        const currentSeenCount = Number(conv.lastMessageSeenCount || 0);
        conv.lastMessageSeenCount = Math.max(
            Number.isFinite(currentSeenCount) ? currentSeenCount : 0,
            conv.lastMessageSeenBy.length
        );
    },

    handleDragStart(e, conversationId) {
        // Disable drag-drop to open floating windows if we are on the dedicated Chat Page
        if (document.body.classList.contains('is-chat-page')) {
            e.preventDefault();
            return;
        }

        e.dataTransfer.setData('text/plain', conversationId);
        e.dataTransfer.setData('application/x-social-chat-external', 'true');
        e.dataTransfer.effectAllowed = 'move';
        
        document.body.classList.add('is-dragging-chat');

        // Better Drag Image (Ghost Card)
        const item = e.target.closest('.chat-item');
        const name = item.querySelector('.chat-name').textContent;
        const avatarSrc = item.querySelector('.chat-avatar').src;

        const ghost = document.createElement('div');
        ghost.style.cssText = `
            position: absolute; top: -1000px;
            width: 200px; padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            display: flex; align-items: center; gap: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            pointer-events: none;
            color: white; font-weight: 600;
        `;
        ghost.innerHTML = `
            <img src="${avatarSrc}" style="width: 32px; height: 32px; border-radius: 50%;">
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
        `;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 100, 25);
        setTimeout(() => ghost.remove(), 0);

        // Background sync if it's already open
        const existing = document.getElementById(`chat-box-${conversationId}`);
        if (existing) existing.classList.add('is-dragging-external');
    },

    handleDragEnd() {
        document.body.classList.remove('is-dragging-chat');
        document.querySelectorAll('.is-dragging-external').forEach(el => el.classList.remove('is-dragging-external'));
    },

    async init() {
        if (!document.getElementById('chat-panel')) {
            const panel = document.createElement('div');
            panel.id = 'chat-panel';
            panel.className = 'chat-sidebar-panel'; // Renamed class for clarity
            document.body.appendChild(panel);
            this.renderLayout();
            this.initScrollListener();
        }

        // Removed: Auto-close on click outside. 
        // Logic moved to explicit close button for better persistence.

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
                <div class="chat-header-title-area">
                    <h2>${username}</h2>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-icon-btn chat-sidebar-close-btn" onclick="window.closeChatSidebar()" title="Close Sidebar">
                        <i data-lucide="x" size="22"></i>
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
                <div class="chat-tabs-list">
                    <div class="chat-tab ${this.currentFilter === null ? 'active' : ''}" data-filter="null">All</div>
                    <div class="chat-tab ${this.currentFilter === true ? 'active' : ''}" data-filter="true">Private</div>
                    <div class="chat-tab ${this.currentFilter === false ? 'active' : ''}" data-filter="false">Group</div>
                </div>
                <button class="chat-tabs-more-btn" id="chat-tabs-more-btn" title="More options">
                    <i data-lucide="ellipsis" size="18"></i>
                </button>
            </div>

            <div class="chat-list" id="chat-conversation-list">
                <div class="loading-conversations" style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                    Loading...
                </div>
            </div>
        `;
        
        this.initTabs();
        this.initSearch();
        this.initMoreMenu();
        lucide.createIcons();
    },

    initMoreMenu() {
        const moreBtn = document.getElementById('chat-tabs-more-btn');
        if (!moreBtn) return;

        moreBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleMoreMenu(moreBtn);
        };
    },

    toggleMoreMenu(anchor) {
        let menu = document.getElementById('chat-tabs-more-menu');
        if (menu) {
            menu.remove();
            return;
        }

        menu = document.createElement('div');
        menu.id = 'chat-tabs-more-menu';
        menu.className = 'chat-tabs-popup-menu';
        menu.innerHTML = `
            <div class="chat-popup-item" id="chat-menu-create-group">
                <i data-lucide="users" size="16"></i>
                <span>Create Group</span>
            </div>
            <div class="chat-popup-item" id="chat-menu-blocked-users">
                <i data-lucide="user-x" size="16"></i>
                <span>Blocked Users</span>
            </div>
        `;

        document.body.appendChild(menu);
        lucide.createIcons({ container: menu });

        const rect = anchor.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 8}px`;
        menu.style.left = `${rect.right - menu.offsetWidth}px`;

        // Adjust if off-screen
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.left < 10) menu.style.left = '10px';

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== anchor) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => document.addEventListener('click', closeMenu), 10);

        // Menu item actions
        const createGroupBtn = menu.querySelector('#chat-menu-create-group');
        if (createGroupBtn) {
            createGroupBtn.onclick = () => {
                if (window.openCreateChatGroupModal) {
                    window.openCreateChatGroupModal();
                } else {
                    console.error('openCreateChatGroupModal not found');
                    if (window.toastInfo) window.toastInfo('Create Group feature coming soon!');
                }
                menu.remove();
            };
        }

        const blockedUsersBtn = menu.querySelector('#chat-menu-blocked-users');
        if (blockedUsersBtn) {
            blockedUsersBtn.onclick = () => {
                console.log('Blocked Users clicked');
                if (window.toastInfo) window.toastInfo('Blocked Users list coming soon!');
                menu.remove();
            };
        }
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
        if (this.isLoading) return;
        if (isLoadMore && !this.hasMore) return;

        const listContainer = document.getElementById('chat-conversation-list');
        this.isLoading = true;

        if (!isLoadMore) {
            this.page = 1;
            this.hasMore = true;
            // Show skeleton or loader for fresh load
            listContainer.innerHTML = `
                <div class="chat-sidebar-loader">
                    <div class="spinner spinner-medium"></div>
                    <p>Loading chats...</p>
                </div>
            `;
        } else {
            // Append small loader at bottom
            const existingLoader = document.getElementById('chat-sidebar-more-loader');
            if (!existingLoader) {
                listContainer.insertAdjacentHTML('beforeend', `
                    <div id="chat-sidebar-more-loader" class="chat-sidebar-more-loader">
                        <div class="spinner spinner-small"></div>
                    </div>
                `);
            }
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
                listContainer.innerHTML = `
                    <div class="chat-sidebar-loader">
                        <i data-lucide="alert-circle" style="width:24px; height:24px; color:var(--text-tertiary);"></i>
                        <p>Error loading chats</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons({ container: listContainer });
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
            const name = escapeHtml(ChatCommon.getDisplayName(conv));
            
            // --- Improved Last Message Preview ---
            let previewText = ChatCommon.getLastMsgPreview(conv);
            const isSystemLastMessage = ChatCommon.isSystemMessage(conv?.lastMessage);
            const lastMsgSenderId = (
                conv.lastMessage?.sender?.accountId ||
                conv.lastMessage?.sender?.AccountId ||
                conv.lastMessage?.Sender?.accountId ||
                conv.lastMessage?.Sender?.AccountId ||
                ''
            ).toLowerCase();
            if (lastMsgSenderId && !isSystemLastMessage) {
                if (lastMsgSenderId === myId) {
                    previewText = `You: ${previewText}`;
                } else if (conv.isGroup) {
                    const sender = conv.lastMessage?.sender || conv.lastMessage?.Sender || {};
                    const senderName = this.getGroupSenderName(sender, conv);
                    previewText = `${senderName}: ${previewText}`;
                }
            }
            const lastMsgEscaped = escapeHtml(previewText);

            const time = conv.lastMessageSentAt ? PostUtils.timeAgo(conv.lastMessageSentAt, true) : '';
            const unread = conv.unreadCount > 0;
            const isOnline = !conv.isGroup && conv.otherMember && conv.otherMember.isActive;
            const isMuted = conv.isMuted ?? conv.IsMuted ?? false;
            
            // Only highlight if on the Messages Page
            const isChatPage = window.location.hash.startsWith('#/messages');
            const isActive = isChatPage && conv.conversationId === this.currentActiveId;

            // --- Seen Avatars Logic ---
            let seenHtml = '';
            if (!unread && lastMsgSenderId === myId && conv.lastMessageSeenBy && conv.lastMessageSeenBy.length > 0) {
                this.normalizeSeenMembers(conv);
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
                     draggable="true"
                     onclick="ChatSidebar.openConversation('${conv.conversationId}')"
                     ondragstart="ChatSidebar.handleDragStart(event, '${conv.conversationId}')"
                     ondragend="ChatSidebar.handleDragEnd()">
                    <div class="chat-avatar-wrapper">
                        ${ChatCommon.renderAvatar(conv, { name, className: 'chat-avatar' })}
                        ${isOnline ? '<div class="chat-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${name}</span>
                            ${isMuted ? '<i data-lucide="bell-off" class="chat-muted-icon"></i>' : ''}
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
            // Remove previous "load more" loader if exists
            const existingLoader = document.getElementById('chat-sidebar-more-loader');
            if (existingLoader) existingLoader.remove();
            
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

    setMuteStatus(conversationId, isMuted, options = {}) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;

        let changed = false;
        this.conversations.forEach(conv => {
            if ((conv.conversationId || '').toLowerCase() !== target) return;
            const nextMuted = !!isMuted;
            if ((conv.isMuted ?? false) !== nextMuted) {
                conv.isMuted = nextMuted;
                changed = true;
            }
        });

        if (changed || options.forceRender) {
            this.renderConversations(this.conversations, false);
        }
        return changed;
    },

    applyThemeUpdate(conversationId, theme, options = {}) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;

        const normalizeTheme = (value) => {
            if (window.ChatCommon && typeof window.ChatCommon.resolveConversationTheme === 'function') {
                return window.ChatCommon.resolveConversationTheme(value);
            }
            if (typeof value !== 'string') return null;
            const trimmed = value.trim().toLowerCase();
            return trimmed.length ? trimmed : null;
        };
        const normalizedTheme = normalizeTheme(theme);

        let changed = false;
        this.conversations.forEach(conv => {
            if ((conv.conversationId || '').toLowerCase() !== target) return;
            if ((conv.theme ?? null) === normalizedTheme) return;
            conv.theme = normalizedTheme;
            changed = true;
        });

        if (options.forceRender && changed) {
            this.renderConversations(this.conversations, false);
        }

        return changed;
    },

    applyGroupConversationInfoUpdate(conversationId, payload = {}, options = {}) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;

        const hasNameInput = typeof payload?.conversationName === 'string' && payload.conversationName.trim().length > 0;
        const nextConversationName = hasNameInput ? payload.conversationName.trim() : null;
        const hasAvatarInput = !!(payload?.hasConversationAvatarField || Object.prototype.hasOwnProperty.call(payload || {}, 'conversationAvatar'));
        const nextConversationAvatar = hasAvatarInput
            ? ((typeof payload?.conversationAvatar === 'string' && payload.conversationAvatar.trim().length > 0)
                ? payload.conversationAvatar.trim()
                : null)
            : null;

        let changed = false;
        this.conversations.forEach(conv => {
            if ((conv.conversationId || '').toLowerCase() !== target) return;
            if (!conv.isGroup) return;

            if (hasNameInput) {
                const currentDisplayName = conv.displayName ?? conv.DisplayName ?? null;
                const currentConversationName = conv.conversationName ?? conv.ConversationName ?? null;
                if (currentDisplayName !== nextConversationName || currentConversationName !== nextConversationName) {
                    conv.conversationName = nextConversationName;
                    conv.ConversationName = nextConversationName;
                    conv.displayName = nextConversationName;
                    conv.DisplayName = nextConversationName;
                    changed = true;
                }
            }

            if (hasAvatarInput) {
                const currentDisplayAvatar = conv.displayAvatar ?? conv.DisplayAvatar ?? null;
                const currentConversationAvatar = conv.conversationAvatar ?? conv.ConversationAvatar ?? null;
                if (currentDisplayAvatar !== nextConversationAvatar || currentConversationAvatar !== nextConversationAvatar) {
                    conv.conversationAvatar = nextConversationAvatar;
                    conv.ConversationAvatar = nextConversationAvatar;
                    conv.displayAvatar = nextConversationAvatar;
                    conv.DisplayAvatar = nextConversationAvatar;
                    changed = true;
                }
            }
        });

        if (changed || options.forceRender) {
            this.renderConversations(this.conversations, false);
        }
        return changed;
    },

    removeConversation(conversationId) {
        const target = (conversationId || '').toLowerCase();
        if (!target) return false;

        const originalLength = this.conversations.length;
        this.conversations = this.conversations.filter(c => (c.conversationId || '').toLowerCase() !== target);
        const changed = this.conversations.length !== originalLength;

        if (!changed) return false;
        this.renderConversations(this.conversations, false);
        return true;
    },

    applyNicknameUpdate(conversationId, accountId, nickname) {
        const convTarget = (conversationId || '').toLowerCase();
        const accTarget = (accountId || '').toLowerCase();
        if (!convTarget || !accTarget) return false;

        const normalizeNickname = (value) => {
            if (window.ChatCommon && typeof window.ChatCommon.normalizeNickname === 'function') {
                return window.ChatCommon.normalizeNickname(value);
            }
            if (typeof value !== 'string') return value ?? null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        };
        const normalizedNickname = normalizeNickname(nickname);

        let changed = false;
        this.conversations.forEach(conv => {
            if ((conv.conversationId || '').toLowerCase() !== convTarget) return;

            const fallbackDisplayName = () => {
                if (conv.otherMember && (conv.otherMember.accountId || '').toLowerCase() === accTarget) {
                    return conv.otherMember.username || conv.otherMember.Username || conv.otherMember.fullName || conv.otherMember.FullName || 'User';
                }
                return 'User';
            };

            if (conv.otherMember && (conv.otherMember.accountId || '').toLowerCase() === accTarget) {
                conv.otherMember.nickname = normalizedNickname;
                changed = true;
            }

            const sender = conv.lastMessage?.sender;
            if (sender && (sender.accountId || '').toLowerCase() === accTarget) {
                sender.nickname = normalizedNickname;
                changed = true;
            }

            if (Array.isArray(conv.lastMessageSeenBy)) {
                conv.lastMessageSeenBy.forEach(seen => {
                    if ((seen.accountId || '').toLowerCase() !== accTarget) return;
                    seen.displayName = normalizedNickname || fallbackDisplayName();
                    changed = true;
                });
            }
        });

        if (changed) {
            this.renderConversations(this.conversations, false);
        }
        return changed;
    },

    renderConversationLastMessage(conv) {
        if (!conv) return false;
        const item = document.querySelector(`.chat-item[data-conversation-id="${conv.conversationId}"]`);
        if (!item) return true;

        let previewText = ChatCommon.getLastMsgPreview(conv);
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const lastMessage = conv.lastMessage || {};
        const isSystemLastMessage = window.ChatCommon && typeof ChatCommon.isSystemMessage === 'function'
            ? ChatCommon.isSystemMessage(lastMessage)
            : false;
        const lastMsgSenderId = (
            lastMessage?.sender?.accountId ||
            lastMessage?.sender?.AccountId ||
            lastMessage?.Sender?.accountId ||
            lastMessage?.Sender?.AccountId ||
            ''
        ).toLowerCase();

        if (lastMsgSenderId && !isSystemLastMessage) {
            if (lastMsgSenderId === myId) {
                previewText = `You: ${previewText}`;
            } else if (conv.isGroup) {
                const sender = lastMessage?.sender || lastMessage?.Sender || {};
                const senderName = this.getGroupSenderName(sender, conv);
                previewText = `${senderName}: ${previewText}`;
            }
        }

        const preview = item.querySelector('.chat-last-msg');
        if (preview) preview.textContent = previewText;

        const msgRow = item.querySelector('.chat-msg-row');
        if (!msgRow) return true;

        msgRow.querySelectorAll('.chat-msg-dot, .chat-meta').forEach(el => el.remove());
        const sentAt = conv.lastMessageSentAt || conv.lastMessage?.sentAt || conv.lastMessage?.SentAt || null;
        if (sentAt) {
            const dot = document.createElement('span');
            dot.className = 'chat-msg-dot';
            dot.textContent = '·';
            const time = document.createElement('span');
            time.className = 'chat-meta';
            time.textContent = PostUtils.timeAgo(sentAt, true);
            msgRow.appendChild(dot);
            msgRow.appendChild(time);
        }

        return true;
    },

    getMessageIdentity(message) {
        if (!message || typeof message !== 'object') return '';
        return (
            message.messageId ||
            message.MessageId ||
            message.id ||
            message.Id ||
            message.tempId ||
            message.TempId ||
            ''
        ).toString().toLowerCase();
    },

    applyMessageHidden(conversationId, messageId, replacementMessage = null) {
        const convTarget = (conversationId || '').toLowerCase();
        const msgTarget = (messageId || '').toString().toLowerCase();
        if (!convTarget || !msgTarget) return false;

        const conv = this.conversations.find(c => (c.conversationId || '').toLowerCase() === convTarget);
        if (!conv) return false;

        const lastMessageId = this.getMessageIdentity(conv.lastMessage);
        if (conv.lastMessage && lastMessageId && lastMessageId !== msgTarget) return false;

        if (replacementMessage) {
            conv.lastMessage = replacementMessage;
            conv.lastMessageSentAt = replacementMessage.sentAt || replacementMessage.SentAt || null;
            conv.lastMessagePreview = null;
        } else {
            conv.lastMessage = null;
            conv.lastMessageSentAt = null;
            conv.lastMessagePreview = conv.isGroup ? 'Group created' : 'Started a conversation';
        }

        conv.lastMessageSeenBy = [];
        conv.lastMessageSeenCount = 0;
        const rendered = this.renderConversationLastMessage(conv);
        const item = document.querySelector(`.chat-item[data-conversation-id="${conv.conversationId}"]`);
        item?.querySelector('.chat-item-end .chat-seen-avatars')?.remove();
        return rendered;
    },

    applyMessageRecalled(conversationId, messageId) {
        const convTarget = (conversationId || '').toLowerCase();
        const msgTarget = (messageId || '').toString().toLowerCase();
        if (!convTarget || !msgTarget) return false;

        const conv = this.conversations.find(c => (c.conversationId || '').toLowerCase() === convTarget);
        if (!conv || !conv.lastMessage) return false;

        const lastMessageId = this.getMessageIdentity(conv.lastMessage);
        if (lastMessageId && lastMessageId !== msgTarget) return false;

        conv.lastMessage.isRecalled = true;
        conv.lastMessage.IsRecalled = true;
        conv.lastMessage.content = null;
        conv.lastMessage.Content = null;
        conv.lastMessagePreview = 'Message recalled';
        return this.renderConversationLastMessage(conv);
    },

    /**
     * Increment unread badge for a specific conversation.
     * Updates preview text, time, moves item to top. Like Facebook/Instagram.
     */
    incrementUnread(conversationId, message, skipBadgeIncrement = false) {
        const myId = (localStorage.getItem('accountId') || '').toLowerCase();
        const senderId = (message?.sender?.accountId || message?.Sender?.AccountId || '').toLowerCase();
        const isMe = senderId === myId;

        // Update in-memory data
        const conv = this.conversations.find(c => c.conversationId === conversationId);
        if (conv) {
            if (!isMe && !skipBadgeIncrement) {
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

        const listContainer = document.getElementById('chat-conversation-list');
        if (!listContainer) return;

        // Find existing DOM item
        let item = document.querySelector(`.chat-item[data-conversation-id="${conversationId}"]`);

        if (item) {
            // Update unread styling
            if (!isMe && !skipBadgeIncrement) {
                item.classList.add('unread');
            }

            // Update or create badge
            let badge = item.querySelector('.chat-unread-badge');
            const newCount = (conv ? conv.unreadCount : 0);
            if (newCount > 0) {
                if (badge) {
                    badge.textContent = newCount > 9 ? '9+' : newCount;
                } else {
                    badge = document.createElement('div');
                    badge.className = 'chat-unread-badge';
                    badge.textContent = newCount > 9 ? '9+' : newCount;
                    item.appendChild(badge);
                }
            } else if (badge && !isMe) {
                // If count is zero but badge exists, remove it (sender is not me, so it was unread)
                badge.remove();
                item.classList.remove('unread');
            }

        // Update preview text
        if (message) {
            let content = message.content || message.Content || '';
            const isMedia = (message.medias?.length > 0) || (message.Medias?.length > 0);
            const isRecalled = !!(message.isRecalled ?? message.IsRecalled);
            const isSystemMessage = window.ChatCommon && typeof ChatCommon.isSystemMessage === 'function'
                ? ChatCommon.isSystemMessage(message)
                : false;
            
            if (isRecalled) {
                content = 'Message recalled';
            } else if (isSystemMessage && window.ChatCommon && typeof ChatCommon.getSystemMessageText === 'function') {
                content = ChatCommon.getSystemMessageText(message);
            } else if (!content && isMedia) {
                const mediaItems = (message.medias || message.Medias || []);
                const hasVisualMedia = Array.isArray(mediaItems) && mediaItems.some((m) => {
                    const mediaType = Number(m?.mediaType ?? m?.MediaType ?? 0);
                    return mediaType === 0 || mediaType === 1;
                });
                if (hasVisualMedia) {
                    content = '[Media]';
                } else {
                    const firstMedia = mediaItems[0] || {};
                    const mediaType = Number(firstMedia?.mediaType ?? firstMedia?.MediaType ?? 0);
                    const type = (window.ChatCommon && typeof ChatCommon.getMediaTypeLabel === 'function')
                        ? ChatCommon.getMediaTypeLabel(mediaType)
                        : '[File]';
                    content = type;
                }
            }

            // Group chat sender name prefix
            const senderId = (
                message.sender?.accountId ||
                message.sender?.AccountId ||
                message.Sender?.accountId ||
                message.Sender?.AccountId ||
                ''
            ).toLowerCase();
            const myId = (localStorage.getItem('accountId') || '').toLowerCase();
            
            let prefix = "";
            if (!isSystemMessage && senderId === myId) {
                prefix = "You: ";
            } else if (!isSystemMessage && conv?.isGroup) {
                const senderPayload = message.sender || message.Sender || {};
                const senderName = this.getGroupSenderName(senderPayload, conv);
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
        if (!Array.isArray(conv.lastMessageSeenBy)) conv.lastMessageSeenBy = [];
        this.normalizeSeenMembers(conv);

        const alreadySeenIndex = conv.lastMessageSeenBy.findIndex(m =>
            this.normalizeId(m.accountId || m.AccountId) === accIdNorm
        );
        const resolvedMemberInfo = this.resolveSeenMemberInfo(conv, accIdNorm);

        if (alreadySeenIndex >= 0) {
            if (resolvedMemberInfo) {
                conv.lastMessageSeenBy[alreadySeenIndex] = {
                    ...conv.lastMessageSeenBy[alreadySeenIndex],
                    ...resolvedMemberInfo
                };
            }
        } else {
            const memberInfo = resolvedMemberInfo || {
                accountId: accIdNorm || accountId,
                avatarUrl: APP_CONFIG.DEFAULT_AVATAR,
                displayName: 'User'
            };
            conv.lastMessageSeenBy.push(memberInfo);

            const currentSeenCount = Number(conv.lastMessageSeenCount || 0);
            conv.lastMessageSeenCount = Math.max(
                (Number.isFinite(currentSeenCount) ? currentSeenCount : 0) + 1,
                conv.lastMessageSeenBy.length
            );
        }

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

        this.normalizeSeenMembers(conv);
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
