/**
 * Chat Actions Handler
 * Handles message-specific actions like React, Reply, Recall, Hide, etc.
 */
const ChatActions = {
    currentMenu: null,
    currentConfirm: null,

    /**
     * Placeholder for Reaction Menu
     */
    openReactMenu(e, messageId) {
        e.stopPropagation();
        window.toastInfo && window.toastInfo('Reactions coming soon');
    },

    /**
     * Placeholder for Reply Logic
     */
    replyTo(messageId) {
        window.toastInfo && window.toastInfo('Reply feature coming soon');
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
        
        // Mark as active so CSS can keep buttons visible
        if (wrapper) wrapper.classList.add('menu-active');
        btn.classList.add('active');

        const rect = btn.getBoundingClientRect();

        const menu = document.createElement('div');
        menu.className = 'msg-more-menu';
        
        let itemsHtml = `
            <div class="msg-more-item" onclick="window.ChatActions.hideForYou('${resolvedMessageId}')">
                <i data-lucide="eye-off"></i>
                <span>Hide for you</span>
            </div>
            <div class="msg-more-item" onclick="window.toastInfo('Forwarding coming soon')">
                <i data-lucide="forward"></i>
                <span>Forward</span>
            </div>
            <div class="msg-more-item" onclick="window.toastInfo('Pin coming soon')">
                <i data-lucide="pin"></i>
                <span>Pin</span>
            </div>
        `;

        if (isOwn) {
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
    removeMessageFromUI(messageId) {
        if (!messageId) return;
        const normId = messageId.toString().toLowerCase();
        
        // We use querySelectorAll because the same message might be in both chat-page and chat-window
        const bubbles = document.querySelectorAll(`[data-message-id="${normId}"]`);

        bubbles.forEach(bubble => {
            const prev = bubble.previousElementSibling;
            const next = bubble.nextElementSibling;
            const container = bubble.closest('.chat-messages') || bubble.closest('.chat-view-messages');

            bubble.style.transition = 'all 0.3s ease';
            bubble.style.opacity = '0';
            bubble.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                bubble.remove();
                
                // RE-GROUPING LOGIC after removal
                if (next) this.refreshMessageState(next);
                if (prev) this.refreshMessageState(prev);

                // Check if we left an orphaned time separator
                this.cleanTimeSeparators(container);
            }, 300);
        });
    },

    /**
     * Callback for realtime hidden message
     */
    hideFromRealtime(data) {
        const messageId = data.messageId || data.MessageId;
        if (messageId) {
            this.removeMessageFromUI(messageId);
        }
    },

    /**
     * Fix message classes and UI when its neighbors change
     */
    refreshMessageState(el) {
        if (!el || !el.classList.contains('msg-bubble-wrapper')) return;
        
        const prev = el.previousElementSibling;
        const next = el.nextElementSibling;
        
        // Re-call grouping logic
        const m = {
            sender: { accountId: el.dataset.senderId },
            sentAt: el.dataset.sentAt
        };
        const pM = prev && prev.classList.contains('msg-bubble-wrapper') ? {
            sender: { accountId: prev.dataset.senderId },
            sentAt: prev.dataset.sentAt
        } : null;
        const nM = next && next.classList.contains('msg-bubble-wrapper') ? {
            sender: { accountId: next.dataset.senderId },
            sentAt: next.dataset.sentAt
        } : null;
        
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
        const children = Array.from(container.children);
        children.forEach((child, idx) => {
            if (child.classList.contains('chat-time-separator')) {
                const next = children[idx + 1];
                if (!next || next.classList.contains('chat-time-separator')) {
                    child.remove();
                }
            }
        });
    },

    recallMessage(messageId) {
        this.closeAllMenus();
        window.toastInfo && window.toastInfo('Recall feature coming soon (API required)');
    },

    showConfirm(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'msg-confirm-overlay';
        
        overlay.innerHTML = `
            <div class="msg-confirm-popup">
                <div class="msg-confirm-content">
                    <h3>${title}</h3>
                    <p>${message}</p>
                </div>
                <div class="msg-confirm-actions">
                    <button class="msg-confirm-btn cancel">Cancel</button>
                    <button class="msg-confirm-btn confirm">Hide</button>
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
