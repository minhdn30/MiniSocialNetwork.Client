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

  function ensureMainContentHost() {
    const appRoot = document.getElementById("app");
    if (!appRoot || !appRoot.isConnected) return null;

    let host = document.getElementById("app-footer-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "app-footer-host";
    }

    if (host.parentNode !== appRoot || appRoot.lastElementChild !== host) {
      appRoot.appendChild(host);
    }

    return host;
  }

  function buildFallbackFooter() {
    const year = new Date().getFullYear();
    const footerT = (key, fallback) =>
      window.I18n?.t ? window.I18n.t(key, {}, fallback) : fallback;
    return `
      <footer class="app-footer" aria-label="${footerT("footer.ariaFooter", "Application Footer")}">
        <div class="app-footer-shell">
          <a class="app-footer-brand" href="#/" data-route="/">
            <span class="app-footer-brand-mark" aria-hidden="true">
              <img class="app-footer-brand-logo" src="assets/images/favicon.png" alt="" />
            </span>
            <span class="app-footer-brand-name">CloudM</span>
            <span class="app-footer-status">${footerT("footer.badges.experimental", "Experimental build")}</span>
          </a>
          <nav class="app-footer-links" aria-label="${footerT("footer.ariaNav", "Footer Navigation")}">
            <a class="app-footer-link" href="#/" data-route="/">${footerT("footer.home", "Home")}</a>
            <a class="app-footer-link" href="#/search" data-route="/search">${footerT("footer.search", "Search")}</a>
            <a class="app-footer-link" href="#/explore" data-route="/explore">${footerT("footer.explore", "Explore")}</a>
            <a class="app-footer-link" href="#/reels" data-route="/reels">${footerT("footer.reels", "Reels")}</a>
            <a class="app-footer-link" href="#/about-us" data-route="/about-us">${footerT("footer.about", "About")}</a>
          </nav>
          <div class="app-footer-copy">
            <span>${footerT("footer.copyPrefix", "Social app in progress")}</span>
            <span class="app-footer-copy-dot" aria-hidden="true"></span>
            <span>&copy; ${year} CloudM</span>
          </div>
        </div>
      </footer>
    `;
  }

  function applyFooterYear(root) {
    const yearEl = root.querySelector("[data-app-footer-year]");
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  }

  function ensureFooterLinkDelegation() {
    if (window.__appFooterLinkDelegationBound) return;
    window.__appFooterLinkDelegationBound = true;

    document.addEventListener("click", (event) => {
      const link = event.target.closest(".app-footer-link[data-route], .app-footer-brand[data-route]");
      if (!link) return;

      const route = (link.dataset.route || "").toString().trim();
      if (!route) return;

      if (typeof window.navigate === "function") {
        window.navigate(event, route, link);
        return;
      }

      event.preventDefault();
      if (window.RouteHelper?.goTo) {
        window.RouteHelper.goTo(route);
        return;
      }

      window.location.hash = `#${route}`;
    });
  }

  async function mount(target) {
    const template = await getFooterTemplate();
    const container = resolveContainer(target);
    if (!container || !container.isConnected) return false;

    container.innerHTML = template || buildFallbackFooter();
    applyFooterYear(container);
    ensureFooterLinkDelegation();
    if (window.I18n?.translateDom) {
      window.I18n.translateDom(container);
    }
    return true;
  }

  global.AppFooter = {
    mount,
    mountMainContent: () => mount(ensureMainContentHost()),
  };
})(window);
