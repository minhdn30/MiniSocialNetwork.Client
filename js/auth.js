const API_BASE = "http://localhost:5000/api";

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

// === LOGIN FORM ===
const loginForm = document.querySelector(".sign-in-container form");
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!username) {
    showToast("Username is required.", "error");
    return;
  }
  if (!password) {
    showToast("Password is required.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/Auths/login-with-username`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Login failed", "error");
      return;
    }
    localStorage.removeItem("accessToken");
    // Lưu token + thông tin
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("fullname", data.fullname || "");
    localStorage.setItem("avatarUrl", data.avatarUrl || "");
    localStorage.setItem("accountId", data.accountId || "");

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
  if (username.length < 6) {
    showToast("Username  must be at least 6 characters long.", "error");
    return;
  }
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    showToast(
      "Username cannot contain accents or special characters.",
      "error",
    );
    return;
  }
  if (password.length < 6) {
    showToast("Password must be at least 6 characters long.", "error");
    return;
  }
  const vietCharRegex =
    /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰ]/i;

  if (password.includes(" ") || vietCharRegex.test(password)) {
    showToast("Password cannot contain Vietnamese accents or spaces.", "error");
    return;
  }
  if (password !== cfpassword) {
    showToast("Password and Confirm Password do not match.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/Auths/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, fullname, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Sign up failed", "error");
      return;
    }

    showToast("Registration successful!", "success");
    const emailRes = await fetch(`${API_BASE}/Auths/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(email),
    });

    if (!emailRes.ok) {
      showToast("Failed to send verification email.", "error");
      return;
    }

    showToast("Verification email sent! Please check your inbox.", "success");
    // Hiển popup verify
    const verifyPopup = document.getElementById("verify-popup");
    verifyPopup.style.display = "flex";

    setTimeout(() => {
      const first = document.querySelector(".code-input");
      if (first) first.focus();
    }, 200);
    // Lưu email để gửi verify
    verifyPopup.dataset.email = email;
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});
//=== Verify code form ===
document.getElementById("verify-btn").addEventListener("click", async () => {
  const code = Array.from(document.querySelectorAll(".code-input"))
    .map((input) => input.value)
    .join("");
  const email = document.getElementById("verify-popup").dataset.email;

  if (code.length !== 6) {
    showToast("Please enter 6-digit code", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/Auths/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Verification failed", "error");
      resetCodeInputs();
      return;
    }

    showToast("Email verified successfully!", "success");
    document.getElementById("verify-popup").style.display = "none";

    // Chuyển sang login
    container.classList.remove("right-panel-active");
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});
// Close popup when X is clicked
document
  .querySelector("#verify-popup .close-popup")
  .addEventListener("click", () => {
    document.getElementById("verify-popup").style.display = "none";
  });

// Auto move focus in verify code inputs
const codeInputs = document.querySelectorAll(".code-input");

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

// Khi popup hiện, focus ô đầu tiên
const verifyPopup = document.getElementById("verify-popup");
const popupContent = document.querySelector(
  "#verify-popup .verify-popup-content",
);
if (popupContent) {
  popupContent.addEventListener(
    "animationend",
    (e) => {
      if (
        e.animationName === "slideUp" &&
        verifyPopup &&
        verifyPopup.style.display === "flex"
      ) {
        const first = document.querySelector(".code-input");
        if (first) first.focus();
      }
    },
    { passive: true },
  );
}
//reset code inputs
function resetCodeInputs() {
  codeInputs.forEach((input) => (input.value = ""));
  codeInputs[0].focus();
}

//===resend code===
const resendBtn = document.getElementById("resend-btn");

resendBtn.addEventListener("click", async () => {
  const verifyPopup = document.getElementById("verify-popup");
  const email = verifyPopup.dataset.email;

  if (!email) {
    showToast("Email not found.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/Auths/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `"${email}"`, // giữ dạng string cho ASP.NET Core FromBody string
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Failed to resend code.", "error");
      return;
    }

    showToast("Verification email sent!", "success");
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});
