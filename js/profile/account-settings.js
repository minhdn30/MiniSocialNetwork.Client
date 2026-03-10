/**
 * account-settings.js
 * Handles account settings page functionality with isolated selectors
 */

(function () {
  let currentSettings = null;
  let hasUnsavedChanges = false;
  let originalSettings = null;

  const LANGUAGE_OPTIONS = ["en", "vi"];

  const PRIVACY_LEVELS = {
    0: { key: "profile.accountSettings.labels.anyone", icon: "globe", class: "public" },
    1: {
      key: "profile.accountSettings.labels.followersOnly",
      icon: "users",
      class: "follow",
    },
    2: { key: "profile.accountSettings.labels.onlyMe", icon: "lock", class: "private" },
  };

  const GROUP_CHAT_INVITE_LEVELS = {
    0: { key: "profile.accountSettings.labels.noOneAtAll", icon: "lock", class: "private" },
    1: {
      key: "profile.accountSettings.labels.followersOrFollowing",
      icon: "users",
      class: "follow",
    },
    2: { key: "profile.accountSettings.labels.anyone", icon: "globe", class: "public" },
  };

  const ONLINE_STATUS_VISIBILITY_LEVELS = {
    0: { key: "profile.accountSettings.labels.noOneAtAll", icon: "lock", class: "private" },
    1: {
      key: "profile.accountSettings.labels.contactsOnly",
      icon: "users",
      class: "follow",
    },
  };

  const FOLLOW_PRIVACY_LEVELS = {
    0: { key: "profile.accountSettings.labels.followApprovalOff", icon: "globe", class: "public" },
    1: { key: "profile.accountSettings.labels.followApprovalOn", icon: "lock", class: "private" },
  };

  const POST_PRIVACY_LEVELS = {
    0: { key: "common.labels.public", icon: "globe", class: "public" },
    1: { key: "common.labels.followersOnly", icon: "users", class: "follow" },
    2: { key: "common.labels.private", icon: "lock", class: "private" },
  };

  const TAG_PERMISSION_LEVELS = {
    0: { key: "profile.accountSettings.labels.noOneAtAll", icon: "lock", class: "private" },
    1: { key: "profile.accountSettings.labels.anyone", icon: "globe", class: "public" },
  };

  const SETTING_KEYS = {
    phone: "phonePrivacy",
    address: "addressPrivacy",
    post: "defaultPostPrivacy",
    follow: "followPrivacy",
    followers: "followerPrivacy",
    following: "followingPrivacy",
    "story-highlight": "storyHighlightPrivacy",
    "online-status": "onlineStatusVisibility",
    "group-chat-invite": "groupChatInvitePermission",
    "tag-permission": "tagPermission",
    language: "language",
  };

  const SETTING_LEVEL_MAP = {
    phone: PRIVACY_LEVELS,
    address: PRIVACY_LEVELS,
    post: POST_PRIVACY_LEVELS,
    follow: FOLLOW_PRIVACY_LEVELS,
    followers: PRIVACY_LEVELS,
    following: PRIVACY_LEVELS,
    "story-highlight": PRIVACY_LEVELS,
    "online-status": ONLINE_STATUS_VISIBILITY_LEVELS,
    "group-chat-invite": GROUP_CHAT_INVITE_LEVELS,
    "tag-permission": TAG_PERMISSION_LEVELS,
  };

  const DESCRIPTION_LEVEL_KEYS = {
    phone: {
      0: "profile.accountSettings.descriptions.phone.anyone",
      1: "profile.accountSettings.descriptions.phone.followersOnly",
      2: "profile.accountSettings.descriptions.phone.onlyMe",
    },
    address: {
      0: "profile.accountSettings.descriptions.address.anyone",
      1: "profile.accountSettings.descriptions.address.followersOnly",
      2: "profile.accountSettings.descriptions.address.onlyMe",
    },
    post: {
      0: "profile.accountSettings.descriptions.post.anyone",
      1: "profile.accountSettings.descriptions.post.followersOnly",
      2: "profile.accountSettings.descriptions.post.onlyMe",
    },
    follow: {
      0: "profile.accountSettings.descriptions.follow.off",
      1: "profile.accountSettings.descriptions.follow.on",
    },
    followers: {
      0: "profile.accountSettings.descriptions.followers.anyone",
      1: "profile.accountSettings.descriptions.followers.followersOnly",
      2: "profile.accountSettings.descriptions.followers.onlyMe",
    },
    following: {
      0: "profile.accountSettings.descriptions.following.anyone",
      1: "profile.accountSettings.descriptions.following.followersOnly",
      2: "profile.accountSettings.descriptions.following.onlyMe",
    },
    "story-highlight": {
      0: "profile.accountSettings.descriptions.storyHighlights.anyone",
      1: "profile.accountSettings.descriptions.storyHighlights.followersOnly",
      2: "profile.accountSettings.descriptions.storyHighlights.onlyMe",
    },
    "online-status": {
      0: "profile.accountSettings.descriptions.onlineStatus.noOneAtAll",
      1: "profile.accountSettings.descriptions.onlineStatus.contactsOnly",
    },
    "group-chat-invite": {
      0: "profile.accountSettings.descriptions.groupChatInvite.noOneAtAll",
      1: "profile.accountSettings.descriptions.groupChatInvite.followersOrFollowing",
      2: "profile.accountSettings.descriptions.groupChatInvite.anyone",
    },
    "tag-permission": {
      0: "profile.accountSettings.descriptions.tagPermission.noOneAtAll",
      1: "profile.accountSettings.descriptions.tagPermission.anyone",
    },
  };

  function t(key, params = {}, fallback = "") {
    return window.I18n?.t ? window.I18n.t(key, params, fallback) : fallback;
  }

  function normalizeLanguage(language) {
    return window.I18n?.normalizeLanguage
      ? window.I18n.normalizeLanguage(language)
      : "en";
  }

  function getCurrentLanguage() {
    return window.I18n?.getLanguage ? window.I18n.getLanguage() : "en";
  }

  function formatLanguageLabel(language) {
    return window.I18n?.formatLanguageLabel
      ? t(
          normalizeLanguage(language) === "vi"
            ? "profile.accountSettings.labels.vietnamese"
            : "profile.accountSettings.labels.english",
          {},
          normalizeLanguage(language) === "vi" ? "Vietnamese" : "English"
        )
      : normalizeLanguage(language) === "vi"
        ? t("profile.accountSettings.labels.vietnamese", {}, "Vietnamese")
        : t("profile.accountSettings.labels.english", {}, "English");
  }

  function getMyProfileHash() {
    if (window.RouteHelper?.buildProfileHash) {
      return window.RouteHelper.buildProfileHash("");
    }
    const me = (localStorage.getItem("username") || "").toString().trim();
    if (me) return `#/${encodeURIComponent(me)}`;
    return "#/";
  }

  function getPasswordSettingsHash() {
    if (window.RouteHelper?.buildAccountSettingsSubHash) {
      return window.RouteHelper.buildAccountSettingsSubHash("", "password");
    }

    const me = (localStorage.getItem("username") || "").toString().trim();
    if (me) return `#/${encodeURIComponent(me)}/settings/password`;
    return "#/account-settings/password";
  }

  function navigateToProfileAfterLanguageChange() {
    const targetHash = getMyProfileHash();
    hasUnsavedChanges = false;
    window.onbeforeunload = null;
    if (window.PageCache?.clearAll) {
      window.PageCache.clearAll();
    }
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    window.setTimeout(() => {
      window.location.reload();
    }, 0);
  }

  function getSettingsDefaults() {
    return {
      phonePrivacy: 2,
      addressPrivacy: 2,
      defaultPostPrivacy: 0,
      followPrivacy: 0,
      followerPrivacy: 0,
      followingPrivacy: 0,
      storyHighlightPrivacy: 0,
      onlineStatusVisibility: 1,
      groupChatInvitePermission: 2,
      tagPermission: 1,
      language: getCurrentLanguage(),
    };
  }

  function extractSettingsState(settings) {
    const defaults = getSettingsDefaults();
    return {
      phonePrivacy: settings?.phonePrivacy ?? settings?.PhonePrivacy ?? defaults.phonePrivacy,
      addressPrivacy:
        settings?.addressPrivacy ?? settings?.AddressPrivacy ?? defaults.addressPrivacy,
      defaultPostPrivacy:
        settings?.defaultPostPrivacy ??
        settings?.DefaultPostPrivacy ??
        defaults.defaultPostPrivacy,
      followPrivacy:
        settings?.followPrivacy ?? settings?.FollowPrivacy ?? defaults.followPrivacy,
      followerPrivacy:
        settings?.followerPrivacy ?? settings?.FollowerPrivacy ?? defaults.followerPrivacy,
      followingPrivacy:
        settings?.followingPrivacy ?? settings?.FollowingPrivacy ?? defaults.followingPrivacy,
      storyHighlightPrivacy:
        settings?.storyHighlightPrivacy ??
        settings?.StoryHighlightPrivacy ??
        defaults.storyHighlightPrivacy,
      onlineStatusVisibility:
        settings?.onlineStatusVisibility ??
        settings?.OnlineStatusVisibility ??
        defaults.onlineStatusVisibility,
      groupChatInvitePermission:
        settings?.groupChatInvitePermission ??
        settings?.GroupChatInvitePermission ??
        defaults.groupChatInvitePermission,
      tagPermission:
        settings?.tagPermission ?? settings?.TagPermission ?? defaults.tagPermission,
      language: normalizeLanguage(settings?.language ?? settings?.Language ?? defaults.language),
    };
  }

  function getNextSettingValue(settingKey, currentValue) {
    const settingLevelMap = SETTING_LEVEL_MAP[settingKey] || PRIVACY_LEVELS;
    const values = Object.keys(settingLevelMap)
      .map(Number)
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    if (!values.length) return currentValue;
    const currentIndex = values.indexOf(currentValue);
    if (currentIndex < 0) return values[0];
    return values[(currentIndex + 1) % values.length];
  }

  function getNextLanguage(currentLanguage) {
    const normalized = normalizeLanguage(currentLanguage);
    const currentIndex = LANGUAGE_OPTIONS.indexOf(normalized);
    if (currentIndex < 0) return LANGUAGE_OPTIONS[0];
    return LANGUAGE_OPTIONS[(currentIndex + 1) % LANGUAGE_OPTIONS.length];
  }

  function getDescriptionElement(settingKey) {
    const button = document.getElementById(`btn-${settingKey}-privacy`);
    return button?.closest(".acc-setting-item")?.querySelector(".acc-setting-description") || null;
  }

  function updateSettingDescription(settingKey, value) {
    const descriptionElement = getDescriptionElement(settingKey);
    if (!descriptionElement) return;

    const descriptionKey = DESCRIPTION_LEVEL_KEYS[settingKey]?.[value];
    if (!descriptionKey) return;

    descriptionElement.textContent = t(descriptionKey, {}, descriptionElement.textContent || "");
  }

  function updatePrivacyButton(settingKey, value) {
    const button = document.getElementById(`btn-${settingKey}-privacy`);
    const label = document.getElementById(`label-${settingKey}-privacy`);
    if (!button || !label) return;

    const settingLevelMap = SETTING_LEVEL_MAP[settingKey] || PRIVACY_LEVELS;
    const config = settingLevelMap[value];
    if (!config) return;

    button.className = `acc-privacy-toggle-btn ${config.class}`;
    button.innerHTML = `<i data-lucide="${config.icon}"></i>`;
    button.dataset.value = String(value);
    label.textContent = t(config.key, {}, config.key);
    updateSettingDescription(settingKey, value);

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function updateLanguageButton(language) {
    const button = document.getElementById("btn-language-preference");
    const label = document.getElementById("label-language-preference");
    if (!button || !label) return;

    const normalizedLanguage = normalizeLanguage(language);
    button.className = "acc-privacy-toggle-btn public";
    button.innerHTML = '<i data-lucide="languages"></i>';
    button.dataset.value = normalizedLanguage;
    label.textContent = formatLanguageLabel(normalizedLanguage);

    const descriptionElement =
      button.closest(".acc-setting-item")?.querySelector(".acc-setting-description");
    if (descriptionElement) {
      const descriptionKey =
        normalizedLanguage === "vi"
          ? "profile.accountSettings.descriptions.language.vietnamese"
          : "profile.accountSettings.descriptions.language.english";
      descriptionElement.textContent = t(descriptionKey, {}, descriptionElement.textContent || "");
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function populateSettings(settings) {
    const state = extractSettingsState(settings);
    updatePrivacyButton("phone", state.phonePrivacy);
    updatePrivacyButton("address", state.addressPrivacy);
    updatePrivacyButton("post", state.defaultPostPrivacy);
    updatePrivacyButton("follow", state.followPrivacy);
    updatePrivacyButton("followers", state.followerPrivacy);
    updatePrivacyButton("following", state.followingPrivacy);
    updatePrivacyButton("story-highlight", state.storyHighlightPrivacy);
    updatePrivacyButton("online-status", state.onlineStatusVisibility);
    updatePrivacyButton("group-chat-invite", state.groupChatInvitePermission);
    updatePrivacyButton("tag-permission", state.tagPermission);
    updateLanguageButton(state.language);
    currentSettings = { ...(currentSettings || {}), ...state };
    hasUnsavedChanges = false;
  }

  function getUICurrentValues() {
    const data = {};

    Object.keys(SETTING_KEYS).forEach((key) => {
      if (key === "language") {
        const button = document.getElementById("btn-language-preference");
        data.language = normalizeLanguage(button?.dataset.value || getCurrentLanguage());
        return;
      }

      const button = document.getElementById(`btn-${key}-privacy`);
      if (!button) return;
      data[SETTING_KEYS[key]] = parseInt(button.dataset.value || "0", 10);
    });

    return data;
  }

  function hasAccountSettingsChanges() {
    if (!originalSettings) return false;
    const current = getUICurrentValues();
    return Object.keys(current).some((key) => current[key] !== originalSettings[key]);
  }

  function syncLanguageSelection(language, options = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    updateLanguageButton(normalizedLanguage);
    currentSettings = {
      ...(currentSettings || {}),
      language: normalizedLanguage,
      Language: normalizedLanguage,
    };
    if (options.persistOriginal !== false && originalSettings) {
      originalSettings.language = normalizedLanguage;
    }
    hasUnsavedChanges = hasAccountSettingsChanges();
  }

  async function loadCurrentSettings() {
    try {
      const res = await API.Accounts.getSettings();
      if (!res.ok) {
        if (window.toastErrorKey) {
          toastErrorKey("profile.settings.loadFailed");
        }
        return;
      }

      currentSettings = (await res.json()) || getSettingsDefaults();
      const pendingLanguage = window.I18n?.getPendingLanguageSync?.();
      if (pendingLanguage) {
        currentSettings = {
          ...currentSettings,
          language: pendingLanguage,
          Language: pendingLanguage,
        };
      }
      originalSettings = extractSettingsState(currentSettings);
      populateSettings(currentSettings);
    } catch (error) {
      console.error(error);
      if (window.toastErrorKey) {
        toastErrorKey("profile.settings.loadError");
      }
    }
  }

  function setupToggleButtons() {
    const openPasswordSettingsButton = document.getElementById("open-password-settings-btn");
    if (openPasswordSettingsButton) {
      const nextButton = openPasswordSettingsButton.cloneNode(true);
      openPasswordSettingsButton.parentNode.replaceChild(nextButton, openPasswordSettingsButton);
      nextButton.addEventListener("click", () => {
        const navigateToPasswordSettings = () => {
          hasUnsavedChanges = false;
          window.onbeforeunload = null;
          window.location.hash = getPasswordSettingsHash();
        };

        if (!hasAccountSettingsChanges()) {
          navigateToPasswordSettings();
          return;
        }

        if (window.showDiscardAccountSettingsConfirmation) {
          window.showDiscardAccountSettingsConfirmation(navigateToPasswordSettings);
          return;
        }

        navigateToPasswordSettings();
      });
    }

    Object.keys(SETTING_KEYS).forEach((key) => {
      if (key === "language") return;

      const button = document.getElementById(`btn-${key}-privacy`);
      if (!button) return;

      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      newButton.addEventListener("click", () => {
        const currentValue = parseInt(newButton.dataset.value || "0", 10);
        const nextValue = getNextSettingValue(key, currentValue);
        updatePrivacyButton(key, nextValue);
        hasUnsavedChanges = hasAccountSettingsChanges();
      });
    });

    const languageButton = document.getElementById("btn-language-preference");
    if (languageButton) {
      const newLanguageButton = languageButton.cloneNode(true);
      languageButton.parentNode.replaceChild(newLanguageButton, languageButton);
      newLanguageButton.addEventListener("click", () => {
        const nextLanguage = getNextLanguage(newLanguageButton.dataset.value || getCurrentLanguage());
        syncLanguageSelection(nextLanguage, { persistOriginal: false });
      });
    }

    window.onbeforeunload = function () {
      if (hasAccountSettingsChanges()) {
        return t("profile.settings.discardChangesDescription");
      }
    };
  }

  async function initAccountSettings() {
    hasUnsavedChanges = false;
    originalSettings = null;
    const root = document.querySelector(".acc-settings-container");
    if (root && window.I18n?.translateDom) {
      window.I18n.translateDom(root);
    }

    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    await loadCurrentSettings();
    setupToggleButtons();

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  window.getAccountSettingsModified = function () {
    return hasAccountSettingsChanges();
  };

  window.showDiscardAccountSettingsConfirmation = function (onDiscard, onKeep) {
    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay show";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";
    popup.innerHTML = `
      <div class="unfollow-content">
        <h3>${t("profile.settings.discardChangesTitle")}</h3>
        <p>${t("profile.settings.discardChangesDescription")}</p>
      </div>
      <div class="unfollow-actions unfollow-actions-inline">
        <button class="unfollow-btn unfollow-cancel" data-action="keep">${t("common.buttons.cancel")}</button>
        <button class="unfollow-btn unfollow-confirm" data-action="discard">${t("common.buttons.discard")}</button>
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

    overlay.onclick = (event) => {
      if (event.target === overlay) {
        closePopup();
      }
    };
  };

  window.saveAccountSettings = async function () {
    const button = document.getElementById("save-settings-btn");
    if (!button || button.disabled) return;

    const defaultHtml = button.dataset.defaultHtml || button.innerHTML;
    button.dataset.defaultHtml = defaultHtml;
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span>${t("profile.settings.savePending")}</span><span class="spinner spinner-tiny" aria-hidden="true"></span>`;

    function resetSaveButton() {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      button.innerHTML = button.dataset.defaultHtml || defaultHtml;
      if (window.lucide) {
        lucide.createIcons();
      }
    }

    if (!hasAccountSettingsChanges()) {
      if (window.toastInfoKey) {
        toastInfoKey("profile.settings.noChanges");
      }
      setTimeout(() => {
        window.location.hash = getMyProfileHash();
      }, 600);
      return;
    }

    try {
      const data = getUICurrentValues();
      const previousLanguage = normalizeLanguage(
        window.I18n?.getLanguage?.() ?? originalSettings?.language ?? data.language,
      );
      const apiData = {};
      Object.entries(data).forEach(([key, value]) => {
        const apiKey = key.charAt(0).toUpperCase() + key.slice(1);
        apiData[apiKey] = value;
      });

      const res = await API.Accounts.updateSettings(apiData);
      if (!res.ok) {
        if (window.toastErrorKey) {
          toastErrorKey("profile.settings.saveFailed");
        }
        resetSaveButton();
        return;
      }

      const newSettings = await res.json();
      const normalizedLanguage = normalizeLanguage(
        newSettings?.language ?? newSettings?.Language ?? data.language,
      );
      const shouldReloadAfterSave = normalizedLanguage !== previousLanguage;

      const postPrivacy =
        newSettings?.defaultPostPrivacy ?? newSettings?.DefaultPostPrivacy;
      if (postPrivacy !== undefined) {
        localStorage.setItem("defaultPostPrivacy", postPrivacy);
      }

      if (window.I18n?.setLanguage) {
        window.I18n.setLanguage(normalizedLanguage);
      }
      window.I18n?.clearPendingLanguageSync?.(normalizedLanguage);

      originalSettings = extractSettingsState({
        ...newSettings,
        language: normalizedLanguage,
        Language: normalizedLanguage,
      });
      currentSettings = { ...(newSettings || {}), ...originalSettings };
      hasUnsavedChanges = false;

      if (window.toastSuccessKey) {
        toastSuccessKey("profile.settings.saveSuccess");
      }

      setTimeout(() => {
        if (shouldReloadAfterSave) {
          navigateToProfileAfterLanguageChange();
          return;
        }
        window.location.hash = getMyProfileHash();
      }, 1000);
    } catch (error) {
      console.error(error);
      if (window.toastErrorKey) {
        toastErrorKey("profile.settings.saveError");
      }
      resetSaveButton();
    }
  };

  if (window.I18n?.onChange) {
    window.I18n.onChange((language) => {
      const settingsRoot = document.querySelector(".acc-settings-container");
      if (settingsRoot && window.I18n?.translateDom) {
        window.I18n.translateDom(settingsRoot);
      }
      Object.keys(SETTING_KEYS).forEach((key) => {
        if (key === "language") return;
        const button = document.getElementById(`btn-${key}-privacy`);
        if (!button) return;
        updatePrivacyButton(key, parseInt(button.dataset.value || "0", 10));
      });
      updateLanguageButton(language);
    });
  }

  window.AccountSettingsPage = window.AccountSettingsPage || {};
  window.AccountSettingsPage.syncLanguageSelection = syncLanguageSelection;
  window.initAccountSettings = initAccountSettings;
})();
