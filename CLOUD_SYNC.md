# Private cloud synchronization

This fork implements optional, encrypted, serverless sync, without using
the upstream Tabverse server.

## Properties

- Exactly one selected provider is active per Chrome profile: Google Drive
  or a private GitHub repository. You can switch providers.
- Cloud files contain AES-256-GCM encrypted JSON; the passphrase is
  processed using PBKDF2-SHA256 with 310,000 iterations and is never uploaded.
- Each device owns one cloud file; other devices read it without overwriting it.
- Record reconciliation is last-write-wins by updated timestamp with
  deletion tombstones. Concurrent edits to the same record can lose one side;
  this is not a CRDT. Keep backups before extensive use.
- Chrome checks for remote changes every five minutes while unlocked.
- The passphrase and GitHub token live only in chrome.storage.session and
  must be provided again after restarting Chrome.
- IndexedDB local records are NOT encrypted; E2EE covers cloud copies only.
- Google Drive and GitHub use separate vaults; the current version syncs to
  exactly one provider at a time. Simultaneous replication is not implemented.
- Lost passphrases cannot be recovered.

## Google Drive setup

1. Enable Google Drive API in Google Cloud Console. Create a Chrome extension
   OAuth 2.0 client with the installed extension ID from chrome://extensions.
   Keep a stable extension ID in your unpacked installation and configure
   OAuth consent screen and test users when needed.
   For reproducible builds on different computers, configure the PUBLIC key
   of your extension as GitHub Actions Repository Variable
   TABVERSE_EXTENSION_PUBLIC_KEY (base64 DER). Never upload its private PEM key.
   Without a stable key, unpacking at another filesystem path can change the
   extension ID and invalidate the Chrome OAuth client registration.
2. Set GitHub Actions Repository Variable TABVERSE_GOOGLE_CLIENT_ID to your
   OAuth client ID (public, not a secret) and re-run CI, or build locally:

   TABVERSE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com pnpm run build

   Download the rebuilt ZIP from Actions. The default CI artifact (without
   that variable) will not support Google sign-in.

3. Go to Settings > Sync > Google Drive, enter a long passphrase and press
   Connect and sync. Google will ask you to authorize appDataFolder access.
4. Use the same Google account, OAuth app and passphrase on another profile.

The only Google OAuth scope is:
https://www.googleapis.com/auth/drive.appdata

The appDataFolder is hidden in Google Drive and not directly visible in
the standard Drive web interface.
Official guides:
https://developers.google.com/workspace/drive/api/guides/appdata
https://developer.chrome.com/docs/extensions/reference/api/identity

## Private GitHub setup

1. Create a PRIVATE repository used only for Tabverse encrypted snapshots.
2. Make a fine-grained personal access token for that repository only,
   with repository Contents: read and write.
3. Open Settings > Sync > GitHub, supply owner/repo, the PAT and passphrase.
4. In another Chrome profile, use the same repository and passphrase.
5. Encrypted JSON files appear at .tabverse-private/v1. Git preserves
   older encrypted revisions in the repository history.

Tokens, plaintext data and passphrases must not be put in source files or CI.
https://docs.github.com/en/rest/repos/contents

## Egress and limitations

- Only https://www.googleapis.com and https://api.github.com are allowed
  as browser-extension request origins; access is requested on interaction.
- No upstream developer sync server, remote images or external iframes.
- This implementation has unit/CI tests, but no live-provider end-to-end test
  or external security audit. Check Chrome DevTools network traffic before
  storing confidential work data.
- Backup exports are advisable. The initial synchronization of large vaults
  may take time and can reach provider/API size or request limits.

## Browser downgrade

This feature raises the IndexedDB schema from v11 to v12 for durable
cross-device deletion tombstones. Downgrading to a v11 Tabverse build can
succeed, but Dexie may silently
drop the v12-only deletion journal. This can cause deleted records to be
restored by a later sync. Export a local backup before installing the
cloud-enabled build, and do not downgrade while cloud sync is active.
