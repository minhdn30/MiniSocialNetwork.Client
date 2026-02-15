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

    getConversationThemeOptions() {
        const raw = window.APP_CONFIG?.CHAT_THEME_OPTIONS;
        if (!Array.isArray(raw) || raw.length === 0) {
            return [
                {
                    key: 'default',
                    label: 'Default',
                    preview: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
                    dark: {
                        accent: '#ff416c',
                        accentHover: '#e43c60',
                        accentActive: '#d7335a',
                        surface: '#0a1317',
                        surfaceAlt: '#121d24',
                        border: '#25323a',
                        ownBubbleBg: '#ff416c',
                        ownBubbleText: '#ffffff',
                        otherBubbleBg: '#1a252d',
                        otherBubbleText: '#f3f6f9',
                        systemText: '#9ca7b0',
                        actionColor: '#b7c2cb',
                        actionHover: '#ffffff',
                        actionHoverBg: 'rgba(255,255,255,0.08)',
                        scrollbarThumb: 'rgba(255,255,255,0.24)',
                        scrollbarHover: '#ff416c',
                        inputWrapperBg: 'rgba(255,255,255,0.08)',
                        inputBorder: 'rgba(255,255,255,0.14)'
                    },
                    light: {
                        accent: '#f72567',
                        accentHover: '#de1e5b',
                        accentActive: '#c7184f',
                        surface: 'linear-gradient(160deg, #ffe3ec 0%, #ffd0df 52%, #ffd7c9 100%)',
                        surfaceAlt: '#ffc6da',
                        border: '#f58eb0',
                        ownBubbleBg: '#f72567',
                        ownBubbleText: '#ffffff',
                        otherBubbleBg: '#ffb9d2',
                        otherBubbleText: '#3d1123',
                        systemText: '#7d2848',
                        actionColor: '#6f1e3f',
                        actionHover: '#3f1024',
                        actionHoverBg: 'rgba(0,0,0,0.06)',
                        scrollbarThumb: 'rgba(116,26,60,0.42)',
                        scrollbarHover: '#f72567',
                        inputWrapperBg: '#ffc6da',
                        inputBorder: '#f58eb0'
                    }
                }
            ];
        }

        return raw
            .map(opt => {
                const key = (opt?.key || '').toString().trim().toLowerCase();
                if (!key) return null;

                const label = (opt?.label || opt?.name || opt?.key || 'Theme').toString().trim();
                const legacyAccent = (opt?.color || opt?.accent || '').toString().trim();
                const legacyHover = (opt?.hover || opt?.accentHover || '').toString().trim();
                const legacyActive = (opt?.active || opt?.accentActive || '').toString().trim();
                const legacySurface = (opt?.bg || opt?.surface || '').toString().trim();
                const darkRaw = opt?.dark || opt?.modes?.dark || null;
                const lightRaw = opt?.light || opt?.modes?.light || null;
                const preview = (opt?.preview || opt?.previewGradient || '').toString().trim();
                const aliasesRaw = Array.isArray(opt?.aliases)
                    ? opt.aliases
                    : (typeof opt?.alias === 'string' ? [opt.alias] : []);
                const aliases = aliasesRaw
                    .map(a => (a || '').toString().trim().toLowerCase())
                    .filter(Boolean);

                const normalizeMode = (modeRaw) => {
                    const mode = modeRaw || {};
                    const accent = (mode?.accent || mode?.color || legacyAccent || '').toString().trim();
                    const accentHover = (mode?.accentHover || mode?.hover || legacyHover || '').toString().trim();
                    const accentActive = (mode?.accentActive || mode?.active || legacyActive || '').toString().trim();
                    const surface = (mode?.surface || mode?.bg || legacySurface || '').toString().trim();
                    const surfaceAlt = (mode?.surfaceAlt || mode?.panel || mode?.panelBg || '').toString().trim();
                    const border = (mode?.border || mode?.borderColor || '').toString().trim();
                    const ownBubbleBg = (mode?.ownBubbleBg || mode?.bubbleOwn || accent || '').toString().trim();
                    const ownBubbleText = (mode?.ownBubbleText || mode?.bubbleOwnText || '').toString().trim();
                    const otherBubbleBg = (mode?.otherBubbleBg || mode?.bubbleOther || '').toString().trim();
                    const otherBubbleText = (mode?.otherBubbleText || mode?.bubbleOtherText || '').toString().trim();
                    const systemText = (mode?.systemText || mode?.mutedText || '').toString().trim();
                    const actionColor = (mode?.actionColor || mode?.buttonColor || '').toString().trim();
                    const actionHover = (mode?.actionHover || mode?.buttonHover || '').toString().trim();
                    const actionHoverBg = (mode?.actionHoverBg || mode?.buttonHoverBg || '').toString().trim();
                    const scrollbarThumb = (mode?.scrollbarThumb || mode?.scrollbar || '').toString().trim();
                    const scrollbarHover = (mode?.scrollbarHover || ownBubbleBg || accent || '').toString().trim();
                    const inputWrapperBg = (mode?.inputWrapperBg || mode?.composerBg || '').toString().trim();
                    const inputBorder = (mode?.inputBorder || mode?.composerBorder || '').toString().trim();

                    return {
                        accent,
                        accentHover,
                        accentActive,
                        surface,
                        surfaceAlt,
                        border,
                        ownBubbleBg,
                        ownBubbleText,
                        otherBubbleBg,
                        otherBubbleText,
                        systemText,
                        actionColor,
                        actionHover,
                        actionHoverBg,
                        scrollbarThumb,
                        scrollbarHover,
                        inputWrapperBg,
                        inputBorder
                    };
                };

                const dark = normalizeMode(darkRaw);
                const light = normalizeMode(lightRaw);
                const hasPalette =
                    !!dark.accent || !!light.accent || !!legacyAccent || key === 'default';
                if (!hasPalette) return null;

                return {
                    key,
                    label,
                    aliases,
                    preview,
                    dark,
                    light
                };
            })
            .filter(Boolean);
    },

    normalizeConversationTheme(theme) {
        if (typeof theme !== 'string') return null;
        const normalized = theme.trim().toLowerCase();
        if (!normalized.length || normalized === 'default') return null;
        return normalized;
    },

    resolveConversationTheme(theme) {
        const normalized = this.normalizeConversationTheme(theme);
        if (!normalized) return null;

        const options = this.getConversationThemeOptions();
        const matched = options.find(opt =>
            opt.key === normalized || (Array.isArray(opt.aliases) && opt.aliases.includes(normalized))
        );
        return matched ? matched.key : null;
    },

    getConversationThemeByKey(theme) {
        const options = this.getConversationThemeOptions();
        const normalized = this.resolveConversationTheme(theme);
        if (!normalized) return null;
        return options.find(opt => opt.key === normalized) || null;
    },

    getConversationThemeLabel(theme, options = {}) {
        const fallbackToDefault = !!options.fallbackToDefault;
        const normalized = this.normalizeConversationTheme(theme);
        if (!normalized) return 'Default';

        const option = this.getConversationThemeByKey(normalized);
        if (option?.label) return option.label;
        if (fallbackToDefault) return 'Default';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    },

    getCurrentAppThemeMode() {
        return document.body?.classList?.contains('light-mode') ? 'light' : 'dark';
    },

    getConversationThemePreview(option, mode = null) {
        if (!option) return '';
        const activeMode = mode || this.getCurrentAppThemeMode();
        const palette = option?.[activeMode] || option?.dark || option?.light || null;
        if (option.preview) return option.preview;
        if (palette?.accent) return palette.accent;
        return '';
    },

    _hexToRgbString(hexColor) {
        const raw = (hexColor || '').toString().trim().replace(/^#/, '');
        if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
        const normalized = raw.length === 3
            ? raw.split('').map(ch => ch + ch).join('')
            : raw;
        const intVal = parseInt(normalized, 16);
        if (!Number.isFinite(intVal)) return null;
        const r = (intVal >> 16) & 255;
        const g = (intVal >> 8) & 255;
        const b = intVal & 255;
        return `${r}, ${g}, ${b}`;
    },

    _reverseGradientDirection(direction) {
        const rawDirection = (direction || '').toString().trim();
        if (!rawDirection.length) return '';

        const normalized = rawDirection.toLowerCase();
        if (normalized.startsWith('to ')) {
            const oppositeMap = {
                top: 'bottom',
                bottom: 'top',
                left: 'right',
                right: 'left'
            };

            const reversedParts = normalized
                .slice(3)
                .trim()
                .split(/\s+/)
                .map(part => oppositeMap[part] || part);

            return `to ${reversedParts.join(' ')}`;
        }

        const angleMatch = normalized.match(/^([-+]?\d*\.?\d+)(deg|rad|turn|grad)$/i);
        if (!angleMatch) {
            return rawDirection;
        }

        const angleValue = Number(angleMatch[1]);
        const angleUnit = angleMatch[2].toLowerCase();
        if (!Number.isFinite(angleValue)) {
            return rawDirection;
        }

        let reversedValue = angleValue;
        if (angleUnit === 'deg') {
            reversedValue = ((angleValue + 180) % 360 + 360) % 360;
        } else if (angleUnit === 'turn') {
            reversedValue = ((angleValue + 0.5) % 1 + 1) % 1;
        } else if (angleUnit === 'rad') {
            const full = Math.PI * 2;
            reversedValue = ((angleValue + Math.PI) % full + full) % full;
        } else if (angleUnit === 'grad') {
            reversedValue = ((angleValue + 200) % 400 + 400) % 400;
        }

        const roundedValue = Math.round(reversedValue * 1000) / 1000;
        return `${roundedValue}${angleUnit}`;
    },

    _getReversedLinearGradient(gradientValue) {
        const rawGradient = (gradientValue || '').toString().trim();
        if (!rawGradient.length) return '';
        if (!/^linear-gradient\(/i.test(rawGradient)) return rawGradient;

        const startIndex = rawGradient.indexOf('(');
        if (startIndex < 0 || !rawGradient.endsWith(')')) return rawGradient;
        const inner = rawGradient.slice(startIndex + 1, -1).trim();
        if (!inner.length) return rawGradient;

        let commaIndex = -1;
        let depth = 0;
        for (let i = 0; i < inner.length; i += 1) {
            const ch = inner[i];
            if (ch === '(') depth += 1;
            else if (ch === ')' && depth > 0) depth -= 1;
            else if (ch === ',' && depth === 0) {
                commaIndex = i;
                break;
            }
        }

        if (commaIndex < 0) return rawGradient;

        const firstPart = inner.slice(0, commaIndex).trim();
        const restParts = inner.slice(commaIndex + 1).trim();
        if (!restParts.length) return rawGradient;

        const hasExplicitDirection = /^(to\s+.+|[-+]?\d*\.?\d+(deg|rad|turn|grad))$/i.test(firstPart);
        if (!hasExplicitDirection) {
            return `linear-gradient(to top, ${inner})`;
        }

        const reversedDirection = this._reverseGradientDirection(firstPart);
        if (!reversedDirection) return rawGradient;
        return `linear-gradient(${reversedDirection}, ${restParts})`;
    },

    _clearConversationThemeVars(targetElement) {
        if (!targetElement || !targetElement.style) return;
        [
            '--accent-primary',
            '--accent-hover',
            '--accent-active',
            '--accent-primary-rgb',
            '--chat-theme-bg',
            '--chat-theme-surface',
            '--chat-theme-footer-surface',
            '--chat-theme-surface-alt',
            '--chat-theme-border',
            '--chat-theme-own-bubble-bg',
            '--chat-theme-own-bubble-text',
            '--chat-theme-other-bubble-bg',
            '--chat-theme-other-bubble-text',
            '--chat-theme-system-text',
            '--chat-theme-action-color',
            '--chat-theme-action-hover',
            '--chat-theme-action-hover-bg',
            '--chat-theme-scrollbar-thumb',
            '--chat-theme-scrollbar-hover',
            '--chat-theme-header-unread-bg',
            '--chat-theme-input-wrapper-bg',
            '--chat-theme-input-border'
        ].forEach((prop) => targetElement.style.removeProperty(prop));
    },

    applyConversationTheme(targetElement, theme) {
        if (!targetElement || !targetElement.style) return null;

        const option = this.getConversationThemeByKey(theme);
        if (!option) {
            this._clearConversationThemeVars(targetElement);
            return null;
        }

        const mode = this.getCurrentAppThemeMode();
        const palette = option?.[mode] || option?.dark || option?.light || null;
        if (!palette) {
            this._clearConversationThemeVars(targetElement);
            return null;
        }

        this._clearConversationThemeVars(targetElement);

        const accent = palette.accent || '';
        if (accent) targetElement.style.setProperty('--accent-primary', accent);
        if (palette.accentHover) targetElement.style.setProperty('--accent-hover', palette.accentHover);
        if (palette.accentActive) targetElement.style.setProperty('--accent-active', palette.accentActive);

        const rgb = this._hexToRgbString(accent);
        if (rgb) {
            targetElement.style.setProperty('--accent-primary-rgb', rgb);
        }

        if (palette.surface) {
            targetElement.style.setProperty('--chat-theme-bg', palette.surface);
            targetElement.style.setProperty('--chat-theme-surface', palette.surface);
            const footerSurface = palette.surfaceReverse || this._getReversedLinearGradient(palette.surface);
            if (footerSurface) {
                targetElement.style.setProperty('--chat-theme-footer-surface', footerSurface);
            }
        }
        if (palette.surfaceAlt) targetElement.style.setProperty('--chat-theme-surface-alt', palette.surfaceAlt);
        if (palette.border) targetElement.style.setProperty('--chat-theme-border', palette.border);
        if (palette.ownBubbleBg) {
            targetElement.style.setProperty('--chat-theme-own-bubble-bg', palette.ownBubbleBg);
            targetElement.style.setProperty('--chat-theme-header-unread-bg', palette.ownBubbleBg);
            targetElement.style.setProperty('--chat-theme-scrollbar-hover', palette.ownBubbleBg);
        }
        if (palette.ownBubbleText) targetElement.style.setProperty('--chat-theme-own-bubble-text', palette.ownBubbleText);
        if (palette.otherBubbleBg) targetElement.style.setProperty('--chat-theme-other-bubble-bg', palette.otherBubbleBg);
        if (palette.otherBubbleText) targetElement.style.setProperty('--chat-theme-other-bubble-text', palette.otherBubbleText);
        if (palette.systemText) targetElement.style.setProperty('--chat-theme-system-text', palette.systemText);
        if (palette.actionColor) targetElement.style.setProperty('--chat-theme-action-color', palette.actionColor);
        if (palette.actionHover) targetElement.style.setProperty('--chat-theme-action-hover', palette.actionHover);
        // Keep hover clean: no background flash on icon/buttons.
        targetElement.style.setProperty('--chat-theme-action-hover-bg', palette.actionHoverBg || 'transparent');
        if (palette.scrollbarThumb) targetElement.style.setProperty('--chat-theme-scrollbar-thumb', palette.scrollbarThumb);
        if (palette.scrollbarHover) targetElement.style.setProperty('--chat-theme-scrollbar-hover', palette.scrollbarHover);
        if (palette.inputWrapperBg) targetElement.style.setProperty('--chat-theme-input-wrapper-bg', palette.inputWrapperBg);
        if (palette.inputBorder) targetElement.style.setProperty('--chat-theme-input-border', palette.inputBorder);
    
        // Add theme class for CSS targeting
        [...targetElement.classList].forEach(c => {
            if (c.startsWith('chat-theme-')) targetElement.classList.remove(c);
        });
        targetElement.classList.add(`chat-theme-${option.key}`);
        targetElement.dataset.theme = option.key;

        return option.key;
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

    parseSystemMessageData(msg) {
        const systemDataRaw = msg?.systemMessageDataJson ?? msg?.SystemMessageDataJson ?? '';
        if (typeof systemDataRaw !== 'string' || !systemDataRaw.trim().length) {
            return null;
        }

        try {
            const parsed = JSON.parse(systemDataRaw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (_err) {
            return null;
        }
    },

    getSystemMessageText(msg) {
        const parsed = this.parseSystemMessageData(msg);
        if (parsed) {
            const actor = this.toMentionUsername(parsed?.actorUsername || parsed?.actorDisplayName || '');
            const target = this.toMentionUsername(parsed?.targetUsername || parsed?.targetDisplayName || '');
            const actionRaw = parsed?.action ?? parsed?.Action;
            const action = Number(actionRaw);
            const hasNicknameField = Object.prototype.hasOwnProperty.call(parsed || {}, 'nickname');
            const nickname = this.normalizeNickname(parsed?.nickname);

            if (actor && Number.isFinite(action) && action === 9) {
                const normalizedTheme = this.normalizeConversationTheme(parsed?.theme);
                if (normalizedTheme) {
                    return `${actor} changed the chat theme to "${this.getConversationThemeLabel(normalizedTheme)}".`;
                }
                return `${actor} reset the chat theme.`;
            }

            if (actor && Number.isFinite(action) && action === 10) {
                return `${actor} pinned a message.`;
            }

            if (actor && Number.isFinite(action) && action === 11) {
                return `${actor} unpinned a message.`;
            }

            if (actor && target && hasNicknameField) {
                return nickname
                    ? `${actor} set nickname for ${target} to "${nickname}".`
                    : `${actor} removed nickname for ${target}.`;
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

            const themeChangedMatch = content.match(/^@?([^\s@]+)\s+changed the chat theme to\s+"([\s\S]*)"\.$/i);
            if (themeChangedMatch) {
                const actor = this.toMentionUsername(themeChangedMatch[1]);
                const themeLabel = this.getConversationThemeLabel(themeChangedMatch[2]);
                return `${actor} changed the chat theme to "${themeLabel}".`;
            }

            const themeResetMatch = content.match(/^@?([^\s@]+)\s+reset the chat theme\.$/i);
            if (themeResetMatch) {
                const actor = this.toMentionUsername(themeResetMatch[1]);
                return `${actor} reset the chat theme.`;
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
        const rawMedias = m.medias || m.Medias;
        if (Array.isArray(rawMedias)) {
            m.medias = rawMedias.map(item => ({
                mediaUrl: item.mediaUrl || item.MediaUrl || '',
                mediaType: item.mediaType !== undefined ? item.mediaType : (item.MediaType !== undefined ? item.MediaType : 0),
                thumbnailUrl: item.thumbnailUrl || item.ThumbnailUrl || null,
                fileName: item.fileName || item.FileName || '',
                fileSize: item.fileSize || item.FileSize || 0
            }));
        } else {
            m.medias = [];
        }

        // Message type / system payload
        const messageType = this.getMessageType(m);
        if (messageType !== null && messageType !== undefined && messageType !== '') {
            m.messageType = messageType;
        }
        const recalledRaw = (m.isRecalled !== undefined) ? m.isRecalled : m.IsRecalled;
        if (typeof recalledRaw === 'boolean') {
            m.isRecalled = recalledRaw;
        } else if (typeof recalledRaw === 'string') {
            m.isRecalled = recalledRaw.toLowerCase() === 'true';
        } else {
            m.isRecalled = !!recalledRaw;
        }
        const pinnedRaw = (m.isPinned !== undefined) ? m.isPinned : m.IsPinned;
        if (typeof pinnedRaw === 'boolean') {
            m.isPinned = pinnedRaw;
        } else if (typeof pinnedRaw === 'string') {
            m.isPinned = pinnedRaw.toLowerCase() === 'true';
        } else {
            m.isPinned = !!pinnedRaw;
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
        const isRecalled = !!(msg.isRecalled ?? msg.IsRecalled);
        const isPinned = !!(msg.isPinned ?? msg.IsPinned);
        const recalledText = window.APP_CONFIG?.CHAT_RECALLED_MESSAGE_TEXT || 'Message was recalled';

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
        const allMedias = msg.medias || [];
        const hasMedia = !isRecalled && allMedias.length > 0;
        let mediaHtml = '';
        if (hasMedia) {
            // Only show up to 4 items in the grid
            const displayMedias = allMedias.slice(0, 4);
            const remainingCount = allMedias.length - 4;
            const gridClass = `count-${Math.min(allMedias.length, 4)}`;

            // Escaping JSON for HTML attribute safely
            // We use camelCase properties because we normalized them in normalizeMessage
            const mediaListJson = JSON.stringify(allMedias).replace(/"/g, '&quot;');

            mediaHtml = `
                <div class="msg-media-grid ${gridClass}" data-medias="${mediaListJson}">
                    ${displayMedias.map((m, idx) => {
                        const isLast = idx === 3 && remainingCount > 0;
                        let inner = '';
                        let onclickStr = '';
                        let dblclickStr = `ondblclick="ChatCommon.previewGridMedia(this, ${idx}, event)"`;

                        if (m.mediaType === 0) {
                            inner = `<img src="${m.mediaUrl}" alt="media" loading="lazy">`;
                            // Image: single click opens preview
                            onclickStr = `onclick="ChatCommon.previewGridMedia(this, ${idx}, event)"`;
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
                            // Video: single click handled by overlay, dblclick for zoom
                        }

                        return `
                            <div class="msg-media-item" ${onclickStr} ${dblclickStr}>
                                ${inner}
                                ${isLast ? `<div class="msg-media-more-overlay" onclick="event.stopPropagation(); ChatCommon.previewGridMedia(this, 3, event)">+${remainingCount}</div>` : ''}
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
        const pinnedBadgeHtml = isPinned
            ? `<div class="msg-pinned-badge" title="Pinned message"><i data-lucide="pin"></i></div>`
            : '';
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
                 data-is-recalled="${isRecalled ? 'true' : 'false'}"
                 data-is-pinned="${isPinned ? 'true' : 'false'}"
                 ${dataMessageIdAttr}
                 ${dataMessageTypeAttr}
                 ${msg.status ? `data-status="${msg.status}"` : ''}>
                ${authorHtml}
                <div class="msg-row">
                    ${avatarHtml}
                    <div class="msg-content-container">
                        ${pinnedBadgeHtml}
                        ${mediaHtml}
                        ${(isRecalled || msg.content)
                            ? `<div class="msg-bubble${isRecalled ? ' msg-bubble-recalled' : ''}">${isRecalled ? escapeHtml(recalledText) : linkify(escapeHtml(msg.content))}</div>`
                            : ''}
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
     * Preview media from a grid (reads JSON from data-medias attribute)
     */
    previewGridMedia(el, index, event) {
        if (event) event.stopPropagation();
        if (!el || typeof index !== 'number') return;
        const grid = el.closest('.msg-media-grid');
        if (!grid) return;
        
        try {
            const raw = grid.dataset.medias;
            if (!raw) return;
            const messageWrapper = grid.closest('.msg-bubble-wrapper');
            const messageId = (messageWrapper?.dataset?.messageId || '').toString().toLowerCase();
            const container = grid.closest('[id^="chat-messages-"], #chat-view-messages');
            const containerId = (container?.id || '').toString();
            const conversationId = containerId.startsWith('chat-messages-')
                ? containerId.substring('chat-messages-'.length).toLowerCase()
                : '';

            const medias = JSON.parse(raw);
            const enrichedMedias = Array.isArray(medias)
                ? medias.map((m) => ({
                    ...m,
                    messageId: (m?.messageId || m?.MessageId || messageId || '').toString().toLowerCase()
                }))
                : [];
            if (window.previewMedia) {
                window.previewMedia('', index, enrichedMedias, {
                    source: 'message-media-grid',
                    messageId,
                    conversationId
                });
            }
        } catch (e) {
            console.error('Failed to preview grid media:', e);
        }
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
        const lastMessage = conv?.lastMessage || conv?.LastMessage || null;

        if (lastMessage?.isRecalled || lastMessage?.IsRecalled) {
            return 'Message recalled';
        }

        if (lastMessage && this.isSystemMessage(lastMessage)) {
            return this.getSystemMessageText(lastMessage);
        }

        if (conv?.lastMessagePreview) return conv.lastMessagePreview;

        const rawContent = lastMessage?.content ?? lastMessage?.Content ?? '';
        if (typeof rawContent === 'string' && rawContent.trim().length) {
            return rawContent.trim();
        }

        const medias = lastMessage?.medias || lastMessage?.Medias || [];
        if (Array.isArray(medias) && medias.length > 0) {
            const first = medias[0] || {};
            const mediaType = Number(first.mediaType ?? first.MediaType);
            return mediaType === 1 ? '[Video]' : '[Image]';
        }

        return conv?.isGroup ? 'Group created' : 'Started a conversation';
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

    showThemePicker(options = {}) {
        const {
            title = 'Change theme',
            currentTheme = null,
            onSelect = null,
            onCancel = null
        } = options;

        const themeOptions = this.getConversationThemeOptions();
        const currentKey = this.resolveConversationTheme(currentTheme);
        const selectedTheme = currentKey || 'default';
        const currentMode = this.getCurrentAppThemeMode();

        const overlay = document.createElement('div');
        overlay.className = 'chat-common-confirm-overlay';

        const popup = document.createElement('div');
        popup.className = 'chat-common-confirm-popup chat-theme-picker-popup';

        popup.innerHTML = `
            <div class="chat-nicknames-header">
                <h3>${escapeHtml(title)}</h3>
                <div class="chat-nicknames-close" id="themePickerCloseBtn">
                    <i data-lucide="x"></i>
                </div>
            </div>
            <div class="chat-theme-picker-list">
                ${themeOptions.map(opt => {
                    const key = opt.key || 'default';
                    const isActive = selectedTheme === key;
                    const swatchBackground = this.getConversationThemePreview(opt, currentMode) || 'var(--accent-primary)';
                    return `
                        <button class="chat-theme-option ${isActive ? 'active' : ''}" data-theme-key="${key}">
                            <span class="chat-theme-swatch" style="background:${escapeHtml(swatchBackground)}"></span>
                            <span class="chat-theme-label">${escapeHtml(opt.label || key)}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (window.lockScroll) lockScroll();
        if (window.lucide) lucide.createIcons({ props: { size: 18 }, container: popup });
        requestAnimationFrame(() => overlay.classList.add('show'));

        const close = () => {
            overlay.classList.remove('show');
            if (window.unlockScroll) unlockScroll();
            setTimeout(() => overlay.remove(), 200);
        };

        const closeBtn = popup.querySelector('#themePickerCloseBtn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                if (onCancel) onCancel();
                close();
            };
        }

        popup.querySelectorAll('.chat-theme-option').forEach(btn => {
            btn.onclick = () => {
                const rawKey = (btn.dataset.themeKey || '').toLowerCase();
                const nextTheme = rawKey === 'default' ? null : rawKey;
                if (onSelect) onSelect(nextTheme);
                close();
            };
        });

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
            const valLen = input.value.length;
            input.setSelectionRange(valLen, valLen);

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
    },

    // ─── Shared Context Mode Utilities (Jump to Message) ──────────────────
    // ctx adapter shape:
    //   getState()           → { isLoading, page, hasMore, _isContextMode, _contextPage, _newerPage, _hasMoreNewer }
    //   setState(patch)      → merges patch into state
    //   getContainerId()     → the message container DOM id (e.g. 'chat-view-messages' or 'chat-messages-{id}')
    //   getPageSize()        → page size number
    //   getConversationId()  → conversation id string
    //   isGroup()            → boolean
    //   getMyId()            → current user id (lowercase)
    //   renderMessages(items, container) → render reversed items into container (module-specific)
    //   reloadLatest()       → reload page 1 (latest messages)
    //   getBtnParent()       → DOM element to append jump-to-bottom button
    //   getBtnId()           → unique button id string
    //   getMetaData()        → current metaData or null
    //   setMetaData(meta)    → store metaData

    /**
     * Load a context page around a target message, clear and re-render.
     */
    async contextLoadMessageContext(ctx, messageId) {
        const state = ctx.getState();
        if (state.isLoading) return;
        ctx.setState({ isLoading: true });

        const pageSize = ctx.getPageSize();
        const conversationId = ctx.getConversationId();

        try {
            const res = await window.API.Conversations.getMessageContext(conversationId, messageId, pageSize);
            if (!res.ok) {
                window.toastError && window.toastError('Failed to jump to message');
                ctx.setState({ isLoading: false });
                return;
            }

            const data = await res.json();
            const pageInfo = data?.messages || data?.Messages || {};
            const items = pageInfo?.items || pageInfo?.Items || [];
            const totalItems = pageInfo?.totalItems || pageInfo?.TotalItems || 0;
            const targetPage = pageInfo?.page || pageInfo?.Page || 1;
            const totalPages = Math.ceil(totalItems / pageSize) || 1;

            // Store metadata
            const metaData = data?.metaData || data?.MetaData;
            if (metaData) ctx.setMetaData(metaData);

            // Enter context mode
            ctx.setState({
                _isContextMode: true,
                _contextPage: targetPage,
                page: targetPage + 1,
                hasMore: targetPage < totalPages,
                _newerPage: targetPage - 1,
                _hasMoreNewer: targetPage > 1,
            });

            // Clear and render
            const msgContainer = document.getElementById(ctx.getContainerId());
            if (!msgContainer) {
                ctx.setState({ isLoading: false });
                return;
            }
            msgContainer.innerHTML = '';

            const reversed = [...items].reverse();
            ctx.renderMessages(reversed, msgContainer);
            ChatCommon.cleanTimeSeparators(msgContainer);

            if (window.lucide) lucide.createIcons({ container: msgContainer });
            if (typeof window.initializeChatEmojiElements === 'function') window.initializeChatEmojiElements(msgContainer);
            if (typeof window.replaceSVGEmojis === 'function') window.replaceSVGEmojis(msgContainer);

            // Show jump-to-bottom
            ChatCommon.contextShowJumpBtn(ctx);

            ctx.setState({ isLoading: false });

            // Scroll to target and highlight
            requestAnimationFrame(() => {
                const target = msgContainer.querySelector(`.msg-bubble-wrapper[data-message-id="${messageId}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'auto', block: 'center' });
                    window.ChatActions?.highlightMessage(target);
                }
            });
        } catch (err) {
            console.error('contextLoadMessageContext error:', err);
            window.toastError && window.toastError('Failed to jump to message');
            ctx.setState({ isLoading: false });
        }
    },

    /**
     * Load newer messages (scrolling down in context mode).
     */
    async contextLoadNewerMessages(ctx) {
        const state = ctx.getState();
        if (state.isLoading || !state._isContextMode || !state._hasMoreNewer) return;
        if (state._newerPage < 1) {
            ctx.setState({ _hasMoreNewer: false });
            return;
        }

        ctx.setState({ isLoading: true });
        const conversationId = ctx.getConversationId();
        const pageSize = ctx.getPageSize();

        try {
            const res = await window.API.Conversations.getMessages(conversationId, state._newerPage, pageSize);
            if (!res.ok) {
                ctx.setState({ isLoading: false });
                return;
            }

            const data = await res.json();
            const pageInfo = data?.messages || data?.Messages || data || {};
            const items = pageInfo?.items || pageInfo?.Items || [];

            if (!items.length) {
                ctx.setState({ _hasMoreNewer: false, isLoading: false });
                return;
            }

            const msgContainer = document.getElementById(ctx.getContainerId());
            if (!msgContainer) {
                ctx.setState({ isLoading: false });
                return;
            }

            const reversed = [...items].reverse();
            ctx.renderMessages(reversed, msgContainer);
            ChatCommon.cleanTimeSeparators(msgContainer);

            if (window.lucide) lucide.createIcons({ container: msgContainer });
            if (typeof window.initializeChatEmojiElements === 'function') window.initializeChatEmojiElements(msgContainer);
            if (typeof window.replaceSVGEmojis === 'function') window.replaceSVGEmojis(msgContainer);

            const newPage = state._newerPage - 1;
            if (newPage < 1) {
                ctx.setState({ _newerPage: newPage, _hasMoreNewer: false, isLoading: false });
                ChatCommon.contextResetMode(ctx);
            } else {
                ctx.setState({ _newerPage: newPage, isLoading: false });
            }
        } catch (err) {
            console.error('contextLoadNewerMessages error:', err);
            ctx.setState({ isLoading: false });
        }
    },

    /**
     * Jump to bottom — exit context mode and reload latest.
     */
    contextJumpToBottom(ctx) {
        ChatCommon.contextResetMode(ctx);
        ChatCommon.contextRemoveJumpBtn(ctx, true);
        ctx.setState({ page: 1, hasMore: true, isLoading: false });

        const msgContainer = document.getElementById(ctx.getContainerId());
        if (msgContainer) msgContainer.innerHTML = '';

        ctx.reloadLatest();
    },

    /**
     * Reset context mode state.
     */
    contextResetMode(ctx) {
        ctx.setState({
            _isContextMode: false,
            _contextPage: null,
            _hasMoreNewer: false,
            _newerPage: null,
        });
        // Don't remove the button here — it may still be needed for normal scroll-up
    },

    /**
     * Show the jump-to-bottom floating button.
     * Smart click handler: context mode → reload page 1, normal → scroll to bottom.
     */
    contextShowJumpBtn(ctx) {
        ChatCommon.contextRemoveJumpBtn(ctx);
        const parent = ctx.getBtnParent();
        if (!parent) return;

        const btn = document.createElement('button');
        btn.className = 'chat-jump-bottom-btn';
        btn.id = ctx.getBtnId();
        btn.title = 'Jump to bottom';
        btn.innerHTML = '<i data-lucide="chevrons-down"></i>';
        btn.onclick = () => {
            const state = ctx.getState();
            if (state._isContextMode) {
                // For context mode, we reload, usually no time for animation
                ChatCommon.contextJumpToBottom(ctx);
            } else {
                ChatCommon.contextRemoveJumpBtn(ctx, true);
                ctx.scrollToBottom('smooth');
            }
        };

        parent.appendChild(btn);
        if (window.lucide) lucide.createIcons({ container: btn });
    },

    /**
     * Remove the jump-to-bottom button with an optional exit animation.
     */
    contextRemoveJumpBtn(ctx, useAnimation = false) {
        const btn = document.getElementById(ctx.getBtnId());
        if (!btn) return;

        if (useAnimation) {
            btn.classList.add('is-exiting');
            setTimeout(() => {
                if (btn.parentNode) btn.remove();
            }, 200); // Matches CSS animation duration
        } else {
            btn.remove();
        }
    },

    /**
     * Show/hide the jump button based on scroll position.
     * Call this inside the onscroll handler for both normal and context mode.
     */
    updateJumpBtnOnScroll(ctx, msgContainer, threshold = 200) {
        if (!msgContainer) return;
        const nearBottom = msgContainer.scrollHeight
            - msgContainer.scrollTop - msgContainer.clientHeight <= threshold;

        if (nearBottom) {
            // At bottom + not in context mode → hide button
            const state = ctx.getState();
            if (!state._isContextMode) {
                ChatCommon.contextRemoveJumpBtn(ctx, true);
            }
        } else {
            // Scrolled up → show button if not already present
            const existing = document.getElementById(ctx.getBtnId());
            if (!existing) {
                ChatCommon.contextShowJumpBtn(ctx);
            }
        }
    },

    /**
     * Handle context-mode scroll (load newer pages when scrolling down).
     * Call this INSIDE the onscroll handler.
     * Returns true if a context-mode load was triggered.
     */
    contextHandleScroll(ctx, msgContainer) {
        const state = ctx.getState();
        if (!state._isContextMode || !state._hasMoreNewer || state.isLoading) return false;

        const nearBottom = msgContainer.scrollHeight
            - msgContainer.scrollTop - msgContainer.clientHeight <= 50;
        if (nearBottom) {
            ChatCommon.contextLoadNewerMessages(ctx);
            return true;
        }
        return false;
    },
};

window.ChatCommon = ChatCommon;
