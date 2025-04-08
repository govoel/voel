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

  await db.schema
    .createTable('author')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement().notNull())
    .addColumn('asin', 'text', (col) => col.unique().notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('about', 'text')
    .addColumn('avatar', 'text')
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
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

  await sql`CREATE TRIGGER update_book_updatedAt BEFORE UPDATE OF id, asin, type, otherTypeId, title, subtitle, cover, summary, adultsOnly, deletedAt ON book FOR EACH ROW
            BEGIN
              UPDATE book SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookAuthor')
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('authorId', 'integer', (col) =>
      col.notNull().references('author.id').onDelete('cascade').onUpdate('cascade')
    )
    .addPrimaryKeyConstraint('bookAuthor_primary_key', ['bookId', 'authorId'])
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_bookAuthor_updatedAt BEFORE UPDATE OF bookId, authorId, deletedAt ON bookAuthor FOR EACH ROW
            BEGIN
              UPDATE bookAuthor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookSeries')
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('seriesId', 'integer', (col) =>
      col.notNull().references('series.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('sort', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .addPrimaryKeyConstraint('bookSeries_primary_key', ['bookId', 'seriesId'])
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_bookSeries_updatedAt BEFORE UPDATE OF bookId, seriesId, label, sort, deletedAt ON bookSeries FOR EACH ROW
            BEGIN
              UPDATE bookSeries SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('bookContributor')
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) =>
      col.notNull().check(sql`role in ('narrator', 'editor', 'illustrator', 'translator')`)
    )
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .addPrimaryKeyConstraint('bookContributor_primary_key', ['bookId', 'name', 'role'])
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_bookContributor_updatedAt BEFORE UPDATE OF bookId, name, role, deletedAt ON bookContributor FOR EACH ROW
            BEGIN
              UPDATE bookContributor SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookChapter')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('parentId', 'integer', (col) =>
      col.references('audiobookChapter.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('source', 'text', (col) => col.notNull().check(sql`source in ('file', 'audible')`))
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('duration', 'integer', (col) => col.notNull())
    .addColumn('startOffset', 'integer', (col) => col.notNull())
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

  await sql`CREATE TRIGGER update_audiobookChapter_updatedAt BEFORE UPDATE OF bookId, parentId, source, title, duration, startOffset, deletedAt ON audiobookChapter FOR EACH ROW
            BEGIN
              UPDATE audiobookChapter SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);

  await db.schema
    .createTable('audiobookFile')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
    .addColumn('libraryId', 'integer', (col) =>
      col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('bookId', 'integer', (col) =>
      col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
    )
    .addColumn('path', 'text', (col) => col.notNull().unique())
    .addColumn('duration', 'integer', (col) => col.notNull())
    .addColumn('disc', 'integer', (col) => col.notNull())
    .addColumn('track', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .addUniqueConstraint('audiobookFile_libraryId_bookId_unique', ['libraryId', 'bookId'])
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_audiobookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, duration, disc, track, deletedAt ON audiobookFile FOR EACH ROW
            BEGIN
              UPDATE audiobookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
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
    .addColumn('path', 'text', (col) => col.notNull().unique())
    .addColumn('createdAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('updatedAt', 'integer', (col) => col.defaultTo(sql`(unixepoch())`).notNull())
    .addColumn('deletedAt', 'integer')
    .modifyEnd(sql`STRICT`)
    .execute();

  await sql`CREATE TRIGGER update_ebookFile_updatedAt BEFORE UPDATE OF libraryId, bookId, path, deletedAt ON ebookFile FOR EACH ROW
            BEGIN
              UPDATE ebookFile SET updatedAt = unixepoch() WHERE rowid = NEW.rowid;
            END;`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
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

  await db.schema.dropTable('ebookFile').ifExists().execute();
  await db.schema.dropTable('audiobookFile').ifExists().execute();
  await db.schema.dropTable('audiobookChapter').ifExists().execute();
  await db.schema.dropTable('bookContributor').ifExists().execute();
  await db.schema.dropTable('bookSeries').ifExists().execute();
  await db.schema.dropTable('bookAuthor').ifExists().execute();
  await db.schema.dropTable('book').ifExists().execute();
  await db.schema.dropTable('series').ifExists().execute();
  await db.schema.dropTable('author').ifExists().execute();
  await db.schema.dropTable('library').ifExists().execute();
}
