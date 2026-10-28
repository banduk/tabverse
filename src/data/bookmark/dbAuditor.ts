import { db } from '../../storage/db';
import { Bookmark, BOOKMARK_DB_TABLE_NAME } from './Bookmark';
import { ALLBOOKMARK_DB_TABLE_NAME } from './AllBookmark';
import { getLogger } from '../../storage/dbAuditorManager';

export async function dbAuditor(logs: string[]): Promise<void> {
  const logger = getLogger(logs);
  logger('bookmark dbAuditor start to process...');
  const bookmarksData = await db
    .table<Bookmark>(BOOKMARK_DB_TABLE_NAME)
    .toArray();
  const aggregates: { bookmarkIds?: string[] }[] = await db
    .table(ALLBOOKMARK_DB_TABLE_NAME)
    .toArray();
  const referenced = new Set(
    aggregates.flatMap((row) => row.bookmarkIds ?? []),
  );
  const audit = async (bookmarkData: Bookmark) => {
    if (referenced.has(bookmarkData.id)) {
      // found one, valid
    } else {
      logger(`bookmark ${bookmarkData.id} is an orphan, need to be purged.`);
      await db.table(BOOKMARK_DB_TABLE_NAME).delete(bookmarkData.id);
      logger(`bookmark ${bookmarkData.id} purged.`);
    }
  };
  await Promise.all(bookmarksData.map((bookmarkData) => audit(bookmarkData)));
  logger('bookmark dbAuditor finished processing.');
}
