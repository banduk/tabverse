import { Todo, TODO_DB_TABLE_NAME } from './Todo';

import { db } from '../../storage/db';
import { AllTodoSavePayload, ALLTODO_DB_TABLE_NAME } from './AllTodo';
import { getLogger } from '../../storage/dbAuditorManager';

export async function dbAuditor(logs: string[]): Promise<void> {
  const logger = getLogger(logs);
  logger('todo dbAuditor start to process...');
  const todosData = await db.table<Todo>(TODO_DB_TABLE_NAME).toArray();
  const aggregates = await db
    .table<AllTodoSavePayload>(ALLTODO_DB_TABLE_NAME)
    .toArray();
  const referenced = new Set(aggregates.flatMap((row) => row.todoIds ?? []));
  const audit = async (savedTodo: Todo) => {
    if (referenced.has(savedTodo.id)) {
      // found one, valid
    } else {
      logger(`todo ${savedTodo.id} is an orphan, need to be purged.`);
      await db.table(TODO_DB_TABLE_NAME).delete(savedTodo.id);
      logger(`todo ${savedTodo.id} purged.`);
    }
  };
  await Promise.all(todosData.map((todoData) => audit(todoData)));
  logger('todo dbAuditor finished processing.');
}
