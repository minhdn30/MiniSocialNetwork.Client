/**
 * user-hub.js
 * Handles real-time checks for user-related events (Follow, User Update, etc.)
 */
(function(global) {
    let connection = null;

    const UserHub = {
        pendingJoins: new Set(), // Store groups to join once connected
        joinedGroups: new Set(), // Track groups already joined to avoid duplicates

        /**
         * Initialize connection
         */
        init: async function() {
            if (connection) return;

            const token = localStorage.getItem("accessToken");
            if (!token) return;

            // 1. Create connection
            connection = new signalR.HubConnectionBuilder()
                .withUrl(`http://localhost:5000/userHub`, {
                    accessTokenFactory: () => localStorage.getItem("accessToken")
                })
                .withAutomaticReconnect()
                .build();

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
                console.log("🙈 [UserHub] Message hidden (realtime):", data);
                if (window.ChatActions && typeof window.ChatActions.hideFromRealtime === 'function') {
                    window.ChatActions.hideFromRealtime(data);
                }
            });

            connection.on("ReceiveMessageNotification", (data) => {
                const convId = (data.ConversationId || data.conversationId || '').toLowerCase();
                const message = data.Message || data.message;
                const isMuted = data.IsMuted ?? data.isMuted ?? false;
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                const senderId = (message?.sender?.accountId || message?.Sender?.AccountId || '').toLowerCase();
                
                if (senderId === myId) return;

                const isChatPage = document.body.classList.contains('is-chat-page');
                const isActiveInPage = isChatPage && window.ChatPage && window.ChatPage.currentChatId?.toLowerCase() === convId;
                
                let isActiveInWindow = false; 
                let isOpenInWindow = false;
                if (window.ChatWindow && window.ChatWindow.openChats) { 
                    const openId = window.ChatWindow.getOpenChatId(convId);
                    if (openId) {
                        isOpenInWindow = true;
                        const chatObj = window.ChatWindow.openChats.get(openId);
                        const chatBox = document.getElementById("chat-box-" + chatObj.data.conversationId); 
                        if (chatBox && chatBox.classList.contains("is-focused") && !chatObj.minimized) { 
                            isActiveInWindow = true; 
                        }
                    }
                }


                if (!isActiveInPage && !isActiveInWindow) {
                    if (typeof scheduleGlobalUnreadRefresh === 'function') {
                        scheduleGlobalUnreadRefresh();
                    }
                }

                // Update sidebar FIRST (before auto-open so unread count syncs properly)
                if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                    window.ChatSidebar.incrementUnread(convId, message, (isActiveInPage || isActiveInWindow));
                }

                // Auto-open chat window if: not muted, not on chat-page, and not already open
                // This runs AFTER sidebar update so getSyncUnreadCount() works correctly
                if (!isMuted && !isChatPage && !isOpenInWindow) {
                    if (window.ChatWindow && typeof window.ChatWindow.openById === 'function') {
                        console.log(`💬 [UserHub] Auto-opening chat window for conversation: ${convId}`);
                        // priorityLeft=true (leftmost position), shouldFocus=false (don't steal focus)
                        window.ChatWindow.openById(convId, true, false);
                    }
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

            } catch (err) {
                console.error("❌ [UserHub] Connection failed: ", err);
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
        if (localStorage.getItem("accessToken")) {
            UserHub.init();
        }
    });

})(window);
