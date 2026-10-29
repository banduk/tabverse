# PR #4 — Tabverse Native Chrome UI: hybrid implementation

This PR began as a design-review draft and now implements the chosen hybrid. It modifies the extension UI and adds the official `sidePanel` permission, but leaves encryption, cloud sync and network permissions unchanged.

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

**Approved hybrid: the layout of A with the styling of B, plus Chrome's actual Side Panel for quick access.** Keep this PR as a draft until CI and manual accessibility/security checks pass.


## Decision adopted — hybrid Chrome UI (2026-10-28)

The accepted design combines **A's full-manager layout** (left navigation,
central workspace list, right tools inspector) with **B's restrained Chrome
visual styling**. It also keeps **B's actual browser-owned Side Panel** as a
separate, compact entry point. The panel is not a cramped copy of the manager.

### Production implementation in this PR

- Toolbar action now toggles the real Chrome side panel with
  `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})`.
- Side panel lists current-window tabs, Chrome tab groups and recent saved
  workspaces. Search filters both lists. Clicking an active tab focuses it;
  opening a saved workspace reuses an existing window or creates a new one,
  rather than replacing unrelated tabs.
- Vault setup/unlock precedes access to saved spaces. The side panel stops
  displaying sensitive data when session keys are removed.
- Full manager keeps existing tab/group/notes/todos/bookmarks/history/AI
  functionality. Its layout is now a 244px neutral navigation rail, flexible
  list and 340px details inspector (responsive at smaller widths).
- Chrome-like design tokens, compact rows, flat borders, quiet tabs and
  light/dark contrast are applied without untrusted external styles/scripts.
- The old `popup.html` remains in the package as a legacy standalone page,
  but the toolbar action uses the native side panel.

### QA required before merging

1. Use a **secondary Chrome profile** and load the unpacked extension.
2. Click the extension's toolbar icon; check that it opens/closes Chrome's
   real side panel and keeps working when switching tabs and windows.
3. Test an empty vault, unlocking, idle locking, and the locked panel state.
4. Verify all current Chrome groups, tab focus, saved-workspace restoration
   and the manager link, including a workspace already open elsewhere.
5. Verify full manager tabs/groups, drag/drop, split-view, settings, notes,
   tasks, bookmarks, history and AI; test light/dark appearance and keyboard.
6. Review network inspector for unexpected outbound traffic and run the
   packaged-extension tests. Do not merge until CI and manual tests pass.

The browser-frame imagery in the static design prototype remains illustrative,
not a screenshot of live extension behavior.
