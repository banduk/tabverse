/**
 * The extension's Content Security Policy for extension pages, and the one
 * directive in it that a self-hosted sync server runs into.
 *
 * `script-src 'self'` and `object-src 'self'` are what make an extension page
 * safe, and Chrome enforces their minimum anyway. `connect-src` is different:
 * it decides *which server* the extension may talk to, and the answer cannot be
 * a fixed list, because the server is whatever the user runs (ADR 0002 §5: the
 * extension talks to exactly one server, the one the user controls - not one
 * we know about). A hardcoded localhost-only list made a server on a LAN
 * address fail with a bare `Failed to fetch` and a CSP error in the console,
 * with nothing in the UI to explain it.
 */

/**
 * The default: any http/https/ws/wss origin, so a server at
 * `http://192.168.0.221:8223` works without a rebuild. It is the same trust
 * decision as `host_permissions: ["<all_urls>"]`, which the manifest already
 * declares - the CSP is narrowed to schemes, not to hosts.
 */
export const DEFAULT_CONNECT_SRC =
  "'self' https://www.googleapis.com https://api.github.com";

/**
 * The narrowed policy, for a user who wants the extension to talk to specific
 * servers only (`TABVERSE_ALLOWED_SERVERS`).
 *
 * Each origin is also allowed over ws/wss, because the sync stream is a
 * WebSocket on the same host: spelling out both forms would be the sort of
 * thing people get wrong in a way that only shows up as a failed reconnect.
 */
export function connectSrcFor(allowedServers: string | undefined): string {
  // Offline-only build: a future backup provider needs a separately reviewed allowlist.
  if ((allowedServers ?? '').trim()) {
    throw new Error('Only personal Google Drive and GitHub APIs are authorized');
  }
  return DEFAULT_CONNECT_SRC;
}

/** Replaces the `connect-src` directive of a CSP string, adding it if absent. */
export function withConnectSrc(csp: string, connectSrc: string): string {
  const directives = csp
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean);

  let replaced = false;
  const out = directives.map((directive) => {
    if (!/^connect-src\s/i.test(directive)) {
      return directive;
    }
    replaced = true;
    return `connect-src ${connectSrc}`;
  });
  if (!replaced) {
    out.push(`connect-src ${connectSrc}`);
  }
  return out.join('; ');
}
