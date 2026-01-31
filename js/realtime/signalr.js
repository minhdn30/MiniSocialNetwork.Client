const { HUB_BASE, API_BASE } = window.APP_CONFIG;

let chatConnection = null;
let isStarting = false;

/* =========================
   TOKEN HELPERS
========================= */

function getAccessToken() {
  return localStorage.getItem("accessToken");
}

function setAccessToken(token) {
  localStorage.setItem("accessToken", token);
}

/**
 * Gọi API refresh-token
 * ⚠️ cookie refreshToken đã được backend set HttpOnly
 */
async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh-token`, {
    method: "POST",
    credentials: "include", // bắt buộc để gửi cookie
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("Refresh token failed");
  }

  const data = await res.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

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

  chatConnection = new signalR.HubConnectionBuilder()
    .withUrl(`${HUB_BASE}/chatHub`, {
      accessTokenFactory: () => getAccessToken(),
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .build();

  /* =========================
     EVENT HANDLERS
  ========================= */

  chatConnection.onreconnecting(() => {
    console.warn("🔄 ChatHub reconnecting...");
  });

  chatConnection.onreconnected(() => {
    console.log("✅ ChatHub reconnected");
  });

  chatConnection.onclose(async (err) => {
    console.error("❌ ChatHub closed", err);

    // Nếu do token hết hạn → refresh rồi connect lại
    if (err?.message?.includes("401")) {
      try {
        await refreshAccessToken();
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
        await refreshAccessToken();
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
