/**
 * account-settings.js
 * Handles account settings page functionality with isolated selectors
 */

(function() {
    let currentSettings = null;
    let hasUnsavedChanges = false;

    // Privacy level mappings
    const PRIVACY_LEVELS = {
        0: { name: 'Public', icon: 'globe', class: 'public' },
        1: { name: 'Followers Only', icon: 'users', class: 'follow' },
        2: { name: 'Private', icon: 'lock', class: 'private' }
    };

    const GROUP_CHAT_INVITE_LEVELS = {
        0: { name: 'No One', icon: 'lock', class: 'private' },
        1: { name: 'Followers or Following', icon: 'users', class: 'follow' },
        2: { name: 'Anyone', icon: 'globe', class: 'public' }
    };

    const SETTING_KEYS = {
        phone: 'phonePrivacy',
        address: 'addressPrivacy',
        post: 'defaultPostPrivacy',
        followers: 'followerPrivacy',
        following: 'followingPrivacy',
        'group-chat-invite': 'groupChatInvitePermission'
    };

    const SETTING_LEVEL_MAP = {
        phone: PRIVACY_LEVELS,
        address: PRIVACY_LEVELS,
        post: PRIVACY_LEVELS,
        followers: PRIVACY_LEVELS,
        following: PRIVACY_LEVELS,
        'group-chat-invite': GROUP_CHAT_INVITE_LEVELS
    };

    let originalSettings = null; // To track changes accurately

    async function initAccountSettings() {
        // Reset state on entry
        hasUnsavedChanges = false;
        originalSettings = null;
        
        const mc = document.querySelector('.main-content');
        if (mc) mc.scrollTop = 0; // Reset scroll position for this page only
        
        await loadCurrentSettings();
        setupToggleButtons();
        
        if (window.lucide) lucide.createIcons();
    }

    async function loadCurrentSettings() {
        try {
            const res = await API.Accounts.getSettings();
            if (!res.ok) {
                if (window.toastError) toastError("Failed to load settings.");
                return;
            }

            currentSettings = await res.json();
            
            // Handle null or missing data with defaults
            if (!currentSettings) {
                currentSettings = {
                    phonePrivacy: 2, // Private
                    addressPrivacy: 2, // Private
                    defaultPostPrivacy: 0, // Public
                    followerPrivacy: 0, // Public
                    followingPrivacy: 0, // Public
                    groupChatInvitePermission: 2 // Anyone
                };
            }
            
            // Initialize originalSettings for change detection
            originalSettings = {
                phonePrivacy: currentSettings.phonePrivacy ?? currentSettings.PhonePrivacy,
                addressPrivacy: currentSettings.addressPrivacy ?? currentSettings.AddressPrivacy,
                defaultPostPrivacy: currentSettings.defaultPostPrivacy ?? currentSettings.DefaultPostPrivacy,
                followerPrivacy: currentSettings.followerPrivacy ?? currentSettings.FollowerPrivacy,
                followingPrivacy: currentSettings.followingPrivacy ?? currentSettings.FollowingPrivacy,
                groupChatInvitePermission: currentSettings.groupChatInvitePermission ?? currentSettings.GroupChatInvitePermission
            };

            populateSettings(currentSettings);
        } catch (err) {
            console.error(err);
            if (window.toastError) toastError("An error occurred while loading settings.");
        }
    }

    function populateSettings(settings) {
        if (!settings) return;

        updatePrivacyButton('phone', settings.phonePrivacy ?? settings.PhonePrivacy ?? 2);
        updatePrivacyButton('address', settings.addressPrivacy ?? settings.AddressPrivacy ?? 2);
        updatePrivacyButton('post', settings.defaultPostPrivacy ?? settings.DefaultPostPrivacy ?? 0);
        updatePrivacyButton('followers', settings.followerPrivacy ?? settings.FollowerPrivacy ?? 0);
        updatePrivacyButton('following', settings.followingPrivacy ?? settings.FollowingPrivacy ?? 0);
        updatePrivacyButton('group-chat-invite', settings.groupChatInvitePermission ?? settings.GroupChatInvitePermission ?? 2);
        
        hasUnsavedChanges = false;
    }

    function updatePrivacyButton(settingKey, value) {
        const btn = document.getElementById(`btn-${settingKey}-privacy`);
        const label = document.getElementById(`label-${settingKey}-privacy`);
        
        if (!btn || !label) return;

        const settingLevelMap = SETTING_LEVEL_MAP[settingKey] || PRIVACY_LEVELS;
        const config = settingLevelMap[value];
        if (!config) return;

        // Use ONLY the isolated class name
        btn.className = 'acc-privacy-toggle-btn ' + config.class;
        btn.innerHTML = `<i data-lucide="${config.icon}"></i>`;
        btn.dataset.value = value;

        label.textContent = config.name;

        if (window.lucide) lucide.createIcons();
    }

    function setupToggleButtons() {
        Object.keys(SETTING_KEYS).forEach(key => {
            const btn = document.getElementById(`btn-${key}-privacy`);
            if (!btn) return;

            // Proper event cleanup
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', () => {
                const currentValue = parseInt(newBtn.dataset.value || 0);
                const nextValue = (currentValue + 1) % 3;
                
                updatePrivacyButton(key, nextValue);
                hasUnsavedChanges = hasAccountSettingsChanges();
            });
        });

        // Form leave guarding (External: Close tab/Refresh)
        window.onbeforeunload = function() {
            if (hasAccountSettingsChanges()) {
                return "Unsaved changes detected.";
            }
        };
    }

    function getUICurrentValues() {
        const data = {};
        Object.keys(SETTING_KEYS).forEach(key => {
            const btn = document.getElementById(`btn-${key}-privacy`);
            if (btn) {
                data[SETTING_KEYS[key]] = parseInt(btn.dataset.value || 0);
            }
        });
        return data;
    }

    function hasAccountSettingsChanges() {
        if (!originalSettings) return false;
        const current = getUICurrentValues();
        return Object.keys(current).some(key => current[key] !== originalSettings[key]);
    }

    window.getAccountSettingsModified = function() {
        return hasAccountSettingsChanges();
    };

    window.showDiscardAccountSettingsConfirmation = function(onDiscard, onKeep) {
        // Reuse the same style as unfollow confirmation in profile-preview.css
        const overlay = document.createElement("div");
        overlay.className = "unfollow-overlay show";

        const popup = document.createElement("div");
        popup.className = "unfollow-popup";
        popup.innerHTML = `
            <div class="unfollow-content">
                <h3>Discard changes?</h3>
                <p>You have unsaved changes. Are you sure you want to discard them?</p>
            </div>
            <div class="unfollow-actions">
                <button class="unfollow-btn unfollow-confirm" data-action="discard">Discard</button>
                <button class="unfollow-btn unfollow-cancel" data-action="keep">Cancel</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const closePopup = () => {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 200);
        };

        popup.querySelector('[data-action="discard"]').onclick = () => {
            closePopup();
            if (onDiscard) onDiscard();
        };

        popup.querySelector('[data-action="keep"]').onclick = () => {
            closePopup();
            if (onKeep) onKeep();
        };

        overlay.onclick = (e) => { if (e.target === overlay) closePopup(); };
    };

    window.saveAccountSettings = async function() {
        const btn = document.getElementById("save-settings-btn");
        if (!btn) return;

        // Check for changes before proceeding
        if (!hasAccountSettingsChanges()) {
            if (window.toastInfo) toastInfo("No changes were made.");
            setTimeout(() => {
                window.location.hash = "#/profile";
            }, 600);
            return;
        }

        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="acc-spin"></i><span>Saving...</span>';
        btn.disabled = true;
        
        if (window.lucide) lucide.createIcons();

        try {
            const data = getUICurrentValues();
            // API expects PascalCase keys
            const apiData = {};
            Object.entries(data).forEach(([key, val]) => {
                const apiK = key.charAt(0).toUpperCase() + key.slice(1);
                apiData[apiK] = val;
            });

            const res = await API.Accounts.updateSettings(apiData);
            if (res.ok) {
                const newSettings = await res.json();
                
                // Update local storage for immediate effect in newsfeed/create-post
                const postP = newSettings.defaultPostPrivacy ?? newSettings.DefaultPostPrivacy;
                if (postP !== undefined) localStorage.setItem("defaultPostPrivacy", postP);

                // Update original state to match saved data (handling case differences)
                originalSettings = {
                    phonePrivacy: newSettings.phonePrivacy ?? newSettings.PhonePrivacy,
                    addressPrivacy: newSettings.addressPrivacy ?? newSettings.AddressPrivacy,
                    defaultPostPrivacy: newSettings.defaultPostPrivacy ?? newSettings.DefaultPostPrivacy,
                    followerPrivacy: newSettings.followerPrivacy ?? newSettings.FollowerPrivacy,
                    followingPrivacy: newSettings.followingPrivacy ?? newSettings.FollowingPrivacy,
                    groupChatInvitePermission: newSettings.groupChatInvitePermission ?? newSettings.GroupChatInvitePermission
                };
                
                hasUnsavedChanges = false;
                if (window.toastSuccess) toastSuccess("Settings saved successfully!");

                // Redirect to profile after a short delay
                setTimeout(() => {
                    window.location.hash = "#/profile";
                }, 1000);
            } else {
                const errorData = await res.json();
                if (window.toastError) toastError(errorData.title || "Failed to save settings.");
            }
        } catch (err) {
            console.error(err);
            if (window.toastError) toastError("An error occurred while saving.");
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.initAccountSettings = initAccountSettings;
})();
