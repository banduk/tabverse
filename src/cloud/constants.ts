/** Schema constants must not import Dexie; that would create an ESM cycle. */
export const CLOUD_JOURNAL_TABLE = 'SavedCloudJournal';
export const CLOUD_JOURNAL_SCHEMA = 'key, entity, updated_at';
