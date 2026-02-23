(function() {
  let feedContainer;
  let loader;

  let isLoading = false;
  let hasMore = true;

  let cursorCreatedAt = null;
  let cursorPostId = null;

  const LIMIT = APP_CONFIG.NEWSFEED_LIMIT;

  function initFeed(shouldReload = true) {
    feedContainer = document.getElementById("feed");
    loader = document.getElementById("feed-loader");

    if (!feedContainer || !loader) {
      console.warn("Feed DOM not ready");
      return;
    }
    
    // If we are restoring state and have content, don't reset
    if (!shouldReload && feedContainer.children.length > 0 && cursorCreatedAt) {
        console.log("Restoring feed state...");
        return;
    }

    // reset state khi vào lại home
    isLoading = false;
    hasMore = true;
    cursorCreatedAt = null;
    cursorPostId = null;

    // Register state hooks for PageCache
    window.getPageData = () => ({
        cursorCreatedAt,
        cursorPostId,
        hasMore
    });
    window.setPageData = (data) => {
        if (!data) return;
        cursorCreatedAt = data.cursorCreatedAt;
        cursorPostId = data.cursorPostId;
        hasMore = data.hasMore;
    };

    feedContainer.innerHTML = "";
    loadFeed();
  }

  async function loadFeed() {
    if (isLoading || !hasMore) return;

    isLoading = true;

    // Chỉ hiện loader khi đã có bài viết (load more)
    if (feedContainer && feedContainer.children.length > 0) {
      LoadingUtils.toggle(loader, true);
    }

    try {
      const res = await API.Posts.getFeed(LIMIT, cursorCreatedAt, cursorPostId);

      if (!res.ok) throw new Error("Load feed failed");

      const data = await res.json();

      renderFeed(data.items);

      if (data.nextCursor) {
        cursorCreatedAt = data.nextCursor.createdAt;
        cursorPostId = data.nextCursor.postId;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(err);
    } finally {
      isLoading = false;
      if (loader) LoadingUtils.toggle(loader, false);
    }
  }

  function renderFeed(posts) {
    if (!feedContainer) return;
    
    posts.forEach((post) => {
      const postEl = createPostElement(post);
      feedContainer.appendChild(postEl);
    });

    if (window.lucide) lucide.createIcons();
  }

  function createPostElement(post) {
      const postEl = document.createElement("div");
      postEl.className = "post";
      postEl.setAttribute("data-post-id", post.postId);
      const storyRingClass = getStoryRingClass(post.author?.storyRingState);
      const commentCount = Number.isFinite(Number(post.commentCount)) ? Number(post.commentCount) : 0;

      postEl.innerHTML = `
          <div class="post-header">
            <div class="post-user" data-account-id="${post.author.accountId}">
              <a href="#/profile/${post.author.username}" style="text-decoration: none; display: block;">
                  <img class="post-avatar ${storyRingClass}"
                       src="${post.author?.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}"
                       alt="">
              </a>
              <div class="user-meta">
                <a href="#/profile/${post.author.username}" style="text-decoration: none; color: inherit;">
                    <span class="post-username">${PostUtils.truncateName(post.author?.username || post.author?.fullName || "User")}</span>
                </a>
                <div class="post-meta">
                  <span class="post-time" 
                        title="${PostUtils.formatFullDateTime(post.createdAt)}" 
                        onclick="openPostDetail('${post.postId}', '${post.postCode}')">${PostUtils.timeAgo(post.createdAt)}</span>
                  <span>•</span>
                  ${PostUtils.renderPrivacyBadge(post.privacy)}
                </div>
              </div>
            </div>
            <div class="post-actions">
            ${
              !post.isOwner && !post.author.isFollowedByCurrentUser
                ? `<button class="follow-btn" onclick="FollowModule.followUser('${post.author.accountId}', this)">
                    <i data-lucide="user-plus"></i>
                    <span>Follow</span>
                   </button>`
                : ""
            }
            <button class="post-more" onclick="showPostOptions('${post.postId}', '${post.author.accountId}', ${post.isOwner}, ${post.author.isFollowedByCurrentUser})">
              <i data-lucide="more-horizontal"></i>
            </button>
            </div>
          </div>

          <div class="post-caption"></div>
          
          ${renderMedias(post.medias, post.postId, post.postCode)}

          <div class="post-actions">
            <div class="left">
              <div class="action-item react-btn"
        data-post-id="${post.postId}"
        data-reacted="${post.isReactedByCurrentUser}">
       
    <i data-lucide="heart"
       class="react-icon ${post.isReactedByCurrentUser ? "reacted" : ""} hover-scale-sm">
    </i>

    <span class="count hover-scale-text" onclick="event.stopPropagation(); window.InteractionModule?.openReactList('${post.postId}', 'post', '${post.reactCount}')">${post.reactCount}</span>
  </div>


              <div class="action-item" onclick="openPostDetail('${post.postId}', '${post.postCode}')" style="cursor: pointer;">
                <i data-lucide="message-circle" class="hover-scale-sm"></i>
                <span class="count hover-scale-text">${commentCount}</span>
              </div>
              <div class="action-item">
                <i data-lucide="send" class="hover-scale-sm"></i>
              </div>
            </div>
            <div class="right action-item">
              <i data-lucide="bookmark" class="hover-scale-sm"></i>
            </div>
          </div>
        `;

      const mediaSlider = postEl.querySelector('.media-slider');
      if (mediaSlider) {
        const aspectRatio = getAspectRatioCSS(post.feedAspectRatio);
        mediaSlider.style.aspectRatio = aspectRatio;

        if (post.feedAspectRatio === 0) {
          mediaSlider.classList.add("fit-contain");
        }
      }
      
      initMediaSlider(postEl);
      setupMediaLoading(postEl);
      applyDominantColors(postEl);

      const captionEl = postEl.querySelector(".post-caption");
      PostUtils.setupCaption(captionEl, post.content || "");
      
      return postEl;
  }

  function getStoryRingClass(storyRingState) {
    if (storyRingState === 2 || storyRingState === "2" || storyRingState === "Unseen") {
      return "story-ring-unseen";
    }

    if (storyRingState === 1 || storyRingState === "1" || storyRingState === "Seen") {
      return "story-ring-seen";
    }

    return "";
  }

  function prependPostToFeed(post) {
      if (!feedContainer) return;
      
      // Check if post already exists to avoid duplicates (e.g. from SignalR)
      if (document.querySelector(`.post[data-post-id="${post.postId}"]` || `.post[data-post-id="${post.postId.toLowerCase()}"]`)) {
          return;
      }

      const postEl = createPostElement(post);
      postEl.classList.add("post-new-fade-in"); // Add animation class
      feedContainer.prepend(postEl);
      
      if (window.lucide) lucide.createIcons();
  }

  function renderMedias(medias, postId, postCode) {
    if (!medias || medias.length === 0) return "";

    return `
      <div class="post-media">
        <div class="media-slider">
          <div class="media-track" onclick="openPostDetail('${postId}', '${postCode || ''}')" style="cursor: pointer;">
            ${medias
              .map((m) => {
                if (m.type === 1) {
                  return `<div class="media-item skeleton"><video class="img-loaded" src="${m.mediaUrl}" controls></video></div>`;
                } else {
                  return `<div class="media-item skeleton"><img class="img-loaded" src="${m.mediaUrl}" /></div>`;
                }
              })
              .join("")}
          </div>
          <button class="nav prev">‹</button>
          <button class="nav next">›</button>
        </div>
        <div class="media-dots"></div>
      </div>
    `;
  }

  function getAspectRatioCSS(feedAspectRatio) {
    switch (feedAspectRatio) {
      case 0: return "1 / 1";
      case 1: return "1 / 1";
      case 2: return "4 / 5";
      case 3: return "16 / 9";
      default: return "1 / 1";
    }
  }

  function setupMediaLoading(postEl) {
    const mediaItems = postEl.querySelectorAll(".media-item");
    mediaItems.forEach((item) => {
      const media = item.querySelector("img, video");
      if (!media) return;

      const onLoaded = () => {
        item.classList.remove("skeleton");
        media.classList.add("show");
      };

      if (media.tagName === "IMG") {
        if (media.complete) onLoaded();
        else media.onload = onLoaded;
      } else if (media.tagName === "VIDEO") {
        if (media.readyState >= 2) onLoaded();
        else media.onloadeddata = onLoaded;
      }
    });
  }

  function applyDominantColors(postEl) {
    const images = postEl.querySelectorAll(".media-track img");
    images.forEach(async (img) => {
      try {
        if (!window.extractDominantColor) return;
        const color = await extractDominantColor(img.src);
        img.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
        const track = img.closest('.media-track');
        if (track) track.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
      } catch (e) {
        console.error("❌ Failed to extract color:", e);
      }
    });
  }

  function initMediaSlider(postEl) {
    const track = postEl.querySelector(".media-track");
    if (!track) return;

    const medias = track.querySelectorAll("img, video");
    const prev = postEl.querySelector(".prev");
    const next = postEl.querySelector(".next");
    const dotsContainer = postEl.querySelector(".media-dots");

    let index = 0;
    const total = medias.length;

    if (total <= 1) {
      if (prev) prev.style.display = "none";
      if (next) next.style.display = "none";
      return;
    }

    medias.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", () => {
        index = i;
        update();
      });
      dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll("span");

    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d) => d.classList.remove("active"));
      dots[index].classList.add("active");
      medias.forEach((media, i) => {
        if (media.tagName === "VIDEO" && i !== index) media.pause();
      });
    }

    if (prev) prev.onclick = () => { index = (index - 1 + total) % total; update(); };
    if (next) next.onclick = () => { index = (index + 1) % total; update(); };
  }

  // Scroll listener
  let scrollTimeout;
  const handleFeedScroll = () => {
    // Check if feed is still in DOM
    const currentFeed = document.getElementById("feed");
    if (!currentFeed || !document.body.contains(currentFeed)) return;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const mc = document.querySelector('.main-content');
      if (!mc) return;
      const nearBottom = mc.scrollTop + mc.clientHeight >= mc.scrollHeight - 200;
      if (nearBottom && !isLoading && hasMore) {
        loadFeed();
      }
    }, 100);
  };

  const mc = document.querySelector('.main-content');
  if (mc) mc.addEventListener("scroll", handleFeedScroll);

  // Expose initFeed
  window.initFeed = initFeed;
  window.prependPostToFeed = prependPostToFeed;

  // React listener
  document.addEventListener("click", async (e) => {
    const reactBtn = e.target.closest(".react-btn");
    if (!reactBtn) return;
    const clickedIcon = e.target.closest(".react-icon");
    const clickedCount = e.target.closest(".count");
    if (!clickedIcon && !clickedCount) return;

    if (clickedCount) {
      const postId = reactBtn.dataset.postId;
      const count = clickedCount.textContent;
      if (window.InteractionModule) window.InteractionModule.openReactList(postId, 'post', count);
      return;
    }

    const postId = reactBtn.dataset.postId;
    const icon = reactBtn.querySelector(".react-icon");
    const countEl = reactBtn.querySelector(".count");
    const wasReacted = reactBtn.dataset.reacted === "true";
    const oldCount = parseInt(countEl.textContent, 10);

    reactBtn.dataset.reacted = (!wasReacted).toString();
    if (!wasReacted) {
      icon.classList.add("reacted");
      icon.classList.remove("unreacting");
      countEl.textContent = oldCount + 1;
    } else {
      icon.classList.remove("reacted");
      icon.classList.add("unreacting");
      icon.addEventListener("animationend", () => icon.classList.remove("unreacting"), { once: true });
      countEl.textContent = oldCount - 1;
    }

    try {
      const res = await API.Posts.toggleReact(postId);
      if (res.status === 403 || res.status === 400) {
        if (window.toastInfo) toastInfo("This post is no longer available.");
        PostUtils.hidePost(postId);
        return;
      }
      if (!res.ok) throw new Error("React failed");
      const data = await res.json();
      reactBtn.dataset.reacted = data.isReactedByCurrentUser.toString();
      icon.classList.toggle("reacted", data.isReactedByCurrentUser);
      countEl.textContent = data.reactCount;
    } catch (err) {
      console.error(err);
      reactBtn.dataset.reacted = wasReacted.toString();
      icon.classList.toggle("reacted", wasReacted);
      countEl.textContent = oldCount;
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (window.initProfilePreview) initProfilePreview();
  });

})();
