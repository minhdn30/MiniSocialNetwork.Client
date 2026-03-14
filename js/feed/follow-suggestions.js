(function (global) {
  const RouteHelper = global.RouteHelper;
  const SUGGESTIONS_PATH = RouteHelper?.PATHS?.SUGGESTIONS || "/suggestions";
  const HOME_SURFACE = "home";
  const PAGE_SURFACE = "page";
  const DEFAULT_HOME_PAGE_SIZE = 5;
  const DEFAULT_PAGE_SIZE = 12;
  const DEFAULT_MAX_PAGES = 10;
  const PAGE_SCROLL_THRESHOLD_PX = 320;

  let homeRequestToken = 0;
  let pageRequestToken = 0;
  let scrollListenerBound = false;

  const pageState = {
    page: 0,
    totalPages: 1,
    totalItems: 0,
    hasNextPage: true,
    isLoading: false,
    loadFailed: false,
    items: [],
  };

  function sugT(key, params = {}, fallback = "") {
    if (global.I18n?.t) {
      return global.I18n.t(key, params, fallback);
    }
    return fallback;
  }

  function pickValue(source, keys = []) {
    if (!source || typeof source !== "object") return undefined;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        return source[key];
      }
    }
    return undefined;
  }

  function readBoolean(source, keys = [], fallback = false) {
    const value = pickValue(source, keys);
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
    return fallback;
  }

  function readNumber(source, keys = [], fallback = 0) {
    const value = pickValue(source, keys);
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readStringArray(source, keys = []) {
    const value = pickValue(source, keys);
    if (!Array.isArray(value)) return [];

    return value
      .map((item) =>
        item === undefined || item === null ? "" : `${item}`.trim(),
      )
      .filter(Boolean);
  }

  function normalizePositiveInt(value, fallback = 1) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : fallback;
  }

  function getHomePageSize() {
    return normalizePositiveInt(
      global.APP_CONFIG?.FOLLOW_SUGGESTIONS_HOME_PAGE_SIZE,
      DEFAULT_HOME_PAGE_SIZE,
    );
  }

  function getPageSize() {
    return normalizePositiveInt(
      global.APP_CONFIG?.FOLLOW_SUGGESTIONS_PAGE_SIZE,
      DEFAULT_PAGE_SIZE,
    );
  }

  function getMaxPages() {
    return normalizePositiveInt(
      global.APP_CONFIG?.FOLLOW_SUGGESTIONS_MAX_PAGES,
      DEFAULT_MAX_PAGES,
    );
  }

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function getAvatarUrl(item) {
    return (
      item.avatarUrl ||
      global.APP_CONFIG?.DEFAULT_AVATAR ||
      "assets/images/default-avatar.jpg"
    );
  }

  function getPrimaryName(item) {
    return (
      global.PostUtils?.truncateName?.(item.username || "") ||
      item.username ||
      item.fullName ||
      item.accountId
    );
  }

  function getSecondaryName(item) {
    return item.fullName || "";
  }

  function buildProfileHash(profileTarget) {
    const safeTarget = (profileTarget || "").toString().trim();
    if (RouteHelper?.buildProfileHash) {
      return RouteHelper.buildProfileHash(safeTarget);
    }
    if (!safeTarget) return "#/";
    return `#/${encodeURIComponent(safeTarget)}`;
  }

  function buildSuggestionsHash() {
    if (RouteHelper?.buildHash) {
      return RouteHelper.buildHash(SUGGESTIONS_PATH);
    }
    return `#${SUGGESTIONS_PATH}`;
  }

  function isSuggestionsPath(rawHashOrPath) {
    const rawValue = (rawHashOrPath || global.location.hash || "")
      .toString()
      .trim();
    if (!rawValue) return false;

    if (RouteHelper?.parseHash) {
      return RouteHelper.parseHash(rawValue).path === SUGGESTIONS_PATH;
    }

    const normalized = rawValue.startsWith("#") ? rawValue.slice(1) : rawValue;
    return normalized.split("?")[0] === SUGGESTIONS_PATH;
  }

  function normalizeSuggestionItem(rawItem) {
    return {
      accountId: (pickValue(rawItem, ["accountId", "AccountId"]) || "")
        .toString()
        .trim(),
      username: (pickValue(rawItem, ["username", "Username"]) || "")
        .toString()
        .trim(),
      fullName: (pickValue(rawItem, ["fullName", "FullName"]) || "")
        .toString()
        .trim(),
      avatarUrl: (pickValue(rawItem, ["avatarUrl", "AvatarUrl"]) || "")
        .toString()
        .trim(),
      isFollowing: readBoolean(rawItem, ["isFollowing", "IsFollowing"]),
      isFollowRequested: readBoolean(rawItem, [
        "isFollowRequested",
        "IsFollowRequested",
      ]),
      isFollower: readBoolean(rawItem, ["isFollower", "IsFollower"]),
      hasDirectConversation: readBoolean(rawItem, [
        "hasDirectConversation",
        "HasDirectConversation",
      ]),
      isContact: readBoolean(rawItem, ["isContact", "IsContact"]),
      lastContactedAt: (
        pickValue(rawItem, ["lastContactedAt", "LastContactedAt"]) || ""
      )
        .toString()
        .trim(),
      mutualFollowCount: Math.max(
        0,
        readNumber(rawItem, ["mutualFollowCount", "MutualFollowCount"]),
      ),
      mutualFollowPreviewUsernames: readStringArray(rawItem, [
        "mutualFollowPreviewUsernames",
        "MutualFollowPreviewUsernames",
      ]),
    };
  }

  function normalizePagingResponse(payload, requestedPage, requestedPageSize) {
    const items = Array.isArray(payload?.items ?? payload?.Items)
      ? (payload.items ?? payload.Items)
          .map(normalizeSuggestionItem)
          .filter((item) => item.accountId)
      : [];

    const page = Math.max(
      1,
      normalizePositiveInt(
        readNumber(payload, ["page", "Page"], requestedPage),
        requestedPage,
      ),
    );
    const pageSize = normalizePositiveInt(
      readNumber(payload, ["pageSize", "PageSize"], requestedPageSize),
      requestedPageSize,
    );
    const totalItems = Math.max(
      0,
      readNumber(payload, ["totalItems", "TotalItems"], items.length),
    );
    const rawTotalPages = Math.max(
      0,
      readNumber(payload, ["totalPages", "TotalPages"]),
    );
    const computedTotalPages =
      rawTotalPages > 0
        ? rawTotalPages
        : pageSize > 0
          ? Math.ceil(totalItems / pageSize)
          : 1;
    const totalPages = Math.max(
      1,
      Math.min(computedTotalPages || 1, getMaxPages()),
    );

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
    };
  }

  function resolveRelation(item) {
    if (global.FollowModule?.resolveEffectiveFollowRelation) {
      return global.FollowModule.resolveEffectiveFollowRelation(
        item.accountId,
        {
          isFollowedByCurrentUser: item.isFollowing,
          isFollowRequested: item.isFollowRequested,
        },
        item.isFollowing,
      );
    }

    return {
      isFollowing: item.isFollowing,
      isRequested: item.isFollowRequested,
    };
  }

  function buildReasonText(item) {
    if (item.isFollower) {
      return (
        global.AccountRelationshipText?.resolveLabel?.({
          isFollower: true,
        }) || sugT("common.relationships.followsYou", {}, "Follows you")
      );
    }

    const mutualFollowCount = Math.max(0, item.mutualFollowCount || 0);
    const previewUsernames = Array.isArray(item.mutualFollowPreviewUsernames)
      ? item.mutualFollowPreviewUsernames.filter(Boolean).slice(0, 2)
      : [];

    if (mutualFollowCount > 0) {
      if (previewUsernames.length >= 2) {
        const otherCount = mutualFollowCount - 2;
        if (otherCount > 0) {
          return sugT(
            "follow.suggestions.labels.followedByTwoAndOthers",
            {
              first: previewUsernames[0],
              second: previewUsernames[1],
              count: otherCount,
            },
            `Followed by ${previewUsernames[0]}, ${previewUsernames[1]} and ${otherCount} others`,
          );
        }

        return sugT(
          "follow.suggestions.labels.followedByTwo",
          {
            first: previewUsernames[0],
            second: previewUsernames[1],
          },
          `Followed by ${previewUsernames[0]} and ${previewUsernames[1]}`,
        );
      }

      if (previewUsernames.length === 1) {
        const otherCount = mutualFollowCount - 1;
        if (otherCount > 0) {
          return sugT(
            "follow.suggestions.labels.followedByOneAndOthers",
            {
              name: previewUsernames[0],
              count: otherCount,
            },
            `Followed by ${previewUsernames[0]} and ${otherCount} others`,
          );
        }

        return sugT(
          "follow.suggestions.labels.followedByOne",
          { name: previewUsernames[0] },
          `Followed by ${previewUsernames[0]}`,
        );
      }

      return sugT(
        "follow.suggestions.labels.mutualFollows",
        { count: mutualFollowCount },
        `${mutualFollowCount} mutual follows`,
      );
    }

    if (item.hasDirectConversation) {
      return (
        global.AccountRelationshipText?.resolveLabel?.({
          hasDirectConversation: item.hasDirectConversation,
          lastContactedAt: item.lastContactedAt,
        }) || sugT("common.relationships.messagedBefore", {}, "Messaged before")
      );
    }

    return sugT(
      "follow.suggestions.labels.suggestedForYou",
      {},
      "Suggested for you",
    );
  }

  function renderCard(item, options = {}) {
    const showReason = options.showReason === true;
    const profileTarget = item.username || item.accountId;
    const profileHash = buildProfileHash(profileTarget);
    const primaryName = getPrimaryName(item);
    const secondaryName = getSecondaryName(item);
    const reasonText = showReason ? buildReasonText(item) : "";

    return `
      <article class="follow-suggestion-row" data-follow-suggestion-account-id="${escapeAttr(item.accountId)}" data-account-id="${escapeAttr(item.accountId)}">
        <a class="follow-suggestion-user user-info" href="${escapeAttr(profileHash)}" data-account-id="${escapeAttr(item.accountId)}" data-profile-preview-id="${escapeAttr(item.accountId)}">
          <img src="${escapeAttr(getAvatarUrl(item))}" class="avatar" alt="${escapeAttr(primaryName)}">
          <div class="name-box">
            <span class="fullname">${escapeHtml(primaryName)}</span>
            ${
              secondaryName
                ? `<span class="username-subtext">${escapeHtml(secondaryName)}</span>`
                : ""
            }
            ${
              reasonText
                ? `<span class="follow-suggestion-reason">${escapeHtml(reasonText)}</span>`
                : ""
            }
          </div>
        </a>
        <div class="action-box">
          <button type="button" class="follow-btn" data-follow-account-id="${escapeAttr(item.accountId)}"></button>
        </div>
      </article>
    `;
  }

  function renderCards(items, options = {}) {
    return items.map((item) => renderCard(item, options)).join("");
  }

  function renderSkeletonList(count) {
    const safeCount = Math.max(1, normalizePositiveInt(count, 4));
    return Array.from({ length: safeCount })
      .map(
        () => `
          <div class="follow-suggestion-skeleton-item">
            <div class="follow-suggestion-skeleton-user">
              <div class="follow-suggestion-skeleton-avatar skeleton"></div>
              <div class="follow-suggestion-skeleton-body">
                <div class="follow-suggestion-skeleton-line skeleton"></div>
                <div class="follow-suggestion-skeleton-line skeleton short"></div>
                <div class="follow-suggestion-skeleton-line skeleton medium"></div>
              </div>
            </div>
            <div class="follow-suggestion-skeleton-btn skeleton"></div>
          </div>
        `,
      )
      .join("");
  }

  function renderState(iconName, title, description, actionHtml = "") {
    return `
      <div class="follow-suggestions-state">
        <div class="follow-suggestions-state-icon">
          <i data-lucide="${escapeAttr(iconName)}"></i>
        </div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${actionHtml}
      </div>
    `;
  }

  function renderHomeRailShell(contentHtml, options = {}) {
    const loadingHead = options.loadingHead === true;
    const headHtml = loadingHead
      ? `
        <div class="follow-suggestions-panel-head follow-suggestions-panel-head-skeleton" aria-hidden="true">
          <div class="follow-suggestions-panel-title-skeleton skeleton"></div>
          <div class="follow-suggestions-panel-action-skeleton skeleton"></div>
        </div>
      `
      : `
        <div class="follow-suggestions-panel-head">
          <h2 class="follow-suggestions-panel-title" data-i18n="follow.suggestions.home.title">${escapeHtml(
            sugT("follow.suggestions.home.title", {}, "Suggested for you"),
          )}</h2>
          <a class="follow-suggestions-view-more" href="${escapeAttr(
            buildSuggestionsHash(),
          )}">
            <span data-i18n="follow.suggestions.actions.viewMore">${escapeHtml(
              sugT("follow.suggestions.actions.viewMore", {}, "View More"),
            )}</span>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </a>
        </div>
      `;

    return `
      <section class="follow-suggestions-panel">
        ${headHtml}
        <div class="follow-suggestions-panel-body">
          ${contentHtml}
        </div>
      </section>
    `;
  }

  function renderHomeLoading() {
    return renderHomeRailShell(
      `<div class="follow-suggestions-list follow-suggestions-list-skeleton">${renderSkeletonList(
        getHomePageSize(),
      )}</div>`,
      { loadingHead: true },
    );
  }

  function renderHomeError() {
    return renderHomeRailShell(
      renderState(
        "refresh-cw",
        sugT("follow.suggestions.error.title", {}, "Couldn't load suggestions"),
        sugT(
          "follow.suggestions.error.description",
          {},
          "Please try again in a moment",
        ),
        `<button type="button" class="follow-suggestions-inline-btn" onclick="window.FollowSuggestionsModule.retryHomeRail()">${escapeHtml(
          sugT("common.buttons.retry", {}, "Retry"),
        )}</button>`,
      ),
    );
  }

  function renderHomeEmpty() {
    return renderHomeRailShell(
      renderState(
        "users-round",
        sugT("follow.suggestions.empty.title", {}, "No suggestions right now"),
        sugT(
          "follow.suggestions.empty.description",
          {},
          "We will show more people here when your network grows",
        ),
      ),
    );
  }

  function renderHomeSuccess(paging) {
    return renderHomeRailShell(
      `<div class="follow-suggestions-list">${renderCards(paging.items)}</div>`,
    );
  }

  function renderPageLoading() {
    return `
      <div class="follow-suggestions-page-body">
        <div class="follow-suggestions-list follow-suggestions-list-page">
          ${renderSkeletonList(getPageSize())}
        </div>
      </div>
    `;
  }

  function renderPageError() {
    return renderState(
      "refresh-cw",
      sugT("follow.suggestions.error.title", {}, "Couldn't load suggestions"),
      sugT(
        "follow.suggestions.error.description",
        {},
        "Please try again in a moment",
      ),
      `<button type="button" class="follow-suggestions-inline-btn" onclick="window.FollowSuggestionsModule.retryPage()">${escapeHtml(
        sugT("common.buttons.retry", {}, "Retry"),
      )}</button>`,
    );
  }

  function renderPageEmpty() {
    return renderState(
      "users-round",
      sugT("follow.suggestions.empty.title", {}, "No suggestions right now"),
      sugT(
        "follow.suggestions.empty.description",
        {},
        "We will show more people here when your network grows",
      ),
    );
  }

  function renderPageFooter() {
    if (pageState.isLoading && pageState.items.length > 0) {
      return `
        <div class="follow-suggestions-scroll-state" aria-live="polite">
          <div class="spinner spinner-small" aria-hidden="true"></div>
        </div>
      `;
    }

    if (pageState.loadFailed && pageState.items.length > 0) {
      return `
        <div class="follow-suggestions-scroll-state follow-suggestions-scroll-state-error">
          <button type="button" class="follow-suggestions-inline-btn" onclick="window.FollowSuggestionsModule.retryPage()">${escapeHtml(
            sugT("common.buttons.retry", {}, "Retry"),
          )}</button>
        </div>
      `;
    }

    return "";
  }

  function renderPageContent() {
    if (!pageState.items.length) {
      if (pageState.isLoading) return renderPageLoading();
      if (pageState.loadFailed) return renderPageError();
      return renderPageEmpty();
    }

    return `
      <div class="follow-suggestions-page-body">
        <div class="follow-suggestions-list follow-suggestions-list-page">
          ${renderCards(pageState.items, { showReason: true })}
        </div>
        ${renderPageFooter()}
      </div>
    `;
  }

  function mergeSuggestionItems(existingItems, incomingItems) {
    const merged = new Map();
    [...(existingItems || []), ...(incomingItems || [])].forEach((item) => {
      const normalizedId = normalizeAccountId(item.accountId);
      if (!normalizedId) return;
      merged.set(normalizedId, item);
    });
    return Array.from(merged.values());
  }

  function serializePageState() {
    return {
      page: pageState.page,
      totalPages: pageState.totalPages,
      totalItems: pageState.totalItems,
      hasNextPage: pageState.hasNextPage,
      loadFailed: pageState.loadFailed,
      items: pageState.items,
    };
  }

  function patchRelationState(accountId, relation) {
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId || !relation) return;

    pageState.items = pageState.items.map((item) => {
      if (normalizeAccountId(item.accountId) !== normalizedAccountId) {
        return item;
      }

      return {
        ...item,
        isFollowing: relation.isFollowing === true,
        isFollowRequested: relation.isRequested === true,
      };
    });
  }

  function hydrateFollowButtons(root, items) {
    if (!root || !global.FollowModule?.applyStandardFollowButton) return;

    const itemMap = new Map(
      (Array.isArray(items) ? items : []).map((item) => [
        normalizeAccountId(item.accountId),
        item,
      ]),
    );

    root
      .querySelectorAll("[data-follow-suggestion-account-id] .follow-btn")
      .forEach((button) => {
        const card = button.closest("[data-follow-suggestion-account-id]");
        const accountId =
          card?.getAttribute("data-follow-suggestion-account-id") || "";
        const normalizedAccountId = normalizeAccountId(accountId);
        if (!normalizedAccountId) return;

        const item = itemMap.get(normalizedAccountId);
        if (!item) return;

        global.FollowModule.applyStandardFollowButton(
          button,
          resolveRelation(item),
          item.accountId,
        );
      });
  }

  function postRender(root, items = []) {
    if (!root) return;
    hydrateFollowButtons(root, items);
    if (global.I18n?.translateDom) {
      global.I18n.translateDom(root);
    }
    if (global.lucide?.createIcons) {
      global.lucide.createIcons();
    }
  }

  async function fetchSuggestions(surface, page, pageSize) {
    const response = await global.API.Follows.getSuggestions({
      page,
      pageSize,
      surface,
    });

    if (!response?.ok) {
      throw new Error("follow suggestions load failed");
    }

    const payload = await response.json().catch(() => null);
    return normalizePagingResponse(payload, page, pageSize);
  }

  function getHomeContainer() {
    return global.document.getElementById("home-suggestions-shell");
  }

  function getPageContainer() {
    return global.document.getElementById("follow-suggestions-page-content");
  }

  function getScrollContainer() {
    return global.document.querySelector(".main-content");
  }

  function pruneSuggestionRouteCaches(activeHash = global.location.hash || "") {
    if (!global.PageCache?.getKeys || !global.PageCache?.clear) return;

    const activeKey = (activeHash || "").toString().trim();
    global.PageCache.getKeys().forEach((cacheKey) => {
      if (!cacheKey || cacheKey === activeKey) return;
      if (!isSuggestionsPath(cacheKey)) return;
      global.PageCache.clear(cacheKey);
    });
  }

  function resetPageState() {
    pageState.page = 0;
    pageState.totalPages = 1;
    pageState.totalItems = 0;
    pageState.hasNextPage = true;
    pageState.isLoading = false;
    pageState.loadFailed = false;
    pageState.items = [];
  }

  function registerPageDataHooks() {
    global.getPageData = () => ({
      followSuggestions: serializePageState(),
    });

    global.setPageData = (data) => {
      const snapshot = data?.followSuggestions;
      if (!snapshot || typeof snapshot !== "object") return;

      pageState.page = normalizePositiveInt(snapshot.page, 0);
      pageState.totalPages = normalizePositiveInt(snapshot.totalPages, 1);
      pageState.totalItems = Math.max(0, Number(snapshot.totalItems) || 0);
      pageState.hasNextPage = snapshot.hasNextPage === true;
      pageState.loadFailed = snapshot.loadFailed === true;
      pageState.items = Array.isArray(snapshot.items)
        ? snapshot.items
            .map(normalizeSuggestionItem)
            .filter((item) => item.accountId)
        : [];
    };
  }

  function renderPageState() {
    const container = getPageContainer();
    if (!container) return;
    container.innerHTML = renderPageContent();
    postRender(container, pageState.items);
  }

  async function loadNextPage(options = {}) {
    const reset = options.reset === true;
    const container = getPageContainer();
    if (!container) return;
    if (pageState.isLoading) return;
    if (!reset && !pageState.hasNextPage) return;

    const requestToken = ++pageRequestToken;
    const nextPage = reset ? 1 : pageState.page + 1;
    const pageSize = getPageSize();

    pageState.isLoading = true;
    pageState.loadFailed = false;
    if (reset) {
      pageState.items = [];
      pageState.page = 0;
      pageState.totalPages = 1;
      pageState.totalItems = 0;
      pageState.hasNextPage = true;
    }
    renderPageState();

    try {
      const paging = await fetchSuggestions(PAGE_SURFACE, nextPage, pageSize);
      if (requestToken !== pageRequestToken || !isSuggestionsPath()) return;

      pageState.items = reset
        ? paging.items
        : mergeSuggestionItems(pageState.items, paging.items);
      pageState.page = paging.page;
      pageState.totalPages = Math.max(1, paging.totalPages);
      pageState.totalItems = paging.totalItems;
      pageState.hasNextPage =
        paging.hasNextPage && pageState.page < getMaxPages();
      pageState.loadFailed = false;
    } catch (error) {
      if (requestToken !== pageRequestToken) return;
      pageState.loadFailed = true;
      console.error("Failed to load follow suggestions page:", error);
    } finally {
      if (requestToken !== pageRequestToken) return;
      pageState.isLoading = false;
      renderPageState();
      global.requestAnimationFrame(() => {
        maybeLoadNextPage();
      });
    }
  }

  function maybeLoadNextPage() {
    if (!isSuggestionsPath()) return;
    if (pageState.isLoading || !pageState.hasNextPage || pageState.loadFailed)
      return;

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) return;

    const remainingDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;

    if (remainingDistance <= PAGE_SCROLL_THRESHOLD_PX) {
      loadNextPage();
    }
  }

  function bindScrollListener() {
    if (scrollListenerBound) return;

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) return;

    scrollListenerBound = true;
    scrollContainer.addEventListener(
      "scroll",
      () => {
        maybeLoadNextPage();
      },
      { passive: true },
    );
  }

  async function initHomeRail() {
    const container = getHomeContainer();
    if (!container) return;

    const requestToken = ++homeRequestToken;
    container.innerHTML = renderHomeLoading();
    postRender(container);

    try {
      const paging = await fetchSuggestions(HOME_SURFACE, 1, getHomePageSize());
      if (requestToken !== homeRequestToken) return;

      container.innerHTML =
        paging.items.length > 0 ? renderHomeSuccess(paging) : renderHomeEmpty();
      postRender(container, paging.items);
    } catch (error) {
      if (requestToken !== homeRequestToken) return;
      console.error("Failed to load home follow suggestions:", error);
      container.innerHTML = renderHomeError();
      postRender(container);
    }
  }

  async function initPage() {
    const container = getPageContainer();
    if (!container) return;

    registerPageDataHooks();
    pruneSuggestionRouteCaches(buildSuggestionsHash());
    bindScrollListener();
    resetPageState();
    if (global.AppFooter?.mountMainContent) {
      await global.AppFooter.mountMainContent();
    }
    await loadNextPage({ reset: true });
  }

  function retryHomeRail() {
    initHomeRail();
  }

  function retryPage() {
    if (!pageState.items.length) {
      loadNextPage({ reset: true });
      return;
    }

    pageState.loadFailed = false;
    loadNextPage();
  }

  function goToSuggestions() {
    if (RouteHelper?.goTo) {
      RouteHelper.goTo(SUGGESTIONS_PATH);
      return;
    }
    global.location.hash = buildSuggestionsHash();
  }

  function goBackToHome() {
    const homePath = RouteHelper?.PATHS?.ROOT || "/";
    if (RouteHelper?.goTo) {
      RouteHelper.goTo(homePath);
      return;
    }
    global.location.hash = `#${homePath}`;
  }

  global.FollowSuggestionsModule = {
    initHomeRail,
    initPage,
    retryHomeRail,
    retryPage,
    buildSuggestionsHash,
    goToSuggestions,
    goBackToHome,
    patchRelationState,
    pruneSuggestionRouteCaches,
  };
})(window);
