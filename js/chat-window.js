/**
 * Chat Window Module (formerly ChatMessenger)
 * Handles floating chat windows for quick conversations.
 */
const ChatWindow = {
  openChats: new Map(), // conversationId -> { element, bubbleElement, data, minimized, unreadCount, ... }
  maxOpenWindows: window.APP_CONFIG?.MAX_OPEN_CHAT_WINDOWS || 3,
  maxTotalWindows: window.APP_CONFIG?.MAX_TOTAL_CHAT_WINDOWS || 8,
  retryFiles: new Map(), // tempId -> File[]
  pendingSeenByConv: new Map(),
  _blobUrls: new Map(), // key -> Set<blobUrl>
  _realtimeRetryTimer: null,
  _messageUnsub: null,
  _seenUnsub: null,
  _typingUnsub: null,
  _themeUnsub: null,
  _themeModeEvent: null,
  _themeModeHandler: null,
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (!document.getElementById("chat-window-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.id = "chat-window-wrapper";
      wrapper.className = "chat-window-container"; // Main wrapper

      const windowsStack = document.createElement("div");
      windowsStack.id = "chat-windows-stack";

      const bubblesStack = document.createElement("div");
      bubblesStack.id = "chat-bubbles-stack";

      wrapper.appendChild(bubblesStack);
      wrapper.appendChild(windowsStack);
      document.body.appendChild(wrapper);

      // Stack Drop handling (Specific Position)
      windowsStack.addEventListener("dragover", (e) => {
        if (
          e.dataTransfer.types.includes("application/x-social-chat-external")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          windowsStack.classList.add("drag-over-stack");
        }
      });

      windowsStack.addEventListener("dragleave", () => {
        windowsStack.classList.remove("drag-over-stack");
      });

      windowsStack.addEventListener("drop", (e) => {
        windowsStack.classList.remove("drag-over-stack");
        const isExternal = e.dataTransfer.getData(
          "application/x-social-chat-external",
        );
        if (isExternal) {
          e.preventDefault();
          const convId = e.dataTransfer.getData("text/plain");
          if (convId) {
            // Determine drop position relative to existing windows
            const children = Array.from(windowsStack.children);
            let targetId = null;
            for (const child of children) {
              const rect = child.getBoundingClientRect();
              if (e.clientX < rect.left + rect.width / 2) {
                targetId = child.dataset.id;
                break;
              }
            }
            this.openByIdAtPosition(convId, targetId);
          }
        }
      });
    }

    // Setup global click-outside for ALL chat window emoji pickers
    if (window.EmojiUtils) {
      window.EmojiUtils.setupClickOutsideHandler(
        ".chat-window-emoji-container",
        ".chat-action-btn",
      );
    }

    // Click outside to lose focus
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".chat-box") && !e.target.closest(".chat-bubble")) {
        this.clearFocusedChatWindows();
      }
    });
    // Losing browser/tab focus should also clear focused chat windows
    window.addEventListener("blur", () => this.clearFocusedChatWindows());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        this.clearFocusedChatWindows();
      }
    });

    this.registerRealtimeHandlers();

    // Global Drag & Drop handling for External (Sidebar) items
    document.body.addEventListener("dragover", (e) => {
      if (document.body.classList.contains("is-chat-page")) return;

      if (e.dataTransfer.types.includes("application/x-social-chat-external")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    });

    document.body.addEventListener("drop", (e) => {
      if (document.body.classList.contains("is-chat-page")) return;

      const isExternal = e.dataTransfer.getData(
        "application/x-social-chat-external",
      );
      if (isExternal) {
        e.preventDefault();
        const convId = e.dataTransfer.getData("text/plain");
        if (convId) {
          // If target is the stack, let the stack listener handle it
          if (e.target.closest("#chat-windows-stack")) return;

          // Otherwise, open at default position (left-most / end of map)
          this.openById(convId, true);
        }
      }
    });

    // Restore open chats from previous session/navigation
    this.restoreState();

    if (!this._themeModeHandler) {
      this._themeModeEvent = window.themeManager?.EVENT || "app:theme-changed";
      this._themeModeHandler = () => this.reapplyAllConversationThemes();
      window.addEventListener(this._themeModeEvent, this._themeModeHandler);
    }

    // Reply event listener – routes to the correct open chat window
    if (!this._replyHandler) {
      this._replyHandler = (e) => {
        if (document.body.classList.contains('is-chat-page')) return;
        const { messageId, senderName, contentPreview, senderId, isOwnReplyAuthor } = e.detail || {};
        if (!messageId) return;
        // Find which open chat contains this message
        for (const [convId, chat] of this.openChats) {
          const msgContainer = document.getElementById(`chat-messages-${convId}`);
          if (msgContainer && msgContainer.querySelector(`[data-message-id="${messageId}"]`)) {
            this.showReplyBar(convId, messageId, senderName, contentPreview, senderId, isOwnReplyAuthor);
            return;
          }
        }
      };
      document.addEventListener('chat:reply', this._replyHandler);
    }
  },

  saveState() {
    try {
      const state = Array.from(this.openChats.entries()).map(([id, chat]) => ({
        id,
        minimized: chat.minimized || false,
        unreadCount: chat.unreadCount || 0,
        data: chat.data || null,
      }));
      localStorage.setItem("SOCIAL_NETWORK_OPEN_CHATS", JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save ChatWindow state:", e);
    }
  },

  restoreState() {
    if (this._restored) return;
    this._restored = true;
    try {
      const saved = localStorage.getItem("SOCIAL_NETWORK_OPEN_CHATS");
      if (!saved) return;

      const state = JSON.parse(saved);
      if (!Array.isArray(state)) return;

      state.forEach((item) => {
        if (!item.id) return;

        // Defensive: Ensure we don't restore temporary/broken ID states
        const isGuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            item.id,
          );
        if (!isGuid && !(item.data && typeof item.data === "object")) return;

        // Always prefer fresh metadata from Sidebar.
        let freshData = null;
        if (window.ChatSidebar && window.ChatSidebar.conversations) {
          const realConv = window.ChatSidebar.conversations.find(
            (c) => c.conversationId === item.id,
          );
          if (realConv) {
            freshData = realConv;
          }
        }

        // Backward compatibility with old stored schema that still had "data".
        if (!freshData && item.data && typeof item.data === "object") {
          freshData = item.data;
        }

        const unreadCount = item.unreadCount || freshData?.unreadCount || 0;

        if (freshData) {
          const payload = { ...freshData, unreadCount };
          const payloadConvId =
            payload.conversationId || payload.ConversationId || item.id;
          if (!payload.conversationId && payloadConvId) {
            payload.conversationId = payloadConvId;
          }
          if (item.minimized) {
            this.renderBubble(payloadConvId, payload);
          } else {
            this.openChat(payload, false); // Do not focus on restore
          }
          return;
        }

        // Final fallback: fetch fresh metadata by conversation ID.
        if (!isGuid) {
          if (typeof item.id === "string" && item.id.startsWith("new-")) {
            const accountId = item.id.slice(4);
            if (accountId) {
              this.openByAccountId(accountId, false)
                .then(() => {
                  let openId = this.getOpenChatId(item.id);
                  if (!openId) {
                    for (const [id, chatObj] of this.openChats.entries()) {
                      const otherId = (
                        chatObj?.data?.otherMember?.accountId ||
                        chatObj?.data?.otherMemberId ||
                        ""
                      ).toLowerCase();
                      if (otherId && otherId === accountId.toLowerCase()) {
                        openId = id;
                        break;
                      }
                    }
                  }
                  if (!openId) return;
                  const chat = this.openChats.get(openId);
                  if (!chat) return;

                  chat.unreadCount = unreadCount;
                  if (item.minimized && !chat.minimized) {
                    this.toggleMinimize(openId, false);
                  }
                  if (!item.minimized && chat.element && unreadCount > 0) {
                    chat.element.classList.add("has-unread");
                  }
                  if (chat.minimized && unreadCount > 0) {
                    this.incrementBubbleUnread(openId, true);
                  }
                  this.saveState();
                })
                .catch((err) =>
                  console.error("Failed to restore transient chat state:", err),
                );
            }
          }
          return;
        }
        this.openById(item.id, false, false)
          .then(() => {
            const openId = this.getOpenChatId(item.id);
            if (!openId) return;
            const chat = this.openChats.get(openId);
            if (!chat) return;

            chat.unreadCount = unreadCount;

            if (item.minimized && !chat.minimized) {
              this.toggleMinimize(openId, false);
            }

            if (!item.minimized && chat.element && unreadCount > 0) {
              chat.element.classList.add("has-unread");
            }
          })
          .catch((err) => console.error("Failed to restore chat state:", err));
      });
    } catch (e) {
      console.error("Failed to restore ChatWindow state:", e);
      localStorage.removeItem("SOCIAL_NETWORK_OPEN_CHATS");
    }
  },

  isGuidConversationId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id || "",
    );
  },

  registerRealtimeHandlers() {
    if (this._realtimeBound) return;

    const hasRealtimeApi =
      window.ChatRealtime &&
      typeof window.ChatRealtime.onMessage === "function" &&
      typeof window.ChatRealtime.onSeen === "function";

    if (!hasRealtimeApi) {
      if (!this._realtimeRetryTimer) {
        this._realtimeRetryTimer = setTimeout(() => {
          this._realtimeRetryTimer = null;
          this.registerRealtimeHandlers();
        }, 500);
      }
      return;
    }

    this._realtimeBound = true;
    if (this._realtimeRetryTimer) {
      clearTimeout(this._realtimeRetryTimer);
      this._realtimeRetryTimer = null;
    }

    if (typeof this._messageUnsub === "function") {
      this._messageUnsub();
      this._messageUnsub = null;
    }
    if (typeof this._seenUnsub === "function") {
      this._seenUnsub();
      this._seenUnsub = null;
    }
    if (typeof this._typingUnsub === "function") {
      this._typingUnsub();
      this._typingUnsub = null;
    }
    if (typeof this._themeUnsub === "function") {
      this._themeUnsub();
      this._themeUnsub = null;
    }

    this._messageUnsub = window.ChatRealtime.onMessage((msg) =>
      this.handleRealtimeMessage(msg),
    );
    this._seenUnsub = window.ChatRealtime.onSeen((data) =>
      this.handleMemberSeen(data),
    );
    if (typeof window.ChatRealtime.onTyping === "function") {
      this._typingUnsub = window.ChatRealtime.onTyping((data) =>
        this.handleTypingEvent(data),
      );
    }
    if (typeof window.ChatRealtime.onTheme === "function") {
      this._themeUnsub = window.ChatRealtime.onTheme((data) =>
        this.handleThemeEvent(data),
      );
    }
    this.rejoinAllRealtimeConversations();
  },

  tryJoinRealtimeConversation(conversationId, chatObj = null) {
    if (!this.isGuidConversationId(conversationId)) return false;
    if (
      !window.ChatRealtime ||
      typeof window.ChatRealtime.joinConversation !== "function"
    )
      return false;

    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = chatObj || this.openChats.get(openId);
    if (!chat || chat._realtimeJoined || chat._realtimeJoining)
      return !!(chat && (chat._realtimeJoined || chat._realtimeJoining));

    chat._realtimeJoining = true;

    window.ChatRealtime.joinConversation(openId)
      .then((ok) => {
        if (ok === false) {
          setTimeout(() => this.rejoinAllRealtimeConversations(), 1000);
          return;
        }
        const activeId = this.getOpenChatId(openId) || openId;
        const activeChat = this.openChats.get(activeId);
        if (activeChat) {
          activeChat._realtimeJoined = true;
        }
      })
      .catch((err) => console.error("Error joining conversation group:", err))
      .finally(() => {
        const activeId = this.getOpenChatId(openId) || openId;
        const activeChat = this.openChats.get(activeId);
        if (activeChat) {
          activeChat._realtimeJoining = false;
        }
      });

    return true;
  },

  rejoinAllRealtimeConversations() {
    for (const [id, chat] of this.openChats.entries()) {
      this.tryJoinRealtimeConversation(id, chat);
    }
  },

  getRuntimeCtx(conversationId, chatObj = null) {
    if (
      !window.ChatMessageRuntime ||
      typeof window.ChatMessageRuntime.createContext !== "function"
    ) {
      return null;
    }
    if (!conversationId) return null;

    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = chatObj || this.openChats.get(openId);
    if (!chat) return null;

    const myId = (
      localStorage.getItem("accountId") ||
      sessionStorage.getItem("accountId") ||
      window.APP_CONFIG?.CURRENT_USER_ID ||
      ""
    ).toLowerCase();

    if (!chat.runtimeCtx) {
      chat.runtimeCtx = window.ChatMessageRuntime.createContext({
        scope: "window",
        conversationId: openId,
        myAccountId: myId,
        retryFiles: this.retryFiles,
        pendingSeenByConv: this.pendingSeenByConv,
        blobUrls: this._blobUrls,
        now: () => new Date(),
      });
    }

    chat.runtimeCtx.scope = "window";
    chat.runtimeCtx.conversationId = openId;
    chat.runtimeCtx.myAccountId = myId;
    chat.runtimeCtx.retryFiles = this.retryFiles;
    chat.runtimeCtx.pendingSeenByConv = this.pendingSeenByConv;
    chat.runtimeCtx.blobUrls = this._blobUrls;
    return chat.runtimeCtx;
  },

  getAnyRuntimeCtx() {
    for (const [id, chat] of this.openChats.entries()) {
      const ctx = this.getRuntimeCtx(id, chat);
      if (ctx) return ctx;
    }
    return null;
  },

  clearFocusedChatWindows() {
    document
      .querySelectorAll(".chat-box.is-focused")
      .forEach((b) => b.classList.remove("is-focused"));
  },

  trackBlobUrl(url, key = "global") {
    const ctx = this.getAnyRuntimeCtx();
    if (ctx && window.ChatMessageRuntime) {
      return window.ChatMessageRuntime.trackBlobUrl(ctx, key, url);
    }
    if (!url) return null;
    if (!this._blobUrls.has(key)) {
      this._blobUrls.set(key, new Set());
    }
    this._blobUrls.get(key).add(url);
    return url;
  },

  revokeBlobUrl(url) {
    const ctx = this.getAnyRuntimeCtx();
    if (ctx && window.ChatMessageRuntime) {
      window.ChatMessageRuntime.revokeBlobUrlIfNeeded(ctx, url);
      return;
    }
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Failed to revoke blob URL:", e);
    }
    this._blobUrls.forEach((set) => set.delete(url));
  },

  revokePreviewBlobUrls(conversationId) {
    const key = `preview:${conversationId}`;
    const previewUrls = this._blobUrls.get(key);
    if (!previewUrls || previewUrls.size === 0) return;
    Array.from(previewUrls).forEach((url) => this.revokeBlobUrl(url));
    this._blobUrls.delete(key);
  },

  cleanupMessageBlobUrls(tempId) {
    const ctx = this.getAnyRuntimeCtx();
    if (ctx && window.ChatMessageRuntime) {
      window.ChatMessageRuntime.revokeMediaUrlsForTemp(ctx, tempId);
      return;
    }
    if (!tempId) return;
    this.retryFiles.delete(tempId);
    const urls = this._blobUrls.get(tempId);
    if (urls && urls.size > 0) {
      Array.from(urls).forEach((url) => this.revokeBlobUrl(url));
    }
    this._blobUrls.delete(tempId);
  },

  replaceOptimisticMediaUrls(bubble, messagePayload, tempId = null) {
    const ctx = this.getAnyRuntimeCtx();
    if (ctx && window.ChatMessageRuntime) {
      return window.ChatMessageRuntime.replaceOptimisticMediaUrls(
        ctx,
        bubble,
        messagePayload,
        tempId,
      );
    }
    if (!bubble || !messagePayload) return false;
    const medias = messagePayload.Medias || messagePayload.medias || [];
    if (!Array.isArray(medias) || medias.length === 0) return false;

    let replaced = false;
    medias.forEach((m, i) => {
      const mediaUrl = m.MediaUrl || m.mediaUrl;
      const mediaId = (m.MessageMediaId || m.messageMediaId || "")
        .toString()
        .toLowerCase();
      if (!mediaUrl) return;

      const targetItem = bubble.querySelector(`[data-media-index="${i}"]`);
      if (!targetItem) return;

      const img = targetItem.querySelector("img");
      const vid = targetItem.querySelector("video");
      const fileLink = targetItem.querySelector(".msg-file-link");
      if (img) {
        if (img.src?.startsWith("blob:")) this.revokeBlobUrl(img.src);
        img.src = mediaUrl;
        replaced = true;
      }
      if (vid) {
        if (vid.src?.startsWith("blob:")) this.revokeBlobUrl(vid.src);
        vid.src = mediaUrl;
        replaced = true;
      }
      if (fileLink) {
        const oldHref = fileLink.getAttribute("href") || "";
        if (oldHref.startsWith("blob:")) this.revokeBlobUrl(oldHref);
        fileLink.setAttribute("href", mediaUrl);
        if (mediaId) {
          fileLink.setAttribute("data-message-media-id", mediaId);
        } else {
          fileLink.removeAttribute("data-message-media-id");
        }
        replaced = true;
      }
    });

    if (replaced && tempId) {
      this.cleanupMessageBlobUrls(tempId);
    }

    return replaced;
  },

  remapConversationDomIds(oldId, realId, chatObj) {
    if (!oldId || !realId || !chatObj?.element) return;
    const root = chatObj.element;

    root.id = `chat-box-${realId}`;
    root.dataset.id = realId;

    const mappings = [
      { selector: ".chat-messages", id: `chat-messages-${realId}` },
      { selector: ".typing-indicator", id: `typing-indicator-${realId}` },
      { selector: ".chat-send-btn", id: `send-btn-${realId}` },
      { selector: ".chat-window-file-input", id: `chat-file-input-${realId}` },
      { selector: ".chat-window-doc-input", id: `chat-doc-input-${realId}` },
      {
        selector: ".chat-window-attachment-preview",
        id: `chat-window-preview-${realId}`,
      },
      { selector: ".chat-input-area", id: `chat-input-area-${realId}` },
      { selector: ".chat-actions-group", id: `chat-actions-group-${realId}` },
      {
        selector: ".chat-window-emoji-container",
        id: `chat-emoji-container-${realId}`,
      },
    ];

    mappings.forEach((item) => {
      const el = root.querySelector(item.selector);
      if (el) el.id = item.id;
    });

    root.querySelectorAll("[onclick],[oninput],[onkeydown]").forEach((el) => {
      ["onclick", "oninput", "onkeydown"].forEach((attr) => {
        const raw = el.getAttribute(attr);
        if (raw && raw.includes(oldId)) {
          el.setAttribute(attr, raw.split(oldId).join(realId));
        }
      });
    });

    const fileInput = root.querySelector(".chat-window-file-input");
    if (fileInput) {
      fileInput.onchange = () => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          this.handleMediaUpload(realId, files, { source: "media" });
          fileInput.value = "";
        }
      };
    }

    const docInput = root.querySelector(".chat-window-doc-input");
    if (docInput) {
      docInput.onchange = () => {
        const files = docInput.files;
        if (files && files.length > 0) {
          this.handleMediaUpload(realId, files, { source: "file" });
          docInput.value = "";
        }
      };
    }

    const sendBtn = root.querySelector(".chat-send-btn");
    if (sendBtn) {
      sendBtn.onclick = () => this.sendMessage(realId);
    }

    this.initScrollListener(realId);

    if (chatObj.bubbleElement) {
      chatObj.bubbleElement.id = `chat-bubble-${realId}`;
      chatObj.bubbleElement.dataset.id = realId;
      chatObj.bubbleElement.onclick = () => this.toggleMinimize(realId);
      const bubbleCloseBtn =
        chatObj.bubbleElement.querySelector(".chat-bubble-close");
      if (bubbleCloseBtn) {
        bubbleCloseBtn.setAttribute(
          "onclick",
          `event.stopPropagation(); ChatWindow.closeChat('${realId}')`,
        );
      }
    }
  },

  promoteConversationId(oldId, realId, chatObj) {
    if (!oldId || !realId || oldId === realId || !chatObj) return oldId;

    this.openChats.delete(oldId);
    chatObj.data.conversationId = realId;
    if (chatObj.runtimeCtx) {
      chatObj.runtimeCtx.conversationId = realId;
      chatObj.runtimeCtx.retryFiles = this.retryFiles;
      chatObj.runtimeCtx.pendingSeenByConv = this.pendingSeenByConv;
      chatObj.runtimeCtx.blobUrls = this._blobUrls;
    }
    this.openChats.set(realId, chatObj);

    const oldPreviewKey = `preview:${oldId}`;
    const newPreviewKey = `preview:${realId}`;
    const oldPreviewUrls = this._blobUrls.get(oldPreviewKey);
    if (oldPreviewUrls && oldPreviewUrls.size > 0) {
      if (!this._blobUrls.has(newPreviewKey)) {
        this._blobUrls.set(newPreviewKey, new Set());
      }
      const targetSet = this._blobUrls.get(newPreviewKey);
      oldPreviewUrls.forEach((url) => targetSet.add(url));
      this._blobUrls.delete(oldPreviewKey);
    }

    const oldSeenKey = oldId.toLowerCase();
    const pendingSeen = this.pendingSeenByConv.get(oldSeenKey);
    if (pendingSeen) {
      this.pendingSeenByConv.delete(oldSeenKey);
      this.pendingSeenByConv.set(realId.toLowerCase(), pendingSeen);
    }

    this.remapConversationDomIds(oldId, realId, chatObj);
    this.getRuntimeCtx(realId, chatObj);

    chatObj._realtimeJoined = false;
    this.tryJoinRealtimeConversation(realId, chatObj);

    this.saveState();
    return realId;
  },

  queuePendingSeen(conversationId, messageId, accountId, memberInfo = null) {
    const ctx = this.getRuntimeCtx(conversationId);
    if (ctx && window.ChatMessageRuntime) {
      window.ChatMessageRuntime.queuePendingSeen(
        ctx,
        conversationId,
        messageId,
        accountId,
        memberInfo,
      );
      return;
    }
    if (!conversationId || !messageId || !accountId) return;
    const convId = conversationId.toString().toLowerCase();
    const msgId = messageId.toString().toLowerCase();
    const accId = accountId.toString().toLowerCase();
    let convMap = this.pendingSeenByConv.get(convId);
    if (!convMap) {
      convMap = new Map();
      this.pendingSeenByConv.set(convId, convMap);
    }
    let arr = convMap.get(msgId);
    if (!arr) {
      arr = [];
      convMap.set(msgId, arr);
    }
    arr.push({ accountId: accId, memberInfo });
  },

  applyPendingSeenForMessage(conversationId, messageId) {
    const ctx = this.getRuntimeCtx(conversationId);
    if (ctx && window.ChatMessageRuntime) {
      window.ChatMessageRuntime.applyPendingSeenForMessage(
        ctx,
        conversationId,
        messageId,
        (accountId, msgId, memberInfo) =>
          this.moveSeenAvatar(conversationId, accountId, msgId, memberInfo),
      );
      return;
    }
    if (!conversationId || !messageId) return;
    const convId = conversationId.toString().toLowerCase();
    const msgId = messageId.toString().toLowerCase();
    const convMap = this.pendingSeenByConv.get(convId);
    if (!convMap) return;
    const arr = convMap.get(msgId);
    if (!arr || arr.length === 0) return;
    convMap.delete(msgId);
    arr.forEach((item) => {
      this.moveSeenAvatar(
        conversationId,
        item.accountId,
        msgId,
        item.memberInfo,
      );
    });
    if (convMap.size === 0) {
      this.pendingSeenByConv.delete(convId);
    }
  },

  getOpenChatId(convId) {
    if (!convId) return null;
    if (this.openChats.has(convId)) return convId;
    const target = convId.toLowerCase();
    for (const id of this.openChats.keys()) {
      if (id.toLowerCase() === target) return id;
    }
    return null;
  },

  handleRealtimeMessage(msg) {
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const normalized = window.ChatMessageRuntime
      ? window.ChatMessageRuntime.normalizeIncomingMessage(msg, myId)
      : null;

    const convIdRaw =
      normalized?.conversationId || msg.ConversationId || msg.conversationId;
    const messageIdRaw =
      normalized?.messageId || msg.MessageId || msg.messageId;
    const messageId = messageIdRaw
      ? messageIdRaw.toString().toLowerCase()
      : null;
    const tempId = normalized?.tempId || msg.TempId || msg.tempId;
    const senderIdRaw =
      normalized?.senderId ||
      msg.Sender?.AccountId ||
      msg.sender?.accountId ||
      msg.SenderId ||
      msg.senderId ||
      "";
    const senderId = senderIdRaw.toString().toLowerCase();
    const content =
      normalized?.content || (msg.Content || msg.content || "").trim();
    const normIncoming =
      normalized?.normalizedContent || ChatCommon.normalizeContent(content);

    const convId = this.getOpenChatId(convIdRaw);
    const chat = convId ? this.openChats.get(convId) : null;
    if (!convId || !chat) return;

    const runtimeCtx = this.getRuntimeCtx(convId, chat);
    const msgContainer = document.getElementById(`chat-messages-${convId}`);
    if (!msgContainer) {
      return;
    }

    if (
      messageId &&
      msgContainer.querySelector(`[data-message-id="${messageId}"]`)
    ) {
      return;
    }

    let optimisticBubble = null;
    if (runtimeCtx && normalized && window.ChatMessageRuntime) {
      optimisticBubble = window.ChatMessageRuntime.findOptimisticBubble(
        msgContainer,
        normalized,
        myId,
      );
    }
    if (!optimisticBubble && tempId) {
      optimisticBubble = msgContainer.querySelector(
        `[data-temp-id="${tempId}"]`,
      );
    }

    if (!optimisticBubble && senderId === myId) {
      const incomingMedias = msg.Medias || msg.medias || [];
      const optimisticMsgs = msgContainer.querySelectorAll(
        '.msg-bubble-wrapper.sent[data-status="pending"]',
      );
      for (const opt of optimisticMsgs) {
        const optContentRaw = opt.querySelector(".msg-bubble")?.innerText || "";
        const optContent = ChatCommon.normalizeContent(optContentRaw);
        const optMediaCount =
          opt.querySelectorAll(".msg-media-item")?.length || 0;

        const matchByContent = content && optContent === normIncoming;
        const matchByMedia =
          !content &&
          !optContent &&
          incomingMedias.length > 0 &&
          optMediaCount === incomingMedias.length;
        if (matchByContent || matchByMedia) {
          optimisticBubble = opt;
          break;
        }
      }
    }

    if (optimisticBubble) {
      if (messageId) optimisticBubble.dataset.messageId = messageId;
      delete optimisticBubble.dataset.status;
      optimisticBubble.querySelector(".msg-status")?.remove();

      // Clear "Sent" from all OTHER messages so only the latest shows it
      msgContainer
        .querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]')
        .forEach((el) => {
          if (el !== optimisticBubble) {
            el.removeAttribute("data-status");
            el.querySelector(".msg-status")?.remove();
          }
        });

      const hadBlobMedia = !!optimisticBubble.querySelector(
        'img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]',
      );
      const replaced = this.replaceOptimisticMediaUrls(
        optimisticBubble,
        msg,
        tempId,
      );

      const seenRow = optimisticBubble.querySelector(".msg-seen-row");
      if (seenRow && messageId) seenRow.id = `seen-row-${messageId}`;

      if (messageId) {
        this.applyPendingSeenForMessage(convId, messageId);
      }
      if (tempId) {
        this.retryFiles.delete(tempId);
        if (!hadBlobMedia || replaced) {
          this.cleanupMessageBlobUrls(tempId);
        }
      }
      return;
    }

    msgContainer
      .querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]')
      .forEach((el) => {
        el.removeAttribute("data-status");
        el.querySelector(".msg-status")?.remove();
      });

    const incoming = normalized?.raw || msg;
    if (
      senderId === myId &&
      !incoming.status &&
      !ChatCommon.isSystemMessage(incoming) &&
      !incoming.isRecalled
    ) {
      incoming.status = "sent";
    }

    const wasNearBottom = this.isNearBottom(convId);
    this.appendMessage(convId, incoming, wasNearBottom);
    if (
      window.ChatActions &&
      typeof window.ChatActions.syncPinStateFromSystemMessage === "function"
    ) {
      window.ChatActions.syncPinStateFromSystemMessage(incoming, convId);
    }
    if (messageId) {
      this.applyPendingSeenForMessage(convId, messageId);
    }

    if (!chat.minimized && wasNearBottom) {
      this.scrollToBottom(convId);
    }

    const chatBox = document.getElementById(`chat-box-${convId}`);
    if (chatBox && chatBox.classList.contains("is-focused")) {
      const lastId = messageId || this.getLastMessageId(convId);
      if (lastId) this.markConversationSeen(convId, lastId);
    }
  },

  incrementBubbleUnread(id, alreadyIncremented = false) {
    const chat = this.openChats.get(id);
    if (!chat || !chat.bubbleElement) return;

    if (!alreadyIncremented) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
    let badge = chat.bubbleElement.querySelector(".chat-bubble-unread");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "chat-bubble-unread";
      chat.bubbleElement.appendChild(badge);
    }
    badge.textContent = chat.unreadCount > 9 ? "9+" : chat.unreadCount;
  },

  markInactiveUnread(conversationId, chatObj = null) {
    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = chatObj || this.openChats.get(openId);
    if (!chat) return;

    const syncedUnread = this.getSyncUnreadCount(openId);
    if (chat.minimized) {
      if (syncedUnread > 0) {
        chat.unreadCount = syncedUnread;
        this.incrementBubbleUnread(openId, true);
      } else {
        this.incrementBubbleUnread(openId);
      }
    } else {
      chat.unreadCount =
        syncedUnread > 0 ? syncedUnread : (chat.unreadCount || 0) + 1;
      if (chat.element) {
        chat.element.classList.add("has-unread");
      }
    }

    this.saveState();
  },

  syncUnreadFromSidebar(conversationId, options = {}) {
    const openId = this.getOpenChatId(conversationId);
    if (!openId) return;

    const chat = this.openChats.get(openId);
    if (!chat) return;

    const syncedUnread = this.getSyncUnreadCount(openId) || 0;
    const localUnread = chat.unreadCount || 0;
    const expectIncomingUnreadIncrement =
      !!options.expectIncomingUnreadIncrement;
    let resolvedUnread = syncedUnread;

    // After reload, sidebar unread can lag behind the incoming realtime event.
    // For incoming notifications that should increment unread, enforce monotonic growth.
    if (expectIncomingUnreadIncrement && syncedUnread <= localUnread) {
      resolvedUnread = localUnread + 1;
    } else if (chat.minimized && syncedUnread < localUnread) {
      // In non-increment paths (active view), keep local value if sidebar snapshot is older.
      resolvedUnread = localUnread;
    }

    chat.unreadCount = resolvedUnread;

    if (chat.minimized) {
      if (resolvedUnread > 0) {
        this.incrementBubbleUnread(openId, true);
      } else {
        this.clearBubbleUnread(openId);
      }
    } else if (chat.element) {
      chat.element.classList.toggle("has-unread", resolvedUnread > 0);
    }

    this.saveState();
  },

  clearBubbleUnread(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;
    chat.unreadCount = 0;
    const badge = chat.bubbleElement?.querySelector(".chat-bubble-unread");
    if (badge) badge.remove();
  },

  /**
   * Get unread count from Sidebar to ensure consistency across UI
   */
  getSyncUnreadCount(convId) {
    if (!convId) return 0;
    const target = convId.toLowerCase();
    if (window.ChatSidebar && window.ChatSidebar.conversations) {
      const conv = window.ChatSidebar.conversations.find(
        (c) => (c.conversationId || "").toLowerCase() === target,
      );
      if (conv) return conv.unreadCount || 0;
    }
    return 0;
  },

  handleMemberSeen(data) {
    const convIdRaw = data.ConversationId || data.conversationId;
    const convId = this.getOpenChatId(convIdRaw);
    if (!convId) {
      // Still forward to sidebar even if no chat window is open
      const accIdRaw = data.AccountId || data.accountId;
      const accId = accIdRaw ? accIdRaw.toString().toLowerCase() : null;
      if (
        accId &&
        window.ChatSidebar &&
        typeof window.ChatSidebar.updateSeenInSidebar === "function"
      ) {
        window.ChatSidebar.updateSeenInSidebar(convIdRaw, accId);
      }
      return;
    }

    const accIdRaw = data.AccountId || data.accountId;
    const accId = accIdRaw ? accIdRaw.toString().toLowerCase() : null;
    const msgIdRaw = data.LastSeenMessageId || data.lastSeenMessageId;
    const msgId = msgIdRaw ? msgIdRaw.toString().toLowerCase() : msgIdRaw;
    if (accId && msgId) {
      this.moveSeenAvatar(convId, accId, msgId);
    }

    // Forward to sidebar to update seen indicator
    if (
      accId &&
      window.ChatSidebar &&
      typeof window.ChatSidebar.updateSeenInSidebar === "function"
    ) {
      window.ChatSidebar.updateSeenInSidebar(convIdRaw, accId);
    }
  },

  /**
   * Mark a conversation as seen (read).
   */
  markConversationSeen(conversationId, messageId) {
    if (!conversationId || !messageId) return;
    const isGuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        conversationId,
      );
    if (!isGuid) return;

    const normConversationId = conversationId.toString().toLowerCase();
    const normMessageId = messageId ? messageId.toString().toLowerCase() : null;
    if (!normMessageId) return;

    let wasUnread = false;
    if (
      window.ChatSidebar &&
      typeof window.ChatSidebar.clearUnread === "function"
    ) {
      const sidebarConv = window.ChatSidebar.conversations?.find(
        (c) => (c.conversationId || "").toLowerCase() === normConversationId,
      );
      wasUnread = !!sidebarConv && (sidebarConv.unreadCount || 0) > 0;
      window.ChatSidebar.clearUnread(conversationId);
    }

    const openId = this.getOpenChatId(conversationId);
    if (openId && this.openChats.has(openId)) {
      const chat = this.openChats.get(openId);
      if (chat) {
        chat.unreadCount = 0;
        if (chat.minimized) {
          this.clearBubbleUnread(openId);
        } else if (chat.element) {
          chat.element.classList.remove("has-unread");
        }
      }
    }

    if (typeof this.syncUnreadFromSidebar === "function") {
      this.syncUnreadFromSidebar(conversationId);
    }

    if (wasUnread && typeof scheduleGlobalUnreadRefresh === "function") {
      scheduleGlobalUnreadRefresh();
    }

    if (
      window.ChatRealtime &&
      typeof window.ChatRealtime.seenConversation === "function"
    ) {
      window.ChatRealtime.seenConversation(conversationId, normMessageId).catch(
        (err) => console.error("SeenConversation error:", err),
      );
    }
  },

  /**
   * Get the last message ID from a chat window's message container.
   */
  getLastMessageId(conversationId) {
    const msgContainer = document.getElementById(
      `chat-messages-${conversationId}`,
    );
    if (!msgContainer) return null;
    const allMsgs = msgContainer.querySelectorAll("[data-message-id]");
    if (allMsgs.length === 0) return null;
    return allMsgs[allMsgs.length - 1].dataset.messageId;
  },

  getLastMessageBubble(msgContainer) {
    if (!msgContainer) return null;
    const bubbles = msgContainer.querySelectorAll(".msg-bubble-wrapper");
    if (!bubbles.length) return null;
    return bubbles[bubbles.length - 1];
  },

  findPreviousMessageBubble(startElement) {
    let cursor = startElement?.previousElementSibling || null;
    while (cursor) {
      if (cursor.classList?.contains("msg-bubble-wrapper")) {
        return cursor;
      }
      cursor = cursor.previousElementSibling;
    }
    return null;
  },

  insertHtmlBeforeTypingIndicator(msgContainer, html) {
    if (!msgContainer || !html) return;
    const typingIndicator = msgContainer.querySelector(".typing-indicator");
    if (!typingIndicator || typingIndicator.parentElement !== msgContainer) {
      msgContainer.insertAdjacentHTML("beforeend", html);
      return;
    }

    const temp = document.createElement("div");
    temp.innerHTML = html;
    while (temp.firstChild) {
      msgContainer.insertBefore(temp.firstChild, typingIndicator);
    }
  },

  insertNodeBeforeTypingIndicator(msgContainer, node) {
    if (!msgContainer || !node) return;
    const typingIndicator = msgContainer.querySelector(".typing-indicator");
    if (typingIndicator && typingIndicator.parentElement === msgContainer) {
      msgContainer.insertBefore(node, typingIndicator);
      return;
    }
    msgContainer.appendChild(node);
  },

  isNearBottom(conversationId, threshold = 150) {
    const msgContainer = document.getElementById(
      `chat-messages-${conversationId}`,
    );
    if (!msgContainer) return true;
    return msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight <= threshold;
  },

  scrollToBottom(conversationId, behavior = 'auto') {
    const msgContainer = document.getElementById(
      `chat-messages-${conversationId}`,
    );
    if (!msgContainer) return;

    if (behavior === 'smooth') {
      msgContainer.scrollTo({
        top: msgContainer.scrollHeight,
        behavior: 'smooth'
      });
      return;
    }

    const doScroll = () => {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    };

    doScroll();
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 100);
  },

  // ─── Context mode methods (shared via ChatCommon) ─────────────────

  _getContextAdapter(id) {
    const self = this;
    const chat = self.openChats.get(id);
    if (!chat) return null;

    return {
      getState: () => ({
        isLoading: chat.isLoading,
        page: chat.page,
        hasMore: chat.hasMore,
        _isContextMode: chat._isContextMode,
        _contextPage: chat._contextPage,
        _newerPage: chat._newerPage,
        _hasMoreNewer: chat._hasMoreNewer,
      }),
      setState: (patch) => { Object.assign(chat, patch); },
      getContainerId: () => `chat-messages-${id}`,
      getPageSize: () => window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10,
      getConversationId: () => id,
      getMyId: () => (localStorage.getItem('accountId') || sessionStorage.getItem('accountId') || window.APP_CONFIG?.CURRENT_USER_ID || '').toLowerCase(),
      isGroup: () => chat.data?.isGroup || false,
      renderMessages: (items, container) => {
        const isGroup = chat.data?.isGroup || false;
        const myId = (localStorage.getItem('accountId') || sessionStorage.getItem('accountId') || window.APP_CONFIG?.CURRENT_USER_ID || '').toLowerCase();
        let lastTime = null;
        items.forEach((m, idx) => {
          ChatCommon.normalizeMessage(m, myId);
          const currentTime = new Date(m.sentAt);
          const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
          if (!lastTime || (currentTime - lastTime > gap)) {
            self.insertHtmlBeforeTypingIndicator(container, ChatCommon.renderChatSeparator(m.sentAt));
          }
          lastTime = currentTime;
          const prevMsg = idx > 0 ? items[idx - 1] : null;
          const nextMsg = idx < items.length - 1 ? items[idx + 1] : null;
          const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);
          const senderAvatar = !m.isOwn ? (m.sender?.avatarUrl || m.sender?.AvatarUrl || '') : '';
          const authorName = isGroup && !m.isOwn
            ? (m.sender?.nickname || m.sender?.Nickname || m.sender?.username || m.sender?.Username || m.sender?.fullName || m.sender?.FullName || '')
            : '';
          const html = ChatCommon.renderMessageBubble(m, { isGroup, groupPos, senderAvatar, authorName, isWindow: true });
          self.insertHtmlBeforeTypingIndicator(container, html);
        });
      },
      reloadLatest: () => { self.loadInitialMessages(id); },
      scrollToBottom: (behavior) => { self.scrollToBottom(id, behavior); },
      getBtnParent: () => document.getElementById(`chat-box-${id}`),
      getBtnId: () => `chatJumpBottomBtn-${id}`,
      getMetaData: () => chat.data,
      setMetaData: (meta) => { chat.data = { ...chat.data, ...meta }; },
    };
  },

  async loadMessageContext(conversationId, messageId) {
    const ctx = this._getContextAdapter(conversationId);
    if (!ctx) return;
    await ChatCommon.contextLoadMessageContext(ctx, messageId);
  },

  async loadNewerMessages(id) {
    const ctx = this._getContextAdapter(id);
    if (!ctx) return;
    await ChatCommon.contextLoadNewerMessages(ctx);
  },

  jumpToBottom(id) {
    const ctx = this._getContextAdapter(id);
    if (!ctx) return;
    ChatCommon.contextJumpToBottom(ctx);
  },

  resetContextMode(id) {
    const ctx = this._getContextAdapter(id);
    if (!ctx) return;
    ChatCommon.contextResetMode(ctx);
  },

  showJumpToBottomBtn(id) {
    const ctx = this._getContextAdapter(id);
    if (!ctx) return;
    ChatCommon.contextShowJumpBtn(ctx);
  },

  removeJumpToBottomBtn(id) {
    const ctx = this._getContextAdapter(id);
    if (ctx) {
      ChatCommon.contextRemoveJumpBtn(ctx);
    } else {
      // Fallback: remove by ID directly when chat object is already gone
      const btn = document.getElementById(`chatJumpBottomBtn-${id}`);
      if (btn) btn.remove();
    }
  },

  /**
   * Move (or create) a member's seen avatar to a specific message's seen row in a chat window
   */
  moveSeenAvatar(conversationId, accountId, messageId, memberInfo = null) {
    const msgContainer = document.getElementById(
      `chat-messages-${conversationId}`,
    );
    if (!msgContainer) return;
    const normAccountId = accountId ? accountId.toString().toLowerCase() : "";
    if (!normAccountId) return;
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    if (normAccountId === myId) return;

    // Resolve info from metadata if missing (realtime event)
    if (!memberInfo) {
      const chatObj = this.openChats.get(conversationId);
      const targetId = normAccountId;
      if (chatObj?.metaData?.memberSeenStatuses) {
        const member = chatObj.metaData.memberSeenStatuses.find((m) => {
          const mId = (m.accountId || m.AccountId || "").toLowerCase();
          return mId === targetId;
        });
        if (member) {
          memberInfo = {
            avatar: member.avatarUrl || member.AvatarUrl,
            name: member.displayName || member.DisplayName,
          };
        }
      }
      // Fallback: use conv data (otherMember / displayAvatar) for 1:1 chats
      if (!memberInfo && chatObj?.data) {
        const other = chatObj.data.otherMember;
        if (other && (other.accountId || "").toLowerCase() === targetId) {
          memberInfo = {
            avatar: other.avatarUrl || other.AvatarUrl,
            name:
              other.displayName ||
              other.DisplayName ||
              other.username ||
              other.Username,
          };
        }
        // Final fallback: conversation display avatar (1:1 only)
        if (!memberInfo && !chatObj.data.isGroup) {
          memberInfo = {
            avatar: chatObj.data.displayAvatar,
            name: chatObj.data.displayName,
          };
        }
      }
    }

    // 1. Remove existing if any in this window
    const existing = msgContainer.querySelector(
      `.seen-avatar-wrapper[data-account-id="${normAccountId}"]`,
    );
    if (existing) {
      existing.remove();
    }

    // 2. Find target bubble (by messageId), then pick correct seen-row
    const normMessageId = messageId
      ? messageId.toString().toLowerCase()
      : messageId;
    let bubbleWrapper = normMessageId
      ? msgContainer.querySelector(
          `.msg-bubble-wrapper[data-message-id="${normMessageId}"]`,
        )
      : null;
    let targetRow = bubbleWrapper?.querySelector(".msg-seen-row") || null;

    // If target message isn't loaded yet (pagination), defer until that message appears in DOM.
    if (normMessageId && !bubbleWrapper) {
      this.queuePendingSeen(
        conversationId,
        normMessageId,
        normAccountId,
        memberInfo,
      );
      return;
    }

    // If target isn't our message OR target has no seen row (e.g. system message),
    // move to nearest previous message sent by us that has a seen row.
    if (
      bubbleWrapper &&
      ((bubbleWrapper.dataset.senderId || "").toLowerCase() !== myId ||
        !targetRow)
    ) {
      let cursor = bubbleWrapper.previousElementSibling;
      while (cursor) {
        if (cursor.classList?.contains("msg-bubble-wrapper")) {
          const senderId = (cursor.dataset.senderId || "").toLowerCase();
          const candidateSeenRow = cursor.querySelector(".msg-seen-row");
          if (senderId === myId && candidateSeenRow) {
            targetRow = candidateSeenRow;
            break;
          }
        }
        cursor = cursor.previousElementSibling;
      }
    }

    if (!targetRow) {
      this.queuePendingSeen(
        conversationId,
        normMessageId || messageId,
        normAccountId,
        memberInfo,
      );
      return;
    }

    // Remove "Sent" status on the message that is now seen
    const statusEl = targetRow
      .closest(".msg-bubble-wrapper")
      ?.querySelector(".msg-status");
    if (statusEl) {
      statusEl.remove();
    }
    const statusBubble = targetRow.closest(".msg-bubble-wrapper");
    if (statusBubble?.dataset?.status === "sent") {
      statusBubble.removeAttribute("data-status");
    }

    // 3. Create or reconstruct avatar
    const existingImg = existing?.querySelector(".seen-avatar");
    const existingName = existing?.querySelector(".seen-avatar-name");
    const avatarUrl =
      memberInfo?.avatar || existingImg?.src || APP_CONFIG.DEFAULT_AVATAR;
    const displayName = memberInfo?.name || existingName?.textContent || "User";

    const wrapper = document.createElement("div");
    wrapper.className = "seen-avatar-wrapper";
    wrapper.dataset.accountId = normAccountId;

    const img = document.createElement("img");
    img.src = avatarUrl;
    img.className = "seen-avatar";
    img.onerror = () => (img.src = APP_CONFIG.DEFAULT_AVATAR);

    const nameLabel = document.createElement("div");
    nameLabel.className = "seen-avatar-name";
    nameLabel.textContent = displayName;

    wrapper.appendChild(img);
    wrapper.appendChild(nameLabel);
    targetRow.appendChild(wrapper);
  },

  /**
   * Initial render for all members' seen indicators in a chat window
   */
  updateMemberSeenStatuses(conversationId, meta) {
    if (!meta || !meta.memberSeenStatuses) return;
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();

    meta.memberSeenStatuses.forEach((member) => {
      const memberId = (
        member.accountId ||
        member.AccountId ||
        ""
      ).toLowerCase();
      if (!memberId || memberId === myId) return;

      const rawLastSeenId =
        member.lastSeenMessageId || member.LastSeenMessageId;
      if (!rawLastSeenId) return;

      const lastSeenId = rawLastSeenId.toString().toLowerCase();
      this.moveSeenAvatar(conversationId, memberId, lastSeenId, {
        avatar: member.avatarUrl || member.AvatarUrl,
        name: member.displayName || member.DisplayName,
      });
    });
  },

  /**
   * Open a chat window.
   * @param {Object} conv The conversation data
   * @param {Boolean} shouldFocus Whether to focus the window
   * @param {Boolean} priorityLeft Whether to move to the left-most position (end of map)
   */
  openChat(conv, shouldFocus = true, priorityLeft = false) {
    if (!conv) return;
    this.init();
    const convId = conv.conversationId;

    if (this.openChats.has(convId)) {
      const chat = this.openChats.get(convId);

      // Always refresh data to ensure consistency (fix for "header showing own info" if stale)
      if (conv) {
        chat.data = conv;
        this.setThemeStatus(convId, conv.theme ?? conv.Theme ?? null);
      }
      this.getRuntimeCtx(convId, chat);

      // Move to last position (leftmost) if requested even if already open
      if (priorityLeft) {
        this.openChats.delete(convId);
        this.openChats.set(convId, chat);
        this.reorderWindowsDOM();
        this.reorderBubblesDOM();
      }

      if (chat.minimized) {
        this.toggleMinimize(convId, shouldFocus);
      } else if (shouldFocus) {
        this.focusChat(convId);
      }
      this.tryJoinRealtimeConversation(convId, chat);
      return;
    }

    // Check Total Limit before opening a NEW one
    if (this.openChats.size >= this.maxTotalWindows) {
      // Prefer closing the oldest bubble (minimized) first to preserve active windows
      const oldestBubbleId = Array.from(this.openChats.entries()).find(
        ([, c]) => c.minimized,
      )?.[0];
      if (oldestBubbleId) {
        console.log(
          `💬 [ChatWindow] Total limit reached, closing oldest bubble: ${oldestBubbleId}`,
        );
        this.closeChat(oldestBubbleId);
      } else {
        // No bubbles → close the oldest window (rightmost)
        const oldestId = Array.from(this.openChats.keys())[0];
        if (oldestId) {
          console.log(
            `💬 [ChatWindow] Total limit reached, closing oldest window: ${oldestId}`,
          );
          this.closeChat(oldestId);
        }
      }
    }

    // Check Open Windows Limit — minimize the rightmost (oldest / first in Map)
    const openWindowsCount = Array.from(this.openChats.values()).filter(
      (c) => !c.minimized,
    ).length;
    if (openWindowsCount >= this.maxOpenWindows) {
      const rightmostWindowId = Array.from(this.openChats.entries()).find(
        ([, c]) => !c.minimized,
      )?.[0];
      if (rightmostWindowId) {
        console.log(
          `💬 [ChatWindow] Window limit reached, minimizing rightmost: ${rightmostWindowId}`,
        );
        this.toggleMinimize(rightmostWindowId);
      }
    }

    this.renderChatBox(conv, shouldFocus);
    this.tryJoinRealtimeConversation(convId);

    // Adjust internal Map order if opening at start
    if (priorityLeft) {
      const entry = this.openChats.get(convId);
      this.openChats.delete(convId);
      this.openChats.set(convId, entry);
      this.reorderWindowsDOM();
      this.reorderBubblesDOM();
    }

    this.saveState();
  },

  async openById(convId, priorityLeft = false, shouldFocus = true) {
    if (!convId) return;
    this.init();
    const target = convId.toLowerCase();

    let convData = null;
    if (window.ChatSidebar && window.ChatSidebar.conversations) {
      convData = window.ChatSidebar.conversations.find(
        (c) => (c.conversationId || "").toLowerCase() === target,
      );
    }

    // Fallback 1: Query latest "All conversations" snapshot, independent from current sidebar filter/search state.
    if (!convData && window.API?.Conversations?.getConversations) {
      try {
        const pageSize = window.APP_CONFIG?.CONVERSATIONS_PAGE_SIZE || 20;
        const res = await window.API.Conversations.getConversations(
          null,
          null,
          1,
          pageSize,
        );
        if (res.ok) {
          const data = await res.json();
          const items = data?.items || [];
          convData =
            items.find(
              (c) =>
                (c.conversationId || c.ConversationId || "").toLowerCase() ===
                target,
            ) || null;
        }
      } catch (err) {
        console.error("Failed to query conversations list for openById:", err);
      }
    }

    // Fallback 2 (legacy): keep compatibility if backend adds/has this endpoint in future.
    if (convData) {
      if (!convData.conversationId) {
        convData.conversationId = convData.ConversationId || convId;
      }
      this.openChat(convData, shouldFocus, priorityLeft);
      return true;
    } else {
      try {
        const res = await window.API.Conversations.getById(convId);
        if (res.ok) {
          const raw = await res.json();
          const data = raw?.metaData || raw;
          if (data && !data.conversationId) {
            data.conversationId = data.ConversationId || convId;
          }
          this.openChat(data, shouldFocus, priorityLeft);
          return true;
        }
      } catch (err) {
        console.error("Failed to fetch conversation for open:", err);
      }
    }
    return false;
  },

  async openByIdAtPosition(convId, referenceId) {
    if (!convId) return;

    let convData = null;
    if (window.ChatSidebar && window.ChatSidebar.conversations) {
      const target = convId.toLowerCase();
      convData = window.ChatSidebar.conversations.find(
        (c) => (c.conversationId || "").toLowerCase() === target,
      );
    }

    if (!convData) {
      try {
        const res = await window.API.Conversations.getById(convId);
        if (res.ok) convData = await res.json();
      } catch (err) {
        console.error("Failed to fetch conversation for drag-drop:", err);
      }
    }

    if (convData) {
      // First open it normally (if not already open)
      this.openChat(convData, true, false);

      // Now precisely reorder it in the Map based on the referenceId
      const ids = Array.from(this.openChats.keys());
      const oldIdx = ids.indexOf(convId);
      if (oldIdx !== -1) ids.splice(oldIdx, 1);

      const targetIdx = referenceId ? ids.indexOf(referenceId) : ids.length;
      ids.splice(targetIdx, 0, convId);

      const newMap = new Map();
      const existingMap = new Map(this.openChats);
      ids.forEach((id) => {
        const obj = existingMap.get(id);
        if (obj) newMap.set(id, obj);
      });

      this.openChats = newMap;
      this.reorderWindowsDOM();
      this.reorderBubblesDOM();
      this.saveState();
    }
  },

  async openByAccountId(accountId, shouldFocus = true) {
    if (!accountId) return;
    const targetAccountId = accountId.toString().toLowerCase();

    // Find if already open (check normalized IDs/data)
    for (const [id, chat] of this.openChats) {
      const existingId = chat.data.otherMember?.accountId
        ?.toString()
        .toLowerCase();
      if (existingId === targetAccountId) {
        this.openChat(chat.data, shouldFocus);
        return;
      }
    }

    try {
      const res =
        await window.API.Conversations.getPrivateWithMessages(accountId);
      if (res.ok) {
        const data = await res.json();
        const chatData = data.metaData;

        // If it's a new chat, we need a temp ID for the UI
        if (
          data.isNew ||
          !chatData.conversationId ||
          chatData.conversationId === "00000000-0000-0000-0000-000000000000"
        ) {
          chatData.conversationId = `new-${accountId}`;
        }

        this.openChat(chatData, shouldFocus);
      }
    } catch (error) {
      console.error("Failed to open chat by account ID:", error);
    }
  },

  renderChatBox(conv, shouldFocus = true) {
    const stack = document.getElementById("chat-windows-stack");
    if (!stack) return;

    // Prevent duplicates in DOM
    const existing = document.getElementById(`chat-box-${conv.conversationId}`);
    if (existing) {
      if (shouldFocus) this.focusChat(conv.conversationId);
      return;
    }

    const avatar = ChatCommon.getAvatar(conv);
    const name = escapeHtml(ChatCommon.getDisplayName(conv));
    const subtext = conv.isGroup
      ? "Group Chat"
      : conv.otherMember?.isActive
        ? "Online"
        : "Offline";

    const chatBox = document.createElement("div");
    chatBox.className = "chat-box";
    chatBox.id = `chat-box-${conv.conversationId}`;
    chatBox.dataset.id = conv.conversationId;
    if (
      window.ChatCommon &&
      typeof window.ChatCommon.applyConversationTheme === "function"
    ) {
      window.ChatCommon.applyConversationTheme(
        chatBox,
        conv.theme ?? conv.Theme ?? null,
      );
    }

    // Initial unread state (for restore)
    if (conv.unreadCount > 0 && !shouldFocus) {
      chatBox.classList.add("has-unread");
    }

    // Drag Handle Management & Focus
    chatBox.addEventListener(
      "mousedown",
      (e) => {
        const isHeader = e.target.closest(".chat-box-header");
        const isButton = e.target.closest(".chat-btn");
        const isHeaderInfo = e.target.closest(".chat-header-info");
        const isSpecialHeaderAction = !!(isButton || isHeaderInfo);

        // Only allow dragging if clicking on header area that is not button/info action.
        if (isHeader && !isSpecialHeaderAction) {
          chatBox.draggable = true;
        } else {
          chatBox.draggable = false;
        }

        // Focus for normal window clicks, but exclude header special controls.
        if (!isSpecialHeaderAction) {
          this.focusChat(conv.conversationId);
        }
      },
      true,
    );

    // Drag and Drop listeners
    chatBox.addEventListener("dragstart", (e) => {
      chatBox.classList.add("is-dragging");
      e.dataTransfer.setData("text/plain", conv.conversationId);
      e.dataTransfer.effectAllowed = "move";

      // Set a drag image offset if needed (optional)
    });

    chatBox.addEventListener("dragend", () => {
      chatBox.classList.remove("is-dragging");
      chatBox.draggable = false; // Reset
      this.syncChatOrderFromWindows();
    });

    // Internal Sorting (when dragging another box over this one)
    chatBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = document.querySelector(".chat-box.is-dragging");
      if (!dragging || dragging === chatBox) return;

      const stack = document.getElementById("chat-windows-stack");
      const children = Array.from(stack.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(chatBox);

      // Throttle swap to prevent flicker
      if (dragIdx < targetIdx) {
        stack.insertBefore(dragging, chatBox.nextSibling);
      } else {
        stack.insertBefore(dragging, chatBox);
      }

      // Re-scrolling after DOM move
      if (dragging.dataset.id) this.scrollToBottom(dragging.dataset.id);
    });

    chatBox.addEventListener("dragenter", (e) => {
      const dragging = document.querySelector(".chat-box.is-dragging");
      if (dragging && dragging !== chatBox) {
        chatBox.classList.add("drag-target");
      }
    });

    chatBox.addEventListener("dragleave", () => {
      chatBox.classList.remove("drag-target");
    });

    // Add drop listener to box just in case
    chatBox.addEventListener("drop", () => {
      chatBox.classList.remove("drag-target");
    });

    const otherAccountId =
      conv.otherMember?.accountId || conv.otherMemberId || "";
    const canNav = !conv.isGroup && otherAccountId;

    chatBox.innerHTML = `
            <div class="chat-box-header">
                <div class="chat-header-info" 
                     onclick="event.stopPropagation(); ChatWindow.toggleHeaderMenu(this, '${conv.conversationId}')" 
                     style="cursor: pointer;">
                    <div class="chat-header-avatar">
                        <img src="${avatar}" alt="${name}" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
                        ${!conv.isGroup && conv.otherMember?.isActive ? '<div class="chat-header-status"></div>' : ""}
                    </div>
                    <div class="chat-header-text">
                        <div class="chat-header-name" title="${name}">${name}</div>
                        <div class="chat-header-subtext">${subtext}</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-btn" onclick="event.stopPropagation(); ChatWindow.toggleMinimize('${conv.conversationId}')">
                        <i data-lucide="minus"></i>
                    </button>
                    <button class="chat-btn close" onclick="event.stopPropagation(); ChatWindow.closeChat('${conv.conversationId}')">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages-${conv.conversationId}">
                <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:12px;">
                    Starting chat...
                </div>
                <div class="typing-indicator" id="typing-indicator-${conv.conversationId}">
                    <div class="typing-message-shell received msg-group-single">
                        <div class="msg-row">
                            <div class="msg-avatar">
                                <img class="typing-avatar" src="${APP_CONFIG.DEFAULT_AVATAR}" alt="typing avatar">
                            </div>
                            <div class="msg-bubble typing-bubble" aria-label="Typing">
                                <span class="typing-dots">
                                    <span class="typing-dot"></span>
                                    <span class="typing-dot"></span>
                                    <span class="typing-dot"></span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="chat-input-area" id="chat-input-area-${conv.conversationId}">
                <div class="chat-window-attachment-preview" id="chat-window-preview-${conv.conversationId}"></div>
                
                <div class="chat-window-emoji-container" id="chat-emoji-container-${conv.conversationId}"></div>

                <div class="chat-input-wrapper">
                    <div class="chat-window-input-actions">
                         <button class="chat-toggle-actions" onclick="event.stopPropagation(); ChatWindow.toggleExpansionMenu('${conv.conversationId}')">
                            <i data-lucide="plus-circle"></i>
                        </button>
                        <div class="chat-actions-group" id="chat-actions-group-${conv.conversationId}">
                               <button class="chat-action-btn" title="Emoji" onclick="ChatWindow.openEmojiPicker(this, '${conv.conversationId}')">
                                    <i data-lucide="smile"></i>
                                </button>
                                <button class="chat-action-btn" title="Media" onclick="ChatWindow.openFilePicker('${conv.conversationId}')">
                                    <i data-lucide="image"></i>
                                </button>
                                <button class="chat-action-btn" title="File" onclick="ChatWindow.openDocumentPicker('${conv.conversationId}')">
                                    <i data-lucide="paperclip"></i>
                                </button>
                        </div>
                    </div>

                    <div class="chat-input-field" contenteditable="true" placeholder="Type a message..." 
                         oninput="ChatWindow.handleInput(this, '${conv.conversationId}')"
                         onkeydown="ChatWindow.handleKeyDown(event, '${conv.conversationId}')"
                         onpaste="ChatWindow.handlePaste(event)"
                         data-placeholder-visible="true"></div>
                    
                    <div class="chat-input-actions-end">
                        <button class="chat-send-btn" id="send-btn-${conv.conversationId}" disabled onclick="ChatWindow.sendMessage('${conv.conversationId}')">
                            <i data-lucide="send"></i>
                        </button>
                    </div>
                </div>
                <input type="file" id="chat-file-input-${conv.conversationId}" class="chat-window-file-input" multiple accept="image/*,video/*">
                <input type="file" id="chat-doc-input-${conv.conversationId}" class="chat-window-doc-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-rar-compressed,application/x-7z-compressed">
            </div>
        `;

    stack.appendChild(chatBox);
    setTimeout(() => chatBox.classList.add("show"), 10);

    // Render Lucide icons for the new box
    if (window.lucide) window.lucide.createIcons();

    const chatObj = {
      element: chatBox,
      bubbleElement: null,
      data: conv,
      minimized: false,
      unreadCount:
        this.getSyncUnreadCount(conv.conversationId) || conv.unreadCount || 0,
      page: null,
      hasMore: true,
      isLoading: false,
      pendingFiles: [],
      _realtimeJoined: false,
      _realtimeJoining: false,
      runtimeCtx: null,
      _replyToMessageId: null,
      _replySenderName: null,
      _replyContentPreview: null,
      _replySenderId: null,
      _replyIsOwn: false,
    };
    this.openChats.set(conv.conversationId, chatObj);
    this.getRuntimeCtx(conv.conversationId, chatObj);

    const fileInput = chatBox.querySelector(
      `#chat-file-input-${conv.conversationId}`,
    );
    if (fileInput) {
      fileInput.onchange = () => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          this.handleMediaUpload(conv.conversationId, files, { source: "media" });
          fileInput.value = "";
        }
      };
    }

    const docInput = chatBox.querySelector(`#chat-doc-input-${conv.conversationId}`);
    if (docInput) {
      docInput.onchange = () => {
        const files = docInput.files;
        if (files && files.length > 0) {
          this.handleMediaUpload(conv.conversationId, files, { source: "file" });
          docInput.value = "";
        }
      };
    }

    lucide.createIcons();
    this.loadInitialMessages(conv.conversationId);
    // Initial focus - only if requested
    if (shouldFocus) {
      setTimeout(() => this.focusChat(conv.conversationId), 100);
    }
  },

  renderBubble(id, data) {
    const stack = document.getElementById("chat-bubbles-stack");
    if (!stack) return;

    // Prevent duplicates in DOM
    const existing = document.getElementById(`chat-bubble-${id}`);
    if (existing) {
      // Already there, just ensure Map is in sync
      let chat = this.openChats.get(id);
      if (chat) {
        chat.bubbleElement = existing;
        chat.minimized = true;
      }
      return;
    }

    const avatar = ChatCommon.getAvatar(data);
    const name = ChatCommon.getDisplayName(data);

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.id = `chat-bubble-${id}`;
    bubble.dataset.id = id;
    bubble.onclick = () => this.toggleMinimize(id);

    const escapedName = escapeHtml(name);

    bubble.innerHTML = `
            <img src="${avatar}" alt="${escapedName}" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
            <div class="chat-bubble-name">${escapedName}</div>
            ${!data.isGroup && data.otherMember?.isActive ? '<div class="chat-bubble-status"></div>' : ""}
            <button class="chat-bubble-close" title="Close" onclick="event.stopPropagation(); ChatWindow.closeChat('${id}')">
                <i data-lucide="x"></i>
            </button>
        `;

    // Add unread badge if exists
    const chatObj = this.openChats.get(id);
    const unreadCount = chatObj?.unreadCount ?? data?.unreadCount ?? 0;
    if (unreadCount > 0) {
      const badge = document.createElement("div");
      badge.className = "chat-bubble-unread";
      badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
      bubble.appendChild(badge);
    }

    stack.appendChild(bubble);
    if (window.lucide) window.lucide.createIcons();

    let chat = this.openChats.get(id);
    if (!chat) {
      // Check Total Limit before adding a NEW one (even as a bubble)
      if (this.openChats.size >= this.maxTotalWindows) {
        const oldestId = Array.from(this.openChats.keys())[0];
        if (oldestId) this.closeChat(oldestId);
      }

      chat = {
        element: null,
        bubbleElement: bubble,
        data: data,
        minimized: true,
        unreadCount: data?.unreadCount || 0,
        page: null,
        hasMore: true,
        isLoading: false,
        pendingFiles: [],
        _realtimeJoined: false,
        _realtimeJoining: false,
        runtimeCtx: null,
      };
      this.openChats.set(id, chat);
      this.getRuntimeCtx(id, chat);
      this.tryJoinRealtimeConversation(id, chat);
    } else {
      chat.bubbleElement = bubble;
      if (data) {
        chat.data = data;
      }
      chat.minimized = true;
      this.getRuntimeCtx(id, chat);
      this.tryJoinRealtimeConversation(id, chat);
    }
  },

  toggleMinimize(id, shouldFocus = true) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    if (!chat.minimized) {
      // Into bubble
      if (chat.element) {
        chat.element.classList.remove("show");
        setTimeout(() => {
          chat.element.style.display = "none";
          this.renderBubble(id, chat.data);
        }, 300);
      }
      chat.minimized = true;
      chat.element?.classList.remove("is-focused");
    } else {
      // Out of bubble (Become Window)
      // If we are at window limit, minimize the oldest window first
      const openWindowsCount = Array.from(this.openChats.values()).filter(
        (c) => !c.minimized,
      ).length;
      if (openWindowsCount >= this.maxOpenWindows) {
        const oldestWindowId = Array.from(this.openChats.entries()).find(
          ([id, c]) => !c.minimized,
        )?.[0];
        if (oldestWindowId) this.toggleMinimize(oldestWindowId);
      }

      if (chat.bubbleElement) {
        chat.bubbleElement.remove();
        chat.bubbleElement = null;
      }
      if (chat.element) {
        chat.element.style.display = "flex";
        setTimeout(() => {
          chat.element.classList.add("show");
          if (shouldFocus) this.focusChat(id);
        }, 10);
      } else {
        this.renderChatBox(chat.data, shouldFocus);
        // focusChat is already inside renderChatBox's loadInitialMessages / timeout
      }
      chat.minimized = false;
    }
    this.saveState();
  },

  focusInputField(id) {
    const chat = this.openChats.get(id);
    if (!chat || chat.minimized || !chat.element) return;

    const inputField = chat.element.querySelector(".chat-input-field");
    if (!inputField) return;

    inputField.focus();

    // Keep caret visible at the end so typing can continue immediately.
    if (inputField.isContentEditable) {
      const selection = window.getSelection && window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(inputField);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  },

  focusChat(id) {
    const chat = this.openChats.get(id);
    if (!chat || chat.minimized) return;
    const chatBox = chat.element;

    // Remove unread state
    chatBox.classList.remove("has-unread");
    if (chat.unreadCount > 0) {
      chat.unreadCount = 0;
      this.saveState();
    }

    // Remove focus from all others
    document.querySelectorAll(".chat-box.is-focused").forEach((b) => {
      if (b !== chatBox) b.classList.remove("is-focused");
    });

    if (!chatBox.classList.contains("is-focused")) {
      chatBox.classList.add("is-focused");

      // Mark as seen on focus
      const lastId = this.getLastMessageId(id);
      if (lastId) this.markConversationSeen(id, lastId);
    }

    // Auto-focus input with visible caret.
    this.focusInputField(id);
  },

  closeChat(id) {
    const chat = this.openChats.get(id);
    if (chat) {
      this.pendingSeenByConv.delete(id.toLowerCase());
      this.revokePreviewBlobUrls(id);
      chat.pendingFiles = [];
      chat.runtimeCtx = null;
      // Cleanup typing timers
      if (window.ChatTyping) ChatTyping.cleanup(id);
      if (chat.element) {
        chat.element.querySelectorAll("[data-temp-id]").forEach((el) => {
          if (el.dataset.tempId) this.cleanupMessageBlobUrls(el.dataset.tempId);
        });
      }
      // Leave the SignalR group
      if (
        chat._realtimeJoined &&
        this.isGuidConversationId(id) &&
        window.ChatRealtime &&
        typeof window.ChatRealtime.leaveConversation === "function"
      ) {
        window.ChatRealtime.leaveConversation(id);
        chat._realtimeJoined = false;
      }
      chat._realtimeJoining = false;

      if (chat.element) {
        chat.element.classList.remove("show");
        setTimeout(() => {
          chat.element.remove();
          if (chat.bubbleElement) chat.bubbleElement.remove();
          this.openChats.delete(id);
          this.saveState();
        }, 300);
      } else {
        if (chat.bubbleElement) chat.bubbleElement.remove();
        this.openChats.delete(id);
        this.saveState();
      }
    }
  },

  removeConversation(conversationId) {
    const openId = this.getOpenChatId(conversationId) || conversationId;
    if (!openId || !this.openChats.has(openId)) return false;
    this.closeChat(openId);
    return true;
  },

  setMuteStatus(conversationId, isMuted) {
    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = this.openChats.get(openId);
    if (!chat) return false;

    chat.data = chat.data || {};
    chat.data.isMuted = !!isMuted;
    chat.data.IsMuted = !!isMuted;
    this.saveState();
    return true;
  },

  setThemeStatus(conversationId, theme) {
    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = this.openChats.get(openId);
    if (!chat) return false;

    const normalizeTheme = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.resolveConversationTheme === "function"
      ) {
        return window.ChatCommon.resolveConversationTheme(value);
      }
      if (typeof value !== "string") return null;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length ? trimmed : null;
    };

    const previousTheme = normalizeTheme(chat.data?.theme ?? chat.data?.Theme);
    const nextTheme = normalizeTheme(theme);

    chat.data = chat.data || {};
    chat.data.theme = nextTheme;
    chat.data.Theme = nextTheme;

    if (
      chat.element &&
      window.ChatCommon &&
      typeof window.ChatCommon.applyConversationTheme === "function"
    ) {
      window.ChatCommon.applyConversationTheme(chat.element, nextTheme);
    }

    this.saveState();
    return previousTheme !== nextTheme;
  },

  reapplyAllConversationThemes() {
    if (
      !window.ChatCommon ||
      typeof window.ChatCommon.applyConversationTheme !== "function"
    )
      return;
    for (const [, chat] of this.openChats.entries()) {
      if (!chat?.element) continue;
      const theme = chat.data?.theme ?? chat.data?.Theme ?? null;
      window.ChatCommon.applyConversationTheme(chat.element, theme);
    }
  },

  applyNicknameUpdate(conversationId, accountId, nickname) {
    const openId = this.getOpenChatId(conversationId) || conversationId;
    const chat = this.openChats.get(openId);
    if (!chat || !chat.data) return false;

    const accTarget = (accountId || "").toLowerCase();
    if (!accTarget) return false;

    const normalizeNickname = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.normalizeNickname === "function"
      ) {
        return window.ChatCommon.normalizeNickname(value);
      }
      if (typeof value !== "string") return value ?? null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };
    const normalizedNickname = normalizeNickname(nickname);
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const resolveBaseDisplayName = () => {
      if (accTarget === myId) {
        return (
          localStorage.getItem("username") ||
          localStorage.getItem("fullname") ||
          "You"
        );
      }

      if (
        chat.data.otherMember &&
        (chat.data.otherMember.accountId || "").toLowerCase() === accTarget
      ) {
        return (
          chat.data.otherMember.username ||
          chat.data.otherMember.Username ||
          chat.data.otherMember.fullName ||
          chat.data.otherMember.FullName ||
          chat.data.otherMember.displayName ||
          chat.data.otherMember.DisplayName ||
          "User"
        );
      }

      if (Array.isArray(chat.data.members)) {
        const member = chat.data.members.find(
          (m) =>
            (m.accountId || m.AccountId || "").toString().toLowerCase() ===
            accTarget,
        );
        if (member) {
          return (
            member.username ||
            member.userName ||
            member.Username ||
            member.UserName ||
            member.fullName ||
            member.FullName ||
            member.displayName ||
            member.DisplayName ||
            "User"
          );
        }
      }

      return "User";
    };
    const fallbackDisplayName = resolveBaseDisplayName();

    let changed = false;

    // Handle direct otherMember (Private chat)
    if (
      chat.data.otherMember &&
      (chat.data.otherMember.accountId || "").toLowerCase() === accTarget
    ) {
      chat.data.otherMember.nickname = normalizedNickname;
      if (chat.data.otherMember.displayName !== undefined) {
        chat.data.otherMember.displayName =
          normalizedNickname || fallbackDisplayName;
      }
      changed = true;
    }

    // Handle my own nickname
    if (accTarget === myId) {
      chat.data.myNickname = normalizedNickname;
      changed = true;
    }

    // Handle group members
    if (Array.isArray(chat.data.members)) {
      chat.data.members.forEach((m) => {
        if (
          (m.accountId || m.AccountId || "").toString().toLowerCase() ===
          accTarget
        ) {
          const memberBaseName =
            m.username ||
            m.userName ||
            m.Username ||
            m.UserName ||
            m.fullName ||
            m.FullName ||
            fallbackDisplayName;
          m.nickname = normalizedNickname;
          m.displayName = normalizedNickname || memberBaseName || "User";
          changed = true;
        }
      });
    }

    if (Array.isArray(chat.data.memberSeenStatuses)) {
      chat.data.memberSeenStatuses.forEach((m) => {
        if (
          (m.accountId || m.AccountId || "").toString().toLowerCase() !==
          accTarget
        )
          return;
        m.displayName = normalizedNickname || fallbackDisplayName;
        changed = true;
      });
    }

    let domChanged = false;

    const msgContainer = document.getElementById(`chat-messages-${openId}`);
    if (msgContainer) {
      msgContainer
        .querySelectorAll(
          `.seen-avatar-wrapper[data-account-id="${accTarget}"] .seen-avatar-name`,
        )
        .forEach((el) => {
          el.textContent = normalizedNickname || fallbackDisplayName;
          domChanged = true;
        });

      msgContainer
        .querySelectorAll(`.msg-reply-preview[data-reply-sender-id="${accTarget}"]`)
        .forEach((previewEl) => {
          const authorEl = previewEl.querySelector(".msg-reply-author");
          if (!authorEl) return;

          const isOwnReplyAuthor =
            (previewEl.dataset.replyIsOwn || "").toLowerCase() === "true" ||
            accTarget === myId;
          if (isOwnReplyAuthor) {
            authorEl.textContent = "You";
            domChanged = true;
            return;
          }

          const baseName =
            previewEl.dataset.replySenderBase || fallbackDisplayName || "User";
          authorEl.textContent = normalizedNickname || baseName;
          domChanged = true;
        });
    }

    if ((chat._replyToMessageId || '').toString().toLowerCase()
      && (chat._replySenderId || '').toString().toLowerCase() === accTarget) {
      const isOwnReplyAuthor = !!chat._replyIsOwn || accTarget === myId;
      const nextReplySenderName = isOwnReplyAuthor
        ? 'yourself'
        : (normalizedNickname || fallbackDisplayName || chat._replySenderName || 'User');
      chat._replySenderName = nextReplySenderName;

      const inputArea = document.getElementById(`chat-input-area-${openId}`);
      const labelStrong = inputArea?.querySelector('.chat-reply-bar .chat-reply-bar-label strong');
      if (labelStrong) {
        labelStrong.textContent = nextReplySenderName;
        domChanged = true;
      }
    }

    if (!changed && !domChanged) return false;

    const nextName = ChatCommon.getDisplayName(chat.data);
    if (chat.element) {
      const headerName = chat.element.querySelector(".chat-header-name");
      if (headerName) {
        headerName.textContent = nextName;
        headerName.setAttribute("title", nextName);
      }
    }
    if (chat.bubbleElement) {
      const bubbleName = chat.bubbleElement.querySelector(".chat-bubble-name");
      if (bubbleName) bubbleName.textContent = nextName;
    }
    this.saveState();
    return true;
  },

  minimizeAll() {
    for (const [id, chat] of this.openChats.entries()) {
      if (!chat.minimized) {
        this.toggleMinimize(id);
      }
    }
  },

  closeAll() {
    for (const id of Array.from(this.openChats.keys())) {
      this.closeChat(id);
    }
    localStorage.removeItem("SOCIAL_NETWORK_OPEN_CHATS");
  },

  /**
   * Synchronize the internal openChats Map order with the DOM order of Windows.
   * This keeps the internal state and the bubble stack in sync.
   */
  syncChatOrderFromWindows() {
    const windowsStack = document.getElementById("chat-windows-stack");
    if (!windowsStack) return;

    const windowIds = Array.from(windowsStack.children).map(
      (c) => c.dataset.id,
    );
    const newMap = new Map();
    const existingMap = new Map(this.openChats);

    // 1. Add windows in their new DOM order
    windowIds.forEach((id) => {
      const chatObj = existingMap.get(id);
      if (chatObj) {
        newMap.set(id, chatObj);
        existingMap.delete(id);
      }
    });

    // 2. Add remaining (bubbles that might not be in the windows stack yet)
    for (const [id, chatObj] of existingMap.entries()) {
      newMap.set(id, chatObj);
    }

    this.openChats = newMap;
    this.saveState();
    this.reorderBubblesDOM();
  },

  /**
   * Re-orders the chat windows in the DOM to match the insertion order of openChats.
   */
  reorderWindowsDOM() {
    const stack = document.getElementById("chat-windows-stack");
    if (!stack) return;

    const children = Array.from(stack.children);
    const order = Array.from(this.openChats.keys());

    children.sort((a, b) => {
      const idA = a.dataset.id;
      const idB = b.dataset.id;
      return order.indexOf(idA) - order.indexOf(idB);
    });

    // Append in sorted order (Right-to-Left due to row-reverse flex)
    children.forEach((child) => {
      stack.appendChild(child);
      const id = child.dataset.id;
      if (id) this.scrollToBottom(id);
    });
  },

  /**
   * Re-orders the bubbles in the DOM to match the insertion order of openChats.
   * Maps in JS preserve insertion order.
   */
  reorderBubblesDOM() {
    const stack = document.getElementById("chat-bubbles-stack");
    if (!stack) return;

    const children = Array.from(stack.children);
    const order = Array.from(this.openChats.keys());

    children.sort((a, b) => {
      const idA = a.dataset.id;
      const idB = b.dataset.id;
      return order.indexOf(idA) - order.indexOf(idB);
    });

    // Append in sorted order
    children.forEach((child) => stack.appendChild(child));
  },

  // ── Typing Indicator (delegates to shared ChatTyping) ──

  handleTypingEvent(data) {
    if (!window.ChatTyping) return;
    const conversationId = (data?.conversationId || data?.ConversationId || "")
      .toString()
      .toLowerCase();
    const accountId = (data?.accountId || data?.AccountId || "")
      .toString()
      .toLowerCase();
    const isTyping =
      typeof data?.isTyping === "boolean"
        ? data.isTyping
        : typeof data?.IsTyping === "boolean"
          ? data.IsTyping
          : false;
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    if (accountId === myId) return;
    if (!conversationId) return;

    const chatId = this.getOpenChatId(conversationId) || conversationId;
    const chat = this.openChats.get(chatId);
    if (!chat) return;

    if (isTyping) {
      ChatTyping.showIndicator(`typing-indicator-${chatId}`, chatId, {
        accountId,
        metaData: chat.data,
      });
    } else {
      ChatTyping.hideIndicator(`typing-indicator-${chatId}`, chatId);
    }
  },

  handleThemeEvent(data) {
    const conversationId = (data?.conversationId || data?.ConversationId || "")
      .toString()
      .toLowerCase();
    if (!conversationId) return;

    const normalizeTheme = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.resolveConversationTheme === "function"
      ) {
        return window.ChatCommon.resolveConversationTheme(value);
      }
      if (typeof value !== "string") return null;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length ? trimmed : null;
    };
    const theme = normalizeTheme(data?.theme ?? data?.Theme);

    this.setThemeStatus(conversationId, theme);
    if (
      window.ChatSidebar &&
      typeof window.ChatSidebar.applyThemeUpdate === "function"
    ) {
      window.ChatSidebar.applyThemeUpdate(conversationId, theme);
    }
    if (
      window.ChatPage &&
      typeof window.ChatPage.applyThemeStatus === "function"
    ) {
      window.ChatPage.applyThemeStatus(conversationId, theme);
    }
  },

  handleInput(field, id) {
    this.updateSendButtonState(id);
    this.updatePlaceholderState(field);

    // Auto-resize
    field.style.height = "auto";
    const newHeight = field.scrollHeight;

    const wrapper = field.closest(".chat-input-wrapper");
    const container = field.closest(".chat-input-area");

    if (wrapper) {
      wrapper.classList.toggle("expanded", newHeight > 34);
    }

    if (container) {
      const hasText = field.innerText.trim().length > 0;
      container.classList.toggle("has-content", hasText);

      // If has content, automatically hide action icons unless expanded
      if (hasText) {
        const actionsGroup = container.querySelector(".chat-actions-group");
        if (actionsGroup) actionsGroup.classList.remove("is-show");
      }
    }

    // Emit typing event (debounced)
    if (window.ChatTyping && this.isGuidConversationId(id)) {
      ChatTyping.emitTyping(id);
    }
  },

  updatePlaceholderState(field) {
    const text = field.innerText.trim();
    // If it's effectively empty (handling <br> or whitespace), mark it
    const isEmpty = text.length === 0;
    field.dataset.placeholderVisible = isEmpty ? "true" : "false";

    // Ensure it's truly empty if effectively empty (removes <br>)
    if (isEmpty && field.innerHTML !== "") {
      field.innerHTML = "";
    }
  },

  resetInput(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;
    const inputField = chat.element.querySelector(".chat-input-field");
    if (!inputField) return;

    inputField.innerHTML = ""; // Clear everything
    inputField.style.height = "auto";
    inputField.dataset.placeholderVisible = "true";

    const wrapper = inputField.closest(".chat-input-wrapper");
    if (wrapper) wrapper.classList.remove("expanded");

    this.updateSendButtonState(id);
  },

  handleKeyDown(event, id) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(id);
    }
  },

  handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  },

  toggleExpansionMenu(id) {
    const container = document.getElementById(`chat-input-area-${id}`);
    const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
    if (!actionsGroup) return;

    actionsGroup.classList.toggle("is-show");

    // Close when clicking outside
    if (actionsGroup.classList.contains("is-show")) {
      const closeHandler = (e) => {
        if (
          !actionsGroup.contains(e.target) &&
          !e.target.closest(".chat-toggle-actions")
        ) {
          actionsGroup.classList.remove("is-show");
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }
  },

  closeHeaderMenu() {
    document
      .querySelectorAll(".chat-window-header-menu")
      .forEach((m) => m.remove());
  },

  toggleHeaderMenu(triggerEl, id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    // Close ANY message more-menus if open
    if (
      window.ChatActions &&
      typeof window.ChatActions.closeAllMenus === "function"
    ) {
      window.ChatActions.closeAllMenus();
    }

    const globalClick = (e) => {
      if (
        !e.target.closest(".chat-window-header-menu") &&
        !e.target.closest(".chat-header-info")
      ) {
        this.closeHeaderMenu();
        document.removeEventListener("click", globalClick);
      }
    };

    // If already open, close it
    const existing = document.getElementById(`chat-header-menu-${id}`);
    if (existing) {
      this.closeHeaderMenu();
      return;
    }

    // Close others first
    this.closeHeaderMenu();

    const otherMember = chat.data.otherMember;
    const otherAccountId = otherMember?.accountId || "";

    const isGroup = !!chat.data.isGroup;
    const isMuted = !!chat.data.isMuted;
    const muteIcon = isMuted ? "bell" : "bell-off";
    const muteText = isMuted ? "Unmute" : "Mute";

    const menu = document.createElement("div");
    menu.id = `chat-header-menu-${id}`;
    menu.className = "chat-window-header-menu";

    menu.innerHTML = `
            <div class="chat-menu-group">
                <button class="chat-menu-item" onclick="ChatWindow.closeHeaderMenu(); window.location.hash = '#/profile/${otherAccountId}';">
                    <i data-lucide="user"></i>
                    <span>View profile</span>
                </button>
                <button class="chat-menu-item" onclick="ChatWindow.closeHeaderMenu(); ChatWindow.openPinnedMessages('${id}')">
                    <i data-lucide="pin"></i>
                    <span>View pinned messages</span>
                </button>
            </div>
            <div class="chat-menu-group">
                <button class="chat-menu-item" onclick="ChatWindow.closeHeaderMenu(); ChatWindow.promptChangeTheme('${id}')">
                    <i data-lucide="palette"></i>
                    <span>Change theme</span>
                </button>
                <button class="chat-menu-item" onclick="ChatWindow.closeHeaderMenu(); ChatWindow.promptEditNicknames('${id}')">
                    <i data-lucide="at-sign"></i>
                    <span>Edit nicknames</span>
                </button>
            </div>
            <div class="chat-menu-group">
                <button class="chat-menu-item" onclick="ChatWindow.closeHeaderMenu(); ChatWindow.toggleMute('${id}')">
                    <i data-lucide="${muteIcon}"></i>
                    <span>${muteText} notifications</span>
                </button>
                ${
                  !isGroup
                    ? `
                <button class="chat-menu-item danger" onclick="ChatWindow.closeHeaderMenu(); window.toastInfo('Block feature coming soon')">
                    <i data-lucide="ban"></i>
                    <span>Block</span>
                </button>
                `
                    : ""
                }
            </div>
        `;

    // Position it relative to the triggerEl
    chat.element.appendChild(menu);

    if (window.lucide)
      lucide.createIcons({ container: menu, props: { size: 16 } });

    setTimeout(() => {
      menu.classList.add("show");
      document.addEventListener("click", globalClick);
    }, 10);
  },

  async toggleMute(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    if (!this.isGuidConversationId(id)) {
      if (window.toastInfo)
        window.toastInfo("Mute can be changed after conversation is created");
      return;
    }

    const previousMuted = !!(chat.data?.isMuted ?? chat.data?.IsMuted);
    const nextMuted = !previousMuted;

    this.setMuteStatus(id, nextMuted);
    if (
      window.ChatSidebar &&
      typeof window.ChatSidebar.setMuteStatus === "function"
    ) {
      window.ChatSidebar.setMuteStatus(id, nextMuted, { forceRender: true });
    }
    if (
      window.ChatPage &&
      typeof window.ChatPage.applyMuteStatus === "function"
    ) {
      window.ChatPage.applyMuteStatus(id, nextMuted);
    }

    try {
      const res = await window.API.Conversations.updateMute(id, nextMuted);
      if (!res.ok) {
        this.setMuteStatus(id, previousMuted);
        if (
          window.ChatSidebar &&
          typeof window.ChatSidebar.setMuteStatus === "function"
        ) {
          window.ChatSidebar.setMuteStatus(id, previousMuted, {
            forceRender: true,
          });
        }
        if (
          window.ChatPage &&
          typeof window.ChatPage.applyMuteStatus === "function"
        ) {
          window.ChatPage.applyMuteStatus(id, previousMuted);
        }
        if (window.toastError)
          window.toastError("Failed to update mute status");
        return;
      }

      if (window.toastSuccess) {
        window.toastSuccess(
          nextMuted ? "Conversation muted" : "Conversation unmuted",
        );
      }
    } catch (error) {
      console.error("Failed to update mute status:", error);
      this.setMuteStatus(id, previousMuted);
      if (
        window.ChatSidebar &&
        typeof window.ChatSidebar.setMuteStatus === "function"
      ) {
        window.ChatSidebar.setMuteStatus(id, previousMuted, {
          forceRender: true,
        });
      }
      if (
        window.ChatPage &&
        typeof window.ChatPage.applyMuteStatus === "function"
      ) {
        window.ChatPage.applyMuteStatus(id, previousMuted);
      }
      if (window.toastError) window.toastError("Failed to update mute status");
    }
  },

  openPinnedMessages(id) {
    const normalizedId = (id || "").toString().toLowerCase();
    if (
      !window.ChatActions ||
      typeof window.ChatActions.showPinnedMessages !== "function"
    ) {
      if (window.toastError) window.toastError("Pinned messages are unavailable");
      return;
    }

    const title =
      typeof window.ChatActions.getPinnedConversationTitle === "function"
        ? window.ChatActions.getPinnedConversationTitle(normalizedId)
        : "Pinned messages";
    window.ChatActions.showPinnedMessages(normalizedId, { title });
  },

  promptChangeTheme(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    const menu = document.getElementById(`chat-header-menu-${id}`);
    if (menu) menu.remove();

    if (!this.isGuidConversationId(id)) {
      if (window.toastInfo)
        window.toastInfo("Theme can be changed after conversation is created");
      return;
    }

    if (
      !window.ChatCommon ||
      typeof window.ChatCommon.showThemePicker !== "function"
    ) {
      if (window.toastError) window.toastError("Theme picker is unavailable");
      return;
    }

    const getNormalizedTheme = (value) => {
      if (
        window.ChatCommon &&
        typeof window.ChatCommon.resolveConversationTheme === "function"
      ) {
        return window.ChatCommon.resolveConversationTheme(value);
      }
      if (typeof value !== "string") return null;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length ? trimmed : null;
    };

    const previousTheme = getNormalizedTheme(
      chat.data?.theme ?? chat.data?.Theme,
    );
    window.ChatCommon.showThemePicker({
      title: "Change theme",
      currentTheme: previousTheme,
      onSelect: async (nextTheme) => {
        const normalizedNext = getNormalizedTheme(nextTheme);
        if (normalizedNext === previousTheme) return;

        this.setThemeStatus(id, normalizedNext);
        if (
          window.ChatSidebar &&
          typeof window.ChatSidebar.applyThemeUpdate === "function"
        ) {
          window.ChatSidebar.applyThemeUpdate(id, normalizedNext);
        }
        if (
          window.ChatPage &&
          typeof window.ChatPage.applyThemeStatus === "function"
        ) {
          window.ChatPage.applyThemeStatus(id, normalizedNext);
        }

        try {
          const res = await window.API.Conversations.updateTheme(
            id,
            normalizedNext,
          );
          if (!res.ok) {
            this.setThemeStatus(id, previousTheme);
            if (
              window.ChatSidebar &&
              typeof window.ChatSidebar.applyThemeUpdate === "function"
            ) {
              window.ChatSidebar.applyThemeUpdate(id, previousTheme);
            }
            if (
              window.ChatPage &&
              typeof window.ChatPage.applyThemeStatus === "function"
            ) {
              window.ChatPage.applyThemeStatus(id, previousTheme);
            }
            if (window.toastError) window.toastError("Failed to update theme");
            return;
          }
          if (window.toastSuccess) window.toastSuccess("Theme updated");
        } catch (error) {
          console.error("Failed to update theme:", error);
          this.setThemeStatus(id, previousTheme);
          if (
            window.ChatSidebar &&
            typeof window.ChatSidebar.applyThemeUpdate === "function"
          ) {
            window.ChatSidebar.applyThemeUpdate(id, previousTheme);
          }
          if (
            window.ChatPage &&
            typeof window.ChatPage.applyThemeStatus === "function"
          ) {
            window.ChatPage.applyThemeStatus(id, previousTheme);
          }
          if (window.toastError) window.toastError("Failed to update theme");
        }
      },
    });
  },

  promptEditNicknames(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    // Close menu
    const menu = document.getElementById(`chat-header-menu-${id}`);
    if (menu) menu.remove();

    // This assumes we have a way to call the same logic as chat-page
    // We can reuse the ChatCommon logic we just implemented
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const myName = localStorage.getItem("fullname") || "You";
    const myUsername = localStorage.getItem("username") || "";
    const myAvatar =
      localStorage.getItem("avatarUrl") || window.APP_CONFIG?.DEFAULT_AVATAR;

    let members = [];
    if (Array.isArray(chat.data.members)) {
      members = chat.data.members.map((m) =>
        ChatCommon.normalizeConversationMember(m, {
          fallbackUsernameToDisplayName: true,
        }),
      );
    }

    if (!members.length && chat.data.otherMember) {
      members.push(
        ChatCommon.normalizeConversationMember(chat.data.otherMember, {
          fallbackUsernameToDisplayName: true,
        }),
      );
    }

    if (!members.find((m) => m.accountId === myId)) {
      members.unshift(
        ChatCommon.normalizeConversationMember({
          accountId: myId,
          displayName: myName,
          username: myUsername,
          avatarUrl: myAvatar,
          nickname: chat.data.myNickname || null,
        }),
      );
    }

    ChatCommon.showNicknamesModal({
      title: "Nicknames",
      members: members,
      conversationId: id,
      onNicknameUpdated: (accId, next) => {
        this.applyNicknameUpdate(id, accId, next);
        if (window.ChatPage && window.ChatPage.currentChatId === id) {
          window.ChatPage.applyNicknameUpdate(id, accId, next);
        }
        if (window.ChatSidebar) {
          window.ChatSidebar.applyNicknameUpdate(id, accId, next);
        }
      },
    });
  },

  confirmDeleteChat(id) {
    const menu = document.getElementById(`chat-header-menu-${id}`);
    if (menu) menu.remove();

    ChatCommon.showConfirm({
      title: "Delete chat?",
      message:
        "You will lose all messages in this conversation. This action cannot be undone.",
      confirmText: "Delete",
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await window.API.Conversations.delete(id);
          if (res.ok) {
            this.closeChat(id);
            if (window.ChatSidebar) window.ChatSidebar.removeConversation(id);
            if (window.ChatPage && window.ChatPage.currentChatId === id) {
              window.ChatPage.closeChat();
            }
            window.toastSuccess && window.toastSuccess("Chat deleted");
          }
        } catch (err) {
          console.error("Delete error:", err);
        }
      },
    });
  },

  openEmojiPicker(btn, id) {
    const container = document.getElementById(`chat-emoji-container-${id}`);
    if (!container || !window.EmojiUtils) return;

    // Hide expansion menu first
    const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
    if (actionsGroup) actionsGroup.classList.remove("is-show");

    window.EmojiUtils.togglePicker(container, (emoji) => {
      const inputField = document.querySelector(
        `#chat-box-${id} .chat-input-field`,
      );
      if (inputField) {
        // Focus input first
        inputField.focus();
        document.execCommand("insertText", false, emoji.native);
        this.handleInput(inputField, id);
      }
    });
  },

  openFilePicker(id) {
    const input = document.getElementById(`chat-file-input-${id}`);
    if (input) input.click();

    // Hide expansion menu
    const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
    if (actionsGroup) actionsGroup.classList.remove("is-show");
  },

  openDocumentPicker(id) {
    const input = document.getElementById(`chat-doc-input-${id}`);
    if (input) input.click();

    // Hide expansion menu
    const actionsGroup = document.getElementById(`chat-actions-group-${id}`);
    if (actionsGroup) actionsGroup.classList.remove("is-show");
  },

  getPendingMediaType(file) {
    if (!file) return 0;
    const mime = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();

    if (mime.startsWith("video/")) return 1;
    if (mime.startsWith("image/")) return 0;

    const documentExtRegex = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z)$/i;
    const documentMimeSet = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "application/zip",
      "application/x-zip-compressed",
      "application/x-rar-compressed",
      "application/vnd.rar",
      "application/x-7z-compressed",
    ]);

    if (documentMimeSet.has(mime) || documentExtRegex.test(fileName)) return 3;
    return 0;
  },

  formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const display = size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
    return `${display} ${units[unitIndex]}`;
  },

  updateSendButtonState(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;
    const inputField = chat.element.querySelector(".chat-input-field");
    const sendBtn = document.getElementById(`send-btn-${id}`);
    const hasText = inputField?.innerText.trim().length > 0;
    const hasFiles = chat.pendingFiles && chat.pendingFiles.length > 0;
    if (sendBtn) sendBtn.disabled = !(hasText || hasFiles);
  },

  handleMediaUpload(id, files, options = {}) {
    const chat = this.openChats.get(id);
    if (!chat || !files || files.length === 0) return;

    const maxFiles = window.APP_CONFIG?.MAX_CHAT_ATTACHMENTS_PER_MESSAGE
      || window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES
      || 5;
    const maxSizeMB = window.APP_CONFIG?.MAX_CHAT_ATTACHMENT_SIZE_MB
      || window.APP_CONFIG?.MAX_CHAT_FILE_SIZE_MB
      || 10;
    const currentCount = chat.pendingFiles.length;
    const source = (options?.source || "media").toString().toLowerCase();
    const documentOnly = source === "file";

    if (currentCount + files.length > maxFiles) {
      if (window.toastError)
        window.toastError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const validFiles = [];
    for (let file of files) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        if (window.toastError)
          window.toastError(
            `Attachment "${file.name}" is too large (Max ${maxSizeMB}MB)`,
          );
        continue;
      }
      const mediaType = this.getPendingMediaType(file);
      if (documentOnly && mediaType !== 3) {
        if (window.toastError)
          window.toastError(`"${file.name}" is not a supported document file`);
        continue;
      }
      if (!documentOnly && mediaType === 3) {
        if (window.toastInfo)
          window.toastInfo(`Use the File button to send "${file.name}"`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    chat.pendingFiles.push(...validFiles);
    this.updateAttachmentPreview(id);
    this.updateSendButtonState(id);
  },

  updateAttachmentPreview(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    const previewEl = document.getElementById(`chat-window-preview-${id}`);
    if (!previewEl) return;
    this.revokePreviewBlobUrls(id);
    previewEl.innerHTML = "";

    chat.pendingFiles.forEach((file, index) => {
      const mediaType = this.getPendingMediaType(file);
      const isVideo = mediaType === 1;
      const isImage = mediaType === 0;
      const isDocument = mediaType === 3;
      const url =
        isVideo || isImage
          ? this.trackBlobUrl(URL.createObjectURL(file), `preview:${id}`)
          : "";
      const safeName = escapeHtml(file.name || "Document");
      const sizeText = this.formatFileSize(file.size);

      const item = document.createElement("div");
      item.className = `chat-window-preview-item${isDocument ? " file" : ""}`;
      if (isVideo) {
        item.innerHTML = `
                  <video src="${url}"></video>
                  <div class="chat-window-preview-remove" onclick="ChatWindow.removeAttachment('${id}', ${index})">
                      <i data-lucide="x"></i>
                  </div>
              `;
      } else if (isImage) {
        item.innerHTML = `
                  <img src="${url}" alt="preview">
                  <div class="chat-window-preview-remove" onclick="ChatWindow.removeAttachment('${id}', ${index})">
                      <i data-lucide="x"></i>
                  </div>
              `;
      } else {
        item.innerHTML = `
                  <div class="chat-window-preview-file-card" title="${safeName}">
                      <div class="chat-window-preview-file-icon"><i data-lucide="file-text"></i></div>
                      <div class="chat-window-preview-file-meta">
                          <div class="chat-window-preview-file-name">${safeName}</div>
                          <div class="chat-window-preview-file-size">${escapeHtml(sizeText || "File")}</div>
                      </div>
                  </div>
                  <div class="chat-window-preview-remove" onclick="ChatWindow.removeAttachment('${id}', ${index})">
                      <i data-lucide="x"></i>
                  </div>
              `;
      }
      previewEl.appendChild(item);
    });

    // Add the "+" button like Facebook Messenger if under limit
    const maxFiles = window.APP_CONFIG?.MAX_CHAT_ATTACHMENTS_PER_MESSAGE
      || window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES
      || 5;
    if (chat.pendingFiles.length > 0 && chat.pendingFiles.length < maxFiles) {
      const hasOnlyDocuments = chat.pendingFiles.every(
        (file) => this.getPendingMediaType(file) === 3,
      );
      const addBtn = document.createElement("div");
      addBtn.className = "chat-window-preview-add-btn";
      addBtn.innerHTML = '<i data-lucide="plus"></i>';
      addBtn.onclick = () => {
        const targetInputId = hasOnlyDocuments
          ? `chat-doc-input-${id}`
          : `chat-file-input-${id}`;
        document.getElementById(targetInputId)?.click();
      };
      previewEl.appendChild(addBtn);
    }

    if (window.lucide) lucide.createIcons();
  },

  removeAttachment(id, index) {
    const chat = this.openChats.get(id);
    if (!chat) return;
    chat.pendingFiles.splice(index, 1);
    this.updateAttachmentPreview(id);
    this.updateSendButtonState(id);
  },

  async loadInitialMessages(id) {
    const msgContainer = document.getElementById(`chat-messages-${id}`);
    if (!msgContainer) return;

    if (id.startsWith("new-")) {
      msgContainer.innerHTML =
        '<div style="padding:20px; font-size:12px; text-align:center; color:var(--text-tertiary);">Say hello!</div>';
      return;
    }

    const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
    const chat = this.openChats.get(id);
    const isGroup = chat?.data?.isGroup || false;
    const myId = (
      localStorage.getItem("accountId") ||
      sessionStorage.getItem("accountId") ||
      window.APP_CONFIG?.CURRENT_USER_ID ||
      ""
    ).toLowerCase();

    try {
      const res = await window.API.Conversations.getMessages(id, null, pageSize);
      if (res.ok) {
        const data = await res.json();
        const messageInfo = data.messages || data.Messages || {};
        const olderCursor = messageInfo.olderCursor ?? messageInfo.OlderCursor ?? null;
        const hasMoreOlder = messageInfo.hasMoreOlder ?? messageInfo.HasMoreOlder ?? false;
        msgContainer.innerHTML = "";
        const messages = (messageInfo.items || messageInfo.Items || []).reverse();

        let lastTime = null;

        messages.forEach((m, idx) => {
          ChatCommon.normalizeMessage(m, myId);

          // Set 'sent' status for the last own non-system message
          if (
            idx === messages.length - 1 &&
            m.isOwn &&
            !ChatCommon.isSystemMessage(m) &&
            !m.isRecalled
          ) {
            m.status = "sent";
          }

          // Time separator (same logic as chat-page: 15 min gap)
          const currentTime = new Date(m.sentAt);
          const gap =
            window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
          if (!lastTime || currentTime - lastTime > gap) {
            this.insertHtmlBeforeTypingIndicator(
              msgContainer,
              ChatCommon.renderChatSeparator(m.sentAt),
            );
          }
          lastTime = currentTime;

          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
          const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

          const senderAvatar = !m.isOwn
            ? m.sender?.avatarUrl || m.sender?.AvatarUrl || ""
            : "";
          const authorName =
            isGroup && !m.isOwn
              ? m.sender?.nickname ||
                m.sender?.Nickname ||
                m.sender?.username ||
                m.sender?.Username ||
                m.sender?.fullName ||
                m.sender?.FullName ||
                ""
              : "";

          const html = ChatCommon.renderMessageBubble(m, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName,
            isWindow: true,
          });

          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = html;
          const bubble = tempDiv.firstElementChild;
          bubble.dataset.sentAt = m.sentAt;
          bubble.dataset.senderId =
            (m.sender?.accountId || m.senderId || "").toLowerCase() ||
            (m.isOwn ? myId : "");
          if (m.status) bubble.dataset.status = m.status;
          this.insertNodeBeforeTypingIndicator(msgContainer, bubble);
        });

        ChatCommon.cleanTimeSeparators(msgContainer);
        if (window.lucide) lucide.createIcons();
        requestAnimationFrame(() => {
          msgContainer.scrollTop = msgContainer.scrollHeight;
        });

        // Update pagination state
        chat.page = olderCursor;
        chat.hasMore = !!hasMoreOlder;

        // Attach scroll listener for load-more
        this.initScrollListener(id);

        // Scroll to bottom
        this.scrollToBottom(id);

        // DO NOT mark as seen immediately on load.
        // Wait for interaction.

        // Update header and metadata with fresh data from server (fix for "stale header" issue)
        if (data.metaData) {
          const chat = this.openChats.get(id);
          if (chat) {
            chat.data = data.metaData;
            this.setThemeStatus(
              id,
              data.metaData.theme ?? data.metaData.Theme ?? null,
            );
            this.getRuntimeCtx(id, chat);
            // If window is open (not bubble), refresh its header UI
            if (chat.element) {
              const nameEl = chat.element.querySelector(".chat-header-name");
              const subtextEl = chat.element.querySelector(
                ".chat-header-subtext",
              );
              const imgEl = chat.element.querySelector(
                ".chat-header-avatar img",
              );

              if (nameEl)
                nameEl.textContent = ChatCommon.getDisplayName(data.metaData);
              if (subtextEl)
                subtextEl.textContent = data.metaData.isGroup
                  ? "Group Chat"
                  : data.metaData.otherMember?.isActive
                    ? "Online"
                    : "Offline";
              if (imgEl) imgEl.src = ChatCommon.getAvatar(data.metaData);
            }
          }
          setTimeout(
            () => this.updateMemberSeenStatuses(id, data.metaData),
            50,
          );
        }
      }
    } catch (error) {
      console.error("Failed to load chat window messages:", error);
      msgContainer.innerHTML =
        '<div style="padding:10px; font-size:11px; text-align:center;">Error loading messages</div>';
    }
  },

  initScrollListener(id) {
    const msgContainer = document.getElementById(`chat-messages-${id}`);
    if (!msgContainer) return;

    msgContainer.onscroll = () => {
      const chat = this.openChats.get(id);
      if (!chat || chat.isLoading) return;

      // Scroll UP → load older
      if (msgContainer.scrollTop <= 30 && chat.hasMore) {
        this.loadMoreMessages(id);
      }

      // Scroll DOWN → load newer (context mode)
      const ctx = this._getContextAdapter(id);
      if (ctx) {
        ChatCommon.contextHandleScroll(ctx, msgContainer);
        // Show/hide jump-to-bottom button based on scroll position
        ChatCommon.updateJumpBtnOnScroll(ctx, msgContainer);
      }
    };
  },

  async loadMoreMessages(id) {
    const chat = this.openChats.get(id);
    const msgContainer = document.getElementById(`chat-messages-${id}`);
    if (!chat || !msgContainer || chat.isLoading || !chat.hasMore) return;

    chat.isLoading = true;
    const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
    const isGroup = chat.data?.isGroup || false;
    const myId = (
      localStorage.getItem("accountId") ||
      sessionStorage.getItem("accountId") ||
      window.APP_CONFIG?.CURRENT_USER_ID ||
      ""
    ).toLowerCase();
    const oldScrollHeight = msgContainer.scrollHeight;

    try {
      const res = await window.API.Conversations.getMessages(
        id,
        chat.page,
        pageSize,
      );
      if (res.ok) {
        const data = await res.json();
        const messageInfo = data.messages || data.Messages || {};
        const olderCursor = messageInfo.olderCursor ?? messageInfo.OlderCursor ?? null;
        const hasMoreOlder = messageInfo.hasMoreOlder ?? messageInfo.HasMoreOlder ?? false;
        const messages = (messageInfo.items || messageInfo.Items || []).reverse();

        chat.page = olderCursor;
        chat.hasMore = !!hasMoreOlder;

        // Build HTML to prepend
        let html = "";
        let lastTime = null;

        messages.forEach((m, idx) => {
          ChatCommon.normalizeMessage(m, myId);

          const currentTime = new Date(m.sentAt);
          const gap =
            window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
          if (!lastTime || currentTime - lastTime > gap) {
            html += ChatCommon.renderChatSeparator(m.sentAt);
          }
          lastTime = currentTime;

          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
          const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

          const senderAvatar = !m.isOwn
            ? m.sender?.avatarUrl || m.sender?.AvatarUrl || ""
            : "";
          const authorName =
            isGroup && !m.isOwn
              ? m.sender?.nickname ||
                m.sender?.Nickname ||
                m.sender?.username ||
                m.sender?.Username ||
                m.sender?.fullName ||
                m.sender?.FullName ||
                ""
              : "";

          html += ChatCommon.renderMessageBubble(m, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName,
            isWindow: true,
          });
        });

        // Find old first message
        const oldFirstMsg = msgContainer.querySelector(".msg-bubble-wrapper");

        msgContainer.insertAdjacentHTML("afterbegin", html);

        // Resolve queued seen markers for messages that were just loaded via scroll.
        messages.forEach((m) => {
          const loadedMsgId = (m.messageId || m.MessageId)
            ?.toString()
            .toLowerCase();
          if (loadedMsgId) {
            this.applyPendingSeenForMessage(id, loadedMsgId);
          }
        });

        // If there was an existing first message, sync it with its new predecessor
        if (oldFirstMsg) {
          const newPredecessor = this.findPreviousMessageBubble(oldFirstMsg);
          if (newPredecessor) {
            ChatCommon.syncMessageBoundary(newPredecessor, oldFirstMsg);
          }
        }

        ChatCommon.cleanTimeSeparators(msgContainer);
        if (window.lucide) lucide.createIcons();
        // Maintain scroll position
        requestAnimationFrame(() => {
          msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
        });

      }
    } catch (error) {
      console.error("Failed to load more messages:", error);
    } finally {
      chat.isLoading = false;
    }
  },

  appendMessage(id, msg, autoScroll = true) {
    const chat = this.openChats.get(id);
    const msgContainer = document.getElementById(`chat-messages-${id}`);
    if (!msgContainer || !chat) return;

    // Clear ANY existing "Sent" indicators in this chat before adding a new message
    msgContainer
      .querySelectorAll('.msg-bubble-wrapper[data-status="sent"]')
      .forEach((el) => {
        el.removeAttribute("data-status");
        el.querySelector(".msg-status")?.remove();
      });

    const isGroup = chat.data.isGroup;
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    ChatCommon.normalizeMessage(msg, myId);
    const isSystemMessage = ChatCommon.isSystemMessage(msg);

    if (msg.isOwn === undefined) {
      msg.isOwn =
        (msg.sender?.accountId || msg.senderId || "").toLowerCase() === myId;
    }
    const normalizedMessageId = (msg.messageId || msg.MessageId || "")
      .toString()
      .toLowerCase();
    if (normalizedMessageId) {
      msg.messageId = normalizedMessageId;
    }

    // Time separator
    const lastMsgEl = this.getLastMessageBubble(msgContainer);
    const prevTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
    const currentTime = new Date(msg.sentAt);
    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
    if (!prevTime || currentTime - prevTime > gap) {
      this.insertHtmlBeforeTypingIndicator(
        msgContainer,
        ChatCommon.renderChatSeparator(msg.sentAt),
      );
    }

    // Determine grouping
    const prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
    const prevIsSystemMessage =
      !!lastMsgEl && ChatCommon.isSystemMessageElement(lastMsgEl);
    const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;

    let senderId = (
      msg.sender?.accountId ||
      msg.SenderId ||
      msg.senderId ||
      ""
    ).toLowerCase();
    if (!senderId && msg.isOwn) senderId = myId;

    const sameSender = prevSenderId && prevSenderId === senderId;
    const closeTime = prevTime && currentTime - prevTime < groupGap;
    const groupedWithPrev =
      !isSystemMessage && !prevIsSystemMessage && sameSender && closeTime;
    const groupPos = groupedWithPrev ? "last" : "single";

    const senderAvatar = !msg.isOwn ? msg.sender?.avatarUrl || "" : "";
    const authorName =
      isGroup && !msg.isOwn
        ? msg.sender?.nickname ||
          msg.sender?.username ||
          msg.sender?.fullName ||
          ""
        : "";

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = ChatCommon.renderMessageBubble(msg, {
      isGroup,
      groupPos,
      senderAvatar,
      authorName,
      isWindow: true,
    });

    const bubble = tempDiv.firstElementChild;
    bubble.dataset.sentAt = msg.sentAt;
    bubble.dataset.senderId = senderId;

    if (msg.tempId) bubble.dataset.tempId = msg.tempId;
    if (msg.messageId) bubble.dataset.messageId = msg.messageId;

    if (msg.status && !isSystemMessage) {
      bubble.dataset.status = msg.status;
    }

    this.insertNodeBeforeTypingIndicator(msgContainer, bubble);

    // Sync grouping with the PREVIOUS message in DOM
    if (lastMsgEl) {
      ChatCommon.syncMessageBoundary(lastMsgEl, bubble);
    }
    ChatCommon.cleanTimeSeparators(msgContainer);

    if (msg.messageId) {
      this.applyPendingSeenForMessage(id, msg.messageId);
    }
    if (window.lucide) lucide.createIcons();
    if (autoScroll) msgContainer.scrollTop = msgContainer.scrollHeight;
  },

  showReplyBar(id, messageId, senderName, contentPreview, senderId = '', isOwnReplyAuthor = false) {
    const chat = this.openChats.get(id);
    if (!chat) return;
    chat._replyToMessageId = messageId;
    chat._replySenderName = senderName || 'User';
    chat._replyContentPreview = contentPreview || '';
    chat._replySenderId = (senderId || '').toString().toLowerCase() || null;
    chat._replyIsOwn = !!isOwnReplyAuthor;

    const inputArea = document.getElementById(`chat-input-area-${id}`);
    if (!inputArea) return;

    // Remove existing reply bar if any
    inputArea.querySelector('.chat-reply-bar')?.remove();

    const bar = document.createElement('div');
    bar.className = 'chat-reply-bar';
    bar.innerHTML = `
      <div class="chat-reply-bar-content">
        <div class="chat-reply-bar-label">Replying to <strong>${escapeHtml(senderName || 'User')}</strong></div>
        <div class="chat-reply-bar-preview">${escapeHtml(contentPreview || '')}</div>
      </div>
      <button class="chat-reply-bar-close" title="Cancel reply">
        <i data-lucide="x"></i>
      </button>
    `;
    bar.querySelector('.chat-reply-bar-close').onclick = () => this.clearReplyBar(id);
    inputArea.insertBefore(bar, inputArea.firstChild);
    if (window.lucide) lucide.createIcons();

    // Focus input
    const inputField = chat.element?.querySelector('.chat-input-field');
    if (inputField) inputField.focus();
  },

  clearReplyBar(id) {
    const chat = this.openChats.get(id);
    if (chat) {
      chat._replyToMessageId = null;
      chat._replySenderName = null;
      chat._replyContentPreview = null;
      chat._replySenderId = null;
      chat._replyIsOwn = false;
    }
    const inputArea = document.getElementById(`chat-input-area-${id}`);
    inputArea?.querySelector('.chat-reply-bar')?.remove();
  },

  async sendMessage(id) {
    const chat = this.openChats.get(id);
    if (!chat) return;

    const inputField = chat.element.querySelector(".chat-input-field");
    const content = inputField.innerText.trim();
    const hasText = content.length > 0;
    const hasFiles = chat.pendingFiles && chat.pendingFiles.length > 0;

    if (!hasText && !hasFiles) return;

    // Cancel typing indicator immediately
    if (window.ChatTyping) ChatTyping.cancelTyping(id);

    // generate temp message id for tracking
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // optimistic ui - include local media previews if any
    const filesToSend = [...(chat.pendingFiles || [])];
    const medias = filesToSend.map((file) => ({
      mediaUrl: this.trackBlobUrl(URL.createObjectURL(file), tempId),
      mediaType: this.getPendingMediaType(file),
      fileName: file.name || "",
      fileSize: Number(file.size) || 0,
    }));

    if (filesToSend.length > 0) {
      this.retryFiles.set(tempId, filesToSend);
    }

    // New outgoing message: clear any previous "Sent" indicators
    const msgContainer = document.getElementById(`chat-messages-${id}`);
    msgContainer
      ?.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]')
      .forEach((el) => {
        el.removeAttribute("data-status");
        el.querySelector(".msg-status")?.remove();
      });

    // Capture reply info BEFORE appending optimistic message
    const replyToMessageId = chat._replyToMessageId;
    const replyTo = replyToMessageId ? {
        messageId: replyToMessageId,
        content: chat._replyContentPreview || null,
        isRecalled: false,
        isHidden: false,
        replySenderId: chat._replySenderId || '',
        sender: {
          accountId: chat._replySenderId || '',
          displayName: chat._replySenderName || 'User',
          username: ''
        }
    } : null;
    this.clearReplyBar(id);

    // optimistic ui - show message immediately with pending state
    this.appendMessage(id, {
      tempId,
      content: hasText ? content : "",
      medias: medias.length > 0 ? medias : null,
      sentAt: new Date(),
      isOwn: true,
      status: "pending",
      replyTo
    });

    // Update Sidebar immediately (preview text, time, move to top)
    if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
      window.ChatSidebar.incrementUnread(id, {
        content: hasText ? content : "",
        medias: medias.length > 0 ? medias : null,
        sender: { accountId: (localStorage.getItem('accountId') || '') },
        sentAt: new Date()
      });
    }

    // (reply state already captured above)

    // Clear input and state
    this.resetInput(id);
    inputField.focus();

    // Clear pending files and preview
    chat.pendingFiles = [];
    this.updateAttachmentPreview(id);
    this.saveState();

    const runtimePayload = window.ChatMessageRuntime
      ? window.ChatMessageRuntime.buildRetryFormData({
          content,
          tempId,
          files: filesToSend,
        })
      : null;
    const formData = runtimePayload?.formData || new FormData();
    if (!runtimePayload) {
      if (hasText) formData.append("Content", content);
      if (tempId) formData.append("TempId", tempId);
      filesToSend.forEach((file) => {
        formData.append("MediaFiles", file);
      });
    }
    if (replyToMessageId) formData.append('ReplyToMessageId', replyToMessageId);

    try {
      let res;

      if (chat.data.isGroup) {
        // group chat - use group API with conversationId
        res = await window.API.Messages.sendGroup(id, formData);
      } else {
        // private chat (1:1) - use private API with receiverId
        if (id.startsWith("new-")) {
          // new conversation - extract receiverId from temp ID
          const receiverId = id.replace("new-", "");
          formData.append("ReceiverId", receiverId);
        } else if (chat.data.otherMember) {
          // existing conversation - use otherMember's accountId
          formData.append("ReceiverId", chat.data.otherMember.accountId);
        } else {
          console.error("Cannot determine receiverId for private chat");
          this.updateMessageStatus(id, tempId, "failed", content);
          return;
        }
        res = await window.API.Messages.sendPrivate(formData);
      }

      if (res.ok) {
        const msg = await res.json();
        if (
          window.ChatSidebar &&
          typeof window.ChatSidebar.incrementUnread === "function"
        ) {
          const sidebarConversationId = (
            msg?.conversationId ||
            msg?.ConversationId ||
            id ||
            ""
          )
            .toString()
            .toLowerCase();
          if (sidebarConversationId) {
            window.ChatSidebar.incrementUnread(sidebarConversationId, msg, true);
          }
        }
        const realMessageId = msg?.messageId || msg?.MessageId;
        this.updateMessageStatus(
          id,
          tempId,
          "sent",
          content,
          realMessageId,
          msg,
        );

        if (id.startsWith("new-")) {
          const realId = msg?.conversationId || msg?.ConversationId;
          if (realId) {
            this.promoteConversationId(id, realId, chat);
          }
        }
      } else {
        // failed to send
        this.updateMessageStatus(id, tempId, "failed", content);
      }
    } catch (error) {
      console.error("Failed to send message from window:", error);
      this.updateMessageStatus(id, tempId, "failed", content);
    }
  },
  updateMessageStatus(
    chatId,
    tempId,
    status,
    content,
    realMessageId = null,
    messagePayload = null,
  ) {
    const msgContainer = document.getElementById(`chat-messages-${chatId}`);
    if (!msgContainer) return;

    const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
    if (!msgEl) {
      if (status === "sent") this.cleanupMessageBlobUrls(tempId);
      return;
    }

    const runtimeCtx = this.getRuntimeCtx(chatId);
    if (runtimeCtx && window.ChatMessageRuntime) {
      window.ChatMessageRuntime.applyMessageStatus(runtimeCtx, {
        container: msgContainer,
        bubble: msgEl,
        status,
        content,
        tempId,
        realMessageId,
        messagePayload,
        retryHandler: (_retryTempId, retryContent) =>
          this.retryMessage(chatId, tempId, retryContent),
        onPendingSeen: (normRealId) =>
          this.applyPendingSeenForMessage(chatId, normRealId),
        removePreviousSent: (currentBubble) => {
          msgContainer
            .querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]')
            .forEach((el) => {
              if (el !== currentBubble) {
                el.removeAttribute("data-status");
                el.querySelector(".msg-status")?.remove();
              }
            });
        },
      });
      return;
    }

    msgEl.dataset.status = status;

    if (realMessageId) {
      const normRealId = realMessageId
        ? realMessageId.toString().toLowerCase()
        : null;
      if (normRealId) msgEl.dataset.messageId = normRealId;
      const seenRow = msgEl.querySelector(".msg-seen-row");
      if (seenRow && normRealId) seenRow.id = `seen-row-${normRealId}`;
      if (normRealId) {
        this.applyPendingSeenForMessage(chatId, normRealId);
      }
    }

    if (status === "sent") {
      const hadBlobMedia = !!msgEl.querySelector(
        'img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]',
      );
      const replaced = this.replaceOptimisticMediaUrls(
        msgEl,
        messagePayload,
        tempId,
      );
      this.retryFiles.delete(tempId);
      if (!hadBlobMedia || replaced) {
        this.cleanupMessageBlobUrls(tempId);
      }
    }

    // Remove existing status indicators from THIS bubble
    const existingStatus = msgEl.querySelector(".msg-status");
    if (existingStatus) existingStatus.remove();

    // If this message is being marked as SENT, remove "Sent" status from all PREVIOUS messages in this window
    if (status === "sent") {
      msgContainer
        .querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]')
        .forEach((el) => {
          if (el !== msgEl) {
            el.removeAttribute("data-status");
            el.querySelector(".msg-status")?.remove();
          }
        });
    }

    // create status element below bubble
    const statusEl = document.createElement("div");
    statusEl.className = "msg-status";

    if (status === "pending") {
      statusEl.className += " msg-status-sending";
      statusEl.innerHTML =
        '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
    } else if (status === "sent") {
      statusEl.className += " msg-status-sent";
      statusEl.textContent = "Sent";
    } else if (status === "failed") {
      statusEl.className += " msg-status-failed";
      statusEl.textContent = "Failed to send. Click to retry.";
      statusEl.onclick = () => this.retryMessage(chatId, tempId, content);
    }

    msgEl.appendChild(statusEl);
  },

  async retryMessage(chatId, tempId, content) {
    const msgContainer = document.getElementById(`chat-messages-${chatId}`);
    if (!msgContainer) return;

    const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
    if (!msgEl) return;

    // update to pending
    this.updateMessageStatus(chatId, tempId, "pending", content);

    // retry sending
    const chat = this.openChats.get(chatId);
    if (!chat) return;

    const files = this.retryFiles.get(tempId) || [];
    const runtimePayload = window.ChatMessageRuntime
      ? window.ChatMessageRuntime.buildRetryFormData({
          content,
          tempId,
          files,
        })
      : null;
    const hasText = runtimePayload
      ? runtimePayload.hasText
      : content && content.trim().length > 0;
    const formData = runtimePayload?.formData || new FormData();
    if (!hasText && files.length === 0) {
      this.updateMessageStatus(chatId, tempId, "failed", content);
      return;
    }
    if (!runtimePayload) {
      if (hasText) formData.append("Content", content);
      formData.append("TempId", tempId);
      files.forEach((file) => formData.append("MediaFiles", file));
    }

    try {
      let res;

      if (chat.data.isGroup) {
        res = await window.API.Messages.sendGroup(chatId, formData);
      } else {
        if (chatId.startsWith("new-")) {
          const receiverId = chatId.replace("new-", "");
          formData.append("ReceiverId", receiverId);
        } else if (chat.data.otherMember) {
          formData.append("ReceiverId", chat.data.otherMember.accountId);
        } else {
          this.updateMessageStatus(chatId, tempId, "failed", content);
          return;
        }
        res = await window.API.Messages.sendPrivate(formData);
      }

      if (res.ok) {
        const msg = await res.json();
        if (
          window.ChatSidebar &&
          typeof window.ChatSidebar.incrementUnread === "function"
        ) {
          const sidebarConversationId = (
            msg?.conversationId ||
            msg?.ConversationId ||
            chatId ||
            ""
          )
            .toString()
            .toLowerCase();
          if (sidebarConversationId) {
            window.ChatSidebar.incrementUnread(sidebarConversationId, msg, true);
          }
        }
        const realMessageId = msg?.messageId || msg?.MessageId;
        this.updateMessageStatus(
          chatId,
          tempId,
          "sent",
          content,
          realMessageId,
          msg,
        );

        if (chatId.startsWith("new-")) {
          const realId = msg?.conversationId || msg?.ConversationId;
          if (realId) {
            this.promoteConversationId(chatId, realId, chat);
          }
        }
      } else {
        this.updateMessageStatus(chatId, tempId, "failed", content);
      }
    } catch (error) {
      console.error("Failed to retry message:", error);
      this.updateMessageStatus(chatId, tempId, "failed", content);
    }
  },
};

document.addEventListener("DOMContentLoaded", () => ChatWindow.init());
window.ChatWindow = ChatWindow;
window.ChatMessenger = ChatWindow;
