/**
 * profile.js
 * Handles logic for the user profile page
 */

(function(global) {
    let currentProfileId = null;
    let page = 1;
    let isLoading = false;
    let hasMore = true;
    const PAGE_SIZE = APP_CONFIG.PROFILE_POSTS_PAGE_SIZE; // Use global config

    let currentProfileData = null;

    function initProfile() {
        // Extract params from Hash URL (e.g., #/profile?id=xyz)
        // window.location.hash returns "#/profile?id=xyz"
        const hash = window.location.hash;
        let accountId = null;

        if (hash.includes("?")) {
            const queryString = hash.split("?")[1];
            const params = new URLSearchParams(queryString);
            accountId = params.get("id");
        }

        // Fallback to current user if no ID is passed
        accountId = accountId || localStorage.getItem("accountId");
        
        if (!accountId) {
             window.location.href = "auth.html";
             return;
        }

        currentProfileId = accountId;
        resetState();
        loadProfileData();
        setupScrollListener();
        setupTabListeners();
        setupEditProfileListeners();
    }

    function resetState() {
        page = 1;
        isLoading = false;
        hasMore = true;
        const grid = document.getElementById("profile-posts-grid");
        if (grid) grid.innerHTML = "";
    }

    async function loadProfileData() {
        try {
            const res = await API.Accounts.getProfile(currentProfileId);
            if (!res.ok) {
                if (res.status === 404) {
                    toastError("Account not found");
                }
                return;
            }

            const data = await res.json();
            console.log("Profile Data:", data); // Debugging
            currentProfileData = data; // Store for edit
            renderProfileHeader(data);
            loadPosts(); // Initial posts fetch

        } catch (err) {
            console.error("Failed to load profile", err);
        }
    }

    function renderProfileHeader(data) {
        // Fallback for case sensitivity or missing data
        const accountInfo = data.accountInfo || data.AccountInfo;
        const followInfo = data.followInfo || data.FollowInfo;
        const totalPosts = data.totalPosts !== undefined ? data.totalPosts : data.TotalPosts;
        const isCurrentUser = data.isCurrentUser !== undefined ? data.isCurrentUser : data.IsCurrentUser;

        if (!accountInfo) {
            console.error("Missing accountInfo in data", data);
            return;
        }
        
        // Flatten/Normalize data provided by the API
        const acc = accountInfo || {};
        const follow = followInfo || {};
        
        const username = acc.username || acc.Username || "Unknown";
        const fullName = acc.fullName || acc.FullName || "User";
        const avatarUrl = acc.avatarUrl || acc.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        const coverUrl = acc.coverUrl || acc.CoverUrl || "assets/gradients/orb-1.png";
        const bio = acc.bio || acc.Bio || "";
        
        const followers = follow.followers !== undefined ? follow.followers : (follow.Followers || 0);
        const following = follow.following !== undefined ? follow.following : (follow.Following || 0);

        document.getElementById("profile-username").textContent = username;
        document.getElementById("profile-fullname").textContent = fullName;
        document.getElementById("profile-avatar").src = avatarUrl;
        
        // New fields
        const coverImg = document.getElementById("profile-cover-img");
        if(coverImg) coverImg.src = coverUrl;
        
        const bioEl = document.getElementById("profile-description");
        if(bioEl) bioEl.textContent = bio;

        document.getElementById("profile-post-count").textContent = totalPosts;
        document.getElementById("profile-follower-count").textContent = followers;
        document.getElementById("profile-following-count").textContent = following;
        
        // Render actions
        const actionsContainer = document.getElementById("profile-actions");
        actionsContainer.innerHTML = "";
        
        const accountId = acc.accountId || acc.AccountId;

        if (isCurrentUser) {
            actionsContainer.innerHTML = `
                <button class="btn-profile btn-edit-profile" onclick="openEditProfile()">Edit Profile</button>
                <button class="btn-profile btn-edit-profile">View Archive</button>
            `;
        } else {
            const isFollowed = follow.isFollowedByCurrentUser !== undefined ? follow.isFollowedByCurrentUser : follow.IsFollowedByCurrentUser;
            const followClass = isFollowed ? "btn-following-profile" : "btn-follow-profile";
            const followText = isFollowed ? '<i data-lucide="check"></i><span>Following</span>' : "Follow";
            
            actionsContainer.innerHTML = `
                <button class="btn-profile ${followClass}" id="mainFollowBtn" onclick="handleProfileFollow('${accountId}', this)">
                    ${followText}
                </button>
                <button class="btn-profile btn-edit-profile" onclick="openMessage('${accountId}')">Message</button>
            `;
        }
        
        if (window.lucide) lucide.createIcons();
    }

    async function loadPosts() {
        if (isLoading || !hasMore) return;
        
        isLoading = true;
        const loader = document.getElementById("profile-posts-loader");
        if (loader) loader.style.display = "flex";

        try {
            const res = await API.Posts.getByAccountId(currentProfileId, page, PAGE_SIZE);
            if (!res.ok) throw new Error("Load posts failed");

            const data = await res.json();
            renderPostGrid(data.items);

            page++;
            hasMore = data.items.length === PAGE_SIZE;

        } catch (err) {
            console.error(err);
        } finally {
            isLoading = false;
            if (loader) loader.style.display = "none";
        }
    }

    function renderPostGrid(posts) {
        const grid = document.getElementById("profile-posts-grid");
        if (!grid) return;

        posts.forEach(post => {
            const item = document.createElement("div");
            item.className = "grid-post-item";
            item.onclick = () => openPostDetail(post.postId);
            
            const thumbUrl = post.medias?.[0]?.mediaUrl || "";
            const mediaType = post.medias?.[0]?.type;
            // Handle both string "video" and Enum 1 (Video)
            const isVideo = (typeof mediaType === 'string' && mediaType.includes("video")) || mediaType === 1;
            const isMulti = post.mediaCount > 1;

            item.innerHTML = `
                ${isVideo 
                    ? `<video src="${thumbUrl}"></video>` 
                    : `<img src="${thumbUrl}" alt="post">`}
                
                ${isMulti ? `<div class="multi-media-icon"><i data-lucide="layers"></i></div>` : ""}
                ${isVideo ? `<div class="multi-media-icon"><i data-lucide="video"></i></div>` : ""}

                <div class="grid-post-overlay">
                    <div class="overlay-stat">
                        <i data-lucide="heart" style="fill: white;"></i>
                        <span>${post.reactCount}</span>
                    </div>
                    <div class="overlay-stat">
                        <i data-lucide="message-circle" style="fill: white;"></i>
                        <span>${post.commentCount}</span>
                    </div>
                </div>
            `;
            grid.appendChild(item);
        });

        if (window.lucide) lucide.createIcons();
    }

    function setupScrollListener() {
        window.onscroll = () => {
            if (isLoading || !hasMore) return;
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                loadPosts();
            }
        };
    }

    function setupTabListeners() {
        const tabs = document.querySelectorAll(".profile-tab");
        tabs.forEach(tab => {
            tab.onclick = function() {
                tabs.forEach(t => t.classList.remove("active"));
                this.classList.add("active");
                // For now, only 'Posts' works as expected
                const type = this.dataset.tab;
                if (type === "posts") {
                    resetState();
                    loadPosts();
                } else {
                    document.getElementById("profile-posts-grid").innerHTML = `<div style="grid-column: 1/4; text-align: center; padding: 40px; color: var(--text-tertiary);">No ${type} yet.</div>`;
                    hasMore = false;
                }
            };
        });
    }

    function setupEditProfileListeners() {
        const avatarInput = document.getElementById("edit-avatar-input");
        const coverInput = document.getElementById("edit-cover-input");

        if (avatarInput) {
            avatarInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById("edit-avatar-preview").src = URL.createObjectURL(file);
                }
            };
        }
        if (coverInput) {
            coverInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById("edit-cover-preview").src = URL.createObjectURL(file);
                }
            };
        }
    }

    // Handlers
    global.handleProfileFollow = async function(accountId, btn) {
        const isCurrentlyFollowing = btn.classList.contains("btn-following-profile");
        
        if (isCurrentlyFollowing) {
            if (window.FollowModule) await window.FollowModule.unfollowUser(accountId);
        } else {
            if (window.FollowModule) await window.FollowModule.followUser(accountId);
        }
    }

    global.openEditProfile = function() {
        const modal = document.getElementById("edit-profile-modal");
        if (!modal || !currentProfileData) return;

        const info = currentProfileData.accountInfo || currentProfileData.AccountInfo;
        if (!info) return;

        // Populate fields
        document.getElementById("edit-fullname").value = info.fullName || info.FullName || "";
        document.getElementById("edit-bio").value = info.bio || info.Bio || "";
        document.getElementById("edit-phone").value = info.phone || info.Phone || "";
        document.getElementById("edit-address").value = info.address || info.Address || "";
        document.getElementById("edit-gender").value = (info.gender !== false && info.Gender !== false) ? "true" : "false"; // Default true

        // Images
        document.getElementById("edit-avatar-preview").src = info.avatarUrl || info.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        document.getElementById("edit-cover-preview").src = info.coverUrl || info.CoverUrl || "assets/gradients/orb-1.png";

        // Reset inputs
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
        
        const btn = document.querySelector("#edit-profile-modal .btn-primary");
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

            const res = await API.Accounts.updateProfile(currentProfileId, formData);
            if (res.ok) {
                if (window.toastSuccess) toastSuccess("Profile updated successfully!");
                closeEditProfile();
                await loadProfileData(); // Reload UI
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

    global.openMessage = function(accountId) {
        if (window.toastInfo) toastInfo("Messaging feature coming soon!");
        // Future: window.location.href = `/chat?user=${accountId}`;
    };

    global.initProfilePage = initProfile;

})(window);
