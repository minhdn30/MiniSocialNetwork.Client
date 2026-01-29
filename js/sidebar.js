async function loadSidebar() {
  const res = await fetch("pages/sidebar.html");
  document.getElementById("sidebar").innerHTML = await res.text();
  lucide.createIcons();

  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");

  const avatarElement = document.getElementById("sidebar-avatar");
  const nameElement = document.getElementById("sidebar-name");

  const defaultAvatar = "assets/images/default-avatar.jpg";

  if (!avatarUrl || avatarUrl === "null" || avatarUrl.trim() === "") {
    avatarElement.src = defaultAvatar;
  } else {
    avatarElement.src = avatarUrl;
  }

  nameElement.textContent =
    fullname && fullname.trim() !== "" ? fullname : "User";
}
function toggleMoreMenu(e) {
  e.stopPropagation();
  document.getElementById("moreDropdown").classList.toggle("show");
}

document.addEventListener("click", () => {
  document.getElementById("moreDropdown")?.classList.remove("show");
});
function setActiveSidebar(route) {
  document
    .querySelectorAll(".sidebar .menu-item[data-route]")
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.route === route);
    });
}
function navigate(e, route) {
  e.preventDefault();

  // Set active sidebar
  setActiveSidebar(route);

  // TODO: logic SPA của bạn
  // loadPage(route);
  // history.pushState({}, "", route);
}
