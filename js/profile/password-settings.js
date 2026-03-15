(function () {
  const PASSWORD_MIN_LENGTH = 6;
  const PASSWORD_ACCENT_REGEX = /[\u00C0-\u024F\u1E00-\u1EFF]/u;
  const PASSWORD_SUBPAGE = "password";
  const state = {
    hasPassword: null,
    externalLogins: [],
    isSubmitting: false,
    ignoreUnsavedChanges: false,
    previousDirtyHandler: null,
    previousDiscardHandler: null,
    beforeUnloadHandler: null,
    sharedDirtyHandler: null,
    sharedDiscardHandler: null,
  };

  function t(key, params = {}, fallback = "") {
    return window.I18n?.t ? window.I18n.t(key, params, fallback || key) : fallback || key;
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getSettingsHash() {
    if (window.RouteHelper?.buildAccountSettingsHash) {
      return window.RouteHelper.buildAccountSettingsHash("");
    }

    const username = (localStorage.getItem("username") || "").toString().trim();
    return username ? `#/${encodeURIComponent(username)}/settings` : "#/account-settings";
  }

  function getPasswordSettingsHash() {
    if (window.RouteHelper?.buildAccountSettingsSubHash) {
      return window.RouteHelper.buildAccountSettingsSubHash("", PASSWORD_SUBPAGE);
    }

    const username = (localStorage.getItem("username") || "").toString().trim();
    return username
      ? `#/${encodeURIComponent(username)}/settings/${PASSWORD_SUBPAGE}`
      : "#/account-settings/password";
  }

  function getFormValues() {
    return {
      currentPassword: document.getElementById("password-settings-current")?.value || "",
      newPassword: document.getElementById("password-settings-new")?.value || "",
      confirmPassword: document.getElementById("password-settings-confirm")?.value || "",
    };
  }

  function hasPasswordSettingsChanges() {
    if (state.ignoreUnsavedChanges) {
      return false;
    }

    const values = getFormValues();
    return Object.values(values).some((value) => value.trim().length > 0);
  }

  function getPasswordRules(password) {
    const value = (password || "").toString();
    const rules = {
      length: value.length >= PASSWORD_MIN_LENGTH,
      noSpaces: !value.includes(" "),
      noAccents: !PASSWORD_ACCENT_REGEX.test(value),
    };

    const completedCount = Object.values(rules).filter(Boolean).length;
    return {
      ...rules,
      completedCount,
      progress: Math.round((completedCount / 3) * 100),
    };
  }

  function getPasswordPolicyError(password) {
    if (!password) {
      return t("auth.passwordPolicyRequired", {}, "Please enter a password");
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return t(
        "auth.passwordPolicyLength",
        { count: PASSWORD_MIN_LENGTH },
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      );
    }

    if (password.includes(" ") || PASSWORD_ACCENT_REGEX.test(password)) {
      return t(
        "auth.passwordPolicyAccent",
        {},
        "Password cannot contain spaces or Vietnamese accents",
      );
    }

    return "";
  }

  function updateRuleState(ruleId, isComplete) {
    const element = document.getElementById(ruleId);
    if (!element) return;
    element.classList.toggle("is-complete", !!isComplete);
  }

  function updatePasswordProgress() {
    const newPassword = document.getElementById("password-settings-new")?.value || "";
    const progressFill = document.getElementById("password-settings-progress-fill");
    const progressLabel = document.getElementById("password-settings-progress-label");
    const rules = getPasswordRules(newPassword);

    if (progressFill) {
      progressFill.style.width = `${rules.progress}%`;
    }

    updateRuleState("password-settings-rule-length", rules.length);
    updateRuleState("password-settings-rule-space", rules.noSpaces);
    updateRuleState("password-settings-rule-accent", rules.noAccents);

    if (!progressLabel) return;

    if (!newPassword) {
      progressLabel.textContent = t(
        "profile.passwordSettings.progress.empty",
        {},
        "Your new password needs to meet the rules below",
      );
      return;
    }

    if (rules.completedCount === 3) {
      progressLabel.textContent = t(
        "profile.passwordSettings.progress.ready",
        {},
        "Your password is ready to save",
      );
      return;
    }

    progressLabel.textContent = t(
      "profile.passwordSettings.progress.incomplete",
      { count: rules.completedCount, total: 3 },
      `${rules.completedCount}/3 password rules completed`,
    );
  }

  function formatProviderName(provider) {
    const normalized = (provider || "").toString().trim().toLowerCase();
    if (!normalized) return "";

    if (normalized === "google") return "Google";
    if (normalized === "facebook") return "Facebook";
    if (normalized === "tiktok") return "TikTok";

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function setProvidersLoading() {
    const container = document.getElementById("password-settings-provider-list");
    if (!container) return;
    container.innerHTML = `
      <div class="password-settings-provider-empty">
        ${escapeHtml(
          t(
            "profile.passwordSettings.security.loadingProviders",
            {},
            "Loading sign-in methods...",
          ),
        )}
      </div>
    `;
  }

  function renderProviders() {
    const container = document.getElementById("password-settings-provider-list");
    const providerCount = document.getElementById("password-settings-provider-count");
    if (!container || !providerCount) return;

    const providers = Array.isArray(state.externalLogins) ? state.externalLogins : [];
    providerCount.textContent = String(providers.length);

    if (!providers.length) {
      container.innerHTML = `
        <div class="password-settings-provider-empty">
          ${escapeHtml(
            t(
              "profile.passwordSettings.security.noProviders",
              {},
              "No external sign-in methods connected",
            ),
          )}
        </div>
      `;
      if (window.lucide) {
        window.lucide.createIcons();
      }
      return;
    }

    container.innerHTML = providers
      .map((provider) => {
        const providerName = escapeHtml(
          formatProviderName(provider?.provider ?? provider?.Provider),
        );
        return `
          <div class="password-settings-provider-chip">
            <i data-lucide="link-2"></i>
            <span>${providerName}</span>
          </div>
        `;
      })
      .join("");

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function applyPasswordStatusToUi() {
    const hasPasswordLabel = document.getElementById("password-settings-has-password-label");
    const currentPasswordField = document.getElementById("current-password-field");
    const formTitle = document.getElementById("password-settings-form-title");
    const submitLabel = document.getElementById("password-settings-submit-label");

    if (!hasPasswordLabel || !formTitle || !submitLabel) return;

    hasPasswordLabel.className = "password-settings-status-pill";

    if (state.hasPassword === true) {
      hasPasswordLabel.classList.add("is-success");
      hasPasswordLabel.textContent = t(
        "profile.passwordSettings.security.enabled",
        {},
        "Enabled",
      );
      formTitle.textContent = t(
        "profile.passwordSettings.form.changeTitle",
        {},
        "Change password",
      );
      submitLabel.textContent = t("common.buttons.save", {}, "Save");
      if (currentPasswordField) {
        currentPasswordField.hidden = false;
      }
      return;
    }

    if (state.hasPassword === false) {
      hasPasswordLabel.classList.add("is-warning");
      hasPasswordLabel.textContent = t(
        "profile.passwordSettings.security.notSet",
        {},
        "Not set",
      );
      formTitle.textContent = t(
        "profile.passwordSettings.form.setTitle",
        {},
        "Set password",
      );
      submitLabel.textContent = t("common.buttons.save", {}, "Save");
      if (currentPasswordField) {
        currentPasswordField.hidden = true;
      }
      return;
    }

    hasPasswordLabel.classList.add("is-neutral");
    hasPasswordLabel.textContent = t(
      "profile.passwordSettings.security.checking",
      {},
      "Checking",
    );
    formTitle.textContent = t(
      "profile.passwordSettings.form.genericTitle",
      {},
      "Set or change password",
    );
    submitLabel.textContent = t("common.buttons.save", {}, "Save");
    if (currentPasswordField) {
      currentPasswordField.hidden = false;
    }
  }

  function updateVisibilityButton(button, isVisible) {
    if (!button) return;
    button.dataset.visible = isVisible ? "true" : "false";
    button.innerHTML = `<i data-lucide="${isVisible ? "eye-off" : "eye"}"></i>`;
    button.setAttribute(
      "aria-label",
      t(
        isVisible
          ? "profile.passwordSettings.hidePasswordAria"
          : "profile.passwordSettings.showPasswordAria",
        {},
        isVisible ? "Hide password" : "Show password",
      ),
    );

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function setupVisibilityToggles() {
    document.querySelectorAll(".password-settings-visibility-btn").forEach((button) => {
      const clone = button.cloneNode(true);
      button.parentNode.replaceChild(clone, button);
      updateVisibilityButton(clone, false);

      clone.addEventListener("click", () => {
        const inputId = clone.dataset.target;
        const input = document.getElementById(inputId);
        if (!input) return;
        const isVisible = input.type === "text";
        input.type = isVisible ? "password" : "text";
        updateVisibilityButton(clone, !isVisible);
      });
    });
  }

  async function parseResponseMessage(response) {
    if (!response) return "";
    try {
      const data = await response.json();
      return (data?.message || "").toString();
    } catch (_) {
      return "";
    }
  }

  async function showPasswordError(response) {
    const message = (await parseResponseMessage(response)).trim().toLowerCase();

    if (message.includes("current password is required")) {
      window.toastErrorKey?.("profile.passwordSettings.errors.currentRequired");
      return;
    }

    if (message.includes("current password is incorrect")) {
      window.toastErrorKey?.("profile.passwordSettings.errors.currentIncorrect");
      return;
    }

    if (message.includes("new password is required")) {
      window.toastError?.(t("auth.passwordPolicyRequired", {}, "Please enter a password"));
      return;
    }

    if (message.includes("password must be at least")) {
      window.toastError?.(
        t(
          "auth.passwordPolicyLength",
          { count: PASSWORD_MIN_LENGTH },
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        ),
      );
      return;
    }

    if (
      message.includes("password cannot contain spaces") ||
      message.includes("vietnamese accents")
    ) {
      window.toastError?.(
        t(
          "auth.passwordPolicyAccent",
          {},
          "Password cannot contain spaces or Vietnamese accents",
        ),
      );
      return;
    }

    if (message.includes("confirm password is required")) {
      window.toastErrorKey?.("profile.passwordSettings.errors.confirmRequired");
      return;
    }

    window.toastErrorKey?.("profile.passwordSettings.errors.saveFailed");
  }

  function setSubmittingState(isLoading) {
    const button = document.getElementById("password-settings-submit-btn");
    if (!button) return;

    if (!button.dataset.defaultHtml) {
      button.dataset.defaultHtml = button.innerHTML;
    }

    state.isSubmitting = !!isLoading;
    button.disabled = !!isLoading;
    button.classList.toggle("is-loading", !!isLoading);
    button.setAttribute("aria-busy", isLoading ? "true" : "false");

    if (isLoading) {
      button.innerHTML = `
        <span>${
          escapeHtml(
            t(
              "profile.settings.savePending",
              {},
              "Saving...",
            ),
          )
        }</span>
        <span class="spinner spinner-tiny" aria-hidden="true"></span>
      `;
    } else {
      button.innerHTML = button.dataset.defaultHtml;
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  function resetPasswordForm() {
    const form = document.getElementById("password-settings-form");
    if (!form) return;
    state.ignoreUnsavedChanges = false;
    form.reset();
    setupVisibilityToggles();
    updatePasswordProgress();
  }

  function navigateBackToSettings() {
    window.location.hash = getSettingsHash();
  }

  function syncUnsavedLeaveWarning() {
    state.beforeUnloadHandler = function () {
      if (hasPasswordSettingsChanges()) {
        return t(
          "profile.passwordSettings.discard.description",
          {},
          "You have unsaved password changes. Are you sure you want to discard them?",
        );
      }
    };

    window.onbeforeunload = state.beforeUnloadHandler;
  }

  function registerSharedSettingsHandlers() {
    if (!state.sharedDirtyHandler) {
      state.sharedDirtyHandler = function () {
        return hasPasswordSettingsChanges();
      };
    }

    if (!state.sharedDiscardHandler) {
      state.sharedDiscardHandler = function (onDiscard, onKeep) {
        showDiscardConfirmation(onDiscard, onKeep);
      };
    }

    state.previousDirtyHandler =
      window.getAccountSettingsModified === state.sharedDirtyHandler
        ? state.previousDirtyHandler
        : typeof window.getAccountSettingsModified === "function"
          ? window.getAccountSettingsModified
          : null;
    state.previousDiscardHandler =
      window.showDiscardAccountSettingsConfirmation === state.sharedDiscardHandler
        ? state.previousDiscardHandler
        : typeof window.showDiscardAccountSettingsConfirmation === "function"
          ? window.showDiscardAccountSettingsConfirmation
          : null;

    window.getAccountSettingsModified = state.sharedDirtyHandler;
    window.showDiscardAccountSettingsConfirmation = state.sharedDiscardHandler;
  }

  function disposePasswordSettings() {
    if (window.getAccountSettingsModified === state.sharedDirtyHandler) {
      if (state.previousDirtyHandler) {
        window.getAccountSettingsModified = state.previousDirtyHandler;
      } else {
        delete window.getAccountSettingsModified;
      }
    }

    if (
      window.showDiscardAccountSettingsConfirmation ===
      state.sharedDiscardHandler
    ) {
      if (state.previousDiscardHandler) {
        window.showDiscardAccountSettingsConfirmation =
          state.previousDiscardHandler;
      } else {
        delete window.showDiscardAccountSettingsConfirmation;
      }
    }

    if (window.onbeforeunload === state.beforeUnloadHandler) {
      window.onbeforeunload = null;
    }
  }

  function showDiscardConfirmation(onDiscard, onKeep) {
    const overlay = document.createElement("div");
    overlay.className = "unfollow-overlay show";

    const popup = document.createElement("div");
    popup.className = "unfollow-popup";
    popup.innerHTML = `
      <div class="unfollow-content">
        <h3>${escapeHtml(
          t(
            "profile.passwordSettings.discard.title",
            {},
            "Discard changes?",
          ),
        )}</h3>
        <p>${escapeHtml(
          t(
            "profile.passwordSettings.discard.description",
            {},
            "You have unsaved password changes. Are you sure you want to discard them?",
          ),
        )}</p>
      </div>
      <div class="unfollow-actions unfollow-actions-inline">
        <button class="unfollow-btn unfollow-cancel" data-action="keep">${escapeHtml(
          t("common.buttons.cancel", {}, "Cancel"),
        )}</button>
        <button class="unfollow-btn unfollow-confirm" data-action="discard">${escapeHtml(
          t("common.buttons.discard", {}, "Discard"),
        )}</button>
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
  }

  function handleBackAction() {
    if (!hasPasswordSettingsChanges()) {
      navigateBackToSettings();
      return;
    }

    showDiscardConfirmation(() => {
      window.onbeforeunload = null;
      navigateBackToSettings();
    });
  }

  async function loadPasswordStatus() {
    state.hasPassword = null;
    state.externalLogins = [];
    applyPasswordStatusToUi();
    setProvidersLoading();

    try {
      const response = await API.Auth.getPasswordStatus();
      if (!response.ok) {
        window.toastErrorKey?.("profile.passwordSettings.errors.loadFailed");
        renderProviders();
        return;
      }

      const data = await response.json();
      state.hasPassword = !!(data?.hasPassword ?? data?.HasPassword);
      state.externalLogins = data?.externalLogins ?? data?.ExternalLogins ?? [];
      applyPasswordStatusToUi();
      renderProviders();
    } catch (error) {
      console.error(error);
      window.toastErrorKey?.("profile.passwordSettings.errors.loadError");
      renderProviders();
    }
  }

  function validatePasswordSubmit() {
    const { currentPassword, newPassword, confirmPassword } = getFormValues();
    const passwordPolicyError = getPasswordPolicyError(newPassword);

    if (passwordPolicyError) {
      window.toastError?.(passwordPolicyError);
      return false;
    }

    if (!confirmPassword) {
      window.toastErrorKey?.("profile.passwordSettings.errors.confirmRequired");
      return false;
    }

    if (newPassword !== confirmPassword) {
      window.toastError?.(t("auth.passwordMismatch", {}, "Passwords do not match"));
      return false;
    }

    if (state.hasPassword === true && !currentPassword.trim()) {
      window.toastErrorKey?.("profile.passwordSettings.errors.currentRequired");
      return false;
    }

    return true;
  }

  async function submitPasswordChange(event) {
    event?.preventDefault?.();
    if (state.isSubmitting) return;

    if (!validatePasswordSubmit()) {
      return;
    }

    const values = getFormValues();
    setSubmittingState(true);

    try {
      const response = await API.Auth.changePassword(
        values.currentPassword,
        values.newPassword,
        values.confirmPassword,
      );

      if (!response.ok) {
        await showPasswordError(response);
        setSubmittingState(false);
        return;
      }

      const result = await response.json().catch(() => null);
      if (result?.accessToken && window.AuthStore?.setAccessToken) {
        window.AuthStore.setAccessToken(result.accessToken, "change-password");
      }

      state.ignoreUnsavedChanges = true;
      window.toastSuccessKey?.(
        state.hasPassword === false
          ? "profile.passwordSettings.success.set"
          : "profile.passwordSettings.success.changed",
      );
      window.onbeforeunload = null;

      setTimeout(() => {
        if (window.location.hash === getPasswordSettingsHash()) {
          navigateBackToSettings();
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      window.toastErrorKey?.("profile.passwordSettings.errors.saveError");
      setSubmittingState(false);
    }
  }

  function bindEvents() {
    const form = document.getElementById("password-settings-form");
    if (form) {
      form.addEventListener("submit", submitPasswordChange);
    }

    ["password-settings-current", "password-settings-new", "password-settings-confirm"].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", () => {
        if (id === "password-settings-new") {
          updatePasswordProgress();
        }
      });
    });

    document.getElementById("password-settings-back-btn")?.addEventListener("click", handleBackAction);
    document.getElementById("password-settings-cancel-btn")?.addEventListener("click", handleBackAction);
  }

  async function initPasswordSettings() {
    const root = document.querySelector(".password-settings-page");
    if (root && window.I18n?.translateDom) {
      window.I18n.translateDom(root);
    }

    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    resetPasswordForm();
    bindEvents();
    syncUnsavedLeaveWarning();
    registerSharedSettingsHandlers();
    updatePasswordProgress();
    applyPasswordStatusToUi();
    await loadPasswordStatus();
    if (window.AppFooter?.mountMainContent) {
      await window.AppFooter.mountMainContent();
    }
  }

  if (window.I18n?.onChange) {
    window.I18n.onChange(() => {
      const root = document.querySelector(".password-settings-page");
      if (root && window.I18n?.translateDom) {
        window.I18n.translateDom(root);
      }
      applyPasswordStatusToUi();
      renderProviders();
      updatePasswordProgress();
      setupVisibilityToggles();
    });
  }

  window.initPasswordSettings = initPasswordSettings;
  window.disposePasswordSettings = disposePasswordSettings;
})();
