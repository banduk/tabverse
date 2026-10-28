import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  connectSrcFor,
  DEFAULT_CONNECT_SRC,
  withConnectSrc,
} from './manifestPolicy.mts';

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));

test('offline build allows no arbitrary network destinations', () => {
  expect(DEFAULT_CONNECT_SRC).toBe("'self'");
  expect(connectSrcFor(undefined)).toBe("'self'");
  expect(connectSrcFor('')).toBe("'self'");
  expect(() => connectSrcFor('https://example.com')).toThrow();
  expect(
    withConnectSrc("default-src 'self'; connect-src https:", "'self'"),
  ).toContain("connect-src 'self'");
});
test('no persistent host access or external pairing channel', () => {
  expect(manifest.host_permissions).toEqual([]);
  expect(manifest.optional_host_permissions).toEqual([
    'http://*/*',
    'https://*/*',
  ]);
  expect(manifest.externally_connectable).toBeUndefined();
  expect(manifest.content_security_policy.extension_pages).toContain(
    "frame-src 'none'",
  );
});
