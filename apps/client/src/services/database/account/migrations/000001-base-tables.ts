import { sql } from '@repo/effect-kysely';
import type { Kysely } from '@repo/effect-kysely';

// The replica intentionally omits server-side foreign keys and unique indexes.
// Sync applies current row state rather than transaction logs, so intermediate
// states may not satisfy those constraints even though the final state does.
export const up = async (db: Kysely<unknown>) => {
  const statements = `
    create table mediaType (
      type text primary key not null
    ) strict;

    create table mediaItem (
      id integer primary key not null,
      type text not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table audiobook (
      id integer primary key not null,
      asin text,
      mediaItemId integer not null,
      title text not null,
      subtitle text,
      cover text,
      coverThumbhash text,
      summary text,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table audiobookSeries (
      id integer primary key not null,
      asin text not null,
      name text not null,
      summary text,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table audiobookSeriesMap (
      id integer primary key not null,
      audiobookId integer not null,
      audiobookSeriesId integer,
      title text not null,
      label text not null,
      sort integer not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table audiobookContributor (
      id integer primary key not null,
      asin text not null,
      name text not null,
      about text,
      avatar text,
      avatarThumbhash text,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table audiobookContributorRole (
      role text primary key not null
    ) strict;

    create table audiobookContributorMap (
      id integer primary key not null,
      audiobookId integer not null,
      audiobookContributorId integer,
      name text not null,
      role text not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table library (
      id integer primary key not null,
      type text not null,
      name text not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table libraryPath (
      id integer primary key not null,
      libraryId integer not null,
      absolutePath text not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table mediaFile (
      id integer primary key not null,
      absolutePath text not null,
      durationMs integer not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create table libraryFileMap (
      id integer primary key not null,
      libraryId integer not null,
      mediaFileId integer not null,
      mediaItemId integer,
      matchFailureReason text,
      variant text not null,
      customOrder integer not null,
      createdAt integer not null,
      updatedAt integer not null,
      deletedAt integer
    ) strict;

    create index mediaItem_updatedAt_idx on mediaItem(updatedAt);
    create index audiobook_updatedAt_idx on audiobook(updatedAt);
    create index audiobookSeries_updatedAt_idx on audiobookSeries(updatedAt);
    create index audiobookSeriesMap_updatedAt_idx on audiobookSeriesMap(updatedAt);
    create index audiobookContributor_updatedAt_idx on audiobookContributor(updatedAt);
    create index audiobookContributorMap_updatedAt_idx on audiobookContributorMap(updatedAt);
    create index library_updatedAt_idx on library(updatedAt);
    create index libraryPath_updatedAt_idx on libraryPath(updatedAt);
    create index mediaFile_updatedAt_idx on mediaFile(updatedAt);
    create index libraryFileMap_updatedAt_idx on libraryFileMap(updatedAt);
  `
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    // Migrations must execute in declaration order on the same SQLite connection.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await sql.raw(statement).execute(db);
  }
};

export const down = async (db: Kysely<unknown>) => {
  const statements = `
    drop table if exists libraryFileMap;
    drop table if exists mediaFile;
    drop table if exists libraryPath;
    drop table if exists library;
    drop table if exists audiobookContributorMap;
    drop table if exists audiobookContributorRole;
    drop table if exists audiobookContributor;
    drop table if exists audiobookSeriesMap;
    drop table if exists audiobookSeries;
    drop table if exists audiobook;
    drop table if exists mediaItem;
    drop table if exists mediaType;
  `
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    // Migrations must execute in declaration order on the same SQLite connection.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await sql.raw(statement).execute(db);
  }
};
