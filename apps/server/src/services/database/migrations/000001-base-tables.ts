import { sql } from '@repo/source-tap';
import type { Kysely } from '@repo/source-tap';

const createIndex = async ({
  db,
  table,
  columns,
}: {
  db: Kysely<unknown>;
  table: string;
  columns: string[];
}) => {
  const indexName = `${table}_${columns.join('_')}_idx`;
  await db.schema.createIndex(indexName).on(table).columns(columns).execute();
};

const createUniqueIndex = async ({
  db,
  table,
  columns,
}: {
  db: Kysely<unknown>;
  table: string;
  columns: string[];
}) => {
  const indexName = `${table}_${columns.join('_')}_uniqueidx`;
  await db.schema.createIndex(indexName).unique().on(table).columns(columns).execute();
};

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
      update ${sql.table(table)} set updatedAt = (unixepoch()) where id = new.id;
    end;
  `.execute(db);
};

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('mediaType')
    .addColumn('type', 'text', (col) => col.notNull().primaryKey())
    .modifyEnd(sql`strict`)
    .execute();

  await db
    // @ts-expect-error - We don't hand table types to migrations
    .insertInto('mediaType')
    .values([{ type: 'audiobook' }, { type: 'movie' }, { type: 'show' }])
    .execute();

  await db.schema
    .createTable('mediaItem')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('type', 'text', (col) =>
      col.notNull().references('mediaType.type').onDelete('restrict').onUpdate('cascade')
    )
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createIndex({ db, table: 'mediaItem', columns: ['type'] });
  await createIndex({ db, table: 'mediaItem', columns: ['updatedAt'] });
  await createIndex({ db, table: 'mediaItem', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({ db, table: 'mediaItem', columns: ['id', 'type', 'deletedAt'] });

  await db.schema
    .createTable('audiobook')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('asin', 'text', (col) => col.unique())
    .addColumn('mediaItemId', 'integer', (col) =>
      col.notNull().unique().references('mediaItem.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('subtitle', 'text')
    .addColumn('cover', 'text')
    .addColumn('coverThumbhash', 'text')
    .addColumn('summary', 'text')
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createIndex({ db, table: 'audiobook', columns: ['mediaItemId'] });
  await createIndex({ db, table: 'audiobook', columns: ['updatedAt'] });
  await createIndex({ db, table: 'audiobook', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'audiobook',
    columns: [
      'id',
      'asin',
      'mediaItemId',
      'title',
      'subtitle',
      'cover',
      'coverThumbhash',
      'summary',
      'deletedAt',
    ],
  });

  await db.schema
    .createTable('audiobookSeries')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('asin', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('summary', 'text')
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createIndex({ db, table: 'audiobookSeries', columns: ['updatedAt'] });
  await createIndex({ db, table: 'audiobookSeries', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'audiobookSeries',
    columns: ['id', 'asin', 'name', 'summary', 'deletedAt'],
  });

  await db.schema
    .createTable('audiobookSeriesMap')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('audiobookId', 'integer', (col) =>
      col.notNull().references('audiobook.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('audiobookSeriesId', 'integer', (col) =>
      col.references('audiobookSeries.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createUniqueIndex({
    db,
    table: 'audiobookSeriesMap',
    columns: ['audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort'],
  });

  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['audiobookId'] });
  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['audiobookSeriesId'] });
  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['title'] });
  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['sort'] });
  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['updatedAt'] });
  await createIndex({ db, table: 'audiobookSeriesMap', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'audiobookSeriesMap',
    columns: ['id', 'audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort', 'deletedAt'],
  });

  await db.schema
    .createTable('audiobookContributor')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('asin', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('about', 'text')
    .addColumn('avatar', 'text')
    .addColumn('avatarThumbhash', 'text')
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createIndex({ db, table: 'audiobookContributor', columns: ['updatedAt'] });
  await createIndex({ db, table: 'audiobookContributor', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'audiobookContributor',
    columns: ['id', 'asin', 'name', 'about', 'avatar', 'avatarThumbhash', 'deletedAt'],
  });

  await db.schema
    .createTable('audiobookContributorRole')
    .addColumn('role', 'text', (col) => col.notNull().primaryKey())
    .modifyEnd(sql`strict`)
    .execute();

  await db
    // @ts-expect-error - We don't hand table types to migrations
    .insertInto('audiobookContributorRole')
    .values([
      { role: 'author' },
      { role: 'narrator' },
      { role: 'editor' },
      { role: 'translator' },
      { role: 'foreword' },
    ])
    .execute();

  await db.schema
    .createTable('audiobookContributorMap')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('audiobookId', 'integer', (col) =>
      col.notNull().references('audiobook.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('audiobookContributorId', 'integer', (col) =>
      col.references('audiobookContributor.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) =>
      col
        .notNull()
        .references('audiobookContributorRole.role')
        .onDelete('restrict')
        .onUpdate('cascade')
    )
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createUniqueIndex({
    db,
    table: 'audiobookContributorMap',
    columns: ['audiobookId', 'audiobookContributorId', 'name', 'role'],
  });

  await createIndex({ db, table: 'audiobookContributorMap', columns: ['audiobookId'] });
  await createIndex({ db, table: 'audiobookContributorMap', columns: ['audiobookContributorId'] });
  await createIndex({ db, table: 'audiobookContributorMap', columns: ['name'] });
  await createIndex({ db, table: 'audiobookContributorMap', columns: ['role'] });
  await createIndex({ db, table: 'audiobookContributorMap', columns: ['updatedAt'] });
  await createIndex({ db, table: 'audiobookContributorMap', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'audiobookContributorMap',
    columns: ['id', 'audiobookId', 'audiobookContributorId', 'name', 'role', 'deletedAt'],
  });

  await db.schema
    .createTable('library')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('type', 'text', (col) =>
      col.notNull().references('mediaType.type').onDelete('restrict').onUpdate('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createIndex({ db, table: 'library', columns: ['updatedAt'] });
  await createIndex({ db, table: 'library', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'library',
    columns: ['id', 'type', 'name', 'deletedAt'],
  });

  await db.schema
    .createTable('libraryPath')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('absolutePath', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await createUniqueIndex({ db, table: 'libraryPath', columns: ['libraryId', 'absolutePath'] });

  await createIndex({ db, table: 'libraryPath', columns: ['libraryId'] });
  await createIndex({ db, table: 'libraryPath', columns: ['updatedAt'] });
  await createIndex({ db, table: 'libraryPath', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'libraryPath',
    columns: ['id', 'libraryId', 'absolutePath', 'deletedAt'],
  });

  await db.schema
    .createTable('mediaFile')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('absolutePath', 'text', (col) => col.notNull().unique())
    .addColumn('durationMs', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`strict`)
    .execute();

  await db.schema
    .createTable('libraryFileMap')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('mediaFileId', 'integer', (col) =>
      col.notNull().references('mediaFile.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('mediaItemId', 'integer', (col) =>
      col.references('mediaItem.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('matchFailureReason', 'text')
    .addColumn('variant', 'text', (col) => col.notNull().defaultTo('default'))
    .addColumn('customOrder', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('updatedAt', 'integer', (col) => col.notNull().defaultTo(sql`(unixepoch())`))
    .addColumn('deletedAt', 'integer')
    .addCheckConstraint(
      'libraryFileMap_match_check',
      sql`(mediaItemId is null and matchFailureReason is not null) or (mediaItemId is not null and matchFailureReason is null)`
    )
    .modifyEnd(sql`strict`)
    .execute();

  await createUniqueIndex({
    db,
    table: 'libraryFileMap',
    columns: ['libraryId', 'mediaFileId'],
  });

  await createIndex({ db, table: 'libraryFileMap', columns: ['libraryId'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['mediaFileId'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['mediaItemId'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['matchFailureReason'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['variant'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['updatedAt'] });
  await createIndex({ db, table: 'libraryFileMap', columns: ['deletedAt'] });

  await createUpdatedAtTrigger({
    db,
    table: 'libraryFileMap',
    columns: [
      'id',
      'libraryId',
      'mediaFileId',
      'mediaItemId',
      'matchFailureReason',
      'variant',
      'customOrder',
      'deletedAt',
    ],
  });
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('libraryFileMap').ifExists().execute();
  await db.schema.dropTable('mediaFile').ifExists().execute();
  await db.schema.dropTable('libraryPath').ifExists().execute();
  await db.schema.dropTable('library').ifExists().execute();
  await db.schema.dropTable('audiobookContributorMap').ifExists().execute();
  await db.schema.dropTable('audiobookContributorRole').ifExists().execute();
  await db.schema.dropTable('audiobookContributor').ifExists().execute();
  await db.schema.dropTable('audiobookSeriesMap').ifExists().execute();
  await db.schema.dropTable('audiobookSeries').ifExists().execute();
  await db.schema.dropTable('audiobook').ifExists().execute();
  await db.schema.dropTable('mediaItem').ifExists().execute();
  await db.schema.dropTable('mediaType').ifExists().execute();
};
