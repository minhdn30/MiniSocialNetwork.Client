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
            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                console.warn("Failed to parse follow response as JSON");
            }

            if (!res.ok) {
                const errorMsg = data?.message || "Follow failed";
                throw new Error(`${errorMsg} (Status ${res.status})`);
            }
            
            if (window.toastSuccess) window.toastSuccess("Following");
            
            // Sync UI across valid components using fresh BE data
            FollowModule.syncFollowStatus(accountId, true, data);

        } catch (err) {
            console.error(err);
            if (window.toastError) window.toastError(err.message || "Failed to follow user");
        } finally {
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
            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                console.warn("Failed to parse unfollow response as JSON");
            }

            if (!res.ok) {
                const errorMsg = data?.message || "Unfollow failed";
                throw new Error(`${errorMsg} (Status ${res.status})`);
            }
            
            if (window.toastInfo) window.toastInfo("Unfollowed");
            
            // Sync UI across valid components using fresh BE data
            FollowModule.syncFollowStatus(accountId, false, data);

        } catch (err) {
            console.error(err);
            if (window.toastError) window.toastError(err.message || "Failed to unfollow user");
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    /**
     * Show unfollow confirmation popup
     * @param {string} accountId 
     * @param {HTMLElement} [btn] 
     */
    FollowModule.showUnfollowConfirm = function(accountId, btn) {
        const overlay = document.createElement("div");
        overlay.className = "unfollow-overlay";

        const popup = document.createElement("div");
        popup.className = "unfollow-popup";

        popup.innerHTML = `
            <div class="unfollow-content">
                <h3>Unfollow this account?</h3>
                <p>You can always follow them again later.</p>
            </div>
            <div class="unfollow-actions">
                <button class="unfollow-btn unfollow-confirm" id="unfollowConfirm">Unfollow</button>
                <button class="unfollow-btn unfollow-cancel" id="unfollowCancel">Cancel</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add("show"));

        document.getElementById("unfollowConfirm").onclick = () => {
            FollowModule.unfollowUser(accountId, btn);
            closePopup();
        };

        const closeBtn = document.getElementById("unfollowCancel");
        const closePopup = () => {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 200);
        };
        closeBtn.onclick = closePopup;
        overlay.onclick = (e) => { if (e.target === overlay) closePopup(); };
    };

    /**
     * Sync follow status across different UI components (Feed, Profile Preview, etc.)
     * @param {string} accountId 
     * @param {boolean} isFollowing 
     * @param {object} [freshData] - Optional data from BE (followers, following, isFollowed)
     */
    FollowModule.syncFollowStatus = function(accountId, isFollowing, freshData = null) {
        // Normalize casing for freshData (handle both camelCase and PascalCase from BE)
        let followers, following;
        
        if (freshData) {
            // Priority: Explicit Followers/Following from new API response
            followers = freshData.followers ?? freshData.Followers;
            following = freshData.following ?? freshData.Following;
        }

        // 1. Update Caches
        if (window.PageCache) {
            if (PageCache.has("home")) {
                const homeCache = PageCache.get("home");
                if (homeCache.data && homeCache.data.posts && isFollowing !== undefined) {
                    homeCache.data.posts.forEach(post => {
                        if (post.author && post.author.accountId == accountId) {
                            post.author.isFollowedByCurrentUser = isFollowing;
                        }
                    });
                }
            }
            // Only clear cache for OTHER profiles.
            // For my own profile, we rely on silent update to preserve scroll position.
            // 1. Update Caches
            const myId = localStorage.getItem("accountId");
            const myUsername = localStorage.getItem("username");
            const isMe = accountId.toLowerCase() === myId?.toLowerCase();

            if (!isMe) {
                 // Foreign Profile: Router handles clearing cache on entry.
                 // We can optionally clear common keys if we have them.
                 PageCache.clear(`#/profile?id=${accountId}`);
                 PageCache.clear(`#/profile/${accountId}`);
            } else {
                // If it IS my profile, we update the CACHE directly so when we return, it shows fresh data immediately.
                const possibleKeys = [
                    `#/profile`,
                    `#/profile/`,
                    `#/profile/${myUsername}`
                ];
                
                let patched = false;
                
                possibleKeys.forEach(key => {
                    if (PageCache.has(key)) {
                        try {
                            const cached = PageCache.get(key);
                            
                            // PageCache stores 'fragment' (DocumentFragment)
                            if (cached && cached.fragment) {
                                let updated = false;
                                
                                // Query directly on the fragment
                                if (followers !== undefined) {
                                    const el = cached.fragment.querySelector("#profile-followers-count");
                                    if (el) { 
                                        el.textContent = followers; 
                                        updated = true; 
                                    }
                                }
                                if (following !== undefined) {
                                    const el = cached.fragment.querySelector("#profile-following-count");
                                    if (el) { el.textContent = following; updated = true; }
                                }

                                if (updated) {
                                    patched = true;
                                }
                            }
                        } catch (e) {
                             console.warn(`Failed to patch profile cache (${key}):`, e);
                        }
                    }
                });
                
            }
        }

        // 2. Update Newsfeed Buttons
        if (isFollowing !== undefined) {
            updateFeedButtons(accountId, isFollowing, document);
            if (window.PageCache && PageCache.has("home")) {
                const homeCache = PageCache.get("home");
                if (homeCache.fragment) {
                    updateFeedButtons(accountId, isFollowing, homeCache.fragment);
                }
            }
        }

        // 3. Update Profile Preview
        if (typeof window.getProfilePreviewAccountId === 'function' && 
            window.getProfilePreviewAccountId() === accountId) {
            
             const previewBtn = document.getElementById("followBtn");
             if (previewBtn && isFollowing !== undefined) {
                 if (isFollowing) {
                     previewBtn.innerHTML = `<i data-lucide="check"></i><span>Following</span>`;
                     previewBtn.className = "profile-preview-btn profile-preview-btn-following";
                     previewBtn.onclick = (e) => { if (window.toggleFollowMenu) window.toggleFollowMenu(e, accountId); };
                 } else {
                     previewBtn.innerHTML = `<i data-lucide="user-plus"></i><span>Follow</span>`;
                     previewBtn.className = "profile-preview-btn profile-preview-btn-follow";
                     previewBtn.onclick = () => { if (window.toggleFollow) window.toggleFollow(accountId); };
                 }
                 if (window.lucide) lucide.createIcons();
             }

             // Update stats in preview with animation
             if (followers !== undefined || following !== undefined) {
                 const previewEl = document.querySelector(".profile-preview");
                 if (previewEl) {
                     const statNums = previewEl.querySelectorAll(".profile-preview-stats b");
                     if (statNums.length >= 3) {
                         if (followers !== undefined) PostUtils.animateCount(statNums[1], followers);
                         if (following !== undefined) PostUtils.animateCount(statNums[2], following);
                     }
                 }
             }
        }

        // 4. Update Main Profile Page
        if (typeof window.updateFollowStatus === 'function') {
            window.updateFollowStatus(accountId, isFollowing, followers, following);
        }

        // 5. Update Interaction Modal
        const interactionModal = document.getElementById("interactionModal");
        if (interactionModal && interactionModal.classList.contains("show") && isFollowing !== undefined) {
            const row = interactionModal.querySelector(`.user-info[data-account-id="${accountId}"]`);
            if (row) {
                const actionBox = row.nextElementSibling;
                const btn = actionBox?.querySelector(".follow-btn");
                if (btn && !btn.classList.contains("view-profile-btn")) {
                    const span = btn.querySelector("span");
                    if (isFollowing) {
                        btn.classList.add("following");
                        if (span) span.textContent = "Following";
                    } else {
                        btn.classList.remove("following");
                        if (span) span.textContent = "Follow";
                    }
                }
            }
        }
    };

    function updateFeedButtons(accountId, isFollowing, root = document) {
        if (!root) return;
        const posts = root.querySelectorAll(`.post .post-user[data-account-id="${accountId}"]`);
        posts.forEach(userEl => {
            const postHeader = userEl.closest(".post-header");
            if (!postHeader) return;
            const actionsDiv = postHeader.querySelector(".post-actions");
            if (!actionsDiv) return;
            let followBtn = actionsDiv.querySelector(".follow-btn");
            if (!isFollowing) {
                if (!followBtn) {
                    followBtn = document.createElement("button");
                    followBtn.className = "follow-btn";
                    followBtn.innerHTML = "<span>Follow</span>";
                    followBtn.onclick = function() { FollowModule.followUser(accountId, this); };
                    const moreBtn = actionsDiv.querySelector(".post-more");
                    if (moreBtn) actionsDiv.insertBefore(followBtn, moreBtn);
                    else actionsDiv.appendChild(followBtn);
                } else followBtn.style.display = "";
            } else if (followBtn) followBtn.remove();
        });
    }

    global.FollowModule = FollowModule;
})(window);
