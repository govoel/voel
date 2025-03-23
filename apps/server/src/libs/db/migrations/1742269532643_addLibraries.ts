import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('library')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('name', 'text', (col) => col.unique().notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_library_updatedAt BEFORE UPDATE OF id, name, deletedAt ON library FOR EACH ROW
            BEGIN
              UPDATE library SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER update_library_updatedAt;`.execute(db);

  await db.schema.dropTable('library').execute();
}
