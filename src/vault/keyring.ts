/** Local vault: an independent 256-bit DEK, wrapped by a passphrase-derived KEK. */
import { fromBase64, toBase64 } from '../cloud/crypto';

export const VAULT_META_KEY = 'tabverse_local_vault_metadata_v1';
export const VAULT_SESSION_KEY = 'tabverse_local_vault_dek_v1';

export interface VaultMetadata {
  version: 1;
  salt: string;
  iv: string;
  wrapped: string;
  migrated: boolean;
}

const encoder = new TextEncoder();
const ROUNDS = 310_000;
let cached: CryptoKey | null = null;

export class VaultLockedError extends Error {
  constructor() {
    super('Local encrypted vault is locked. Unlock it in Tabverse.');
    this.name = 'VaultLockedError';
  }
}

async function passwordKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const input = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      hash: 'SHA-256',
      iterations: ROUNDS,
    },
    input,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function readVaultMetadata(): Promise<VaultMetadata | null> {
  const item = await chrome.storage.local.get(VAULT_META_KEY);
  const value = item[VAULT_META_KEY] as VaultMetadata | undefined;
  if (!value) return null;
  if (
    value.version !== 1 ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string' ||
    typeof value.wrapped !== 'string' ||
    typeof value.migrated !== 'boolean'
  ) {
    throw new Error('Invalid local vault metadata. Do not reset your data.');
  }
  return value;
}

async function putSessionKey(bytes: Uint8Array): Promise<CryptoKey> {
  await chrome.storage.session.set({ [VAULT_SESSION_KEY]: toBase64(bytes) });
  cached = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(bytes),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  return cached;
}

export async function createVault(passphrase: string): Promise<void> {
  if (passphrase.length < 12) {
    throw new Error('Choose a vault passphrase with at least 12 characters.');
  }
  if (await readVaultMetadata()) {
    throw new Error('Vault already initialized; unlock instead.');
  }
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await passwordKey(passphrase, salt);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    wrappingKey,
    dek,
  );
  const meta: VaultMetadata = {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrapped: toBase64(new Uint8Array(wrapped)),
    migrated: false,
  };
  await chrome.storage.local.set({ [VAULT_META_KEY]: meta });
  await putSessionKey(dek);
}

export async function unlockVault(passphrase: string): Promise<void> {
  const meta = await readVaultMetadata();
  if (!meta) throw new Error('Vault has not been initialized.');
  const wrappingKey = await passwordKey(passphrase, fromBase64(meta.salt));
  let dek: ArrayBuffer;
  try {
    dek = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(fromBase64(meta.iv)) },
      wrappingKey,
      new Uint8Array(fromBase64(meta.wrapped)),
    );
  } catch {
    throw new Error('Incorrect vault passphrase or damaged key metadata.');
  }
  if (dek.byteLength !== 32) {
    throw new Error('Invalid encrypted data key length.');
  }
  await putSessionKey(new Uint8Array(dek));
}

export async function vaultKey(): Promise<CryptoKey> {
  if (cached) return cached;
  const data = await chrome.storage.session.get(VAULT_SESSION_KEY);
  const encoded = data[VAULT_SESSION_KEY];
  if (typeof encoded !== 'string') throw new VaultLockedError();
  const raw = fromBase64(encoded);
  if (raw.length !== 32) throw new VaultLockedError();
  cached = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  return cached;
}

export async function isVaultUnlocked(): Promise<boolean> {
  try {
    await vaultKey();
    return true;
  } catch {
    return false;
  }
}

export async function lockVault(): Promise<void> {
  cached = null;
  await chrome.storage.session.remove([VAULT_SESSION_KEY, 'tabverse_private_cloud_session_v1']);
}

/** Lock other extension contexts when the user locks this one. */
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[VAULT_SESSION_KEY]) {
      cached = null;
    }
  });
}

export async function markVaultMigrated(): Promise<void> {
  const meta = await readVaultMetadata();
  if (!meta) throw new VaultLockedError();
  await chrome.storage.local.set({
    [VAULT_META_KEY]: { ...meta, migrated: true },
  });
}
