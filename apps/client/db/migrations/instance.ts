import { Kysely, Migrator, sql } from 'kysely';

import { ExpoMigrationProvider } from '~/db/driver';
import { InstanceDatabase } from '~/db/schema/instance';

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
                .createIndex('author_updatedAt_index')
                .on('author')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('author_deletedAt_index')
                .on('author')
                .columns(['deletedAt'])
                .execute();

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
                .createIndex('series_updatedAt_index')
                .on('series')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('series_deletedAt_index')
                .on('series')
                .columns(['deletedAt'])
                .execute();

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
                .createIndex('book_otherTypeId_index')
                .on('book')
                .columns(['otherTypeId'])
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
                .createIndex('bookContributor_updatedAt_index')
                .on('bookContributor')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('bookContributor_deletedAt_index')
                .on('bookContributor')
                .columns(['deletedAt'])
                .execute();

              await trx.schema
                .createTable('audiobookChapter')
                .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('parentId', 'integer', (col) =>
                  col.references('audiobookChapter.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('source', 'text', (col) =>
                  col.notNull().check(sql`source in ('file', 'audible')`)
                )
                .addColumn('title', 'text', (col) => col.notNull())
                .addColumn('duration', 'integer', (col) => col.notNull())
                .addColumn('startOffset', 'integer', (col) => col.notNull())
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
                .createTable('audiobookFile')
                .addColumn('id', 'integer', (col) => col.notNull().primaryKey().autoIncrement())
                .addColumn('libraryId', 'integer', (col) =>
                  col.notNull().references('library.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('bookId', 'integer', (col) =>
                  col.notNull().references('book.id').onDelete('cascade').onUpdate('cascade')
                )
                .addColumn('path', 'text', (col) => col.notNull())
                .addColumn('duration', 'integer', (col) => col.notNull())
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
                .createIndex('ebookFile_updatedAt_index')
                .on('ebookFile')
                .columns(['updatedAt'])
                .execute();

              await trx.schema
                .createIndex('ebookFile_deletedAt_index')
                .on('ebookFile')
                .columns(['deletedAt'])
                .execute();
            });
          },
        },
      },
    }),
  });
