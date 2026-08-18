import { sql } from '@repo/effect-kysely';
import type { Kysely } from '@repo/effect-kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createIndex('mediaFile_updatedAt_idx')
    .on('mediaFile')
    .column('updatedAt')
    .execute();
  await db.schema
    .createIndex('mediaFile_deletedAt_idx')
    .on('mediaFile')
    .column('deletedAt')
    .execute();
  await sql`
    create trigger mediaFile_updatedAt_trigger before update of id, absolutePath, durationMs, deletedAt on mediaFile for each row begin
      update mediaFile set updatedAt = (unixepoch()) where rowid = new.rowid;
    end;
  `.execute(db);
};

export const down = async (db: Kysely<unknown>) => {
  await sql`drop trigger if exists mediaFile_updatedAt_trigger`.execute(db);
  await db.schema.dropIndex('mediaFile_deletedAt_idx').ifExists().execute();
  await db.schema.dropIndex('mediaFile_updatedAt_idx').ifExists().execute();
};
