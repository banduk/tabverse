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
  if (typeof identifier !== 'string') throw new Error('Missing vault primary key');
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
    throw new Error('Unencrypted legacy record: unlock and finish vault migration.');
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
              return Dexie.waitFor(vaultKey()).then(() => inner.mutate(request));
            }
            return Dexie.waitFor(
              Promise.all(request.values.map((value) =>
                encryptVaultRow(name, value),
              )),
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
            const cursor = await inner.openCursor(request);
            if (!cursor || !request.values) return cursor;
            // Cursor value is synchronous; prepare a decrypted copy for each
            // cursor step, including start(), which drives Dexie's each().
            const wrap = async (c: typeof cursor): Promise<typeof cursor> => {
              const decoded = await Dexie.waitFor(read(c.value));
              let current = decoded;
              return new Proxy(c, {
                get(target, prop) {
                  if (prop === 'value') return current;
                  if (prop === 'next') {
                    return async () => {
                      const next = await target.next();
                      return next ? wrap(next) : next;
                    };
                  }
                  if (prop === 'start') {
                    return (onNext: () => void) =>
                      target.start(() => {
                        void Dexie.waitFor(read(target.value)).then((value) => {
                          current = value;
                          onNext();
                        });
                      });
                  }
                  const value = Reflect.get(target, prop);
                  return typeof value === 'function'
                    ? value.bind(target)
                    : value;
                },
              });
            };
            return wrap(cursor);
          },
        };
      },
    }),
  });
}
