

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

const signupRuleUsernameLength = document.getElementById("signup-rule-username-length");
const signupRuleFullnameLength = document.getElementById("signup-rule-fullname-length");
const signupRulePasswordMinLength = document.getElementById("signup-rule-password-min-length");

if (signupRuleUsernameLength) {
  signupRuleUsernameLength.textContent = `${REGISTER_USERNAME_MIN_LENGTH}-${REGISTER_USERNAME_MAX_LENGTH}`;
}

if (signupRuleFullnameLength) {
  signupRuleFullnameLength.textContent = `${REGISTER_FULLNAME_MIN_LENGTH}-${REGISTER_FULLNAME_MAX_LENGTH}`;
}

if (signupRulePasswordMinLength) {
  signupRulePasswordMinLength.textContent = String(REGISTER_PASSWORD_MIN_LENGTH);
}

const signupUsernameInput = document.getElementById("signup-username");
const signupFullnameInput = document.getElementById("signup-fullname");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");

if (signupUsernameInput) {
  signupUsernameInput.setAttribute("minlength", String(REGISTER_USERNAME_MIN_LENGTH));
  signupUsernameInput.setAttribute("maxlength", String(REGISTER_USERNAME_MAX_LENGTH));
}

if (signupFullnameInput) {
  signupFullnameInput.setAttribute("minlength", String(REGISTER_FULLNAME_MIN_LENGTH));
  signupFullnameInput.setAttribute("maxlength", String(REGISTER_FULLNAME_MAX_LENGTH));
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
const forgotPasswordDescription = document.getElementById("forgot-password-description");
const forgotStepEmail = document.getElementById("forgot-step-email");
const forgotStepCode = document.getElementById("forgot-step-code");
const forgotStepReset = document.getElementById("forgot-step-reset");
const forgotEmailInput = document.getElementById("forgot-email");
const forgotSendCodeBtn = document.getElementById("forgot-send-code-btn");
const forgotVerifyCodeBtn = document.getElementById("forgot-verify-code-btn");
const forgotResendCodeBtn = document.getElementById("forgot-resend-code-btn");
const forgotResetPasswordBtn = document.getElementById("forgot-reset-password-btn");
const forgotNewPasswordInput = document.getElementById("forgot-new-password");
const forgotConfirmPasswordInput = document.getElementById("forgot-confirm-password");
const forgotCodeInputs = forgotPasswordPopup
  ? forgotPasswordPopup.querySelectorAll(".forgot-code-input")
  : [];

const FORGOT_MODAL_STEP = {
  EMAIL: "email",
  CODE: "code",
  RESET: "reset",
};

let forgotVerifiedCode = "";
let prefilledPasswordClearTimer = null;

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
    return "Password is required.";
  }

  if (password.length < REGISTER_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${REGISTER_PASSWORD_MIN_LENGTH} characters long.`;
  }

  if (password.includes(" ") || PASSWORD_ACCENT_REGEX.test(password)) {
    return "Password cannot contain Vietnamese accents or spaces.";
  }

  return null;
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

  const defaultText = button.dataset.defaultText || button.textContent || "";
  button.dataset.defaultText = defaultText;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  button.textContent = pendingText;

  try {
    return await action();
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    button.textContent = button.dataset.defaultText || defaultText;
  }
}

function persistSessionFromLoginResponse(data) {
  if (window.AuthStore && typeof window.AuthStore.clearAccessToken === "function") {
    window.AuthStore.clearAccessToken("login-reset");
  }

  if (window.AuthStore && typeof window.AuthStore.setAccessToken === "function") {
    window.AuthStore.setAccessToken(data.accessToken, "login");
  }

  localStorage.setItem("fullname", data.fullname || "");
  localStorage.setItem("username", data.username || "");
  localStorage.setItem("avatarUrl", data.avatarUrl || "");
  localStorage.setItem("accountId", data.accountId || "");
  localStorage.setItem("defaultPostPrivacy", data.defaultPostPrivacy ?? data.DefaultPostPrivacy ?? 0);
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
  verifyTitle.textContent = isLoginMode ? "Verify Email to Continue" : "Verify Email";

  if (step === VERIFY_MODAL_STEP.SEND) {
    verifyDescription.textContent =
      "Your account is not verified yet. Click Send Code to receive a 6-digit code.";
    return;
  }

  verifyDescription.textContent = "Enter the 6-digit code sent to your email";
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
  if (!forgotPasswordPopup || !forgotStepEmail || !forgotStepCode || !forgotStepReset) {
    return;
  }

  forgotStepEmail.classList.toggle("active", step === FORGOT_MODAL_STEP.EMAIL);
  forgotStepCode.classList.toggle("active", step === FORGOT_MODAL_STEP.CODE);
  forgotStepReset.classList.toggle("active", step === FORGOT_MODAL_STEP.RESET);
  forgotPasswordPopup.dataset.step = step;

  if (!forgotPasswordDescription || !forgotPasswordTitle) {
    return;
  }

  forgotPasswordTitle.textContent = "Forgot Password";

  if (step === FORGOT_MODAL_STEP.EMAIL) {
    forgotPasswordDescription.textContent =
      "Enter your account email to receive a 6-digit reset code.";
    return;
  }

  if (step === FORGOT_MODAL_STEP.CODE) {
    forgotPasswordDescription.textContent =
      "Enter the 6-digit code sent to your email.";
    return;
  }

  forgotPasswordDescription.textContent =
    "Create a new password for your account.";
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

async function sendForgotPasswordCode({ switchToCode = true } = {}) {
  const email = (forgotEmailInput?.value || "").trim();
  if (!email) {
    showToast("Email is required.", "error");
    return false;
  }

  try {
    const res = await API.Auth.forgotPasswordSendCode(email);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || data.Message || "Failed to send reset code.", "error");
      return false;
    }

    forgotPasswordPopup.dataset.email = email;
    showToast("If your email exists, a reset code has been sent.", "success");

    if (switchToCode) {
      setForgotPasswordModalStep(FORGOT_MODAL_STEP.CODE);
      resetForgotCodeInputs(true);
    }

    return true;
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
    return false;
  }
}

async function verifyForgotPasswordCode() {
  const email = (forgotPasswordPopup?.dataset.email || forgotEmailInput?.value || "").trim();
  const code = getForgotCode();

  if (!email) {
    showToast("Email is required.", "error");
    return false;
  }

  if (code.length !== 6) {
    showToast("Please enter 6-digit code", "error");
    return false;
  }

  try {
    const res = await API.Auth.forgotPasswordVerifyCode(email, code);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || data.Message || "Verification failed.", "error");
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
    showToast("Server error. Please try again later.", "error");
    return false;
  }
}

async function resetForgottenPassword() {
  const email = (forgotPasswordPopup?.dataset.email || forgotEmailInput?.value || "").trim();
  const code = forgotVerifiedCode || getForgotCode();
  const newPassword = forgotNewPasswordInput?.value || "";
  const confirmPassword = forgotConfirmPasswordInput?.value || "";

  if (!email) {
    showToast("Email is required.", "error");
    return false;
  }

  if (!code || code.length !== 6) {
    showToast("Please verify your reset code first.", "error");
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
    showToast("Password and Confirm Password do not match.", "error");
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
      showToast(data.message || data.Message || "Reset password failed.", "error");
      return false;
    }

    fillLoginCredentials(email, newPassword);
    closeForgotPasswordModal();
    showToast("Password reset successful. Please sign in again.", "success");
    container.classList.remove("right-panel-active");
    return true;
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
    return false;
  }
}

async function sendVerificationCode(email, { switchToCode = true } = {}) {
  if (!email) {
    showToast("Email not found.", "error");
    return false;
  }

  try {
    const res = await API.Auth.sendEmail(email);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || data.Message || "Failed to send code.", "error");
      return false;
    }

    showToast("Verification email sent! Please check your inbox.", "success");

    if (switchToCode) {
      const mode = verifyPopup?.dataset.mode || VERIFY_MODAL_MODE.SIGNUP;
      setVerifyModalContent(mode, VERIFY_MODAL_STEP.CODE);
      setVerifyModalStep(VERIFY_MODAL_STEP.CODE);
      resetCodeInputs();
    }

    return true;
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
    return false;
  }
}

async function loginAfterEmailVerification() {
  if (!pendingAutoLogin?.email || !pendingAutoLogin?.password) {
    return false;
  }

  try {
    const res = await API.Auth.login(pendingAutoLogin.email, pendingAutoLogin.password);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Email verified. Please sign in.", "error");
      return false;
    }

    persistSessionFromLoginResponse(data);

    if (data.status === 1) {
      showToast(
        `<div>
          <p style="margin-bottom: 8px;">Your account is currently Inactive. Please reactivate to continue.</p>
          <div class="toast-actions">
            <button class="toast-btn" onclick="window.reactivateAccountAction()">Reactivate Now</button>
            <button class="toast-btn secondary" onclick="window.location.href='auth.html'">Later</button>
          </div>
        </div>`,
        "error",
        0,
        true,
      );
      return false;
    }

    if (data.status === 5) {
      showToast("Email is not verified. Please request a new code.", "error");
      return false;
    }

    showToast("Email verified and login successful!", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 600);

    return true;
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
    return false;
  }
}

// === LOGIN FORM ===
const loginForm = document.querySelector(".sign-in-container form");

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

  const email = (loginEmailInput?.value || "").trim();
  const password = (loginPasswordInput?.value || "").trim();

  if (!email) {
    showToast("Email is required.", "error");
    return;
  }
  if (!password) {
    showToast("Password is required.", "error");
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
      showToast(data.message || "Login failed", "error");
      if (isEmailNotVerifiedResponse(res, data)) {
        setPendingAutoLogin(email, password);
        openVerifyModal({
          email,
          mode: VERIFY_MODAL_MODE.LOGIN,
          step: VERIFY_MODAL_STEP.SEND,
        });
      }
      return;
    }

    persistSessionFromLoginResponse(data);

    // Check Account Status
    if (data.status === 1) { // Inactive
      showToast(
        `<div>
          <p style="margin-bottom: 8px;">Your account is currently Inactive. Please reactivate to continue.</p>
          <div class="toast-actions">
            <button class="toast-btn" onclick="window.reactivateAccountAction()">Reactivate Now</button>
            <button class="toast-btn secondary" onclick="window.location.href='auth.html'">Later</button>
          </div>
        </div>`,
        "error",
        0, // Persistent
        true // HTML
      );
      return; // Stop here, don't redirect to index yet
    } 
    if (data.status === 5) { // EmailNotVerified
      showToast("Email is not verified. Please verify your email.", "error");
      setPendingAutoLogin(email, password);
      openVerifyModal({
        email,
        mode: VERIFY_MODAL_MODE.LOGIN,
        step: VERIFY_MODAL_STEP.SEND,
      });
      return;
    }

    showToast("Login successful!", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});

//=== Signup form submit===
const signupForm = document.querySelector(".sign-up-container form");
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const fullname = document.getElementById("signup-fullname").value.trim();
  const password = document.getElementById("signup-password").value;
  const cfpassword = document.getElementById("cf-password").value;

  if (!username || !email || !fullname || !password || !cfpassword) {
    showToast("Please fill in all fields completely.", "error");
    return;
  }

  if (
    username.length < REGISTER_USERNAME_MIN_LENGTH ||
    username.length > REGISTER_USERNAME_MAX_LENGTH
  ) {
    showToast(
      `Username must be between ${REGISTER_USERNAME_MIN_LENGTH} and ${REGISTER_USERNAME_MAX_LENGTH} characters.`,
      "error",
    );
    return;
  }

  const usernameRegex = /^[A-Za-z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    showToast(
      "Username can only include letters, numbers, underscore (_), without spaces or accents.",
      "error",
    );
    return;
  }

  if (
    fullname.length < REGISTER_FULLNAME_MIN_LENGTH ||
    fullname.length > REGISTER_FULLNAME_MAX_LENGTH
  ) {
    showToast(
      `Full name must be between ${REGISTER_FULLNAME_MIN_LENGTH} and ${REGISTER_FULLNAME_MAX_LENGTH} characters.`,
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
    showToast("Password and Confirm Password do not match.", "error");
    return;
  }

  try {
    const res = await API.Auth.register({ username, email, fullname, password });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || data.Message || "Sign up failed", "error");
      return;
    }

    showToast("Registration successful!", "success");
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
    showToast("Server error. Please try again later.", "error");
  }
});
//=== Verify code form ===
verifyBtn.addEventListener("click", async () => {
  const code = Array.from(document.querySelectorAll(".code-input"))
    .map((input) => input.value)
    .join("");
  const email = verifyPopup?.dataset.email;

  if (!email) {
    showToast("Email not found.", "error");
    return;
  }

  if (code.length !== 6) {
    showToast("Please enter 6-digit code", "error");
    return;
  }

  try {
    const res = await API.Auth.verifyCode(email, code);

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Verification failed", "error");
      resetCodeInputs();
      return;
    }

    const autoLoggedIn = await loginAfterEmailVerification();
    closeVerifyModal();

    if (!autoLoggedIn) {
      showToast("Email verified successfully!", "success");
      // Chuyển sang login nếu không auto-login được
      container.classList.remove("right-panel-active");
    }
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
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
  await runWithPendingButton(sendCodeBtn, "Sending...", async () => {
    const email = verifyPopup?.dataset.email;
    return sendVerificationCode(email, { switchToCode: true });
  });
});

resendBtn.addEventListener("click", async () => {
  await runWithPendingButton(resendBtn, "Resending...", async () => {
    const email = verifyPopup?.dataset.email;
    return sendVerificationCode(email, { switchToCode: false });
  });
});

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    const loginEmail = (document.getElementById("login-email")?.value || "").trim();
    openForgotPasswordModal(loginEmail);
  });
}

if (forgotSendCodeBtn) {
  forgotSendCodeBtn.addEventListener("click", async () => {
    await runWithPendingButton(forgotSendCodeBtn, "Sending...", () =>
      sendForgotPasswordCode({ switchToCode: true }),
    );
  });
}

if (forgotEmailInput) {
  forgotEmailInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await runWithPendingButton(forgotSendCodeBtn, "Sending...", () =>
        sendForgotPasswordCode({ switchToCode: true }),
      );
    }
  });
}

if (forgotResendCodeBtn) {
  forgotResendCodeBtn.addEventListener("click", async () => {
    await runWithPendingButton(forgotResendCodeBtn, "Resending...", () =>
      sendForgotPasswordCode({ switchToCode: false }),
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
