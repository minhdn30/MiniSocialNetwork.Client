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

    function initProfile() {
        const hash = window.location.hash;
        let accountId = null;

        if (hash.includes("?")) {
            const queryString = hash.split("?")[1];
            const params = new URLSearchParams(queryString);
            accountId = params.get("id");
        }

        accountId = accountId || localStorage.getItem("accountId");
        
        if (!accountId) {
            console.error("No account ID found");
            return;
        }

        // Register state hooks for PageCache
        window.getPageData = () => ({
            currentProfileId,
            page,
            hasMore,
            currentProfileData
        });
        window.setPageData = (data) => {
            if (!data) return;
            currentProfileId = data.currentProfileId;
            page = data.page;
            hasMore = data.hasMore;
            currentProfileData = data.currentProfileData;
        };

        currentProfileId = accountId;
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

    async function loadProfileData() {
        if (!currentProfileId) return;

        // Use LoadingUtils if available
        const mainContent = document.querySelector(".profile-content-wrapper");
        if (window.LoadingUtils) LoadingUtils.toggle("profile-posts-loader", true);

        try {
            const res = await API.Accounts.getProfile(currentProfileId);
            if (!res.ok) {
                if (window.toastError) toastError("Failed to load profile details.");
                return;
            }

            const data = await res.json();
            currentProfileData = data;
            renderProfileHeader(data);
            loadPosts(); 
        } catch (err) {
            console.error(err);
        } finally {
            if (window.LoadingUtils) LoadingUtils.toggle("profile-posts-loader", false);
        }
    }

    function renderProfileHeader(data) {
        // Find elements
        const coverImg = document.getElementById("profile-cover-img");
        const avatarImg = document.getElementById("profile-avatar");
        const fullNameHeader = document.getElementById("profile-fullname-header");
        const bioText = document.getElementById("profile-bio-text");
        const postCount = document.getElementById("profile-posts-count");
        const followersCount = document.getElementById("profile-followers-count");
        const followingCount = document.getElementById("profile-following-count");
        const actionBtn = document.getElementById("profile-action-btn");

        if (!data) return;

        const info = data.accountInfo || data.account; // Handle potential naming variations
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
        
        // Use FullName in the prominent header position as requested
        if (fullNameHeader) fullNameHeader.textContent = info.fullName || "User";
        
        // Bio
        if (bioText) bioText.textContent = info.bio || "No bio yet.";

        // Stats
        if (postCount) postCount.textContent = data.totalPosts ?? data.postCount ?? 0;
        if (followersCount) followersCount.textContent = followInfo.followers ?? data.followerCount ?? 0;
        if (followingCount) followingCount.textContent = followInfo.following ?? data.followingCount ?? 0;

        // Action Buttons
        if (actionBtn) {
            if (isOwner) {
                actionBtn.innerHTML = `
                    <button class="profile-btn profile-btn-edit" onclick="openEditProfile()" title="Edit Profile">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="profile-btn profile-btn-secondary" id="profile-settings-btn" onclick="openProfileSettings()" title="Settings">
                        <i data-lucide="settings"></i>
                    </button>
                    <button class="profile-btn profile-btn-secondary" onclick="openProfileMoreMenu()" title="More">
                        <i data-lucide="more-horizontal"></i>
                    </button>
                `;
            } else {
                const followBtnClass = isFollowed ? 'profile-btn-following' : 'profile-btn-follow';
                const followIcon = isFollowed ? 'check' : 'user-plus';
                const followText = isFollowed ? 'Following' : 'Follow';
                
                actionBtn.innerHTML = `
                    <button class="profile-btn ${followBtnClass}" onclick="toggleFollowProfile('${info.accountId}')">
                        <i data-lucide="${followIcon}"></i>
                        <span>${followText}</span>
                    </button>
                    <button class="profile-btn profile-btn-secondary" onclick="openMessage('${info.accountId}')" title="Message">
                        <i data-lucide="send"></i>
                    </button>
                    <button class="profile-btn profile-btn-secondary" onclick="openProfileMoreMenu()" title="More">
                        <i data-lucide="more-horizontal"></i>
                    </button>
                `;
            }
            lucide.createIcons();
        }

        // Auto-shrink font size for long names
        if (fullNameHeader) {
            fullNameHeader.style.fontSize = "32px"; // Reset
            
            // Wait for next frame to get accurate widths
            requestAnimationFrame(() => {
                let fontSize = 32;
                // ClientWidth is the boundary, ScrollWidth is the content size
                while (fullNameHeader.scrollWidth > fullNameHeader.clientWidth && fontSize > 14) {
                    fontSize -= 1; 
                    fullNameHeader.style.fontSize = fontSize + "px";
                }
            });
        }
        
        if (window.lucide) lucide.createIcons();
    }

    async function loadPosts() {
        if (isLoading || !hasMore) return;
        isLoading = true;

        const grid = document.getElementById("profile-posts-grid");
        const loader = document.getElementById("profile-posts-loader");

        if (loader) loader.style.display = "block";

        try {
            const res = await API.Posts.getByAccountId(currentProfileId, page, PAGE_SIZE);
            if (!res.ok) throw new Error("Failed to load posts");

            const data = await res.json();
            const items = data.items || data; // Fallback if it's already an array

            if (!items || items.length < PAGE_SIZE) {
                hasMore = false;
            }

            renderPosts(items);
            page++;
        } catch (err) {
            console.error(err);
        } finally {
            isLoading = false;
            if (loader) loader.style.display = "none";
        }
    }

    function renderPosts(posts) {
        const grid = document.getElementById("profile-posts-grid");
        if (!grid) return;

        if (page === 1) grid.innerHTML = "";

        posts.forEach(post => {
            const item = document.createElement("div");
            item.className = "profile-grid-item";
            item.onclick = () => {
                if (window.openPostDetail) window.openPostDetail(post.postId);
            };

            const isMulti = post.medias && post.medias.length > 1;
            const primaryMedia = post.medias && post.medias[0] ? post.medias[0].mediaUrl : "";

            item.innerHTML = `
                <img src="${primaryMedia}" alt="post">
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

        const info = currentProfileData.account;
        document.getElementById("edit-fullname").value = info.fullName || "";
        document.getElementById("edit-bio").value = info.bio || "";
        document.getElementById("edit-phone").value = info.phone || "";
        document.getElementById("edit-address").value = info.address || "";
        document.getElementById("edit-gender").value = info.gender !== undefined ? info.gender : 0;

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

            const res = await API.Accounts.updateProfile(currentProfileId, formData);
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
        if (window.LoadingUtils) LoadingUtils.setButtonLoading(btn, true);

        try {
            const isFollowed = currentProfileData.isFollowedByCurrentUser;
            let result;
            if (isFollowed) {
                result = await API.Follows.unfollow(accountId);
            } else {
                result = await API.Follows.follow(accountId);
            }

            if (result.ok) {
                currentProfileData.isFollowedByCurrentUser = !isFollowed;
                currentProfileData.followerCount += isFollowed ? -1 : 1;
                renderProfileHeader(currentProfileData);
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (window.LoadingUtils) LoadingUtils.setButtonLoading(btn, false);
        }
    };

    global.openMessage = function(accountId) {
        if (window.toastInfo) toastInfo("Messaging feature coming soon!");
    };

    global.openProfileSettings = function() {
        if (window.toastInfo) toastInfo("Settings feature coming soon!");
    };

    global.openProfileMoreMenu = function() {
        if (window.toastInfo) toastInfo("More options coming soon!");
    };

    global.initProfilePage = initProfile;

})(window);
