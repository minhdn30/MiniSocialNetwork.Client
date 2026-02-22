/**
 * Create Chat Group Modal Logic
 * Uses system theme vars for consistent styling.
 */

let cgSelectedMembers = [];
let cgSearchResults = [];
let cgSearchDebounceTimer = null;
let cgSearchRequestSequence = 0;
let cgAvatarPreviewObjectUrl = null;
let cgIsEventBound = false;
let cgIsCreatingGroup = false;

const cgGetMemberLimit = () => window.APP_CONFIG?.GROUP_CHAT_MEMBER_LIMIT || 50;
const cgGetMinSelectedMembers = () => window.APP_CONFIG?.GROUP_CHAT_MIN_SELECTED_MEMBERS || 2;
const cgGetSearchLimit = () => window.APP_CONFIG?.GROUP_CHAT_INVITE_SEARCH_LIMIT || 10;
const cgGetSearchDebounceMs = () => window.APP_CONFIG?.GROUP_CHAT_INVITE_SEARCH_DEBOUNCE_MS || 300;
const cgGetAvatarMaxSizeMb = () => window.APP_CONFIG?.GROUP_CHAT_AVATAR_MAX_SIZE_MB || 5;
const cgGetAvatarMaxBytes = () => cgGetAvatarMaxSizeMb() * 1024 * 1024;
const cgGetDefaultAvatar = () => window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
const cgGetGroupNameMinLength = () => window.APP_CONFIG?.GROUP_NAME_MIN_LENGTH || 3;
const cgGetGroupNameMaxLength = () => window.APP_CONFIG?.GROUP_NAME_MAX_LENGTH || 50;

/* ===== Open / Close ===== */

window.openCreateChatGroupModal = function () {
    const modal = document.getElementById('createGroupModal');
    if (!modal) return;

    cgEnsureEventBindings();
    cgResetForm();

    modal.classList.add('show');
    if (window.lockScroll) window.lockScroll();

    cgSearchAccountsForInvite('', { showLoading: true });

    setTimeout(() => {
        document.getElementById('group-name-input')?.focus();
    }, 400);

    lucide.createIcons();
};

window.closeCreateChatGroupModal = function () {
    const modal = document.getElementById('createGroupModal');
    if (!modal) return;

    modal.classList.remove('show');
    if (window.unlockScroll) window.unlockScroll();
};

/* ===== Event Bindings ===== */

function cgEnsureEventBindings() {
    if (cgIsEventBound) return;

    const nameInput = document.getElementById('group-name-input');
    if (nameInput) {
        nameInput.maxLength = cgGetGroupNameMaxLength();
        nameInput.addEventListener('input', () => cgUpdateCreateBtn());
    }

    const searchInput = document.getElementById('member-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const keyword = (searchInput.value || '').trim();
            if (cgSearchDebounceTimer) clearTimeout(cgSearchDebounceTimer);

            // 1 char: just show hint, no API call
            if (keyword.length === 1) {
                cgRenderEmptyState('Type at least 2 characters to search');
                return;
            }

            // 0 chars: immediate API call (recent contacts)
            // ≥2 chars: debounced API call (search)
            const debounceMs = keyword.length === 0 ? 0 : cgGetSearchDebounceMs();
            cgSearchDebounceTimer = setTimeout(() => {
                cgSearchAccountsForInvite(keyword, { showLoading: true });
            }, debounceMs);
        });
    }

    const avatarInput = document.getElementById('group-avatar-input');
    if (avatarInput) {
        avatarInput.addEventListener('change', cgHandleAvatarUpload);
    }

    const removeAvatarBtn = document.getElementById('group-avatar-remove-btn');
    if (removeAvatarBtn) {
        removeAvatarBtn.addEventListener('click', () => {
            cgResetAvatarPreview({ clearInput: true });
        });
    }

    const friendList = document.getElementById('friend-selection-list');
    if (friendList) {
        friendList.addEventListener('click', (event) => {
            const item = event.target.closest('.cg-friend-item');
            if (!item || !friendList.contains(item)) return;

            cgToggleMember(
                item.dataset.id || '',
                item.dataset.name || '',
                item.dataset.avatar || '',
                item.dataset.username || '',
            );
        });
    }

    const selectedList = document.getElementById('selected-members-list');
    if (selectedList) {
        selectedList.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.cg-chip-remove');
            if (!removeBtn || !selectedList.contains(removeBtn)) return;
            event.stopPropagation();

            const memberId = removeBtn.dataset.id || '';
            const member = cgSelectedMembers.find((m) => m.id === memberId);
            if (!member) return;

            cgToggleMember(member.id, member.name, member.avatar, member.username);
        });
    }

    const createBtn = document.getElementById('btn-create-group');
    if (createBtn) {
        createBtn.addEventListener('click', cgHandleCreateGroup);
    }

    cgIsEventBound = true;
}

/* ===== Reset ===== */

function cgResetForm() {
    cgSelectedMembers = [];
    cgSearchResults = [];
    cgIsCreatingGroup = false;

    if (cgSearchDebounceTimer) {
        clearTimeout(cgSearchDebounceTimer);
        cgSearchDebounceTimer = null;
    }

    const nameInput = document.getElementById('group-name-input');
    if (nameInput) nameInput.value = '';

    const searchInput = document.getElementById('member-search-input');
    if (searchInput) searchInput.value = '';

    cgResetAvatarPreview({ clearInput: true });

    const selectedList = document.getElementById('selected-members-list');
    if (selectedList) { selectedList.innerHTML = ''; selectedList.classList.add('hidden'); }

    // Show hint
    const hint = document.getElementById('cg-no-members-hint');
    if (hint) hint.classList.remove('hidden');

    const createBtn = document.getElementById('btn-create-group');
    if (createBtn) createBtn.textContent = 'Create Group';

    cgRenderLoadingSkeleton();
    cgUpdateCount();
    cgUpdateCreateBtn();
}

/* ===== Avatar ===== */

function cgHandleAvatarUpload(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (file.size > cgGetAvatarMaxBytes()) {
        if (window.toastError) {
            window.toastError(`Image too large (max ${cgGetAvatarMaxSizeMb()}MB)`);
        }

        if (event?.target) {
            event.target.value = '';
        }
        return;
    }

    const previewUrl = URL.createObjectURL(file);
    cgPreviewGroupAvatarUrl(previewUrl);
}

function cgPreviewGroupAvatarUrl(url) {
    const avatarImg = document.getElementById('group-avatar-preview');
    const avatarIcon = document.getElementById('cg-avatar-icon');
    const removeAvatarBtn = document.getElementById('group-avatar-remove-btn');

    if (!avatarImg || !avatarIcon) return;

    if (cgAvatarPreviewObjectUrl) {
        URL.revokeObjectURL(cgAvatarPreviewObjectUrl);
        cgAvatarPreviewObjectUrl = null;
    }

    if (!url) {
        cgResetAvatarPreview({ clearInput: false });
        return;
    }

    cgAvatarPreviewObjectUrl = url;
    avatarImg.src = url;
    avatarImg.classList.remove('hidden');
    avatarIcon.style.display = 'none';
    removeAvatarBtn?.classList.remove('hidden');
}

function cgResetAvatarPreview({ clearInput } = { clearInput: false }) {
    const avatarImg = document.getElementById('group-avatar-preview');
    const avatarIcon = document.getElementById('cg-avatar-icon');
    const avatarInput = document.getElementById('group-avatar-input');
    const removeAvatarBtn = document.getElementById('group-avatar-remove-btn');

    if (cgAvatarPreviewObjectUrl) {
        URL.revokeObjectURL(cgAvatarPreviewObjectUrl);
        cgAvatarPreviewObjectUrl = null;
    }

    if (avatarImg) {
        avatarImg.src = '';
        avatarImg.classList.add('hidden');
    }

    if (avatarIcon) {
        avatarIcon.style.display = '';
    }

    if (clearInput && avatarInput) {
        avatarInput.value = '';
    }

    removeAvatarBtn?.classList.add('hidden');
}

window.cgPreviewGroupAvatarUrl = cgPreviewGroupAvatarUrl;
window.cgClearGroupAvatarPreview = () => cgResetAvatarPreview({ clearInput: true });

/* ===== Search Invite Accounts ===== */

async function cgSearchAccountsForInvite(keyword, { showLoading = true } = {}) {
    const normalizedKeyword = (keyword || '').trim();
    const list = document.getElementById('friend-selection-list');
    if (!list) return;

    // 1 char: don't call API, just show hint
    if (normalizedKeyword.length === 1) {
        cgRenderEmptyState('Type at least 2 characters to search');
        return;
    }

    if (!window.API?.Conversations?.searchAccountsForGroupInvite) {
        cgRenderEmptyState('Search API is unavailable');
        return;
    }

    const requestSequence = ++cgSearchRequestSequence;
    if (showLoading) {
        cgRenderLoadingSkeleton();
    }

    try {
        const excludeAccountIds = cgSelectedMembers.map((m) => m.id);
        const res = await window.API.Conversations.searchAccountsForGroupInvite(
            normalizedKeyword,
            excludeAccountIds,
            cgGetSearchLimit(),
        );

        if (requestSequence !== cgSearchRequestSequence) return;

        if (!res.ok) {
            let errorMessage = 'Failed to load users';
            try {
                const errorData = await res.json();
                errorMessage = errorData?.message || errorData?.title || errorMessage;
            } catch (_) { }
            cgRenderEmptyState(errorMessage);
            return;
        }

        const data = await res.json();
        if (requestSequence !== cgSearchRequestSequence) return;

        const apiUsers = (Array.isArray(data) ? data : [])
            .map(cgNormalizeSearchAccount)
            .filter((user) => user && user.id);

        const selectedUsers = cgSelectedMembers
            .map(cgNormalizeSelectedMember)
            .filter((user) => user && user.id)
            .filter((user) => cgDoesMemberMatchKeyword(user, normalizedKeyword));

        cgSearchResults = cgMergeAccountLists(selectedUsers, apiUsers);
        cgRenderFriends(cgSearchResults, normalizedKeyword);
    } catch (err) {
        if (requestSequence !== cgSearchRequestSequence) return;
        console.error('Failed to search group invite accounts:', err);
        cgRenderEmptyState('Could not connect to server');
    }
}

function cgNormalizeSearchAccount(raw) {
    if (!raw || typeof raw !== 'object') return null;

    return {
        id: raw.accountId || raw.AccountId || '',
        fullName: raw.fullName || raw.FullName || '',
        username: raw.username || raw.userName || raw.UserName || raw.Username || '',
        avatar: raw.avatarUrl || raw.AvatarUrl || raw.avatar || raw.Avatar || '',
    };
}

function cgNormalizeSelectedMember(member) {
    if (!member || typeof member !== 'object') return null;

    return {
        id: member.id || '',
        fullName: member.name || '',
        username: member.username || '',
        avatar: member.avatar || '',
    };
}

function cgDoesMemberMatchKeyword(member, keyword) {
    const normalizedKeyword = (keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) return true;

    const fullName = (member?.fullName || '').toLowerCase();
    const username = (member?.username || '').toLowerCase();

    return fullName.includes(normalizedKeyword) || username.includes(normalizedKeyword);
}

function cgMergeAccountLists(priorityUsers, apiUsers) {
    const merged = [];
    const seen = new Set();

    [...(priorityUsers || []), ...(apiUsers || [])].forEach((user) => {
        if (!user || !user.id) return;

        const key = String(user.id).toLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        merged.push(user);
    });

    return merged;
}

/* ===== Render ===== */

function cgRenderLoadingSkeleton() {
    const list = document.getElementById('friend-selection-list');
    if (!list) return;

    list.innerHTML = `
        <div class="cg-skeleton-item"></div>
        <div class="cg-skeleton-item"></div>
        <div class="cg-skeleton-item"></div>
    `;
}

function cgRenderEmptyState(message) {
    const list = document.getElementById('friend-selection-list');
    if (!list) return;

    list.innerHTML = `<div class="cg-empty-state">${cgEscapeHtml(message || 'No results')}</div>`;
}

function cgRenderFriends(users, keyword) {
    const list = document.getElementById('friend-selection-list');
    if (!list) return;

    if (!users || users.length === 0) {
        if ((keyword || '').length === 1) {
            cgRenderEmptyState('Type at least 2 characters to search');
            return;
        }

        if ((keyword || '').length === 0) {
            cgRenderEmptyState('No recent contacts available');
            return;
        }

        cgRenderEmptyState('No matching users found');
        return;
    }

    list.innerHTML = users.map(user => {
        const isSelected = cgSelectedMembers.some(m => m.id === user.id);
        const displayName = user.fullName || user.username || 'Unknown user';
        const displayUsername = user.username || 'unknown';
        const avatarUrl = user.avatar || cgGetDefaultAvatar();

        return `
            <div class="cg-friend-item ${isSelected ? 'selected' : ''}"
                 data-id="${cgEscapeHtmlAttr(user.id)}"
                 data-name="${cgEscapeHtmlAttr(displayName)}"
                 data-avatar="${cgEscapeHtmlAttr(user.avatar || '')}"
                 data-username="${cgEscapeHtmlAttr(user.username || '')}">
                <img src="${cgEscapeHtmlAttr(avatarUrl)}" onerror="this.src='${cgGetDefaultAvatar()}'" alt="">
                <div class="cg-friend-info">
                    <div class="cg-friend-username">${cgEscapeHtml(displayUsername)}</div>
                    <div class="cg-friend-name">${cgEscapeHtml(displayName)}</div>
                </div>
                <div class="cg-checkbox">
                    <i data-lucide="check" size="14"></i>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons({ container: list });
}

/* ===== Toggle Member Selection ===== */

function cgToggleMember(id, name, avatar, username) {
    if (!id) return;

    const idx = cgSelectedMembers.findIndex(m => m.id === id);

    if (idx === -1) {
        if (cgSelectedMembers.length >= cgGetMemberLimit()) {
            if (window.toastWarning) window.toastWarning(`Max ${cgGetMemberLimit()} members per group`);
            return;
        }
        cgSelectedMembers.push({ id, name, avatar, username });
    } else {
        cgSelectedMembers.splice(idx, 1);
    }

    // Immediate visual toggle on the friend list item
    const item = document.querySelector(`.cg-friend-item[data-id="${id}"]`);
    if (item) {
        item.classList.toggle('selected', cgSelectedMembers.some(m => m.id === id));
    }

    cgRenderChips();
    cgUpdateCount();
    cgUpdateCreateBtn();
}

/* ===== Render Selected Chips ===== */

function cgRenderChips() {
    const container = document.getElementById('selected-members-list');
    const hint = document.getElementById('cg-no-members-hint');
    if (!container) return;

    if (cgSelectedMembers.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        if (hint) hint.classList.remove('hidden');
        return;
    }

    if (hint) hint.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = cgSelectedMembers.map(m => {
        const displayUsername = m.username ? `@${m.username}` : '@unknown';

        return `
        <div class="cg-chip">
            <span class="cg-chip-username">${cgEscapeHtml(displayUsername)}</span>
            <button type="button" class="cg-chip-remove" data-id="${cgEscapeHtmlAttr(m.id)}">
                <i data-lucide="x" size="10"></i>
            </button>
        </div>
        `;
    }).join('');

    lucide.createIcons({ container });

    // Auto-scroll to newest chip
    setTimeout(() => { container.scrollLeft = container.scrollWidth; }, 80);
}



/* ===== Helpers ===== */

function cgUpdateCount() {
    const el = document.getElementById('cg-selected-count');
    if (el) el.textContent = `${cgSelectedMembers.length} selected`;
}

function cgUpdateCreateBtn() {
    const nameInput = document.getElementById('group-name-input');
    const btn = document.getElementById('btn-create-group');
    if (!nameInput || !btn) return;

    const valid =
        nameInput.value.trim().length >= cgGetGroupNameMinLength() &&
        cgSelectedMembers.length >= cgGetMinSelectedMembers();

    btn.disabled = cgIsCreatingGroup || !valid;
}

function cgEscapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function cgEscapeHtmlAttr(text) {
    return cgEscapeHtml(text).replace(/`/g, '&#96;');
}

/* ===== Create Group Action ===== */

async function cgHandleCreateGroup() {
    const createBtn = document.getElementById('btn-create-group');
    if (!createBtn || cgIsCreatingGroup) return;

    const name = document.getElementById('group-name-input')?.value.trim() || '';
    const memberIds = Array.from(new Set(cgSelectedMembers.map((m) => m.id).filter(Boolean)));
    const avatarFile = document.getElementById('group-avatar-input')?.files?.[0] || null;

    if (name.length < cgGetGroupNameMinLength()) {
        if (window.toastWarning) {
            window.toastWarning(`Group name must be at least ${cgGetGroupNameMinLength()} characters`);
        }
        cgUpdateCreateBtn();
        return;
    }

    if (memberIds.length < cgGetMinSelectedMembers()) {
        if (window.toastWarning) {
            window.toastWarning(`Select at least ${cgGetMinSelectedMembers()} members`);
        }
        cgUpdateCreateBtn();
        return;
    }

    if (!window.API?.Conversations?.createGroup) {
        if (window.toastError) window.toastError('Create group API is unavailable');
        return;
    }

    const formData = new FormData();
    formData.append('GroupName', name);
    if (avatarFile) {
        formData.append('GroupAvatar', avatarFile);
    }
    memberIds.forEach((memberId) => formData.append('MemberIds', memberId));

    cgIsCreatingGroup = true;
    createBtn.disabled = true;
    createBtn.classList.add('is-loading');
    createBtn.setAttribute('aria-busy', 'true');
    createBtn.innerHTML = '<span class="spinner spinner-tiny" aria-hidden="true"></span><span>Creating...</span>';

    try {
        const res = await window.API.Conversations.createGroup(formData);
        if (!res.ok) {
            const message = await cgReadErrorMessage(res, 'Failed to create group');
            if (window.toastError) window.toastError(message);
            return;
        }

        const conversation = await res.json();
        const conversationId =
            conversation?.conversationId ||
            conversation?.ConversationId ||
            null;

        if (window.ChatSidebar && typeof window.ChatSidebar.loadConversations === 'function') {
            await window.ChatSidebar.loadConversations(false);
        }

        if (typeof window.scheduleGlobalUnreadRefresh === 'function') {
            window.scheduleGlobalUnreadRefresh(0);
        }

        const isOnMessagesPage = window.location.hash.startsWith('#/messages');
        const shouldOpenConversation = !!conversationId && isOnMessagesPage;
        if (shouldOpenConversation) {
            if (window.ChatSidebar && typeof window.ChatSidebar.openConversation === 'function') {
                window.ChatSidebar.openConversation(conversationId);
            } else {
                window.location.hash = `#/messages?id=${conversationId}`;
            }
        }

        if (window.toastSuccess) {
            window.toastSuccess('Group created successfully');
        }

        window.closeCreateChatGroupModal();
    } catch (err) {
        console.error('Failed to create group:', err);
        if (window.toastError) window.toastError('Could not connect to server');
    } finally {
        cgIsCreatingGroup = false;
        createBtn.classList.remove('is-loading');
        createBtn.removeAttribute('aria-busy');
        createBtn.textContent = 'Create Group';
        cgUpdateCreateBtn();
    }
}

async function cgReadErrorMessage(res, fallbackMessage) {
    let message = fallbackMessage || 'Request failed';

    try {
        const data = await res.json();
        if (data && typeof data === 'object') {
            if (typeof data.message === 'string' && data.message.trim()) {
                return data.message.trim();
            }
            if (typeof data.title === 'string' && data.title.trim()) {
                return data.title.trim();
            }

            if (data.errors && typeof data.errors === 'object') {
                const firstErrorKey = Object.keys(data.errors)[0];
                const firstErrorValue = firstErrorKey ? data.errors[firstErrorKey] : null;
                if (Array.isArray(firstErrorValue) && firstErrorValue.length > 0) {
                    return String(firstErrorValue[0]);
                }
            }
        }
    } catch (_) { }

    try {
        const text = await res.text();
        if (typeof text === 'string' && text.trim()) {
            message = text.trim();
        }
    } catch (_) { }

    return message;
}
