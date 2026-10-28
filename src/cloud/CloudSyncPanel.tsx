import React, { useEffect, useState } from 'react';
import { Button, InputGroup } from '@blueprintjs/core';
import {
  type CloudConfig,
  type CloudProvider,
  type CloudSession,
  type CloudStatus,
  disconnectCloud,
  loadCloudConfig,
  loadCloudSession,
  loadCloudStatus,
  saveCloudConfig,
  unlockCloudSession,
} from './config';
import { GITHUB_ORIGIN, DRIVE_ORIGIN, GitHubFiles } from './providers';

interface SyncResponse {
  ok: boolean;
  result?: { records: number; uploaded: boolean; applied: number };
  error?: string;
}

export async function requestSyncNow(): Promise<SyncResponse> {
  return chrome.runtime.sendMessage({
    type: 'tabverse_personal_cloud_sync_now',
  }) as Promise<SyncResponse>;
}

export function CloudSyncPanel() {
  const [configured, setConfigured] = useState<CloudConfig | null>(null);
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [provider, setProvider] = useState<CloudProvider>('drive');
  const [repo, setRepo] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const googleReady = Boolean(
    typeof chrome !== 'undefined' &&
      chrome.runtime?.getManifest?.().oauth2?.client_id,
  );

  useEffect(() => {
    void Promise.all([loadCloudConfig(), loadCloudStatus()]).then(
      ([cfg, state]) => {
        setConfigured(cfg);
        setStatus(state);
        if (cfg) {
          setProvider(cfg.provider);
          setRepo(cfg.githubRepo ?? '');
        }
      },
    );
  }, []);

  async function authorize(): Promise<CloudSession> {
    if (passphrase.length < 12) {
      throw new Error('Enter a sync passphrase of at least 12 characters.');
    }
    const origin = provider === 'drive' ? DRIVE_ORIGIN : GITHUB_ORIGIN;
    const allowed = await chrome.permissions.request({
      origins: [origin + '/*'],
    });
    if (!allowed) throw new Error('Network permission was denied.');

    if (provider === 'drive') {
      if (!googleReady) {
        throw new Error(
          'Build the extension with TABVERSE_GOOGLE_CLIENT_ID. See CLOUD_SYNC.md.',
        );
      }
      const auth = await chrome.identity.getAuthToken({
        interactive: true,
      });
      if (!auth.token) throw new Error('Google authorization failed.');
    } else {
      if (!token.trim())
        throw new Error('Enter your fine-grained GitHub token.');
      await new GitHubFiles(token.trim(), repo.trim()).assertPrivateRepo();
    }
    return {
      passphrase,
      githubToken: provider === 'github' ? token.trim() : undefined,
    };
  }

  async function runSync() {
    const response = await requestSyncNow();
    setStatus(await loadCloudStatus());
    if (!response?.ok) {
      throw new Error(response?.error ?? 'Cloud synchronization failed.');
    }
    setMessage(
      'Synchronized ' +
        response.result?.records +
        ' records. Uploaded: ' +
        (response.result?.uploaded ? 'yes' : 'no changes'),
    );
  }

  async function connect() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const session = await authorize();
      await unlockCloudSession(session);
      const cfg = await saveCloudConfig(provider, repo.trim());
      setConfigured(cfg);
      setToken('');
      await runSync();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncAgain() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (passphrase) {
        const oldSession = await loadCloudSession();
        await unlockCloudSession({
          passphrase,
          githubToken: token.trim() || oldSession?.githubToken,
        });
      }
      await runSync();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectCloud();
      setConfigured(null);
      setStatus(null);
      setToken('');
      setPassphrase('');
      setMessage(
        'Disconnected. Local and remote encrypted copies were retained.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Private cloud synchronization">
      <h3>Personal encrypted synchronization</h3>
      <p>
        Records are encrypted locally before transfer. Only Google Drive or a
        private GitHub repository can receive them.
      </p>
      <p>
        Active provider:{' '}
        <strong>{configured ? configured.provider : 'none'}</strong>. Sync
        automatically checks for changes every five minutes while unlocked.
      </p>
      <label htmlFor="cloud-provider">Provider</label>
      <select
        id="cloud-provider"
        value={provider}
        disabled={busy}
        onChange={(event) => setProvider(event.target.value as CloudProvider)}
      >
        <option value="drive">My Google Drive</option>
        <option value="github">My private GitHub repository</option>
      </select>
      {provider === 'drive' ? (
        <p>
          {googleReady
            ? 'Google OAuth is configured in this extension build.'
            : 'Google OAuth client ID is not configured. See CLOUD_SYNC.md.'}{' '}
          Files go to the hidden appDataFolder.
        </p>
      ) : (
        <>
          <label htmlFor="cloud-repo">Private repository (owner/repo)</label>
          <InputGroup
            id="cloud-repo"
            placeholder="owner/private-repo"
            value={repo}
            disabled={busy}
            onChange={(event) => setRepo(event.target.value)}
          />
          <label htmlFor="cloud-token">
            Fine-grained token (Contents: read/write)
          </label>
          <InputGroup
            id="cloud-token"
            type="password"
            autoComplete="off"
            value={token}
            disabled={busy}
            onChange={(event) => setToken(event.target.value)}
          />
        </>
      )}
      <label htmlFor="cloud-passphrase">Encryption passphrase</label>
      <InputGroup
        id="cloud-passphrase"
        type="password"
        autoComplete="off"
        placeholder="Same passphrase on your other computers"
        value={passphrase}
        disabled={busy}
        onChange={(event) => setPassphrase(event.target.value)}
      />
      <p>
        The passphrase and GitHub token are kept only in Chrome session storage,
        and must be provided again after a browser restart. Do not lose your
        passphrase: there is no recovery mechanism.
      </p>
      <Button
        intent="primary"
        loading={busy}
        onClick={() => void connect()}
        text={configured ? 'Change provider / unlock' : 'Connect and sync'}
      />{' '}
      <Button
        disabled={!configured || busy}
        onClick={() => void syncAgain()}
        text="Sync now"
      />{' '}
      <Button
        disabled={!configured || busy}
        onClick={() => void disconnect()}
        text="Disconnect"
      />
      {status ? (
        <p>
          Last run: {new Date(status.at).toLocaleString()} —{' '}
          {status.ok ? 'success' : status.error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
