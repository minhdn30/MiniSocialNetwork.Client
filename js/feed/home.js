async function loadPartial(id, page, featureFolder = "feed") {
  const res = await fetch(`pages/${featureFolder}/${page}.html`);
  document.getElementById(id).innerHTML = await res.text();
  lucide.createIcons();
}

async function loadHome() {
  await loadPage("feed/home");
  await loadPartial("story-section", "story", "story");
  if (window.initStoryFeed) {
    initStoryFeed();
  }
  await loadPartial("feed-section", "newfeed", "feed");

  if (window.initFeed) {
    initFeed();
  }
}
