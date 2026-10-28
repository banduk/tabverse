/**
 * Crash-resumable, idempotent conversion. A row is either plaintext legacy or
 * an independently authenticated ciphertext; mixed states can be resumed.
 */
import { db } from '../storage/db';
import type { Dexie } from 'dexie';
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

    await encryptLegacyDatabaseRows(db);
    await migrateSensitiveStorage();
    await markVaultMigrated();
  })();
  try {
    await migration;
  } finally {
    migration = null;
  }
}

/** Can run against a test database; normal app uses the shared Dexie handle. */
export async function encryptLegacyDatabaseRows(database: Dexie): Promise<void> {
  await vaultKey();
  allowLegacyVaultRecords(true);
  try {
    for (const tableName of ENCRYPTED_TABLES) {
      const table = database.table(tableName);
      const rows = await table.toArray();
      for (const row of rows) {
        await table.put(row);
      }
    }
  } finally {
    allowLegacyVaultRecords(false);
  }
}
