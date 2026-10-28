import { expect, test } from 'vitest';
import { seal, unseal } from '../crypto';

test('encrypts snapshots without exposing plaintext', async () => {
  const clear = JSON.stringify({
    url: 'https://internal.example/?secret=do-not-leak',
  });
  const encrypted = await seal(clear, 'a very long private passphrase');
  const serialized = JSON.stringify(encrypted);
  expect(serialized).not.toContain('do-not-leak');
  expect(await unseal(encrypted, 'a very long private passphrase')).toBe(clear);
});

test('uses a random salt and IV for identical plaintext', async () => {
  const first = await seal('same content', 'a very long private passphrase');
  const second = await seal('same content', 'a very long private passphrase');
  expect(first.salt).not.toBe(second.salt);
  expect(first.iv).not.toBe(second.iv);
});

test('refuses the wrong passphrase before any upload', async () => {
  const data = await seal('private', 'a very long private passphrase');
  await expect(unseal(data, 'a wrong long passphrase')).rejects.toThrow(
    'Cannot decrypt',
  );
});
