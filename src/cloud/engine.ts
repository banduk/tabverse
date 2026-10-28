/** Serverless, per-device encrypted snapshots for Google Drive or GitHub. */
import {
  type CloudConfig,
  type CloudSession,
  CLOUD_STATUS_KEY,
  loadCloudConfig,
  loadCloudSession,
} from './config';
import { seal, unseal, type EncryptedDocument } from './crypto';
import {
  type CloudRecord,
  fromLocal,
  keyOf,
  mergeRecords,
  readSnapshot,
  snapshotFor,
} from './merge';
import {
  fileName,
  GitHubFiles,
  GoogleDriveFiles,
  type CloudFiles,
} from './providers';
import { localTombstones, rememberRemoteDeletion } from './journal';
import { listLocalRecords, applyServerRecords } from '../data/repo/dbBridge';
import { runAsRemoteApply } from '../data/repo/changeFeed';
import { type SyncRecord } from '../data/repo/types';

export interface CloudSyncResult {
  records: number;
  uploaded: boolean;
  applied: number;
}

let running: Promise<CloudSyncResult> | null = null;

async function getProvider(
  config: CloudConfig,
  session: CloudSession,
): Promise<CloudFiles> {
  if (config.provider === 'github') {
    if (!session.githubToken) {
      throw new Error('Unlock GitHub sync with your repository token.');
    }
    return new GitHubFiles(session.githubToken, config.githubRepo ?? '');
  }
  if (!chrome.runtime.getManifest().oauth2?.client_id) {
    throw new Error(
      'Google OAuth client ID is missing from this build. See CLOUD_SYNC.md.',
    );
  }
  const auth = await chrome.identity.getAuthToken({ interactive: false });
  if (!auth?.token) {
    throw new Error('Connect Google Drive from Settings to authorize sync.');
  }
  return new GoogleDriveFiles(auth.token);
}

async function doSync(
  config: CloudConfig,
  session: CloudSession,
  provider: CloudFiles,
): Promise<CloudSyncResult> {
  if (session.passphrase.length < 12) {
    throw new Error('Unlock sync with your 12+ character passphrase.');
  }

  // Read and decrypt *every* device file before doing any write.
  // A wrong password or a corrupted file must never overwrite the vault.
  const remoteFiles = await provider.list();
  const allRecords: CloudRecord[] = [];
  let ownFile: (typeof remoteFiles)[number] | undefined;
  let ownPlain = '';

  for (const file of remoteFiles) {
    if (!file.name.startsWith('tabverse-private-v1-')) continue;
    const encrypted = JSON.parse(await provider.read(file)) as EncryptedDocument;
    const text = await unseal(encrypted, session.passphrase);
    const snapshot = readSnapshot(JSON.parse(text));
    if (file.name !== fileName(snapshot.deviceId)) {
      throw new Error('A cloud file has an unexpected device identifier.');
    }
    allRecords.push(...snapshot.records);
    if (snapshot.deviceId === config.deviceId) {
      ownFile = file;
      ownPlain = JSON.stringify(snapshot);
    }
  }

  const local = (await listLocalRecords()).map((record) =>
    fromLocal(record, config.deviceId),
  );
  const deletions = await localTombstones(config.deviceId);
  const localMerged = mergeRecords([...local, ...deletions]);
  const merged = mergeRecords([...allRecords, ...localMerged]);
  const localByKey = new Map(localMerged.map((r) => [keyOf(r), r]));

  const apply: SyncRecord[] = [];
  for (const record of merged) {
    const current = localByKey.get(keyOf(record));
    if (
      !current ||
      current.deleted !== record.deleted ||
      current.payload !== record.payload ||
      current.updated_at < record.updated_at
    ) {
      apply.push({
        ...record,
        rev: 0,
        server_at: Date.now(),
        device_id: record.source,
      });
    }
  }
  if (apply.length) {
    await runAsRemoteApply(async () => {
      await applyServerRecords(apply);
      for (const row of apply) {
        if (row.deleted) {
          await rememberRemoteDeletion({
            ...row,
            source: row.device_id ?? config.deviceId,
          });
        }
      }
    });
  }

  const snapshot = snapshotFor(config.deviceId, merged);
  const plain = JSON.stringify(snapshot);
  const uploaded = ownPlain !== plain;
  if (uploaded) {
    const doc = await seal(plain, session.passphrase);
    await provider.write(
      fileName(config.deviceId),
      JSON.stringify(doc),
      ownFile,
    );
  }
  return { records: merged.length, uploaded, applied: apply.length };
}

export async function syncPrivateCloud(): Promise<CloudSyncResult> {
  if (running) return running;
  running = (async () => {
    const config = await loadCloudConfig();
    if (!config) throw new Error('Choose a cloud provider in Settings.');
    try {
      const session = await loadCloudSession();
      if (!session) {
        throw new Error(
          'Sync is locked. Unlock in Settings after restarting Chrome.',
        );
      }
      const provider = await getProvider(config, session);
      const outcome = await doSync(config, session, provider);
      await chrome.storage.local.set({
        [CLOUD_STATUS_KEY]: {
          at: Date.now(),
          provider: config.provider,
          ok: true,
          records: outcome.records,
          uploaded: outcome.uploaded,
        },
      });
      return outcome;
    } catch (err) {
      await chrome.storage.local.set({
        [CLOUD_STATUS_KEY]: {
          at: Date.now(),
          provider: config.provider,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Injected provider and data seams are exercised in unit tests. */
export { doSync };
