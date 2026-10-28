import { Note, NOTE_DB_TABLE_NAME } from './Note';

import { db } from '../../storage/db';
import { ALLNOTE_DB_TABLE_NAME } from './AllNote';
import { getLogger } from '../../storage/dbAuditorManager';

export async function dbAuditor(logs: string[]): Promise<void> {
  const logger = getLogger(logs);
  logger('note dbAuditor start to process...');
  const notesData = await db.table<Note>(NOTE_DB_TABLE_NAME).toArray();
  const aggregates: { noteIds?: string[] }[] = await db
    .table(ALLNOTE_DB_TABLE_NAME)
    .toArray();
  const referenced = new Set(aggregates.flatMap((row) => row.noteIds ?? []));
  const audit = async (noteData: Note) => {
    if (referenced.has(noteData.id)) {
      // found one, valid
    } else {
      logger(`note ${noteData.id} is an orphan, need to be purged.`);
      await db.table(NOTE_DB_TABLE_NAME).delete(noteData.id);
      logger(`note ${noteData.id} purged.`);
    }
  };
  await Promise.all(notesData.map((noteData) => audit(noteData)));
  logger('note dbAuditor finished processing.');
}
