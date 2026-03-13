(function (global) {
  const CHAT_ROOT_PATH = "/chat";
  const MESSAGES_ROOT_PATH = "/messages";
  const CHAT_LIST_CLASS = "chat-mobile-list-active";
  const CHAT_CONVERSATION_CLASS = "chat-mobile-conversation-active";
  const BACK_BUTTON_ID = "chat-mobile-back-btn";
  let appObserver = null;
  let syncFrame = null;

  function parseHash(rawHash) {
    if (global.RouteHelper?.parseHash) {
      return global.RouteHelper.parseHash(rawHash || global.location.hash || "");
    }

    const normalizedHash = (rawHash || global.location.hash || "").toString().trim();
    const hashBody = normalizedHash.startsWith("#")
      ? normalizedHash.slice(1)
      : normalizedHash;
    const pathOnly = (hashBody.split("?")[0] || "").trim();

    return {
      path: pathOnly.startsWith("/") ? pathOnly : `/${pathOnly || ""}`.replace(/\/+$/, "") || "/",
    };
  }

  function isMobileLayout() {
    return (
      global.CloudMResponsive?.isMobileLayout?.() ||
      global.innerWidth <= 768
    );
  }

  function isChatPath(path) {
    if (global.RouteHelper?.isChatPath) {
      return global.RouteHelper.isChatPath(path || "");
    }

    const normalized = (path || "").toString().trim();
    return (
      normalized === CHAT_ROOT_PATH ||
      normalized.startsWith(`${CHAT_ROOT_PATH}/`) ||
      normalized === MESSAGES_ROOT_PATH ||
      normalized.startsWith(`${MESSAGES_ROOT_PATH}/`)
    );
  }

  function isChatConversationPath(path) {
    if (global.RouteHelper?.isChatConversationPath) {
      return global.RouteHelper.isChatConversationPath(path || "");
    }

    const normalized = (path || "").toString().trim();
    return (
      normalized.startsWith(`${CHAT_ROOT_PATH}/`) ||
      normalized.startsWith(`${MESSAGES_ROOT_PATH}/`)
    );
  }

  function shouldObserveAppMutations() {
    const path = parseHash(global.location.hash || "").path || "/";
    return isMobileLayout() && isChatPath(path);
  }

  function getBackLabel() {
    return (
      global.I18n?.t?.("chat.header.backToChats", {}, "Back to chats") ||
      "Back to chats"
    );
  }

  function goToChatList() {
    const targetPath = CHAT_ROOT_PATH;

    if (global.RouteHelper?.replaceHash) {
      global.RouteHelper.replaceHash(targetPath);
    } else {
      global.location.hash = `#${targetPath}`;
    }

    if (typeof global.closeChatSidebar === "function") {
      global.closeChatSidebar(true);
    }
  }

  function ensureChatSidebarOpen() {
    if (!global.ChatSidebar || typeof global.ChatSidebar.open !== "function") {
      return;
    }

    const panel = document.getElementById("chat-panel");
    const isSidebarAlreadyOpen =
      !!global.ChatSidebar.isOpen && !!panel?.classList.contains("show");

    if (!isSidebarAlreadyOpen) {
      Promise.resolve(global.ChatSidebar.open()).catch(() => {});
    }
  }

  function ensureBackButton() {
    const header = document.querySelector(".chat-view-header");
    const userBlock = header?.querySelector(".chat-view-user");
    if (!header || !userBlock) return;

    let button = document.getElementById(BACK_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BACK_BUTTON_ID;
      button.className = "chat-mobile-back-btn";
      button.innerHTML = '<i data-lucide="chevron-left"></i>';
      button.addEventListener("click", goToChatList);
    }

    button.setAttribute("aria-label", getBackLabel());
    button.setAttribute("title", getBackLabel());

    if (!header.contains(button)) {
      header.insertBefore(button, userBlock);
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ container: button });
    }
  }

  function removeBackButton() {
    document.getElementById(BACK_BUTTON_ID)?.remove();
  }

  function syncChatMobileState() {
    const body = document.body;
    if (!body) return;

    const path = parseHash(global.location.hash || "").path || "/";
    const mobile = isMobileLayout();
    const chatPath = mobile && isChatPath(path);
    const conversationPath = chatPath && isChatConversationPath(path);
    const listPath = chatPath && !conversationPath;

    body.classList.toggle(CHAT_LIST_CLASS, listPath);
    body.classList.toggle(CHAT_CONVERSATION_CLASS, conversationPath);

    if (!chatPath) {
      removeBackButton();
      if (!mobile && isChatPath(path)) {
        ensureChatSidebarOpen();
        return;
      }

      if (mobile && typeof global.closeChatSidebar === "function") {
        global.closeChatSidebar(true);
      }
      return;
    }

    if (conversationPath) {
      ensureBackButton();
    } else {
      removeBackButton();
    }

    if (conversationPath && typeof global.closeChatSidebar === "function") {
      global.closeChatSidebar(true);
    } else if (listPath) {
      ensureChatSidebarOpen();
    }
  }

  function syncSoon() {
    if (syncFrame) {
      global.cancelAnimationFrame(syncFrame);
    }

    syncFrame = global.requestAnimationFrame(() => {
      syncFrame = null;
      refreshAppObserver();
      syncChatMobileState();
    });
  }

  function disconnectAppObserver() {
    if (!appObserver) return;
    appObserver.disconnect();
    appObserver = null;
  }

  function refreshAppObserver() {
    const appRoot = document.getElementById("app");
    if (!appRoot || !shouldObserveAppMutations()) {
      disconnectAppObserver();
      return;
    }

    if (appObserver) return;

    appObserver = new MutationObserver(() => {
      syncSoon();
    });

    appObserver.observe(appRoot, {
      childList: true,
      subtree: true,
    });
  }

  if (global.I18n?.onChange) {
    global.I18n.onChange(() => syncSoon());
  }

  global.addEventListener("hashchange", syncSoon);
  global.addEventListener("pageshow", syncSoon);
  global.addEventListener("cloudm:viewport-change", syncSoon);
  document.addEventListener("DOMContentLoaded", () => {
    syncSoon();
  });

  syncSoon();
})(window);
