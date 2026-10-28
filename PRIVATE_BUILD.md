# Tabverse Private — offline-only Chrome extension

This fork disables the known third-party network paths in the browser extension.

## Differences from upstream

- No official or custom server sync, pairing window, or cloud console in the installed extension.
- Chrome's content security policy blocks remote requests, WebSockets, iframes and images.
- No persistent `<all_urls>` access. Page-to-Markdown/AI actions request permission for the chosen web origin when the user clicks.
- Built-in local notes, bookmarks, task lists, tab groups, history and on-device AI are retained.
- External favicons and placeholders are replaced with an inline icon to prevent background requests to their sites.
- Automatic screenshot capture is disabled; existing local preview data may remain in storage until cleaned up.
- Developer-hosted Webtool iframe and automatic Chrome Web Store release workflow removed.
- Clicking links or restoring tabs still initiates normal Chrome navigation to the target sites.

## Security boundary

This is **offline-only extension behavior**, not an E2EE sync implementation.
The Go server source and dormant synchronization client modules remain in the repository for later, independently reviewed changes; they are not reachable through the installed extension UI, and CSP prevents outbound network calls from its pages.

Google Drive or a private GitHub repository is a possible *future*, opt-in encrypted sync provider, **not enabled in this PR**.

## Verification

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run typecheck
corepack pnpm run lint:check
corepack pnpm test
corepack pnpm run build
node tools/check-private-build.mjs
```

The static policy verifier does not constitute a dynamic penetration test. For confidential work content, also inspect the generated browser extension package and live network traffic in a dedicated Chrome profile.

## CI policy

The Chrome extension is the deliverable for this fork. The default CI therefore
runs only `extension` (lint/typecheck/unit tests/build/privacy policy) and
`package` (installable ZIP). The upstream Go server and official-site jobs are
not on the critical path; their source remains in the repository but is not
compiled, deployed, or automatically released in this fork.

The workflow runs on privacy/feature branches to support stacked pull requests.
