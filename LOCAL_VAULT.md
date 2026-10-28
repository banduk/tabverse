# Tabverse local encrypted vault (PR #3)

### Scope

- Vault passphrase protects a randomly generated AES-256 data encryption key.
- The data key is wrapped using PBKDF2-SHA256 (310,000 iterations) and AES-GCM.
- Only the wrapped key and a salt/nonce persist in chrome.storage.local.
- The unwrapped key stays in chrome.storage.session (memory, cleared at restart).
- Sensitive IndexedDB **record fields** and AI chat/prompt log records are
  AES-GCM encrypted with fresh nonces and authenticated associated data.
- Private cloud encrypted snapshots remain independently encrypted by PR #2.
- SQLite/SQLCipher is not required; this is Dexie DBCore middleware.

### IndexedDB metadata intentionally left unencrypted

Opaque record IDs, parent IDs, creation/closure timestamps and journal entity
types are required by IndexedDB indices. Page URLs, titles, notes, task
descriptions, favicons, screenshots, and journal JSON payloads are sealed.

### First unlock and migration

On first use, Tabverse asks for a passphrase, generates a random master key,
and progressively re-writes existing rows into encrypted envelopes. Migration
is resumable after interruption, but NOT an atomic secure erase of old disk
pages; an encrypted disk (FileVault / BitLocker) remains important.

Do not run two old/new extension builds against the same Chrome profile
while migrating. Export important data before installing the new build.

### Locking

Locked sessions cannot read or write protected tables. A browser restart
clears the in-memory key. Chrome's own history, other browser extensions,
page content, and data in the RAM of an already-unlocked process are outside
this vault's security boundary.

### Recovery

Lost passwords cannot be reset without losing the encrypted local records.
There is no key escrow. A known cloud snapshot can restore data only when the
user still knows its separate cloud passphrase.

### Testing requirements

- New records must be encrypted on disk; raw IndexedDB must not reveal URLs
  or note contents.
- A wrong passphrase must fail without wiping or rewriting the database.
- Migration must handle mixed legacy/ciphertext rows after interruption.
- Every IndexedDB query path (including cursor-based collection methods) must
  return decrypted results only while unlocked.
- All sensitive chrome.storage.local values must be migrated.
- The CI build must reject plaintext regressions in the output package.

## Important limitations

An existing Chrome profile may retain old plaintext IndexedDB pages in backup
files, deleted sectors or storage compaction journals; the extension cannot
promise forensic erasure. Local IndexedDB is not protected while a malicious
process controls an unlocked browser. Full-disk encryption is still necessary.
