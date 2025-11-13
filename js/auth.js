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
