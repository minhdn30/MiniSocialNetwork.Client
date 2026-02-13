/**
 * Chat Actions Handler
 * Handles message-specific actions like React, Reply, Recall, Hide, etc.
 */
const ChatActions = {
    currentMenu: null,
    currentConfirm: null,

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
            const prev = this.findPreviousMessageBubble(bubble);
            const next = this.findNextMessageBubble(bubble);
            const container = bubble.closest('.chat-messages') || bubble.closest('.chat-view-messages');

            // Capture "Sent" status info BEFORE removal
            const hadSentStatus = bubble.dataset.status === 'sent';
            const isLastBubbleInContainer = !!(container && !next);

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
     * After hiding a message, check if the new last own message
     * should display "Sent" status (if it's ours and unseen).
     */
    reassignSentStatus(container) {
        if (!container) return;

        // Find all remaining message bubbles
        const allBubbles = container.querySelectorAll('.msg-bubble-wrapper');
        if (allBubbles.length === 0) return;

        const lastBubble = allBubbles[allBubbles.length - 1];

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
