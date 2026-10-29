import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { TABSPACE_DB_VERSION, TABSPACE_VERSION } from '../global';

test('upstream 0.7.4 onboarding preserves the encrypted local schema', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  );
  const manifest = JSON.parse(
    readFileSync(new URL('../manifest.json', import.meta.url), 'utf-8'),
  );
  const vite = readFileSync(
    new URL('../../vite.config.mts', import.meta.url),
    'utf-8',
  );
  const background = readFileSync(
    new URL('../background.ts', import.meta.url),
    'utf-8',
  );

  expect(pkg.version).toBe('0.7.4');
  expect(TABSPACE_VERSION).toBe('v0.7.4');
  expect(TABSPACE_DB_VERSION).toBe(13);
  expect(vite).toContain("sidepanel: fromRoot('sidepanel.html')");
  expect(vite).toContain("welcome: fromRoot('welcome.html')");
  expect(background).toContain('chrome.runtime.OnInstalledReason.INSTALL');
  expect(background).toContain("chrome.runtime.getURL('welcome.html')");
  expect(manifest.permissions).toContain('sidePanel');
  expect(manifest.action.default_popup).toBeUndefined();
  expect(manifest.content_security_policy.extension_pages).toContain(
    "script-src 'self'",
  );
});
