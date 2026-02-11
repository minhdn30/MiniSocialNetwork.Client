/**
 * user-hub.js
 * Handles real-time checks for user-related events (Follow, User Update, etc.)
 */
(function(global) {
    let connection = null;

    const UserHub = {
        pendingJoins: new Set(), // Store groups to join once connected

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
                
                // BE returns: { CurrentId, Action, FollowCount }
                
                // Logic: Only update UI if we are currently viewing the profile of the user who received the notification (which is ME)
                // Why? Because this socket event is sent to "Account-{myId}". 
                
                const myId = localStorage.getItem("accountId");
                const targetId = data.targetId ?? data.TargetId;
                
                // 1. Check if we are on a profile page
                if (window.getProfileAccountId && typeof window.getProfileAccountId === 'function') {
                    const currentViewingProfileId = window.getProfileAccountId();
                    
                    // Logic: Update stats if we are viewing the profile that joined/left (TargetId)
                    // Match IDs (case-insensitive for safety)
                    
                    if (currentViewingProfileId && targetId && currentViewingProfileId.toLowerCase() === targetId.toLowerCase()) {
                         if (window.FollowModule && typeof FollowModule.syncFollowStatus === 'function') {
                             
                             const updateData = {
                                 followers: data.followers ?? data.Followers,
                                 following: data.following ?? data.Following
                             };
                             
                             // Pass undefined for isFollowing to avoid overwriting state in profile.js
                             // profile.js will only update counts
                             FollowModule.syncFollowStatus(targetId, undefined, updateData);
                             
                             // Notification logic: Only if *I* am the target and someone else followed me
                             const msgCurrentId = data.currentId ?? data.CurrentId;
                             const msgAction = data.action ?? data.Action;
                             
                             if (targetId === myId && msgCurrentId !== myId && window.toastInfo && msgAction === 'follow') {
                                 toastInfo("You have a new follower!");
                             }
                         }
                    }
                }
            });

            // Listen for new posts (for profile post count update)
            connection.on("ReceiveNewPost", (data) => {
                console.log("📌 [UserHub] New post created:", data);
                UserHub.updateProfilePostCount(data.accountId, 1);
            });

            // Listen for deleted posts (for profile post count update)
            connection.on("ReceiveDeletedPost", (postId, accountId) => {
                console.log("🗑️ [UserHub] Post Deleted:", postId);
                if (accountId) {
                    UserHub.updateProfilePostCount(accountId, -1);
                }
            });

            // Listen for profile data updates
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

            // Listen for account settings updates
            connection.on("ReceiveAccountSettingsUpdate", (settings) => {
                console.log("⚙️ [UserHub] Settings updated:", settings);
                
                const accountId = settings.accountId || settings.AccountId;
                const myId = localStorage.getItem("accountId");
                const isMe = accountId && myId && accountId.toLowerCase() === myId.toLowerCase();

                // 1. Update Profile Page if viewing this account
                if (window.ProfilePage) {
                    const currentProfileId = window.ProfilePage.getAccountId();
                    if (currentProfileId && accountId && currentProfileId.toLowerCase() === accountId.toLowerCase()) {
                        let currentProfileData = window.ProfilePage.getData();
                        if (currentProfileData) {
                            currentProfileData.settings = settings;
                            
                            // Re-apply visibility logic for phone/address if it's NOT me
                            if (!isMe) {
                                const isFollowed = currentProfileData?.followInfo?.isFollowedByCurrentUser ?? currentProfileData?.isFollowedByCurrentUser ?? false;
                                const info = currentProfileData.accountInfo || currentProfileData.account;
                                
                                if (info) {
                                    const phonePrivacy = settings.phonePrivacy ?? settings.PhonePrivacy ?? 0;
                                    const addressPrivacy = settings.addressPrivacy ?? settings.AddressPrivacy ?? 0;

                                    // Note: If we lose permission, the data (info.phone) might have been hidden previously.
                                    // If we gain permission, we might need a refresh. But usually, if it's cached, we have it.
                                    // Actually, if it was hidden by the server, real-time won't "unhide" it without a refresh 
                                    // because the 'value' isn't in the 'settings' object, but the profile data itself.
                                    // However, we can at least hide it immediately if privacy becomes stricter.
                                    
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

                // 2. Check Follow List permissions
                if (window.FollowListModule && typeof FollowListModule.checkPermission === 'function') {
                    FollowListModule.checkPermission(accountId, settings);
                }
            });

            // Listen for hidden messages (sync across devices)
            connection.on("ReceiveMessageHidden", (data) => {
                console.log("🙈 [UserHub] Message hidden (realtime):", data);
                if (window.ChatActions && typeof window.ChatActions.hideFromRealtime === 'function') {
                    window.ChatActions.hideFromRealtime(data);
                }
            });

            // Listen for global message notifications (Toasts/Badges)
            connection.on("ReceiveMessageNotification", (data) => {
                const convId = (data.ConversationId || data.conversationId || '').toLowerCase();
                const message = data.Message || data.message;
                const myId = (localStorage.getItem("accountId") || '').toLowerCase();
                const senderId = (message?.sender?.accountId || message?.Sender?.AccountId || '').toLowerCase();
                
                // Don't process if we are the sender
                if (senderId === myId) return;

                // Check if this chat is currently active (already being read)
                const isActiveInPage = window.ChatPage && window.ChatPage.currentChatId?.toLowerCase() === convId;
                
                // Case-insensitive check for ChatWindow Map keys
                let isActiveInWindow = false; if (window.ChatWindow && window.ChatWindow.openChats) { const chatObj = window.ChatWindow.openChats.get(convId) || Array.from(window.ChatWindow.openChats.values()).find(c => (c.data?.conversationId || "").toLowerCase() === convId); if (chatObj) { const chatBox = document.getElementById("chat-box-" + chatObj.data.conversationId); if (chatBox && chatBox.classList.contains("is-focused") && !chatObj.minimized) { isActiveInWindow = true; } } }

                // Show toast if chat is NOT active
                if (!isActiveInPage && !isActiveInWindow) {
                    const senderName = message?.sender?.fullName || message?.sender?.username || message?.Sender?.FullName || message?.Sender?.Username || "Someone";
                    const content = message?.content || message?.Content || "Sent you a media message";
                    
                    if (window.toastInfo) {
                        window.toastInfo(`💬 ${senderName}: ${content}`);
                    }

                    // Refresh global badge (server authoritative)
                    if (typeof scheduleGlobalUnreadRefresh === 'function') {
                        scheduleGlobalUnreadRefresh();
                    }
                }

                // Update sidebar item (preview, badge, move to top) — always
                if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                    window.ChatSidebar.incrementUnread(convId, message, (isActiveInPage || isActiveInWindow));
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
                 // console.warn(`[UserHub] Skip JoinGroup: ${accountId} is not a valid GUID`);
                 return;
             }

            if (!connection || connection.state !== "Connected") {
                console.log(`[UserHub] Connection not ready, queueing join for Account-${accountId}`);
                UserHub.pendingJoins.add(accountId);
                return;
            }
            try {
                // If it was in pending, remove it since we are processing it now
                if(UserHub.pendingJoins.has(accountId)) UserHub.pendingJoins.delete(accountId);
                
                await connection.invoke("JoinAccountGroup", accountId);
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

             // Ensure it's a GUID before invoking server method
             const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);
             if (!isGuid) return;

             // If we leave, also check pending to remove if not yet processed
             if (UserHub.pendingJoins.has(accountId)) {
                 UserHub.pendingJoins.delete(accountId);
             }
             
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
            // Check if we are currently viewing the profile of this account
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
                
                // Update text directly or via animation if available
                if (window.animateValue && typeof window.animateValue === 'function') {
                    window.animateValue(countEl, newValue);
                } else {
                    countEl.textContent = newValue;
                }
                
                // Update ProfileState if it exists
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
