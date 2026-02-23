/**
 * user-hub.js
 * Handles real-time checks for user-related events (Follow, User Update, etc.)
 */
(function(global) {
    let connection = null;
    let isInitializing = false;
    let heartbeatTimer = null;
    const HEARTBEAT_INTERVAL_MS = Number(window.APP_CONFIG?.PRESENCE_HEARTBEAT_INTERVAL_MS) || 25000;
    const pendingAutoOpenConversations = new Set();
    const MESSAGE_NOTIFICATION_DEDUPE_WINDOW_MS =
        Number(window.APP_CONFIG?.CHAT_NOTIFICATION_DEDUPE_WINDOW_MS) || 10000;
    const processedMessageNotificationKeys = new Map();

    function stopHeartbeatLoop() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    async function sendHeartbeat() {
        if (!connection || connection.state !== "Connected") return;
        try {
            await connection.invoke("Heartbeat");
        } catch (_) {
            // ignore transient heartbeat errors
        }
    }

    function startHeartbeatLoop() {
        stopHeartbeatLoop();
        if (!connection || connection.state !== "Connected") return;
        sendHeartbeat();
        heartbeatTimer = setInterval(() => {
            sendHeartbeat();
        }, HEARTBEAT_INTERVAL_MS);
    }

    function isConversationOpenInWindow(conversationId) {
        if (!conversationId || !window.ChatWindow || typeof window.ChatWindow.getOpenChatId !== 'function') {
            return false;
        }
        return !!window.ChatWindow.getOpenChatId(conversationId);
    }

    async function tryAutoOpenConversationWindow(conversationId) {
        if (!conversationId || pendingAutoOpenConversations.has(conversationId)) {
            return;
        }
        if (!window.ChatWindow || typeof window.ChatWindow.openById !== 'function') {
            return;
        }

        pendingAutoOpenConversations.add(conversationId);
        try {
            if (isConversationOpenInWindow(conversationId)) return;

            // Attempt 1: immediate open.
            await window.ChatWindow.openById(conversationId, true, false);
            if (isConversationOpenInWindow(conversationId)) return;

            // Attempt 2: refresh sidebar source, then open again.
            if (window.ChatSidebar && typeof window.ChatSidebar.loadConversations === 'function') {
                try {
                    await window.ChatSidebar.loadConversations(false);
                } catch (e) {
                    console.warn("[UserHub] Sidebar refresh before auto-open failed:", e);
                }
            }
            await window.ChatWindow.openById(conversationId, true, false);
            if (isConversationOpenInWindow(conversationId)) return;

            // Attempt 3: short delayed retry for post-reload race windows.
            await new Promise(resolve => setTimeout(resolve, 300));
            if (window.ChatSidebar && typeof window.ChatSidebar.loadConversations === 'function') {
                try {
                    await window.ChatSidebar.loadConversations(false);
                } catch (e) {
                    console.warn("[UserHub] Delayed sidebar refresh before auto-open failed:", e);
                }
            }
            await window.ChatWindow.openById(conversationId, true, false);
        } catch (e) {
            console.error("[UserHub] Auto-open chat window failed:", e);
        } finally {
            pendingAutoOpenConversations.delete(conversationId);
        }
    }

    function cleanupProcessedNotificationKeys(nowMs) {
        if (processedMessageNotificationKeys.size === 0) return;
        for (const [key, ts] of processedMessageNotificationKeys.entries()) {
            if (nowMs - ts > MESSAGE_NOTIFICATION_DEDUPE_WINDOW_MS) {
                processedMessageNotificationKeys.delete(key);
            }
        }
    }

    function buildMessageNotificationKey(conversationId, message) {
        const convId = (conversationId || '').toString().toLowerCase();
        if (!convId) return '';

        const messageId = (
            message?.messageId ||
            message?.MessageId ||
            message?.id ||
            message?.Id ||
            ''
        ).toString().toLowerCase();
        if (messageId) {
            return `${convId}:${messageId}`;
        }

        const senderId = (
            message?.sender?.accountId ||
            message?.Sender?.AccountId ||
            message?.senderId ||
            message?.SenderId ||
            ''
        ).toString().toLowerCase();
        const sentAt = (message?.sentAt || message?.SentAt || '').toString().toLowerCase();
        const content = (message?.content || message?.Content || '').toString().trim().toLowerCase();
        const mediaCount = Array.isArray(message?.medias)
            ? message.medias.length
            : Array.isArray(message?.Medias)
                ? message.Medias.length
                : 0;

        return `${convId}:${senderId}:${sentAt}:${content}:${mediaCount}`;
    }

    function isDuplicateMessageNotification(conversationId, message) {
        const key = buildMessageNotificationKey(conversationId, message);
        if (!key) return false;

        const nowMs = Date.now();
        cleanupProcessedNotificationKeys(nowMs);

        const previousTs = processedMessageNotificationKeys.get(key);
        if (typeof previousTs === 'number' && nowMs - previousTs < MESSAGE_NOTIFICATION_DEDUPE_WINDOW_MS) {
            return true;
        }

        processedMessageNotificationKeys.set(key, nowMs);
        return false;
    }

    function handleIncomingMessageNotification(data) {
        const convId = (data.ConversationId || data.conversationId || '').toLowerCase();
        const message = data.Message || data.message;
        const isMuted = data.IsMuted ?? data.isMuted ?? false;
        const targetAccountId = (data.TargetAccountId || data.targetAccountId || '').toLowerCase();
        const myId = (localStorage.getItem("accountId") || '').toLowerCase();
        const senderId = (message?.sender?.accountId || message?.Sender?.AccountId || '').toLowerCase();

        // Safety guard: ignore notifications not explicitly targeted to this account.
        if (targetAccountId && myId && targetAccountId !== myId) return;
        if (!convId || senderId === myId) return;
        if (isDuplicateMessageNotification(convId, message)) return;

        const isChatPage = document.body.classList.contains('is-chat-page');
        const isActiveInPage = isChatPage && window.ChatPage && window.ChatPage.currentChatId?.toLowerCase() === convId;

        let isActiveInWindow = false;
        let isOpenInWindow = false;
        if (window.ChatWindow && window.ChatWindow.openChats && typeof window.ChatWindow.getOpenChatId === 'function') {
            const openId = window.ChatWindow.getOpenChatId(convId);
            if (openId) {
                isOpenInWindow = true;
                const chatObj = window.ChatWindow.openChats.get(openId);
                const chatBox = document.getElementById(`chat-box-${openId}`);
                if (chatObj && chatBox && chatBox.classList.contains("is-focused") && !chatObj.minimized) {
                    isActiveInWindow = true;
                }
            }
        }

        const shouldIncrementUnread = !isActiveInPage && !isActiveInWindow;

        if (shouldIncrementUnread && typeof scheduleGlobalUnreadRefresh === 'function') {
            scheduleGlobalUnreadRefresh();
        }

        if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
            window.ChatSidebar.incrementUnread(convId, message, !shouldIncrementUnread);
        }

        if (isOpenInWindow && window.ChatWindow && typeof window.ChatWindow.syncUnreadFromSidebar === 'function') {
            window.ChatWindow.syncUnreadFromSidebar(convId, {
                expectIncomingUnreadIncrement: shouldIncrementUnread
            });
        }

        const shouldAutoOpenWindow = !isMuted && !isChatPage && !isOpenInWindow;
        if (shouldAutoOpenWindow) {
            console.log(`💬 [UserHub] Auto-opening chat window for conversation: ${convId}`);
            // priorityLeft=true (leftmost position), shouldFocus=false (don't steal focus)
            tryAutoOpenConversationWindow(convId);
        }
    }

    const UserHub = {
        pendingJoins: new Set(), // Store groups to join once connected
        joinedGroups: new Set(), // Track groups already joined to avoid duplicates

        rejoinTrackedGroups: async function() {
            if (!connection || connection.state !== "Connected") return;

            const idsToRejoin = Array.from(this.joinedGroups);
            if (!idsToRejoin.length) return;

            this.joinedGroups.clear();
            for (const accountId of idsToRejoin) {
                try {
                    await connection.invoke("JoinAccountGroup", accountId);
                    this.joinedGroups.add(accountId);
                } catch (err) {
                    console.error(`❌ [UserHub] Failed to rejoin group Account-${accountId}:`, err);
                }
            }
        },

        /**
         * Initialize connection
         */
        init: async function() {
            if (connection || isInitializing) return;
            isInitializing = true;

            try {
                const token = window.AuthStore?.getAccessToken?.() || (window.AuthStore?.ensureAccessToken ? await window.AuthStore.ensureAccessToken() : null);
                if (!token) return;

                const getTokenForHub = async () => {
                    const current = window.AuthStore?.getAccessToken?.();
                    if (current) return current;
                    if (window.AuthStore?.ensureAccessToken) {
                        return (await window.AuthStore.ensureAccessToken()) || "";
                    }
                    return "";
                };

                // 1. Create connection
                const hubBase = window.APP_CONFIG?.HUB_BASE || "http://localhost:5000";
                connection = new signalR.HubConnectionBuilder()
                    .withUrl(`${hubBase}/userHub`, {
                        accessTokenFactory: () => getTokenForHub()
                    })
                    .withAutomaticReconnect()
                    .build();

                connection.onreconnecting(() => {
                    stopHeartbeatLoop();
                });

                connection.onreconnected(async () => {
                    await UserHub.rejoinTrackedGroups();
                    startHeartbeatLoop();
                });

                connection.onclose(() => {
                    stopHeartbeatLoop();
                });

                // 2. Register event listeners
                connection.on("ReceiveFollowNotification", (data) => {
                console.log("🔔 [UserHub] Received follow notification:", data);
                
                const myId = localStorage.getItem("accountId");
                const targetId = data.targetId ?? data.TargetId;
                
                if (window.getProfileAccountId && typeof window.getProfileAccountId === 'function') {
                    const currentViewingProfileId = window.getProfileAccountId();
                    
                    if (currentViewingProfileId && targetId && currentViewingProfileId.toLowerCase() === targetId.toLowerCase()) {
                         if (window.FollowModule && typeof FollowModule.syncFollowStatus === 'function') {
                             const updateData = {
                                 followers: data.followers ?? data.Followers,
                                 following: data.following ?? data.Following
                             };
                             FollowModule.syncFollowStatus(targetId, undefined, updateData);
                             
                             const msgCurrentId = data.currentId ?? data.CurrentId;
                             const msgAction = data.action ?? data.Action;
                             
                             if (targetId === myId && msgCurrentId !== myId && window.toastInfo && msgAction === 'follow') {
                                 toastInfo("You have a new follower!");
                             }
                         }
                    }
                }
            });

            connection.on("ReceiveNewPost", (data) => {
                console.log("📌 [UserHub] New post created:", data);
                UserHub.updateProfilePostCount(data.accountId, 1);
            });

            connection.on("ReceiveDeletedPost", (postId, accountId) => {
                console.log("🗑️ [UserHub] Post Deleted:", postId);
                if (accountId) {
                    UserHub.updateProfilePostCount(accountId, -1);
                }
            });

            connection.on("ReceiveProfileUpdate", (account) => {
                console.log("👤 [UserHub] Profile updated:", account);
                
                if (!window.ProfilePage) return;
                
                const currentProfileId = window.ProfilePage.getAccountId();
                const accountId = account.accountId || account.AccountId;
                
                if (currentProfileId && accountId && currentProfileId.toLowerCase() !== accountId.toLowerCase()) {
                    return;
                }

                console.log("🔄 [UserHub] Applying realtime update for:", account.username || account.Username);

                const myId = localStorage.getItem("accountId");
                const isMe = accountId.toLowerCase() === myId?.toLowerCase();
                
                let safeAccount = { ...account };
                let currentProfileData = window.ProfilePage.getData();

                if (!isMe && currentProfileData) {
                    const isFollowed = currentProfileData?.followInfo?.isFollowedByCurrentUser ?? currentProfileData?.isFollowedByCurrentUser ?? false;
                    const settings = account.settings || account.Settings || {};
                    
                    safeAccount.email = null;
                    const phonePrivacy = settings.phonePrivacy ?? settings.PhonePrivacy ?? 0;
                    const addressPrivacy = settings.addressPrivacy ?? settings.AddressPrivacy ?? 0;

                    const canSeePhone = phonePrivacy === 0 || (phonePrivacy === 1 && isFollowed);
                    if (!canSeePhone) safeAccount.phone = null;
                    
                    const canSeeAddress = addressPrivacy === 0 || (addressPrivacy === 1 && isFollowed);
                    if (!canSeeAddress) safeAccount.address = null;
                }

                if (currentProfileData) {
                    const info = currentProfileData.accountInfo || currentProfileData.account;
                    if (info) {
                        info.fullName = account.fullName || account.FullName || info.fullName;
                        info.avatarUrl = account.avatarUrl || account.AvatarUrl || info.avatarUrl;
                        info.coverUrl = account.coverUrl || account.CoverUrl || info.coverUrl;
                        info.bio = account.bio || account.Bio || info.bio;
                        info.phone = safeAccount.phone || safeAccount.Phone || null;
                        info.address = safeAccount.address || safeAccount.Address || null;
                        info.username = account.username || account.Username || info.username;
                    }
                    if (account.settings || account.Settings) {
                        currentProfileData.settings = account.settings || account.Settings;
                    }
                    
                    window.ProfilePage.setData(currentProfileData);
                    window.ProfilePage.renderHeader();
                }

                if (isMe) {
                    const avatar = account.avatarUrl || account.AvatarUrl || "";
                    const fullname = account.fullName || account.FullName || "";
                    const username = account.username || account.Username || "";

                    localStorage.setItem("avatarUrl", avatar);
                    localStorage.setItem("fullname", fullname);
                    localStorage.setItem("username", username);
                    
                    if (window.updateSidebarInfo) {
                        window.updateSidebarInfo(avatar, username || fullname);
                    }
                }
            });

            connection.on("ReceiveAccountSettingsUpdate", (settings) => {
                console.log("⚙️ [UserHub] Settings updated:", settings);
                
                const accountId = settings.accountId || settings.AccountId;
                const myId = localStorage.getItem("accountId");
                const isMe = accountId && myId && accountId.toLowerCase() === myId.toLowerCase();

                if (window.ProfilePage) {
                    const currentProfileId = window.ProfilePage.getAccountId();
                    if (currentProfileId && accountId && currentProfileId.toLowerCase() === accountId.toLowerCase()) {
                        let currentProfileData = window.ProfilePage.getData();
                        if (currentProfileData) {
                            currentProfileData.settings = settings;
                            if (!isMe) {
                                const isFollowed = currentProfileData?.followInfo?.isFollowedByCurrentUser ?? currentProfileData?.isFollowedByCurrentUser ?? false;
                                const info = currentProfileData.accountInfo || currentProfileData.account;
                                
                                if (info) {
                                    const phonePrivacy = settings.phonePrivacy ?? settings.PhonePrivacy ?? 0;
                                    const addressPrivacy = settings.addressPrivacy ?? settings.AddressPrivacy ?? 0;
                                    
                                    const canSeePhone = phonePrivacy === 0 || (phonePrivacy === 1 && isFollowed);
                                    if (!canSeePhone) info.phone = null;
                                    
                                    const canSeeAddress = addressPrivacy === 0 || (addressPrivacy === 1 && isFollowed);
                                    if (!canSeeAddress) info.address = null;
                                }
                            }
                            window.ProfilePage.setData(currentProfileData);
                            window.ProfilePage.renderHeader();
                        }
                    }
                }

                if (window.FollowListModule && typeof FollowListModule.checkPermission === 'function') {
                    FollowListModule.checkPermission(accountId, settings);
                }
            });

            connection.on("ReceiveMessageHidden", (data) => {
                const targetAccountId = (data?.TargetAccountId || data?.targetAccountId || '').toString().toLowerCase();
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                if (targetAccountId && myId && targetAccountId !== myId) return;
                console.log("🙈 [UserHub] Message hidden (realtime):", data);
                if (window.ChatActions && typeof window.ChatActions.hideFromRealtime === 'function') {
                    window.ChatActions.hideFromRealtime(data);
                }
            });

            connection.on("UserOnline", (data) => {
                if (window.PresenceStore && typeof window.PresenceStore.applyOnlineEvent === 'function') {
                    window.PresenceStore.applyOnlineEvent(data);
                }
            });

            connection.on("UserOffline", (data) => {
                if (window.PresenceStore && typeof window.PresenceStore.applyOfflineEvent === 'function') {
                    window.PresenceStore.applyOfflineEvent(data);
                }
            });

            connection.on("UserPresenceHidden", (data) => {
                if (window.PresenceStore && typeof window.PresenceStore.applyHiddenEvent === 'function') {
                    window.PresenceStore.applyHiddenEvent(data);
                }
            });

            connection.on("ReceiveMessageNotification", (data) => {
                handleIncomingMessageNotification(data);
            });

            connection.on("ReceiveConversationMuteUpdated", (data) => {
                const targetAccountId = (data?.TargetAccountId || data?.targetAccountId || '').toString().toLowerCase();
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                if (targetAccountId && myId && targetAccountId !== myId) return;
                const conversationId = (data?.ConversationId || data?.conversationId || '').toString().toLowerCase();
                const isMuted = !!(data?.IsMuted ?? data?.isMuted);
                if (!conversationId) return;

                if (window.ChatSidebar && typeof window.ChatSidebar.setMuteStatus === 'function') {
                    window.ChatSidebar.setMuteStatus(conversationId, isMuted, { forceRender: true });
                }
                if (window.ChatWindow && typeof window.ChatWindow.setMuteStatus === 'function') {
                    window.ChatWindow.setMuteStatus(conversationId, isMuted);
                }
                if (window.ChatPage && typeof window.ChatPage.applyMuteStatus === 'function') {
                    window.ChatPage.applyMuteStatus(conversationId, isMuted);
                }
            });

            connection.on("ReceiveConversationRemoved", (data) => {
                const targetAccountId = (data?.TargetAccountId || data?.targetAccountId || '').toString().toLowerCase();
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                if (targetAccountId && myId && targetAccountId !== myId) return;
                const conversationId = (data?.ConversationId || data?.conversationId || '').toString().toLowerCase();
                const reason = (data?.Reason || data?.reason || '').toString().toLowerCase();
                if (!conversationId) return;

                if (window.ChatSidebar && typeof window.ChatSidebar.removeConversation === 'function') {
                    window.ChatSidebar.removeConversation(conversationId);
                }
                if (window.ChatWindow && typeof window.ChatWindow.removeConversation === 'function') {
                    window.ChatWindow.removeConversation(conversationId);
                }
                if (window.ChatPage && typeof window.ChatPage.applyConversationRemoved === 'function') {
                    window.ChatPage.applyConversationRemoved(conversationId, reason);
                }
            });

            connection.on("ReceiveConversationNicknameUpdated", (data) => {
                const targetAccountId = (data?.TargetAccountId || data?.targetAccountId || '').toString().toLowerCase();
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                if (targetAccountId && myId && targetAccountId !== myId) return;
                const conversationId = (data?.ConversationId || data?.conversationId || '').toString().toLowerCase();
                const accountId = (data?.AccountId || data?.accountId || '').toString().toLowerCase();
                const nicknameRaw = data?.Nickname ?? data?.nickname;
                const nickname = (typeof nicknameRaw === 'string' && nicknameRaw.trim().length > 0) ? nicknameRaw.trim() : null;

                if (!conversationId || !accountId) return;

                if (window.ChatSidebar && typeof window.ChatSidebar.applyNicknameUpdate === 'function') {
                    window.ChatSidebar.applyNicknameUpdate(conversationId, accountId, nickname);
                }
                if (window.ChatWindow && typeof window.ChatWindow.applyNicknameUpdate === 'function') {
                    window.ChatWindow.applyNicknameUpdate(conversationId, accountId, nickname);
                }
                if (window.ChatPage && typeof window.ChatPage.applyNicknameUpdate === 'function') {
                    window.ChatPage.applyNicknameUpdate(conversationId, accountId, nickname);
                }
            });

            // 3. Start connection
            try {
                await connection.start();
                console.log("✅ [UserHub] Connected successfully");
                
                // 4. Join my own account group
                const accountId = localStorage.getItem("accountId");
                if (accountId) {
                   UserHub.joinGroup(accountId);
                }
                
                // 5. Process any pending joins that were requested while connecting
                if (UserHub.pendingJoins.size > 0) {
                    console.log(`[UserHub] Processing ${UserHub.pendingJoins.size} pending group joins...`);
                    for (const pendingId of UserHub.pendingJoins) {
                        try {
                            await connection.invoke("JoinAccountGroup", pendingId);
                            UserHub.joinedGroups.add(pendingId);
                            console.log(`✅ Joined pending Account-${pendingId} group`);
                        } catch (err) {
                            console.error(`❌ [UserHub] Failed to join pending group Account-${pendingId}`, err);
                        }
                    }
                    UserHub.pendingJoins.clear();
                }

                startHeartbeatLoop();

            } catch (err) {
                console.error("❌ [UserHub] Connection failed: ", err);
                connection = null;
            }
            } finally {
                isInitializing = false;
            }
        },

        /**
         * Join an account group (usually the user's own ID or profiles they are viewing)
         */
        joinGroup: async function(accountId) {
             if (!accountId) return;
             
             // Ensure it's a GUID before invoking server method
             const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);
             if (!isGuid) {
                 return;
             }

             // Avoid duplicate joins
             if (this.joinedGroups.has(accountId)) {
                 return;
             }

            if (!connection || connection.state !== "Connected") {
                console.log(`[UserHub] Connection not ready, queueing join for Account-${accountId}`);
                UserHub.pendingJoins.add(accountId);
                return;
            }
            try {
                if(UserHub.pendingJoins.has(accountId)) UserHub.pendingJoins.delete(accountId);
                
                await connection.invoke("JoinAccountGroup", accountId);
                this.joinedGroups.add(accountId);
                console.log(`✅ Joined Account-${accountId} group`);
            } catch (err) {
                console.error(`❌ Failed to join group Account-${accountId}:`, err);
            }
        },

        /**
         * Leave an account group
         */
        leaveGroup: async function(accountId) {
             if (!accountId) return;

             const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);
             if (!isGuid) return;

             if (UserHub.pendingJoins.has(accountId)) {
                 UserHub.pendingJoins.delete(accountId);
             }
             
             // Always remove from tracked groups even if offline
             this.joinedGroups.delete(accountId);

            if (!connection || connection.state !== "Connected") return;
            try {
                await connection.invoke("LeaveAccountGroup", accountId);
                console.log(`👋 Left Account-${accountId} group`);
            } catch (err) {
                console.error(`❌ Failed to leave group Account-${accountId}:`, err);
            }
        },

        /**
         * Update total post count in profile header
         */
        updateProfilePostCount: function(accountId, delta) {
            if (window.getProfileAccountId && typeof window.getProfileAccountId === 'function') {
                const currentProfileId = window.getProfileAccountId();
                if (currentProfileId && accountId && currentProfileId.toLowerCase() !== accountId.toLowerCase()) {
                    return;
                }
            }

            const countEl = document.getElementById("profile-posts-count");
            if (countEl) {
                const current = parseInt(countEl.textContent) || 0;
                const newValue = Math.max(0, current + delta);
                console.log(`📈 [UserHub] Updating profile post count: ${current} -> ${newValue}`);
                
                if (window.animateValue && typeof window.animateValue === 'function') {
                    window.animateValue(countEl, newValue);
                } else {
                    countEl.textContent = newValue;
                }
                
                if (window.ProfileState && typeof window.ProfileState.getPageData === 'function') {
                    const data = window.ProfileState.getPageData();
                    if (data) data.postCount = newValue;
                }
            }
        }
    };

    global.UserHub = UserHub;
    
    // Auto-init if user is logged in
    document.addEventListener("DOMContentLoaded", () => {
        UserHub.init();
    });

    window.addEventListener(window.AuthStore?.EVENT || "auth:token-changed", (evt) => {
        if (evt?.detail?.hasToken) {
            UserHub.init();
        } else {
            stopHeartbeatLoop();
        }
    });

})(window);
