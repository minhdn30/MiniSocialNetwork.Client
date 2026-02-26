(function () {
  "use strict";

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
  window.addEventListener("story:created", () => {
    syncOwnStoryUI(true);
  });

  window.addEventListener("story:deleted", (e) => {
    const detail = e.detail || {};
    const myId = (localStorage.getItem("accountId") || "").toLowerCase();
    const authorId = (detail.authorId || "").toLowerCase();

    // Only sync if the deleted story belongs to the current user
    if (authorId && authorId !== myId) return;

    const remaining = detail.remainingCount ?? 0;
    syncOwnStoryUI(remaining > 0);
  });

  window.addEventListener("story:unavailable", (e) => {
    const detail = e.detail || {};
    const authorId = (detail.authorId || "").toLowerCase();
    if (!authorId) return;

    const container = document.getElementById("story-feed");
    if (!container) return;

    const myId = (localStorage.getItem("accountId") || "").toLowerCase();

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
      const res = await API.Stories.getViewableAuthors(1, 30);
      if (!res.ok) throw new Error("Failed to load story feed");

      const data = await res.json();
      let items = data.items || data.Items || [];

      // Luôn đảm bảo "Your Story" ở đầu danh sách
      const myId = (localStorage.getItem("accountId") || "").toLowerCase();
      const hasCurrentUser = items.some(
        (it) => (it.accountId || it.AccountId || "").toLowerCase() === myId,
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
    } catch (err) {
      console.error("Story feed load failed:", err);
      container.innerHTML = "";
    }
  }

  /* ─── expose ─── */
  window.initStoryFeed = initStoryFeed;
})();
