(function (global) {
  const root = document.getElementById("adminApp");
  const paths = {
    login: "pages/admin/login-shell.html",
    dashboard: "pages/admin/dashboard-shell.html",
    foundation: "pages/admin/foundation-overview.html",
    security: "pages/admin/password-security.html",
    accountLookup: "pages/admin/account-lookup.html",
    moderation: "pages/admin/moderation-center.html",
    reports: "pages/admin/report-center.html",
    auditLog: "pages/admin/audit-log.html",
  };
  const PASSWORD_MIN_LENGTH = 6;
  const PASSWORD_ACCENT_REGEX = /[\u00C0-\u024F\u1E00-\u1EFF]/u;

  const accountStatusOptions = [
    { value: 0, key: "active" },
    { value: 1, key: "inactive" },
    { value: 2, key: "suspended" },
    { value: 3, key: "banned" },
    { value: 4, key: "deleted" },
    { value: 5, key: "emailnotverified" },
  ];
  const moderationTargetTypes = ["Post", "Story", "Comment", "Reply"];
  const reportTargetTypes = ["Account", "Post", "Story", "Comment", "Reply"];
  const reportStatuses = ["Open", "InReview", "Resolved", "Dismissed"];
  const auditModules = ["auth", "accounts", "moderation", "reports", "audit"];
  const auditActions = [
    "AdminLogin",
    "AdminPasswordChanged",
    "AccountStatusSetActive",
    "AccountStatusSetInactive",
    "AccountStatusSetSuspended",
    "AccountStatusSetBanned",
    "AccountStatusSetDeleted",
    "AccountStatusSetEmailNotVerified",
    "PostHidden",
    "PostRestored",
    "StoryHidden",
    "StoryRestored",
    "CommentRemoved",
    "ReplyRemoved",
    "ReportCreatedInternal",
    "ReportMovedToInReview",
    "ReportResolved",
    "ReportDismissed",
    "ReportReopened",
  ];
  const state = {
    currentView: "overview",
    session: null,
    accountLookup: {
      keyword: "",
      items: [],
      selectedAccountId: null,
    },
    moderation: {
      targetType: "Post",
      keyword: "",
      item: null,
    },
    reports: {
      filters: {
        status: "",
        targetType: "",
      },
      items: [],
      selectedReportId: null,
    },
  };

  function t(key, params = {}, fallback = "") {
    if (global.I18n?.t) {
      return global.I18n.t(key, params, fallback || key);
    }

    return fallback || key;
  }

  function translateDom(target) {
    if (global.I18n?.translateDom && target) {
      global.I18n.translateDom(target);
    }
  }

  function refreshIcons() {
    if (global.lucide?.createIcons) {
      global.lucide.createIcons();
    }
  }

  function getApiBaseCandidates() {
    const configured = (global.APP_CONFIG?.API_BASE || "").toString().trim();
    const candidates = Array.isArray(global.APP_CONFIG?.API_BASE_CANDIDATES)
      ? global.APP_CONFIG.API_BASE_CANDIDATES
      : [];
    const fallback = `${global.location.origin.replace(/\/$/, "")}/api`;

    return [...new Set([configured, ...candidates, fallback].filter(Boolean))];
  }

  async function fetchAdminApi(path, options = {}) {
    const candidates = getApiBaseCandidates();
    let lastError = null;
    const token = global.AdminAuthStore?.getAccessToken?.() || "";

    for (const baseUrl of candidates) {
      try {
        const headers = new Headers(options.headers || {});
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(`${baseUrl}${path}`, {
          ...options,
          headers,
        });

        return response;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Failed to reach admin API");
  }

  async function loadPartial(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Shell load failed with status ${response.status}`);
    }

    return await response.text();
  }

  function bindActions() {
    const themeButton = document.getElementById("adminThemeToggle");
    if (themeButton) {
      themeButton.addEventListener("click", () => {
        global.themeManager?.toggleTheme?.();
      });
    }

    const logoutButton = document.getElementById("adminLogoutBtn");
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        global.AdminAuthStore?.clear?.();
        await renderLogin();
      });
    }

    const sidebar = document.getElementById("adminSidebar");
    const sidebarToggle = document.getElementById("adminSidebarToggle");
    const sidebarBackdrop = document.getElementById("adminSidebarBackdrop");

    function closeSidebar() {
      sidebar?.classList.remove("is-open");
      if (sidebarBackdrop) {
        sidebarBackdrop.hidden = true;
      }
      document.body.classList.remove("admin-sidebar-open");
    }

    function openSidebar() {
      sidebar?.classList.add("is-open");
      if (sidebarBackdrop) {
        sidebarBackdrop.hidden = false;
      }
      document.body.classList.add("admin-sidebar-open");
    }

    if (sidebarToggle && sidebar && sidebarBackdrop) {
      sidebarToggle.addEventListener("click", () => {
        if (sidebar.classList.contains("is-open")) {
          closeSidebar();
          return;
        }

        openSidebar();
      });

      sidebarBackdrop.addEventListener("click", closeSidebar);
      if (!global.__adminShellResizeBound) {
        global.addEventListener("resize", handleViewportSidebarReset);
        global.__adminShellResizeBound = true;
      }
    }

    root.querySelectorAll("[data-admin-view]").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextView = button.dataset.adminView || "overview";
        await renderView(nextView);
      });
    });
  }

  function handleViewportSidebarReset() {
    if (global.innerWidth <= 1100) {
      return;
    }

    const sidebar = document.getElementById("adminSidebar");
    const sidebarBackdrop = document.getElementById("adminSidebarBackdrop");
    sidebar?.classList.remove("is-open");
    if (sidebarBackdrop) {
      sidebarBackdrop.hidden = true;
    }
    document.body.classList.remove("admin-sidebar-open");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function setMessage(id, message, type = "") {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.className = `admin-login-message${type ? ` ${type}` : ""}`;
  }

  function renderBootstrap(data) {
    setText(
      "adminBootstrapStatus",
      data?.status || t("admin.bootstrapPending", {}, "Pending"),
    );
    setText("adminBootstrapApiNamespace", data?.apiNamespace || "api/admin");
    setText(
      "adminBootstrapController",
      data?.controller || "AdminPortalController",
    );
    setText("adminBootstrapService", data?.service || "AdminPortalService");
    setText(
      "adminBootstrapRepository",
      data?.repository || "AdminPortalRepository",
    );
    setText("adminBootstrapCheckedAt", data?.checkedAt || "n/a");
    setText(
      "adminBootstrapModules",
      Array.isArray(data?.plannedModules) && data.plannedModules.length
        ? data.plannedModules.join(", ")
        : t("admin.modulePlaceholder", {}, "No modules yet"),
    );
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return character;
      }
    });
  }

  function buildInitials(displayName, email) {
    const source = (displayName || email || "Admin").trim();
    if (!source) {
      return "AD";
    }

    const words = source
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
  }

  function formatTimestamp(date) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(date);
    } catch (_error) {
      return "--";
    }
  }

  function formatDateTime(value) {
    if (!value) {
      return t("admin.common.notAvailable", {}, "Not available");
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return t("admin.common.notAvailable", {}, "Not available");
    }

    try {
      return new Intl.DateTimeFormat(global.I18n?.getLanguage?.() || undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsedDate);
    } catch (_error) {
      return parsedDate.toISOString();
    }
  }

  function normalizeKey(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function isGuidKeyword(keyword) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      keyword,
    );
  }

  function isLookupKeywordAccepted(keyword) {
    const normalizedKeyword = (keyword || "").trim();
    if (!normalizedKeyword) {
      return false;
    }

    if (isGuidKeyword(normalizedKeyword)) {
      return true;
    }

    if (normalizedKeyword.includes("@")) {
      return normalizedKeyword.length >= 3;
    }

    return normalizedKeyword.length >= 3;
  }

  function isModerationKeywordAccepted(targetType, keyword) {
    const normalizedKeyword = (keyword || "").trim();
    if (!normalizedKeyword) {
      return false;
    }

    if (normalizeKey(targetType) === "post") {
      return normalizedKeyword.length >= 2;
    }

    return isGuidKeyword(normalizedKeyword);
  }

  function getPasswordRules(password) {
    const value = (password || "").toString();
    const rules = {
      length: value.length >= PASSWORD_MIN_LENGTH,
      noSpaces: !value.includes(" "),
      noAccents: !PASSWORD_ACCENT_REGEX.test(value),
    };
    const completedCount = Object.values(rules).filter(Boolean).length;

    return {
      ...rules,
      completedCount,
      progress: Math.round((completedCount / 3) * 100),
    };
  }

  function getAdminPasswordPolicyError(newPassword, confirmPassword) {
    if (!newPassword) {
      return t(
        "admin.security.errors.newRequired",
        {},
        "Enter your new password",
      );
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return t(
        "admin.security.errors.length",
        { count: PASSWORD_MIN_LENGTH },
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      );
    }

    if (newPassword.includes(" ")) {
      return t(
        "admin.security.errors.spaces",
        {},
        "Password cannot contain spaces",
      );
    }

    if (PASSWORD_ACCENT_REGEX.test(newPassword)) {
      return t(
        "admin.security.errors.accents",
        {},
        "Password cannot contain Vietnamese accents",
      );
    }

    if (newPassword !== confirmPassword) {
      return t(
        "admin.security.errors.confirmMismatch",
        {},
        "New password and confirm password do not match",
      );
    }

    return "";
  }

  function getRoleLabel(role) {
    const normalizedRole = normalizeKey(role);
    return t(
      `admin.accountLookup.roles.${normalizedRole || "unknown"}`,
      {},
      role || t("admin.accountLookup.roles.unknown", {}, "Unknown role"),
    );
  }

  function getStatusLabel(status) {
    const normalizedStatus = normalizeKey(status);
    return t(
      `admin.accountLookup.status.${normalizedStatus || "unknown"}`,
      {},
      status || t("admin.accountLookup.status.unknown", {}, "Unknown status"),
    );
  }

  function getStatusClass(status) {
    const normalizedStatus = normalizeKey(status);
    if (normalizedStatus === "active") {
      return "success";
    }

    if (normalizedStatus === "suspended" || normalizedStatus === "banned") {
      return "danger";
    }

    if (normalizedStatus === "inactive" || normalizedStatus === "emailnotverified") {
      return "warning";
    }

    return "muted";
  }

  function getAccountStatusNumericValue(status) {
    const option = accountStatusOptions.find((item) => item.key === normalizeKey(status));
    return option ? option.value : accountStatusOptions[0].value;
  }

  function getModerationTargetLabel(targetType) {
    const normalizedTargetType = normalizeKey(targetType);
    return t(
      `admin.moderation.targetTypes.${normalizedTargetType || "unknown"}`,
      {},
      targetType || t("admin.moderation.targetTypes.unknown", {}, "Unknown"),
    );
  }

  function getModerationStateLabel(currentState) {
    const normalizedState = normalizeKey(currentState);
    return t(
      `admin.moderation.states.${normalizedState || "unknown"}`,
      {},
      currentState || t("admin.moderation.states.unknown", {}, "Unknown"),
    );
  }

  function getModerationStateClass(currentState) {
    const normalizedState = normalizeKey(currentState);
    if (normalizedState === "active") {
      return "success";
    }

    if (normalizedState === "removed") {
      return "danger";
    }

    return "muted";
  }

  function getModerationActionLabel(action) {
    const normalizedAction = normalizeKey(action);
    return t(
      `admin.moderation.actions.${normalizedAction || "unknown"}`,
      {},
      action || t("admin.moderation.actions.unknown", {}, "Unknown"),
    );
  }

  function getModerationActionOptions(item) {
    if (!item) {
      return [];
    }

    const normalizedTargetType = normalizeKey(item.targetType);
    if (normalizedTargetType === "post" || normalizedTargetType === "story") {
      if (item.canRestore) {
        return ["restore"];
      }

      return item.isRemoved ? [] : ["hide"];
    }

    if (normalizedTargetType === "comment" || normalizedTargetType === "reply") {
      return item.isRemoved ? [] : ["remove"];
    }

    return [];
  }

  function getReportTargetTypeLabel(targetType) {
    const normalizedTargetType = normalizeKey(targetType);
    return t(
      `admin.reports.targetTypes.${normalizedTargetType || "unknown"}`,
      {},
      targetType || t("admin.reports.targetTypes.unknown", {}, "Unknown"),
    );
  }

  function getReportReasonCodeLabel(reasonCode) {
    const normalizedReasonCode = normalizeKey(reasonCode);
    return t(
      `admin.reports.reasonCodes.${normalizedReasonCode || "other"}`,
      {},
      reasonCode || t("admin.reports.reasonCodes.other", {}, "Other"),
    );
  }

  function getReportStatusLabel(status) {
    const normalizedStatus = normalizeKey(status);
    return t(
      `admin.reports.statusNames.${normalizedStatus || "unknown"}`,
      {},
      status || t("admin.reports.statusNames.unknown", {}, "Unknown"),
    );
  }

  function getReportStatusClass(status) {
    const normalizedStatus = normalizeKey(status);
    if (normalizedStatus === "open") {
      return "warning";
    }

    if (normalizedStatus === "inreview") {
      return "muted";
    }

    if (normalizedStatus === "resolved") {
      return "success";
    }

    if (normalizedStatus === "dismissed") {
      return "danger";
    }

    return "muted";
  }

  function getReportSourceLabel(sourceType) {
    const normalizedSourceType = normalizeKey(sourceType);
    return t(
      `admin.reports.sourceTypes.${normalizedSourceType || "unknown"}`,
      {},
      sourceType || t("admin.reports.sourceTypes.unknown", {}, "Unknown"),
    );
  }

  function getReportActorName(item) {
    if (normalizeKey(item?.sourceType) === "usersubmitted") {
      return (
        item?.reporterFullname ||
        item?.reporterEmail ||
        t("admin.common.notAvailable", {}, "Not available")
      );
    }

    return (
      item?.createdByAdminFullname ||
      item?.createdByAdminEmail ||
      t("admin.common.notAvailable", {}, "Not available")
    );
  }

  function getAuditModuleLabel(module) {
    const normalizedModule = normalizeKey(module);
    return t(
      `admin.auditLog.moduleName.${normalizedModule || "unknown"}`,
      {},
      module || t("admin.auditLog.moduleName.unknown", {}, "Unknown module"),
    );
  }

  function getAuditActionLabel(actionType) {
    const normalizedActionType = normalizeKey(actionType);
    return t(
      `admin.auditLog.actionName.${normalizedActionType || "unknown"}`,
      {},
      actionType || t("admin.auditLog.actionName.unknown", {}, "Unknown action"),
    );
  }

  function getAuditTargetTypeLabel(targetType) {
    const normalizedTargetType = normalizeKey(targetType);
    return t(
      `admin.auditLog.targetType.${normalizedTargetType || "unknown"}`,
      {},
      targetType || t("admin.auditLog.targetType.unknown", {}, "Unknown target"),
    );
  }

  function buildLookupResultCard(item) {
    const displayName = item.fullname || item.username || item.email || "Unknown";
    const initials = buildInitials(displayName, item.email);
    const roleLabel = getRoleLabel(item.role);
    const statusLabel = getStatusLabel(item.status);
    const verifiedLabel = item.isEmailVerified
      ? t("admin.accountLookup.verified.yes", {}, "Verified")
      : t("admin.accountLookup.verified.no", {}, "Email not verified");
    const isSelected = item.accountId === state.accountLookup.selectedAccountId;

    return `
      <article class="admin-account-result-card${isSelected ? " is-selected" : ""}">
        <div class="admin-account-result-head">
          <div class="admin-account-result-avatar">${escapeHtml(initials)}</div>
          <div class="admin-account-result-copy">
            <div class="admin-account-result-name">${escapeHtml(displayName)}</div>
            <div class="admin-account-result-username">@${escapeHtml(item.username || "")}</div>
            <div class="admin-account-result-email">${escapeHtml(item.email || "")}</div>
          </div>
        </div>

        <div class="admin-account-result-tags">
          <span class="admin-result-pill">${escapeHtml(roleLabel)}</span>
          <span class="admin-result-pill ${getStatusClass(item.status)}">${escapeHtml(statusLabel)}</span>
          <span class="admin-result-pill ${item.isEmailVerified ? "success" : "warning"}">${escapeHtml(verifiedLabel)}</span>
        </div>

        <div class="admin-account-result-meta">
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.accountLookup.fields.accountId", {}, "Account ID"))}</span>
            <strong>${escapeHtml(item.accountId || "")}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.accountLookup.fields.createdAt", {}, "Created at"))}</span>
            <strong>${escapeHtml(formatDateTime(item.createdAt))}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.accountLookup.fields.lastOnlineAt", {}, "Last online"))}</span>
            <strong>${escapeHtml(formatDateTime(item.lastOnlineAt))}</strong>
          </div>
        </div>

        <div class="admin-card-footer">
          <button
            type="button"
            class="admin-action-btn admin-inline-action"
            data-admin-account-select="${escapeHtml(item.accountId || "")}"
          >
            <i data-lucide="${isSelected ? "check-check" : "sliders-horizontal"}"></i>
            <span>${escapeHtml(
              isSelected
                ? t("admin.accountLookup.selectedAction", {}, "Managing this account")
                : t("admin.accountLookup.selectAction", {}, "Manage status"),
            )}</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderAccountLookupState(messageKey, fallback) {
    const stateElement = document.getElementById("adminAccountLookupState");
    if (!stateElement) {
      return;
    }

    stateElement.innerHTML = `
      <div class="admin-lookup-empty-visual">
        <i data-lucide="search-check"></i>
      </div>
      <div class="admin-lookup-empty-copy">${escapeHtml(t(messageKey, {}, fallback))}</div>
    `;
  }

  function populateAccountStatusSelect(item) {
    const select = document.getElementById("adminAccountStatusSelect");
    if (!select || !item) {
      return;
    }

    const currentStatus = normalizeKey(item.status);
    const options = accountStatusOptions.filter((status) => status.key !== currentStatus);
    select.innerHTML = options
      .map((status) => {
        const label = getStatusLabel(status.key);
        return `<option value="${status.value}">${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function getSelectedAccountItem() {
    return state.accountLookup.items.find(
      (item) => item.accountId === state.accountLookup.selectedAccountId,
    ) || null;
  }

  function renderAccountStatusDeck() {
    const deck = document.getElementById("adminAccountStatusDeck");
    const currentStateElement = document.getElementById("adminAccountStatusCurrentState");
    const targetSummaryElement = document.getElementById("adminAccountStatusTargetSummary");
    const reasonInput = document.getElementById("adminAccountStatusReason");

    if (!deck || !currentStateElement || !targetSummaryElement) {
      return;
    }

    const item = getSelectedAccountItem();
    if (!item) {
      deck.hidden = true;
      return;
    }

    deck.hidden = false;
    currentStateElement.textContent = t(
      "admin.accountLookup.controlSelectedChip",
      { status: getStatusLabel(item.status) },
      getStatusLabel(item.status),
    );
    currentStateElement.className = `admin-chip ${getStatusClass(item.status)}`;
    targetSummaryElement.textContent = t(
      "admin.accountLookup.controlTargetSummary",
      {
        name: item.fullname || item.username || item.email || item.accountId,
        username: item.username || "",
        status: getStatusLabel(item.status),
      },
      `${item.fullname || item.username || item.email || item.accountId}`,
    );

    populateAccountStatusSelect(item);
    if (reasonInput && !reasonInput.dataset.preserved) {
      reasonInput.value = "";
    }
  }

  function bindAccountResultButtons() {
    root.querySelectorAll("[data-admin-account-select]").forEach((button) => {
      button.addEventListener("click", () => {
        state.accountLookup.selectedAccountId = button.dataset.adminAccountSelect || null;
        renderAccountLookupResults({
          keyword: state.accountLookup.keyword,
          items: state.accountLookup.items,
          totalResults: state.accountLookup.items.length,
        });
        renderAccountStatusDeck();
        setMessage("adminAccountStatusMessage", "", "");
      });
    });
  }

  function renderAccountLookupResults(response) {
    const resultsElement = document.getElementById("adminAccountLookupResults");
    const summaryElement = document.getElementById("adminAccountLookupSummary");
    const stateElement = document.getElementById("adminAccountLookupState");
    const countElement = document.getElementById("adminAccountLookupCount");

    if (!resultsElement || !summaryElement || !stateElement || !countElement) {
      return;
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    const totalResults = Number(response?.totalResults || items.length || 0);
    const keyword = (response?.keyword || "").trim();

    state.accountLookup.items = items;
    if (!items.some((item) => item.accountId === state.accountLookup.selectedAccountId)) {
      state.accountLookup.selectedAccountId = null;
    }

    countElement.textContent =
      totalResults > 0
        ? t("admin.accountLookup.resultCount", { count: totalResults }, `${totalResults} results`)
        : t("admin.accountLookup.emptyCount", {}, "No matches");

    if (totalResults === 0) {
      resultsElement.innerHTML = "";
      renderAccountLookupState(
        "admin.accountLookup.emptyState",
        "No matching accounts for this keyword",
      );
      summaryElement.textContent = keyword
        ? t(
            "admin.accountLookup.emptySummary",
            { keyword },
            `No matches for ${keyword}`,
          )
        : t(
            "admin.accountLookup.idleSummary",
            {},
            "Search by email, username or accountId",
          );
      stateElement.hidden = false;
      renderAccountStatusDeck();
      refreshIcons();
      return;
    }

    summaryElement.textContent = t(
      "admin.accountLookup.resultSummary",
      { count: totalResults, keyword },
      `${totalResults} results`,
    );
    resultsElement.innerHTML = items.map(buildLookupResultCard).join("");
    stateElement.hidden = true;
    bindAccountResultButtons();
    renderAccountStatusDeck();
    refreshIcons();
  }

  function renderModerationState(messageKey, fallback) {
    const stateElement = document.getElementById("adminModerationState");
    if (!stateElement) {
      return;
    }

    stateElement.innerHTML = `
      <div class="admin-lookup-empty-visual">
        <i data-lucide="shield-alert"></i>
      </div>
      <div class="admin-lookup-empty-copy">${escapeHtml(t(messageKey, {}, fallback))}</div>
    `;
  }

  function buildModerationSummary(item) {
    const parts = [
      item.lookupLabel || item.targetId,
      getModerationTargetLabel(item.targetType),
      getModerationStateLabel(item.currentState),
    ].filter(Boolean);

    return parts.join(" · ");
  }

  function buildModerationItemCard(item) {
    const displayOwner = item.ownerFullname || item.ownerUsername || item.ownerEmail || "";
    const isSelected = state.moderation.item?.targetId === item.targetId;
    const relatedPostLabel = item.relatedPostCode || item.relatedPostId || t("admin.common.notAvailable", {}, "Not available");
    const preview = (item.contentPreview || "").trim() || t("admin.moderation.previewEmpty", {}, "No preview available");

    return `
      <article class="admin-account-result-card${isSelected ? " is-selected" : ""}">
        <div class="admin-account-result-head">
          <div class="admin-account-result-avatar">${escapeHtml(buildInitials(displayOwner || item.lookupLabel, displayOwner))}</div>
          <div class="admin-account-result-copy">
            <div class="admin-account-result-name">${escapeHtml(item.lookupLabel || item.targetId)}</div>
            <div class="admin-account-result-username">${escapeHtml(displayOwner || t("admin.common.notAvailable", {}, "Not available"))}</div>
            <div class="admin-account-result-email">${escapeHtml(item.ownerEmail || "")}</div>
          </div>
        </div>

        <div class="admin-account-result-tags">
          <span class="admin-result-pill">${escapeHtml(getModerationTargetLabel(item.targetType))}</span>
          <span class="admin-result-pill ${getModerationStateClass(item.currentState)}">${escapeHtml(getModerationStateLabel(item.currentState))}</span>
          <span class="admin-result-pill">${escapeHtml(item.relatedPostCode || item.relatedPostId || t("admin.moderation.noRelatedPost", {}, "No related post"))}</span>
        </div>

        <div class="admin-account-result-meta">
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.moderation.fields.targetId", {}, "Target ID"))}</span>
            <strong>${escapeHtml(item.targetId || "")}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.moderation.fields.owner", {}, "Owner"))}</span>
            <strong>${escapeHtml(displayOwner || t("admin.common.notAvailable", {}, "Not available"))}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.moderation.fields.createdAt", {}, "Created at"))}</span>
            <strong>${escapeHtml(formatDateTime(item.createdAt))}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.moderation.fields.relatedPost", {}, "Related post"))}</span>
            <strong>${escapeHtml(relatedPostLabel)}</strong>
          </div>
        </div>

        <div class="admin-preview-box">${escapeHtml(preview)}</div>

        <div class="admin-card-footer">
          <button
            type="button"
            class="admin-action-btn admin-inline-action"
            data-admin-moderation-select="${escapeHtml(item.targetId || "")}"
          >
            <i data-lucide="${isSelected ? "check-check" : "scale"}"></i>
            <span>${escapeHtml(
              isSelected
                ? t("admin.moderation.selectedAction", {}, "Target selected")
                : t("admin.moderation.selectAction", {}, "Prepare action"),
            )}</span>
          </button>
        </div>
      </article>
    `;
  }

  function bindModerationResultButtons() {
    root.querySelectorAll("[data-admin-moderation-select]").forEach((button) => {
      button.addEventListener("click", () => {
        renderModerationActionDeck(state.moderation.item);
      });
    });
  }

  function populateModerationActionSelect(item) {
    const select = document.getElementById("adminModerationActionSelect");
    if (!select) {
      return;
    }

    const actions = getModerationActionOptions(item);
    select.innerHTML = actions
      .map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(getModerationActionLabel(action))}</option>`)
      .join("");
  }

  function renderModerationActionDeck(item) {
    const deck = document.getElementById("adminModerationActionDeck");
    const chip = document.getElementById("adminModerationCurrentState");
    const summary = document.getElementById("adminModerationTargetSummary");
    const reasonInput = document.getElementById("adminModerationReason");

    if (!deck || !chip || !summary) {
      return;
    }

    if (!item) {
      deck.hidden = true;
      return;
    }

    const actions = getModerationActionOptions(item);
    deck.hidden = false;
    chip.textContent = t(
      "admin.moderation.actionSelectedChip",
      { state: getModerationStateLabel(item.currentState) },
      getModerationStateLabel(item.currentState),
    );
    chip.className = `admin-chip ${getModerationStateClass(item.currentState)}`;
    summary.textContent = t(
      "admin.moderation.actionTargetSummary",
      {
        targetType: getModerationTargetLabel(item.targetType),
        label: item.lookupLabel || item.targetId,
        state: getModerationStateLabel(item.currentState),
      },
      buildModerationSummary(item),
    );

    populateModerationActionSelect(item);
    if (actions.length === 0) {
      setMessage(
        "adminModerationActionMessage",
        t("admin.moderation.noActionAvailable", {}, "No further moderation action is available for this target"),
        "info",
      );
    } else {
      setMessage("adminModerationActionMessage", "", "");
    }

    if (reasonInput && !reasonInput.dataset.preserved) {
      reasonInput.value = "";
    }
  }

  function renderModerationResults(response) {
    const resultsElement = document.getElementById("adminModerationResults");
    const summaryElement = document.getElementById("adminModerationSummary");
    const stateElement = document.getElementById("adminModerationState");
    const countElement = document.getElementById("adminModerationResultCount");

    if (!resultsElement || !summaryElement || !stateElement || !countElement) {
      return;
    }

    const item = response?.item || null;
    const keyword = (response?.keyword || "").trim();
    const targetType = response?.targetType || state.moderation.targetType;

    state.moderation.targetType = targetType;
    state.moderation.keyword = keyword;
    state.moderation.item = item;

    if (!item) {
      countElement.textContent = t("admin.moderation.emptyCount", {}, "No target found");
      summaryElement.textContent = keyword
        ? t(
            "admin.moderation.emptySummary",
            { keyword },
            `No target found for ${keyword}`,
          )
        : t("admin.moderation.idleSummary", {}, "Use an exact key to look up a moderation target");
      resultsElement.innerHTML = "";
      renderModerationState(
        "admin.moderation.emptyState",
        "Moderation target details appear here after a successful lookup",
      );
      stateElement.hidden = false;
      renderModerationActionDeck(null);
      refreshIcons();
      return;
    }

    countElement.textContent = t("admin.moderation.resultCount", { count: 1 }, "1 target");
    summaryElement.textContent = t(
      "admin.moderation.resultSummary",
      {
        targetType: getModerationTargetLabel(item.targetType),
        keyword,
      },
      buildModerationSummary(item),
    );
    resultsElement.innerHTML = buildModerationItemCard(item);
    stateElement.hidden = true;
    bindModerationResultButtons();
    renderModerationActionDeck(item);
    refreshIcons();
  }

  function buildReportCard(item) {
    const createdBy = getReportActorName(item);
    const isSelected = item.moderationReportId === state.reports.selectedReportId;

    return `
      <article class="admin-account-result-card${isSelected ? " is-selected" : ""}">
        <div class="admin-account-result-head">
          <div class="admin-account-result-avatar">${escapeHtml(buildInitials(createdBy, createdBy))}</div>
          <div class="admin-account-result-copy">
            <div class="admin-account-result-name">${escapeHtml(getReportTargetTypeLabel(item.targetType))}</div>
            <div class="admin-account-result-username">${escapeHtml(item.targetId || "")}</div>
            <div class="admin-account-result-email">${escapeHtml(getReportReasonCodeLabel(item.reasonCode))}</div>
          </div>
        </div>

        <div class="admin-account-result-tags">
          <span class="admin-result-pill ${getReportStatusClass(item.status)}">${escapeHtml(getReportStatusLabel(item.status))}</span>
          <span class="admin-result-pill">${escapeHtml(getReportSourceLabel(item.sourceType))}</span>
          <span class="admin-result-pill">${escapeHtml(getReportReasonCodeLabel(item.reasonCode))}</span>
        </div>

        <div class="admin-account-result-meta">
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.reports.fields.reportId", {}, "Report ID"))}</span>
            <strong>${escapeHtml(item.moderationReportId || "")}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.reports.fields.createdBy", {}, "Created by"))}</span>
            <strong>${escapeHtml(createdBy)}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.reports.fields.createdAt", {}, "Created at"))}</span>
            <strong>${escapeHtml(formatDateTime(item.createdAt))}</strong>
          </div>
          <div class="admin-account-result-row">
            <span>${escapeHtml(t("admin.reports.fields.updatedAt", {}, "Updated at"))}</span>
            <strong>${escapeHtml(formatDateTime(item.updatedAt))}</strong>
          </div>
        </div>

        <div class="admin-preview-box">${escapeHtml(item.detail || t("admin.reports.detailEmpty", {}, "No extra detail"))}</div>

        <div class="admin-card-footer">
          <button
            type="button"
            class="admin-action-btn admin-inline-action"
            data-admin-report-select="${escapeHtml(item.moderationReportId || "")}"
          >
            <i data-lucide="${isSelected ? "check-check" : "inbox"}"></i>
            <span>${escapeHtml(
              isSelected
                ? t("admin.reports.selectedAction", {}, "Managing this report")
                : t("admin.reports.selectAction", {}, "Manage queue status"),
            )}</span>
          </button>
        </div>
      </article>
    `;
  }

  function getSelectedReportItem() {
    return state.reports.items.find(
      (item) => item.moderationReportId === state.reports.selectedReportId,
    ) || null;
  }

  function renderReportState(messageKey, fallback) {
    const stateElement = document.getElementById("adminReportState");
    if (!stateElement) {
      return;
    }

    stateElement.innerHTML = `
      <div class="admin-lookup-empty-visual">
        <i data-lucide="files"></i>
      </div>
      <div class="admin-lookup-empty-copy">${escapeHtml(t(messageKey, {}, fallback))}</div>
    `;
  }

  function populateReportStatusSelect(item) {
    const select = document.getElementById("adminReportStatusSelect");
    if (!select) {
      return;
    }

    const options = reportStatuses.filter((status) => status !== item.status);
    select.innerHTML = options
      .map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(getReportStatusLabel(status))}</option>`)
      .join("");
  }

  function renderReportStatusDeck() {
    const deck = document.getElementById("adminReportStatusDeck");
    const chip = document.getElementById("adminReportStatusChip");
    const summary = document.getElementById("adminReportStatusSummary");
    const noteInput = document.getElementById("adminReportStatusNote");

    if (!deck || !chip || !summary) {
      return;
    }

    const item = getSelectedReportItem();
    if (!item) {
      deck.hidden = true;
      return;
    }

    deck.hidden = false;
    chip.textContent = t(
      "admin.reports.statusDeckSelectedChip",
      { status: getReportStatusLabel(item.status) },
      getReportStatusLabel(item.status),
    );
    chip.className = `admin-chip ${getReportStatusClass(item.status)}`;
    summary.textContent = t(
      "admin.reports.statusDeckSummarySelected",
      {
        targetType: getReportTargetTypeLabel(item.targetType),
        targetId: item.targetId,
        status: getReportStatusLabel(item.status),
      },
      `${item.targetId}`,
    );
    populateReportStatusSelect(item);
    if (noteInput && !noteInput.dataset.preserved) {
      noteInput.value = "";
    }
  }

  function bindReportResultButtons() {
    root.querySelectorAll("[data-admin-report-select]").forEach((button) => {
      button.addEventListener("click", () => {
        state.reports.selectedReportId = button.dataset.adminReportSelect || null;
        renderReportResults({
          items: state.reports.items,
          totalResults: state.reports.items.length,
          status: state.reports.filters.status,
          targetType: state.reports.filters.targetType,
        });
        renderReportStatusDeck();
        setMessage("adminReportStatusMessage", "", "");
      });
    });
  }

  function renderReportResults(response) {
    const resultsElement = document.getElementById("adminReportResults");
    const summaryElement = document.getElementById("adminReportSummary");
    const stateElement = document.getElementById("adminReportState");
    const countElement = document.getElementById("adminReportCount");

    if (!resultsElement || !summaryElement || !stateElement || !countElement) {
      return;
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    const totalResults = Number(response?.totalResults || items.length || 0);

    state.reports.items = items;
    if (!items.some((item) => item.moderationReportId === state.reports.selectedReportId)) {
      state.reports.selectedReportId = null;
    }

    countElement.textContent =
      totalResults > 0
        ? t("admin.reports.resultCount", { count: totalResults }, `${totalResults} reports`)
        : t("admin.reports.emptyCount", {}, "No reports");

    if (totalResults === 0) {
      resultsElement.innerHTML = "";
      summaryElement.textContent = t(
        "admin.reports.emptySummary",
        {},
        "No matching reports for the current filter",
      );
      renderReportState(
        "admin.reports.emptyState",
        "Report items appear here after the queue loads",
      );
      stateElement.hidden = false;
      renderReportStatusDeck();
      refreshIcons();
      return;
    }

    summaryElement.textContent = t(
      "admin.reports.resultSummary",
      { count: totalResults },
      `${totalResults} recent reports`,
    );
    resultsElement.innerHTML = items.map(buildReportCard).join("");
    stateElement.hidden = true;
    bindReportResultButtons();
    renderReportStatusDeck();
    refreshIcons();
  }

  function renderAuditLogState(messageKey, fallback) {
    const stateElement = document.getElementById("adminAuditLogState");
    if (!stateElement) {
      return;
    }

    stateElement.innerHTML = `
      <div class="admin-lookup-empty-visual">
        <i data-lucide="history"></i>
      </div>
      <div class="admin-lookup-empty-copy">${escapeHtml(t(messageKey, {}, fallback))}</div>
    `;
  }

  function buildAuditTargetText(item) {
    const normalizedTargetId = (item.targetId || "").trim();
    const parts = [];

    if ((item.targetType || "").trim()) {
      parts.push(getAuditTargetTypeLabel(item.targetType));
    }

    if (normalizedTargetId) {
      parts.push(normalizedTargetId);
    }

    if (parts.length === 0) {
      return t("admin.common.notAvailable", {}, "Not available");
    }

    return parts.join(" · ");
  }

  function getAuditNote(item) {
    const summary = (item.summary || "").trim();
    if (!summary) {
      return "";
    }

    if (normalizeKey(item.actionType) === "adminlogin") {
      return "";
    }

    return summary;
  }

  function buildAuditSummary(item) {
    const normalizedActionType = normalizeKey(item.actionType);
    return t(
      `admin.auditLog.summary.${normalizedActionType || "unknown"}`,
      {},
      item.summary || t("admin.auditLog.notAvailable", {}, "Not available"),
    );
  }

  function buildAuditTimelineItem(item) {
    const actorName = item.adminFullname || item.adminEmail || "Admin";
    const actionLabel = getAuditActionLabel(item.actionType);
    const moduleLabel = getAuditModuleLabel(item.module);
    const note = getAuditNote(item);

    return `
      <article class="admin-audit-item">
        <div class="admin-audit-item-head">
          <div class="admin-audit-item-copy">
            <div class="admin-audit-item-title">${escapeHtml(buildAuditSummary(item))}</div>
            <div class="admin-audit-item-subtitle">
              ${escapeHtml(actorName)} · ${escapeHtml(item.adminEmail || "")}
            </div>
          </div>
          <div class="admin-audit-item-time">${escapeHtml(formatDateTime(item.createdAt))}</div>
        </div>

        <div class="admin-account-result-tags">
          <span class="admin-result-pill">${escapeHtml(moduleLabel)}</span>
          <span class="admin-result-pill">${escapeHtml(actionLabel)}</span>
        </div>

        <div class="admin-audit-item-meta">
          <div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.actor", {}, "Actor"))}</span>
            <strong>${escapeHtml(actorName)}</strong>
          </div>
          <div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.action", {}, "Action"))}</span>
            <strong>${escapeHtml(actionLabel)}</strong>
          </div>
          <div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.target", {}, "Target"))}</span>
            <strong>${escapeHtml(buildAuditTargetText(item))}</strong>
          </div>
          ${
            note
              ? `<div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.note", {}, "Note"))}</span>
            <strong>${escapeHtml(note)}</strong>
          </div>`
              : ""
          }
          <div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.requestIp", {}, "Request IP"))}</span>
            <strong>${escapeHtml(item.requestIp || t("admin.common.notAvailable", {}, "Not available"))}</strong>
          </div>
          <div class="admin-audit-item-row">
            <span>${escapeHtml(t("admin.auditLog.fields.occurredAt", {}, "Occurred at"))}</span>
            <strong>${escapeHtml(formatDateTime(item.createdAt))}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function renderAuditLogResults(response) {
    const timelineElement = document.getElementById("adminAuditLogTimeline");
    const summaryElement = document.getElementById("adminAuditLogSummary");
    const stateElement = document.getElementById("adminAuditLogState");
    const countElement = document.getElementById("adminAuditLogCount");

    if (!timelineElement || !summaryElement || !stateElement || !countElement) {
      return;
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    const totalResults = Number(response?.totalResults || items.length || 0);

    countElement.textContent =
      totalResults > 0
        ? t("admin.auditLog.resultCount", { count: totalResults }, `${totalResults} log(s)`)
        : t("admin.auditLog.emptyCount", {}, "No logs yet");

    if (totalResults === 0) {
      timelineElement.innerHTML = "";
      summaryElement.textContent = t(
        "admin.auditLog.emptySummary",
        {},
        "No matching audit entries",
      );
      renderAuditLogState(
        "admin.auditLog.emptyState",
        "No matching audit entries for the current filter",
      );
      stateElement.hidden = false;
      refreshIcons();
      return;
    }

    summaryElement.textContent = t(
      "admin.auditLog.resultSummary",
      { count: totalResults },
      `${totalResults} recent log(s)`,
    );
    timelineElement.innerHTML = items.map(buildAuditTimelineItem).join("");
    stateElement.hidden = true;
    refreshIcons();
  }

  function populateAuditFilters() {
    const moduleSelect = document.getElementById("adminAuditModuleSelect");
    const actionSelect = document.getElementById("adminAuditActionSelect");

    if (!moduleSelect || !actionSelect) {
      return;
    }

    moduleSelect.innerHTML = [
      `<option value="">${escapeHtml(t("admin.auditLog.moduleFilter.all", {}, "All modules"))}</option>`,
      ...auditModules.map(
        (module) =>
          `<option value="${escapeHtml(module)}">${escapeHtml(
            t(`admin.auditLog.moduleFilter.${module}`, {}, module),
          )}</option>`,
      ),
    ].join("");

    actionSelect.innerHTML = [
      `<option value="">${escapeHtml(t("admin.auditLog.actionFilter.all", {}, "All actions"))}</option>`,
      ...auditActions.map(
        (action) =>
          `<option value="${escapeHtml(action)}">${escapeHtml(
            t(`admin.auditLog.actionFilter.${normalizeKey(action)}`, {}, action),
          )}</option>`,
      ),
    ].join("");
  }

  function populateSession(session) {
    if (!session) {
      return;
    }

    const displayName = session.fullname || session.username || "Admin";
    const emailOrRole =
      session.email || session.role || t("admin.profile.adminRole", {}, "Admin");

    setText("adminCurrentName", displayName);
    setText("adminCurrentMeta", emailOrRole);
    setText("adminCurrentRole", session.role || t("admin.profile.adminRole", {}, "Admin"));
    setText("adminCurrentInitials", buildInitials(displayName, session.email));
    setText("adminTopbarTimestamp", formatTimestamp(new Date()));
  }

  async function handleAuthFailure() {
    global.AdminAuthStore?.clear?.();
    await renderLogin(
      t("admin.login.errors.sessionExpired", {}, "Your admin session expired"),
      "error",
    );
  }

  async function readResponseMessage(response) {
    try {
      const payload = await response.clone().json();
      return typeof payload?.message === "string" ? payload.message.trim() : "";
    } catch (_error) {
      return "";
    }
  }

  async function fetchAccountLookup(keyword) {
    const response = await fetchAdminApi(
      `/admin/accounts/lookup?keyword=${encodeURIComponent(keyword)}`,
    );

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function updateAccountStatus(accountId, statusValue, reason) {
    const response = await fetchAdminApi(`/admin/accounts/${accountId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: Number(statusValue),
        reason,
      }),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function fetchModerationLookup(targetType, keyword) {
    const query = new URLSearchParams({
      targetType,
      keyword,
    });
    const response = await fetchAdminApi(`/admin/moderation/lookup?${query.toString()}`);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function applyModerationAction(targetType, targetId, action, reason) {
    const response = await fetchAdminApi(`/admin/moderation/${encodeURIComponent(targetType)}/${targetId}/action`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        reason,
      }),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function fetchReportQueue(filters) {
    const query = new URLSearchParams();
    query.set("limit", "12");

    if ((filters?.status || "").trim()) {
      query.set("status", filters.status.trim());
    }

    if ((filters?.targetType || "").trim()) {
      query.set("targetType", filters.targetType.trim());
    }

    const response = await fetchAdminApi(`/admin/reports/recent?${query.toString()}`);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function createInternalReport(payload) {
    const response = await fetchAdminApi("/admin/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function updateReportStatus(reportId, payload) {
    const response = await fetchAdminApi(`/admin/reports/${reportId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function fetchAuditLogs(module, actionType) {
    const query = new URLSearchParams();
    query.set("limit", "12");

    if ((module || "").trim()) {
      query.set("module", module.trim());
    }

    if ((actionType || "").trim()) {
      query.set("actionType", actionType.trim());
    }

    const response = await fetchAdminApi(`/admin/audit-logs/recent?${query.toString()}`);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  async function changeAdminPassword(currentPassword, newPassword, confirmPassword) {
    const response = await fetchAdminApi("/admin/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.serverMessage = await readResponseMessage(response);
      throw error;
    }

    return await response.json();
  }

  function populateSecurityIdentity() {
    const session = state.session || global.AdminAuthStore?.getProfile?.() || {};
    setText(
      "adminSecurityIdentityName",
      session.fullname || session.username || session.email || t("admin.profile.adminRole", {}, "Admin"),
    );
    setText(
      "adminSecurityIdentityEmail",
      session.email || t("admin.common.notAvailable", {}, "Not available"),
    );
    setText(
      "adminSecurityIdentityUsername",
      session.username ? `@${session.username}` : t("admin.common.notAvailable", {}, "Not available"),
    );
    setText(
      "adminSecurityIdentityRole",
      session.role || t("admin.profile.adminRole", {}, "Admin"),
    );
  }

  function updateSecurityRuleState(ruleId, isComplete) {
    const element = document.getElementById(ruleId);
    if (!element) {
      return;
    }

    element.classList.toggle("is-complete", !!isComplete);
  }

  function updateSecurityPasswordProgress() {
    const newPassword = document.getElementById("adminSecurityNewPassword")?.value || "";
    const progressFill = document.getElementById("adminSecurityProgressFill");
    const progressLabel = document.getElementById("adminSecurityProgressLabel");
    const rules = getPasswordRules(newPassword);

    if (progressFill) {
      progressFill.style.width = `${rules.progress}%`;
    }

    updateSecurityRuleState("adminSecurityRuleLength", rules.length);
    updateSecurityRuleState("adminSecurityRuleSpaces", rules.noSpaces);
    updateSecurityRuleState("adminSecurityRuleAccents", rules.noAccents);

    if (!progressLabel) {
      return;
    }

    if (!newPassword) {
      progressLabel.textContent = t(
        "admin.security.progress.empty",
        {},
        "Enter a new password to check the policy",
      );
      return;
    }

    if (rules.completedCount === 3) {
      progressLabel.textContent = t(
        "admin.security.progress.ready",
        {},
        "Password is ready to save",
      );
      return;
    }

    progressLabel.textContent = t(
      "admin.security.progress.incomplete",
      { count: rules.completedCount, total: 3 },
      `${rules.completedCount}/3 rules completed`,
    );
  }

  function updateSecurityVisibilityButton(button, isVisible) {
    if (!button) {
      return;
    }

    button.dataset.visible = isVisible ? "true" : "false";
    button.innerHTML = `<i data-lucide="${isVisible ? "eye-off" : "eye"}"></i>`;
    button.setAttribute(
      "aria-label",
      t(
        isVisible
          ? "admin.security.hidePasswordAria"
          : "admin.security.showPasswordAria",
        {},
        isVisible ? "Hide password" : "Show password",
      ),
    );
  }

  function bindSecurityVisibilityButtons() {
    root.querySelectorAll("[data-admin-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.adminPasswordToggle || "";
        const input = document.getElementById(targetId);
        if (!input) {
          return;
        }

        const nextVisible = input.type === "password";
        input.type = nextVisible ? "text" : "password";
        updateSecurityVisibilityButton(button, nextVisible);
        refreshIcons();
      });
    });
  }

  function resetSecurityPasswordVisibility() {
    root.querySelectorAll("[data-admin-password-toggle]").forEach((button) => {
      const targetId = button.dataset.adminPasswordToggle || "";
      const input = document.getElementById(targetId);
      if (!input) {
        return;
      }

      input.type = "password";
      updateSecurityVisibilityButton(button, false);
    });

    refreshIcons();
  }

  function mapAdminPasswordError(error) {
    const status = Number(error?.status || 0);
    const serverMessage = (error?.serverMessage || "").toString().trim().toLowerCase();

    if (status === 400) {
      if (serverMessage === "current password is required.") {
        return t(
          "admin.security.errors.currentRequired",
          {},
          "Enter your current password",
        );
      }

      if (serverMessage === "current password is incorrect.") {
        return t(
          "admin.security.errors.currentIncorrect",
          {},
          "Current password is incorrect",
        );
      }

      if (serverMessage === "new password is required.") {
        return t(
          "admin.security.errors.newRequired",
          {},
          "Enter your new password",
        );
      }

      if (serverMessage.includes("at least")) {
        return t(
          "admin.security.errors.length",
          { count: PASSWORD_MIN_LENGTH },
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        );
      }

      if (serverMessage === "password cannot contain spaces.") {
        return t(
          "admin.security.errors.spaces",
          {},
          "Password cannot contain spaces",
        );
      }

      if (serverMessage === "password cannot contain vietnamese accents.") {
        return t(
          "admin.security.errors.accents",
          {},
          "Password cannot contain Vietnamese accents",
        );
      }

      if (serverMessage === "password and confirm password do not match.") {
        return t(
          "admin.security.errors.confirmMismatch",
          {},
          "New password and confirm password do not match",
        );
      }
    }

    return t(
      "admin.security.errors.updateFailed",
      {},
      "Unable to change the admin password right now",
    );
  }

  function bindSecurityCenter() {
    const form = document.getElementById("adminSecurityPasswordForm");
    const currentInput = document.getElementById("adminSecurityCurrentPassword");
    const newInput = document.getElementById("adminSecurityNewPassword");
    const confirmInput = document.getElementById("adminSecurityConfirmPassword");
    const submitButton = document.getElementById("adminSecuritySubmit");
    const changedAtValue = document.getElementById("adminSecurityChangedAt");

    if (!form || !currentInput || !newInput || !confirmInput || !submitButton) {
      return;
    }

    populateSecurityIdentity();
    bindSecurityVisibilityButtons();
    resetSecurityPasswordVisibility();
    updateSecurityPasswordProgress();

    [newInput, confirmInput].forEach((input) => {
      input.addEventListener("input", updateSecurityPasswordProgress);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const currentPassword = currentInput.value || "";
      const newPassword = newInput.value || "";
      const confirmPassword = confirmInput.value || "";

      if (!currentPassword.trim()) {
        setMessage(
          "adminSecurityMessage",
          t(
            "admin.security.errors.currentRequired",
            {},
            "Enter your current password",
          ),
          "error",
        );
        currentInput.focus();
        return;
      }

      const passwordPolicyError = getAdminPasswordPolicyError(newPassword, confirmPassword);
      if (passwordPolicyError) {
        setMessage("adminSecurityMessage", passwordPolicyError, "error");
        if (!newPassword) {
          newInput.focus();
          return;
        }

        confirmInput.focus();
        return;
      }

      submitButton.disabled = true;
      setMessage(
        "adminSecurityMessage",
        t("admin.security.submitting", {}, "Updating admin password..."),
        "info",
      );

      try {
        const response = await changeAdminPassword(currentPassword, newPassword, confirmPassword);

        if (changedAtValue) {
          changedAtValue.textContent = formatDateTime(response?.changedAt);
        }

        global.AdminAuthStore?.clear?.();
        state.session = null;
        state.currentView = "overview";
        await renderLogin(
          t(
            "admin.security.reloginRequired",
            {},
            "Admin password updated, please sign in again",
          ),
          "info",
        );
        return;
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage("adminSecurityMessage", mapAdminPasswordError(error), "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  function bindAccountLookup() {
    const form = document.getElementById("adminAccountLookupForm");
    const input = document.getElementById("adminAccountLookupInput");
    const submitButton = document.getElementById("adminAccountLookupSubmit");
    const controlForm = document.getElementById("adminAccountStatusForm");
    const controlCancelButton = document.getElementById("adminAccountStatusCancel");
    const controlSubmitButton = document.getElementById("adminAccountStatusSubmit");
    const controlSelect = document.getElementById("adminAccountStatusSelect");
    const reasonInput = document.getElementById("adminAccountStatusReason");

    if (!form || !input || !submitButton || !controlForm || !controlCancelButton || !controlSubmitButton || !controlSelect || !reasonInput) {
      return;
    }

    renderAccountLookupState(
      "admin.accountLookup.idleState",
      "Start with a precise keyword to inspect account data without touching the social flow.",
    );
    renderAccountStatusDeck();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const keyword = (input.value || "").trim();
      if (!isLookupKeywordAccepted(keyword)) {
        setMessage(
          "adminAccountLookupMessage",
          t(
            "admin.accountLookup.errors.keywordTooShort",
            {},
            "Enter at least 3 characters, or use an exact email/accountId",
          ),
          "error",
        );
        renderAccountLookupState(
          "admin.accountLookup.idleState",
          "Start with a precise keyword to inspect account data without touching the social flow.",
        );
        refreshIcons();
        return;
      }

      submitButton.disabled = true;
      setMessage(
        "adminAccountLookupMessage",
        t("admin.accountLookup.searching", {}, "Searching accounts..."),
        "info",
      );
      renderAccountLookupState(
        "admin.accountLookup.loadingState",
        "Searching read-only account data...",
      );
      refreshIcons();

      try {
        const response = await fetchAccountLookup(keyword);
        state.accountLookup.keyword = keyword;
        renderAccountLookupResults(response);
        setMessage(
          "adminAccountLookupMessage",
          t(
            "admin.accountLookup.searchCompleted",
            { count: response.totalResults || 0 },
            "Search completed",
          ),
          "info",
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminAccountLookupMessage",
          t(
            "admin.accountLookup.errors.lookupFailed",
            {},
            "Unable to load admin account results right now",
          ),
          "error",
        );
        renderAccountLookupState(
          "admin.accountLookup.errorState",
          "Unable to load account results right now",
        );
        refreshIcons();
      } finally {
        submitButton.disabled = false;
      }
    });

    controlCancelButton.addEventListener("click", () => {
      state.accountLookup.selectedAccountId = null;
      reasonInput.value = "";
      renderAccountLookupResults({
        keyword: state.accountLookup.keyword,
        items: state.accountLookup.items,
        totalResults: state.accountLookup.items.length,
      });
      setMessage("adminAccountStatusMessage", "", "");
    });

    controlForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const selectedItem = getSelectedAccountItem();
      if (!selectedItem) {
        setMessage(
          "adminAccountStatusMessage",
          t("admin.accountLookup.errors.accountRequired", {}, "Select an account before changing status"),
          "error",
        );
        return;
      }

      const reason = (reasonInput.value || "").trim();
      if (!reason) {
        setMessage(
          "adminAccountStatusMessage",
          t("admin.accountLookup.errors.reasonRequired", {}, "Enter a reason for this status change"),
          "error",
        );
        reasonInput.focus();
        return;
      }

      const selectedLabel = controlSelect.options[controlSelect.selectedIndex]?.textContent || "";
      const confirmed = global.confirm(
        t(
          "admin.accountLookup.controlConfirm",
          {
            status: selectedLabel,
            name: selectedItem.fullname || selectedItem.username || selectedItem.email || selectedItem.accountId,
          },
          "Confirm this status change",
        ),
      );
      if (!confirmed) {
        return;
      }

      controlSubmitButton.disabled = true;
      setMessage(
        "adminAccountStatusMessage",
        t("admin.accountLookup.controlSubmitting", {}, "Applying status change..."),
        "info",
      );

      try {
        const response = await updateAccountStatus(
          selectedItem.accountId,
          controlSelect.value,
          reason,
        );

        state.accountLookup.items = state.accountLookup.items.map((item) => {
          if (item.accountId !== response.accountId) {
            return item;
          }

          return {
            ...item,
            status: response.currentStatus,
          };
        });
        state.accountLookup.selectedAccountId = response.accountId;
        renderAccountLookupResults({
          keyword: state.accountLookup.keyword,
          items: state.accountLookup.items,
          totalResults: state.accountLookup.items.length,
        });
        setMessage(
          "adminAccountStatusMessage",
          t(
            "admin.accountLookup.controlUpdated",
            {
              status: getStatusLabel(response.currentStatus),
            },
            "Account status updated",
          ),
          "info",
        );
        reasonInput.value = "";

        if (response.requiresSignOut) {
          global.AdminAuthStore?.clear?.();
          await renderLogin(
            t(
              "admin.accountLookup.selfSessionReset",
              { status: getStatusLabel(response.currentStatus) },
              "Your admin account no longer has an active admin session",
            ),
            "info",
          );
        }
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminAccountStatusMessage",
          t(
            "admin.accountLookup.errors.statusUpdateFailed",
            {},
            "Unable to update account status right now",
          ),
          "error",
        );
      } finally {
        controlSubmitButton.disabled = false;
      }
    });
  }

  function bindModerationCenter() {
    const lookupForm = document.getElementById("adminModerationLookupForm");
    const targetTypeSelect = document.getElementById("adminModerationTargetType");
    const keywordInput = document.getElementById("adminModerationKeyword");
    const lookupSubmitButton = document.getElementById("adminModerationLookupSubmit");
    const actionForm = document.getElementById("adminModerationActionForm");
    const actionSelect = document.getElementById("adminModerationActionSelect");
    const reasonInput = document.getElementById("adminModerationReason");
    const clearButton = document.getElementById("adminModerationClear");
    const actionSubmitButton = document.getElementById("adminModerationActionSubmit");

    if (
      !lookupForm ||
      !targetTypeSelect ||
      !keywordInput ||
      !lookupSubmitButton ||
      !actionForm ||
      !actionSelect ||
      !reasonInput ||
      !clearButton ||
      !actionSubmitButton
    ) {
      return;
    }

    targetTypeSelect.value = state.moderation.targetType;
    keywordInput.value = state.moderation.keyword || "";
    renderModerationState(
      "admin.moderation.idleState",
      "Moderation target details appear here after a successful lookup.",
    );
    renderModerationActionDeck(state.moderation.item);

    lookupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const targetType = targetTypeSelect.value || "Post";
      const keyword = (keywordInput.value || "").trim();
      if (!moderationTargetTypes.includes(targetType) || !isModerationKeywordAccepted(targetType, keyword)) {
        setMessage(
          "adminModerationLookupMessage",
          t(
            "admin.moderation.errors.invalidLookupKey",
            {},
            "Use an exact targetId, or a precise postCode for posts",
          ),
          "error",
        );
        renderModerationState(
          "admin.moderation.idleState",
          "Moderation target details appear here after a successful lookup.",
        );
        refreshIcons();
        return;
      }

      lookupSubmitButton.disabled = true;
      setMessage(
        "adminModerationLookupMessage",
        t("admin.moderation.lookupLoading", {}, "Looking up moderation target..."),
        "info",
      );
      renderModerationState(
        "admin.moderation.loadingState",
        "Loading moderation target details...",
      );
      refreshIcons();

      try {
        const response = await fetchModerationLookup(targetType, keyword);
        renderModerationResults(response);
        setMessage(
          "adminModerationLookupMessage",
          response?.item
            ? t("admin.moderation.lookupLoaded", {}, "Target loaded")
            : t("admin.moderation.lookupEmpty", {}, "No target matched this lookup"),
          "info",
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminModerationLookupMessage",
          t(
            "admin.moderation.errors.lookupFailed",
            {},
            "Unable to load moderation target right now",
          ),
          "error",
        );
        renderModerationState(
          "admin.moderation.errorState",
          "Unable to load moderation target right now",
        );
        refreshIcons();
      } finally {
        lookupSubmitButton.disabled = false;
      }
    });

    clearButton.addEventListener("click", () => {
      state.moderation.item = null;
      reasonInput.value = "";
      renderModerationResults({
        targetType: targetTypeSelect.value || state.moderation.targetType,
        keyword: state.moderation.keyword,
        item: null,
      });
      setMessage("adminModerationActionMessage", "", "");
    });

    actionForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const item = state.moderation.item;
      if (!item) {
        setMessage(
          "adminModerationActionMessage",
          t("admin.moderation.errors.targetRequired", {}, "Look up a target before applying an action"),
          "error",
        );
        return;
      }

      const reason = (reasonInput.value || "").trim();
      if (!reason) {
        setMessage(
          "adminModerationActionMessage",
          t("admin.moderation.errors.reasonRequired", {}, "Enter a reason for this moderation action"),
          "error",
        );
        reasonInput.focus();
        return;
      }

      const action = actionSelect.value;
      if (!action) {
        setMessage(
          "adminModerationActionMessage",
          t("admin.moderation.errors.actionRequired", {}, "Select a moderation action"),
          "error",
        );
        return;
      }

      const confirmed = global.confirm(
        t(
          "admin.moderation.actionConfirm",
          {
            action: getModerationActionLabel(action),
            targetType: getModerationTargetLabel(item.targetType),
            label: item.lookupLabel || item.targetId,
          },
          "Confirm this moderation action",
        ),
      );
      if (!confirmed) {
        return;
      }

      actionSubmitButton.disabled = true;
      setMessage(
        "adminModerationActionMessage",
        t("admin.moderation.actionSubmitting", {}, "Applying moderation action..."),
        "info",
      );

      try {
        const response = await applyModerationAction(item.targetType, item.targetId, action, reason);
        renderModerationResults({
          targetType: response.item?.targetType || item.targetType,
          keyword: state.moderation.keyword,
          item: response.item,
        });
        setMessage(
          "adminModerationActionMessage",
          t(
            "admin.moderation.actionUpdated",
            {
              action: getModerationActionLabel(response.action),
            },
            "Moderation action applied",
          ),
          "info",
        );
        reasonInput.value = "";
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminModerationActionMessage",
          t(
            "admin.moderation.errors.actionFailed",
            {},
            "Unable to apply moderation action right now",
          ),
          "error",
        );
      } finally {
        actionSubmitButton.disabled = false;
      }
    });
  }

  async function loadReportQueue() {
    const refreshButton = document.getElementById("adminReportRefreshBtn");
    if (refreshButton) {
      refreshButton.disabled = true;
    }

    setMessage(
      "adminReportFilterMessage",
      t("admin.reports.queueLoading", {}, "Loading report queue..."),
      "info",
    );
    renderReportState(
      "admin.reports.loadingState",
      "Loading report queue...",
    );
    refreshIcons();

    try {
      const response = await fetchReportQueue(state.reports.filters);
      renderReportResults(response);
      setMessage(
        "adminReportFilterMessage",
        t("admin.reports.queueLoaded", {}, "Report queue refreshed"),
        "info",
      );
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401 || status === 403) {
        await handleAuthFailure();
        return;
      }

      setMessage(
        "adminReportFilterMessage",
        t("admin.reports.errors.queueFailed", {}, "Unable to load the report queue right now"),
        "error",
      );
      renderReportState(
        "admin.reports.errorState",
        "Unable to load report items right now",
      );
      refreshIcons();
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  }

  function bindReportCenter() {
    const createForm = document.getElementById("adminReportCreateForm");
    const targetTypeSelect = document.getElementById("adminReportTargetType");
    const targetIdInput = document.getElementById("adminReportTargetId");
    const reasonCodeSelect = document.getElementById("adminReportReasonCode");
    const detailInput = document.getElementById("adminReportDetail");
    const createSubmitButton = document.getElementById("adminReportCreateSubmit");
    const filterForm = document.getElementById("adminReportFilterForm");
    const statusFilterSelect = document.getElementById("adminReportStatusFilter");
    const targetFilterSelect = document.getElementById("adminReportTargetFilter");
    const statusForm = document.getElementById("adminReportStatusForm");
    const statusSelect = document.getElementById("adminReportStatusSelect");
    const noteInput = document.getElementById("adminReportStatusNote");
    const clearButton = document.getElementById("adminReportStatusClear");
    const statusSubmitButton = document.getElementById("adminReportStatusSubmit");

    if (
      !createForm ||
      !targetTypeSelect ||
      !targetIdInput ||
      !reasonCodeSelect ||
      !detailInput ||
      !createSubmitButton ||
      !filterForm ||
      !statusFilterSelect ||
      !targetFilterSelect ||
      !statusForm ||
      !statusSelect ||
      !noteInput ||
      !clearButton ||
      !statusSubmitButton
    ) {
      return;
    }

    statusFilterSelect.value = state.reports.filters.status;
    targetFilterSelect.value = state.reports.filters.targetType;
    renderReportState(
      "admin.reports.idleState",
      "Report items appear here after the queue loads.",
    );
    renderReportStatusDeck();

    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const targetType = targetTypeSelect.value;
      const targetId = (targetIdInput.value || "").trim();
      const reasonCode = reasonCodeSelect.value;
      const detail = (detailInput.value || "").trim();

      if (!reportTargetTypes.includes(targetType) || !isGuidKeyword(targetId)) {
        setMessage(
          "adminReportCreateMessage",
          t("admin.reports.errors.invalidTargetId", {}, "Enter a valid target ID"),
          "error",
        );
        targetIdInput.focus();
        return;
      }

      const confirmed = global.confirm(
        t(
          "admin.reports.createConfirm",
          {
            targetType: getReportTargetTypeLabel(targetType),
            targetId,
            reasonCode: getReportReasonCodeLabel(reasonCode),
          },
          "Confirm this internal report",
        ),
      );
      if (!confirmed) {
        return;
      }

      createSubmitButton.disabled = true;
      setMessage(
        "adminReportCreateMessage",
        t("admin.reports.createSubmitting", {}, "Creating internal report..."),
        "info",
      );

      try {
        const createdItem = await createInternalReport({
          targetType,
          targetId,
          reasonCode,
          detail,
        });

        detailInput.value = "";
        targetIdInput.value = "";
        state.reports.selectedReportId = createdItem.moderationReportId;
        await loadReportQueue();
        setMessage(
          "adminReportCreateMessage",
          t("admin.reports.created", {}, "Internal report created"),
          "info",
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminReportCreateMessage",
          t("admin.reports.errors.createFailed", {}, "Unable to create the internal report right now"),
          "error",
        );
      } finally {
        createSubmitButton.disabled = false;
      }
    });

    filterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.reports.filters.status = statusFilterSelect.value || "";
      state.reports.filters.targetType = targetFilterSelect.value || "";
      await loadReportQueue();
    });

    clearButton.addEventListener("click", () => {
      state.reports.selectedReportId = null;
      noteInput.value = "";
      renderReportResults({
        items: state.reports.items,
        totalResults: state.reports.items.length,
      });
      setMessage("adminReportStatusMessage", "", "");
    });

    statusForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const selectedItem = getSelectedReportItem();
      if (!selectedItem) {
        setMessage(
          "adminReportStatusMessage",
          t("admin.reports.errors.reportRequired", {}, "Select a report before changing queue status"),
          "error",
        );
        return;
      }

      const nextStatus = statusSelect.value;
      if (!nextStatus) {
        setMessage(
          "adminReportStatusMessage",
          t("admin.reports.errors.statusRequired", {}, "Select a target report status"),
          "error",
        );
        return;
      }

      const confirmed = global.confirm(
        t(
          "admin.reports.statusConfirm",
          {
            targetType: getReportTargetTypeLabel(selectedItem.targetType),
            targetId: selectedItem.targetId,
            status: getReportStatusLabel(nextStatus),
          },
          "Confirm this queue transition",
        ),
      );
      if (!confirmed) {
        return;
      }

      statusSubmitButton.disabled = true;
      setMessage(
        "adminReportStatusMessage",
        t("admin.reports.statusSubmitting", {}, "Updating report status..."),
        "info",
      );

      try {
        const updatedItem = await updateReportStatus(selectedItem.moderationReportId, {
          status: nextStatus,
          note: (noteInput.value || "").trim(),
        });

        state.reports.selectedReportId = updatedItem.moderationReportId;
        noteInput.value = "";
        await loadReportQueue();
        setMessage(
          "adminReportStatusMessage",
          t("admin.reports.statusUpdated", {}, "Report status updated"),
          "info",
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminReportStatusMessage",
          t("admin.reports.errors.statusFailed", {}, "Unable to update report status right now"),
          "error",
        );
      } finally {
        statusSubmitButton.disabled = false;
      }
    });

    loadReportQueue();
  }

  async function bindAuditLog() {
    const form = document.getElementById("adminAuditLogForm");
    const moduleSelect = document.getElementById("adminAuditModuleSelect");
    const actionSelect = document.getElementById("adminAuditActionSelect");
    const refreshButton = document.getElementById("adminAuditRefreshBtn");

    if (!form || !moduleSelect || !actionSelect || !refreshButton) {
      return;
    }

    populateAuditFilters();
    renderAuditLogState(
      "admin.auditLog.idleState",
      "Audit entries will appear here once admin actions are recorded.",
    );

    const loadAuditLogs = async () => {
      refreshButton.disabled = true;
      setMessage(
        "adminAuditLogMessage",
        t("admin.auditLog.loading", {}, "Loading audit logs..."),
        "info",
      );
      renderAuditLogState(
        "admin.auditLog.loadingState",
        "Loading recent audit data...",
      );
      refreshIcons();

      try {
        const response = await fetchAuditLogs(moduleSelect.value, actionSelect.value);
        renderAuditLogResults(response);
        setMessage(
          "adminAuditLogMessage",
          t("admin.auditLog.loaded", {}, "Audit log refreshed"),
          "info",
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status === 401 || status === 403) {
          await handleAuthFailure();
          return;
        }

        setMessage(
          "adminAuditLogMessage",
          t(
            "admin.auditLog.errors.loadFailed",
            {},
            "Unable to load the admin audit log right now",
          ),
          "error",
        );
        renderAuditLogState(
          "admin.auditLog.errorState",
          "Unable to load audit logs right now",
        );
        refreshIcons();
      } finally {
        refreshButton.disabled = false;
      }
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadAuditLogs();
    });

    await loadAuditLogs();
  }

  function getViewConfig(viewName) {
    const views = {
      overview: {
        partial: paths.foundation,
        titleKey: "admin.topbar.views.overviewTitle",
        subtitleKey: "admin.topbar.views.overviewSubtitle",
        stepKey: "admin.topbar.views.overviewStep",
      },
      security: {
        partial: paths.security,
        titleKey: "admin.topbar.views.securityTitle",
        subtitleKey: "admin.topbar.views.securitySubtitle",
        stepKey: "admin.topbar.views.securityStep",
      },
      accounts: {
        partial: paths.accountLookup,
        titleKey: "admin.topbar.views.accountsTitle",
        subtitleKey: "admin.topbar.views.accountsSubtitle",
        stepKey: "admin.topbar.views.accountsStep",
      },
      moderation: {
        partial: paths.moderation,
        titleKey: "admin.topbar.views.moderationTitle",
        subtitleKey: "admin.topbar.views.moderationSubtitle",
        stepKey: "admin.topbar.views.moderationStep",
      },
      reports: {
        partial: paths.reports,
        titleKey: "admin.topbar.views.reportsTitle",
        subtitleKey: "admin.topbar.views.reportsSubtitle",
        stepKey: "admin.topbar.views.reportsStep",
      },
      "audit-log": {
        partial: paths.auditLog,
        titleKey: "admin.topbar.views.auditTitle",
        subtitleKey: "admin.topbar.views.auditSubtitle",
        stepKey: "admin.topbar.views.auditStep",
      },
    };

    return views[viewName] || views.overview;
  }

  function setActiveAdminView(viewName) {
    root.querySelectorAll("[data-admin-view]").forEach((button) => {
      const isActive = button.dataset.adminView === viewName;
      button.classList.toggle("active", isActive);

      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function applyTopbarView(viewName) {
    const config = getViewConfig(viewName);
    setText("adminTopbarTitle", t(config.titleKey, {}, "Shared admin shell"));
    setText(
      "adminTopbarSubtitle",
      t(
        config.subtitleKey,
        {},
        "A unified shell for isolated admin operations.",
      ),
    );
    setText("adminTopbarStep", t(config.stepKey, {}, "Shell ready"));
  }

  async function renderView(viewName) {
    const shellContent = document.getElementById("adminShellContent");
    if (!shellContent) {
      return;
    }

    const supportedViews = ["overview", "security", "accounts", "moderation", "reports", "audit-log"];
    const normalizedView = supportedViews.includes(viewName)
      ? viewName
      : "overview";
    const config = getViewConfig(normalizedView);

    shellContent.innerHTML = await loadPartial(config.partial);
    translateDom(shellContent);
    setActiveAdminView(normalizedView);
    applyTopbarView(normalizedView);
    state.currentView = normalizedView;

    if (normalizedView === "overview") {
      await hydrateBootstrap();
    }

    if (normalizedView === "security") {
      bindSecurityCenter();
    }

    if (normalizedView === "accounts") {
      bindAccountLookup();
    }

    if (normalizedView === "moderation") {
      bindModerationCenter();
    }

    if (normalizedView === "reports") {
      bindReportCenter();
    }

    if (normalizedView === "audit-log") {
      await bindAuditLog();
    }

    refreshIcons();
  }

  async function hydrateBootstrap() {
    try {
      const response = await fetchAdminApi("/admin/portal/bootstrap");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      renderBootstrap(data);
    } catch (_error) {
      setText(
        "adminBootstrapStatus",
        t("admin.bootstrapUnavailable", {}, "Unavailable"),
      );
      setText(
        "adminBootstrapModules",
        t(
          "admin.bootstrapUnavailableDetail",
          {},
          "Admin bootstrap endpoint is not reachable yet",
        ),
      );
    }
  }

  async function fetchSession() {
    const token = global.AdminAuthStore?.getAccessToken?.();
    if (!token) {
      return null;
    }

    try {
      const response = await fetchAdminApi("/admin/auth/session");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const session = await response.json();
      global.AdminAuthStore?.setProfile?.(session);
      return session;
    } catch (_error) {
      global.AdminAuthStore?.clear?.();
      return null;
    }
  }

  async function renderDashboard(session) {
    if (!root) {
      return;
    }

    try {
      root.innerHTML = await loadPartial(paths.dashboard);
      translateDom(root);
      state.session = session;
      populateSession(session);
      bindActions();
      await renderView(state.currentView || "overview");
    } catch (_error) {
      root.innerHTML = `
        <div class="admin-loading-state">
          ${t("admin.loadingFailed", {}, "Unable to load admin shell")}
        </div>
      `;
    }
  }

  async function login(email, password) {
    const response = await fetchAdminApi("/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  function bindLoginForm(initialMessage = "", initialType = "") {
    const form = document.getElementById("adminLoginForm");
    const submitButton = document.getElementById("adminLoginSubmit");
    const emailInput = document.getElementById("adminLoginEmail");
    const passwordInput = document.getElementById("adminLoginPassword");

    if (!form || !submitButton || !emailInput || !passwordInput) {
      return;
    }

    if (initialMessage) {
      setMessage("adminLoginMessage", initialMessage, initialType || "info");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = (emailInput.value || "").trim();
      const password = (passwordInput.value || "").trim();

      if (!email) {
        setMessage(
          "adminLoginMessage",
          t("admin.login.errors.emailRequired", {}, "Please enter your email"),
          "error",
        );
        emailInput.focus();
        return;
      }

      if (!password) {
        setMessage(
          "adminLoginMessage",
          t(
            "admin.login.errors.passwordRequired",
            {},
            "Please enter your password",
          ),
          "error",
        );
        passwordInput.focus();
        return;
      }

      submitButton.disabled = true;
      setMessage("adminLoginMessage", t("admin.login.signingIn", {}, "Signing in..."), "info");

      try {
        const result = await login(email, password);
        global.AdminAuthStore?.setAccessToken?.(result.accessToken || "");
        global.AdminAuthStore?.setProfile?.({
          accountId: result.accountId,
          email: result.email,
          fullname: result.fullname,
          username: result.username,
          avatarUrl: result.avatarUrl,
          role: result.role,
        });

        const session = await fetchSession();
        if (!session) {
          throw new Error("session-failed");
        }

        await renderDashboard(session);
      } catch (error) {
        const status = Number(error?.status || 0);
        let message = t(
          "admin.login.errors.generic",
          {},
          "Unable to sign in to the admin portal right now",
        );

        if (status === 401) {
          message = t(
            "admin.login.errors.invalidCredentials",
            {},
            "Incorrect email or password",
          );
        } else if (status === 403) {
          message = t(
            "admin.login.errors.accessDenied",
            {},
            "This account does not have admin access",
          );
        }

        setMessage("adminLoginMessage", message, "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  async function renderLogin(initialMessage = "", initialType = "") {
    if (!root) {
      return;
    }

    try {
      root.innerHTML = await loadPartial(paths.login);
      translateDom(root);
      bindLoginForm(initialMessage, initialType);
      refreshIcons();
    } catch (_error) {
      root.innerHTML = `
        <div class="admin-loading-state">
          ${t("admin.loadingFailed", {}, "Unable to load admin shell")}
        </div>
      `;
    }
  }

  async function init() {
    if (!root) {
      return;
    }

    const session = await fetchSession();
    if (session) {
      await renderDashboard(session);
      return;
    }

    await renderLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
