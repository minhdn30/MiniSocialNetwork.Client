const { HUB_BASE } = window.APP_CONFIG;

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${HUB_BASE}/postHub`, {
    accessTokenFactory: () => localStorage.getItem("accessToken"),
  })
  .withAutomaticReconnect()
  .build();

connection
  .start()
  .then(() => console.log("✅ PostHub connected"))
  .catch((err) => console.error("❌ SignalR error:", err));

window.postHubConnection = connection;
