/** Protected Chrome storage for AI transcripts, prompt logs and old sync data. */
import { isSealed, sealJson, unsealJson } from './seal';
import { vaultKey } from './keyring';
import { type StorageAreaLike } from '../data/repo/outbox';

export const SENSITIVE_STORAGE_KEYS = [
  'tabverse_ai_chat_v1',
  'tabverse_prompt_log_v1',
  'tabverse_outbox_v1',
  'tabverse_sync_config_v1',
] as const;

const SENSITIVE = new Set<string>(SENSITIVE_STORAGE_KEYS);

export class VaultStorageArea implements StorageAreaLike {
  constructor(private readonly storage: StorageAreaLike) {}

  async get(keys: string[]): Promise<Record<string, any>> {
    const values = await this.storage.get(keys);
    const result: Record<string, any> = {};
    for (const key of keys) {
      const raw = values[key];
      if (!SENSITIVE.has(key) || raw === undefined) {
        if (raw !== undefined) result[key] = raw;
        continue;
      }
      await vaultKey();
      if (!isSealed(raw)) {
        throw new Error('Unencrypted sensitive storage requires migration.');
      }
      result[key] = await unsealJson(raw, 'chrome-storage/' + key);
    }
    return result;
  }

  async set(items: Record<string, any>): Promise<void> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(items)) {
      out[key] = SENSITIVE.has(key)
        ? await sealJson(value, 'chrome-storage/' + key)
        : value;
    }
    await this.storage.set(out);
  }

  remove(keys: string[]): Promise<void> {
    return this.storage.remove(keys);
  }
}

/** Legacy plaintext values are encrypted without first re-exporting them. */
export async function migrateSensitiveStorage(): Promise<void> {
  const raw = await chrome.storage.local.get([...SENSITIVE_STORAGE_KEYS]);
  const next: Record<string, any> = {};
  for (const key of SENSITIVE_STORAGE_KEYS) {
    if (!Object.hasOwn(raw, key) || isSealed(raw[key])) continue;
    next[key] = await sealJson(raw[key], 'chrome-storage/' + key);
  }
  if (Object.keys(next).length) {
    await chrome.storage.local.set(next);
  }
}
