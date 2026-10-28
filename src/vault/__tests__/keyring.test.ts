import { beforeEach, expect, test } from 'vitest';
import {
  createVault,
  isVaultUnlocked,
  lockVault,
  readVaultMetadata,
  unlockVault,
} from '../keyring';
import { sealJson, unsealJson } from '../seal';
import { VaultStorageArea } from '../storage';
import { MemoryStorageArea } from '../../data/repo/outbox';

let disk: Map<string, unknown>;
let session: Map<string, unknown>;

function area(map: Map<string, unknown>) {
  return {
    async get(keys: string | string[]) {
      const values: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (map.has(key)) values[key] = map.get(key);
      }
      return values;
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) map.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key);
    },
  };
}

beforeEach(async () => {
  disk = new Map();
  session = new Map();
  (globalThis as any).chrome = {
    storage: {
      local: area(disk),
      session: area(session),
    },
  };
  await lockVault();
});

test('generates a wrapped key and never saves the passphrase', async () => {
  await createVault('very long vault passphrase');
  const meta = await readVaultMetadata();
  expect(meta?.migrated).toBe(false);
  const raw = JSON.stringify([...disk.values()]);
  expect(raw).not.toContain('very long vault passphrase');
  expect(raw).not.toContain('internal.example');
  expect(await isVaultUnlocked()).toBe(true);
});

test('encrypts a local value and authenticates context', async () => {
  await createVault('very long vault passphrase');
  const record = { title: 'Secret project', url: 'https://internal.example' };
  const sealed = await sealJson(record, 'tab/SavedTab');
  expect(JSON.stringify(sealed)).not.toContain('Secret project');
  await expect(unsealJson(sealed, 'tab/SavedTab')).resolves.toEqual(record);
  await expect(unsealJson(sealed, 'tab/Other')).rejects.toThrow(
    'Cannot authenticate',
  );
});

test('locking prevents reads, wrong passphrase cannot unlock', async () => {
  await createVault('very long vault passphrase');
  const sealed = await sealJson({ value: 'secret' }, 'chat');
  await lockVault();
  await expect(unsealJson(sealed, 'chat')).rejects.toThrow('locked');
  await expect(unlockVault('incorrect passphrase')).rejects.toThrow(
    'Incorrect vault',
  );
  await unlockVault('very long vault passphrase');
  await expect(unsealJson(sealed, 'chat')).resolves.toEqual({
    value: 'secret',
  });
});

test('encrypted Chrome storage has no plaintext and decrypts after unlock', async () => {
  await createVault('very long vault passphrase');
  const raw = new MemoryStorageArea();
  const protectedArea = new VaultStorageArea(raw);
  await protectedArea.set({
    tabverse_ai_chat_v1: [{ content: 'internal confidential meeting' }],
  });
  const exposed = await raw.get(['tabverse_ai_chat_v1']);
  expect(JSON.stringify(exposed)).not.toContain(
    'internal confidential meeting',
  );
  expect(
    (await protectedArea.get(['tabverse_ai_chat_v1'])).tabverse_ai_chat_v1[0]
      .content,
  ).toBe('internal confidential meeting');
});
