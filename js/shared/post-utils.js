/**
 * Shared Post Utilities used by both Newfeed and Post Detail
 * namespace: window.PostUtils
 */

(function (global) {
  const PostUtils = {};
  const puEscapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const puEscapeHtmlAttr = (value) =>
    puEscapeHtml(value).replace(/`/g, "&#96;");
  const postTagSummaryContextMap = new WeakMap();
  const postTaggedAccountsCache = new Map();
  const commentMentionRegex = /@\[(?<username>[A-Za-z0-9._]{1,30})\]\((?<accountId>[0-9a-fA-F-]{36})\)/g;
  const postTaggedAccountsModalState = {
    modalId: "postTaggedAccountsModal",
    listId: "postTaggedAccountsList",
    loaderId: "postTaggedAccountsLoader",
    currentPostId: "",
    currentPostCode: "",
    didLockScroll: false,
  };

  function getPostTagPreviewLimit() {
    const parsedLimit = Number(window.APP_CONFIG?.POST_TAG_PREVIEW_LIMIT);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return 2;
    return Math.floor(parsedLimit);
  }

  function parseCommentMentionSegments(rawContent) {
    const safeContent = (rawContent ?? "").toString();
    if (!safeContent) {
      return [];
    }

    const segments = [];
    let lastIndex = 0;
    commentMentionRegex.lastIndex = 0;
    let match = commentMentionRegex.exec(safeContent);

    while (match) {
      const startIndex = match.index;
      const matchText = match[0] || "";
      const endIndex = startIndex + matchText.length;

      if (startIndex > lastIndex) {
        segments.push({
          type: "text",
          text: safeContent.slice(lastIndex, startIndex),
        });
      }

      const mentionUsername = (match.groups?.username || "").toString().trim();
      const mentionAccountId = (match.groups?.accountId || "")
        .toString()
        .trim();

      if (mentionUsername && mentionAccountId) {
        segments.push({
          type: "mention",
          username: mentionUsername,
          accountId: mentionAccountId,
          text: `@${mentionUsername}`,
        });
      } else {
        segments.push({
          type: "text",
          text: matchText,
        });
      }

      lastIndex = endIndex;
      match = commentMentionRegex.exec(safeContent);
    }

    if (lastIndex < safeContent.length) {
      segments.push({
        type: "text",
        text: safeContent.slice(lastIndex),
      });
    }

    return segments;
  }

  function getCommentDisplayContent(rawContent) {
    const segments = parseCommentMentionSegments(rawContent);
    if (segments.length === 0) {
      return (rawContent ?? "").toString();
    }

    return segments
      .map((segment) => {
        if (segment.type === "mention") {
          return segment.text || "";
        }
        return segment.text || "";
      })
      .join("");
  }

  function renderCommentRichContent(targetElement, rawContent) {
    if (!targetElement) return;

    const segments = parseCommentMentionSegments(rawContent);
    if (segments.length === 0) {
      targetElement.textContent = (rawContent ?? "").toString();
      return;
    }

    targetElement.innerHTML = "";
    const fragment = document.createDocumentFragment();

    segments.forEach((segment) => {
      if (segment.type !== "mention") {
        fragment.appendChild(document.createTextNode(segment.text || ""));
        return;
      }

      const profileTarget = segment.username || segment.accountId || "";
      const mentionAnchor = document.createElement("a");
      mentionAnchor.className = "comment-mention-link";
      mentionAnchor.href = PostUtils.buildProfileHash(profileTarget);
      mentionAnchor.dataset.accountId = segment.accountId || "";
      mentionAnchor.dataset.username = segment.username || "";

      const mentionPrefix = document.createElement("span");
      mentionPrefix.className = "comment-mention-prefix";
      mentionPrefix.textContent = "@";

      const mentionName = document.createElement("span");
      mentionName.className = "comment-mention-name";
      mentionName.textContent =
        (segment.username || "").toString().trim() ||
        (segment.text || "").toString().replace(/^@+/, "");

      mentionAnchor.appendChild(mentionPrefix);
      mentionAnchor.appendChild(mentionName);
      mentionAnchor.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      fragment.appendChild(mentionAnchor);
    });

    targetElement.appendChild(fragment);
  }

  function getPostTagCacheTtlMs() {
    const parsedTtlMs = Number(window.APP_CONFIG?.POST_TAG_CACHE_TTL_MS);
    if (!Number.isFinite(parsedTtlMs) || parsedTtlMs <= 0) {
      return 10 * 60 * 1000;
    }
    return Math.floor(parsedTtlMs);
  }

  function getPostTagCacheMaxEntries() {
    const parsedMaxEntries = Number(
      window.APP_CONFIG?.POST_TAG_CACHE_MAX_ENTRIES,
    );
    if (!Number.isFinite(parsedMaxEntries) || parsedMaxEntries <= 0) {
      return 200;
    }
    return Math.floor(parsedMaxEntries);
  }

  /**
   * Convert date string to relative time (e.g. "2 hours ago")
   * @param {string} dateStr
   * @returns {string} Relative time string
   */
  PostUtils.timeAgo = function (dateStr, short = false) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);

    if (diff < 60) return short ? "now" : "just now";

    const minutes = Math.floor(diff / 60);
    if (minutes < 60)
      return short
        ? `${minutes}m`
        : `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24)
      return short ? `${hours}h` : `${hours} hour${hours > 1 ? "s" : ""} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7)
      return short ? `${days}d` : `${days} day${days > 1 ? "s" : ""} ago`;

    const weeks = Math.floor(days / 7);
    return short ? `${weeks}w` : `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  };

  /**
   * Setup comment content with truncation logic (similar to setupCaption)
   * @param {HTMLElement} el
   * @param {string} fullContent
   * @param {number} maxLen
   */
  PostUtils.setupCommentContent = function (
    el,
    fullContent,
    maxLen = APP_CONFIG.COMMENT_CONTENT_TRUNCATE_LENGTH,
    forceExpand = false,
  ) {
    if (!fullContent) {
      el.textContent = "";
      delete el.dataset.fullContent;
      delete el.dataset.rawContent;
      return;
    }

    const rawContent = (fullContent ?? "").toString();
    const displayContent = getCommentDisplayContent(rawContent);

    // Keep both raw content (for rendering links) and display content (for editing textarea).
    el.dataset.rawContent = rawContent;
    el.dataset.fullContent = displayContent;

    if (displayContent.length <= maxLen) {
      renderCommentRichContent(el, rawContent);
      return;
    }

    // Use truncateSmart to avoid cutting words
    const truncatedContent =
      typeof truncateSmart === "function"
        ? truncateSmart(displayContent, maxLen)
        : displayContent.substring(0, maxLen) + "...";

    el.innerHTML = "";
    if (forceExpand) {
      renderCommentRichContent(el, rawContent);
    } else {
      el.appendChild(document.createTextNode(truncatedContent));
    }

    const btn = document.createElement("span");
    btn.className = "caption-toggle comment-toggle";
    // If forceExpand, button should be " less"
    btn.textContent = forceExpand ? " less" : "more";

    btn.onclick = (e) => {
      e.stopPropagation();
      const isMore = btn.textContent === "more";
      if (isMore) {
        renderCommentRichContent(el, rawContent);
        el.appendChild(btn);
        btn.textContent = " less";
      } else {
        el.innerHTML = "";
        el.appendChild(document.createTextNode(truncatedContent));
        el.appendChild(btn);
        btn.textContent = "more";
      }
    };

    el.appendChild(btn);
  };

  /**
   * Truncate name without cutting in the middle of a word
   * @param {string} name - Full user name
   * @param {number} maxLen - Max length before truncation
   * @returns {string} Truncated name
   */
  PostUtils.truncateName = function (
    name,
    maxLen = window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25,
  ) {
    if (typeof truncateSmart === "function") {
      return truncateSmart(name, maxLen);
    }

    // Fallback if text-utils.js not loaded
    if (!name || name.length <= maxLen) return name;
    let truncated = name.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }
    return truncated + "...";
  };

  /**
   * Resolve account display name (username first, fallback fullName)
   * @param {object} account
   * @returns {string}
   */
  PostUtils.getAccountPrimaryName = function (account) {
    const rawUsername = (
      account?.username ||
      account?.userName ||
      account?.Username ||
      account?.UserName ||
      ""
    )
      .toString()
      .trim();
    const username = rawUsername.startsWith("@")
      ? rawUsername.slice(1)
      : rawUsername;

    const rawFullName = (account?.fullName || account?.FullName || "")
      .toString()
      .trim();
    const fullName = rawFullName.startsWith("@")
      ? rawFullName.slice(1)
      : rawFullName;

    return username || fullName || "Unknown user";
  };

  /**
   * Normalize tagged account source for feed/detail
   * @param {object} source
   * @returns {{accounts: Array, total: number}}
   */
  PostUtils.normalizePostTaggedAccounts = function (source) {
    const taggedAccountsPreview = Array.isArray(source?.taggedAccountsPreview)
      ? source.taggedAccountsPreview
      : Array.isArray(source?.TaggedAccountsPreview)
        ? source.TaggedAccountsPreview
        : [];

    const taggedAccounts = Array.isArray(source?.taggedAccounts)
      ? source.taggedAccounts
      : Array.isArray(source?.TaggedAccounts)
        ? source.TaggedAccounts
        : [];

    const sourceTotal =
      source?.totalTaggedAccounts ?? source?.TotalTaggedAccounts;
    const numericTotal = Number(sourceTotal);
    const total =
      Number.isFinite(numericTotal) && numericTotal >= 0
        ? numericTotal
        : taggedAccounts.length > 0
          ? taggedAccounts.length
          : taggedAccountsPreview.length;

    const accounts =
      taggedAccountsPreview.length > 0 ? taggedAccountsPreview : taggedAccounts;

    return {
      accounts,
      total,
    };
  };

  /**
   * Resolve owner display name for post header
   * @param {object} source
   * @param {boolean} shouldTruncate
   * @returns {string}
   */
  PostUtils.getPostOwnerDisplayName = function (source, shouldTruncate = true) {
    const owner = source?.author || source?.owner || source;
    const baseName = PostUtils.getAccountPrimaryName(owner);
    if (!shouldTruncate) return baseName;

    const tagged = PostUtils.normalizePostTaggedAccounts(source);
    const hasTags = tagged.total > 0;
    const maxLen = hasTags
      ? window.APP_CONFIG?.POST_OWNER_NAME_MAX_LENGTH_WHEN_TAGGED || 16
      : window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25;
    return PostUtils.truncateName(baseName, maxLen);
  };

  /**
   * Resolve tagged account display name in summary
   * @param {object} account
   * @param {number} totalTaggedCount
   * @param {boolean} shouldTruncate
   * @returns {string}
   */
  PostUtils.getPostTagDisplayName = function (
    account,
    totalTaggedCount = 1,
    shouldTruncate = true,
  ) {
    const baseName = PostUtils.getAccountPrimaryName(account);
    if (!shouldTruncate) return baseName;

    let maxLen = window.APP_CONFIG?.POST_TAG_NAME_MAX_LENGTH || 18;
    if (totalTaggedCount <= 1) {
      maxLen = window.APP_CONFIG?.POST_TAG_NAME_MAX_LENGTH_SINGLE || maxLen;
    } else if (totalTaggedCount === 2) {
      maxLen = window.APP_CONFIG?.POST_TAG_NAME_MAX_LENGTH_PAIR || maxLen;
    } else {
      maxLen = window.APP_CONFIG?.POST_TAG_NAME_MAX_LENGTH_MULTI || maxLen;
    }

    return PostUtils.truncateName(baseName, maxLen);
  };

  /**
   * Resolve username for profile links
   * @param {object} account
   * @returns {string}
   */
  PostUtils.getPostTagUsername = function (account) {
    const rawUsername = (
      account?.username ||
      account?.userName ||
      account?.Username ||
      account?.UserName ||
      ""
    )
      .toString()
      .trim();
    return rawUsername.startsWith("@") ? rawUsername.slice(1) : rawUsername;
  };

  /**
   * Build profile hash path
   * @param {string} profileTarget
   * @returns {string}
   */
  PostUtils.buildProfileHash = function (profileTarget) {
    const safe = (profileTarget || "").toString().trim();
    if (!safe) return "#/";
    if (
      window.RouteHelper &&
      typeof window.RouteHelper.buildProfileHash === "function"
    ) {
      return window.RouteHelper.buildProfileHash(safe);
    }
    return `#/${encodeURIComponent(safe)}`;
  };

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function getCurrentViewerId() {
    return normalizeAccountId(
      window.APP_CONFIG?.CURRENT_USER_ID || localStorage.getItem("accountId"),
    );
  }

  function normalizePostTaggedAccountItem(account) {
    if (!account || typeof account !== "object") return null;

    const accountId = (
      account.accountId ||
      account.AccountId ||
      account.id ||
      ""
    )
      .toString()
      .trim();

    if (!accountId) return null;

    const rawUsername = (
      account.username ||
      account.userName ||
      account.Username ||
      account.UserName ||
      ""
    )
      .toString()
      .trim();
    const username = rawUsername.startsWith("@")
      ? rawUsername.slice(1)
      : rawUsername;

    const rawFullName = (account.fullName || account.FullName || "")
      .toString()
      .trim();
    const fullName = rawFullName.startsWith("@")
      ? rawFullName.slice(1)
      : rawFullName;

    const avatarUrl =
      account.avatarUrl || account.AvatarUrl || APP_CONFIG.DEFAULT_AVATAR;

    const isFollowing = Boolean(account.isFollowing ?? account.IsFollowing);
    const isFollower = Boolean(account.isFollower ?? account.IsFollower);

    return {
      accountId,
      username,
      fullName,
      avatarUrl,
      isFollowing,
      isFollower,
    };
  }

  function normalizePostTaggedAccountList(accounts) {
    if (!Array.isArray(accounts) || accounts.length <= 0) return [];
    const normalizedAccounts = [];
    const seenAccountIds = new Set();

    accounts.forEach((item) => {
      const normalizedItem = normalizePostTaggedAccountItem(item);
      if (!normalizedItem) return;
      const key = normalizeAccountId(normalizedItem.accountId);
      if (!key || seenAccountIds.has(key)) return;
      seenAccountIds.add(key);
      normalizedAccounts.push(normalizedItem);
    });

    return normalizedAccounts;
  }

  function resolveTaggedAccountsCacheKey(source) {
    const postId = (source?.postId || source?.PostId || "").toString().trim();
    if (postId) return postId;
    const postCode = (source?.postCode || source?.PostCode || "")
      .toString()
      .trim();
    return postCode ? `code:${postCode}` : "";
  }

  function normalizeTaggedAccountsCacheEntry(rawEntry) {
    if (Array.isArray(rawEntry)) {
      const normalizedAccounts = normalizePostTaggedAccountList(rawEntry);
      if (normalizedAccounts.length <= 0) return null;
      const now = Date.now();
      return {
        accounts: normalizedAccounts,
        updatedAt: now,
        lastAccessedAt: now,
      };
    }

    if (!rawEntry || typeof rawEntry !== "object") return null;

    const normalizedAccounts = normalizePostTaggedAccountList(
      rawEntry.accounts,
    );
    if (normalizedAccounts.length <= 0) return null;

    const now = Date.now();
    const updatedAt = Number(rawEntry.updatedAt);
    const lastAccessedAt = Number(rawEntry.lastAccessedAt);

    return {
      accounts: normalizedAccounts,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : now,
      lastAccessedAt: Number.isFinite(lastAccessedAt) ? lastAccessedAt : now,
    };
  }

  function cleanupExpiredTaggedAccountsCache() {
    if (postTaggedAccountsCache.size <= 0) return;

    const now = Date.now();
    const ttlMs = getPostTagCacheTtlMs();

    for (const [cacheKey, rawEntry] of postTaggedAccountsCache.entries()) {
      const normalizedEntry = normalizeTaggedAccountsCacheEntry(rawEntry);
      if (!normalizedEntry) {
        postTaggedAccountsCache.delete(cacheKey);
        continue;
      }

      const isExpired = now - normalizedEntry.updatedAt > ttlMs;
      if (isExpired) {
        postTaggedAccountsCache.delete(cacheKey);
        continue;
      }

      if (normalizedEntry !== rawEntry) {
        postTaggedAccountsCache.set(cacheKey, normalizedEntry);
      }
    }
  }

  function trimTaggedAccountsCacheToLimit() {
    const maxEntries = getPostTagCacheMaxEntries();
    if (postTaggedAccountsCache.size <= maxEntries) return;

    const sortableEntries = [];

    for (const [cacheKey, rawEntry] of postTaggedAccountsCache.entries()) {
      const normalizedEntry = normalizeTaggedAccountsCacheEntry(rawEntry);
      if (!normalizedEntry) {
        postTaggedAccountsCache.delete(cacheKey);
        continue;
      }

      if (normalizedEntry !== rawEntry) {
        postTaggedAccountsCache.set(cacheKey, normalizedEntry);
      }

      sortableEntries.push({
        cacheKey,
        lastAccessedAt: normalizedEntry.lastAccessedAt,
        updatedAt: normalizedEntry.updatedAt,
      });
    }

    if (postTaggedAccountsCache.size <= maxEntries) return;

    sortableEntries.sort((left, right) => {
      if (left.lastAccessedAt !== right.lastAccessedAt) {
        return left.lastAccessedAt - right.lastAccessedAt;
      }
      return left.updatedAt - right.updatedAt;
    });

    const entriesToRemove = postTaggedAccountsCache.size - maxEntries;
    for (
      let index = 0;
      index < entriesToRemove && index < sortableEntries.length;
      index += 1
    ) {
      postTaggedAccountsCache.delete(sortableEntries[index].cacheKey);
    }
  }

  function getTaggedAccountsCacheEntry(cacheKey, options = {}) {
    const safeCacheKey = (cacheKey || "").toString().trim();
    if (!safeCacheKey) return null;

    const shouldTouch = options.touch !== false;
    cleanupExpiredTaggedAccountsCache();

    const rawEntry = postTaggedAccountsCache.get(safeCacheKey);
    if (!rawEntry) return null;

    const normalizedEntry = normalizeTaggedAccountsCacheEntry(rawEntry);
    if (!normalizedEntry) {
      postTaggedAccountsCache.delete(safeCacheKey);
      return null;
    }

    const now = Date.now();
    const isExpired = now - normalizedEntry.updatedAt > getPostTagCacheTtlMs();
    if (isExpired) {
      postTaggedAccountsCache.delete(safeCacheKey);
      return null;
    }

    if (shouldTouch) {
      normalizedEntry.lastAccessedAt = now;
    }

    if (normalizedEntry !== rawEntry || shouldTouch) {
      postTaggedAccountsCache.set(safeCacheKey, normalizedEntry);
    }

    return normalizedEntry;
  }

  function setTaggedAccountsCacheEntry(cacheKey, accounts) {
    const safeCacheKey = (cacheKey || "").toString().trim();
    if (!safeCacheKey) return;

    const normalizedAccounts = normalizePostTaggedAccountList(accounts);
    if (normalizedAccounts.length <= 0) {
      postTaggedAccountsCache.delete(safeCacheKey);
      return;
    }

    cleanupExpiredTaggedAccountsCache();

    const now = Date.now();
    postTaggedAccountsCache.set(safeCacheKey, {
      accounts: normalizedAccounts,
      updatedAt: now,
      lastAccessedAt: now,
    });
    trimTaggedAccountsCacheToLimit();
  }

  function cacheTaggedAccounts(source, accounts) {
    const cacheKey = resolveTaggedAccountsCacheKey(source);
    if (!cacheKey) return;
    setTaggedAccountsCacheEntry(cacheKey, accounts);
  }

  function getCachedTaggedAccounts(source) {
    const cacheKey = resolveTaggedAccountsCacheKey(source);
    if (!cacheKey) return [];
    const cacheEntry = getTaggedAccountsCacheEntry(cacheKey);
    if (!Array.isArray(cacheEntry?.accounts)) return [];
    return cacheEntry.accounts.map((item) => ({ ...item }));
  }

  function sortTaggedAccountsBySystemPriority(accounts) {
    const currentViewerId = getCurrentViewerId();

    return (Array.isArray(accounts) ? [...accounts] : [])
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftId = normalizeAccountId(left.item?.accountId);
        const rightId = normalizeAccountId(right.item?.accountId);
        const leftIsCurrent = !!currentViewerId && leftId === currentViewerId;
        const rightIsCurrent = !!currentViewerId && rightId === currentViewerId;

        // priority 1: current viewer account (if tagged) appears first
        if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;

        const leftIsFollowing = Boolean(left.item?.isFollowing);
        const rightIsFollowing = Boolean(right.item?.isFollowing);
        if (leftIsFollowing !== rightIsFollowing) {
          return leftIsFollowing ? -1 : 1;
        }

        const leftIsFollower = Boolean(left.item?.isFollower);
        const rightIsFollower = Boolean(right.item?.isFollower);
        if (leftIsFollower !== rightIsFollower) {
          return leftIsFollower ? -1 : 1;
        }

        // fallback: keep server order
        return left.index - right.index;
      })
      .map((entry) => entry.item);
  }

  function getTaggedAccountProfileTarget(account) {
    const username = PostUtils.getPostTagUsername(account);
    return username || (account?.accountId || "").toString().trim();
  }

  function navigateToProfileTarget(profileTarget) {
    const safeTarget = (profileTarget || "").toString().trim();
    if (!safeTarget) return;

    if (window.RouteHelper?.buildProfilePath && window.RouteHelper?.goTo) {
      const path = window.RouteHelper.buildProfilePath(safeTarget);
      window.RouteHelper.goTo(path);
      return;
    }

    window.location.hash = `#/${encodeURIComponent(safeTarget)}`;
  }

  function openTaggedAccountProfile(account) {
    const target = getTaggedAccountProfileTarget(account);
    if (!target) return;
    if (typeof window.closeAllOverlayModals === "function") {
      window.closeAllOverlayModals();
    } else {
      closeTaggedAccountsModal();
    }
    navigateToProfileTarget(target);
  }

  function getModalElement() {
    return document.getElementById(postTaggedAccountsModalState.modalId);
  }

  function getModalListElement() {
    return document.getElementById(postTaggedAccountsModalState.listId);
  }

  function getModalLoaderElement() {
    return document.getElementById(postTaggedAccountsModalState.loaderId);
  }

  function ensureTaggedAccountsModalHtml() {
    let modal = getModalElement();
    if (modal) return modal;

    const html = `
      <div id="${postTaggedAccountsModalState.modalId}" class="interaction-modal tagged-accounts-modal">
        <div class="modal-backdrop" onclick="PostUtils.closePostTaggedAccountsModal()"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3>Tagged People</h3>
            <button class="close-btn" onclick="PostUtils.closePostTaggedAccountsModal()">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div id="${postTaggedAccountsModalState.listId}" class="interaction-list custom-scrollbar"></div>
          <div id="${postTaggedAccountsModalState.loaderId}" class="interaction-loader" style="display: none;">
            <div class="loader-spinner"></div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);
    modal = getModalElement();
    if (window.lucide) window.lucide.createIcons();
    return modal;
  }

  function setTaggedAccountsModalLoading(isLoading) {
    const loader = getModalLoaderElement();
    if (!loader) return;
    loader.style.display = isLoading ? "flex" : "none";
  }

  function renderTaggedAccountsModalList(accounts) {
    const listEl = getModalListElement();
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!Array.isArray(accounts) || accounts.length <= 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "empty-list-msg";
      emptyEl.textContent = "No tagged accounts";
      listEl.appendChild(emptyEl);
      return;
    }

    const currentViewerId = getCurrentViewerId();

    accounts.forEach((account) => {
      const row = document.createElement("div");
      row.className = "interaction-item tagged-account-item";

      const userInfo = document.createElement("div");
      userInfo.className = "user-info post-user";
      userInfo.dataset.accountId = account.accountId || "";
      userInfo.addEventListener("click", (event) => {
        event.stopPropagation();
        openTaggedAccountProfile(account);
      });

      const avatarEl = document.createElement("img");
      avatarEl.className = "avatar post-avatar";
      avatarEl.src = account.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
      avatarEl.alt = "";

      const nameBox = document.createElement("div");
      nameBox.className = "name-box";

      const primaryNameEl = document.createElement("span");
      primaryNameEl.className = "fullname post-username";
      const primaryName = (
        account.username ||
        PostUtils.getPostTagUsername(account) ||
        account.fullName ||
        PostUtils.getAccountPrimaryName(account)
      )
        .toString()
        .trim();
      primaryNameEl.textContent = PostUtils.truncateName(primaryName);

      const secondaryNameValue = (account.fullName || "").toString().trim();

      nameBox.appendChild(primaryNameEl);
      if (secondaryNameValue) {
        const secondaryNameEl = document.createElement("span");
        secondaryNameEl.className = "username-subtext";
        secondaryNameEl.textContent = secondaryNameValue;
        nameBox.appendChild(secondaryNameEl);
      }

      if (account.isFollower) {
        const followerTagEl = document.createElement("span");
        followerTagEl.className = "follower-tag";
        followerTagEl.textContent = "Follows you";
        nameBox.appendChild(followerTagEl);
      }

      userInfo.appendChild(avatarEl);
      userInfo.appendChild(nameBox);

      const actionBox = document.createElement("div");
      actionBox.className = "action-box";

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      const accountId = normalizeAccountId(account.accountId);
      const isCurrentViewer =
        !!currentViewerId && accountId === currentViewerId;

      if (isCurrentViewer) {
        actionBtn.className = "follow-btn view-profile-btn";
        actionBtn.innerHTML = `
          <i data-lucide="user"></i>
          <span>View Profile</span>
        `;
        actionBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openTaggedAccountProfile(account);
        });
      } else if (account.isFollowing) {
        actionBtn.className = "follow-btn following";
        actionBtn.innerHTML = `
          <i data-lucide="check"></i>
          <span>Following</span>
        `;
        actionBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          handleTaggedAccountFollow(account.accountId, actionBtn);
        });
      } else {
        actionBtn.className = "follow-btn";
        actionBtn.innerHTML = `
          <i data-lucide="user-plus"></i>
          <span>Follow</span>
        `;
        actionBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          handleTaggedAccountFollow(account.accountId, actionBtn);
        });
      }

      actionBox.appendChild(actionBtn);
      row.appendChild(userInfo);
      row.appendChild(actionBox);
      listEl.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons({ container: listEl });
  }

  function handleTaggedAccountFollow(accountId, actionBtn) {
    const targetId = (accountId || "").toString().trim();
    if (!targetId || !actionBtn || !window.FollowModule) return;

    const isFollowing = actionBtn.classList.contains("following");
    if (isFollowing) {
      window.FollowModule.showUnfollowConfirm(targetId, actionBtn);
      return;
    }

    window.FollowModule.followUser(targetId, actionBtn);
  }

  function showTaggedAccountsModal() {
    const modal = ensureTaggedAccountsModalHtml();
    if (!modal) return;

    const mainContentEl = document.querySelector(".main-content");
    const wasScrollLocked =
      !!mainContentEl && mainContentEl.style.overflowY === "hidden";

    modal.classList.add("show");
    postTaggedAccountsModalState.didLockScroll = !wasScrollLocked;
    if (!wasScrollLocked && typeof window.lockScroll === "function") {
      window.lockScroll();
    }
  }

  function closeTaggedAccountsModal() {
    const modal = getModalElement();
    if (!modal) return;

    syncTaggedAccountsModalStateBack();
    modal.classList.remove("show");
    if (
      postTaggedAccountsModalState.didLockScroll &&
      typeof window.unlockScroll === "function"
    ) {
      window.unlockScroll();
    }
    postTaggedAccountsModalState.didLockScroll = false;
    postTaggedAccountsModalState.currentPostId = "";
    postTaggedAccountsModalState.currentPostCode = "";
  }

  function syncTaggedSummaryToPostElements(
    postId,
    postCode,
    taggedAccounts,
    fallbackTotal = null,
  ) {
    const normalizedPostId = (postId || "").toString().trim();
    const normalizedPostCode = (postCode || "").toString().trim();
    if (!normalizedPostId && !normalizedPostCode) return;

    const normalizedAccounts = sortTaggedAccountsBySystemPriority(
      normalizePostTaggedAccountList(taggedAccounts),
    );
    if (normalizedAccounts.length <= 0) return;

    const previewAccounts = normalizedAccounts.slice(
      0,
      getPostTagPreviewLimit(),
    );

    const applyToSummary = (summaryEl) => {
      if (!summaryEl) return;
      const summaryContext = postTagSummaryContextMap.get(summaryEl);
      if (!summaryContext || !summaryContext.source) return;

      const source = summaryContext.source;
      const sourcePostId = (source?.postId || source?.PostId || "")
        .toString()
        .trim();
      const sourcePostCode = (source?.postCode || source?.PostCode || "")
        .toString()
        .trim();

      const matchedByPostId =
        !!normalizedPostId &&
        !!sourcePostId &&
        sourcePostId === normalizedPostId;
      const matchedByPostCode =
        !!normalizedPostCode &&
        !!sourcePostCode &&
        sourcePostCode === normalizedPostCode;

      if (!matchedByPostId && !matchedByPostCode) return;

      const numericFallbackTotal = Number(fallbackTotal);
      const sourceTotal = Number(
        source?.totalTaggedAccounts ?? source?.TotalTaggedAccounts,
      );
      const contextTotal = Number(summaryContext?.total);

      let totalTaggedAccounts = Number.isFinite(numericFallbackTotal)
        ? numericFallbackTotal
        : normalizedAccounts.length;
      if (!Number.isFinite(totalTaggedAccounts) || totalTaggedAccounts < 0) {
        totalTaggedAccounts = Number.isFinite(sourceTotal)
          ? sourceTotal
          : contextTotal;
      }
      if (!Number.isFinite(totalTaggedAccounts) || totalTaggedAccounts < 0) {
        totalTaggedAccounts = normalizedAccounts.length;
      }

      const mergedSource = {
        ...source,
        postId: normalizedPostId || sourcePostId,
        postCode: normalizedPostCode || sourcePostCode,
        taggedAccountsPreview: previewAccounts,
        totalTaggedAccounts,
      };

      if (Array.isArray(source?.taggedAccounts)) {
        mergedSource.taggedAccounts = normalizedAccounts;
      }
      if (Array.isArray(source?.TaggedAccounts)) {
        mergedSource.TaggedAccounts = normalizedAccounts;
      }

      PostUtils.applyPostTagSummary(summaryEl, mergedSource);
    };

    if (normalizedPostId) {
      const feedSummaryEls = document.querySelectorAll(
        `.post[data-post-id="${normalizedPostId}"] .post-tag-summary`,
      );
      feedSummaryEls.forEach((el) => applyToSummary(el));
    }

    const detailSummaryEl = document.getElementById("detailTaggedSummary");
    if (detailSummaryEl) {
      applyToSummary(detailSummaryEl);
    }
  }

  function syncTaggedAccountsModalStateBack() {
    const listEl = getModalListElement();
    if (!listEl) return;

    const currentPostId = (postTaggedAccountsModalState.currentPostId || "")
      .toString()
      .trim();
    const currentPostCode = (postTaggedAccountsModalState.currentPostCode || "")
      .toString()
      .trim();

    if (!currentPostId && !currentPostCode) {
      return;
    }

    const cacheKey = currentPostId
      ? currentPostId
      : currentPostCode
        ? `code:${currentPostCode}`
        : "";
    if (!cacheKey) return;

    const cacheEntry = getTaggedAccountsCacheEntry(cacheKey, { touch: false });
    const cachedList = Array.isArray(cacheEntry?.accounts)
      ? cacheEntry.accounts
      : [];
    if (cachedList.length <= 0) {
      return;
    }

    const followStateMap = new Map();
    const rows = listEl.querySelectorAll(
      ".interaction-item .user-info[data-account-id]",
    );
    rows.forEach((userInfoEl) => {
      const accountId = (userInfoEl.dataset.accountId || "").toString().trim();
      if (!accountId) return;
      const actionBox = userInfoEl.nextElementSibling;
      const btn = actionBox?.querySelector(".follow-btn");
      if (!btn || btn.classList.contains("view-profile-btn")) return;
      followStateMap.set(
        normalizeAccountId(accountId),
        btn.classList.contains("following"),
      );
    });

    let updatedList = cachedList;
    if (followStateMap.size > 0) {
      updatedList = cachedList.map((item) => {
        const normalizedId = normalizeAccountId(item?.accountId);
        if (!normalizedId || !followStateMap.has(normalizedId)) return item;
        return {
          ...item,
          isFollowing: followStateMap.get(normalizedId) === true,
        };
      });
      setTaggedAccountsCacheEntry(cacheKey, updatedList);
    }

    syncTaggedSummaryToPostElements(
      currentPostId,
      currentPostCode,
      updatedList,
      updatedList.length,
    );
  }

  async function fetchFullTaggedAccountsForPost(source) {
    const postId = (source?.postId || source?.PostId || "").toString().trim();
    const cached = getCachedTaggedAccounts(source);

    if (!postId) {
      return cached;
    }

    let response = null;
    if (postId && window.API?.Posts?.getTaggedAccounts) {
      response = await window.API.Posts.getTaggedAccounts(postId);
    }

    if (!response || !response.ok) {
      if (response?.status === 404 || response?.status === 403) {
        throw new Error("TAGGED_ACCOUNTS_UNAVAILABLE");
      }
      if (cached.length > 0) {
        return cached;
      }
      throw new Error("TAGGED_ACCOUNTS_LOAD_FAILED");
    }

    const data = await response.json();
    const taggedAccounts = normalizePostTaggedAccountList(
      Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.Items)
          ? data.Items
          : Array.isArray(data?.taggedAccounts)
            ? data.taggedAccounts
            : Array.isArray(data?.TaggedAccounts)
              ? data.TaggedAccounts
              : [],
    );
    cacheTaggedAccounts(source, taggedAccounts);
    return taggedAccounts;
  }

  /**
   * Build HTML link for a tagged account name
   * @param {object} account
   * @param {number} totalTaggedCount
   * @param {boolean} shouldTruncate
   * @returns {string}
   */
  PostUtils.buildPostTagNameLink = function (
    account,
    totalTaggedCount = 1,
    shouldTruncate = true,
  ) {
    const displayName = PostUtils.getPostTagDisplayName(
      account,
      totalTaggedCount,
      shouldTruncate,
    );
    const username = PostUtils.getPostTagUsername(account);
    const accountId = (
      account?.accountId ||
      account?.AccountId ||
      account?.id ||
      ""
    )
      .toString()
      .trim();
    const avatarUrl =
      account?.avatarUrl ||
      account?.AvatarUrl ||
      window.APP_CONFIG?.DEFAULT_AVATAR ||
      "";

    const safeDisplayName = puEscapeHtml(displayName);
    const safeAccountId = puEscapeHtmlAttr(accountId);
    const safeAvatarUrl = puEscapeHtmlAttr(avatarUrl);
    const avatarHtml = `<img class="post-tag-avatar" src="${safeAvatarUrl}" alt="">`;
    const contentHtml = `${avatarHtml}<span class="post-tag-name-text">${safeDisplayName}</span>`;
    const accountIdAttr = safeAccountId
      ? ` data-account-id="${safeAccountId}"`
      : "";

    if (!username) {
      return `<span class="post-tag-name"${accountIdAttr}>${contentHtml}</span>`;
    }

    const profileHash = PostUtils.buildProfileHash(username);
    return `<a class="post-tag-name" href="${puEscapeHtmlAttr(profileHash)}"${accountIdAttr} onclick="event.stopPropagation()">${contentHtml}</a>`;
  };

  /**
   * Build compact tag summary html for post header
   * @param {object} source
   * @param {{mode?: "default" | "compact" | "minimal"}} options
   * @returns {{html: string, title: string, total: number}|null}
   */
  PostUtils.buildPostTagSummary = function (source, options = {}) {
    const normalized = PostUtils.normalizePostTaggedAccounts(source);
    if (!normalized || normalized.total <= 0) return null;

    const mode = options?.mode || "default";
    const firstAccount = normalized.accounts[0] || null;
    const secondAccount = normalized.accounts[1] || null;
    const total = normalized.total;
    const firstNameDisplay = PostUtils.getPostTagDisplayName(
      firstAccount,
      total,
      true,
    );
    const firstNameFull = PostUtils.getPostTagDisplayName(
      firstAccount,
      total,
      false,
    );
    const summaryMaxLen = window.APP_CONFIG?.POST_TAG_SUMMARY_MAX_LENGTH || 48;
    const firstLinkHtml = PostUtils.buildPostTagNameLink(
      firstAccount,
      total,
      true,
    );
    let summaryHtml = "";
    let summaryTitle = "";
    const buildOthersTriggerHtml = (label) => {
      const safeLabel = puEscapeHtml(label || "");
      return `<button type="button" class="post-tag-others post-tag-others-trigger" onclick="event.stopPropagation(); window.PostUtils?.openPostTaggedAccountsModalFromSummary(this)"><span class="post-tag-others-label">${safeLabel}</span></button>`;
    };

    if (total === 1) {
      summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml}`;
      summaryTitle = `with ${firstNameFull}`;
    } else if (total === 2) {
      if (mode === "minimal" || mode === "compact") {
        summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml("1 other")}`;
        summaryTitle = `with ${firstNameFull} and 1 other`;
      } else if (!secondAccount) {
        summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml("1 other")}`;
        summaryTitle = `with ${firstNameFull} and 1 other`;
      } else {
        const secondNameFull = PostUtils.getPostTagDisplayName(
          secondAccount,
          total,
          false,
        );
        const secondNameDisplay = PostUtils.getPostTagDisplayName(
          secondAccount,
          total,
          true,
        );
        const secondLinkHtml = PostUtils.buildPostTagNameLink(
          secondAccount,
          total,
          true,
        );
        let summaryText = `with ${firstNameDisplay} and ${secondNameDisplay}`;
        summaryTitle = `with ${firstNameFull} and ${secondNameFull}`;

        // Fallback when 2 long names still exceed header budget
        if (summaryText.length > summaryMaxLen) {
          summaryText = `with ${firstNameDisplay} and 1 other`;
          summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml("1 other")}`;
        } else {
          summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${secondLinkHtml}`;
        }
      }
    } else {
      const otherCount = total - 1;
      const otherLabel = otherCount === 1 ? "other" : "others";
      const summaryText = `with ${firstNameDisplay} and ${otherCount} ${otherLabel}`;

      if (mode === "minimal" || mode === "compact") {
        summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml(`${otherCount} ${otherLabel}`)}`;
        summaryTitle = `with ${firstNameFull} and ${otherCount} ${otherLabel}`;
      } else {
        summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml(`${otherCount} ${otherLabel}`)}`;
        summaryTitle = `with ${firstNameFull} and ${otherCount} ${otherLabel}`;

        // Extra safeguard for very small widths: if text still too long, keep compact wording.
        if (summaryText.length > summaryMaxLen && otherCount > 1) {
          summaryHtml = `<span class="post-tag-prefix">with</span> ${firstLinkHtml} <span class="post-tag-prefix">and</span> ${buildOthersTriggerHtml(`${otherCount} ${otherLabel}`)}`;
          summaryTitle = `with ${firstNameFull} and ${otherCount} others`;
        }
      }
    }

    return {
      html: summaryHtml,
      title: summaryTitle,
      total,
    };
  };

  /**
   * Apply tag summary to target element
   * @param {HTMLElement} element
   * @param {object} source
   */
  PostUtils.applyPostTagSummary = function (element, source) {
    if (!element) return;

    const postUserEl = element.closest(".post-user");
    const tagRowEl = element.closest(".user-tag-row");
    const isFeedHeader = !!element.closest(".post");

    const setFeedStackedMode = (enabled) => {
      if (!isFeedHeader || !postUserEl) return;
      postUserEl.classList.toggle("stacked-tag-summary", !!enabled);
    };

    const isOwnerNameOverflowing = () => {
      if (!postUserEl) return false;
      const ownerNameEl = postUserEl.querySelector(
        ".post-name-row .post-username, .post-name-row .username",
      );
      if (!ownerNameEl) return false;
      return ownerNameEl.scrollWidth > ownerNameEl.clientWidth + 1;
    };

    const renderSummary = (mode = "default") => {
      const summary = PostUtils.buildPostTagSummary(source, { mode });
      if (!summary) {
        element.innerHTML = "";
        element.classList.add("hidden");
        if (tagRowEl) {
          tagRowEl.classList.add("hidden");
        }
        if (postUserEl) {
          postUserEl.classList.remove("has-tag-summary");
        }
        setFeedStackedMode(false);
        postTagSummaryContextMap.delete(element);
        return null;
      }

      if (tagRowEl) {
        tagRowEl.classList.remove("hidden");
      }
      element.innerHTML = summary.html;
      element.classList.remove("hidden");
      element.dataset.totalTaggedAccounts = summary.total.toString();
      postTagSummaryContextMap.set(element, {
        source,
        total: summary.total,
      });
      const normalizedSource = PostUtils.normalizePostTaggedAccounts(source);
      if (
        normalizedSource.total > 0 &&
        normalizedSource.accounts.length >= normalizedSource.total
      ) {
        cacheTaggedAccounts(source, normalizedSource.accounts);
      }
      if (postUserEl) {
        postUserEl.classList.add("has-tag-summary");
      }
      return summary;
    };

    const hasOverflow = () => {
      if (!element || element.classList.contains("hidden")) return false;
      return element.scrollWidth > element.clientWidth + 1;
    };

    const applyOverflowFallback = () => {
      setFeedStackedMode(false);
      let appliedMode = "default";
      const renderAndTrack = (mode) => {
        appliedMode = mode;
        return renderSummary(mode);
      };

      const summary = renderAndTrack("default");
      if (!summary) return;

      // Feed header is single-line and narrow in some cases (long owner + follow button).
      // Degrade gracefully to avoid ugly "and ..." truncation.
      if (hasOverflow()) {
        renderAndTrack("compact");
        if (hasOverflow()) {
          renderAndTrack("minimal");
        }
      }

      // Smart switch: keep 2-line when readable, move to 3-line only when cramped.
      const shouldSwitchToStacked =
        isFeedHeader &&
        (hasOverflow() ||
          (summary.total > 1 &&
            appliedMode !== "default" &&
            isOwnerNameOverflowing()));

      if (shouldSwitchToStacked) {
        setFeedStackedMode(true);
        renderAndTrack("default");
        if (hasOverflow()) {
          renderAndTrack("compact");
          if (hasOverflow()) {
            renderAndTrack("minimal");
          }
        }
      }
    };

    const scheduleOverflowFallback = () => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          applyOverflowFallback();
          requestAnimationFrame(() => {
            applyOverflowFallback();
          });
        });
        return;
      }
      setTimeout(() => {
        applyOverflowFallback();
      }, 0);
    };

    applyOverflowFallback();

    // createPostElement() applies summary before appending into DOM.
    // Re-check after layout is committed to ensure overflow fallback is accurate.
    if (!element.isConnected || isFeedHeader) {
      scheduleOverflowFallback();
    }
  };

  function resolveSummaryContextFromTrigger(triggerElement) {
    if (!triggerElement || typeof triggerElement.closest !== "function") {
      return null;
    }
    const summaryElement = triggerElement.closest(".post-tag-summary");
    if (!summaryElement) return null;
    return postTagSummaryContextMap.get(summaryElement) || null;
  }

  async function resolveTaggedAccountsForSummaryContext(summaryContext) {
    const source = summaryContext?.source || {};
    const normalized = PostUtils.normalizePostTaggedAccounts(source);
    const previewAccounts = normalizePostTaggedAccountList(normalized.accounts);
    const hasFullAccounts = previewAccounts.length >= normalized.total;

    try {
      const fetchedAccounts = await fetchFullTaggedAccountsForPost(source);
      if (fetchedAccounts.length > 0) {
        return sortTaggedAccountsBySystemPriority(fetchedAccounts);
      }
    } catch (error) {
      if ((error?.message || "") === "TAGGED_ACCOUNTS_UNAVAILABLE") {
        throw error;
      }

      const cachedAccounts = getCachedTaggedAccounts(source);
      if (cachedAccounts.length > 0) {
        return sortTaggedAccountsBySystemPriority(cachedAccounts);
      }

      if (previewAccounts.length > 0) {
        cacheTaggedAccounts(source, previewAccounts);
        return sortTaggedAccountsBySystemPriority(previewAccounts);
      }

      throw error;
    }

    if (hasFullAccounts) {
      cacheTaggedAccounts(source, previewAccounts);
      return sortTaggedAccountsBySystemPriority(previewAccounts);
    }

    const cachedAccounts = getCachedTaggedAccounts(source);
    const mergedAccounts =
      cachedAccounts.length > 0 ? cachedAccounts : previewAccounts;
    return sortTaggedAccountsBySystemPriority(mergedAccounts);
  }

  PostUtils.openPostTaggedAccountsModalFromSummary = async function (
    triggerElement,
  ) {
    const summaryContext = resolveSummaryContextFromTrigger(triggerElement);
    if (!summaryContext || !summaryContext.source) return;

    const source = summaryContext.source;
    const normalized = PostUtils.normalizePostTaggedAccounts(source);

    if (!normalized.total || normalized.total <= 0) {
      if (window.toastInfo) window.toastInfo("No tagged accounts");
      return;
    }

    postTaggedAccountsModalState.currentPostId = (
      source?.postId ||
      source?.PostId ||
      ""
    )
      .toString()
      .trim();
    postTaggedAccountsModalState.currentPostCode = (
      source?.postCode ||
      source?.PostCode ||
      ""
    )
      .toString()
      .trim();

    ensureTaggedAccountsModalHtml();
    const listEl = getModalListElement();
    if (listEl) listEl.innerHTML = "";
    showTaggedAccountsModal();
    setTaggedAccountsModalLoading(true);

    try {
      const accounts =
        await resolveTaggedAccountsForSummaryContext(summaryContext);
      renderTaggedAccountsModalList(accounts);
      syncTaggedSummaryToPostElements(
        postTaggedAccountsModalState.currentPostId,
        postTaggedAccountsModalState.currentPostCode,
        accounts,
        accounts.length,
      );
    } catch (error) {
      const fallbackAccounts = sortTaggedAccountsBySystemPriority(
        normalizePostTaggedAccountList(normalized.accounts),
      );
      if ((error?.message || "") === "TAGGED_ACCOUNTS_UNAVAILABLE") {
        if (window.toastInfo) {
          window.toastInfo("This tagged list is no longer available.");
        }
      } else if (window.toastError) {
        window.toastError("Could not load tagged accounts list.");
      }
      renderTaggedAccountsModalList(fallbackAccounts);
      syncTaggedSummaryToPostElements(
        postTaggedAccountsModalState.currentPostId,
        postTaggedAccountsModalState.currentPostCode,
        fallbackAccounts,
        normalized.total,
      );
    } finally {
      setTaggedAccountsModalLoading(false);
    }
  };

  PostUtils.closePostTaggedAccountsModal = function () {
    closeTaggedAccountsModal();
  };

  /**
   * Format full date for tooltip
   * @param {string} dateStr
   * @returns {string} Formatted date (e.g. "February 2, 2026, 09:07 PM")
   */
  PostUtils.formatFullDateTime = function (dateStr) {
    const date = new Date(dateStr);
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return date.toLocaleString("en-US", options);
  };

  /**
   * Format time for chat separators (e.g. "13:58 Today", "Mon 09:30")
   * @param {string|Date} dateVal
   */
  PostUtils.formatChatSeparatorTime = function (dateVal) {
    const date = new Date(dateVal);
    const now = new Date();
    const pad = (num) => num.toString().padStart(2, "0");

    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (isToday) {
      return `${HH}:${mm}`;
    }

    if (isYesterday) {
      return `${HH}:${mm} Yesterday`;
    }

    if (diffInDays < 7) {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `${HH}:${mm} ${days[date.getDay()]}`;
    }

    const DD = pad(date.getDate());
    const MM = pad(date.getMonth() + 1);
    const YY = date.getFullYear().toString().slice(-2);

    return `${HH}:${mm} ${DD}/${MM}/${YY}`;
  };

  /**
   * Setup caption truncation with more/less toggle
   * @param {HTMLElement} el - The caption text element
   * @param {string} fullContent - Full caption text
   * @param {number} maxLen - Max length before truncation (default 150)
   */
  PostUtils.setupCaption = function (
    el,
    fullContent,
    maxLen = APP_CONFIG.CAPTION_TRUNCATE_LENGTH,
  ) {
    if (!fullContent) {
      el.textContent = "";
      return;
    }

    el.dataset.fullContent = fullContent;

    if (fullContent.length <= maxLen) {
      el.textContent = fullContent;
      return;
    }

    const truncatedContent = fullContent.substring(0, maxLen) + "...";

    // Clear and create text node for caption text
    el.innerHTML = "";
    const textNode = document.createTextNode(truncatedContent);
    el.appendChild(textNode);

    // Create Toggle Btn (No <br> needed, handled by CSS)

    // Create Toggle Btn
    const btn = document.createElement("span");
    btn.className = "caption-toggle";
    btn.textContent = "more";

    btn.onclick = (e) => {
      e.stopPropagation(); // prevent post click
      const isMore = btn.textContent === "more";
      if (isMore) {
        textNode.textContent = fullContent;
        btn.textContent = "less";
      } else {
        textNode.textContent = truncatedContent;
        btn.textContent = "more";
      }
    };

    el.appendChild(btn);
  };

  /**
   * Get privacy icon name
   * @param {number} privacy - 0: Public, 1: FollowOnly, 2: Private
   */
  PostUtils.getPrivacyIconName = function (privacy) {
    switch (privacy) {
      case 0:
        return "globe";
      case 1:
        return "users";
      case 2:
        return "lock";
      default:
        return "globe";
    }
  };

  /**
   * Get privacy label
   * @param {number} privacy
   */
  PostUtils.getPrivacyLabel = function (privacy) {
    switch (privacy) {
      case 0:
        return "Public";
      case 1:
        return "Followers";
      case 2:
        return "Private";
      default:
        return "Public";
    }
  };

  /**
   * Render privacy badge HTML (Read-only version of privacy-selector)
   * @param {number} privacy
   */
  PostUtils.renderPrivacyBadge = function (privacy) {
    const icon = PostUtils.getPrivacyIconName(privacy);
    const label = PostUtils.getPrivacyLabel(privacy);
    // Reuse .privacy-selector style but remove interactive elements/cursor
    // Added styling to make it look good in post header context (e.g. smaller, inline)
    return `
            <div class="privacy-selector" style="cursor: pointer; padding: 2px 0px; background: transparent; border: none; gap: 4px;" title="${label}">
                <i data-lucide="${icon}" class="privacy-icon" style="width: 14px; height: 14px; color: var(--text-tertiary);"></i>
            </div>
        `;
  };

  /**
   * Sync post data from detail view back to feed/list view
   * @param {string} postId
   * @param {number|string} reactCount
   * @param {boolean} isReacted
   * @param {number|string} commentCount
   * @param {string} [content] - Optional, to update caption
   * @param {number} [privacy] - Optional, to update privacy badge
   * @param {Array|object} [taggedAccounts] - Optional, to update tag summary
   */
  PostUtils.syncPostFromDetail = function (
    postId,
    reactCount,
    isReacted,
    commentCount,
    createdAt,
    content,
    privacy,
    taggedAccounts,
  ) {
    // 1. Sync for Newsfeed (.post elements)
    const postEl = document.querySelector(`.post[data-post-id="${postId}"]`);
    if (postEl) {
      // Special case: If explicitly passed 'remove' or triggered by forbidden action
      if (reactCount === "remove") {
        PostUtils.hidePost(postId);
        return;
      }

      // Update React Button
      if (reactCount !== undefined && isReacted !== undefined) {
        const reactBtn = postEl.querySelector(`.react-btn`);
        if (reactBtn) {
          reactBtn.dataset.reacted = isReacted.toString();
          const icon = reactBtn.querySelector(".react-icon");
          const countEl = reactBtn.querySelector(".count");
          if (icon) icon.classList.toggle("reacted", isReacted);
          if (countEl) countEl.textContent = reactCount;
        }
      }

      // Update Comment Button
      if (commentCount !== undefined) {
        // Relaxed selector to match openPostDetail('ID') OR openPostDetail('ID', 'CODE')
        const commentBtn = postEl.querySelector(
          `div.action-item[onclick*="openPostDetail('${postId}'"]`,
        );
        if (commentBtn) {
          const countEl = commentBtn.querySelector(".count");
          if (countEl) countEl.textContent = commentCount;
        }
      }

      // Update Time Ago
      if (createdAt) {
        const timeEl = postEl.querySelector(".post-time");
        if (timeEl) {
          timeEl.textContent = PostUtils.timeAgo(createdAt);
          timeEl.title = PostUtils.formatFullDateTime(createdAt);
        }
      }

      // Update Content/Caption
      if (content !== undefined) {
        const captionEl = postEl.querySelector(".post-caption");
        if (captionEl) {
          if (!content || content.trim().length === 0) {
            captionEl.style.display = "none";
            captionEl.textContent = "";
            delete captionEl.dataset.fullContent;
          } else {
            captionEl.style.display = "block";
            PostUtils.setupCaption(captionEl, content);
          }
        }
      }

      // Update Privacy Badge
      if (privacy !== undefined) {
        const metaContainer = postEl.querySelector(".post-meta");
        if (metaContainer) {
          const timeStr = postEl.querySelector(".post-time")?.outerHTML || "";
          const dot = `<span>•</span>`;
          const privacyBadge = PostUtils.renderPrivacyBadge(privacy);
          metaContainer.innerHTML = `${timeStr} ${dot} ${privacyBadge}`;
          if (window.lucide) lucide.createIcons();
        }
      }

      if (taggedAccounts !== undefined) {
        const summaryEl = postEl.querySelector(".post-tag-summary");
        if (summaryEl) {
          const currentSummaryContext = postTagSummaryContextMap.get(summaryEl);
          const previousSource =
            currentSummaryContext && currentSummaryContext.source
              ? currentSummaryContext.source
              : {};
          const incomingSource = Array.isArray(taggedAccounts)
            ? {
                taggedAccountsPreview: taggedAccounts,
                totalTaggedAccounts: taggedAccounts.length,
              }
            : taggedAccounts;
          const normalizedIncomingSource =
            incomingSource && typeof incomingSource === "object"
              ? incomingSource
              : {};
          const resolvedPostId = (
            normalizedIncomingSource.postId ||
            normalizedIncomingSource.PostId ||
            previousSource.postId ||
            previousSource.PostId ||
            postId ||
            ""
          )
            .toString()
            .trim();
          const resolvedPostCode = (
            normalizedIncomingSource.postCode ||
            normalizedIncomingSource.PostCode ||
            previousSource.postCode ||
            previousSource.PostCode ||
            ""
          )
            .toString()
            .trim();
          const normalizedSource = {
            ...previousSource,
            ...normalizedIncomingSource,
            postId: resolvedPostId,
            postCode: resolvedPostCode,
          };
          PostUtils.applyPostTagSummary(summaryEl, normalizedSource);
        }
      }
    }

    // 2. Sync for Profile Grid (.profile-grid-item elements)
    const profileItem = document.querySelector(
      `.profile-grid-item[data-post-id="${postId}"]`,
    );
    if (profileItem) {
      if (reactCount === "remove") {
        profileItem.remove();
        return;
      }

      const stats = profileItem.querySelectorAll(".profile-overlay-stat span");
      if (stats.length >= 2) {
        if (reactCount !== undefined) stats[0].textContent = reactCount;
        if (commentCount !== undefined) stats[1].textContent = commentCount;
      }
    }
  };

  /**
   * Hide/Remove a post from the newsfeed or list
   * @param {string} postId
   */
  PostUtils.hidePost = function (postId) {
    // 1. Close modal if this post is currently open
    if (window.currentPostId === postId) {
      // Close modal without confirmation (forced close due to privacy)
      if (typeof window.forceClosePostDetail === "function") {
        window.forceClosePostDetail();
      } else {
        const modal = document.getElementById("postDetailModal");
        if (modal) {
          modal.classList.remove("show");
          if (window.unlockScroll) unlockScroll();
        }
      }
      if (window.toastInfo)
        window.toastInfo("This post is no longer available.");

      // Close interaction modal if open
      if (
        window.InteractionModule &&
        typeof window.InteractionModule.closeReactList === "function"
      ) {
        const interactModal = document.getElementById("interactionModal");
        if (interactModal && interactModal.classList.contains("show")) {
          window.InteractionModule.closeReactList();
        }
      }
    }

    // 2. Remove from Feed/List
    const postEl = document.querySelector(`.post[data-post-id="${postId}"]`);
    if (postEl) {
      // Soft removal with animation
      postEl.style.transition = "all 0.4s ease";
      postEl.style.opacity = "0";
      postEl.style.transform = "scale(0.95)";
      postEl.style.maxHeight = "0";
      postEl.style.margin = "0";
      postEl.style.padding = "0";
      postEl.style.pointerEvents = "none";
      setTimeout(() => postEl.remove(), 450);
    }

    // 3. Remove from Profile Grid
    const profileItem = document.querySelector(
      `.profile-grid-item[data-post-id="${postId}"]`,
    );
    if (profileItem) {
      profileItem.style.transition = "all 0.4s ease";
      profileItem.style.opacity = "0";
      profileItem.style.transform = "scale(0.8)";
      profileItem.style.pointerEvents = "none";
      setTimeout(() => profileItem.remove(), 450);
    }
  };

  /**
   * Animate number count (reuse for Reacts, Follows, etc.)
   * @param {HTMLElement} element
   * @param {number} targetValue
   * @param {number} duration
   */
  PostUtils.animateCount = function (element, targetValue, duration = 300) {
    if (!element) return;

    // Remove non-numeric characters (like 'K' or 'M' if exists later) for parsing, though we usually pass raw numbers
    const currentText = element.textContent.replace(/[^0-9]/g, "");
    const startValue = parseInt(currentText) || 0;
    const diff = targetValue - startValue;

    // If no change or invalid, just set text
    if (diff === 0 || isNaN(diff)) {
      element.textContent = targetValue;
      element.dataset.value = targetValue;
      return;
    }

    // Use dataset to store actual numeric value to prevent parsing errors during rapid updates
    element.dataset.value = targetValue;

    const startTime = performance.now();

    // Clear previous animation if exists
    if (element._animId) cancelAnimationFrame(element._animId);

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quart
      const ease = 1 - Math.pow(1 - progress, 4);

      const current = Math.round(startValue + diff * ease);
      element.textContent = current;

      if (progress < 1) {
        element._animId = requestAnimationFrame(update);
      } else {
        element.textContent = targetValue; // Ensure exact final value
      }
    }

    element._animId = requestAnimationFrame(update);
  };

  // Export to global scope
  global.PostUtils = PostUtils;
})(window);
