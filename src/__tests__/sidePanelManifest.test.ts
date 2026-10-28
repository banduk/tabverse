import { readFileSync, existsSync } from 'node:fs';
import { expect, test } from 'vitest';

test('Chrome toolbar opens a packaged native side panel', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../manifest.json', import.meta.url), 'utf-8'),
  );
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toContain('sidePanel');
  expect(manifest.side_panel.default_path).toBe('sidepanel.html');
  expect(manifest.action.default_popup).toBeUndefined();
  expect(
    existsSync(new URL('../../sidepanel.html', import.meta.url)),
  ).toBe(true);
  expect(manifest.content_security_policy.extension_pages).toContain(
    "script-src 'self'",
  );
});
