#!/usr/bin/env node
/** Build-time assertion: this Chrome extension cannot initiate remote network requests. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const bundledLicense = readFileSync('dist/LICENSE.txt', 'utf8');
assert.ok(bundledLicense.includes('Copyright (c) 2021 Tabverse'));
assert.ok(bundledLicense.includes('MIT License'));

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const csp = manifest.content_security_policy.extension_pages;
assert.deepEqual(manifest.host_permissions ?? [], []);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.optional_host_permissions?.length, 2);
assert.match(
  csp,
  /connect-src 'self' https:\/\/www\.googleapis\.com https:\/\/api\.github\.com/,
);
assert.match(csp, /img-src 'self' data: blob:/);
assert.match(csp, /frame-src 'none'/);
assert.ok(
  !/(?:https?:|wss?:)(?:\s|;)/.test(csp),
  'CSP allows broad remote schemes',
);
assert.ok(
  !csp.includes('https: ') && !csp.includes('wss:'),
  'CSP wildcard origin detected',
);

function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const item = join(folder, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
for (const path of walk('dist')) {
  if (!/\.(?:js|json|html|css)$/.test(path)) continue;
  const content = readFileSync(path, 'utf8');
  for (const forbidden of [
    'tabversed.liyu1981.xyz',
    'liyu1981.github.io/my-awesome-web-tool-gallery',
    'dummyimage.com',
  ]) {
    assert.ok(
      !content.includes(forbidden),
      `${path} contains blocked origin ${forbidden}`,
    );
  }
}
console.log('Tabverse Private: offline build policy verified');
