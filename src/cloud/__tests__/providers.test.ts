import { expect, test, vi } from 'vitest';
import {
  GoogleDriveFiles,
  GitHubFiles,
  fileName,
  GITHUB_ORIGIN,
  DRIVE_ORIGIN,
} from '../providers';

test('Drive only accesses appDataFolder and writes JSON with bearer auth', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (String(input).includes('/drive/v3/files?')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'f1' }), { status: 200 });
  });
  const drive = new GoogleDriveFiles('mock-token', mock as typeof fetch);
  expect(await drive.list()).toEqual([]);
  await drive.write(fileName('123'), '{"encrypted":true}');
  expect(calls[0].url.startsWith(DRIVE_ORIGIN)).toBe(true);
  expect(calls[0].url).toContain('appDataFolder');
  expect(JSON.stringify(calls[1])).toContain('appDataFolder');
  expect(JSON.stringify(calls)).not.toContain('https://evil.example');
});

test('GitHub refuses any public repository', async () => {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify({ private: false }), { status: 200 }),
  );
  const github = new GitHubFiles('token', 'owner/repo', mock as typeof fetch);
  await expect(github.list()).rejects.toThrow('PRIVATE');
});

test('GitHub writes only to the private repo contents API', async () => {
  const urls: string[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/repos/alice/private')) {
      return new Response(JSON.stringify({ private: true }), {
        status: 200,
      });
    }
    if (url.endsWith('/contents/.tabverse-private/v1')) {
      return new Response('', { status: 404 });
    }
    return new Response(JSON.stringify({ content: { sha: 'ok' } }), {
      status: 201,
    });
  });
  const github = new GitHubFiles(
    'token',
    'alice/private',
    mock as typeof fetch,
  );
  expect(await github.list()).toEqual([]);
  await github.write(fileName('123'), '{"version":1}');
  expect(urls.every((url) => url.startsWith(GITHUB_ORIGIN))).toBe(true);
  expect(urls.at(-1)).toContain('/repos/alice/private/contents/');
});

test('GitHub rejects crafted repository identifiers', () => {
  expect(() => new GitHubFiles('token', '../public')).toThrow();
  expect(() => new GitHubFiles('token', 'other/../bad')).toThrow();
});
