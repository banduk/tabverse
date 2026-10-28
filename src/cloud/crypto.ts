/** AES-256-GCM + PBKDF2. No plaintext or passphrase is uploaded to a provider. */
export interface EncryptedDocument {
  version: 1;
  salt: string;
  iv: string;
  data: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310_000;

export function toBase64(bytes: Uint8Array): string {
  let data = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    data += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(data);
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(
  plaintext: string,
  passphrase: string,
): Promise<EncryptedDocument> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function unseal(
  document: EncryptedDocument,
  passphrase: string,
): Promise<string> {
  if (
    !document ||
    document.version !== 1 ||
    typeof document.salt !== 'string' ||
    typeof document.iv !== 'string' ||
    typeof document.data !== 'string'
  ) {
    throw new Error('Unsupported or malformed encrypted cloud snapshot.');
  }
  const salt = fromBase64(document.salt);
  const iv = fromBase64(document.iv);
  if (salt.length !== 16 || iv.length !== 12) {
    throw new Error('Malformed cloud snapshot encryption parameters.');
  }
  try {
    const key = await derive(passphrase, salt);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(fromBase64(document.data)),
    );
    return decoder.decode(clear);
  } catch {
    throw new Error(
      'Cannot decrypt cloud data. Check the passphrase; nothing was uploaded.',
    );
  }
}
