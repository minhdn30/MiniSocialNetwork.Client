(function () {
  "use strict";

  /* ─── author queue for story-list viewer ─── */
  const DEFAULT_FEED_INITIAL_LOAD_COUNT = 6;
  const DEFAULT_FEED_LOAD_MORE_PAGE_SIZE = 30;
  const DEFAULT_FEED_API_PAGE_SIZE = 30;

  function parsePositiveInt(value, fallbackValue) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallbackValue;
    return parsed > 0 ? Math.trunc(parsed) : fallbackValue;
  }

  const FEED_INITIAL_LOAD_COUNT = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_INITIAL_LOAD_COUNT,
    DEFAULT_FEED_INITIAL_LOAD_COUNT,
  );
  const FEED_LOAD_MORE_PAGE_SIZE = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_LOAD_MORE_PAGE_SIZE,
    DEFAULT_FEED_LOAD_MORE_PAGE_SIZE,
  );
  const FEED_API_PAGE_SIZE = parsePositiveInt(
    window.APP_CONFIG?.STORY_FEED_API_PAGE_SIZE,
    DEFAULT_FEED_API_PAGE_SIZE,
  );

  let feedAuthorItems = [];
  let feedRenderItems = [];
  let feedLoadMorePage = 0;
  let feedHasMore = true;
  let feedIsLoadingMore = false;
  let feedNavActionInFlight = false;
  let feedResizeBound = false;
  let feedWindowStart = 0;
  let feedTransitionCleanupTimer = null;

  function normalizeAuthorId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function parseCount(value, fallbackValue = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  function resolveHasMoreFromPayload(payload, page, pageSize, fallbackCount) {
    const totalPages = Number(payload?.totalPages ?? payload?.TotalPages);
    if (Number.isFinite(totalPages) && totalPages > 0) {
      return page < totalPages;
    }

    const totalItems = Number(payload?.totalItems ?? payload?.TotalItems);
    if (Number.isFinite(totalItems) && totalItems >= 0) {
      return page * pageSize < totalItems;
    }

    return fallbackCount >= pageSize;
  }

  function normalizeFeedItem(raw) {
    const defaultAvatar =
      window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    const activeStoryCount = parseCount(
      raw?.activeStoryCount ?? raw?.ActiveStoryCount,
      0,
    );

    return {
      accountId: normalizeAuthorId(raw?.accountId || raw?.AccountId || ""),
      avatarUrl: raw?.avatarUrl || raw?.AvatarUrl || defaultAvatar,
      username:
        raw?.username || raw?.Username || raw?.fullName || raw?.FullName || "User",
      fullName: raw?.fullName || raw?.FullName || "",
      isCurrentUser: !!(raw?.isCurrentUser || raw?.IsCurrentUser),
      storyRingState: raw?.storyRingState ?? raw?.StoryRingState ?? 0,
      activeStoryCount,
    };
  }

  function buildFeedDisplayItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((it) => normalizeFeedItem(it))
      .filter((it) => {
        if (!it.accountId) return false;
        // Keep current user for "Your Story" placeholder.
        if (it.isCurrentUser) return true;
        return it.activeStoryCount > 0;
      });
  }

  function getCurrentViewerStoryId() {
    return normalizeAuthorId(localStorage.getItem("accountId"));
  }

  function buildOwnStoryPlaceholder(accountId) {
    return {
      accountId,
      avatarUrl:
        localStorage.getItem("avatarUrl") ||
        window.APP_CONFIG?.DEFAULT_AVATAR ||
        "assets/images/default-avatar.jpg",
      username: localStorage.getItem("username") || "You",
      fullName: "",
      isCurrentUser: true,
      storyRingState: 0,
      activeStoryCount: 0,
    };
  }

  function normalizeFeedRenderItems(items = feedRenderItems) {
    const seenIds = new Set();
    const normalized = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item?.accountId) return;
      const id = normalizeAuthorId(item.accountId);
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      normalized.push({
        ...item,
        accountId: id,
      });
    });
    return normalized;
  }

  function applyFeedRenderNormalization() {
    feedRenderItems = normalizeFeedRenderItems(feedRenderItems);
    return feedRenderItems;
  }

  function getVisibleWindowCount() {
    return Math.max(1, FEED_INITIAL_LOAD_COUNT);
  }

  function getFeedNavStep() {
    // Guard invalid config: step should not exceed visible window size.
    const visibleCount = getVisibleWindowCount();
    return Math.max(1, Math.min(FEED_LOAD_MORE_PAGE_SIZE, visibleCount));
  }

  function clampFeedWindowStart() {
    const items = applyFeedRenderNormalization();
    const maxStart = Math.max(0, items.length - getVisibleWindowCount());
    feedWindowStart = Math.max(0, Math.min(feedWindowStart, maxStart));
    return { items, maxStart };
  }

  function getVisibleWindowItems() {
    const allItems = normalizeFeedRenderItems(feedRenderItems);
    const visibleCount = getVisibleWindowCount();
    const maxStart = Math.max(0, allItems.length - visibleCount);
    const normalizedStart = Math.max(0, Math.min(feedWindowStart, maxStart));
    const items = allItems.slice(normalizedStart, normalizedStart + visibleCount);
    return {
      allItems,
      normalizedStart,
      maxStart,
      items,
    };
  }

  /**
   * Build queue from raw items array.
   * Excludes "Your Story" placeholder (no stories).
   */
  function buildAuthorQueue(items) {
    return buildFeedDisplayItems(items)
      .filter((it) => {
        const hasStories = it.activeStoryCount > 0;
        // Skip "Your Story" placeholder that has no stories
        if (it.isCurrentUser && !hasStories) return false;
        return hasStories && !!it.accountId;
      })
      .map((it) => ({
        accountId: it.accountId,
        avatarUrl: it.avatarUrl,
        username: it.username,
        isCurrentUser: it.isCurrentUser,
        storyRingState: it.storyRingState,
      }));
  }

  function upsertStoryFeedAuthor(rawAuthor, options = {}) {
    const queueItems = buildAuthorQueue([rawAuthor]);
    const displayItems = buildFeedDisplayItems([rawAuthor]);
    const normalizedId = normalizeAuthorId(
      rawAuthor?.accountId || rawAuthor?.AccountId || "",
    );
    if (!normalizedId) return;

    feedAuthorItems = feedAuthorItems.filter((a) => a.accountId !== normalizedId);
    feedRenderItems = feedRenderItems.filter((a) => a.accountId !== normalizedId);

    if (displayItems.length > 0) {
      const displayItem = displayItems[0];
      if (options.prepend) {
        feedRenderItems.unshift(displayItem);
      } else {
        feedRenderItems.push(displayItem);
      }
    }

    if (!queueItems.length) return;

    const author = queueItems[0];
    if (options.prepend) {
      feedAuthorItems.unshift(author);
      return;
    }
    feedAuthorItems.push(author);
  }

  /* ─── helpers ─── */
  function resolveStoryRingClass(storyRingState) {
    const s = (storyRingState ?? "").toString().trim().toLowerCase();
    if (storyRingState === 2 || s === "2" || s === "unseen")
      return "story-ring-unseen";
    if (storyRingState === 1 || s === "1" || s === "seen")
      return "story-ring-seen";
    return "";
  }

  function normalizeStoryRingStateValue(nextState) {
    const normalized = (nextState ?? "").toString().trim().toLowerCase();
    if (nextState === 2 || normalized === "2" || normalized === "unseen") {
      return 2;
    }
    if (nextState === 1 || normalized === "1" || normalized === "seen") {
      return 1;
    }
    return 0;
  }

  function syncStoryFeedRingState(authorId, nextState) {
    const id = normalizeAuthorId(authorId);
    if (!id) return false;

    const ringState = normalizeStoryRingStateValue(nextState);
    let changed = false;

    const renderIndex = feedRenderItems.findIndex((item) => item.accountId === id);
    if (renderIndex >= 0 && feedRenderItems[renderIndex].storyRingState !== ringState) {
      feedRenderItems[renderIndex] = {
        ...feedRenderItems[renderIndex],
        storyRingState: ringState,
      };
      changed = true;
    }

    const queueIndex = feedAuthorItems.findIndex((item) => item.accountId === id);
    if (queueIndex >= 0 && feedAuthorItems[queueIndex].storyRingState !== ringState) {
      feedAuthorItems[queueIndex] = {
        ...feedAuthorItems[queueIndex],
        storyRingState: ringState,
      };
      changed = true;
    }

    return changed;
  }

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ─── skeleton ─── */
  function renderSkeletons(container, count) {
    let html = "";
    for (let i = 0; i < count; i++) {
      html += `
        <div class="story story-skeleton">
          <div class="story-avatar-skeleton skeleton"></div>
          <div class="story-name-skeleton skeleton"></div>
        </div>`;
    }
    container.innerHTML = html;
  }

  /* ─── render ─── */
  function renderStoryItems(container, items) {
    if (!items || items.length === 0) {
      container.innerHTML = "";
      return;
    }

    const defaultAvatar =
      window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    let html = "";

    items.forEach((item) => {
      const avatarUrl = escapeAttr(item.avatarUrl || defaultAvatar);
      const isOwn = !!item.isCurrentUser;
      const hasStories = item.activeStoryCount > 0;

      /* ── Ring logic ── */
      let ringClass = "";
      if (isOwn) {
        ringClass = hasStories ? "story-ring-unseen" : "story-ring-none";
      } else {
        ringClass = resolveStoryRingClass(item.storyRingState);
      }

      const displayName = isOwn
        ? "You"
        : escapeAttr(item.username || item.fullName || "User");
      const dataAuthorAttr =
        ringClass && ringClass !== "story-ring-none"
          ? ` data-story-author-id="${escapeAttr(item.accountId)}"`
          : "";

      /* ── Button/Overlay logic cho Your story ── */
      let addBtnHtml = "";
      if (isOwn && !hasStories) {
        addBtnHtml = `
          <div class="story-add-overlay">
            <div class="story-add-center-btn">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 6V18M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>`;
      }

      html += `
        <div class="story ${isOwn ? "story-own" : ""}" data-account-id="${escapeAttr(item.accountId)}" data-has-stories="${hasStories}">
          <div class="story-avatar-wrapper">
            <a class="post-avatar-ring ${ringClass}"${dataAuthorAttr} href="javascript:void(0)">
              <img class="post-avatar" src="${avatarUrl}" alt="" loading="lazy">
            </a>
            ${addBtnHtml}
          </div>
          <span class="story-name">${displayName}</span>
        </div>`;
    });

    container.innerHTML = html;

    /* ── Event Listeners cho Your Story ── */
    container.querySelectorAll(".story-own").forEach((storyEl) => {
      const hasStories = storyEl.getAttribute("data-has-stories") === "true";

      storyEl.addEventListener("click", (e) => {
        if (hasStories) {
          // Nếu có story, click vào wrapper hoặc cả item sẽ mở story viewer
          // Mặc định post-avatar-ring có attribute data-story-author-id sẽ được story-viewer.js xử lý
          // Nhưng ta trigger thêm ở đây để đảm bảo click vào khoảng trống quanh avatar cũng chạy
          const ring = storyEl.querySelector(".post-avatar-ring");
          if (ring) ring.click();
        } else {
          // Nếu không có story, mở modal tạo mới
          if (window.openCreateStoryModal) {
            window.openCreateStoryModal();
          }
        }
      });
    });
  }

  function getStoryFeedElements() {
    const container = document.getElementById("story-feed");
    const shell = document.getElementById("story-feed-shell");
    if (!container || !shell) return { container: null, shell: null, prevBtn: null, nextBtn: null };
    return {
      container,
      shell,
      prevBtn: document.getElementById("storyFeedPrevBtn"),
      nextBtn: document.getElementById("storyFeedNextBtn"),
    };
  }

  function getStoryFeedScrollStep(container) {
    const configStep = parseCount(window.APP_CONFIG?.STORY_FEED_NAV_SCROLL_STEP_PX, 0);
    if (configStep > 0) return configStep;
    return Math.max(220, Math.round((container?.clientWidth || 0) * 0.82));
  }

  function getStoryTransitionShiftPx(container) {
    if (!container) return 0;
    const storyEls = container.querySelectorAll(".story");
    if (!storyEls.length) {
      return Math.max(160, Math.round((container.clientWidth || 0) * 0.72));
    }

    let unitStep = 0;
    if (storyEls.length > 1) {
      unitStep = storyEls[1].offsetLeft - storyEls[0].offsetLeft;
    }
    if (!unitStep || unitStep <= 0) {
      const firstRect = storyEls[0].getBoundingClientRect();
      const style = window.getComputedStyle(container);
      const rawGap = parseFloat(style.gap || style.columnGap || "16");
      const gap = Number.isFinite(rawGap) ? rawGap : 16;
      unitStep = Math.round(firstRect.width + gap);
    }

    const desiredShift = Math.max(unitStep, unitStep * getFeedNavStep());
    const maxShift = Math.max(unitStep, (container.clientWidth || desiredShift) - 24);
    return Math.min(desiredShift, maxShift);
  }

  function clearStoryFeedTransition(shell, container) {
    if (feedTransitionCleanupTimer) {
      clearTimeout(feedTransitionCleanupTimer);
      feedTransitionCleanupTimer = null;
    }
    if (shell) {
      const activeOverlay = shell.querySelector(".stories-transition-overlay");
      if (activeOverlay) activeOverlay.remove();
    }
    if (container) {
      container.classList.remove("stories-transitioning");
    }
  }

  function runStoryFeedTransition(container, direction, previousHtml = "") {
    if (!container) return;
    const { shell } = getStoryFeedElements();
    clearStoryFeedTransition(shell, container);

    if (direction !== "next" && direction !== "prev") return;
    if (!shell || !previousHtml || !previousHtml.trim()) return;

    const shiftPx = getStoryTransitionShiftPx(container);
    if (!shiftPx || shiftPx <= 0) return;

    const overlay = document.createElement("div");
    overlay.className = "stories-transition-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const oldTrack = document.createElement("div");
    oldTrack.className = "stories-transition-track stories-transition-track-old";
    oldTrack.innerHTML = previousHtml;

    const newTrack = document.createElement("div");
    newTrack.className = "stories-transition-track stories-transition-track-new";
    newTrack.innerHTML = container.innerHTML;

    const incomingFrom = direction === "next" ? shiftPx : -shiftPx;
    const outgoingTo = direction === "next" ? -shiftPx : shiftPx;

    oldTrack.style.transform = "translate3d(0,0,0)";
    oldTrack.style.opacity = "1";
    newTrack.style.transform = `translate3d(${incomingFrom}px,0,0)`;
    newTrack.style.opacity = "1";

    overlay.appendChild(oldTrack);
    overlay.appendChild(newTrack);
    shell.appendChild(overlay);
    container.classList.add("stories-transitioning");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        oldTrack.style.transform = `translate3d(${outgoingTo}px,0,0)`;
        oldTrack.style.opacity = "0.82";
        newTrack.style.transform = "translate3d(0,0,0)";
      });
    });

    const finish = () => {
      clearStoryFeedTransition(shell, container);
    };

    newTrack.addEventListener("transitionend", finish, { once: true });
    feedTransitionCleanupTimer = setTimeout(finish, 320);
  }

  function renderCurrentStoryWindow(direction = "") {
    const { container } = getStoryFeedElements();
    if (!container) return;
    const previousHtml =
      direction === "next" || direction === "prev" ? container.innerHTML : "";

    clampFeedWindowStart();
    const { items } = getVisibleWindowItems();
    renderStoryItems(container, items);
    runStoryFeedTransition(container, direction, previousHtml);
    updateStoryFeedNavButtons();
  }

  async function ensureStoryWindowData(requiredItemsCount) {
    const targetCount = Math.max(0, requiredItemsCount);
    let guard = 0;
    while (feedHasMore) {
      const beforeCount = normalizeFeedRenderItems(feedRenderItems).length;
      if (beforeCount >= targetCount) break;

      const newAuthors = await loadMoreStoryFeedAuthors();
      const afterCount = normalizeFeedRenderItems(feedRenderItems).length;
      guard += 1;

      if ((newAuthors?.length || 0) === 0 && afterCount <= beforeCount) {
        break;
      }
      if (guard >= 20) {
        break;
      }
    }
  }

  function updateStoryFeedNavButtons() {
    const { container, shell, prevBtn, nextBtn } = getStoryFeedElements();
    if (!container || !shell || !prevBtn || !nextBtn) return;

    const { allItems, normalizedStart } = getVisibleWindowItems();
    const visibleCount = getVisibleWindowCount();
    const hasPrev = normalizedStart > 0;
    const hasLoadedNext = normalizedStart + visibleCount < allItems.length;
    const hasNext = hasLoadedNext || feedHasMore;

    prevBtn.classList.toggle("is-hidden", !hasPrev);
    nextBtn.classList.toggle("is-hidden", !hasNext);
    nextBtn.classList.toggle("is-loading", feedNavActionInFlight);
    shell.classList.toggle("stories-shell-scrollable", hasPrev || hasNext);
  }

  function bindStoryFeedNavigation() {
    const { container, prevBtn, nextBtn } = getStoryFeedElements();
    if (!container || !prevBtn || !nextBtn) return;

    prevBtn.onclick = () => {
      if (feedNavActionInFlight) return;
      const step = getFeedNavStep();
      if (feedWindowStart <= 0) return;
      feedWindowStart = Math.max(0, feedWindowStart - step);
      renderCurrentStoryWindow("prev");
    };

    nextBtn.onclick = async () => {
      if (feedNavActionInFlight) return;
      const step = getFeedNavStep();
      const visibleCount = getVisibleWindowCount();
      const targetStart = feedWindowStart + step;

      feedNavActionInFlight = true;
      updateStoryFeedNavButtons();
      try {
        await ensureStoryWindowData(targetStart + visibleCount);
      } finally {
        feedNavActionInFlight = false;
      }

      const { items } = clampFeedWindowStart();
      const maxStart = Math.max(0, items.length - visibleCount);
      const nextStart = Math.min(targetStart, maxStart);
      if (nextStart === feedWindowStart) {
        updateStoryFeedNavButtons();
        return;
      }

      feedWindowStart = nextStart;
      renderCurrentStoryWindow("next");
    };

    if (!feedResizeBound) {
      window.addEventListener("resize", () => renderCurrentStoryWindow(""));
      feedResizeBound = true;
    }

    updateStoryFeedNavButtons();
  }

  /* ─── sync own story UI (no re-fetch) ─── */

  /**
   * Update the ".story-own" element in the feed to reflect current story state.
   * @param {boolean} hasStories – whether the current user now has active stories.
   */
  function syncOwnStoryUI(hasStories) {
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    if (!myId) return;

    const ownIndex = feedRenderItems.findIndex((item) => item.accountId === myId);
    if (ownIndex >= 0) {
      feedRenderItems[ownIndex] = {
        ...feedRenderItems[ownIndex],
        isCurrentUser: true,
        activeStoryCount: hasStories ? 1 : 0,
        storyRingState: hasStories ? 2 : 0,
      };
    }

    const container = document.getElementById("story-feed");
    if (!container) return;

    const storyEl = container.querySelector(".story-own");
    if (!storyEl) return;

    // Update data attribute
    storyEl.setAttribute("data-has-stories", String(hasStories));

    const wrapper = storyEl.querySelector(".story-avatar-wrapper");
    if (!wrapper) return;

    const ring = wrapper.querySelector("a");

    if (hasStories) {
      // ── Has stories: show ring-unseen, add author attr, remove add-overlay ──
      if (ring) {
        ring.classList.remove("story-ring-none");
        ring.classList.add("post-avatar-ring", "story-ring-unseen");
        ring.setAttribute("data-story-author-id", myId);
      }
      const overlay = wrapper.querySelector(".story-add-overlay");
      if (overlay) overlay.remove();

      // Remove dimming on avatar
      const avatar = wrapper.querySelector(".post-avatar");
      if (avatar) avatar.style.filter = "";
    } else {
      // ── No stories: show ring-none, remove author attr, add back add-overlay ──
      if (ring) {
        ring.classList.remove("story-ring-unseen", "story-ring-seen");
        ring.classList.add("post-avatar-ring", "story-ring-none");
        ring.removeAttribute("data-story-author-id");
      }
      // Re-add overlay if missing
      if (!wrapper.querySelector(".story-add-overlay")) {
        const overlayHtml = `
          <div class="story-add-overlay">
            <div class="story-add-center-btn">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 6V18M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>`;
        wrapper.insertAdjacentHTML("beforeend", overlayHtml);
      }
    }

    // ── Re-bind click handler ──
    // Clone to remove old listeners, then re-attach
    const clone = storyEl.cloneNode(true);
    storyEl.parentNode.replaceChild(clone, storyEl);

    clone.addEventListener("click", (e) => {
      const nowHasStories = clone.getAttribute("data-has-stories") === "true";
      if (nowHasStories) {
        const r = clone.querySelector(".post-avatar-ring");
        if (r) r.click();
      } else {
        if (window.openCreateStoryModal) {
          window.openCreateStoryModal();
        }
      }
    });
  }

  /* ─── event listeners for real-time sync ─── */
  window.addEventListener("story:created", (event) => {
    const detail = event?.detail || {};
    syncOwnStoryUI(true);

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    if (!myId) return;

    upsertStoryFeedAuthor(
      {
        accountId: detail.accountId || detail.AccountId || myId,
        avatarUrl:
          detail.avatarUrl || detail.AvatarUrl || localStorage.getItem("avatarUrl") || "",
        username:
          detail.username ||
          detail.Username ||
          localStorage.getItem("username") ||
          "You",
        isCurrentUser: true,
        activeStoryCount: Math.max(
          1,
          parseCount(detail.activeStoryCount ?? detail.ActiveStoryCount, 1),
        ),
        storyRingState: detail.storyRingState ?? detail.StoryRingState ?? 2,
      },
      { prepend: true },
    );
    updateStoryFeedNavButtons();
  });

  window.addEventListener("story:deleted", (e) => {
    const detail = e.detail || {};
    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    const authorId = normalizeAuthorId(detail.authorId || detail.AuthorId);
    const remainingRaw = detail.remainingCount ?? detail.RemainingCount;
    const hasRemainingInfo = remainingRaw !== undefined && remainingRaw !== null;
    const remaining = parseCount(remainingRaw, 0);

    if (authorId && authorId !== myId) {
      if (hasRemainingInfo && remaining <= 0) {
        removeStoryFeedAuthor(authorId);
        renderCurrentStoryWindow("");
        return;
      }
      updateStoryFeedNavButtons();
      return;
    }

    syncOwnStoryUI(remaining > 0);

    if (remaining > 0) {
      upsertStoryFeedAuthor(
        {
          accountId: myId,
          avatarUrl: localStorage.getItem("avatarUrl") || "",
          username: localStorage.getItem("username") || "You",
          isCurrentUser: true,
          activeStoryCount: remaining,
          storyRingState: 2,
        },
        { prepend: true },
      );
      updateStoryFeedNavButtons();
      return;
    }

    if (hasRemainingInfo || authorId === myId) {
      removeStoryFeedAuthor(authorId || myId);
    }
    updateStoryFeedNavButtons();
  });

  window.addEventListener("story:unavailable", (e) => {
    const detail = e.detail || {};
    const authorId = normalizeAuthorId(detail.authorId || detail.AuthorId);
    if (!authorId) return;

    const container = document.getElementById("story-feed");
    if (!container) return;

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    removeStoryFeedAuthor(authorId);

    if (authorId === myId) {
      // Own story became unavailable → sync to "no stories" state
      syncOwnStoryUI(false);
      updateStoryFeedNavButtons();
      return;
    }

    // Other user's story became unavailable → remove from feed
    const storyEl = container.querySelector(
      `.story[data-account-id="${CSS.escape(authorId)}"]`,
    );
    if (!storyEl) return;

    storyEl.style.transition =
      "opacity 0.3s ease, transform 0.3s ease, max-width 0.3s ease";
    storyEl.style.opacity = "0";
    storyEl.style.transform = "scale(0.8)";
    storyEl.style.maxWidth = "0";
    storyEl.style.overflow = "hidden";

    storyEl.addEventListener("transitionend", () => storyEl.remove(), {
      once: true,
    });
    // Fallback removal in case transitionend never fires
    setTimeout(() => {
      if (storyEl.parentNode) storyEl.remove();
      updateStoryFeedNavButtons();
    }, 400);
  });

  /* ─── init ─── */
  async function initStoryFeed() {
    const container = document.getElementById("story-feed");
    if (!container) return;

    feedNavActionInFlight = false;

    // Hiển thị skeleton ngay lập tức
    renderSkeletons(container, 7);

    try {
      const res = await API.Stories.getViewableAuthors(1, FEED_API_PAGE_SIZE);
      if (!res.ok) throw new Error("Failed to load story feed");

      const data = await res.json();
      const rawItems = data.items || data.Items || [];
      let items = Array.isArray(rawItems) ? rawItems.slice() : [];

      // Luôn đảm bảo "Your Story" ở đầu danh sách
      const myId = normalizeAuthorId(localStorage.getItem("accountId"));
      const hasCurrentUser = items.some(
        (it) => normalizeAuthorId(it.accountId || it.AccountId) === myId,
      );

      if (!hasCurrentUser && myId) {
        // User hiện tại không có story sống → tự tạo item "Your Story"
        const myAvatar = localStorage.getItem("avatarUrl") || "";
        items = [
          {
            accountId: myId,
            username: "You",
            fullName: "",
            avatarUrl: myAvatar,
            activeStoryCount: 0,
            unseenCount: 0,
            storyRingState: 0,
            isCurrentUser: true,
          },
          ...items,
        ];
      }

      feedRenderItems = buildFeedDisplayItems(items);
      feedWindowStart = 0;

      // Build author queue for story-list viewer
      feedAuthorItems = buildAuthorQueue(items);
      feedLoadMorePage = 1;
      feedHasMore = resolveHasMoreFromPayload(
        data,
        1,
        FEED_API_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );
      bindStoryFeedNavigation();
      renderCurrentStoryWindow("");
    } catch (err) {
      console.error("Story feed load failed:", err);
      container.innerHTML = "";
      updateStoryFeedNavButtons();
    }
  }

  /* ─── queue API for story-viewer ─── */

  /** Get current author queue + pagination state */
  function getStoryFeedQueue() {
    return {
      authors: feedAuthorItems.slice(), // shallow copy
      hasMore: feedHasMore,
    };
  }

  /** Fetch next page of authors and append to queue. Returns new items. */
  async function loadMoreStoryFeedAuthors() {
    if (feedIsLoadingMore || !feedHasMore) return [];
    feedIsLoadingMore = true;
    try {
      const nextPage = feedLoadMorePage + 1;
      const res = await API.Stories.getViewableAuthors(
        nextPage,
        FEED_API_PAGE_SIZE,
      );
      if (!res.ok) {
        feedHasMore = false;
        return [];
      }
      const data = await res.json();
      const rawItems = data.items || data.Items || [];
      feedHasMore = resolveHasMoreFromPayload(
        data,
        nextPage,
        FEED_API_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );

      const newAuthors = buildAuthorQueue(rawItems);
      const newRenderItems = buildFeedDisplayItems(rawItems).filter(
        (item) => item.activeStoryCount > 0 || item.isCurrentUser,
      );
      const existingIds = new Set(feedAuthorItems.map((a) => a.accountId));
      const uniqueAuthors = newAuthors.filter((author) => {
        if (!author?.accountId || existingIds.has(author.accountId)) {
          return false;
        }
        existingIds.add(author.accountId);
        return true;
      });

      feedAuthorItems = feedAuthorItems.concat(uniqueAuthors);
      newRenderItems.forEach((item) => {
        if (!item?.accountId) return;
        const existingIndex = feedRenderItems.findIndex(
          (existing) => existing.accountId === item.accountId,
        );
        if (existingIndex < 0) {
          feedRenderItems.push(item);
          return;
        }

        const existingItem = feedRenderItems[existingIndex];
        if (
          (existingItem?.activeStoryCount || 0) <= 0 &&
          (item?.activeStoryCount || 0) > 0
        ) {
          feedRenderItems[existingIndex] = {
            ...existingItem,
            ...item,
          };
        }
      });
      feedLoadMorePage = nextPage;
      return uniqueAuthors;
    } catch (_) {
      feedHasMore = false;
      return [];
    } finally {
      feedIsLoadingMore = false;
    }
  }

  /** Remove an author from the queue (e.g. stories became unavailable) */
  function removeStoryFeedAuthor(authorId) {
    const id = normalizeAuthorId(authorId);
    if (!id) return;
    feedAuthorItems = feedAuthorItems.filter((a) => a.accountId !== id);

    const myId = normalizeAuthorId(localStorage.getItem("accountId"));
    if (id !== myId) {
      feedRenderItems = feedRenderItems.filter((a) => a.accountId !== id);
    }
  }

  /* ─── expose ─── */
  window.initStoryFeed = initStoryFeed;
  window.getStoryFeedQueue = getStoryFeedQueue;
  window.loadMoreStoryFeedAuthors = loadMoreStoryFeedAuthors;
  window.removeStoryFeedAuthor = removeStoryFeedAuthor;
  window.syncStoryFeedRingState = syncStoryFeedRingState;
})();
