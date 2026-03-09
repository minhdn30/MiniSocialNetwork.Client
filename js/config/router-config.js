(function (global) {
  const PATHS = Object.freeze({
    ROOT: "/",
    HOME: "/",
    ERROR_404: "/404",
    SEARCH: "/search",
    EXPLORE: "/explore",
    REELS: "/reels",
    CHAT: "/chat",
    MESSAGES: "/messages",
    NOTIFICATIONS: "/notifications",
    POSTS: "/posts",
    STORIES: "/stories",
    STORY: "/story",
    ACCOUNT_SETTINGS: "/account-settings",
    SETTINGS_SEGMENT: "settings",
    PROFILE: "/profile",
    PROFILE_ME: "/me",
    PROFILE_USER_PREFIX: "/u",
  });

  const LEGACY = Object.freeze({
    HOME: "/home",
    PROFILE: "/profile",
    PROFILE_ME: "/me",
    PROFILE_USER_PREFIX: "/u",
    ACCOUNT_SETTINGS: "/account-settings",
    POST_PREFIX: "/p/",
    STORY_PREFIX: "/story/",
  });

  const SEGMENTS = Object.freeze({
    FOLLOWER: "follower",
    FOLLOWERS: "followers",
    FOLLOWING: "following",
    REELS: "reels",
    TAGGED: "tagged",
    SAVED: "saved",
    ARCHIVED_STORIES: "archived-stories",
    HIGHLIGHT: "highlight",
    HIGHLIGHTS: "highlights",
    STORY: "story",
    STORIES: "stories",
  });

  const REGEX = Object.freeze({
    USERNAME: /^[A-Za-z0-9._-]{1,64}$/,
    UUID:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  });

  global.RouteConfig = Object.freeze({
    PATHS,
    LEGACY,
    SEGMENTS,
    REGEX,
  });
})(window);
