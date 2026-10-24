# Contributing to Endcord

First off, thank you for considering contributing to **Endcord**! 🚀

Endcord is an open-source, high-performance, and feature-rich Discord client modification built for speed, clean UX, and deep customization. Whether you are fixing bugs, optimizing existing modules, translating to new languages, writing innovative plugins, or enhancing documentation, your contributions make Endcord better for everyone.

---

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Getting Started & Development Setup](#getting-started--development-setup)
3. [Ways to Contribute](#ways-to-contribute)
   - [Bug Fixes & Core Improvements](#bug-fixes--core-improvements)
   - [Developing Plugins](#developing-plugins)
   - [Translations & Localization](#translations--localization)
   - [UI & Theme Enhancements](#ui--theme-enhancements)
   - [Documentation & Community Support](#documentation--community-support)
4. [Plugin Development Guidelines](#plugin-development-guidelines)
5. [Code Quality & Standards](#code-quality--standards)
6. [Pull Request (PR) Workflow](#pull-request-pr-workflow)
7. [Need Help?](#need-help)

---

## Code of Conduct

All contributors and community members are expected to follow our [Code of Conduct](./CODE_OF_CONDUCT.md). Please ensure respectful, collaborative, and inclusive communication across all issues, pull requests, and our Discord server.

---

## Getting Started & Development Setup

### Prerequisites
- **Node.js** (v18+ or v22 recommended)
- **pnpm** (recommended package manager)
- A working Discord client (Discord Stable, PTB, Canary, or Development)

### Local Environment Setup

1. **Fork and Clone the Repository:**
   ```bash
   git clone https://github.com/<your-username>/Endcord.git
   cd Endcord
   ```

2. **Install Dependencies:**
   ```bash
   pnpm install
   ```

3. **Build or Watch Mode:**
   - Development build with watch mode:
     ```bash
     pnpm build:watch
     ```
   - Production / Standalone bundle build:
     ```bash
     pnpm build --standalone
     pnpm package:resources
     ```

4. **Injecting Endcord into Discord for Testing:**
   - Run the installer in development mode or use the build script:
     ```bash
     pnpm inject
     ```

---

## Ways to Contribute

### Bug Fixes & Core Improvements
- Check open issues labeled `bug` or `help wanted`.
- Keep core patch routines robust, safe, and guarded with fallback boundaries (`ErrorBoundary`).
- Avoid brittle patches that depend on unstable Discord minified identifiers. Always patch using meaningful constants, AST patterns, or regex with flexible spacing.

### Developing Plugins
Plugins are the heart of Endcord's modular experience. If you are creating a new plugin:
- Create your plugin folder under `src/plugins/<pluginName>/`.
- Define it using `definePlugin({...})`.
- Ensure settings are properly typed and defaults are sound.

### Translations & Localization (5-Language System)
Endcord supports native multilingual localization across English (`en`), Turkish (`tr`), Russian (`ru`), Spanish (`es`), and French (`fr`).
- When introducing user-facing text, register strings in `src/utils/i18n.ts`.
- Use `t("Your String")` or `useI18n()` inside components.
- Do not call React hooks inside non-component layout callbacks (such as `useTitle` or static builders).

### UI & Theme Enhancements
- Adhere to Endcord's sleek dark/blue aesthetic with high performance (subtle transitions, minimal layout reflows, 0 unnecessary re-renders).
- Always use CSS variables (`var(--...)`) to blend seamlessly with user themes and Discord styles.

### Documentation & Community Support
- Improve or expand guides in the repository.
- Help users solve installation or configuration issues in our Discord server.

---

## Plugin Development Guidelines

To keep Endcord safe, lightweight, and compliant with Discord's user environment, please abide by the following rules:

### Allowed & Encouraged:
- Enhancing accessibility, readability, and media controls.
- Useful UI utilities and quality-of-life adjustments.
- Visual profile enhancements and client-side styling that don't harm other users.
- Clean Webpack and React component patching.

### Prohibited / Reject Criteria:
- **No Malicious or Abusive Features:** Token loggers, selfbots, auto-spammers, raid tools, mass deleters, API spammers, or nitro snipers.
- **No Deceptive / Fake Audio Manipulation:** No FakeMute, FakeDeafen, or unauthorized mic injections that mislead or disrupt voice channels.
- **No Untrusted External APIs:** Do not transmit user tokens, message logs, or private data to unverified third-party servers.
- **No Forced API Keys:** Do not create plugins that mandate individual paid or third-party secret keys unless approved.
- **No Raw Destructive DOM Hacking:** Prefer Discord React tree injection, hooks, and proper component replacements over raw DOM mutation whenever possible.
- **No Bloated Dependencies:** Keep bundle size minimal. Do not pull heavy npm packages for trivial helpers.

---

## Code Quality & Standards

- **TypeScript:** Strict type checks should pass without errors. Avoid `any` when proper Discord types are available.
- **Clean Code:** Write readable, self-documenting code with informative comments where complex webpack patching takes place.
- **React Hooks Rules:** Always respect React's Rules of Hooks. Never call hooks conditionally, inside loops, or inside static layout descriptor objects.
- **Formatting:** Run code formatters and linters before submitting:
  ```bash
  pnpm lint
  ```

---

## Pull Request (PR) Workflow

1. **Branching:** Create a descriptive branch from `main`:
   ```bash
   git checkout -b feature/my-cool-plugin
   ```
2. **Commit Messages:** Use clear, concise commit messages (e.g., `feat(plugins): add SmoothType animation options` or `fix(settings): prevent crash on tab transition`).
3. **Test Thoroughly:** Verify that:
   - The client builds cleanly (`pnpm build`).
   - Discord launches without console errors.
   - Settings, hot-reloading, and persistence work across client restarts.
4. **Submit PR:** Open a Pull Request on GitHub against the `main` branch. Provide a clear description of:
   - What the PR does
   - Any visual before/after changes (screenshots or GIFs are appreciated!)
   - Verification steps

---

## Need Help?

Have questions, ideas, or need guidance on writing a complex patch?
- Join our [Official Discord Server](https://discord.gg/endcord).
- Connect with other developers in the `#development` channel.

Thank you for contributing and helping make Endcord the most fluid Discord experience! 💙
