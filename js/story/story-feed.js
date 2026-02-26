(function () {
  "use strict";

  /* ─── author queue for story-list viewer ─── */
  const FEED_PAGE_SIZE = 30;
  let feedAuthorItems = [];
  let feedPage = 1;
  let feedHasMore = true;
  let feedIsLoadingMore = false;

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

  /**
   * Build queue from raw items array.
   * Excludes "Your Story" placeholder (no stories).
   */
  function buildAuthorQueue(items) {
    const defaultAvatar =
      window.APP_CONFIG?.DEFAULT_AVATAR || "assets/images/default-avatar.jpg";
    return (Array.isArray(items) ? items : [])
      .map((it) => {
        const activeStoryCount = parseCount(
          it.activeStoryCount ?? it.ActiveStoryCount,
          0,
        );
        return {
          accountId: normalizeAuthorId(it.accountId || it.AccountId || ""),
          avatarUrl: it.avatarUrl || it.AvatarUrl || defaultAvatar,
          username:
            it.username || it.Username || it.fullName || it.FullName || "User",
          isCurrentUser: !!(it.isCurrentUser || it.IsCurrentUser),
          storyRingState: it.storyRingState ?? it.StoryRingState ?? 0,
          activeStoryCount,
        };
      })
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
    const normalizedId = normalizeAuthorId(
      rawAuthor?.accountId || rawAuthor?.AccountId || "",
    );
    if (!normalizedId) return;

    feedAuthorItems = feedAuthorItems.filter((a) => a.accountId !== normalizedId);
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

  /* ─── sync own story UI (no re-fetch) ─── */

  /**
   * Update the ".story-own" element in the feed to reflect current story state.
   * @param {boolean} hasStories – whether the current user now has active stories.
   */
  function syncOwnStoryUI(hasStories) {
    const container = document.getElementById("story-feed");
    if (!container) return;

    const storyEl = container.querySelector(".story-own");
    if (!storyEl) return;

    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    if (!myId) return;

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
      }
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
      return;
    }

    if (hasRemainingInfo || authorId === myId) {
      removeStoryFeedAuthor(authorId || myId);
    }
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
    }, 400);
  });

  /* ─── init ─── */
  async function initStoryFeed() {
    const container = document.getElementById("story-feed");
    if (!container) return;

    // Hiển thị skeleton ngay lập tức
    renderSkeletons(container, 7);

    try {
      const res = await API.Stories.getViewableAuthors(1, FEED_PAGE_SIZE);
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

      renderStoryItems(container, items);

      // Build author queue for story-list viewer
      feedAuthorItems = buildAuthorQueue(rawItems);
      feedPage = 1;
      feedHasMore = resolveHasMoreFromPayload(
        data,
        1,
        FEED_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );
    } catch (err) {
      console.error("Story feed load failed:", err);
      container.innerHTML = "";
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
      const nextPage = feedPage + 1;
      const res = await API.Stories.getViewableAuthors(
        nextPage,
        FEED_PAGE_SIZE,
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
        FEED_PAGE_SIZE,
        Array.isArray(rawItems) ? rawItems.length : 0,
      );

      const newAuthors = buildAuthorQueue(rawItems);
      const existingIds = new Set(feedAuthorItems.map((a) => a.accountId));
      const uniqueAuthors = newAuthors.filter((author) => {
        if (!author?.accountId || existingIds.has(author.accountId)) {
          return false;
        }
        existingIds.add(author.accountId);
        return true;
      });
      feedAuthorItems = feedAuthorItems.concat(uniqueAuthors);
      feedPage = nextPage;
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
  }

  /* ─── expose ─── */
  window.initStoryFeed = initStoryFeed;
  window.getStoryFeedQueue = getStoryFeedQueue;
  window.loadMoreStoryFeedAuthors = loadMoreStoryFeedAuthors;
  window.removeStoryFeedAuthor = removeStoryFeedAuthor;
})();
