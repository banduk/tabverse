/** Authenticated JSON envelope; all payloads have random nonces and AAD. */
import { fromBase64, toBase64 } from '../cloud/crypto';
import { vaultKey } from './keyring';

export interface SealedValue {
  __vault_v1: true;
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isSealed(value: unknown): value is SealedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<SealedValue>).__vault_v1 === true
  );
}

export async function sealJson(
  value: unknown,
  context: string,
): Promise<SealedValue> {
  const key = await vaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      additionalData: encoder.encode(context),
    },
    key,
    data,
  );
  return {
    __vault_v1: true,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

export async function unsealJson<T>(
  envelope: SealedValue,
  context: string,
): Promise<T> {
  const key = await vaultKey();
  if (!isSealed(envelope)) {
    throw new Error('Expected an encrypted vault record.');
  }
  const iv = fromBase64(envelope.iv);
  if (iv.length !== 12) throw new Error('Invalid vault IV.');
  try {
    const clear = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
        additionalData: encoder.encode(context),
      },
      key,
      new Uint8Array(fromBase64(envelope.ciphertext)),
    );
    return JSON.parse(decoder.decode(clear)) as T;
  } catch {
    throw new Error('Cannot authenticate local vault record: ' + context);
  }
}
