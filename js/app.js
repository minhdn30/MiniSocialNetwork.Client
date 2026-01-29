(function authGuard() {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    window.location.href = "auth.html";
  }
})();

const app = document.getElementById("app");

async function loadPage(page) {
  const res = await fetch(`pages/${page}.html`);
  app.innerHTML = await res.text();
  if (window.lucide) {
    lucide.createIcons();
  }
}

function router() {
  const path = window.location.pathname;

  switch (path) {
    case "/":
    case "/home":
      loadHome();
      break;
    case "/chat":
      loadPage("chat");
      break;
    case "/profile":
      loadPage("profile");
      break;
    default:
      loadHome();
  }
}

window.onpopstate = router;
router();

//logout
function logout() {
  localStorage.clear();
  window.location.href = "auth.html";
}

loadSidebar();
