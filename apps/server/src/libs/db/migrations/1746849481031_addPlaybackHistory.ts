import { sql } from 'kysely';
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('playbackHistory')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('userId', 'text', (col) =>
      col.notNull().references('user.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('type', 'integer', (col) =>
      col.notNull().check(sql`type in (1002, 1003, 1004, 1005, 1006, 1007)`)
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('positionMs', 'integer', (col) => col.notNull())
    .addColumn('eventTimestampMs', 'integer', (col) => col.notNull())
    .addUniqueConstraint('playbackHistory_userId_type_bookId_positionMs_eventTimestampMs_unique', [
      'userId',
      'type',
      'bookId',
      'positionMs',
      'eventTimestampMs',
    ])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('playbackHistory_updatedAt_index')
    .on('playbackHistory')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_deletedAt_index')
    .on('playbackHistory')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_playbackHistory_updatedAt BEFORE UPDATE OF id, userId, type, bookId, positionMs, eventTimestampMs, createdAt, updatedAt, deletedAt ON playbackHistory FOR EACH ROW
              BEGIN
                UPDATE playbackHistory SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
              END;`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS update_playbackHistory_updatedAt;`.execute(db);

  await db.schema.dropTable('playbackHistory').ifExists().execute();
}
