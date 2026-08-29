import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

const createIndex = Effect.fnUntraced(function* ({
  sql,
  table,
  columns,
}: {
  readonly sql: SqlClient.SqlClient;
  readonly table: string;
  readonly columns: ReadonlyArray<string>;
}) {
  const indexName = `${table}_${columns.join('_')}_idx`;
  const indexColumns = sql.csv(columns.map((column) => sql`${sql(column)}`));

  yield* sql`create index ${sql(indexName)} on ${sql(table)} (${indexColumns})`;
});

const createUniqueIndex = Effect.fnUntraced(function* ({
  sql,
  table,
  columns,
}: {
  readonly sql: SqlClient.SqlClient;
  readonly table: string;
  readonly columns: ReadonlyArray<string>;
}) {
  const indexName = `${table}_${columns.join('_')}_uniqueidx`;
  const indexColumns = sql.csv(columns.map((column) => sql`${sql(column)}`));

  yield* sql`create unique index ${sql(indexName)} on ${sql(table)} (${indexColumns})`;
});

/** Uses an after trigger so updating the same row cannot invalidate its indexes mid-update. */
const createUpdatedAtTrigger = Effect.fnUntraced(function* ({
  sql,
  table,
  columns,
}: {
  readonly sql: SqlClient.SqlClient;
  readonly table: string;
  readonly columns: ReadonlyArray<string>;
}) {
  const triggerName = `${table}_updatedAt_trigger`;
  const updateColumns = sql.join(', ', false)(columns.map((column) => sql`${sql(column)}`));

  yield* sql`
    create trigger ${sql(triggerName)} after update of ${updateColumns} on ${sql(table)} for each row begin
      update ${sql(table)} set updatedAt = (time_to_milli(time_now())) where rowid = new.rowid;
    end;
  `;
});

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table "mediaType" (
      "type" text not null primary key
    ) strict
  `;

  yield* sql`
    insert into "mediaType"
    ${sql.insert([{ type: 'audiobook' }, { type: 'movie' }, { type: 'show' }])}
  `;

  yield* sql`
    create table "mediaItem" (
      "id" integer not null primary key autoincrement,
      "type" text not null references "mediaType" ("type") on delete restrict on update cascade,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createIndex({ sql, table: 'mediaItem', columns: ['type'] });
  yield* createIndex({ sql, table: 'mediaItem', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'mediaItem', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'mediaItem',
    columns: ['id', 'type', 'deletedAt'],
  });

  yield* sql`
    create table "audiobook" (
      "id" integer not null primary key autoincrement,
      "asin" text unique,
      "mediaItemId" integer not null unique references "mediaItem" ("id") on delete cascade on update cascade,
      "title" text not null,
      "subtitle" text,
      "cover" text,
      "coverThumbhash" text,
      "summary" text,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createIndex({ sql, table: 'audiobook', columns: ['mediaItemId'] });
  yield* createIndex({ sql, table: 'audiobook', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'audiobook', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
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

  yield* sql`
    create table "audiobookSeries" (
      "id" integer not null primary key autoincrement,
      "asin" text not null unique,
      "name" text not null,
      "summary" text,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createIndex({ sql, table: 'audiobookSeries', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'audiobookSeries', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'audiobookSeries',
    columns: ['id', 'asin', 'name', 'summary', 'deletedAt'],
  });

  yield* sql`
    create table "audiobookSeriesMap" (
      "id" integer not null primary key autoincrement,
      "audiobookId" integer not null references "audiobook" ("id") on delete cascade on update cascade,
      "audiobookSeriesId" integer references "audiobookSeries" ("id") on delete cascade on update cascade,
      "title" text not null,
      "label" text not null,
      "sort" integer not null,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createUniqueIndex({
    sql,
    table: 'audiobookSeriesMap',
    columns: ['audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort'],
  });

  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['audiobookId'] });
  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['audiobookSeriesId'] });
  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['title'] });
  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['sort'] });
  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'audiobookSeriesMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'audiobookSeriesMap',
    columns: ['id', 'audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort', 'deletedAt'],
  });

  yield* sql`
    create table "audiobookContributor" (
      "id" integer not null primary key autoincrement,
      "asin" text not null unique,
      "name" text not null,
      "about" text,
      "avatar" text,
      "avatarThumbhash" text,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createIndex({ sql, table: 'audiobookContributor', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'audiobookContributor', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'audiobookContributor',
    columns: ['id', 'asin', 'name', 'about', 'avatar', 'avatarThumbhash', 'deletedAt'],
  });

  yield* sql`
    create table "audiobookContributorRole" (
      "role" text not null primary key
    ) strict
  `;

  yield* sql`
    insert into "audiobookContributorRole"
    ${sql.insert([
      { role: 'author' },
      { role: 'narrator' },
      { role: 'editor' },
      { role: 'translator' },
      { role: 'foreword' },
    ])}
  `;

  yield* sql`
    create table "audiobookContributorMap" (
      "id" integer not null primary key autoincrement,
      "audiobookId" integer not null references "audiobook" ("id") on delete cascade on update cascade,
      "audiobookContributorId" integer references "audiobookContributor" ("id") on delete cascade on update cascade,
      "name" text not null,
      "role" text not null references "audiobookContributorRole" ("role") on delete restrict on update cascade,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createUniqueIndex({
    sql,
    table: 'audiobookContributorMap',
    columns: ['audiobookId', 'audiobookContributorId', 'name', 'role'],
  });

  yield* createIndex({ sql, table: 'audiobookContributorMap', columns: ['audiobookId'] });
  yield* createIndex({
    sql,
    table: 'audiobookContributorMap',
    columns: ['audiobookContributorId'],
  });
  yield* createIndex({ sql, table: 'audiobookContributorMap', columns: ['name'] });
  yield* createIndex({ sql, table: 'audiobookContributorMap', columns: ['role'] });
  yield* createIndex({ sql, table: 'audiobookContributorMap', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'audiobookContributorMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'audiobookContributorMap',
    columns: ['id', 'audiobookId', 'audiobookContributorId', 'name', 'role', 'deletedAt'],
  });

  yield* sql`
    create table "library" (
      "id" integer not null primary key autoincrement,
      "type" text not null references "mediaType" ("type") on delete restrict on update cascade,
      "name" text not null unique,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createIndex({ sql, table: 'library', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'library', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'library',
    columns: ['id', 'type', 'name', 'deletedAt'],
  });

  yield* sql`
    create table "libraryPath" (
      "id" integer not null primary key autoincrement,
      "libraryId" integer not null references "library" ("id") on delete cascade on update cascade,
      "absolutePath" text not null,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* createUniqueIndex({
    sql,
    table: 'libraryPath',
    columns: ['libraryId', 'absolutePath'],
  });

  yield* createIndex({ sql, table: 'libraryPath', columns: ['libraryId'] });
  yield* createIndex({ sql, table: 'libraryPath', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'libraryPath', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
    table: 'libraryPath',
    columns: ['id', 'libraryId', 'absolutePath', 'deletedAt'],
  });

  yield* sql`
    create table "mediaFile" (
      "id" integer not null primary key autoincrement,
      "absolutePath" text not null unique,
      "durationMs" integer not null,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer
    ) strict
  `;

  yield* sql`
    create table "libraryFileMap" (
      "id" integer not null primary key autoincrement,
      "libraryId" integer not null references "library" ("id") on delete cascade on update cascade,
      "mediaFileId" integer not null references "mediaFile" ("id") on delete cascade on update cascade,
      "mediaItemId" integer references "mediaItem" ("id") on delete cascade on update cascade,
      "matchFailureReason" text,
      "variant" text default 'default' not null,
      "customOrder" integer not null,
      "createdAt" integer default (time_to_milli(time_now())) not null,
      "updatedAt" integer default (time_to_milli(time_now())) not null,
      "deletedAt" integer,
      constraint "libraryFileMap_match_check"
        check (
          (mediaItemId is null and matchFailureReason is not null)
          or (mediaItemId is not null and matchFailureReason is null)
        )
    ) strict
  `;

  yield* createUniqueIndex({
    sql,
    table: 'libraryFileMap',
    columns: ['libraryId', 'mediaFileId'],
  });

  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['libraryId'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['mediaFileId'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['mediaItemId'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['matchFailureReason'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['variant'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['updatedAt'] });
  yield* createIndex({ sql, table: 'libraryFileMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    sql,
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
});
