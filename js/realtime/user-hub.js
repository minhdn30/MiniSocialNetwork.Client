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

            // 3. Start connection
            try {
                await connection.start();
                console.log("✅ [UserHub] Connected to UserHub");
                
                // 4. Join my own account group via the queue mechanism
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
                            console.log(`✅ [UserHub] Joined pending group Account-${pendingId}`);
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
                console.log(`✅ [UserHub] Joined group Account-${accountId}`);
            } catch (err) {
                console.error(`❌ [UserHub] Failed to join group Account-${accountId}`, err);
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
                console.log(`[UserHub] Left group Account-${accountId}`);
            } catch (err) {
                console.error(`[UserHub] Failed to leave group`, err);
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
