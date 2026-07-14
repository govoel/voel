import { sql } from '@repo/effect-kysely';
import type { Kysely } from '@repo/effect-kysely';

const createUpdatedAtTrigger = async ({
  db,
  table,
  columns,
}: {
  db: Kysely<unknown>;
  table: string;
  columns: string[];
}) => {
  const triggerName = `${table}_updatedAt_trigger`;
  const updateColumns = columns.map((column) => sql.ref(column));

  await sql`
    create trigger ${sql.ref(triggerName)} before update of ${sql.join(updateColumns)} on ${sql.table(table)} for each row begin
      update ${sql.table(table)} set updatedAt = (unixepoch()) where rowid = new.rowid;
    end;
  `.execute(db);
};

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('account')
    .addColumn('serverUrl', 'text', (col) => col.notNull())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('account_serverUrl_userId_pkey', ['serverUrl', 'userId'])
    .addColumn('username', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) =>
      col.notNull().check(sql`"role" in ('admin', 'user', 'under18')`)
    )
    .addColumn('profilePicture', 'text')
    .addColumn('active', 'integer', (col) =>
      col
        .notNull()
        .defaultTo(0)
        .check(sql`"active" in (0, 1)`)
    )
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .modifyEnd(sql`strict`)
    .execute();

  await createUpdatedAtTrigger({
    db,
    table: 'account',
    columns: ['serverUrl', 'userId', 'username', 'role', 'profilePicture', 'active'],
  });
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('account').execute();
};
