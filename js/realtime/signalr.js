const { HUB_BASE, API_BASE } = window.APP_CONFIG;

let chatConnection = null;
let isStarting = false;

/* =========================
   TOKEN HELPERS
========================= */

function getAccessToken() {
  return window.AuthStore?.getAccessToken?.() || null;
}

function setAccessToken(token) {
  if (window.AuthStore?.setAccessToken) {
    window.AuthStore.setAccessToken(token, "signalr");
  }
}

/**
 * Note: refreshAccessToken is now provided globally by app.js
 * We use window.refreshAccessToken() instead of a local duplicate
 */


/* =========================
   START HUB
========================= */

async function startChatHub() {
  // ⛔ Đang start hoặc đã connected → bỏ
  if (
    isStarting ||
    (chatConnection &&
      chatConnection.state !== signalR.HubConnectionState.Disconnected)
  ) {
    return;
  }

  isStarting = true;

  // Try to hydrate access token from refresh cookie before connecting.
  if (!getAccessToken() && window.AuthStore?.ensureAccessToken) {
    await window.AuthStore.ensureAccessToken();
  }

  chatConnection = new signalR.HubConnectionBuilder()
    .withUrl(`${HUB_BASE}/chatHub`, {
      accessTokenFactory: () => getAccessToken() || "",
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .build();

  /* =========================
     EVENT HANDLERS
  ========================= */

  chatConnection.onreconnecting(() => {
    console.warn("🔄 ChatHub reconnecting...");
  });

  chatConnection.onreconnected((connectionId) => {
    const normalizedConnectionId = (connectionId || "").toString();
    console.log("✅ ChatHub reconnected", normalizedConnectionId);

    // Let modules hook into reconnect lifecycle without depending on signalr.js internals.
    window.dispatchEvent(
      new CustomEvent("chat:hub-reconnected", {
        detail: { connectionId: normalizedConnectionId },
      }),
    );

    if (
      window.ChatRealtime &&
      typeof window.ChatRealtime.rejoinActiveConversations === "function"
    ) {
      window.ChatRealtime
        .rejoinActiveConversations("signalr.js.onreconnected")
        .catch((err) => {
          console.warn("⚠️ ChatHub rejoin from signalr.js failed:", err);
        });
    }
  });

  chatConnection.onclose(async (err) => {
    console.error("❌ ChatHub closed", err);

    // Nếu do token hết hạn → refresh rồi connect lại
    if (err?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
      } catch {
        console.warn("🔐 Refresh token invalid → logout");
        logout(); // bạn đã có sẵn hàm này
        return;
      }
    }

    setTimeout(startChatHub, 3000);
  });

  /* =========================
     START CONNECTION
  ========================= */

  try {
    await chatConnection.start();
    console.log("✅ ChatHub connected");
    window.chatHubConnection = chatConnection;
  } catch (err) {
    console.error("❌ ChatHub start failed", err);

    // Nếu start fail do 401 → refresh token
    if (err?.message?.includes("401")) {
      try {
        await window.refreshAccessToken();
      } catch {
        logout();
        return;
      }
    }

    setTimeout(startChatHub, 5000);
  } finally {
    isStarting = false;
  }
}

/* =========================
   INIT (CALL ONCE)
========================= */

startChatHub();
