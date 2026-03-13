const signUpButton = document.getElementById("signUp");
const signInButton = document.getElementById("signIn");
const container = document.getElementById("container");

signUpButton.addEventListener("click", () => {
  container.classList.add("right-panel-active");
});

signInButton.addEventListener("click", () => {
  container.classList.remove("right-panel-active");
});

document.querySelectorAll(".toggle-password").forEach((icon) => {
  icon.addEventListener("click", () => {
    const targetId = icon.getAttribute("data-target");
    const input = document.getElementById(targetId);
    const eyeIcon = icon.querySelector(".eye-icon");

    if (input.type === "password") {
      input.type = "text";
      // Đổi sang icon eye-off
      eyeIcon.innerHTML =
        '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
    } else {
      input.type = "password";
      // Đổi về icon eye
      eyeIcon.innerHTML =
        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
    }
  });
});

const appConfig = window.APP_CONFIG || {};
const REGISTER_USERNAME_MIN_LENGTH =
  Number(appConfig.REGISTER_USERNAME_MIN_LENGTH) > 0
    ? Number(appConfig.REGISTER_USERNAME_MIN_LENGTH)
    : 6;
const REGISTER_USERNAME_MAX_LENGTH =
  Number(appConfig.REGISTER_USERNAME_MAX_LENGTH) > 0
    ? Number(appConfig.REGISTER_USERNAME_MAX_LENGTH)
    : 30;
const REGISTER_FULLNAME_MIN_LENGTH =
  Number(appConfig.REGISTER_FULLNAME_MIN_LENGTH) > 0
    ? Number(appConfig.REGISTER_FULLNAME_MIN_LENGTH)
    : 2;
const REGISTER_FULLNAME_MAX_LENGTH =
  Number(appConfig.MAX_PROFILE_FULLNAME_LENGTH) > 0
    ? Number(appConfig.MAX_PROFILE_FULLNAME_LENGTH)
    : 25;
const REGISTER_PASSWORD_MIN_LENGTH = 6;
const PASSWORD_ACCENT_REGEX = /[\u00C0-\u024F\u1E00-\u1EFF]/u;
const USERNAME_REGEX = /^[A-Za-z0-9_]+$/;

const signupRuleUsernameLength = document.getElementById(
  "signup-rule-username-length",
);
const signupRuleFullnameLength = document.getElementById(
  "signup-rule-fullname-length",
);
const signupRulePasswordMinLength = document.getElementById(
  "signup-rule-password-min-length",
);

if (signupRuleUsernameLength) {
  signupRuleUsernameLength.textContent = `${REGISTER_USERNAME_MIN_LENGTH}-${REGISTER_USERNAME_MAX_LENGTH}`;
}

if (signupRuleFullnameLength) {
  signupRuleFullnameLength.textContent = `${REGISTER_FULLNAME_MIN_LENGTH}-${REGISTER_FULLNAME_MAX_LENGTH}`;
}

if (signupRulePasswordMinLength) {
  signupRulePasswordMinLength.textContent = String(
    REGISTER_PASSWORD_MIN_LENGTH,
  );
}

const signupUsernameInput = document.getElementById("signup-username");
const signupFullnameInput = document.getElementById("signup-fullname");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const googleLoginBtn = document.getElementById("google-login-btn");
const facebookLoginBtn = document.getElementById("facebook-login-btn");
const tiktokLoginBtn = document.getElementById("tiktok-login-btn");
const googleSigninRenderHost = document.getElementById(
  "google-signin-render-host",
);

if (signupUsernameInput) {
  signupUsernameInput.setAttribute(
    "minlength",
    String(REGISTER_USERNAME_MIN_LENGTH),
  );
  signupUsernameInput.setAttribute(
    "maxlength",
    String(REGISTER_USERNAME_MAX_LENGTH),
  );
}

if (signupFullnameInput) {
  signupFullnameInput.setAttribute(
    "minlength",
    String(REGISTER_FULLNAME_MIN_LENGTH),
  );
  signupFullnameInput.setAttribute(
    "maxlength",
    String(REGISTER_FULLNAME_MAX_LENGTH),
  );
}

function syncFloatingFieldState(input) {
  const floatingField = input.closest(".floating-field");
  if (!floatingField) {
    return;
  }

  floatingField.classList.toggle("has-value", input.value.length > 0);
}

function initFloatingFields() {
  document.querySelectorAll(".floating-field input").forEach((input) => {
    const syncState = () => syncFloatingFieldState(input);
    input.addEventListener("input", syncState);
    input.addEventListener("change", syncState);
    syncState();
  });
}

initFloatingFields();

if (window.I18n?.translateDom) {
  window.I18n.translateDom(document);
}

if (window.I18n?.t) {
  document.title = window.I18n.t(
    "auth.title",
    {},
    document.title || "CloudM Auth",
  );
}

if (window.I18n?.onChange) {
  window.I18n.onChange(() => {
    window.I18n?.translateDom?.(document);
    document.title =
      window.I18n?.t("auth.title", {}, "CloudM Auth") || "CloudM Auth";
  });
}

const verifyPopup = document.getElementById("verify-popup");
const verifyTitle = document.getElementById("verify-title");
const verifyDescription = document.getElementById("verify-description");
const verifyStepSend = document.getElementById("verify-step-send");
const verifyStepCode = document.getElementById("verify-step-code");
const sendCodeBtn = document.getElementById("send-code-btn");
const verifyBtn = document.getElementById("verify-btn");
const resendBtn = document.getElementById("resend-btn");
const popupContent = document.querySelector(
  "#verify-popup .verify-popup-content",
);
const codeInputs = document.querySelectorAll(".code-input");

const VERIFY_MODAL_MODE = {
  SIGNUP: "signup",
  LOGIN: "login",
};

const VERIFY_MODAL_STEP = {
  SEND: "send",
  CODE: "code",
};

const forgotPasswordLink = document.getElementById("forgot-password-link");
const forgotPasswordPopup = document.getElementById("forgot-password-popup");
const forgotPasswordTitle = document.getElementById("forgot-password-title");
const forgotPasswordDescription = document.getElementById(
  "forgot-password-description",
);
const forgotStepEmail = document.getElementById("forgot-step-email");
const forgotStepCode = document.getElementById("forgot-step-code");
const forgotStepReset = document.getElementById("forgot-step-reset");
const forgotEmailInput = document.getElementById("forgot-email");
const forgotSendCodeBtn = document.getElementById("forgot-send-code-btn");
const forgotVerifyCodeBtn = document.getElementById("forgot-verify-code-btn");
const forgotResendCodeBtn = document.getElementById("forgot-resend-code-btn");
const forgotResetPasswordBtn = document.getElementById(
  "forgot-reset-password-btn",
);
const forgotNewPasswordInput = document.getElementById("forgot-new-password");
const forgotConfirmPasswordInput = document.getElementById(
  "forgot-confirm-password",
);
const forgotCodeInputs = forgotPasswordPopup
  ? forgotPasswordPopup.querySelectorAll(".forgot-code-input")
  : [];
const externalProfilePopup = document.getElementById("external-profile-popup");
const externalProfileEmailInput = document.getElementById(
  "external-profile-email",
);
const externalProfileUsernameInput = document.getElementById(
  "external-profile-username",
);
const externalProfileFullnameInput = document.getElementById(
  "external-profile-fullname",
);
const externalProfileSubmitBtn = document.getElementById(
  "external-profile-submit-btn",
);
const closeExternalProfileBtn = document.querySelector(
  ".close-external-profile-popup",
);

const FORGOT_MODAL_STEP = {
  EMAIL: "email",
  CODE: "code",
  RESET: "reset",
};

let forgotVerifiedCode = "";
let prefilledPasswordClearTimer = null;
let isGoogleIdentityInitialized = false;
let isGoogleButtonRendered = false;
let pendingExternalProfileContext = null;

let pendingAutoLogin = null;

function setPendingAutoLogin(email, password) {
  const normalizedEmail = (email || "").trim();
  const normalizedPassword = (password || "").trim();

  if (!normalizedEmail || !normalizedPassword) {
    pendingAutoLogin = null;
    return;
  }

  pendingAutoLogin = {
    email: normalizedEmail,
    password: normalizedPassword,
  };
}

function clearPendingAutoLogin() {
  pendingAutoLogin = null;
}

function getPasswordPolicyError(password) {
  if (!password) {
    return (
      window.I18n?.t?.(
        "auth.passwordPolicyRequired",
        {},
        "Please enter a password",
      ) || "Please enter a password"
    );
  }

  if (password.length < REGISTER_PASSWORD_MIN_LENGTH) {
    return (
      window.I18n?.t?.(
        "auth.passwordPolicyLength",
        { count: REGISTER_PASSWORD_MIN_LENGTH },
        `Password must be at least ${REGISTER_PASSWORD_MIN_LENGTH} characters long`,
      ) ||
      `Password must be at least ${REGISTER_PASSWORD_MIN_LENGTH} characters long`
    );
  }

  if (password.includes(" ") || PASSWORD_ACCENT_REGEX.test(password)) {
    return (
      window.I18n?.t?.(
        "auth.passwordPolicyAccent",
        {},
        "Password cannot contain spaces or Vietnamese accents",
      ) || "Password cannot contain spaces or Vietnamese accents"
    );
  }

  return null;
}

function authText(key, params, fallback) {
  return window.I18n?.t ? window.I18n.t(key, params, fallback) : fallback || key;
}

function resolveAuthErrorMessageKey(action, status, rawMessage, fallbackKey) {
  const normalizedAction = (action || "").toString().trim().toLowerCase();
  const safeStatus = Number(status) || 0;
  const normalizedRaw = (rawMessage || "").toString().trim().toLowerCase();

  const literalKey = window.I18n?.resolveLiteralKey?.(rawMessage);
  if (literalKey) {
    return literalKey;
  }

  if (normalizedAction === "login") {
    if (safeStatus === 401) {
      if (
        normalizedRaw.includes("not verified") ||
        normalizedRaw.includes("verify your email")
      ) {
        return "auth.emailNotVerifiedLogin";
      }
      return "auth.invalidCredentials";
    }

    if (
      normalizedRaw.includes("invalid credentials") ||
      normalizedRaw.includes("invalid password") ||
      normalizedRaw.includes("invalid email") ||
      normalizedRaw.includes("wrong password")
    ) {
      return "auth.invalidCredentials";
    }
  }

  if (normalizedRaw.includes("username already")) {
    return "auth.usernameAlreadyExists";
  }

  if (normalizedRaw.includes("email already")) {
    return "auth.emailAlreadyExists";
  }

  if (
    normalizedRaw.includes("not verified") ||
    normalizedRaw.includes("verify your email")
  ) {
    return normalizedAction === "login"
      ? "auth.emailNotVerifiedLogin"
      : "auth.emailNotVerified";
  }

  const uiErrorKey = window.UIErrors?.resolveKey
    ? window.UIErrors.resolveKey("auth", action, status, rawMessage)
    : "";

  if (uiErrorKey && uiErrorKey !== "errors.generic") {
    return uiErrorKey;
  }

  return fallbackKey || "errors.generic";
}

function showAuthError(action, status, rawMessage, fallbackKey = "errors.auth.login") {
  const messageKey = resolveAuthErrorMessageKey(
    action,
    status,
    rawMessage,
    fallbackKey,
  );
  const fallbackMessage = authText(fallbackKey, {}, fallbackKey);
  showToast(authText(messageKey, {}, fallbackMessage), "error");
}

function showAuthInfoKey(key, type = "info", params = {}) {
  const resolved = authText(key, params, "");
  const safeMessage =
    resolved && resolved !== key
      ? resolved
      : authText("errors.generic", {}, "Something went wrong, please try again");
  showToast(safeMessage, type);
}

function buildReactivationToastHtml(message) {
  return `<div>
        <p style="margin-bottom: 8px;">${message}</p>
        <div class="toast-actions">
          <button class="toast-btn" onclick="window.reactivateAccountAction()">${authText("auth.reactivateNow", {}, "Reactivate now")}</button>
          <button class="toast-btn secondary" onclick="window.location.href='auth.html'">${authText("auth.later", {}, "Later")}</button>
        </div>
      </div>`;
}

function fillLoginCredentials(email, password) {
  const normalizedEmail = (email || "").trim();
  const normalizedPassword = password || "";

  if (loginEmailInput) {
    loginEmailInput.value = normalizedEmail;
    syncFloatingFieldState(loginEmailInput);
  }

  if (loginPasswordInput) {
    loginPasswordInput.value = normalizedPassword;
    syncFloatingFieldState(loginPasswordInput);
    loginPasswordInput.dataset.isPrefilled = "true";
    loginPasswordInput.focus();
  }

  // Security: keep prefilled password only briefly for quick login, then clear it.
  if (prefilledPasswordClearTimer) {
    clearTimeout(prefilledPasswordClearTimer);
  }

  const prefilledPasswordSnapshot = normalizedPassword;
  prefilledPasswordClearTimer = setTimeout(() => {
    if (!loginPasswordInput) {
      return;
    }

    if (
      loginPasswordInput.dataset.isPrefilled === "true" &&
      loginPasswordInput.value === prefilledPasswordSnapshot
    ) {
      loginPasswordInput.value = "";
      syncFloatingFieldState(loginPasswordInput);
      loginPasswordInput.dataset.isPrefilled = "false";
    }
  }, 120000);
}

async function runWithPendingButton(button, pendingText, action) {
  if (typeof action !== "function") {
    return false;
  }

  if (!button) {
    return action();
  }

  if (button.disabled) {
    return false;
  }

  const defaultHtml = button.dataset.defaultHtml || button.innerHTML;
  button.dataset.defaultHtml = defaultHtml;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span>${pendingText}</span><span class="spinner spinner-tiny auth-btn-spinner" aria-hidden="true"></span>`;

  try {
    return await action();
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    button.innerHTML = button.dataset.defaultHtml || defaultHtml;
  }
}

function setSocialButtonPending(button, isPending) {
  if (!button) {
    return;
  }

  button.classList.toggle("is-loading", isPending);
  if (isPending) {
    button.setAttribute("aria-busy", "true");
  } else {
    button.removeAttribute("aria-busy");
  }
}

function hasGoogleRenderedTarget() {
  if (!googleSigninRenderHost) {
    return false;
  }

  return Boolean(
    googleSigninRenderHost.querySelector("iframe, div[role='button']"),
  );
}

function syncGoogleReadyClass() {
  const isReady = hasGoogleRenderedTarget();
  if (googleLoginBtn) {
    googleLoginBtn.classList.toggle("google-ready", isReady);
  }
  return isReady;
}

function ensureGoogleIdentityInitialized() {
  const clientId = String(appConfig.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId || !window.google?.accounts?.id) {
    return false;
  }

  if (!isGoogleIdentityInitialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        void handleGoogleCredentialResponse(response);
      },
      cancel_on_tap_outside: true,
      auto_select: false,
    });

    if (!googleSigninRenderHost || !window.google?.accounts?.id?.renderButton) {
      return false;
    }

    googleSigninRenderHost.innerHTML = "";
    window.google.accounts.id.renderButton(googleSigninRenderHost, {
      type: "icon",
      theme: "outline",
      size: "large",
      shape: "circle",
      logo_alignment: "center",
    });

    isGoogleIdentityInitialized = true;
  }

  isGoogleButtonRendered = syncGoogleReadyClass();
  return isGoogleButtonRendered;
}

function startGoogleSignInPrecheck() {
  const clientId = String(appConfig.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    showAuthInfoKey("auth.googleNotConfigured", "error");
    return false;
  }

  if (!window.google?.accounts?.id) {
    showAuthInfoKey("auth.googleInitializing", "error");
    return false;
  }

  if (!ensureGoogleIdentityInitialized()) {
    showAuthInfoKey("auth.googleInitializing", "error");
    return false;
  }

  return true;
}

async function handleGoogleCredentialResponse(response) {
  const idToken = response?.credential;
  if (!idToken) {
    showAuthInfoKey("auth.googleCanceled", "error");
    return;
  }

  setSocialButtonPending(googleLoginBtn, true);

  try {
    const res = await API.Auth.loginWithGoogle(idToken);
    const data = await res.json();

    if (!res.ok) {
      showAuthError("google", res.status, data?.message || data?.Message, "errors.auth.google");
      return;
    }

    if (data?.requiresProfileCompletion) {
      openExternalProfileModal(
        data.profile,
        data.profile?.provider || "Google",
        idToken,
      );
      return;
    }

    const loginData = data?.login || data;
    if (!loginData || !loginData.accessToken) {
      showAuthInfoKey("auth.googleFailed", "error");
      return;
    }
    await handleAuthenticatedRedirect(
      loginData,
      authText("auth.googleSuccess", {}, "Google sign-in successful"),
    );
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
  } finally {
    setSocialButtonPending(googleLoginBtn, false);
  }
}

function persistSessionFromLoginResponse(data) {
  if (
    window.AuthStore &&
    typeof window.AuthStore.clearAccessToken === "function"
  ) {
    window.AuthStore.clearAccessToken("login-reset");
  }

  if (
    window.AuthStore &&
    typeof window.AuthStore.setAccessToken === "function"
  ) {
    window.AuthStore.setAccessToken(data.accessToken, "login");
  }

  localStorage.setItem("fullname", data.fullname || "");
  localStorage.setItem("username", data.username || "");
  localStorage.setItem("avatarUrl", data.avatarUrl || "");
  localStorage.setItem("accountId", data.accountId || "");
  if (typeof (data.isSocialEligible ?? data.IsSocialEligible) === "boolean") {
    localStorage.setItem(
      "isSocialEligible",
      (data.isSocialEligible ?? data.IsSocialEligible) ? "true" : "false",
    );
  }
  localStorage.setItem(
    "defaultPostPrivacy",
    data.defaultPostPrivacy ?? data.DefaultPostPrivacy ?? 0,
  );
}

function resolveLoginResponseSocialEligibility(loginData) {
  const value = loginData?.isSocialEligible ?? loginData?.IsSocialEligible;
  return typeof value === "boolean" ? value : null;
}

async function rejectNonSocialLoginSession() {
  try {
    if (window.API?.Auth?.logout) {
      await window.API.Auth.logout();
    }
  } catch (error) {
    console.warn("Unable to clear non-social session on server.", error);
  }

  if (typeof window.clearClientSession === "function") {
    window.clearClientSession();
    return;
  }

  if (
    window.AuthStore &&
    typeof window.AuthStore.clearAccessToken === "function"
  ) {
    window.AuthStore.clearAccessToken("logout");
  }

  localStorage.removeItem("fullname");
  localStorage.removeItem("username");
  localStorage.removeItem("avatarUrl");
  localStorage.removeItem("accountId");
  localStorage.removeItem("isSocialEligible");
  localStorage.removeItem("defaultPostPrivacy");
}

async function handleAuthenticatedRedirect(loginData, successMessage) {
  if (!loginData || typeof loginData !== "object") {
    showAuthInfoKey("auth.invalidLoginResponse", "error");
    return false;
  }

  persistSessionFromLoginResponse(loginData);

  if (loginData.status === 1) {
    showToast(
      buildReactivationToastHtml(authText("errors.account.restricted")),
      "error",
      0,
      true,
    );
    return false;
  }

  if (loginData.status === 5) {
    showAuthInfoKey("auth.emailNotVerifiedLogin", "error");
    return false;
  }

  if (resolveLoginResponseSocialEligibility(loginData) === false) {
    await rejectNonSocialLoginSession();
    showAuthInfoKey("auth.socialAccessUnavailable", "info");
    return false;
  }

  showToast(successMessage, "success");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 700);
  return true;
}

function isEmailNotVerifiedResponse(response, data) {
  const status = data?.status ?? data?.Status;
  if (status === 5) {
    return true;
  }

  if (response?.status !== 401) {
    return false;
  }

  const message = (data?.message || data?.Message || "").toLowerCase();
  return (
    message.includes("email is not verified") ||
    message.includes("verify your email")
  );
}

function focusFirstCodeInput() {
  if (codeInputs.length > 0) {
    codeInputs[0].focus();
  }
}

function resetCodeInputs(shouldFocus = true) {
  codeInputs.forEach((input) => (input.value = ""));
  if (shouldFocus) {
    focusFirstCodeInput();
  }
}

function setVerifyModalStep(step) {
  if (!verifyStepSend || !verifyStepCode || !verifyPopup) {
    return;
  }

  verifyStepSend.classList.toggle("active", step === VERIFY_MODAL_STEP.SEND);
  verifyStepCode.classList.toggle("active", step === VERIFY_MODAL_STEP.CODE);
  verifyPopup.dataset.step = step;
}

function setVerifyModalContent(mode, step) {
  if (!verifyTitle || !verifyDescription) {
    return;
  }

  const isLoginMode = mode === VERIFY_MODAL_MODE.LOGIN;
  verifyTitle.textContent = isLoginMode
    ? authText("auth.verifyEmailToContinue", {}, "Verify Email to Continue")
    : authText("auth.verifyEmail", {}, "Verify Email");

  if (step === VERIFY_MODAL_STEP.SEND) {
    verifyDescription.textContent =
      authText(
        "auth.verifySendPrompt",
        {},
        "Your account is not verified yet. Click Send Code to receive a 6-digit code",
      );
    return;
  }

  verifyDescription.textContent = authText(
    "auth.verifyEmailDescription",
    {},
    "Enter the 6-digit code sent to your email",
  );
}

function openVerifyModal({
  email,
  mode = VERIFY_MODAL_MODE.SIGNUP,
  step = VERIFY_MODAL_STEP.CODE,
} = {}) {
  if (!verifyPopup) {
    return;
  }

  verifyPopup.dataset.email = email || "";
  verifyPopup.dataset.mode = mode;
  verifyPopup.style.display = "flex";

  setVerifyModalContent(mode, step);
  setVerifyModalStep(step);

  if (step === VERIFY_MODAL_STEP.CODE) {
    resetCodeInputs();
  } else {
    resetCodeInputs(false);
  }
}

function closeVerifyModal() {
  if (!verifyPopup) {
    return;
  }

  verifyPopup.style.display = "none";
  verifyPopup.dataset.email = "";
  verifyPopup.dataset.mode = "";
  verifyPopup.dataset.step = "";
  resetCodeInputs(false);
  clearPendingAutoLogin();
}

function setForgotPasswordModalStep(step) {
  if (
    !forgotPasswordPopup ||
    !forgotStepEmail ||
    !forgotStepCode ||
    !forgotStepReset
  ) {
    return;
  }

  forgotStepEmail.classList.toggle("active", step === FORGOT_MODAL_STEP.EMAIL);
  forgotStepCode.classList.toggle("active", step === FORGOT_MODAL_STEP.CODE);
  forgotStepReset.classList.toggle("active", step === FORGOT_MODAL_STEP.RESET);
  forgotPasswordPopup.dataset.step = step;

  if (!forgotPasswordDescription || !forgotPasswordTitle) {
    return;
  }

  forgotPasswordTitle.textContent = authText(
    "auth.forgotPasswordTitle",
    {},
    "Forgot Password",
  );

  if (step === FORGOT_MODAL_STEP.EMAIL) {
    forgotPasswordDescription.textContent =
      authText(
        "auth.forgotPasswordDescription",
        {},
        "Enter your account email to receive a 6-digit reset code",
      );
    return;
  }

  if (step === FORGOT_MODAL_STEP.CODE) {
    forgotPasswordDescription.textContent =
      authText(
        "auth.verifyEmailDescription",
        {},
        "Enter the 6-digit code sent to your email",
      );
    return;
  }

  forgotPasswordDescription.textContent =
    authText(
      "auth.forgotPasswordResetPrompt",
      {},
      "Create a new password for your account",
    );
}

function focusFirstForgotCodeInput() {
  if (!forgotCodeInputs || forgotCodeInputs.length === 0) {
    return;
  }

  forgotCodeInputs[0].focus();
}

function resetForgotCodeInputs(shouldFocus = false) {
  if (!forgotCodeInputs || forgotCodeInputs.length === 0) {
    return;
  }

  forgotCodeInputs.forEach((input) => {
    input.value = "";
  });

  if (shouldFocus) {
    focusFirstForgotCodeInput();
  }
}

function getForgotCode() {
  if (!forgotCodeInputs || forgotCodeInputs.length === 0) {
    return "";
  }

  return Array.from(forgotCodeInputs)
    .map((input) => input.value)
    .join("");
}

function openForgotPasswordModal(initialEmail = "") {
  if (!forgotPasswordPopup) {
    return;
  }

  forgotVerifiedCode = "";
  forgotPasswordPopup.style.display = "flex";
  forgotPasswordPopup.dataset.email = (initialEmail || "").trim();
  setForgotPasswordModalStep(FORGOT_MODAL_STEP.EMAIL);
  resetForgotCodeInputs(false);

  if (forgotEmailInput) {
    forgotEmailInput.value = (initialEmail || "").trim();
    syncFloatingFieldState(forgotEmailInput);
    forgotEmailInput.focus();
  }

  if (forgotNewPasswordInput) {
    forgotNewPasswordInput.value = "";
    syncFloatingFieldState(forgotNewPasswordInput);
  }

  if (forgotConfirmPasswordInput) {
    forgotConfirmPasswordInput.value = "";
    syncFloatingFieldState(forgotConfirmPasswordInput);
  }
}

function closeForgotPasswordModal() {
  if (!forgotPasswordPopup) {
    return;
  }

  forgotVerifiedCode = "";
  forgotPasswordPopup.style.display = "none";
  forgotPasswordPopup.dataset.email = "";
  forgotPasswordPopup.dataset.step = "";
  resetForgotCodeInputs(false);

  if (forgotEmailInput) {
    forgotEmailInput.value = "";
    syncFloatingFieldState(forgotEmailInput);
  }

  if (forgotNewPasswordInput) {
    forgotNewPasswordInput.value = "";
    syncFloatingFieldState(forgotNewPasswordInput);
  }

  if (forgotConfirmPasswordInput) {
    forgotConfirmPasswordInput.value = "";
    syncFloatingFieldState(forgotConfirmPasswordInput);
  }
}

function openExternalProfileModal(profile, provider, credential) {
  if (!externalProfilePopup) {
    return;
  }

  const normalizedEmail = (profile?.email || "").trim();
  const suggestedUsername = (profile?.suggestedUsername || "").trim();
  const suggestedFullName = (profile?.suggestedFullName || "").trim();

  pendingExternalProfileContext = {
    provider,
    credential,
    email: normalizedEmail,
    avatarUrl: profile?.avatarUrl || null,
  };

  externalProfilePopup.style.display = "flex";

  if (externalProfileEmailInput) {
    externalProfileEmailInput.value = normalizedEmail;
    syncFloatingFieldState(externalProfileEmailInput);
  }

  if (externalProfileUsernameInput) {
    externalProfileUsernameInput.value = suggestedUsername;
    externalProfileUsernameInput.setAttribute(
      "minlength",
      String(REGISTER_USERNAME_MIN_LENGTH),
    );
    externalProfileUsernameInput.setAttribute(
      "maxlength",
      String(REGISTER_USERNAME_MAX_LENGTH),
    );
    syncFloatingFieldState(externalProfileUsernameInput);
  }

  if (externalProfileFullnameInput) {
    externalProfileFullnameInput.value = suggestedFullName;
    externalProfileFullnameInput.setAttribute(
      "minlength",
      String(REGISTER_FULLNAME_MIN_LENGTH),
    );
    externalProfileFullnameInput.setAttribute(
      "maxlength",
      String(REGISTER_FULLNAME_MAX_LENGTH),
    );
    syncFloatingFieldState(externalProfileFullnameInput);
  }

  if (externalProfileUsernameInput) {
    externalProfileUsernameInput.focus();
    externalProfileUsernameInput.select();
  }
}

function closeExternalProfileModal() {
  if (!externalProfilePopup) {
    return;
  }

  externalProfilePopup.style.display = "none";
  pendingExternalProfileContext = null;

  if (externalProfileEmailInput) {
    externalProfileEmailInput.value = "";
    syncFloatingFieldState(externalProfileEmailInput);
  }

  if (externalProfileUsernameInput) {
    externalProfileUsernameInput.value = "";
    syncFloatingFieldState(externalProfileUsernameInput);
  }

  if (externalProfileFullnameInput) {
    externalProfileFullnameInput.value = "";
    syncFloatingFieldState(externalProfileFullnameInput);
  }
}

async function completeExternalProfile() {
  const provider = pendingExternalProfileContext?.provider;
  const credential = pendingExternalProfileContext?.credential;
  const username = (externalProfileUsernameInput?.value || "").trim();
  const fullName = (externalProfileFullnameInput?.value || "").trim();

  if (!provider || !credential) {
    showAuthInfoKey("auth.externalSignInExpired", "error");
    closeExternalProfileModal();
    return false;
  }

  if (
    username.length < REGISTER_USERNAME_MIN_LENGTH ||
    username.length > REGISTER_USERNAME_MAX_LENGTH
  ) {
    showToast(
      authText(
        "auth.usernameLength",
        {
          min: REGISTER_USERNAME_MIN_LENGTH,
          max: REGISTER_USERNAME_MAX_LENGTH,
        },
        `Username must be between ${REGISTER_USERNAME_MIN_LENGTH} and ${REGISTER_USERNAME_MAX_LENGTH} characters.`,
      ),
      "error",
    );
    return false;
  }

  if (!USERNAME_REGEX.test(username)) {
    showToast(
      authText(
        "auth.usernameCharactersOnly",
        {},
        "Username can only include letters, numbers, underscore (_), without spaces or accents",
      ),
      "error",
    );
    return false;
  }

  if (
    fullName.length < REGISTER_FULLNAME_MIN_LENGTH ||
    fullName.length > REGISTER_FULLNAME_MAX_LENGTH
  ) {
    showToast(
      authText(
        "auth.fullNameLength",
        {
          min: REGISTER_FULLNAME_MIN_LENGTH,
          max: REGISTER_FULLNAME_MAX_LENGTH,
        },
        `Full name must be between ${REGISTER_FULLNAME_MIN_LENGTH} and ${REGISTER_FULLNAME_MAX_LENGTH} characters.`,
      ),
      "error",
    );
    return false;
  }

  try {
    const res = await API.Auth.completeExternalProfile(
      provider,
      credential,
      username,
      fullName,
    );
    const data = await res.json();

    if (!res.ok) {
      showAuthError(
        "complete-profile",
        res.status,
        data?.message || data?.Message,
        "errors.auth.completeProfile",
      );
      return false;
    }

    closeExternalProfileModal();
    await handleAuthenticatedRedirect(
      data,
      authText("auth.googleSuccess", {}, "Google sign-in successful"),
    );
    return true;
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

async function sendForgotPasswordCode({ switchToCode = true } = {}) {
  const email = (forgotEmailInput?.value || "").trim();
  if (!email) {
    showAuthInfoKey("auth.emailRequired", "error");
    return false;
  }

  try {
    const res = await API.Auth.forgotPasswordSendCode(email);
    const data = await res.json();

    if (!res.ok) {
      showAuthError(
        "forgot-password",
        res.status,
        data?.message || data?.Message,
        "errors.auth.forgotPassword",
      );
      return false;
    }

    forgotPasswordPopup.dataset.email = email;
    showAuthInfoKey("auth.resetCodeSent", "success");

    if (switchToCode) {
      setForgotPasswordModalStep(FORGOT_MODAL_STEP.CODE);
      resetForgotCodeInputs(true);
    }

    return true;
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

async function verifyForgotPasswordCode() {
  const email = (
    forgotPasswordPopup?.dataset.email ||
    forgotEmailInput?.value ||
    ""
  ).trim();
  const code = getForgotCode();

  if (!email) {
    showAuthInfoKey("auth.emailRequired", "error");
    return false;
  }

  if (code.length !== 6) {
    showAuthInfoKey("auth.enterSixDigitCode", "error");
    return false;
  }

  try {
    const res = await API.Auth.forgotPasswordVerifyCode(email, code);
    const data = await res.json();

    if (!res.ok) {
      showAuthError("verify", res.status, data?.message || data?.Message, "errors.auth.verify");
      resetForgotCodeInputs(true);
      return false;
    }

    forgotVerifiedCode = code;
    setForgotPasswordModalStep(FORGOT_MODAL_STEP.RESET);
    if (forgotNewPasswordInput) {
      forgotNewPasswordInput.focus();
    }

    return true;
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

async function resetForgottenPassword() {
  const email = (
    forgotPasswordPopup?.dataset.email ||
    forgotEmailInput?.value ||
    ""
  ).trim();
  const code = forgotVerifiedCode || getForgotCode();
  const newPassword = forgotNewPasswordInput?.value || "";
  const confirmPassword = forgotConfirmPasswordInput?.value || "";

  if (!email) {
    showAuthInfoKey("auth.emailRequired", "error");
    return false;
  }

  if (!code || code.length !== 6) {
    showAuthInfoKey("auth.verifyResetCodeFirst", "error");
    setForgotPasswordModalStep(FORGOT_MODAL_STEP.CODE);
    resetForgotCodeInputs(true);
    return false;
  }

  const passwordPolicyError = getPasswordPolicyError(newPassword);
  if (passwordPolicyError) {
    showToast(passwordPolicyError, "error");
    return false;
  }

  if (newPassword !== confirmPassword) {
    showAuthInfoKey("auth.passwordMismatch", "error");
    return false;
  }

  try {
    const res = await API.Auth.forgotPasswordReset(
      email,
      code,
      newPassword,
      confirmPassword,
    );
    const data = await res.json();

    if (!res.ok) {
      showAuthError(
        "forgot-password",
        res.status,
        data?.message || data?.Message,
        "errors.auth.forgotPassword",
      );
      return false;
    }

    fillLoginCredentials(email, newPassword);
    closeForgotPasswordModal();
    showAuthInfoKey("auth.passwordResetSuccess", "success");
    container.classList.remove("right-panel-active");
    return true;
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

async function sendVerificationCode(email, { switchToCode = true } = {}) {
  if (!email) {
    showAuthInfoKey("auth.emailNotFound", "error");
    return false;
  }

  try {
    const res = await API.Auth.sendEmail(email);
    const data = await res.json();

    if (!res.ok) {
      showAuthError("verify", res.status, data?.message || data?.Message, "errors.auth.verify");
      return false;
    }

    showAuthInfoKey("auth.verificationEmailSent", "success");

    if (switchToCode) {
      const mode = verifyPopup?.dataset.mode || VERIFY_MODAL_MODE.SIGNUP;
      setVerifyModalContent(mode, VERIFY_MODAL_STEP.CODE);
      setVerifyModalStep(VERIFY_MODAL_STEP.CODE);
      resetCodeInputs();
    }

    return true;
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

async function loginAfterEmailVerification() {
  if (!pendingAutoLogin?.email || !pendingAutoLogin?.password) {
    return false;
  }

  try {
    const res = await API.Auth.login(
      pendingAutoLogin.email,
      pendingAutoLogin.password,
    );
    const data = await res.json();

    if (!res.ok) {
      showAuthError("login", res.status, data?.message || data?.Message, "errors.auth.login");
      return false;
    }

    return await handleAuthenticatedRedirect(
      data,
      authText(
        "auth.emailVerifiedLoginSuccess",
        {},
        "Signed in successfully after email verification",
      ),
    );
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    return false;
  }
}

// === LOGIN FORM ===
const loginForm = document.querySelector(".sign-in-container form");
const signInSubmitBtn = loginForm?.querySelector(
  "button[type='submit'], button",
);

if (loginPasswordInput) {
  loginPasswordInput.addEventListener("input", () => {
    loginPasswordInput.dataset.isPrefilled = "false";

    if (prefilledPasswordClearTimer) {
      clearTimeout(prefilledPasswordClearTimer);
      prefilledPasswordClearTimer = null;
    }
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!signInSubmitBtn || signInSubmitBtn.disabled) {
    return;
  }

  // bật loading thủ công thay vì dùng runWithPendingButton để giữ loading xuyên suốt khi redirect
  const defaultHtml =
    signInSubmitBtn.dataset.defaultHtml || signInSubmitBtn.innerHTML;
  signInSubmitBtn.dataset.defaultHtml = defaultHtml;
  signInSubmitBtn.disabled = true;
  signInSubmitBtn.classList.add("is-loading");
  signInSubmitBtn.setAttribute("aria-busy", "true");
  signInSubmitBtn.innerHTML = `<span>${authText("auth.signingIn", {}, "Signing in...")}</span><span class="spinner spinner-tiny auth-btn-spinner" aria-hidden="true"></span>`;

  function resetSignInButton() {
    signInSubmitBtn.disabled = false;
    signInSubmitBtn.classList.remove("is-loading");
    signInSubmitBtn.removeAttribute("aria-busy");
    signInSubmitBtn.innerHTML =
      signInSubmitBtn.dataset.defaultHtml || defaultHtml;
  }

  const email = (loginEmailInput?.value || "").trim();
  const password = (loginPasswordInput?.value || "").trim();

  if (!email) {
    showAuthInfoKey("auth.emailRequired", "error");
    resetSignInButton();
    return;
  }
  if (!password) {
    showAuthInfoKey("auth.passwordRequired", "error");
    resetSignInButton();
    return;
  }

  try {
    if (prefilledPasswordClearTimer) {
      clearTimeout(prefilledPasswordClearTimer);
      prefilledPasswordClearTimer = null;
    }

    const res = await API.Auth.login(email, password);
    const data = await res.json();

    if (!res.ok) {
      showAuthError("login", res.status, data?.message || data?.Message, "errors.auth.login");
      if (isEmailNotVerifiedResponse(res, data)) {
        setPendingAutoLogin(email, password);
        openVerifyModal({
          email,
          mode: VERIFY_MODAL_MODE.LOGIN,
          step: VERIFY_MODAL_STEP.SEND,
        });
      }
      resetSignInButton();
      return;
    }

    if (data.status === 5) {
      showAuthInfoKey("auth.emailNotVerifiedLogin", "error");
      setPendingAutoLogin(email, password);
      openVerifyModal({
        email,
        mode: VERIFY_MODAL_MODE.LOGIN,
        step: VERIFY_MODAL_STEP.SEND,
      });
      resetSignInButton();
      return;
    }

    const redirected = await handleAuthenticatedRedirect(
      data,
      authText("auth.loginSuccess", {}, "Signed in successfully"),
    );

    if (!redirected) {
      resetSignInButton();
    }
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
    resetSignInButton();
  }
});

if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", (e) => {
    if (googleLoginBtn.classList.contains("google-ready")) {
      return;
    }

    e.preventDefault();
    startGoogleSignInPrecheck();
  });
}

function bindComingSoonSocialButton(button) {
  if (!button) {
    return;
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthInfoKey("auth.socialFeatureComingSoon");
  });
}

bindComingSoonSocialButton(facebookLoginBtn);
bindComingSoonSocialButton(tiktokLoginBtn);

if (String(appConfig.GOOGLE_CLIENT_ID || "").trim()) {
  const googleInitRetry = setInterval(() => {
    if (ensureGoogleIdentityInitialized()) {
      clearInterval(googleInitRetry);
    }
  }, 500);

  setTimeout(() => {
    clearInterval(googleInitRetry);
  }, 20000);

  // Keep ready-state synced in case Google render target appears a bit later.
  const googleReadySyncInterval = setInterval(() => {
    if (!isGoogleIdentityInitialized) {
      return;
    }

    const ready = syncGoogleReadyClass();
    if (ready) {
      clearInterval(googleReadySyncInterval);
    }
  }, 300);

  setTimeout(() => {
    clearInterval(googleReadySyncInterval);
  }, 20000);
}

//=== Signup form submit===
const signupForm = document.querySelector(".sign-up-container form");
const signupSubmitBtn = signupForm?.querySelector(
  "button[type='submit'], button",
);
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await runWithPendingButton(
    signupSubmitBtn,
    authText("auth.signingUp", {}, "Signing up..."),
    async () => {
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const fullname = document.getElementById("signup-fullname").value.trim();
    const password = document.getElementById("signup-password").value;
    const cfpassword = document.getElementById("cf-password").value;

    if (!username || !email || !fullname || !password || !cfpassword) {
      showAuthInfoKey("auth.fillAllFields", "error");
      return;
    }

    if (
      username.length < REGISTER_USERNAME_MIN_LENGTH ||
      username.length > REGISTER_USERNAME_MAX_LENGTH
    ) {
      showToast(
        authText(
          "auth.usernameLength",
          {
            min: REGISTER_USERNAME_MIN_LENGTH,
            max: REGISTER_USERNAME_MAX_LENGTH,
          },
          `Username must be between ${REGISTER_USERNAME_MIN_LENGTH} and ${REGISTER_USERNAME_MAX_LENGTH} characters`,
        ),
        "error",
      );
      return;
    }

    if (!USERNAME_REGEX.test(username)) {
      showToast(
        authText(
          "auth.usernameCharactersOnly",
          {},
          "Username can only include letters, numbers, underscore (_), without spaces or accents",
        ),
        "error",
      );
      return;
    }

    if (
      fullname.length < REGISTER_FULLNAME_MIN_LENGTH ||
      fullname.length > REGISTER_FULLNAME_MAX_LENGTH
    ) {
      showToast(
        authText(
          "auth.fullNameLength",
          {
            min: REGISTER_FULLNAME_MIN_LENGTH,
            max: REGISTER_FULLNAME_MAX_LENGTH,
          },
          `Full name must be between ${REGISTER_FULLNAME_MIN_LENGTH} and ${REGISTER_FULLNAME_MAX_LENGTH} characters`,
        ),
        "error",
      );
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      showToast(passwordPolicyError, "error");
      return;
    }

    if (password !== cfpassword) {
      showAuthInfoKey("auth.passwordMismatch", "error");
      return;
    }

    try {
      const res = await API.Auth.register({
        username,
        email,
        fullname,
        password,
      });
      const data = await res.json();

      if (!res.ok) {
        showAuthError("signup", res.status, data?.message || data?.Message, "errors.auth.signup");
        return;
      }

      showAuthInfoKey("auth.signUpSuccess", "success");
      const sent = await sendVerificationCode(email, { switchToCode: false });
      if (!sent) {
        return;
      }

      setPendingAutoLogin(email, password);
      openVerifyModal({
        email,
        mode: VERIFY_MODAL_MODE.SIGNUP,
        step: VERIFY_MODAL_STEP.CODE,
      });
    } catch (err) {
      console.error(err);
      showAuthInfoKey("errors.generic", "error");
    }
    },
  );
});
//=== Verify code form ===
verifyBtn.addEventListener("click", async () => {
  const code = Array.from(document.querySelectorAll(".code-input"))
    .map((input) => input.value)
    .join("");
  const email = verifyPopup?.dataset.email;

  if (!email) {
    showAuthInfoKey("auth.emailNotFound", "error");
    return;
  }

  if (code.length !== 6) {
    showAuthInfoKey("auth.enterSixDigitCode", "error");
    return;
  }

  try {
    const res = await API.Auth.verifyCode(email, code);

    const data = await res.json();

    if (!res.ok) {
      showAuthError("verify", res.status, data?.message || data?.Message, "errors.auth.verify");
      resetCodeInputs();
      return;
    }

    const autoLoggedIn = await loginAfterEmailVerification();
    closeVerifyModal();

    if (!autoLoggedIn) {
      showAuthInfoKey("auth.emailVerified", "success");
      // Chuyển sang login nếu không auto-login được
      container.classList.remove("right-panel-active");
    }
  } catch (err) {
    console.error(err);
    showAuthInfoKey("errors.generic", "error");
  }
});
// Close popup when X is clicked
document
  .querySelector("#verify-popup .close-popup")
  .addEventListener("click", () => {
    closeVerifyModal();
  });

// Auto move focus in verify code inputs
codeInputs.forEach((input, idx) => {
  input.addEventListener("input", (e) => {
    const value = e.target.value;
    if (value.length > 0 && idx < codeInputs.length - 1) {
      // Nếu nhập xong 1 ký tự, focus sang ô tiếp theo
      codeInputs[idx + 1].focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && idx > 0) {
      // Nếu backspace và ô trống, quay về ô trước
      codeInputs[idx - 1].focus();
    }
  });

  // Tự động chỉ cho phép số (0-9)
  input.addEventListener("keypress", (e) => {
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });
});

// Khi popup hiện, focus ô đầu tiên của bước nhập code
if (popupContent) {
  popupContent.addEventListener(
    "animationend",
    (e) => {
      if (
        e.animationName === "slideUp" &&
        verifyPopup &&
        verifyPopup.style.display === "flex" &&
        verifyPopup.dataset.step === VERIFY_MODAL_STEP.CODE
      ) {
        focusFirstCodeInput();
      }
    },
    { passive: true },
  );
}

//=== send/resend code ===
sendCodeBtn.addEventListener("click", async () => {
  await runWithPendingButton(
    sendCodeBtn,
    authText("auth.sending", {}, "Sending..."),
    async () => {
      const email = verifyPopup?.dataset.email;
      return sendVerificationCode(email, { switchToCode: true });
    },
  );
});

resendBtn.addEventListener("click", async () => {
  await runWithPendingButton(
    resendBtn,
    authText("auth.resending", {}, "Resending..."),
    async () => {
      const email = verifyPopup?.dataset.email;
      return sendVerificationCode(email, { switchToCode: false });
    },
  );
});

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    const loginEmail = (
      document.getElementById("login-email")?.value || ""
    ).trim();
    openForgotPasswordModal(loginEmail);
  });
}

if (forgotSendCodeBtn) {
  forgotSendCodeBtn.addEventListener("click", async () => {
    await runWithPendingButton(
      forgotSendCodeBtn,
      authText("auth.sending", {}, "Sending..."),
      () => sendForgotPasswordCode({ switchToCode: true }),
    );
  });
}

if (forgotEmailInput) {
  forgotEmailInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await runWithPendingButton(
        forgotSendCodeBtn,
        authText("auth.sending", {}, "Sending..."),
        () => sendForgotPasswordCode({ switchToCode: true }),
      );
    }
  });
}

if (forgotResendCodeBtn) {
  forgotResendCodeBtn.addEventListener("click", async () => {
    await runWithPendingButton(
      forgotResendCodeBtn,
      authText("auth.resending", {}, "Resending..."),
      () => sendForgotPasswordCode({ switchToCode: false }),
    );
  });
}

if (forgotVerifyCodeBtn) {
  forgotVerifyCodeBtn.addEventListener("click", async () => {
    await verifyForgotPasswordCode();
  });
}

if (forgotResetPasswordBtn) {
  forgotResetPasswordBtn.addEventListener("click", async () => {
    await resetForgottenPassword();
  });
}

if (forgotConfirmPasswordInput) {
  forgotConfirmPasswordInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await resetForgottenPassword();
    }
  });
}

const closeForgotPasswordButton = document.querySelector(
  "#forgot-password-popup .close-forgot-popup",
);
if (closeForgotPasswordButton) {
  closeForgotPasswordButton.addEventListener("click", () => {
    closeForgotPasswordModal();
  });
}

if (forgotPasswordPopup) {
  forgotPasswordPopup.addEventListener("click", (e) => {
    if (e.target === forgotPasswordPopup) {
      closeForgotPasswordModal();
    }
  });
}

if (externalProfileSubmitBtn) {
  externalProfileSubmitBtn.addEventListener("click", async () => {
    await runWithPendingButton(
      externalProfileSubmitBtn,
      authText("auth.completing", {}, "Completing..."),
      () => completeExternalProfile(),
    );
  });
}

if (externalProfileFullnameInput) {
  externalProfileFullnameInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await runWithPendingButton(
        externalProfileSubmitBtn,
        authText("auth.completing", {}, "Completing..."),
        () => completeExternalProfile(),
      );
    }
  });
}

if (closeExternalProfileBtn) {
  closeExternalProfileBtn.addEventListener("click", () => {
    closeExternalProfileModal();
  });
}

forgotCodeInputs.forEach((input, idx) => {
  input.addEventListener("input", (e) => {
    const value = e.target.value;
    if (value.length > 0 && idx < forgotCodeInputs.length - 1) {
      forgotCodeInputs[idx + 1].focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && idx > 0) {
      forgotCodeInputs[idx - 1].focus();
    }
  });

  input.addEventListener("keypress", (e) => {
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });
});
