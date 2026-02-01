let feedContainer;
let loader;

let isLoading = false;
let hasMore = true;

let cursorCreatedAt = null;
let cursorPostId = null;

const LIMIT = 10;

function initFeed() {
  feedContainer = document.getElementById("feed");
  loader = document.getElementById("feed-loader");

  if (!feedContainer || !loader) {
    console.warn("Feed DOM not ready");
    return;
  }

  // reset state khi vào lại home
  isLoading = false;
  hasMore = true;
  cursorCreatedAt = null;
  cursorPostId = null;

  feedContainer.innerHTML = "";
  loadFeed();
}

async function loadFeed() {
  if (isLoading || !hasMore) return;

  isLoading = true;

  // Chỉ hiện loader khi đã có bài viết (load more)
  // Mới vào trang (feed trống) -> Không hiện loader theo yêu cầu
  if (feedContainer.children.length > 0) {
    loader.style.display = "block";
  }

  let url = `${API_BASE}/Posts/feed?limit=${LIMIT}`;

  if (cursorCreatedAt && cursorPostId) {
    url += `&cursorCreatedAt=${encodeURIComponent(cursorCreatedAt)}`;
    url += `&cursorPostId=${cursorPostId}`;
  }

  try {
    const res = await apiFetch(
      `/Posts/feed?limit=${LIMIT}` +
        (cursorCreatedAt && cursorPostId
          ? `&cursorCreatedAt=${encodeURIComponent(cursorCreatedAt)}&cursorPostId=${cursorPostId}`
          : ""),
    );

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
    loader.style.display = "none";
  }
}

function renderFeed(posts) {
  posts.forEach((post) => {
    const postEl = document.createElement("div");
    postEl.className = "post";

    const isLong = post.content && post.content.length > 150;
    postEl.innerHTML = `
        <div class="post-header">
          <div class="post-user" data-account-id="${post.author.accountId}">
            <img class="post-avatar"
                 src="${post.author?.avatarUrl || APP_CONFIG.DEFAULT_AVATAR}"
                 alt="">
            <span class="post-username">${post.author?.fullName || "Unknown"}</span>
            <span class="post-time">• ${timeAgo(post.createdAt)}</span>
          </div>
          <div class="post-actions">
          ${
            !post.isOwner && !post.author.isFollowedByCurrentUser
              ? `<button class="follow-btn" onclick="followUser('${post.author.accountId}', this)">
           Follow
         </button>`
              : ""
          }
          <button class="post-more" onclick="showPostOptions('${post.postId}', '${post.author.accountId}', ${post.isOwner}, ${post.author.isFollowedByCurrentUser})">
            <i data-lucide="more-horizontal"></i>
          </button>
          </div>
        </div>

        <div class="post-caption ${isLong ? "truncated" : ""}">
            ${escapeHtml(post.content || "")}
        </div>

        ${
          isLong ? `<span class="caption-toggle more-btn">more</span>` : ""
        }                                         
        
        ${renderMedias(post.medias)}

        <div class="post-actions">
          <div class="left">
            <div class="action-item react-btn"
     data-post-id="${post.postId}"
     data-reacted="${post.isReactedByCurrentUser}">
     
  <i data-lucide="heart"
     class="react-icon ${post.isReactedByCurrentUser ? "reacted" : ""}">
  </i>

  <span class="count">${post.reactCount}</span>
</div>


            <div class="action-item">
              <i data-lucide="message-circle"></i>
              <span class="count">${post.commentCount}</span>
            </div>
            <div class="action-item">
              <i data-lucide="send"></i>
            </div>
          </div>
          <div class="right action-item">
            <i data-lucide="bookmark"></i>
          </div>
        </div>
      `;

    feedContainer.appendChild(postEl);
    
    // Apply dynamic aspect ratio based on FeedAspectRatio
    const mediaSlider = postEl.querySelector('.media-slider');
    if (mediaSlider) {
      const aspectRatio = getAspectRatioCSS(post.feedAspectRatio);
      mediaSlider.style.aspectRatio = aspectRatio;

      // Nếu là Original (0), dùng contain để hiển thị full ảnh trong khung vuông (lòi bg)
      if (post.feedAspectRatio === 0) {
        mediaSlider.classList.add("fit-contain");
      }
    }
    
    initMediaSlider(postEl);
    applyDominantColors(postEl);
  });

  lucide.createIcons();
}

function renderMedias(medias) {
  if (!medias || medias.length === 0) return "";

  return `
    <div class="post-media">
      <div class="media-slider">
        <div class="media-track">
          ${medias
            .map((m) => {
              // Kiểm tra Type để render đúng tag
              if (m.type === 1) {
                // Video
                return `<video src="${m.mediaUrl}" controls></video>`;
              } else {
                // Image (type === 0)
                return `<img src="${m.mediaUrl}" />`;
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

// Map FeedAspectRatio enum to CSS aspect-ratio
function getAspectRatioCSS(feedAspectRatio) {
  switch (feedAspectRatio) {
    case 0: // Original - hiển thị 1:1, bg thừa dùng dominant color
      return "1 / 1";
    case 1: // Square 1:1
      return "1 / 1";
    case 2: // Portrait 4:5
      return "4 / 5";
    case 3: // Landscape 16:9
      return "16 / 9";
    default:
      return "1 / 1";
  }
}


// Apply dominant color background to images
function applyDominantColors(postEl) {
  const images = postEl.querySelectorAll(".media-track img");
  
  images.forEach(async (img) => {
    try {
      if (!window.extractDominantColor) {
        return;
      }
      
      const color = await extractDominantColor(img.src);
      
      // Set linear gradient background: dominant color -> dark
      img.style.background = `linear-gradient(135deg, ${color}, #1a1a1a)`;
      
      // Also apply to parent media-track for better effect
      const track = img.closest('.media-track');
      if (track) {
        track.style.background = `linear-gradient(135deg, ${color}, #1a1a1a)`;
      }
    } catch (e) {
      console.error("❌ Failed to extract color:", e);
    }
  });
}


function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);

  if (diff < 60) return "just now";

  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}

function initMediaSlider(postEl) {
  const track = postEl.querySelector(".media-track");
  if (!track) return;

  const medias = track.querySelectorAll("img, video"); // Lấy cả img và video
  const prev = postEl.querySelector(".prev");
  const next = postEl.querySelector(".next");
  const dotsContainer = postEl.querySelector(".media-dots");

  let index = 0;
  const total = medias.length;

  // chỉ 1 media → ẩn nút
  if (total <= 1) {
    prev.style.display = "none";
    next.style.display = "none";
    return;
  }

  // create dots
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

    // Tự động pause video khi chuyển slide
    medias.forEach((media, i) => {
      if (media.tagName === "VIDEO") {
        if (i !== index) {
          media.pause();
        }
      }
    });
  }

  prev.onclick = () => {
    index = (index - 1 + total) % total;
    update();
  };

  next.onclick = () => {
    index = (index + 1) % total;
    update();
  };
}

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("caption-toggle")) return;

  const caption = e.target.previousElementSibling;

  if (!caption) return;

  caption.classList.toggle("truncated");

  e.target.textContent = caption.classList.contains("truncated")
    ? "more"
    : "less";
});

//scroll => load more feed
let scrollTimeout;

window.addEventListener("scroll", () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;

    if (nearBottom && !isLoading && hasMore) {
      loadFeed();
    }
  }, 100);
});

document.addEventListener("click", async (e) => {
  const reactBtn = e.target.closest(".react-btn");
  if (!reactBtn) return;

  const postId = reactBtn.dataset.postId;
  const icon = reactBtn.querySelector(".react-icon");
  const countEl = reactBtn.querySelector(".count");

  const wasReacted = reactBtn.dataset.reacted === "true";
  const oldCount = parseInt(countEl.textContent, 10);

  // 1️⃣ Optimistic UI
  reactBtn.dataset.reacted = (!wasReacted).toString();
  icon.classList.toggle("reacted", !wasReacted);
  countEl.textContent = wasReacted ? oldCount - 1 : oldCount + 1;

  try {
    // 2️⃣ Call API
    const res = await apiFetch(`/Posts/${postId}/react`, {
      method: "POST",
    });

    if (!res.ok) throw new Error("React failed");

    const data = await res.json();
    /**
     * data = {
     *   reactCount: number,
     *   isReactedByCurrentUser: boolean
     * }
     */

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
  initProfilePreview();
});
