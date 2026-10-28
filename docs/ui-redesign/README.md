# PR #4 — Tabverse Native Chrome UI: design decision

This PR begins as a **design-review draft**. **No existing production UI, browser permissions, cloud sync or vault code is changed yet**. Choose a direction before replacing BlueprintJS across the app.

## Goal

Make the extension feel first-party in Chrome: its spacing, typography, blue selection, quiet surfaces, keyboard accessibility, system light/dark mode and lower visual noise. The original product uses BlueprintJS, oversized rounded controls, multiple shadow-heavy cards, a coloured sidebar and nested tabs/panels.

## Two options

### A — Full-page Chrome Settings-like manager

- Layout inspired by `chrome://settings`/`chrome://bookmarks`, without importing Chrome's private internal components.
- Full-page manager, vertical navigation, flat list of tabs grouped by Chrome Tab Groups, optional details inspector for notes/todos/bookmarks/AI.
- Settings as a full-page section, not a modal; local vault and cloud providers prominent.
- Lower migration risk: preserve manager tab lifecycle, React stores and current Chrome API orchestration.
- Best for heavy management of many tabs and long notes.
- Preview: `prototype.html?option=a&view=manager`; Settings: `?option=a&view=settings`.

### B — Actual Chrome Side Panel + full-page advanced manager

- New `chrome.sidePanel` surface for fast access to current tabs, workspaces, saved sessions, notes and security status.
- The browser owns the side-panel frame/pinning/placement; our extension renders only the inner content.
- Drill-down settings and search inside the side panel; a link opens the advanced full-page manager for complex notes, batch operations, split tabs, preview, and comprehensive history.
- Better for staying in the current webpage, but adds new background/page lifecycle, MV3 `sidePanel` permission and per-window context handling.
- Preview: `prototype.html?option=b&view=manager`; Settings: `?option=b&view=settings`.

## Library evaluation

1. **Chromium cr_elements** are **internal WebUI** components loaded through `chrome://resources`; extension pages lack those special WebUI bindings. No supported public Chrome component library for extensions.
2. **Chrome sidePanel / action / menus** are officially supported *surfaces*, not a styled component library.
3. **Base UI (`@base-ui/react`)** is a mature headless React/accessibility foundation for complex Menu, Popover, Dialog, Combobox and Tabs. Prefer it for incremental production migration, with local CSS copying Chrome's *appearance* (not copying private C++/WebUI integrations).
4. **Radix Primitives** is a similarly strong alternative, especially for small composable controls; Base UI offers broader complex controls.
5. **chromium-ui-react** is an interesting unofficial closer visual approximation, but low-adoption and not established enough to add as a foundational dependency without an audit. Do not install it on faith.
6. **Material Web** is Google Material Design, not the same as Chrome native WebUI. Avoid a wholesale dependency simply for visual parity.

## Shared requirements after choosing

- Keep local-first behavior, encrypted IndexedDB, manual site access permission, personal Google/GitHub sync, no external fonts/scripts/icons and strict CSP.
- All assets bundled locally. Prefer system UI typography and SVG icons shipped with the extension.
- Support `prefers-color-scheme` and high contrast, visible focus rings, keyboard reordering/search, screen-reader labels and reduced motion.
- Cover **manager, toolbar popup, settings, vault/unlock, cloud connection, notes, tasks, bookmarks, history, AI chat, search**, empty/loading/error states.
- Preserve groups, split tabs, pinned/suspended state, drag-and-drop, keyboard shortcuts and saved-tab restoration.
- For **B**, explicitly test side-panel state across windows, browser profile lock, closed panel, tab switching and background service-worker shutdown.
- Test with synthetic data in Chromium E2E; no third-party egress. No runtime dependency changes in this draft.

## Viewing the prototype

Open `docs/ui-redesign/prototype.html` in a regular browser. The mockups are **HTML screenshots of illustrative UI**, not screenshots from an already-implemented new Tabverse. The Chrome browser frame in the mockups is illustrative; it is not drawn by the extension.

To generate four 1440×900 PNG screenshots locally:

```bash
python -m pip install playwright==1.58.0
python -m playwright install chromium
python tools/render-ui-proposals.py
```

GitHub Actions workflow **UI prototype screenshots** also renders all four and uploads them as a downloadable artifact.

## Decision

**Choose A or B**. Then evolve PR #4 from design mockups into production code. Keep it in Draft until the selected UI is implemented and full E2E accessibility/security checks pass.
