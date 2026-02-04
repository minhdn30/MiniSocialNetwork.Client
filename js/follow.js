/**
 * follow.js
 * Handles all Follow/Unfollow logic and UI synchronization
 */

(function(global) {
    const FollowModule = {};

    /**
     * Follow a user
     * @param {string} accountId - The ID of the user to follow
     * @param {HTMLElement} [btn] - The button element that triggered the action (optional)
     */
    FollowModule.followUser = async function(accountId, btn) {
        if (btn) btn.disabled = true;
        
        try {
            const res = await API.Follows.follow(accountId);
            if (!res.ok) throw new Error("Follow failed");
            
            if (window.toastSuccess) window.toastSuccess("Following");
            
            // Sync UI across valid components
            FollowModule.syncFollowStatus(accountId, true);

        } catch (err) {
            console.error(err);
            if (window.toastError) window.toastError("Failed to follow user");
            if (btn) btn.disabled = false;
        }
    };

    /**
     * Unfollow a user
     * @param {string} accountId - The ID of the user to unfollow
     * @param {HTMLElement} [btn] - The button element that triggered the action (optional)
     */
    FollowModule.unfollowUser = async function(accountId, btn) {
        if (btn) btn.disabled = true;
        
        try {
            const res = await API.Follows.unfollow(accountId);
            if (!res.ok) throw new Error("Unfollow failed");
            
            if (window.toastInfo) window.toastInfo("Unfollowed");
            
            // Sync UI across valid components
            FollowModule.syncFollowStatus(accountId, false);

        } catch (err) {
            console.error(err);
            if (window.toastError) window.toastError("Failed to unfollow user");
            if (btn) btn.disabled = false;
        }
    };

    /**
     * Sync follow status across different UI components (Feed, Profile Preview, etc.)
     * @param {string} accountId 
     * @param {boolean} isFollowing 
     */
    FollowModule.syncFollowStatus = function(accountId, isFollowing) {
        // 1. Update Feed Buttons
        updateFeedButtons(accountId, isFollowing);

        // 2. Update Profile Preview if open and matches user
        // Check if profile preview is open and belongs to this user
        // We rely on window.getProfilePreviewAccountId() exposed by profile-proview.js
        if (typeof window.getProfilePreviewAccountId === 'function' && 
            window.getProfilePreviewAccountId() === accountId) {
            
             const previewBtn = document.getElementById("followBtn");
             if (previewBtn) {
                 if (isFollowing) {
                     // Change to "Following"
                     previewBtn.innerHTML = `
                        <i data-lucide="check"></i>
                        <span>Following</span>
                     `;
                     previewBtn.className = "btn btn-following";
                     
                     // Reset onclick to same handler (visual update only)
                     if (window.lucide) lucide.createIcons();
                 } else {
                     // Change to "Follow"
                     previewBtn.textContent = "Follow";
                     previewBtn.className = "btn btn-follow";
                 }
             }
        }
    };

    /**
     * Internal helper to update buttons in the feed
     */
    function updateFeedButtons(accountId, isFollowing) {
        // Find all posts by this author
        const posts = document.querySelectorAll(`.post .post-user[data-account-id="${accountId}"]`);
        
        posts.forEach(userEl => {
            const postHeader = userEl.closest(".post-header");
            if (!postHeader) return;
            
            const actionsDiv = postHeader.querySelector(".post-actions");
            let followBtn = actionsDiv.querySelector(".follow-btn");
            
            if (!isFollowing) {
                // Unfollowed -> Show Button
                if (!followBtn) {
                    followBtn = document.createElement("button");
                    followBtn.className = "follow-btn";
                    followBtn.textContent = "Follow";
                    followBtn.onclick = function() {
                        FollowModule.followUser(accountId, this);
                    };
                    
                    const moreBtn = actionsDiv.querySelector(".post-more");
                    if (moreBtn) {
                        actionsDiv.insertBefore(followBtn, moreBtn);
                    } else {
                        actionsDiv.appendChild(followBtn);
                    }
                } else {
                    followBtn.style.display = "";
                }
            } else {
                // Followed -> Hide Button
                if (followBtn) {
                    followBtn.remove();
                }
            }
        });
    }

    // Export
    global.FollowModule = FollowModule;

})(window);
