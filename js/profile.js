/**
 * profile.js
 * Handles logic for the user profile page
 */

(function(global) {
    let currentProfileId = null;
    let page = 1;
    let isLoading = false;
    let hasMore = true;
    const PAGE_SIZE = APP_CONFIG.PROFILE_POSTS_PAGE_SIZE;

    let currentProfileData = null;

    // Permanent State Accessor for App Router
    window.ProfileState = {
        setPageData: (data) => {
            if (!data) return;
            // console.log(`[ProfileState] Restoring state: ID=${data.currentProfileId}, Page=${data.page}`);
            currentProfileId = data.currentProfileId;
            page = data.page;
            hasMore = data.hasMore;
            currentProfileData = data.currentProfileData;
        },
        getPageData: () => ({
            currentProfileId,
            page,
            hasMore,
            currentProfileData
        })
    };

    function initProfile() {
        // Robust ID extraction
        const hash = window.location.hash || "";
        let accountId = null;

        if (hash.includes("?")) {
            const queryString = hash.split("?")[1];
            const params = new URLSearchParams(queryString);
            accountId = params.get("id");
        } else if (hash.includes("/profile/") && hash.split("/profile/")[1]) {
            // Support #/profile/{id} format just in case
            accountId = hash.split("/profile/")[1].split("?")[0];
        }

        // Fallback to logged-in user if no ID in URL
        accountId = accountId || localStorage.getItem("accountId");
        
        if (!accountId) {
            // console.warn("No account ID found in hash or localStorage");
            return;
        }

        // Register state hooks for PageCache
        window.getPageData = window.ProfileState.getPageData;
        window.setPageData = window.ProfileState.setPageData; // Optional, for completeness

        // 1. Restore from cache if available
        // CRITICAL FIX: Set currentProfileId BEFORE restore, because restore might trigger scroll/resize events 
        // which call loadPosts immediately using the current ID.
        const prevId = currentProfileId;
        currentProfileId = accountId;

        // Also update LastVisited right away or logic below handled it?
        // Let's stick to the flow but ensure ID is set.
        
        if (window.PageCache && PageCache.restore(hash)) {
             // console.log("[Profile] Restored from cache");
             
             // Even if restored, trigger a silent update to refresh stats (followers, etc.)
             // This ensures we keep scroll position but get fresh data
             loadProfileData(true); 
             
             // Setup listeners again because DOM was replaced
             setupTabListeners();
             setupEditProfileListeners();
             
             // Also need to join group
             if (window.UserHub) {
                 if (window._lastVisitedProfileId && window._lastVisitedProfileId !== accountId) {
                     UserHub.leaveGroup(window._lastVisitedProfileId);
                 }
                 if (accountId !== localStorage.getItem("accountId")) {
                     UserHub.joinGroup(accountId);
                 }
                 window._lastVisitedProfileId = accountId;
             }
             
             return; 
        }

        // Real-time: Join the profile's group to receive updates
        if (window.UserHub) {
            // Leave previous group if we switched profiles
            if (window._lastVisitedProfileId && window._lastVisitedProfileId !== accountId) {
                UserHub.leaveGroup(window._lastVisitedProfileId);
            }
            // Join new group
            if (accountId !== localStorage.getItem("accountId")) { // No need to join my own twice (already joined in init)
                UserHub.joinGroup(accountId);
            }
            window._lastVisitedProfileId = accountId;
        }

        // console.log(`[Profile] Switching currentProfileId from ${currentProfileId} to ${accountId}`);
        currentProfileId = accountId;
        
        // Block other loading calls until we have the real GUID
        isLoading = true;

        // Force scroll to top for fresh load to prevent any lingering scroll position
        window.scrollTo(0, 0);
        
        resetState();
        loadProfileData();
        // setupScrollListener is now global
        setupTabListeners();
        setupEditProfileListeners();
    }

    function resetState() {
        page = 1;
        isLoading = false;
        hasMore = true;
        // Clear grid immediately to avoid showing previous user's posts
        const grid = document.getElementById("profile-posts-grid");
        if (grid) grid.innerHTML = "";

        // Reset Header UI placeholders to prevent confusing user with old data while loading
        const avatarImg = document.getElementById("profile-avatar");
        const fullNameLabel = document.getElementById("profile-fullname");
        const bioText = document.getElementById("profile-bio-text");
        const coverImg = document.getElementById("profile-cover-img");
        
        if (avatarImg) avatarImg.src = APP_CONFIG.DEFAULT_AVATAR;
        if (fullNameLabel) fullNameLabel.textContent = "Loading...";
        if (bioText) bioText.textContent = "";
    const bioSection = document.querySelector(".profile-bio-section");
    const statsEl = document.querySelector(".profile-stats");
    if (bioSection) bioSection.style.display = "none";
    if (statsEl) statsEl.classList.add("stats-no-bio");
        if (coverImg) coverImg.style.display = "none";
        
        // Reset stats
        ["profile-posts-count", "profile-followers-count", "profile-following-count"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "0";
        });
    }

    // Scroll listener moved OUT of init to be always active (but checking current context)
    const handleProfileScroll = () => {
        const grid = document.getElementById("profile-posts-grid");
        if (!grid || !document.body.contains(grid)) return;

        if (isLoading || !hasMore) return;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            loadPosts();
        }
    };
    window.addEventListener("scroll", handleProfileScroll);

    // Global hook for app.js to trigger update after restore
    window.triggerProfileSilentUpdate = function() {
        loadProfileData(true);
        
        // Also ensure listeners are setup (just in case)
        setupTabListeners();
        setupEditProfileListeners();
        
        // And ensure Group join
        if (window.UserHub && currentProfileId) {
             if (window._lastVisitedProfileId && window._lastVisitedProfileId !== currentProfileId) {
                 UserHub.leaveGroup(window._lastVisitedProfileId);
             }
             if (currentProfileId !== localStorage.getItem("accountId")) {
                 UserHub.joinGroup(currentProfileId);
             }
             window._lastVisitedProfileId = currentProfileId;
        }
    };

    async function loadProfileData(isSilent = false) {
        // Parse "u" parameter from URL query string
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.split("?")[1] || "");
        let usernameParam = params.get("u");
        
        // Check for /profile/username path format
        if (!usernameParam && hash.includes("#/profile/")) {
             const parts = hash.split("#/profile/");
             if (parts.length > 1) {
                 // Remove any query params that might follow
                 const potentialParam = parts[1].split("?")[0];
                 // Ensure it is NOT a GUID (if it's a GUID, let logic below handle it via currentProfileId)
                 const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(potentialParam);
                 if (!isGuid) {
                     usernameParam = potentialParam;
                 }
             }
        }
        
        // Use LoadingUtils if available
        const mainContent = document.querySelector(".profile-content-wrapper");
        
        if (window.LoadingUtils) LoadingUtils.toggle("profile-posts-loader", true);

        try {
            let res;
            if (usernameParam) {
                 res = await API.Accounts.getProfileByUsername(usernameParam);
            } else if (currentProfileId) {
                // Fallback: If currentProfileId is set (could be ID or Username if extracted loosely)
                // We should try to determine if it is a GUID
                const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentProfileId);
                if (isGuid) {
                     res = await API.Accounts.getProfile(currentProfileId);
                } else {
                     // Assume it's a username if not a GUID
                     res = await API.Accounts.getProfileByUsername(currentProfileId);
                }
            } else {
                 return;
            }
            if (!res.ok) {
                if (window.toastError) toastError("Failed to load profile details.");
                return;
            }

            const data = await res.json();
            
            // Defensively handle both camelCase and PascalCase
            const accountInfo = data.accountInfo || data.AccountInfo || data.account || data.Account || {};
            const realGuid = accountInfo.accountId || accountInfo.AccountId || accountInfo.id || accountInfo.Id;

            // If loaded by username, update currentProfileId
            if (realGuid) {
                currentProfileId = realGuid;
                // Also update window._lastVisitedProfileId to ensure groups are managed correctly
                if (window.UserHub && currentProfileId !== localStorage.getItem("accountId")) {
                     UserHub.joinGroup(currentProfileId);
                     window._lastVisitedProfileId = currentProfileId;
                }
            }

            if (isSilent) {
                // Background update: Only update stats and internal data
                currentProfileData = data;
                updateProfileStatsOnly(data);
            } else {
                // Full render
                currentProfileData = data;
                
                // Update local storage if viewing my own profile
                const settings = data.settings || data.Settings;
                if (data.isCurrentUser && settings) {
                    localStorage.setItem("defaultPostPrivacy", settings.defaultPostPrivacy ?? settings.DefaultPostPrivacy ?? 0);
                }
                
                renderProfileHeader(data);
                
                // Now that we have the GUID, we can load posts
                isLoading = false;
                loadPosts(); 
            }

        } catch (err) {
            console.error(err);
             if (!isSilent) {
                const contentEl = document.getElementById("profile-content");
                if(contentEl) contentEl.innerHTML = `<div class="error-message">Failed to load profile. <button onclick="loadProfileData()">Retry</button></div>`;
            }
        } finally {
            isLoading = false;
            if (window.LoadingUtils) LoadingUtils.toggle("profile-posts-loader", false);
        }
    }

    function updateProfileStatsOnly(data) {
        // This function is intended to update only the dynamic parts of the profile header
        // without re-rendering the entire header or triggering post loads.
        // Useful for silent updates from cache or real-time events.
        const followInfo = data.followInfo || {};
        const postCount = document.getElementById("profile-posts-count");
        const followersCount = document.getElementById("profile-followers-count");
        const followingCount = document.getElementById("profile-following-count");
        const actionBtn = document.getElementById("profile-action-btn");

        if (postCount) postCount.textContent = data.totalPosts ?? data.postCount ?? 0;
        if (followersCount) followersCount.textContent = followInfo.followers ?? data.followerCount ?? 0;
        if (followingCount) followingCount.textContent = followInfo.following ?? data.followingCount ?? 0;

        // Update follow button state if necessary
        const isOwner = data.isCurrentUser;
        const isFollowed = followInfo.isFollowedByCurrentUser ?? data.isFollowedByCurrentUser;
        if (actionBtn && !isOwner) {
            const followBtn = actionBtn.querySelector(".profile-btn-follow, .profile-btn-following");
            if (followBtn) {
                const followBtnClass = isFollowed ? 'profile-btn-following' : 'profile-btn-follow';
                const followIcon = isFollowed ? 'check' : 'user-plus';
                const followText = isFollowed ? 'Following' : 'Follow';
                
                followBtn.className = `profile-btn ${followBtnClass}`;
                followBtn.innerHTML = `<i data-lucide="${followIcon}"></i><span>${followText}</span>`;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    function renderProfileHeader(data) {
        // Find elements
        const coverImg = document.getElementById("profile-cover-img");
        const avatarImg = document.getElementById("profile-avatar");
        const usernameHeader = document.getElementById("profile-username-header");
        const fullNameLabel = document.getElementById("profile-fullname");
        const bioText = document.getElementById("profile-bio-text");
        const postCount = document.getElementById("profile-posts-count");
        const followersCount = document.getElementById("profile-followers-count");
        const followingCount = document.getElementById("profile-following-count");
        const actionBtn = document.getElementById("profile-action-btn");

        if (!data) return;

        const info = data.accountInfo || data.account || {}; 
        const followInfo = data.followInfo || {};
        const isOwner = data.isCurrentUser;
        const isFollowed = followInfo.isFollowedByCurrentUser ?? data.isFollowedByCurrentUser;

        // Cover & Avatar
        const avatarUrl = info.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        const profileCover = document.querySelector(".profile-cover");

        if (avatarImg) avatarImg.src = avatarUrl;

        if (coverImg) {
            if (info.coverUrl) {
                coverImg.src = info.coverUrl;
                coverImg.style.display = "block";
                coverImg.onerror = function() {
                    this.style.display = "none";
                };
            } else {
                coverImg.style.display = "none";
            }
        }

        // Dynamic Background based on Avatar
        if (profileCover) {
            if (avatarUrl && typeof extractDominantColor === 'function') {
                extractDominantColor(avatarUrl).then(color => {
                    profileCover.style.background = `linear-gradient(135deg, var(--bg-primary) 0%, ${color} 100%)`;
                }).catch(() => {
                    // Fallback to theme-aware default gradient
                    profileCover.style.background = "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
                });
            } else {
                profileCover.style.background = "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)";
            }
        }
        
        // Use Username in the prominent header position
        if (usernameHeader) usernameHeader.textContent = info.username || "user";
        
        // FullName label: Bold line above bio
        if (fullNameLabel) fullNameLabel.textContent = info.fullName || "";

        // Bio: Hide if empty
        const bioSection = document.querySelector(".profile-bio-section");
        const statsEl = document.querySelector(".profile-stats");
        
        if (bioSection) {
            const hasFullName = info.fullName && info.fullName.trim() !== "";
            const hasBio = info.bio && info.bio.trim() !== "";

            if (hasFullName || hasBio) {
                if (bioText) bioText.textContent = info.bio || "";
                bioSection.style.display = "block";
                if (statsEl) statsEl.classList.remove("stats-no-bio");
                
                // Show/hide specific elements inside
                if (fullNameLabel) fullNameLabel.style.display = hasFullName ? "block" : "none";
                if (bioText) bioText.style.display = hasBio ? "block" : "none";
            } else {
                bioSection.style.display = "none";
                if (statsEl) statsEl.classList.add("stats-no-bio");
            }
        }

        if (postCount) postCount.textContent = data.totalPosts ?? data.postCount ?? 0;
        if (followersCount) followersCount.textContent = followInfo.followers ?? data.followerCount ?? 0;
        if (followingCount) followingCount.textContent = followInfo.following ?? data.followingCount ?? 0;

        // Details: Phone, Address
        const phoneEl = document.getElementById("profile-detail-phone");
        const addressEl = document.getElementById("profile-detail-address");
        const phoneWrapper = document.getElementById("profile-detail-phone-wrapper");
        const addressWrapper = document.getElementById("profile-detail-address-wrapper");

        if (phoneEl && phoneWrapper) {
            if (info.phone) {
                phoneEl.textContent = info.phone;
                phoneWrapper.style.display = "flex";
            } else {
                phoneWrapper.style.display = "none";
            }
        }
        if (addressEl && addressWrapper) {
            if (info.address) {
                addressEl.textContent = info.address;
                addressWrapper.style.display = "flex";
            } else {
                addressWrapper.style.display = "none";
            }
        }

        // Action Buttons
        if (actionBtn) {
            if (isOwner) {
                actionBtn.innerHTML = `
                    <button class="profile-btn profile-btn-edit" onclick="openEditProfile()">
                        <i data-lucide="edit-3"></i>
                        <span>Edit Profile</span>
                    </button>
                    <button class="profile-btn profile-btn-secondary" id="profile-settings-btn" onclick="openProfileSettings()">
                        <i data-lucide="settings"></i>
                        <span>Settings</span>
                    </button>
                    <button class="profile-btn profile-btn-more" onclick="openProfileMoreMenu()">
                        <i data-lucide="more-horizontal"></i>
                        <span>More</span>
                    </button>
                `;
            } else {
                const followBtnClass = isFollowed ? 'profile-btn-following' : 'profile-btn-follow';
                const followIcon = isFollowed ? 'check' : 'user-plus';
                const followText = isFollowed ? 'Following' : 'Follow';
                
                const profileId = info.accountId || info.id || currentProfileId;
                
                actionBtn.innerHTML = `
                    <button class="profile-btn ${followBtnClass}" onclick="toggleFollowProfile('${profileId}')">
                        <i data-lucide="${followIcon}"></i>
                        <span>${followText}</span>
                    </button>
                    <button class="profile-btn profile-btn-message" onclick="openMessage('${profileId}')">
                        <i data-lucide="send"></i>
                        <span>Message</span>
                    </button>
                    <button class="profile-btn profile-btn-more" onclick="openProfileMoreMenu()">
                        <i data-lucide="more-horizontal"></i>
                        <span>More</span>
                    </button>
                `;
            }
            lucide.createIcons();
        }

        // Auto-shrink font size for long usernames
        if (usernameHeader) {
            usernameHeader.style.fontSize = "32px"; // Reset
            
            // Wait for next frame to get accurate widths
            requestAnimationFrame(() => {
                let fontSize = 32;
                // ClientWidth is the boundary, ScrollWidth is the content size
                while (usernameHeader.scrollWidth > usernameHeader.clientWidth && fontSize > 14) {
                    fontSize -= 1; 
                    usernameHeader.style.fontSize = fontSize + "px";
                }
            });
        }
        
        if (window.lucide) lucide.createIcons();
    }

    async function loadPosts() {
        if (isLoading || !hasMore) return;
        
        // Capture the ID we are fetching for at the start
        const fetchForId = currentProfileId;
        // console.log(`[Profile] loadPosts START for ${fetchForId}, page ${page}`);
        isLoading = true;

        const grid = document.getElementById("profile-posts-grid");
        const loader = document.getElementById("profile-posts-loader");

        if (loader) loader.style.display = "block";

        try {
            // Safeguard: Ensure we have a GUID and not a username
            const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fetchForId);
            if (!isGuid) {
                // console.warn(`[Profile] Cannot load posts: ${fetchForId} is not a valid GUID yet.`);
                isLoading = false;
                return;
            }

            const res = await API.Posts.getByAccountId(fetchForId, page, PAGE_SIZE);
            
            // RACECONDITION FIX: 
            // Check if user switched profiles while we were fetching
            if (fetchForId !== currentProfileId) {
                // console.log(`[Profile] IGNORING posts for ${fetchForId} because we switched to ${currentProfileId}`);
                return;
            }

            if (!res.ok) throw new Error("Failed to load posts");

            const data = await res.json();
            const items = data.items || data; // Fallback if it's already an array

            if (!items || items.length < PAGE_SIZE) {
                hasMore = false;
            }
            
            // console.log(`[Profile] Rendering ${items.length} posts for ${fetchForId}`);
            renderPosts(items);
            page++;
        } catch (err) {
            console.error(err);
        } finally {
            // Only turn off loading if we are still on the same profile context
            // actually, we should always turn it off? 
            // If we switched profiles, resetState() would have set isLoading=false already.
            // But if we are still here, we need to complete the lifecycle.
            if (fetchForId === currentProfileId) {
                 isLoading = false;
                 if (loader) loader.style.display = "none";
            }
        }
    }

    function renderPosts(posts) {
        const grid = document.getElementById("profile-posts-grid");
        if (!grid) return;

        if (page === 1) grid.innerHTML = "";

        posts.forEach(post => {
            const item = document.createElement("div");
            item.className = "profile-grid-item skeleton"; 
            item.dataset.postId = post.postId;
            item.onclick = () => {
                if (window.openPostDetail) window.openPostDetail(post.postId);
            };

            const isMulti = (post.mediaCount ?? (post.medias?.length ?? 0)) > 1;
            const primaryMedia = (post.medias && post.medias[0]) ? post.medias[0].mediaUrl : (window.APP_CONFIG?.DEFAULT_POST_IMAGE || "");

            item.innerHTML = `
                <img class="img-loaded" src="${primaryMedia}" alt="post">
                ${isMulti ? '<div class="profile-multi-media-icon"><i data-lucide="layers"></i></div>' : ''}
                <div class="profile-grid-overlay">
                    <div class="profile-overlay-stat">
                        <i data-lucide="heart"></i>
                        <span>${post.reactCount}</span>
                    </div>
                    <div class="profile-overlay-stat">
                        <i data-lucide="message-circle"></i>
                        <span>${post.commentCount}</span>
                    </div>
                </div>
            `;
            grid.appendChild(item);

            // 1. Setup loading state
            const media = item.querySelector("img");
            if (media) {
                const onLoaded = () => {
                    item.classList.remove("skeleton");
                    media.classList.add("show");
                };

                if (media.complete) onLoaded();
                else media.onload = onLoaded;
            }

            // 2. Apply dominant color background
            if (primaryMedia && typeof window.extractDominantColor === 'function') {
                extractDominantColor(primaryMedia).then(color => {
                    item.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
                }).catch(err => console.warn("Color extraction failed", err));
            }
        });

        if (window.lucide) lucide.createIcons();
    }

    // Tabs
    function setupTabListeners() {
        const tabs = document.querySelectorAll(".profile-tab-item");
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                // TODO: Handle content switch (Posts, Reels, Saved, Tagged)
            };
        });
    }

    // Edit Profile Modal logic ...
    function setupEditProfileListeners() {
        const avatarInput = document.getElementById("edit-avatar-input");
        const coverInput = document.getElementById("edit-cover-input");

        if (avatarInput) {
            avatarInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById("edit-avatar-preview").src = re.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        if (coverInput) {
            coverInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById("edit-cover-preview").src = re.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }
    }

    global.openEditProfile = function() {
        const modal = document.getElementById("edit-profile-modal");
        if (!modal || !currentProfileData) return;

        const info = currentProfileData.accountInfo || currentProfileData.account;
        if (!info) return;
        
        document.getElementById("edit-fullname").value = info.fullName || "";
        document.getElementById("edit-bio").value = info.bio || "";
        document.getElementById("edit-phone").value = info.phone || "";
        document.getElementById("edit-address").value = info.address || "";
        document.getElementById("edit-gender").value = (info.gender !== null && info.gender !== undefined) ? info.gender.toString() : "true";

        document.getElementById("edit-avatar-preview").src = info.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        document.getElementById("edit-cover-preview").src = info.coverUrl || "assets/gradients/orb-1.png";

        document.getElementById("edit-avatar-input").value = "";
        document.getElementById("edit-cover-input").value = "";

        modal.style.display = "flex";
    };

    global.closeEditProfile = function() {
        const modal = document.getElementById("edit-profile-modal");
        if (modal) modal.style.display = "none";
    };

    global.saveProfileChanges = async function() {
        if (!currentProfileId) return;
        
        const btn = document.querySelector("#edit-profile-modal .profile-btn-primary");
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        btn.disabled = true;

        try {
            const formData = new FormData();
            formData.append("FullName", document.getElementById("edit-fullname").value);
            formData.append("Bio", document.getElementById("edit-bio").value);
            formData.append("Phone", document.getElementById("edit-phone").value);
            formData.append("Address", document.getElementById("edit-address").value);
            formData.append("Gender", document.getElementById("edit-gender").value);

            const avatarFile = document.getElementById("edit-avatar-input").files[0];
            if (avatarFile) formData.append("Image", avatarFile);

            const coverFile = document.getElementById("edit-cover-input").files[0];
            if (coverFile) formData.append("CoverImage", coverFile);

            const res = await API.Accounts.updateProfile(formData);
            if (res.ok) {
                if (window.toastSuccess) toastSuccess("Profile updated successfully!");
                closeEditProfile();
                loadProfileData(); 
            } else {
                const data = await res.json();
                if (window.toastError) toastError(data.title || "Failed to update profile.");
            }
        } catch (err) {
            console.error(err);
            if (window.toastError) toastError("An error occurred while saving.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    global.toggleFollowProfile = async function(accountId) {
        const btn = document.querySelector("#profile-action-btn .profile-btn-follow, #profile-action-btn .profile-btn-following");
        if (!btn) return;

        const isFollowed = btn.classList.contains("profile-btn-following");

        if (isFollowed) {
            if (window.FollowModule) {
                FollowModule.showUnfollowConfirm(accountId, btn);
            } else {
                // Fallback if module is missing
                global.toggleFollowAction(accountId, btn, true);
            }
            return;
        }

        global.toggleFollowAction(accountId, btn, false);
    };

    global.toggleFollowAction = async function(accountId, btn, isFollowed) {
        if (!window.FollowModule) {
            if (window.toastError) toastError("Follow module not loaded.");
            return;
        }

        if (isFollowed) {
            await FollowModule.unfollowUser(accountId, btn);
        } else {
            await FollowModule.followUser(accountId, btn);
        }
    };

    global.openMessage = function(accountId) {
        if (window.toastInfo) toastInfo("Messaging feature coming soon!");
    };

    global.openProfileSettings = function() {
        const modal = document.getElementById("profile-settings-modal");
        if (!modal || !currentProfileData) return;

        const info = currentProfileData.accountInfo || currentProfileData.account;
        if (!info) return;
        
        const settings = currentProfileData.settings || info.settings || {};

        document.getElementById("setting-privacy-email").value = settings.emailPrivacy ?? 0;
        document.getElementById("setting-privacy-phone").value = settings.phonePrivacy ?? 0;
        document.getElementById("setting-privacy-address").value = settings.addressPrivacy ?? 0;
        document.getElementById("setting-privacy-post").value = settings.defaultPostPrivacy ?? 0;
        document.getElementById("setting-privacy-followers").value = settings.followerPrivacy ?? 0;
        document.getElementById("setting-privacy-following").value = settings.followingPrivacy ?? 0;

        modal.style.display = "flex";
    };

    global.closeProfileSettings = function() {
        const modal = document.getElementById("profile-settings-modal");
        if (modal) modal.style.display = "none";
    };

    global.saveProfileSettings = async function() {
        if (!currentProfileId) return;
        
        const btn = document.querySelector("#profile-settings-modal .profile-btn-primary");
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        btn.disabled = true;

        try {
            const data = {
                EmailPrivacy: parseInt(document.getElementById("setting-privacy-email").value),
                PhonePrivacy: parseInt(document.getElementById("setting-privacy-phone").value),
                AddressPrivacy: parseInt(document.getElementById("setting-privacy-address").value),
                DefaultPostPrivacy: parseInt(document.getElementById("setting-privacy-post").value),
                FollowerPrivacy: parseInt(document.getElementById("setting-privacy-followers").value),
                FollowingPrivacy: parseInt(document.getElementById("setting-privacy-following").value)
            };

            const res = await API.Accounts.updateSettings(data);
            if (res.ok) {
                const newSettings = await res.json();
                if (window.toastSuccess) toastSuccess("Privacy settings updated successfully!");
                
                // Update local data
                if (currentProfileData) {
                    if (currentProfileData.accountInfo) currentProfileData.accountInfo.settings = newSettings;
                    else if (currentProfileData.account) currentProfileData.account.settings = newSettings;
                    currentProfileData.settings = newSettings;
                    
                    // Update global default for post creation
                    const val = newSettings.defaultPostPrivacy ?? newSettings.DefaultPostPrivacy;
                    if (val !== undefined) {
                        localStorage.setItem("defaultPostPrivacy", val);
                    }
                }

                closeProfileSettings();
                // Optionally reload profile data to see effects of privacy changes if viewing own profile
                loadProfileData(); 
            } else {
                const data = await res.json();
                if (window.toastError) toastError(data.title || "Failed to update settings.");
            }
        } catch (err) {
            console.error(err);
            if (window.toastError) toastError("An error occurred while saving.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    global.openProfileMoreMenu = function() {
        if (window.toastInfo) toastInfo("More options coming soon!");
    };

    global.updateFollowStatus = function(accountId, isFollowing, followers, following) {
        
        // 1. Invalidate cache logic REVISED
        // ONLY clear cache if it is NOT my own profile.
        // If it is my profile, keep cache to preserve scroll position when I return.
        // The 'silent update' in initProfile will handle the data refresh.
        const myId = localStorage.getItem("accountId");
        const myUsername = localStorage.getItem("username");
        // Case-insensitive check
        const isMe = accountId.toLowerCase() === myId?.toLowerCase() || accountId.toLowerCase() === myUsername?.toLowerCase();

        if (window.PageCache && !isMe) {
            // Clear all possible profile keys for this account
            PageCache.clear(`#/profile?id=${accountId}`);
            PageCache.clear(`#/profile/${accountId}`);
            // Note: We don't know the username of others easily here, 
            // but app.js clears it on entry anyway.
        } 

        // 2. If the user is CURRENTLY viewing this profile, update the live DOM and state
        if (currentProfileId == accountId && currentProfileData) {
            // Update internal state
            if (isFollowing !== undefined) {
                currentProfileData.isFollowedByCurrentUser = isFollowing;
                
                if (currentProfileData.followInfo) {
                    currentProfileData.followInfo.isFollowedByCurrentUser = isFollowing;
                } else {
                    currentProfileData.followInfo = {
                        isFollowedByCurrentUser: isFollowing,
                        followers: followers ?? 0,
                        following: following ?? 0
                    };
                }
            }

            // Always update counts if provided
            if (currentProfileData.followInfo) {
                if (followers !== undefined) currentProfileData.followInfo.followers = followers;
                if (following !== undefined) currentProfileData.followInfo.following = following;
            }
            
            // Animate Stats directly
            const followersCountEl = document.getElementById("profile-followers-count");
            const followingCountEl = document.getElementById("profile-following-count");
            
            if (window.PostUtils && typeof PostUtils.animateCount === 'function') {
                if (followers !== undefined && followersCountEl) PostUtils.animateCount(followersCountEl, followers);
                 if (following !== undefined && followingCountEl) PostUtils.animateCount(followingCountEl, following);
            } else {
                // Fallback
                if (followers !== undefined && followersCountEl) followersCountEl.textContent = followers;
                if (following !== undefined && followingCountEl) followingCountEl.textContent = following;
            }

            // Update Action Button
            const actionBtn = document.getElementById("profile-action-btn");
            if (actionBtn && isFollowing !== undefined) {
                 const followBtn = actionBtn.querySelector(".profile-btn-follow, .profile-btn-following");
                 if (followBtn) {
                     // Check if state actually matches 'isFollowing'
                     const btnIsFollowing = followBtn.classList.contains("profile-btn-following");
                     if (btnIsFollowing !== isFollowing) {
                         // Swap state
                         if (isFollowing) {
                             followBtn.innerHTML = '<i data-lucide="user-check"></i><span>Following</span>';
                             followBtn.className = "profile-btn profile-btn-following";
                             followBtn.onclick = (e) => FollowModule.showUnfollowConfirm(accountId, e.currentTarget);
                         } else {
                             followBtn.innerHTML = '<i data-lucide="user-plus"></i><span>Follow</span>';
                             followBtn.className = "profile-btn profile-btn-follow";
                             followBtn.onclick = () => FollowModule.followUser(accountId, followBtn);
                         }
                         if (window.lucide) lucide.createIcons();
                     }
                 }
            }
        }
    };

    global.initProfilePage = initProfile;
    global.getProfileAccountId = () => currentProfileId;

})(window);
