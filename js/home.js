async function loadPartial(id, page) {
  const res = await fetch(`pages/${page}.html`);
  document.getElementById(id).innerHTML = await res.text();
  lucide.createIcons();
}

async function loadHome() {
  await loadPage("home");
  await loadPartial("story-section", "story");
  await loadPartial("feed-section", "newfeed");

  if (window.initFeed) {
    initFeed();
  }
}
