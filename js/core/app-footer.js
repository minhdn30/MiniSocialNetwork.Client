(function (global) {
  let footerTemplatePromise = null;

  function getFooterTemplate() {
    if (!footerTemplatePromise) {
      footerTemplatePromise = fetch("pages/core/app-footer.html")
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => "");
    }
    return footerTemplatePromise;
  }

  function resolveContainer(target) {
    if (!target) return null;
    if (typeof target === "string") return document.querySelector(target);
    if (target instanceof Element) return target;
    return null;
  }

  function buildFallbackFooter() {
    const year = new Date().getFullYear();
    const footerT = (key, fallback) =>
      window.I18n?.t ? window.I18n.t(key, {}, fallback) : fallback;
    return `
      <footer class="app-footer" aria-label="${footerT("footer.ariaFooter", "Application Footer")}">
        <nav class="app-footer-links" aria-label="${footerT("footer.ariaNav", "Footer Navigation")}">
          <span class="app-footer-link">${footerT("footer.home", "Home")}</span>
          <span class="app-footer-link">${footerT("footer.search", "Search")}</span>
          <span class="app-footer-link">${footerT("footer.explore", "Explore")}</span>
          <span class="app-footer-link">${footerT("footer.reels", "Reels")}</span>
        </nav>
        <div class="app-footer-copy">&copy; ${year} CloudM</div>
      </footer>
    `;
  }

  function applyFooterYear(root) {
    const yearEl = root.querySelector("[data-app-footer-year]");
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  }

  async function mount(target) {
    const template = await getFooterTemplate();
    const container = resolveContainer(target);
    if (!container || !container.isConnected) return false;

    container.innerHTML = template || buildFallbackFooter();
    applyFooterYear(container);
    if (window.I18n?.translateDom) {
      window.I18n.translateDom(container);
    }
    return true;
  }

  global.AppFooter = {
    mount,
  };
})(window);
