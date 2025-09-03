import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('library')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('name', 'text', (col) => col.unique().notNull())
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('library_updatedAt_index')
    .ifNotExists()
    .on('library')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('library_deletedAt_index')
    .ifNotExists()
    .on('library')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_library_updatedAt BEFORE UPDATE OF id, name, deletedAt ON library FOR EACH ROW
            BEGIN
              UPDATE library SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('contributor')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('asin', 'text', (col) => col.unique().notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('about', 'text')
    .addColumn('avatar', 'text')
    .addColumn('avatarThumbhash', 'text')
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('contributor_updatedAt_index')
    .ifNotExists()
    .on('contributor')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('contributor_deletedAt_index')
    .ifNotExists()
    .on('contributor')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_contributor_updatedAt BEFORE UPDATE OF id, asin, name, about, avatar, deletedAt ON contributor FOR EACH ROW
            BEGIN
              UPDATE contributor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('series')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('asin', 'text', (col) => col.unique().notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('summary', 'text')
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('series_updatedAt_index')
    .ifNotExists()
    .on('series')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('series_deletedAt_index')
    .ifNotExists()
    .on('series')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_series_updatedAt BEFORE UPDATE OF id, asin, name, summary, deletedAt ON series FOR EACH ROW
            BEGIN
              UPDATE series SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('book')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('asin', 'text', (col) => col.unique())
    .addColumn('type', 'text', (col) => col.notNull().check(sql`type in ('audio', 'ebook')`))
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
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('book_type_index')
    .ifNotExists()
    .on('book')
    .columns(['type'])
    .execute();

  await db.schema
    .createIndex('book_otherTypeId_index')
    .ifNotExists()
    .on('book')
    .columns(['otherTypeId'])
    .execute();

  await db.schema
    .createIndex('book_adultsOnly_index')
    .ifNotExists()
    .on('book')
    .columns(['adultsOnly'])
    .execute();

  await db.schema
    .createIndex('book_updatedAt_index')
    .ifNotExists()
    .on('book')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('book_deletedAt_index')
    .ifNotExists()
    .on('book')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_book_updatedAt BEFORE UPDATE OF id, asin, type, otherTypeId, title, subtitle, cover, summary, adultsOnly, deletedAt ON book FOR EACH ROW
            BEGIN
              UPDATE book SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookSeries')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('seriesId', 'integer', (col) =>
      col.references('series.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort', 'integer', (col) => col.notNull())
    .addUniqueConstraint('bookSeries_bookId_seriesId_title_label_sort_unique', [
      'bookId',
      'seriesId',
      'title',
      'label',
      'sort',
    ])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('bookSeries_bookId_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('bookSeries_seriesId_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['seriesId'])
    .execute();

  await db.schema
    .createIndex('bookSeries_title_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['title'])
    .execute();

  await db.schema
    .createIndex('bookSeries_sort_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['sort'])
    .execute();

  await db.schema
    .createIndex('bookSeries_updatedAt_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('bookSeries_deletedAt_index')
    .ifNotExists()
    .on('bookSeries')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_bookSeries_updatedAt BEFORE UPDATE OF bookId, seriesId, title, label, sort, deletedAt ON bookSeries FOR EACH ROW
            BEGIN
              UPDATE bookSeries SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookContributor')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('contributorId', 'integer', (col) =>
      col.references('contributor.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) =>
      col.notNull().check(sql`role in ('author', 'narrator', 'editor', 'translator', 'foreword')`)
    )
    .addUniqueConstraint('bookContributor_bookId_contributorId_name_role_unique', [
      'bookId',
      'contributorId',
      'name',
      'role',
    ])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('bookContributor_bookId_index')
    .ifNotExists()
    .on('bookContributor')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('bookContributor_contributorId_index')
    .ifNotExists()
    .on('bookContributor')
    .columns(['contributorId'])
    .execute();

  await db.schema
    .createIndex('bookContributor_role_index')
    .ifNotExists()
    .on('bookContributor')
    .columns(['role'])
    .execute();

  await db.schema
    .createIndex('bookContributor_updatedAt_index')
    .ifNotExists()
    .on('bookContributor')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('bookContributor_deletedAt_index')
    .ifNotExists()
    .on('bookContributor')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_bookContributor_updatedAt BEFORE UPDATE OF bookId, contributorId, name, role, deletedAt ON bookContributor FOR EACH ROW
            BEGIN
              UPDATE bookContributor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookFile')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('durationMs', 'integer', (col) => col.notNull())
    .addColumn('customOrder', 'integer')
    .addColumn('disc', 'integer', (col) => col.notNull())
    .addColumn('track', 'integer', (col) => col.notNull())
    .addColumn('mtimeMs', 'integer', (col) => col.notNull())
    .addColumn('metadataHash', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('audiobookFile_libraryId_index')
    .ifNotExists()
    .on('audiobookFile')
    .columns(['libraryId'])
    .execute();

  await db.schema
    .createIndex('audiobookFile_bookId_index')
    .ifNotExists()
    .on('audiobookFile')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('audiobookFile_customOrder_disc_track_index')
    .ifNotExists()
    .on('audiobookFile')
    .columns(['customOrder', 'disc', 'track'])
    .execute();

  await db.schema
    .createIndex('audiobookFile_updatedAt_index')
    .ifNotExists()
    .on('audiobookFile')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('audiobookFile_deletedAt_index')
    .ifNotExists()
    .on('audiobookFile')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_audiobookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, durationMs, customOrder, disc, track, mtimeMs, metadataHash, deletedAt ON audiobookFile FOR EACH ROW
            BEGIN
              UPDATE audiobookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('unidentifiedAudiobookFile')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('durationMs', 'integer', (col) => col.notNull())
    .addColumn('disc', 'integer', (col) => col.notNull())
    .addColumn('track', 'integer', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('mtimeMs', 'integer', (col) => col.notNull())
    .addColumn('metadataHash', 'text', (col) => col.notNull())
    .addColumn('metadata', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('unidentifiedAudiobookFile_libraryId_index')
    .ifNotExists()
    .on('unidentifiedAudiobookFile')
    .columns(['libraryId'])
    .execute();

  await db.schema
    .createIndex('unidentifiedAudiobookFile_disc_track_index')
    .ifNotExists()
    .on('unidentifiedAudiobookFile')
    .columns(['disc', 'track'])
    .execute();

  await db.schema
    .createIndex('unidentifiedAudiobookFile_reason_index')
    .ifNotExists()
    .on('unidentifiedAudiobookFile')
    .columns(['reason'])
    .execute();

  await db.schema
    .createIndex('unidentifiedAudiobookFile_updatedAt_index')
    .ifNotExists()
    .on('unidentifiedAudiobookFile')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('unidentifiedAudiobookFile_deletedAt_index')
    .ifNotExists()
    .on('unidentifiedAudiobookFile')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_unidentifiedAudiobookFile_updatedAt BEFORE UPDATE OF libraryId, path, durationMs, disc, track, reason, mtimeMs, metadataHash, metadata, deletedAt ON unidentifiedAudiobookFile FOR EACH ROW
            BEGIN
              UPDATE unidentifiedAudiobookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookChapter')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
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
    .addUniqueConstraint(
      'audiobookChapter_bookId_fileId_source_title_durationMs_startOffsetMs_unique',
      ['bookId', 'fileId', 'source', 'title', 'durationMs', 'startOffsetMs']
    )
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('audiobookChapter_parentId_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['parentId'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_bookId_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_fileId_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['fileId'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_source_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['source'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_startOffsetMs_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['startOffsetMs'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_updatedAt_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_deletedAt_index')
    .ifNotExists()
    .on('audiobookChapter')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_audiobookChapter_updatedAt BEFORE UPDATE OF parentId, bookId, fileId, source, title, durationMs, startOffsetMs, deletedAt ON audiobookChapter FOR EACH ROW
              BEGIN
                UPDATE audiobookChapter SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
              END;`.execute(db);

  await db.schema
    .createTable('ebookFile')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('mtime', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('ebookFile_libraryId_index')
    .ifNotExists()
    .on('ebookFile')
    .columns(['libraryId'])
    .execute();

  await db.schema
    .createIndex('ebookFile_bookId_index')
    .ifNotExists()
    .on('ebookFile')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('ebookFile_updatedAt_index')
    .ifNotExists()
    .on('ebookFile')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('ebookFile_deletedAt_index')
    .ifNotExists()
    .on('ebookFile')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_ebookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, deletedAt ON ebookFile FOR EACH ROW
            BEGIN
              UPDATE ebookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

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
    .addColumn('sessionId', 'text', (col) => col.notNull())
    .addUniqueConstraint(
      'playbackHistory_userId_type_bookId_positionMs_eventTimestampMs_sessionId_unique',
      ['userId', 'type', 'bookId', 'positionMs', 'eventTimestampMs', 'sessionId']
    )
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('playbackHistory_userId_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['userId'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_type_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['type'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_bookId_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['bookId'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_eventTimestampMs_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['eventTimestampMs'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_sessionId_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['sessionId'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_updatedAt_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_deletedAt_index')
    .ifNotExists()
    .on('playbackHistory')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER IF NOT EXISTS update_playbackHistory_updatedAt BEFORE UPDATE OF id, userId, type, bookId, positionMs, eventTimestampMs, sessionId, deletedAt ON playbackHistory FOR EACH ROW
              BEGIN
                UPDATE playbackHistory SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
              END;`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('playbackHistory').ifExists().execute();
  await db.schema.dropTable('ebookFile').ifExists().execute();
  await db.schema.dropTable('audiobookChapter').ifExists().execute();
  await db.schema.dropTable('unidentifiedAudiobookFile').ifExists().execute();
  await db.schema.dropTable('audiobookFile').ifExists().execute();
  await db.schema.dropTable('bookContributor').ifExists().execute();
  await db.schema.dropTable('bookSeries').ifExists().execute();
  await db.schema.dropTable('book').ifExists().execute();
  await db.schema.dropTable('series').ifExists().execute();
  await db.schema.dropTable('contributor').ifExists().execute();
  await db.schema.dropTable('library').ifExists().execute();
}
