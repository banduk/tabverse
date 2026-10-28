/**
 * Crash-resumable, idempotent conversion. A row is either plaintext legacy or
 * an independently authenticated ciphertext; mixed states can be resumed.
 */
import { db } from '../storage/db';
import { ENCRYPTED_TABLES, allowLegacyVaultRecords } from './indexedDb';
import { markVaultMigrated, readVaultMetadata, vaultKey } from './keyring';
import { migrateSensitiveStorage } from './storage';

let migration: Promise<void> | null = null;

export async function migrateLocalVault(): Promise<void> {
  if (migration) return migration;
  migration = (async () => {
    const meta = await readVaultMetadata();
    if (!meta) throw new Error('Vault must be initialized first.');
    await vaultKey();
    if (meta.migrated) return;

    allowLegacyVaultRecords(true);
    try {
      for (const tableName of ENCRYPTED_TABLES) {
        // Limit work per transaction so the browser can recover after crashes.
        const table = db.table(tableName);
        const rows = await table.toArray();
        for (const row of rows) {
          await table.put(row);
        }
      }
      await migrateSensitiveStorage();
      await markVaultMigrated();
    } finally {
      allowLegacyVaultRecords(false);
    }
  })();
  try {
    await migration;
  } finally {
    migration = null;
  }
}
