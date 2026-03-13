(function (global) {
  const MOBILE_BREAKPOINT = 768;
  const mobileQuery = global.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT}px)`,
  );
  const touchQuery = global.matchMedia("(hover: none), (pointer: coarse)");
  let lastMobileState = null;
  let resizeFrame = null;

  function setAppHeightVariable() {
    const height = Math.max(
      global.innerHeight || 0,
      document.documentElement?.clientHeight || 0,
      0,
    );
    document.documentElement.style.setProperty(
      "--cloudm-app-height",
      `${height || 0}px`,
    );
  }

  function syncResponsiveState(shouldEmit = true) {
    const body = document.body;
    const isMobileLayout = mobileQuery.matches;
    const isTouchLayout = touchQuery.matches || isMobileLayout;

    setAppHeightVariable();
    if (!body) return;

    body.classList.toggle("is-mobile-layout", isMobileLayout);
    body.classList.toggle("is-touch-layout", isTouchLayout);

    if (shouldEmit && lastMobileState !== null && lastMobileState !== isMobileLayout) {
      global.dispatchEvent(
        new CustomEvent("cloudm:viewport-change", {
          detail: { isMobileLayout, isTouchLayout },
        }),
      );
    }

    lastMobileState = isMobileLayout;
  }

  function handleResize() {
    if (resizeFrame) {
      global.cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = global.requestAnimationFrame(() => {
      resizeFrame = null;
      syncResponsiveState(true);
    });
  }

  global.CloudMResponsive = {
    isMobileLayout() {
      return mobileQuery.matches;
    },
    isTouchLayout() {
      return touchQuery.matches || mobileQuery.matches;
    },
    sync() {
      syncResponsiveState(true);
    },
  };

  syncResponsiveState(false);
  document.addEventListener("DOMContentLoaded", () => syncResponsiveState(false));
  mobileQuery.addEventListener("change", () => syncResponsiveState(true));
  touchQuery.addEventListener("change", () => syncResponsiveState(true));
  global.addEventListener("resize", handleResize);
  global.addEventListener("orientationchange", handleResize);
  global.addEventListener("pageshow", () => syncResponsiveState(false));
})(window);
