import { expect, test } from 'vitest';
import { mergeRecords, readSnapshot, snapshotFor } from '../merge';
import { type CloudRecord } from '../merge';

const tab = (
  device: string,
  updated: number,
  deleted = false,
): CloudRecord => ({
  source: device,
  entity: 'tab',
  id: 'tab1',
  updated_at: updated,
  deleted,
  payload: deleted ? '' : '{"title":"hello"}',
});

test('newer remote update wins over stale local record', () => {
  const rows = mergeRecords([tab('a', 5), tab('b', 6)]);
  expect(rows).toHaveLength(1);
  expect(rows[0].source).toBe('b');
});

test('newer deletion prevents resurrection', () => {
  const rows = mergeRecords([tab('a', 10), tab('b', 11, true)]);
  expect(rows).toHaveLength(1);
  expect(rows[0].deleted).toBe(true);
});

test('a deletion wins a same-time conflict', () => {
  expect(mergeRecords([tab('b', 10), tab('a', 10, true)])[0].deleted).toBe(
    true,
  );
});

test('snapshots are deterministic regardless of API list order', () => {
  const a = snapshotFor('a', [tab('b', 8), tab('a', 7)]);
  const b = snapshotFor('a', [tab('a', 7), tab('b', 8)]);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(readSnapshot(a)).toEqual(a);
});

test('rejects corrupt or unauthorized entities', () => {
  expect(() => readSnapshot({ format: 'wrong', records: [] })).toThrow();
  const doc = snapshotFor('a', [tab('a', 5)]);
  expect(() =>
    readSnapshot({
      ...doc,
      records: [{ ...doc.records[0], entity: 'password' }],
    }),
  ).toThrow();
});
