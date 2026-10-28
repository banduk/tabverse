import { TabSpaceDatabase } from './TabSpaceDatabase';
import { applyVaultMiddleware } from '../vault/indexedDb';

// The database handle. Change observation lives in data/repo/changeFeed.ts,
// which hooks Dexie's own write hooks - no addon, no BroadcastChannel.
export const dbImpl = new TabSpaceDatabase();
applyVaultMiddleware(dbImpl);
