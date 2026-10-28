import { fromBase64, toBase64 } from './crypto';

export interface RemoteFile {
  name: string;
  id: string;
  sha?: string;
}

export interface CloudFiles {
  list(): Promise<RemoteFile[]>;
  read(file: RemoteFile): Promise<string>;
  write(name: string, text: string, existing?: RemoteFile): Promise<void>;
}

export const FILE_PREFIX = 'tabverse-private-v1-';
export function fileName(deviceId: string): string {
  return FILE_PREFIX + deviceId + '.json';
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error('Cloud API returned HTTP ' + response.status);
  }
  return (await response.json()) as T;
}

export const DRIVE_ORIGIN = 'https://www.googleapis.com';
export const GITHUB_ORIGIN = 'https://api.github.com';

export class GoogleDriveFiles implements CloudFiles {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetcher(DRIVE_ORIGIN + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + this.token,
        ...init.headers,
      },
    });
    if (response.status === 401) {
      throw new Error('Google authorization expired. Reconnect Google Drive.');
    }
    return response;
  }

  async list(): Promise<RemoteFile[]> {
    const files: RemoteFile[] = [];
    let page = '';
    do {
      const query = new URLSearchParams({
        spaces: 'appDataFolder',
        q: "name contains '" + FILE_PREFIX + "' and trashed = false",
        fields: 'nextPageToken,files(id,name)',
        pageSize: '1000',
      });
      if (page) query.set('pageToken', page);
      const result = await parseResponse<{
        nextPageToken?: string;
        files?: { id: string; name: string }[];
      }>(
        await this.request('/drive/v3/files?' + query.toString()),
      );
      for (const item of result.files ?? []) {
        if (
          item.name.startsWith(FILE_PREFIX) &&
          item.name.endsWith('.json')
        ) {
          files.push(item);
        }
      }
      page = result.nextPageToken ?? '';
    } while (page);
    return files;
  }

  async read(file: RemoteFile): Promise<string> {
    const response = await this.request(
      '/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media',
    );
    if (!response.ok) {
      throw new Error('Cannot read Google Drive snapshot: HTTP ' + response.status);
    }
    return response.text();
  }

  async write(
    name: string,
    text: string,
    existing?: RemoteFile,
  ): Promise<void> {
    let response: Response;
    if (existing) {
      response = await this.request(
        '/upload/drive/v3/files/' +
          encodeURIComponent(existing.id) +
          '?uploadType=media',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        },
      );
    } else {
      const boundary = 'tabverse_' + crypto.randomUUID();
      const metadata = JSON.stringify({
        name,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      });
      const body = [
        '--' + boundary,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        '--' + boundary,
        'Content-Type: application/json',
        '',
        text,
        '--' + boundary + '--',
        '',
      ].join('\r\n');
      response = await this.request(
        '/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/related; boundary=' + boundary,
          },
          body,
        },
      );
    }
    if (!response.ok) {
      throw new Error('Cannot write Google Drive snapshot: HTTP ' + response.status);
    }
  }
}

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  type: string;
}

export class GitHubFiles implements CloudFiles {
  private readonly owner: string;
  private readonly repo: string;
  private readonly folder = '.tabverse-private/v1';

  constructor(
    private readonly token: string,
    repo: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || repo.includes('..')) {
      throw new Error('Invalid GitHub repository name.');
    }
    [this.owner, this.repo] = repo.split('/');
  }

  private url(path: string): string {
    return (
      GITHUB_ORIGIN +
      '/repos/' +
      encodeURIComponent(this.owner) +
      '/' +
      encodeURIComponent(this.repo) +
      path
    );
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetcher(this.url(path), {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: 'Bearer ' + this.token,
        ...init.headers,
      },
    });
  }

  async assertPrivateRepo(): Promise<void> {
    const data = await parseResponse<{ private: boolean }>(
      await this.request(''),
    );
    if (!data.private) {
      throw new Error('Choose a PRIVATE GitHub repository for sync.');
    }
  }

  async list(): Promise<RemoteFile[]> {
    await this.assertPrivateRepo();
    const response = await this.request(
      '/contents/' + this.folder,
    );
    if (response.status === 404) return [];
    const entries = await parseResponse<GitHubContent[]>(response);
    if (!Array.isArray(entries)) {
      throw new Error('GitHub cloud directory is not a directory.');
    }
    return entries
      .filter(
        (item) =>
          item.type === 'file' &&
          item.name.startsWith(FILE_PREFIX) &&
          item.name.endsWith('.json'),
      )
      .map((item) => ({
        id: item.path,
        name: item.name,
        sha: item.sha,
      }));
  }

  async read(file: RemoteFile): Promise<string> {
    if (!file.sha || !/^[0-9a-f]{40}$/.test(file.sha)) {
      throw new Error('Invalid GitHub cloud file SHA.');
    }
    const blob = await parseResponse<{ content: string; encoding: string }>(
      await this.request('/git/blobs/' + file.sha),
    );
    if (blob.encoding !== 'base64') {
      throw new Error('Unsupported GitHub cloud blob encoding.');
    }
    return new TextDecoder().decode(fromBase64(blob.content));
  }

  async write(
    name: string,
    text: string,
    existing?: RemoteFile,
  ): Promise<void> {
    const path = this.folder + '/' + name;
    const encoded = toBase64(new TextEncoder().encode(text));
    const response = await this.request('/contents/' + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Tabverse private encrypted sync: ' + name,
        content: encoded,
        ...(existing?.sha ? { sha: existing.sha } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(
        'GitHub cloud write returned HTTP ' +
          response.status +
          '. Retry sync if the file changed.',
      );
    }
  }
}
