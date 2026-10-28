/**
 * Dexie DBCore boundary: encrypt every non-indexed field before IndexedDB
 * writes; decrypt on reads. No application-level caller handles ciphertext.
 *
 * Only opaque IDs and strictly necessary query metadata remain indexed.
 * Never use this middleware in schema upgrades, which bypass DBCore.
 */
import Dexie from 'dexie';
import { isSealed, sealJson, unsealJson, type SealedValue } from './seal';
import { vaultKey } from './keyring';

const PUBLIC: Record<string, string[]> = {
  SavedTab: ['id', 'createdAt'],
  SavedTabSpace: ['id', 'windowId', 'createdAt'],
  SavedNote: ['id', 'createdAt', 'tabSpaceId'],
  SavedAllNote: ['id', 'createdAt', 'tabSpaceId'],
  SavedTodo: ['id', 'createdAt', 'tabSpaceId'],
  SavedAllTodo: ['id', 'createdAt', 'tabSpaceId'],
  SavedBookmark: ['id', 'createdAt', 'tabSpaceId'],
  SavedAllBookmark: ['id', 'createdAt', 'tabSpaceId'],
  SavedClosedTab: ['id', 'tabSpaceId', 'closedAt'],
  SavedTabPreview: ['id', 'capturedAt', 'sessionId'],
  SavedCloudJournal: ['key', 'entity', 'updated_at'],
};

let legacyAllowed = false;

export function allowLegacyVaultRecords(value: boolean): void {
  legacyAllowed = value;
}

export const ENCRYPTED_TABLES = Object.keys(PUBLIC);

/** Keep the public AAD fields in a canonical order. */
function publicFields(table: string, row: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC[table]) {
    if (Object.hasOwn(row, field)) out[field] = row[field];
  }
  return out;
}

function rowAAD(table: string, fields: Record<string, unknown>): string {
  return 'tabverse-local-vault-v1/' + table + '/' + JSON.stringify(fields);
}

export async function encryptVaultRow(
  table: string,
  row: Record<string, any>,
): Promise<Record<string, any>> {
  const fields = publicFields(table, row);
  const identifier = table === 'SavedCloudJournal' ? fields.key : fields.id;
  if (typeof identifier !== 'string')
    throw new Error('Missing vault primary key');
  const payload = await sealJson(row, rowAAD(table, fields));
  return { ...fields, __vault: payload };
}

export async function decryptVaultRow(
  table: string,
  raw: Record<string, any> | undefined,
): Promise<any> {
  await vaultKey();
  if (!raw) return undefined;
  if (!isSealed(raw.__vault)) {
    if (legacyAllowed) return raw;
    throw new Error(
      'Unencrypted legacy record: unlock and finish vault migration.',
    );
  }
  const fields = publicFields(table, raw);
  const clear = await unsealJson<Record<string, any>>(
    raw.__vault as SealedValue,
    rowAAD(table, fields),
  );
  // Prevent tampered public metadata from taking precedence.
  for (const [name, value] of Object.entries(fields)) {
    if (JSON.stringify(clear[name]) !== JSON.stringify(value)) {
      throw new Error('Vault record metadata authentication failed.');
    }
  }
  return clear;
}

/**
 * Crypto is asynchronous. Dexie.waitFor preserves the transaction while
 * WebCrypto finishes, avoiding premature IndexedDB autocommit.
 */
export function applyVaultMiddleware(db: Dexie): void {
  db.use({
    name: 'tabverse-local-vault',
    stack: 'dbcore',
    create: (dbcore) => ({
      ...dbcore,
      table: (name) => {
        const inner = dbcore.table(name);
        if (!PUBLIC[name]) return inner;
        const read = (value: any) => decryptVaultRow(name, value);
        const readMany = (values: any[]) =>
          Dexie.waitFor(Promise.all(values.map(read)));
        return {
          ...inner,
          mutate: (request) => {
            if (request.type !== 'add' && request.type !== 'put') {
              return Dexie.waitFor(vaultKey()).then(() =>
                inner.mutate(request),
              );
            }
            return Dexie.waitFor(
              Promise.all(
                request.values.map((value) => encryptVaultRow(name, value)),
              ),
            ).then((values) => inner.mutate({ ...request, values }));
          },
          get: (request) =>
            inner.get(request).then((value) => Dexie.waitFor(read(value))),
          getMany: (request) =>
            inner.getMany(request).then((values) => readMany(values)),
          query: (request) =>
            inner.query(request).then(async (response) => {
              await vaultKey();
              if (!request.values) return response;
              return {
                ...response,
                result: await readMany(response.result),
              };
            }),
          count: (request) =>
            Dexie.waitFor(vaultKey()).then(() => inner.count(request)),
          openCursor: async (request) => {
            await Dexie.waitFor(vaultKey());
            const native = await inner.openCursor(request);
            if (!native || !request.values) return native;

            // Async decryption inside an IDB cursor callback can deadlock
            // Dexie's start()/continue() protocol. Drain raw rows first,
            // finish the IDB transaction, then iterate decrypted rows.
            // This is intentionally bounded by the caller's query range.
            const found: {
              key: any;
              primaryKey: any;
              value: any;
            }[] = [];
            await native.start(() => {
              found.push({
                key: native.key,
                primaryKey: native.primaryKey,
                value: native.value,
              });
              native.continue();
            });

            const values = await readMany(found.map((row) => row.value));
            const rows = found.map((row, index) => ({
              ...row,
              value: values[index],
            }));
            let position = 0;
            let onNext: (() => void) | null = null;
            let resolve: ((value?: any) => void) | null = null;
            let reject: ((reason?: any) => void) | null = null;
            let done = false;

            const step = () => {
              if (done) return;
              if (position >= rows.length) {
                done = true;
                resolve?.();
                return;
              }
              try {
                onNext?.();
              } catch (error) {
                done = true;
                reject?.(error);
              }
            };
            const advance = (count: number) => {
              position += count;
              queueMicrotask(step);
            };
            const proxy = {
              trans: request.trans,
              get key() {
                return rows[position]?.key;
              },
              get primaryKey() {
                return rows[position]?.primaryKey;
              },
              get value() {
                return rows[position]?.value;
              },
              get done() {
                return done || position >= rows.length;
              },
              continue(key?: any) {
                if (key === undefined) {
                  advance(1);
                  return;
                }
                position += 1;
                while (
                  position < rows.length &&
                  (request.reverse
                    ? Dexie.cmp(rows[position].key, key) > 0
                    : Dexie.cmp(rows[position].key, key) < 0)
                ) {
                  position += 1;
                }
                queueMicrotask(step);
              },
              continuePrimaryKey(key: any, primaryKey: any) {
                position += 1;
                while (
                  position < rows.length &&
                  ((request.reverse
                    ? Dexie.cmp(rows[position].key, key) > 0
                    : Dexie.cmp(rows[position].key, key) < 0) ||
                    (Dexie.cmp(rows[position].key, key) === 0 &&
                      (request.reverse
                        ? Dexie.cmp(rows[position].primaryKey, primaryKey) > 0
                        : Dexie.cmp(rows[position].primaryKey, primaryKey) < 0)))
                ) {
                  position += 1;
                }
                queueMicrotask(step);
              },
              advance,
              start(callback: () => void) {
                onNext = callback;
                done = false;
                return new Promise<any>((yes, no) => {
                  resolve = yes;
                  reject = no;
                  queueMicrotask(step);
                });
              },
              stop(value?: any) {
                done = true;
                resolve?.(value);
              },
              fail(error: Error) {
                done = true;
                reject?.(error);
              },
              async next() {
                position += 1;
                return proxy;
              },
            };
            return proxy;
          },
        };
      },
    }),
  });
}
