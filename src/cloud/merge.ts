import { isEntityName, type RecordInput } from '../data/repo/types';

export interface CloudRecord extends RecordInput {
  deleted: boolean;
  source: string;
}

export interface CloudSnapshot {
  format: 'tabverse.private.snapshot.v1';
  deviceId: string;
  records: CloudRecord[];
}

export function keyOf(record: Pick<CloudRecord, 'entity' | 'id'>): string {
  return record.entity + '/' + record.id;
}

/** Conflicts are deterministic: timestamp, deletion, source, then payload. */
export function winner(a: CloudRecord, b: CloudRecord): CloudRecord {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at > b.updated_at ? a : b;
  }
  if (a.deleted !== b.deleted) return a.deleted ? a : b;
  if (a.source !== b.source) return a.source > b.source ? a : b;
  return a.payload >= b.payload ? a : b;
}

export function mergeRecords(records: CloudRecord[]): CloudRecord[] {
  const merged = new Map<string, CloudRecord>();
  for (const row of records) {
    const key = keyOf(row);
    const prev = merged.get(key);
    merged.set(key, prev ? winner(prev, row) : row);
  }
  return Array.from(merged.values()).sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b)),
  );
}

export function fromLocal(
  record: RecordInput,
  deviceId: string,
): CloudRecord {
  return {
    ...record,
    deleted: !!record.deleted,
    source: deviceId,
  };
}

export function readSnapshot(value: unknown): CloudSnapshot {
  const doc = value as Partial<CloudSnapshot> | null;
  if (
    !doc ||
    doc.format !== 'tabverse.private.snapshot.v1' ||
    typeof doc.deviceId !== 'string' ||
    !Array.isArray(doc.records) ||
    doc.records.length > 100_000
  ) {
    throw new Error('Invalid cloud snapshot format.');
  }
  for (const item of doc.records) {
    if (
      !item ||
      !isEntityName(item.entity) ||
      typeof item.id !== 'string' ||
      typeof item.payload !== 'string' ||
      typeof item.source !== 'string' ||
      typeof item.updated_at !== 'number' ||
      !Number.isFinite(item.updated_at) ||
      typeof item.deleted !== 'boolean'
    ) {
      throw new Error('Invalid cloud snapshot record.');
    }
  }
  return doc as CloudSnapshot;
}

export function snapshotFor(
  deviceId: string,
  records: CloudRecord[],
): CloudSnapshot {
  return {
    format: 'tabverse.private.snapshot.v1',
    deviceId,
    records: mergeRecords(records),
  };
}
