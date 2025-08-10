import { Kysely, Migrator, sql } from 'kysely';

import { ExpoMigrationProvider } from '~/lib/db/driver';
import type { InstanceDatabase } from '~/lib/db/schema/instance';

export const createInstanceDbMigrator = (instanceDb: Kysely<InstanceDatabase>) =>
  new Migrator({
    db: instanceDb,
    provider: new ExpoMigrationProvider({
      migrations: {
        '1': {
          up: async (db: Kysely<InstanceDatabase>) => {
            await db.transaction().execute(async (trx) => {
              await trx.schema
                .createTable('library')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('name', 'text', (col) => col.notNull())
                .addColumn('path', 'text', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('library_updatedAt_index')
                .on('library')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('library_deletedAt_index')
                .on('library')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('author')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('asin', 'text', (col) => col.notNull())
                .addColumn('name', 'text', (col) => col.notNull())
                .addColumn('about', 'text')
                .addColumn('avatar', 'text')
                .addColumn('avatarThumbhash', 'text')
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('author_asin_index')
                .on('author')
                .columns(['asin'])
                .execute();

              await trx.schema
                .createIndex('author_updatedAt_index')
                .on('author')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('author_deletedAt_index')
                .on('author')
                .columns(['deletedAt'])
                .execute();

              await sql`CREATE VIRTUAL TABLE authorFTS USING fts5(
                          name, about,
                          content=author, content_rowid=id, tokenize=trigram
                        );`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS authorFTS_insert AFTER INSERT ON author FOR EACH ROW WHEN NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO authorFTS(rowid, name, about)
                            VALUES(NEW.id, NEW.name, NEW.about);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS authorFTS_soft_delete AFTER UPDATE OF deletedAt ON author FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NOT NULL
                        BEGIN
                          INSERT INTO authorFTS(authorFTS, rowid, name, about)
                            VALUES('delete', OLD.id, OLD.name, OLD.about);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS authorFTS_update AFTER UPDATE OF name, about ON author FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO authorFTS(authorFTS, rowid, name, about)
                            VALUES('delete', OLD.id, OLD.name, OLD.about);
                          INSERT INTO authorFTS(rowid, name, about)
                            VALUES(NEW.id, NEW.name, NEW.about);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS authorFTS_restore AFTER UPDATE OF deletedAt ON author FOR EACH ROW WHEN OLD.deletedAt IS NOT NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO authorFTS(rowid, name, about)
                            VALUES(NEW.id, NEW.name, NEW.about);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS authorFTS_delete AFTER DELETE ON author FOR EACH ROW
                        BEGIN
                          INSERT INTO authorFTS(authorFTS, rowid, name, about)
                            VALUES('delete', OLD.id, OLD.name, OLD.about);
                        END;`.execute(trx);

              await trx.schema
                .createTable('series')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('asin', 'text', (col) => col.notNull())
                .addColumn('name', 'text', (col) => col.notNull())
                .addColumn('summary', 'text')
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('series_asin_index')
                .on('series')
                .columns(['asin'])
                .execute();

              await trx.schema
                .createIndex('series_updatedAt_index')
                .on('series')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('series_deletedAt_index')
                .on('series')
                .columns(['deletedAt'])
                .execute();

              await sql`CREATE VIRTUAL TABLE seriesFTS USING fts5(
                          name, summary,
                          content=series, content_rowid=id, tokenize=trigram
                        );`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS seriesFTS_insert AFTER INSERT ON series FOR EACH ROW WHEN NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO seriesFTS(rowid, name, summary)
                            VALUES(NEW.id, NEW.name, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS seriesFTS_soft_delete AFTER UPDATE OF deletedAt ON series FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NOT NULL
                        BEGIN
                          INSERT INTO seriesFTS(seriesFTS, rowid, name, summary)
                            VALUES('delete', OLD.id, OLD.name, OLD.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS seriesFTS_update AFTER UPDATE OF name, summary ON series FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO seriesFTS(seriesFTS, rowid, name, summary)
                            VALUES('delete', OLD.id, OLD.name, OLD.summary);
                          INSERT INTO seriesFTS(rowid, name, summary)
                            VALUES(NEW.id, NEW.name, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS seriesFTS_restore AFTER UPDATE OF deletedAt ON series FOR EACH ROW WHEN OLD.deletedAt IS NOT NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO seriesFTS(rowid, name, summary)
                            VALUES(NEW.id, NEW.name, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS seriesFTS_delete AFTER DELETE ON series FOR EACH ROW
                        BEGIN
                          INSERT INTO seriesFTS(seriesFTS, rowid, name, summary)
                            VALUES('delete', OLD.id, OLD.name, OLD.summary);
                        END;`.execute(trx);

              await trx.schema
                .createTable('book')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('asin', 'text', (col) => col.notNull())
                .addColumn('type', 'text', (col) =>
                  col.notNull().check(sql`type in ('audio', 'ebook')`)
                )
                .addColumn('otherTypeId', 'integer', (col) =>
                  col.references('book.id').onDelete('set null').onUpdate('cascade')
                )
                .addColumn('title', 'text', (col) => col.notNull())
                .addColumn('subtitle', 'text')
                .addColumn('cover', 'text')
                .addColumn('coverThumbhash', 'text')
                .addColumn('summary', 'text')
                .addColumn('adultsOnly', 'integer', (col) =>
                  col
                    .notNull()
                    .defaultTo(1)
                    .check(sql`adultsOnly in (0, 1)`)
                )
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('book_asin_index')
                .on('book')
                .columns(['asin'])
                .execute();

              await trx.schema
                .createIndex('book_type_index')
                .on('book')
                .columns(['type'])
                .execute();

              await trx.schema
                .createIndex('book_otherTypeId_index')
                .on('book')
                .columns(['otherTypeId'])
                .execute();

              await trx.schema
                .createIndex('book_adultsOnly_index')
                .on('book')
                .columns(['adultsOnly'])
                .execute();

              await trx.schema
                .createIndex('book_updatedAt_index')
                .on('book')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('book_deletedAt_index')
                .on('book')
                .columns(['deletedAt'])
                .execute();

              await sql`CREATE VIRTUAL TABLE bookFTS USING fts5(
                          title, subtitle, summary,
                          content=book, content_rowid=id, tokenize=trigram
                        );`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookFTS_insert AFTER INSERT ON book FOR EACH ROW WHEN NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookFTS(rowid, title, subtitle, summary)
                            VALUES(NEW.id, NEW.title, NEW.subtitle, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookFTS_soft_delete AFTER UPDATE OF deletedAt ON book FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NOT NULL
                        BEGIN
                          INSERT INTO bookFTS(bookFTS, rowid, title, subtitle, summary)
                            VALUES('delete', OLD.id, OLD.title, OLD.subtitle, OLD.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookFTS_update AFTER UPDATE OF title, subtitle, summary ON book FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookFTS(bookFTS, rowid, title, subtitle, summary)
                            VALUES('delete', OLD.id, OLD.title, OLD.subtitle, OLD.summary);
                          INSERT INTO bookFTS(rowid, title, subtitle, summary)
                            VALUES(NEW.id, NEW.title, NEW.subtitle, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookFTS_restore AFTER UPDATE OF deletedAt ON book FOR EACH ROW WHEN OLD.deletedAt IS NOT NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookFTS(rowid, title, subtitle, summary)
                            VALUES(NEW.id, NEW.title, NEW.subtitle, NEW.summary);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookFTS_delete AFTER DELETE ON book FOR EACH ROW
                        BEGIN
                          INSERT INTO bookFTS(bookFTS, rowid, title, subtitle, summary)
                            VALUES('delete', OLD.id, OLD.title, OLD.subtitle, OLD.summary);
                        END;`.execute(trx);

              await trx.schema
                .createTable('bookAuthor')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('authorId', 'integer', (col) =>
                  col.notNull().references('author.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('bookAuthor_bookId_index')
                .on('bookAuthor')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('bookAuthor_authorId_index')
                .on('bookAuthor')
                .columns(['authorId'])
                .execute();

              await trx.schema
                .createIndex('bookAuthor_updatedAt_index')
                .on('bookAuthor')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('bookAuthor_deletedAt_index')
                .on('bookAuthor')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('bookSeries')
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('seriesId', 'integer', (col) =>
                  col.notNull().references('series.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('label', 'text', (col) => col.notNull())
                .addColumn('sort', 'integer', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('bookSeries_bookId_index')
                .on('bookSeries')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('bookSeries_seriesId_index')
                .on('bookSeries')
                .columns(['seriesId'])
                .execute();

              await trx.schema
                .createIndex('bookSeries_sort_index')
                .on('bookSeries')
                .columns(['sort'])
                .execute();

              await trx.schema
                .createIndex('bookSeries_updatedAt_index')
                .on('bookSeries')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('bookSeries_deletedAt_index')
                .on('bookSeries')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('bookContributor')
                .addColumn('id', 'integer', (col) => col.notNull().autoIncrement().primaryKey())
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('name', 'text', (col) => col.notNull())
                .addColumn('role', 'text', (col) =>
                  col
                    .notNull()
                    .check(sql`role in ('narrator', 'editor', 'illustrator', 'translator')`)
                )
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('bookContributor_bookId_index')
                .on('bookContributor')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('bookContributor_role_index')
                .on('bookContributor')
                .columns(['role'])
                .execute();

              await trx.schema
                .createIndex('bookContributor_updatedAt_index')
                .on('bookContributor')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('bookContributor_deletedAt_index')
                .on('bookContributor')
                .columns(['deletedAt'])
                .execute();

              await sql`CREATE VIRTUAL TABLE bookContributorFTS USING fts5(
                          name, role,
                          content=bookContributor, content_rowid=id, tokenize=trigram
                        );`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookContributorFTS_insert AFTER INSERT ON bookContributor FOR EACH ROW WHEN NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookContributorFTS(rowid, name, role)
                            VALUES(NEW.id, NEW.name, NEW.role);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookContributorFTS_soft_delete AFTER UPDATE OF deletedAt ON bookContributor FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NOT NULL
                        BEGIN
                          INSERT INTO bookContributorFTS(bookContributorFTS, rowid, name, role)
                            VALUES('delete', OLD.id, OLD.name, OLD.role);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookContributorFTS_update AFTER UPDATE OF name, role ON bookContributor FOR EACH ROW WHEN OLD.deletedAt IS NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookContributorFTS(bookContributorFTS, rowid, name, role)
                            VALUES('delete', OLD.id, OLD.name, OLD.role);
                          INSERT INTO bookContributorFTS(rowid, name, role)
                            VALUES(NEW.id, NEW.name, NEW.role);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookContributorFTS_restore AFTER UPDATE OF deletedAt ON bookContributor FOR EACH ROW WHEN OLD.deletedAt IS NOT NULL AND NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO bookContributorFTS(rowid, name, role)
                            VALUES(NEW.id, NEW.name, NEW.role);
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS bookContributorFTS_delete AFTER DELETE ON bookContributor FOR EACH ROW
                        BEGIN
                          INSERT INTO bookContributorFTS(bookContributorFTS, rowid, name, role)
                            VALUES('delete', OLD.id, OLD.name, OLD.role);
                        END;`.execute(trx);

              await trx.schema
                .createTable('audiobookFile')
                .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
                .addColumn('libraryId', 'integer', (col) =>
                  col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('path', 'text', (col) => col.notNull())
                .addColumn('mtimeMs', 'text', (col) => col.notNull())
                .addColumn('metadataHash', 'text', (col) => col.notNull())
                .addColumn('durationMs', 'integer', (col) => col.notNull())
                .addColumn('disc', 'integer', (col) => col.notNull())
                .addColumn('track', 'integer', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('audiobookFile_libraryId_index')
                .on('audiobookFile')
                .columns(['libraryId'])
                .execute();

              await trx.schema
                .createIndex('audiobookFile_bookId_index')
                .on('audiobookFile')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('audiobookFile_disc_track_index')
                .on('audiobookFile')
                .columns(['disc', 'track'])
                .execute();

              await trx.schema
                .createIndex('audiobookFile_updatedAt_index')
                .on('audiobookFile')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('audiobookFile_deletedAt_index')
                .on('audiobookFile')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('audiobookChapter')
                .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
                .addColumn('parentId', 'integer', (col) =>
                  col.references('audiobookChapter.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('fileId', 'integer', (col) =>
                  col.references('audiobookFile.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('source', 'text', (col) => col.notNull())
                .addCheckConstraint(
                  'audiobookChapter_source_dependencies_check',
                  sql`(source = 'file' and parentId is null and fileId is not null) or (source = 'audible' and fileId is null)`
                )
                .addColumn('title', 'text', (col) => col.notNull())
                .addColumn('durationMs', 'integer', (col) => col.notNull())
                .addColumn('startOffsetMs', 'integer', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_parentId_index')
                .on('audiobookChapter')
                .columns(['parentId'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_bookId_index')
                .on('audiobookChapter')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_fileId_index')
                .on('audiobookChapter')
                .columns(['fileId'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_source_index')
                .on('audiobookChapter')
                .columns(['source'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_startOffsetMs_index')
                .on('audiobookChapter')
                .columns(['startOffsetMs'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_updatedAt_index')
                .on('audiobookChapter')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('audiobookChapter_deletedAt_index')
                .on('audiobookChapter')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('ebookFile')
                .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
                .addColumn('libraryId', 'integer', (col) =>
                  col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('path', 'text', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('ebookFile_libraryId_index')
                .on('ebookFile')
                .columns(['libraryId'])
                .execute();

              await trx.schema
                .createIndex('ebookFile_bookId_index')
                .on('ebookFile')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('ebookFile_updatedAt_index')
                .on('ebookFile')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('ebookFile_deletedAt_index')
                .on('ebookFile')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('playbackHistory')
                .ifNotExists()
                .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
                .addColumn('userId', 'text')
                .addColumn('type', 'integer', (col) =>
                  col.notNull().check(sql`type in (1002, 1003, 1004, 1005, 1006, 1007)`)
                )
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('positionMs', 'integer', (col) => col.notNull())
                .addColumn('eventTimestampMs', 'integer', (col) => col.notNull())
                .addColumn('sessionId', 'text', (col) => col.notNull())
                .addColumn('createdAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('updatedAt', 'integer', (col) =>
                  col.defaultTo(sql`(unixepoch())`).notNull()
                )
                .addColumn('deletedAt', 'integer')
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('playbackHistory_userId_index')
                .on('playbackHistory')
                .columns(['userId'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_type_index')
                .on('playbackHistory')
                .columns(['type'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_bookId_index')
                .on('playbackHistory')
                .columns(['bookId'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_eventTimestampMs_index')
                .on('playbackHistory')
                .columns(['eventTimestampMs'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_sessionId_index')
                .on('playbackHistory')
                .columns(['sessionId'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_updatedAt_index')
                .on('playbackHistory')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('playbackHistory_deletedAt_index')
                .on('playbackHistory')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('latestPlaybackPosition')
                .ifNotExists()
                .addColumn('bookId', 'integer', (col) =>
                  col
                    .primaryKey()
                    .notNull()
                    .references('book.id')
                    .onDelete('cascade')
                    .onUpdate('cascade')
                )
                .addColumn('playbackHistoryId', 'integer', (col) =>
                  col
                    .notNull()
                    .references('playbackHistory.id')
                    .onDelete('cascade')
                    .onUpdate('cascade')
                )
                .addColumn('positionMs', 'integer', (col) => col.notNull())
                .addColumn('type', 'integer', (col) =>
                  col.notNull().check(sql`type in (1002, 1003, 1004, 1005, 1006, 1007)`)
                )
                .addColumn('eventTimestampMs', 'integer', (col) => col.notNull())
                .modifyEnd(sql`STRICT`)
                .execute();

              await trx.schema
                .createIndex('latestPlaybackPosition_playbackHistoryId_index')
                .on('latestPlaybackPosition')
                .columns(['playbackHistoryId'])
                .execute();

              await trx.schema
                .createIndex('latestPlaybackPosition_type_index')
                .on('latestPlaybackPosition')
                .columns(['type'])
                .execute();

              await trx.schema
                .createIndex('latestPlaybackPosition_eventTimestampMs_index')
                .on('latestPlaybackPosition')
                .columns(['eventTimestampMs'])
                .execute();

              await sql`CREATE TRIGGER IF NOT EXISTS latestPlaybackPosition_insert AFTER INSERT ON playbackHistory FOR EACH ROW WHEN NEW.deletedAt IS NULL
                        BEGIN
                          INSERT INTO latestPlaybackPosition(bookId, playbackHistoryId, positionMs, type, eventTimestampMs)
                            VALUES(NEW.bookId, NEW.id, NEW.positionMs, NEW.type, NEW.eventTimestampMs)
                            ON CONFLICT(bookId) DO UPDATE SET
                              playbackHistoryId = excluded.playbackHistoryId,
                              positionMs = excluded.positionMs,
                              type = excluded.type,
                              eventTimestampMs = excluded.eventTimestampMs
                            WHERE
                              NEW.eventTimestampMs > latestPlaybackPosition.eventTimestampMs
                              OR (
                                NEW.eventTimestampMs = latestPlaybackPosition.eventTimestampMs
                                AND NEW.type > latestPlaybackPosition.type
                              );
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS latestPlaybackPosition_update AFTER UPDATE ON playbackHistory FOR EACH ROW
                        BEGIN
                          DELETE FROM latestPlaybackPosition WHERE playbackHistoryId = NEW.id OR playbackHistoryId = OLD.id;

                          INSERT INTO latestPlaybackPosition(bookId, playbackHistoryId, positionMs, type, eventTimestampMs)
                            SELECT bookId, id, positionMs, type, eventTimestampMs FROM playbackHistory WHERE bookId = NEW.bookId ORDER BY eventTimestampMs DESC, type DESC LIMIT 1
                            ON CONFLICT(bookId) DO UPDATE SET
                              playbackHistoryId = excluded.playbackHistoryId,
                              positionMs = excluded.positionMs,
                              type = excluded.type,
                              eventTimestampMs = excluded.eventTimestampMs
                            WHERE
                              excluded.eventTimestampMs > latestPlaybackPosition.eventTimestampMs
                              OR (
                                excluded.eventTimestampMs = latestPlaybackPosition.eventTimestampMs
                                AND excluded.type > latestPlaybackPosition.type
                              );

                          INSERT INTO latestPlaybackPosition(bookId, playbackHistoryId, positionMs, type, eventTimestampMs)
                            SELECT bookId, id, positionMs, type, eventTimestampMs FROM playbackHistory WHERE bookId = OLD.bookId ORDER BY eventTimestampMs DESC, type DESC LIMIT 1
                            ON CONFLICT(bookId) DO UPDATE SET
                              playbackHistoryId = excluded.playbackHistoryId,
                              positionMs = excluded.positionMs,
                              type = excluded.type,
                              eventTimestampMs = excluded.eventTimestampMs
                            WHERE
                              excluded.eventTimestampMs > latestPlaybackPosition.eventTimestampMs
                              OR (
                                excluded.eventTimestampMs = latestPlaybackPosition.eventTimestampMs
                                AND excluded.type > latestPlaybackPosition.type
                              );
                        END;`.execute(trx);

              await sql`CREATE TRIGGER IF NOT EXISTS latestPlaybackPosition_delete AFTER DELETE ON playbackHistory FOR EACH ROW
                        BEGIN
                          DELETE FROM latestPlaybackPosition WHERE playbackHistoryId = OLD.id;

                          INSERT OR IGNORE INTO latestPlaybackPosition(bookId, playbackHistoryId, positionMs, type, eventTimestampMs)
                            SELECT bookId, id, positionMs, type, eventTimestampMs FROM playbackHistory WHERE bookId = OLD.bookId ORDER BY eventTimestampMs DESC, type DESC LIMIT 1;
                        END;`.execute(trx);
            });
          },
        },
      },
    }),
  });
