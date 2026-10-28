import { beforeEach, expect, test } from 'vitest';
import Dexie from 'dexie';
import fakeIndexedDB from 'fake-indexeddb';
import fakeIDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { applyVaultMiddleware } from '../indexedDb';
import { createVault, lockVault } from '../keyring';
import { TabSpaceDatabase } from '../../storage/TabSpaceDatabase';

Dexie.dependencies.indexedDB = fakeIndexedDB as any;
Dexie.dependencies.IDBKeyRange = fakeIDBKeyRange as any;

function memoryArea() {
  const data = new Map<string, unknown>();
  return {
    async get(keys: string | string[]) {
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (data.has(k)) out[k] = data.get(k);
      }
      return out;
    },
    async set(next: Record<string, unknown>) {
      for (const [k, v] of Object.entries(next)) data.set(k, v);
    },
    async remove(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

beforeEach(async () => {
  (globalThis as any).chrome = {
    storage: { local: memoryArea(), session: memoryArea() },
  };
  await lockVault();
});

test('raw IndexedDB contains ciphertext but public Dexie returns cleartext', async () => {
  await createVault('very long vault passphrase');
  const db = new TabSpaceDatabase('private-vault-test');
  applyVaultMiddleware(db);
  await db.open();
  const row = {
    id: 'tab1',
    createdAt: 10,
    title: 'Secret court case',
    url: 'https://internal.example/secret',
    favIconUrl: 'data:image/png;base64,AQID',
  };
  await db.table('SavedTab').put(row);
  const original = await db.table('SavedTab').get('tab1');
  expect(original.title).toBe('Secret court case');

  const raw: any = await new Promise((resolve, reject) => {
    const transaction = db.backendDB().transaction('SavedTab');
    const request = transaction.objectStore('SavedTab').get('tab1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(raw.__vault.__vault_v1).toBe(true);
  expect(JSON.stringify(raw)).not.toContain('Secret court case');
  expect(JSON.stringify(raw)).not.toContain('internal.example');

  const queried = await db
    .table('SavedTab')
    .where('createdAt')
    .above(0)
    .toArray();
  expect(queried[0].url).toBe(row.url);

  await lockVault();
  await expect(db.table('SavedTab').get('tab1')).rejects.toThrow('locked');
  await db.close();
  await db.delete();
});
