(function () {
  const PAGE_SIZE = window.APP_CONFIG?.BLOCKED_USERS_PAGE_SIZE || 20;
  const state = {
    page: 1,
    totalItems: 0,
    keyword: "",
    items: [],
    isLoading: false,
    hasMore: false,
    searchDebounceTimer: null,
  };

  function t(key, params = {}, fallback = "") {
    return window.I18n?.t ? window.I18n.t(key, params, fallback || key) : fallback || key;
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getAccountSettingsHash() {
    if (window.RouteHelper?.buildAccountSettingsHash) {
      return window.RouteHelper.buildAccountSettingsHash("");
    }

    const username = (localStorage.getItem("username") || "").toString().trim();
    return username ? `#/${encodeURIComponent(username)}/settings` : "#/account-settings";
  }

  function formatBlockedAt(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    try {
      return new Intl.DateTimeFormat(window.I18n?.getLanguage?.() || "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch (_) {
      return date.toLocaleDateString();
    }
  }

  function getLoadMoreButton() {
    return document.getElementById("blocked-users-load-more-btn");
  }

  function setLoadMoreState() {
    const button = getLoadMoreButton();
    if (!button) return;
    button.hidden = !state.hasMore;
    button.disabled = state.isLoading;
  }

  function renderLoadingState() {
    const container = document.getElementById("blocked-users-list");
    if (!container) return;

    container.innerHTML = `
      <div class="blocked-users-state">
        <div class="spinner spinner-large"></div>
        <p>${escapeHtml(t("profile.blockedUsersSettings.loading", {}, "Loading blocked users..."))}</p>
      </div>
    `;
  }

  function renderEmptyState() {
    const container = document.getElementById("blocked-users-list");
    if (!container) return;

    const isSearch = state.keyword.trim().length > 0;
    container.innerHTML = `
      <div class="blocked-users-state">
        <i data-lucide="${isSearch ? "search-x" : "shield-check"}"></i>
        <h2>${escapeHtml(
          isSearch
            ? t("profile.blockedUsersSettings.emptySearchTitle", {}, "No matching blocked users")
            : t("profile.blockedUsersSettings.emptyTitle", {}, "You haven't blocked anyone"),
        )}</h2>
        <p>${escapeHtml(
          isSearch
            ? t("profile.blockedUsersSettings.emptySearchDescription", {}, "Try a different name or username")
            : t(
                "profile.blockedUsersSettings.emptyDescription",
                {},
                "Accounts you block will appear here",
              ),
        )}</p>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons({ container });
    }
  }

  function renderList() {
    const container = document.getElementById("blocked-users-list");
    if (!container) return;

    if (!state.items.length) {
      renderEmptyState();
      setLoadMoreState();
      return;
    }

    container.innerHTML = state.items
      .map((item) => {
        const accountId = (item?.accountId || item?.AccountId || "").toString().trim();
        const username = (item?.username || item?.Username || "").toString().trim();
        const fullName = (item?.fullName || item?.FullName || "").toString().trim();
        const primaryName = username || fullName || t("common.labels.user", {}, "User");
        const secondaryName =
          username &&
          fullName &&
          fullName.localeCompare(username, undefined, { sensitivity: "accent" }) !== 0
            ? fullName
            : "";
        const avatarUrl =
          window.BlockUtils?.getAvatarUrl(item) || window.APP_CONFIG?.DEFAULT_AVATAR || "";
        const blockedAt = formatBlockedAt(item?.blockedAt || item?.BlockedAt);

        return `
          <div class="blocked-users-item" data-account-id="${escapeHtml(accountId)}">
            <div class="blocked-users-item-main">
              <img
                class="blocked-users-avatar"
                src="${escapeHtml(avatarUrl)}"
                alt="${escapeHtml(primaryName)}"
                onerror="this.src='${escapeHtml(window.APP_CONFIG?.DEFAULT_AVATAR || "")}'"
              />
              <div class="blocked-users-copy">
                <div class="blocked-users-name">${escapeHtml(primaryName)}</div>
                ${secondaryName ? `<div class="blocked-users-username">${escapeHtml(secondaryName)}</div>` : ""}
                <div class="blocked-users-meta">${escapeHtml(
                  t(
                    "profile.blockedUsersSettings.blockedAt",
                    { date: blockedAt || "-" },
                    `Blocked on ${blockedAt || "-"}`,
                  ),
                )}</div>
              </div>
            </div>
            <button
              type="button"
              class="blocked-users-unblock-btn"
              data-account-id="${escapeHtml(accountId)}"
            >
              ${escapeHtml(t("profile.blockedUsersSettings.actions.unblock", {}, "Unblock"))}
            </button>
          </div>
        `;
      })
      .join("");

    if (window.lucide) {
      window.lucide.createIcons({ container });
    }

    container.querySelectorAll(".blocked-users-unblock-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const accountId = button.dataset.accountId || "";
        const item = state.items.find(
          (entry) =>
            (entry?.accountId || entry?.AccountId || "").toString().toLowerCase() ===
            accountId.toLowerCase(),
        );
        if (!accountId || !item) return;

        window.BlockUtils?.toggleBlock({
          targetId: accountId,
          targetName:
            item?.username ||
            item?.Username ||
            item?.fullName ||
            item?.FullName ||
            t("common.labels.user", {}, "User"),
          targetUsername: item?.username || item?.Username || "",
          targetFullName: item?.fullName || item?.FullName || "",
          isBlockedByCurrentUser: true,
          onSuccess: async () => {
            state.items = state.items.filter(
              (entry) =>
                (entry?.accountId || entry?.AccountId || "").toString().toLowerCase() !==
                accountId.toLowerCase(),
            );
            state.totalItems = Math.max(0, state.totalItems - 1);
            renderList();
            await loadBlockedUsers(true);
          },
        });
      });
    });

    setLoadMoreState();
  }

  async function loadBlockedUsers(reset = true) {
    if (state.isLoading) return;
    const container = document.getElementById("blocked-users-list");
    if (!container) return;

    state.isLoading = true;
    setLoadMoreState();

    if (reset) {
      state.page = 1;
      state.items = [];
      renderLoadingState();
    }

    try {
      const res = await window.API?.Blocks?.list?.(state.keyword, state.page, PAGE_SIZE);
      if (!res?.ok) {
        throw new Error("BLOCKED_USERS_LOAD_FAILED");
      }

      const payload = await res.json().catch(() => ({}));
      const items = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.Items)
          ? payload.Items
          : [];
      const totalItems = Number(payload?.totalItems ?? payload?.TotalItems ?? items.length) || 0;

      state.totalItems = totalItems;
      state.items = reset ? items : [...state.items, ...items];
      state.hasMore = state.items.length < totalItems;
      state.page = reset ? 2 : state.page + 1;

      renderList();
    } catch (error) {
      console.error("Failed to load blocked users:", error);
      container.innerHTML = `
        <div class="blocked-users-state">
          <i data-lucide="alert-circle"></i>
          <p>${escapeHtml(
            t(
              "profile.blockedUsersSettings.errors.loadFailed",
              {},
              "Could not load blocked users right now",
            ),
          )}</p>
        </div>
      `;
      if (window.lucide) {
        window.lucide.createIcons({ container });
      }
    } finally {
      state.isLoading = false;
      setLoadMoreState();
    }
  }

  function bindEvents() {
    const backButton = document.getElementById("blocked-users-back-btn");
    if (backButton) {
      backButton.onclick = () => {
        window.location.hash = getAccountSettingsHash();
      };
    }

    const searchInput = document.getElementById("blocked-users-search-input");
    if (searchInput) {
      searchInput.value = state.keyword;
      searchInput.oninput = () => {
        clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = window.setTimeout(() => {
          state.keyword = (searchInput.value || "").trim();
          loadBlockedUsers(true);
        }, 250);
      };
    }

    const loadMoreButton = getLoadMoreButton();
    if (loadMoreButton) {
      loadMoreButton.onclick = () => {
        loadBlockedUsers(false);
      };
    }
  }

  async function initBlockedUsersSettings() {
    const root = document.querySelector(".blocked-users-page");
    if (root && window.I18n?.translateDom) {
      window.I18n.translateDom(root);
    }

    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    clearTimeout(state.searchDebounceTimer);
    state.page = 1;
    state.totalItems = 0;
    state.keyword = "";
    state.items = [];
    state.isLoading = false;
    state.hasMore = false;

    bindEvents();
    await loadBlockedUsers(true);
    if (window.AppFooter?.mountMainContent) {
      await window.AppFooter.mountMainContent();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  window.initBlockedUsersSettings = initBlockedUsersSettings;
})();
