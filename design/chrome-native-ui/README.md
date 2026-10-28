# PR #4 — Chrome-native visual redesign (design review)

Two alternatives to replace Tabverse's dated BlueprintJS-heavy visual language, with **no functional migrations in this PR**. This PR deliberately provides reviewable static HTML previews rather than silently adopting a style. Production migration follows selection.

## Technical findings
- **Chromium's internal WebUI `cr-*` components are not a supported public UI component library for third-party extensions.** Do not import `chrome://resources`, private `cr_elements`, or bundle Chromium source components.
- The officially supported Chrome extension UI surfaces are action popups, extension pages, context menus, and the `chrome.sidePanel` API (where appropriate). These surfaces don't expose native Settings/Tab Search component primitives for React.
- HTML-native controls plus carefully matched Chrome tokens, focus rings, responsive density, typography and dark mode are safest for a genuinely Chrome-like feel.
- Alternative: `@material/web` provides Google's Material Design components, but **Material ≠ Chrome WebUI** and the project is React. Wrapping Material Web Components adds dependencies and integration cost. Avoid dependency changes pending a decision.
- Existing app uses React, BlueprintJS, CSS modules, Sass, SimpleBar and Tiptap. Incrementally replace visuals, not data/state management or the private vault.
- Maintain the security posture: no external fonts, remote icons, CDN, or network. Prefer bundled vector icons, built-in fonts and light/dark through `prefers-color-scheme`.

## Option A — Chrome Side Panel / Settings
- Pale sidebar with rounded selected navigation.
- Three-column workspace: navigation, open tabs, contextual notes/tasks and private sync.
- Rounded tabs, compact information, built-in-feeling settings.
- Best when notes/tasks and saved sessions are as important as tabs.

## Option B — Chrome Tab Groups / Tab Search
- Top navigation, compact workspaces rail and dense tab-group lists.
- Group-first interaction, smart search and quick filters.
- Fewer simultaneous panels and higher density.
- Best when managing many tabs/groups is the primary workflow.

## Design constraints (both)
- UI must behave in light and dark themes; keyboard navigation, visible focus, 44px tap targets where applicable, accessible semantics.
- Distinguish locked vault vs unlocked clearly. Never render sensitive preview data before unlocking.
- Keep existing functionality: workspaces, tab groups, suspended tabs, notes, todos, bookmarks, history, sync providers and encryption UI.
- A Chrome **side panel** may be added as an optional compact companion, but should not replace the full manager view without UX approval.
- Screenshots are conceptual **mockups**, not screenshots of the modified production extension. The HTML variants use representative fake data.

## Review decision
Select **A** or **B**, or a hybrid (e.g. B's tab groups + A's note side panel). After selection, convert the design into React/CSS with screenshot regression tests and evaluate each route.

No data/schema/permissions/crypto changes in this PR.
