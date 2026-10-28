import { beforeEach, expect, test } from 'vitest';
import Dexie from 'dexie';
import fakeIndexedDB from 'fake-indexeddb';
import fakeIDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { applyVaultMiddleware } from '../indexedDb';
import { encryptLegacyDatabaseRows } from '../migrate';
import { createVault, lockVault } from '../keyring';
import { TabSpaceDatabase } from '../../storage/TabSpaceDatabase';

Dexie.dependencies.indexedDB = fakeIndexedDB as any;
Dexie.dependencies.IDBKeyRange = fakeIDBKeyRange as any;

function area() {
  const data = new Map<string, unknown>();
  return {
    async get(keys: string | string[]) {
      const result: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (data.has(key)) result[key] = data.get(key);
      }
      return result;
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
  };
}

beforeEach(async () => {
  (globalThis as any).chrome = {
    storage: { local: area(), session: area() },
  };
  await lockVault();
});

test('migrates legacy plaintext rows, resumes safely and seals on disk', async () => {
  const old = new Dexie('TabSpaceDB-vault-migration-test');
  old.version(12).stores({ SavedTab: 'id, title, url, createdAt' });
  await old.open();
  await old.table('SavedTab').put({
    id: 'tab-old',
    title: 'Highly confidential legal page',
    url: 'https://secret.example/client',
    createdAt: 42,
  });
  old.close();

  await createVault('long and private vault passphrase');
  const secured = new TabSpaceDatabase('vault-migration-test');
  applyVaultMiddleware(secured);
  await secured.open();
  await encryptLegacyDatabaseRows(secured);
  // Replaying after an interruption is deliberately idempotent.
  await encryptLegacyDatabaseRows(secured);
  const converted = await secured.table('SavedTab').get('tab-old');
  expect(converted.title).toBe('Highly confidential legal page');

  const raw: any = await new Promise((resolve, reject) => {
    const tx = secured.backendDB().transaction('SavedTab');
    const request = tx.objectStore('SavedTab').get('tab-old');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(raw.__vault?.__vault_v1).toBe(true);
  expect(JSON.stringify(raw)).not.toContain('Highly confidential');
  expect(JSON.stringify(raw)).not.toContain('secret.example');

  secured.close();
  await secured.delete();
});
