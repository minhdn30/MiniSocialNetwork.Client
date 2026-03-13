(function (global) {
  const SIDEBAR_ROOT_ID = "sidebar";
  const DROPDOWN_IDS = [
    "createDropdown",
    "moreDropdown",
    "settingsDropdown",
    "languageDropdown",
  ];
  let sidebarMountObserver = null;
  let sidebarSheetSyncFrame = 0;
  let mobileRuntimeHooksBound = false;

  function isMobileLayout() {
    return (
      global.CloudMResponsive?.isMobileLayout?.() ||
      window.innerWidth <= 768
    );
  }

  function hasOpenSidebarSheet() {
    return DROPDOWN_IDS.some((id) =>
      document.getElementById(id)?.classList.contains("show"),
    );
  }

  function syncSidebarSheetState() {
    const body = document.body;
    if (!body) return;

    const shouldShowMobileSheet = isMobileLayout() && hasOpenSidebarSheet();
    if (
      !shouldShowMobileSheet &&
      !body.classList.contains("sidebar-mobile-sheet-open")
    ) {
      return;
    }

    body.classList.toggle("sidebar-mobile-sheet-open", shouldShowMobileSheet);
  }

  function syncSidebarSheetStateSoon() {
    const body = document.body;
    if (!body) return;

    if (
      !isMobileLayout() &&
      !body.classList.contains("sidebar-mobile-sheet-open")
    ) {
      return;
    }

    if (sidebarSheetSyncFrame) {
      return;
    }

    sidebarSheetSyncFrame = global.requestAnimationFrame(() => {
      sidebarSheetSyncFrame = 0;
      syncSidebarSheetState();
    });
  }

  function cancelScheduledSidebarSheetSync() {
    if (!sidebarSheetSyncFrame) return;

    global.cancelAnimationFrame(sidebarSheetSyncFrame);
    sidebarSheetSyncFrame = 0;
  }

  function parseHashPath(rawHash) {
    if (global.RouteHelper?.parseHash) {
      return global.RouteHelper.parseHash(rawHash || global.location.hash || "").path || "/";
    }

    const normalizedHash = (rawHash || global.location.hash || "").toString().trim();
    const hashBody = normalizedHash.startsWith("#")
      ? normalizedHash.slice(1)
      : normalizedHash;
    const pathOnly = (hashBody.split("?")[0] || "").trim();
    if (!pathOnly) return "/";
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  }

  function isProfileLikeRoute(path) {
    if (global.RouteHelper?.isProfilePath) {
      return global.RouteHelper.isProfilePath(path);
    }

    const normalizedPath = (path || "").toString().trim();
    return normalizedPath === "/profile" || normalizedPath.startsWith("/profile/");
  }

  function isAccountSettingsRoute(path) {
    if (global.RouteHelper?.isAccountSettingsPath) {
      return global.RouteHelper.isAccountSettingsPath(path);
    }

    return (path || "").toString().trim() === "/account-settings";
  }

  function syncMoreTriggerState() {
    const moreTrigger = document.querySelector(".sidebar .more-trigger");
    if (!moreTrigger) return;

    if (!isMobileLayout()) {
      moreTrigger.classList.remove("active");
      return;
    }

    const currentPath = parseHashPath(global.location.hash || "");
    const isExploreRoute = currentPath === "/explore" || currentPath.startsWith("/explore/");
    const isReelsRoute = currentPath === "/reels" || currentPath.startsWith("/reels/");

    moreTrigger.classList.toggle(
      "active",
      isProfileLikeRoute(currentPath) ||
        isAccountSettingsRoute(currentPath) ||
        isExploreRoute ||
        isReelsRoute,
    );
  }

  function wrapGlobalFunction(name, afterHook) {
    const original = global[name];
    if (typeof original !== "function") return;

    global[name] = function (...args) {
      const result = original.apply(this, args);
      afterHook?.();
      return result;
    };
  }

  function patchLanguageMenuPositioning() {
    const original = global.positionLanguageMenu;
    if (typeof original !== "function") return;

    global.positionLanguageMenu = function (...args) {
      if (isMobileLayout()) {
        const dropdown = document.getElementById("languageDropdown");
        if (dropdown) {
          dropdown.style.left = "";
          dropdown.style.right = "";
          dropdown.style.top = "";
        }
        return;
      }

      return original.apply(this, args);
    };
  }

  function patchCloseOnViewportExit() {
    global.addEventListener("cloudm:viewport-change", (event) => {
      if (!event?.detail?.isMobileLayout) {
        document.body?.classList.remove("sidebar-mobile-sheet-open");
      }
      refreshMobileRuntimeHooks();
      syncSidebarSheetStateSoon();
      syncMoreTriggerState();
    });
  }

  function disconnectSidebarMountObserver() {
    if (!sidebarMountObserver) return;

    sidebarMountObserver.disconnect();
    sidebarMountObserver = null;
  }

  function bindSidebarMountObserver() {
    if (!isMobileLayout()) {
      disconnectSidebarMountObserver();
      return;
    }

    const sidebarRoot = document.getElementById(SIDEBAR_ROOT_ID);
    if (!sidebarRoot || sidebarMountObserver) return;

    sidebarMountObserver = new MutationObserver(() => {
      syncSidebarSheetStateSoon();
      syncMoreTriggerState();
    });

    sidebarMountObserver.observe(sidebarRoot, {
      childList: true,
      subtree: true,
    });
  }

  function handleDocumentClick() {
    syncSidebarSheetStateSoon();
  }

  function bindMobileRuntimeHooks() {
    if (mobileRuntimeHooksBound) return;

    document.addEventListener("click", handleDocumentClick, true);
    mobileRuntimeHooksBound = true;
  }

  function unbindMobileRuntimeHooks() {
    if (mobileRuntimeHooksBound) {
      document.removeEventListener("click", handleDocumentClick, true);
      mobileRuntimeHooksBound = false;
    }

    disconnectSidebarMountObserver();
    cancelScheduledSidebarSheetSync();
    document.body?.classList.remove("sidebar-mobile-sheet-open");
  }

  function refreshMobileRuntimeHooks() {
    if (!isMobileLayout()) {
      unbindMobileRuntimeHooks();
      return;
    }

    bindMobileRuntimeHooks();
    bindSidebarMountObserver();
  }

  function openMobileMessagesRoute() {
    if (window.closeNotificationsPanel) {
      window.closeNotificationsPanel();
    }

    if (window.closeSearchPanel) {
      window.closeSearchPanel();
    }

    if (typeof global.closeAllDropdowns === "function") {
      global.closeAllDropdowns();
    }

    if (global.RouteHelper?.goTo) {
      global.RouteHelper.goTo("/chat");
    } else {
      global.location.hash = "#/chat";
    }

    global.requestAnimationFrame(() => {
      Promise.resolve(global.ChatSidebar?.open?.()).catch(() => {});
    });
  }

  function bindMobileMessageRoute() {
    document.addEventListener(
      "click",
      (event) => {
        const messageItem = event.target.closest(
          ".sidebar .menu-item.messages[data-route='/messages']",
        );

        if (!messageItem || !isMobileLayout()) return;

        event.preventDefault();
        event.stopPropagation();
        openMobileMessagesRoute();
      },
      true,
    );
  }

  wrapGlobalFunction("closeAllDropdowns", syncSidebarSheetStateSoon);
  wrapGlobalFunction("toggleMoreMenu", syncSidebarSheetStateSoon);
  wrapGlobalFunction("toggleSettingsMenu", syncSidebarSheetStateSoon);
  wrapGlobalFunction("backToMoreMenu", syncSidebarSheetStateSoon);
  wrapGlobalFunction("toggleCreateMenu", syncSidebarSheetStateSoon);
  wrapGlobalFunction("openLanguageMenu", syncSidebarSheetStateSoon);
  wrapGlobalFunction("selectLanguageOption", syncSidebarSheetStateSoon);

  patchLanguageMenuPositioning();
  patchCloseOnViewportExit();
  bindMobileMessageRoute();

  refreshMobileRuntimeHooks();
  syncSidebarSheetStateSoon();
  document.addEventListener("DOMContentLoaded", refreshMobileRuntimeHooks);
  document.addEventListener("DOMContentLoaded", syncSidebarSheetStateSoon);
  document.addEventListener("DOMContentLoaded", syncMoreTriggerState);
  global.addEventListener("hashchange", syncMoreTriggerState);
  global.addEventListener("pageshow", () => {
    refreshMobileRuntimeHooks();
    syncMoreTriggerState();
  });
})(window);
