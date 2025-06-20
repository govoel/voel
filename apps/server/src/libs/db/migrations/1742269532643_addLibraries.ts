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

  await db.schema
    .createIndex('library_updatedAt_index')
    .on('library')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('library_deletedAt_index')
    .on('library')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_library_updatedAt BEFORE UPDATE OF id, name, deletedAt ON library FOR EACH ROW
            BEGIN
              UPDATE library SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('author')
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
    .createIndex('author_updatedAt_index')
    .on('author')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('author_deletedAt_index')
    .on('author')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_author_updatedAt BEFORE UPDATE OF id, asin, name, about, avatar, deletedAt ON author FOR EACH ROW
            BEGIN
              UPDATE author SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('series')
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
    .on('series')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('series_deletedAt_index')
    .on('series')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_series_updatedAt BEFORE UPDATE OF id, asin, name, summary, deletedAt ON series FOR EACH ROW
            BEGIN
              UPDATE series SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('book')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('asin', 'text', (col) => col.unique().notNull())
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
    .createIndex('book_otherTypeId_index')
    .on('book')
    .columns(['otherTypeId'])
    .execute();

  await db.schema.createIndex('book_updatedAt_index').on('book').columns(['updatedAt']).execute();

  await db.schema.createIndex('book_deletedAt_index').on('book').columns(['deletedAt']).execute();

  await sql`CREATE TRIGGER update_book_updatedAt BEFORE UPDATE OF id, asin, type, otherTypeId, title, subtitle, cover, summary, adultsOnly, deletedAt ON book FOR EACH ROW
            BEGIN
              UPDATE book SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookAuthor')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('authorId', 'integer', (col) =>
      col.notNull().references('author.id').onDelete('cascade').onUpdate('cascade')
    )
    .addUniqueConstraint('bookAuthor_bookId_authorId_unique', ['bookId', 'authorId'])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('bookAuthor_updatedAt_index')
    .on('bookAuthor')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('bookAuthor_deletedAt_index')
    .on('bookAuthor')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_bookAuthor_updatedAt BEFORE UPDATE OF bookId, authorId, deletedAt ON bookAuthor FOR EACH ROW
            BEGIN
              UPDATE bookAuthor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookSeries')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('seriesId', 'integer', (col) =>
      col.notNull().references('series.id').onDelete('cascade').onUpdate('cascade')
    )
    .addUniqueConstraint('bookSeries_bookId_seriesId_unique', ['bookId', 'seriesId'])
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('bookSeries_updatedAt_index')
    .on('bookSeries')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('bookSeries_deletedAt_index')
    .on('bookSeries')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_bookSeries_updatedAt BEFORE UPDATE OF bookId, seriesId, label, sort, deletedAt ON bookSeries FOR EACH ROW
            BEGIN
              UPDATE bookSeries SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookContributor')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) =>
      col.notNull().check(sql`role in ('narrator', 'editor', 'illustrator', 'translator')`)
    )
    .addUniqueConstraint('bookContributor_bookId_name_role_unique', ['bookId', 'name', 'role'])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('bookContributor_updatedAt_index')
    .on('bookContributor')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('bookContributor_deletedAt_index')
    .on('bookContributor')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_bookContributor_updatedAt BEFORE UPDATE OF bookId, name, role, deletedAt ON bookContributor FOR EACH ROW
            BEGIN
              UPDATE bookContributor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookFile')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('durationMs', 'integer', (col) => col.notNull())
    .addColumn('disc', 'integer', (col) => col.notNull())
    .addColumn('track', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('audiobookFile_updatedAt_index')
    .on('audiobookFile')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('audiobookFile_deletedAt_index')
    .on('audiobookFile')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_audiobookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, durationMs, disc, track, deletedAt ON audiobookFile FOR EACH ROW
            BEGIN
              UPDATE audiobookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookChapter')
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
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('audiobookChapter_parentId_index')
    .on('audiobookChapter')
    .columns(['parentId'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_updatedAt_index')
    .on('audiobookChapter')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('audiobookChapter_deletedAt_index')
    .on('audiobookChapter')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_audiobookChapter_updatedAt BEFORE UPDATE OF parentId, bookId, fileId, source, title, durationMs, startOffsetMs, deletedAt ON audiobookChapter FOR EACH ROW
              BEGIN
                UPDATE audiobookChapter SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
              END;`.execute(db);

  await db.schema
    .createTable('ebookFile')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.unique().notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await db.schema
    .createIndex('ebookFile_updatedAt_index')
    .on('ebookFile')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('ebookFile_deletedAt_index')
    .on('ebookFile')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_ebookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, deletedAt ON ebookFile FOR EACH ROW
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
    .createIndex('playbackHistory_updatedAt_index')
    .on('playbackHistory')
    .columns(['updatedAt'])
    .execute();

  await db.schema
    .createIndex('playbackHistory_deletedAt_index')
    .on('playbackHistory')
    .columns(['deletedAt'])
    .execute();

  await sql`CREATE TRIGGER update_playbackHistory_updatedAt BEFORE UPDATE OF id, userId, type, bookId, positionMs, eventTimestampMs, sessionId, deletedAt ON playbackHistory FOR EACH ROW
              BEGIN
                UPDATE playbackHistory SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
              END;`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS update_playbackHistory_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_ebookFile_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_audiobookFile_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_audiobookChapter_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_bookContributor_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_bookSeries_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_bookAuthor_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_book_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_series_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_author_updatedAt;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_library_updatedAt;`.execute(db);

  await db.schema.dropTable('playbackHistory').ifExists().execute();
  await db.schema.dropTable('ebookFile').ifExists().execute();
  await db.schema.dropTable('audiobookChapter').ifExists().execute();
  await db.schema.dropTable('audiobookFile').ifExists().execute();
  await db.schema.dropTable('bookContributor').ifExists().execute();
  await db.schema.dropTable('bookSeries').ifExists().execute();
  await db.schema.dropTable('bookAuthor').ifExists().execute();
  await db.schema.dropTable('book').ifExists().execute();
  await db.schema.dropTable('series').ifExists().execute();
  await db.schema.dropTable('author').ifExists().execute();
  await db.schema.dropTable('library').ifExists().execute();
}
