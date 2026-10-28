/** A Dexie table ensures independent windows never overwrite the mutation log. */
import { db } from '../storage/db';
import { type RecordInput } from '../data/repo/types';
import { type CloudRecord, fromLocal, keyOf } from './merge';

export const CLOUD_JOURNAL_TABLE = 'SavedCloudJournal';
export const CLOUD_JOURNAL_SCHEMA = 'key, entity, updated_at';

export interface CloudJournalRow extends RecordInput {
  key: string;
  deleted: boolean;
}

export async function recordCloudChange(record: RecordInput): Promise<void> {
  const row: CloudJournalRow = {
    ...record,
    key: keyOf(record),
    deleted: !!record.deleted,
  };
  await db.table<CloudJournalRow>(CLOUD_JOURNAL_TABLE).put(row);
}

export async function localTombstones(
  deviceId: string,
): Promise<CloudRecord[]> {
  const rows = await db
    .table<CloudJournalRow>(CLOUD_JOURNAL_TABLE)
    .toArray();
  return rows.filter((r) => r.deleted).map((r) => fromLocal(r, deviceId));
}

/** Preserve a remote deletion so an older offline device cannot revive it. */
export async function rememberRemoteDeletion(
  record: CloudRecord,
): Promise<void> {
  if (!record.deleted) return;
  await recordCloudChange(record);
}
