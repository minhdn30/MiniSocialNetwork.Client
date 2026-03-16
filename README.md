# CloudM Client

<div align="center">
  <p>
    <img src="assets/images/favicon.png" alt="CloudM logo" width="120" />
  </p>
  <p><strong>A frontend project built to handle real social product behavior without relying on a heavy SPA framework.</strong></p>
  <p>
    CloudM is a social networking project inspired by Facebook and Instagram, with familiar features such as profiles, posts, comments, stories, realtime chat, notifications, follow relationships, search, and moderation.
  </p>
  <p>
    The client focuses on how those features actually behave in use: route-driven screens, responsive mobile flows, session recovery, realtime updates, language switching, dark and light mode, and consistent UI behavior across the app.
  </p>
  <p>
    <a href="https://www.cloudm.fun">Live frontend</a>
    ·
    <a href="https://api.cloudm.fun/swagger/index.html">Swagger</a>
    ·
    <a href="https://github.com/minhdn30/CloudM">Backend repository</a>
  </p>

  <p>
    <a href="https://developer.mozilla.org/docs/Web/JavaScript">
      <img src="https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black" alt="Vanilla JavaScript" />
    </a>
    <a href="https://developer.mozilla.org/docs/Web/HTML">
      <img src="https://img.shields.io/badge/HTML5-Structured-E34F26?logo=html5&logoColor=white" alt="HTML5" />
    </a>
    <a href="https://developer.mozilla.org/docs/Web/CSS">
      <img src="https://img.shields.io/badge/CSS3-Modular-1572B6?logo=css3&logoColor=white" alt="CSS3" />
    </a>
    <a href="https://learn.microsoft.com/aspnet/core/signalr/introduction">
      <img src="https://img.shields.io/badge/Realtime-SignalR-F47C20" alt="SignalR" />
    </a>
    <img src="https://img.shields.io/badge/Responsive-Mobile%20aware-0F766E" alt="Responsive mobile aware" />
  </p>
</div>

## Screenshots

<p align="center"><sub>Some key product screens from CloudM.</sub></p>

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/feed-overview.png" alt="CloudM feed overview" width="100%" />
    </td>
    <td align="center" width="50%">
      <img src="docs/images/post-detail.png" alt="CloudM post detail" width="100%" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/chat-realtime.png" alt="CloudM realtime chat" width="100%" />
    </td>
    <td align="center" width="50%">
      <img src="docs/images/profile-overview.png" alt="CloudM profile overview" width="100%" />
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="docs/images/create-post.png" alt="CloudM create post flow" width="72%" />
    </td>
  </tr>
</table>

## About This Project

- This repository contains the frontend for the live CloudM application, not just a static UI mockup.
- It is built with plain JavaScript, HTML, and CSS, but still organized around feature domains instead of one large script bundle.
- The app covers a broad product surface: feed, profile, stories, notifications, messaging, search, settings, and moderation-related screens.
- My goal with this project was to show that a vanilla frontend can still stay structured and reliable when the product starts to feel real.

## Product Logic Highlights

- The app uses a route-driven shell and partial page composition instead of relying on a framework runtime.
- Session handling is built around an auth store, refresh-token-aware API flow, and recovery logic when requests fail or tokens expire.
- Realtime behavior is part of the actual product experience, especially for chat, notifications, presence, and other social activity updates.
- Mobile behavior is not just squeezed desktop UI. The project includes dedicated responsive modules for sidebar, chat, post detail, profile, and shared overlays.
- The UI supports both English and Vietnamese through a real i18n layer instead of scattered hardcoded strings.
- Theme handling, toasts, loading states, media previews, and shared interaction patterns are treated as part of the system, not one-off page code.

## Core Experience

| Area                 | Highlights                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Authentication       | Sign in, sign up, forgot password, Google login, session recovery                           |
| Feed and Posts       | Feed rendering, post detail, comments, reactions, saves, tagging, create post flow          |
| Profile              | Profile page, follow flows, account settings, highlights, archived stories                  |
| Stories              | Story feed, viewer, story editor, highlight flows                                           |
| Messaging            | Private chat, group chat, reactions, pinned messages, floating chat windows, full chat page |
| Notifications        | Notification panel, unread state, follow requests, realtime updates                         |
| Shared UX            | Dark and light mode, i18n, responsive layout, loaders, toasts, media viewers                |
| Admin and Moderation | Admin pages, report center, moderation-related management screens                           |

## Frontend Structure

| Area                                                                                                                      | Responsibility                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `index.html` and `auth.html`                                                                                              | Main entry points for app shell and auth flows                     |
| `js/config/`                                                                                                              | Global config, API orchestration, route helpers, runtime constants |
| `js/core/`                                                                                                                | App shell, bootstrap, sidebar, shared page composition             |
| `js/realtime/`                                                                                                            | SignalR bootstrap and feature-specific realtime flows              |
| `js/responsive/`                                                                                                          | Mobile and small-screen behavior for shared UI lanes               |
| `js/auth/`, `js/chat/`, `js/feed/`, `js/post/`, `js/profile/`, `js/story/`, `js/search/`, `js/notification/`, `js/admin/` | Feature-specific behavior split by product domain                  |
| `pages/` and `css/`                                                                                                       | Partial HTML screens and modular styling by domain                 |

### Frontend Runtime Notes

- The application is built around a custom hash router.
- Shared runtime behavior is coordinated through `window.APP_CONFIG`, API helpers, and common UI utilities.
- i18n updates go through the app's translation layer instead of page-by-page string replacement.
- Realtime chat and social updates are wired through SignalR clients and feature modules rather than one global callback file.

## Production and Local Workflow

- Live frontend: [https://www.cloudm.fun](https://www.cloudm.fun)
- Works against the deployed backend API at [https://api.cloudm.fun/swagger/index.html](https://api.cloudm.fun/swagger/index.html)
- The client is delivered as static assets, which keeps local setup and deployment simpler than a framework-heavy build pipeline

### Local Development

- Run the CloudM backend locally
- Serve the repository root with a static server such as Live Server or `npx serve`
- Open `auth.html` for auth flows or `index.html` for the main application shell

Do not open files directly from the filesystem. A local web server is required for routing, fetch, cookies, and browser security behavior.

## Technology Stack

| Area                | Technologies                                                         |
| ------------------- | -------------------------------------------------------------------- |
| Core frontend       | Vanilla JavaScript, HTML, CSS                                        |
| Networking          | Axios, centralized API helpers, refresh-token-aware request flow     |
| Realtime            | SignalR client, chat/post/user realtime modules                      |
| UI system           | Lucide icons, shared loaders, toasts, media helpers, theme utilities |
| Localization        | English and Vietnamese i18n with shared translation helpers          |
| Responsive behavior | Mobile shell, responsive CSS, dedicated small-screen modules         |

## Repository Structure

```text
CloudM.Client/
|-- assets/
|-- css/
|   |-- admin/
|   |-- auth/
|   |-- chat/
|   |-- core/
|   |-- feed/
|   |-- notification/
|   |-- post/
|   |-- profile/
|   |-- responsive/
|   |-- search/
|   |-- shared/
|   `-- story/
|-- docs/
|   `-- images/
|-- js/
|   |-- admin/
|   |-- auth/
|   |-- chat/
|   |-- config/
|   |-- core/
|   |-- feed/
|   |-- i18n/
|   |-- notification/
|   |-- post/
|   |-- profile/
|   |-- realtime/
|   |-- responsive/
|   |-- search/
|   |-- shared/
|   `-- story/
|-- pages/
|-- auth.html
|-- index.html
`-- package.json
```
