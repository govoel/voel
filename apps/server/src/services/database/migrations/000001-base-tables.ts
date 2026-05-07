import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

const createIndex = Effect.fnUntraced(function* ({
  table,
  columns,
}: {
  table: string;
  columns: string[];
}) {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();
  const indexName = `${table}_${columns.join('_')}_idx`;
  yield* sql`create index ${sql(indexName)} on ${sql(table)} (${sql.csv(columns)});`;
});

const createUniqueIndex = Effect.fnUntraced(function* ({
  table,
  columns,
}: {
  table: string;
  columns: string[];
}) {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();
  const indexName = `${table}_${columns.join('_')}_uniqueidx`;
  yield* sql`create unique index ${sql(indexName)} on ${sql(table)} (${sql.csv(columns)});`;
});

const createUpdatedAtTrigger = Effect.fnUntraced(function* ({
  table,
  columns,
}: {
  table: string;
  columns: string[];
}) {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();
  const triggerName = `${table}_updatedAt_trigger`;
  yield* sql`
    create trigger ${sql(triggerName)} before update of ${sql.csv(columns)} on ${sql(table)} for each row begin
      update ${sql(table)} SET updatedAt = (unixepoch()) where id = new.id;
    end;
  `;
});

export const baseTables = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    create table mediaType (
      "type" text not null primary key
    ) strict;
  `;

  yield* sql`insert into mediaType ("type") values ('audiobook'), ('movie'), ('show');`;

  yield* sql`
    create table mediaItem (
      "id" integer not null primary key autoincrement,
      "type" text not null references mediaType ("type") on delete restrict on update cascade,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createIndex({ table: 'mediaItem', columns: ['type'] });
  yield* createIndex({ table: 'mediaItem', columns: ['updatedAt'] });
  yield* createIndex({ table: 'mediaItem', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'mediaItem',
    columns: ['id', 'type', 'deletedAt'],
  });

  yield* sql`
    create table audiobook (
      "id" integer not null primary key autoincrement,
      "asin" text unique,
      "mediaItemId" integer not null unique references mediaItem (id) on delete cascade on update cascade,
      "title" text not null,
      "subtitle" text,
      "cover" text,
      "coverThumbhash" text,
      "summary" text,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createIndex({ table: 'audiobook', columns: ['mediaItemId'] });
  yield* createIndex({ table: 'audiobook', columns: ['updatedAt'] });
  yield* createIndex({ table: 'audiobook', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
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
    create table audiobookSeries (
      "id" integer not null primary key autoincrement,
      "asin" text not null unique,
      "name" text not null,
      "summary" text,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createIndex({ table: 'audiobookSeries', columns: ['updatedAt'] });
  yield* createIndex({ table: 'audiobookSeries', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'audiobookSeries',
    columns: ['id', 'asin', 'name', 'summary', 'deletedAt'],
  });

  yield* sql`
    create table audiobookSeriesMap (
      "id" integer not null primary key autoincrement,
      "audiobookId" integer not null references audiobook (id) on delete cascade on update cascade,
      "audiobookSeriesId" integer references audiobookSeries (id) on delete cascade on update cascade,
      "title" text not null,
      "label" text not null,
      "sort" integer not null,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createUniqueIndex({
    table: 'audiobookSeriesMap',
    columns: ['audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort'],
  });

  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['audiobookId'] });
  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['audiobookSeriesId'] });
  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['title'] });
  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['sort'] });
  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['updatedAt'] });
  yield* createIndex({ table: 'audiobookSeriesMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'audiobookSeriesMap',
    columns: ['id', 'audiobookId', 'audiobookSeriesId', 'title', 'label', 'sort', 'deletedAt'],
  });

  yield* sql`
    create table audiobookContributor (
      "id" integer not null primary key autoincrement,
      "asin" text not null unique,
      "name" text not null,
      "about" text,
      "avatar" text,
      "avatarThumbhash" text,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createIndex({ table: 'audiobookContributor', columns: ['updatedAt'] });
  yield* createIndex({ table: 'audiobookContributor', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'audiobookContributor',
    columns: ['id', 'asin', 'name', 'about', 'avatar', 'avatarThumbhash', 'deletedAt'],
  });

  yield* sql`
    create table audiobookContributorRole (
      "role" text not null primary key
    ) strict;
  `;

  yield* sql`insert into audiobookContributorRole ("role") values ('author'), ('narrator'), ('editor'), ('translator'), ('foreword');`;

  yield* sql`
    create table audiobookContributorMap (
      "id" integer not null primary key autoincrement,
      "audiobookId" integer not null references audiobook (id) on delete cascade on update cascade,
      "audiobookContributorId" integer references audiobookContributor (id) on delete cascade on update cascade,
      "name" text not null,
      "role" text not null references audiobookContributorRole (role) on delete restrict on update cascade,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createUniqueIndex({
    table: 'audiobookContributorMap',
    columns: ['audiobookId', 'audiobookContributorId', 'name', 'role'],
  });

  yield* createIndex({ table: 'audiobookContributorMap', columns: ['audiobookId'] });
  yield* createIndex({ table: 'audiobookContributorMap', columns: ['audiobookContributorId'] });
  yield* createIndex({ table: 'audiobookContributorMap', columns: ['name'] });
  yield* createIndex({ table: 'audiobookContributorMap', columns: ['role'] });
  yield* createIndex({ table: 'audiobookContributorMap', columns: ['updatedAt'] });
  yield* createIndex({ table: 'audiobookContributorMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'audiobookContributorMap',
    columns: ['id', 'audiobookId', 'audiobookContributorId', 'name', 'role', 'deletedAt'],
  });

  yield* sql`
    create table library (
      "id" integer not null primary key autoincrement,
      "type" text not null references mediaType ("type") on delete restrict on update cascade,
      "name" text not null unique,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createIndex({ table: 'library', columns: ['updatedAt'] });
  yield* createIndex({ table: 'library', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({ table: 'library', columns: ['id', 'type', 'name', 'deletedAt'] });

  yield* sql`
    create table libraryPath (
      "id" integer not null primary key autoincrement,
      "libraryId" integer not null references library (id) on delete cascade on update cascade,
      "absolutePath" text not null,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* createUniqueIndex({ table: 'libraryPath', columns: ['libraryId', 'absolutePath'] });

  yield* createIndex({ table: 'libraryPath', columns: ['libraryId'] });
  yield* createIndex({ table: 'libraryPath', columns: ['updatedAt'] });
  yield* createIndex({ table: 'libraryPath', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'libraryPath',
    columns: ['id', 'libraryId', 'absolutePath', 'deletedAt'],
  });

  yield* sql`
    create table mediaFile (
      "id" integer not null primary key autoincrement,
      "absolutePath" text not null unique,
      "durationMs" integer not null,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer
    ) strict;
  `;

  yield* sql`
    create table libraryFileMap (
      "id" integer not null primary key autoincrement,
      "libraryId" integer not null references library (id) on delete cascade on update cascade,
      "mediaFileId" integer not null references mediaFile (id) on delete cascade on update cascade,
      "mediaItemId" integer references mediaItem (id) on delete cascade on update cascade,
      "matchFailureReason" text,
      "variant" text not null default ('default'),
      "customOrder" integer not null,
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      "deletedAt" integer,
      check((mediaItemId is null and matchFailureReason is not null) or (mediaItemId is not null and matchFailureReason is null))
    ) strict;
  `;

  yield* createUniqueIndex({
    table: 'libraryFileMap',
    columns: ['libraryId', 'mediaFileId'],
  });

  yield* createIndex({ table: 'libraryFileMap', columns: ['libraryId'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['mediaFileId'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['mediaItemId'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['matchFailureReason'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['variant'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['updatedAt'] });
  yield* createIndex({ table: 'libraryFileMap', columns: ['deletedAt'] });

  yield* createUpdatedAtTrigger({
    table: 'libraryFileMap',
    columns: [
      'id',
      'libraryId',
      'mediaFileId',
      'mediaItemId',
      'matchFailureReason',
      'variant',
      'customOrder',
      'durationMs',
      'deletedAt',
    ],
  });
});
