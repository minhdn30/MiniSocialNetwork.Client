const API_BASE = "http://localhost:5000/api";

// Lấy các element cần thiết
const container = document.querySelector(".container");
const toggleBtn = document.getElementById("toggle-btn");
const leftPanel = document.querySelector(".left-panel");
const rightPanel = document.querySelector(".right-panel");
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const formTitle = document.getElementById("form-title");

const leftH1 = document.querySelector(".left-panel h1");
const leftP = document.querySelector(".left-panel p");

// Hàm cập nhật nội dung left-panel
function updateLeftPanelContent() {
  if (container.classList.contains("show-register")) {
    leftH1.textContent = "Hello, Friend!";
    leftP.textContent =
      "Enter your personal details and start your journey with us";
  } else {
    leftH1.textContent = "Welcome Back!";
    leftP.textContent =
      "To keep connected with us please login with your personal info";
  }
}

// Hàm trượt sang register dựa trên width thực tế
function slideToRegister() {
  const leftWidth = leftPanel.offsetWidth;
  const rightWidth = rightPanel.offsetWidth;

  leftPanel.style.transform = `translateX(${rightWidth}px)`;
  rightPanel.style.transform = `translateX(-${leftWidth}px)`;
}

// Hàm trượt về login
function slideToLogin() {
  leftPanel.style.transform = "translateX(0)";
  rightPanel.style.transform = "translateX(0)";
}

// Hàm cập nhật text form title
function updateFormTitle() {
  if (container.classList.contains("show-register")) {
    formTitle.textContent = "Register";
  } else {
    formTitle.textContent = "Log In";
  }
}

// Khi bấm nút toggle (Sign Up / Log In)
toggleBtn.addEventListener("click", () => {
  container.classList.toggle("show-register");

  if (container.classList.contains("show-register")) {
    toggleBtn.textContent = "LOG IN";
    slideToRegister();
  } else {
    toggleBtn.textContent = "SIGN UP";
    slideToLogin();
  }

  updateFormTitle();
  updateLeftPanelContent();
});

// Nếu có nút riêng trong login form
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    container.classList.remove("show-register");
    toggleBtn.textContent = "SIGN UP";
    slideToLogin();
    updateFormTitle();
    updateLeftPanelContent();
  });
}

// Nếu có nút riêng trong register form
if (registerBtn) {
  registerBtn.addEventListener("click", () => {
    container.classList.add("show-register");
    toggleBtn.textContent = "LOG IN";
    slideToRegister();
    updateFormTitle();
    updateLeftPanelContent();
  });
}

// Responsive: nếu đang show register, cập nhật transform khi resize
window.addEventListener("resize", () => {
  if (container.classList.contains("show-register")) {
    slideToRegister();
  } else {
    slideToLogin();
  }
});
document.querySelectorAll(".toggle-eye").forEach((eye) => {
  eye.addEventListener("click", () => {
    const input = eye.previousElementSibling; // input nằm trước icon
    if (input.type === "password") {
      input.type = "text";
      eye.textContent = "🙈"; // icon khi show password
    } else {
      input.type = "password";
      eye.textContent = "👁"; // icon mặc định khi hide
    }
  });
});

// js/auth.js

// === Toast function ===
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show";
  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

// === Toast function ===
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show";
  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

// === Toast function ===
function showToast(message, type = "error") {
  const toast = document.getElementById("toast");
  toast.textContent = message;

  // Thêm class dựa vào type
  toast.className = `toast show ${type}`; // type = "error" hoặc "success"

  setTimeout(() => {
    toast.className = "toast"; // reset
  }, 3000);
}

// === LOGIN FORM ===
const loginForm = document.getElementById("login-form");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username-login").value.trim();
  const password = document.getElementById("password-login").value.trim();

  if (!username) {
    showToast("Username is required.", "error");
    return;
  }
  if (!password) {
    showToast("Password is required.", "error");
    return;
  }

  try {
    const res = await fetch("${API_BASE}/Auths/login-with-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Login failed.", "error");
      return;
    }

    localStorage.setItem("accessToken", data.token);
    showToast("Login success", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});

// === REGISTER FORM ===
const registerForm = document.getElementById("register-form");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username-regis").value.trim();
  const email = document.getElementById("email").value.trim();
  const fullname = document.getElementById("fullname").value.trim();
  const password = document.getElementById("password-regis").value;
  const cfpassword = document.getElementById("cfpassword").value.trim();

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
      "error"
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
    const res = await fetch("${API_BASE}/Auths/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, fullname, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Sign up failed.", "error");
      return;
    }

    showToast("Đăng ký thành công! Bạn có thể đăng nhập ngay.", "success");
    registerForm.reset();
  } catch (err) {
    console.error(err);
    showToast("Server error. Please try again later.", "error");
  }
});
