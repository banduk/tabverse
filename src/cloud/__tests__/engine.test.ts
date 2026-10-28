import { afterEach, expect, test } from 'vitest';
import { db } from '../../storage/db';
import { doSync } from '../engine';
import { seal, unseal, type EncryptedDocument } from '../crypto';
import { fileName, type CloudFiles, type RemoteFile } from '../providers';
import { recordCloudChange } from '../journal';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const secret = 'a shared long private passphrase';
const files = new Map<string, string>();

const provider: CloudFiles = {
  async list(): Promise<RemoteFile[]> {
    return Array.from(files.keys()).map((name) => ({
      name,
      id: name,
    }));
  },
  async read(file: RemoteFile): Promise<string> {
    return files.get(file.id) ?? '';
  },
  async write(name: string, text: string): Promise<void> {
    files.set(name, text);
  },
};

afterEach(async () => {
  files.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});

test('sync restores encrypted records from another device', async () => {
  await db.table('SavedTab').put({
    id: 'tab-test',
    tabSpaceId: 'space',
    title: 'private',
    url: 'https://internal.example/private',
    updatedAt: 42,
    createdAt: 42,
  });
  const first = await doSync(
    { provider: 'drive', deviceId: A },
    { passphrase: secret },
    provider,
  );
  expect(first.uploaded).toBe(true);
  expect(files.get(fileName(A))).not.toContain('internal.example');

  await db.table('SavedTab').clear();
  const second = await doSync(
    { provider: 'drive', deviceId: B },
    { passphrase: secret },
    provider,
  );
  expect(second.applied).toBeGreaterThan(0);
  const restored = await db.table('SavedTab').get('tab-test');
  expect(restored.url).toBe('https://internal.example/private');
});

test('wrong passphrase cannot overwrite existing remote data', async () => {
  const doc = await seal(
    JSON.stringify({
      format: 'tabverse.private.snapshot.v1',
      deviceId: A,
      records: [],
    }),
    secret,
  );
  files.set(fileName(A), JSON.stringify(doc));
  await expect(
    doSync(
      { provider: 'drive', deviceId: B },
      { passphrase: 'incorrect but long password' },
      provider,
    ),
  ).rejects.toThrow('Cannot decrypt');
  expect(files.size).toBe(1);
});

test('a cloud deletion wins and propagates to another device', async () => {
  await db.table('SavedTab').put({
    id: 'tab-test',
    title: 'old',
    url: 'https://test.example',
    updatedAt: 10,
    createdAt: 10,
  });
  await doSync(
    { provider: 'drive', deviceId: A },
    { passphrase: secret },
    provider,
  );
  await db.table('SavedTab').delete('tab-test');
  await recordCloudChange({
    entity: 'tab',
    id: 'tab-test',
    updated_at: 11,
    deleted: true,
    payload: '',
  });
  await doSync(
    { provider: 'drive', deviceId: B },
    { passphrase: secret },
    provider,
  );
  const snapshot = JSON.parse(
    await unseal(
      JSON.parse(files.get(fileName(B)) ?? '') as EncryptedDocument,
      secret,
    ),
  );
  expect(snapshot.records.some((r: { deleted: boolean }) => r.deleted)).toBe(
    true,
  );
});
