import { Tab, TAB_DB_TABLE_NAME } from './Tab';
import { TABSPACE_DB_TABLE_NAME } from './TabSpace';
import { db } from '../../storage/db';
import { getLogger } from '../../storage/dbAuditorManager';

export async function dbAuditor(logs: string[]): Promise<void> {
  const logger = getLogger(logs);
  logger('tabSpace dbAuditor start to process...');
  const tabsData = await db.table<Tab>(TAB_DB_TABLE_NAME).toArray();
  // The multi-entry tabIds index is intentionally absent: it would disclose
  // a plaintext list of workspace membership. Check decrypted aggregates.
  const tabspaces: { tabIds?: string[] }[] = await db
    .table(TABSPACE_DB_TABLE_NAME)
    .toArray();
  const referenced = new Set(tabspaces.flatMap((space) => space.tabIds ?? []));
  const auditTab = async (tabData: Tab) => {
    if (referenced.has(tabData.id)) {
      // found one tabSpace, valid
    } else {
      logger(`tab ${tabData.id} is an orphan, need to be purged.`);
      await db.table(TAB_DB_TABLE_NAME).delete(tabData.id);
      logger(`tab ${tabData.id} purged.`);
    }
  };
  await Promise.all(tabsData.map((tabData) => auditTab(tabData)));
  logger('tabSpace dbAuditor finished processing.');
}
