import { FetchHttpClient, KeyValueStore, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { fetch } from 'bun';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Cause, Effect, Layer, Option, Schema } from 'effect';
import { FileMigrationProvider, Migrator } from 'kysely';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Turndown } from '@/router/v1/library/audible/turndown';
import { FFProbeStdoutSchema, layerNoop, makeFsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

const makeFsLayer = async (
  paths: { path: string; to?: string; ffprobe?: typeof FFProbeStdoutSchema.Type }[]
) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voel-test-'));

  for (const p of paths) {
    const full = path.normalize(path.join(tmp, p.path));
    await fs.mkdir(path.dirname(full), { recursive: true });

    if (p.to) {
      const targetFull = path.normalize(path.join(tmp, p.to));
      await fs.mkdir(path.dirname(targetFull), { recursive: true });
      await fs.writeFile(targetFull, '');
      await fs.symlink(targetFull, full);
    } else {
      await fs.writeFile(full, '');
    }
  }

  const originalFsExtended = makeFsExtended();

  return layerNoop({
    access: (p, o) => originalFsExtended.access(path.normalize(path.join(tmp, p)), o),
    realpath: (p) =>
      originalFsExtended
        .realpath(path.normalize(path.join(tmp, p)))
        .pipe(Effect.map((r) => r.replace(tmp, ''))),
    lstat: (p) => originalFsExtended.lstat(path.normalize(path.join(tmp, p))),
    stat: (p) => originalFsExtended.stat(path.normalize(path.join(tmp, p))),
    opendir: (p) =>
      originalFsExtended
        .opendir({
          path: path.normalize(path.join(tmp, p.path.toString())),
          options: p.options,
        })
        .pipe(
          Effect.map((dir) => {
            const originalAsyncIterator = dir[Symbol.asyncIterator].bind(dir);

            dir[Symbol.asyncIterator] = async function* (): AsyncGenerator<
              Dirent<string>,
              undefined,
              unknown
            > {
              for await (const entry of originalAsyncIterator()) {
                entry.parentPath = entry.parentPath.replace(tmp, '');
                yield entry;
              }
            };

            return dir;
          })
        ),
    ffprobe: (p) =>
      Effect.gen(function* () {
        const mock = paths.find((x) => x.path === p.path)?.ffprobe;

        if (mock) {
          return mock;
        }

        return yield* Effect.fail(new Cause.UnknownException('ffprobe not mocked'));
      }),
  });
};

const makeCachedAudibleLayer = async () => {
  const {
    Audible,
    ProductBookSchema,
    ProductSeriesSchema,
    BookSearchResponseSchema,
    ChapterResponseSchema,
  } = await import('./audible');

  return Effect.provideServiceEffect(
    Audible,
    Effect.gen(function* () {
      const realAudible = yield* Audible;

      const kv = yield* KeyValueStore.KeyValueStore;

      const getAuthorsByAsinKV = kv.forSchema(
        Schema.Struct({
          asin: Schema.String,
          name: Schema.String,
          avatar: Schema.String,
          about: Schema.NullOr(Schema.String),
        })
      );

      const getBooksBySearchKV = kv.forSchema(BookSearchResponseSchema.fields.products);

      const getChaptersByAsinKV = kv.forSchema(
        ChapterResponseSchema.fields.content_metadata.fields.chapter_info
      );

      const getProductByAsinKV = kv.forSchema(Schema.Union(ProductBookSchema, ProductSeriesSchema));

      const generateThumbhashKV = kv.forSchema(Schema.String);

      return new Audible({
        getAuthorByAsin: (params) =>
          Effect.gen(function* () {
            const cache = yield* getAuthorsByAsinKV
              .get(`getAuthorsByAsin:${params.asin}`)
              .pipe(Effect.catchAll(() => Effect.die('unreachable')));

            if (Option.isSome(cache)) {
              return cache.value;
            } else if (process.env.LOAD_CACHE === 'yes') {
              return yield* realAudible
                .getAuthorByAsin(params)
                .pipe(
                  Effect.tap((result) =>
                    getAuthorsByAsinKV
                      .set(`getAuthorsByAsin:${params.asin}`, result)
                      .pipe(Effect.catchAll(() => Effect.die('unreachable')))
                  )
                );
            } else {
              return yield* Effect.die('unreachable');
            }
          }),
        getBooksBySearch: (params) =>
          Effect.gen(function* () {
            const cache = yield* getBooksBySearchKV
              .get(`getBooksBySearch:${Bun.hash.rapidhash(JSON.stringify(params))}`)
              .pipe(Effect.catchAll(() => Effect.die('unreachable')));

            if (Option.isSome(cache)) {
              return cache.value;
            } else if (process.env.LOAD_CACHE === 'yes') {
              return yield* realAudible
                .getBooksBySearch(params)
                .pipe(
                  Effect.tap((result) =>
                    getBooksBySearchKV
                      .set(`getBooksBySearch:${Bun.hash.rapidhash(JSON.stringify(params))}`, result)
                      .pipe(Effect.catchAll(() => Effect.die('unreachable')))
                  )
                );
            } else {
              return yield* Effect.die('unreachable');
            }
          }),
        getChaptersByAsin: (params) =>
          Effect.gen(function* () {
            const cache = yield* getChaptersByAsinKV
              .get(`getChaptersByAsin:${params.asin}`)
              .pipe(Effect.catchAll(() => Effect.die('unreachable')));

            if (Option.isSome(cache)) {
              return cache.value;
            } else if (process.env.LOAD_CACHE === 'yes') {
              return yield* realAudible
                .getChaptersByAsin(params)
                .pipe(
                  Effect.tap((result) =>
                    getChaptersByAsinKV
                      .set(`getChaptersByAsin:${params.asin}`, result)
                      .pipe(Effect.catchAll(() => Effect.die('unreachable')))
                  )
                );
            } else {
              return yield* Effect.die('unreachable');
            }
          }),
        getProductByAsin: (params) =>
          Effect.gen(function* () {
            const cache = yield* getProductByAsinKV
              .get(`getProductByAsin:${params.asin}`)
              .pipe(Effect.catchAll(() => Effect.die('unreachable')));

            if (Option.isSome(cache)) {
              return cache.value;
            } else if (process.env.LOAD_CACHE === 'yes') {
              return yield* realAudible
                .getProductByAsin(params)
                .pipe(
                  Effect.tap((result) =>
                    getProductByAsinKV
                      .set(`getProductByAsin:${params.asin}`, result)
                      .pipe(Effect.catchAll(() => Effect.die('unreachable')))
                  )
                );
            } else {
              return yield* Effect.die('unreachable');
            }
          }),
        generateThumbhash: (params) =>
          Effect.gen(function* () {
            const cache = yield* generateThumbhashKV
              .get(`generateThumbhash:${Bun.hash.rapidhash(params.imageURL)}`)
              .pipe(Effect.catchAll(() => Effect.die('unreachable')));

            if (Option.isSome(cache)) {
              return cache.value;
            } else if (process.env.LOAD_CACHE === 'yes') {
              return yield* realAudible
                .generateThumbhash(params)
                .pipe(
                  Effect.tap((result) =>
                    generateThumbhashKV
                      .set(`generateThumbhash:${Bun.hash.rapidhash(params.imageURL)}`, result)
                      .pipe(Effect.catchAll(() => Effect.die('unreachable')))
                  )
                );
            } else {
              return yield* Effect.die('unreachable');
            }
          }),
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Audible.Default,
          KeyValueStore.layerFileSystem(`${import.meta.dir}/__http__`).pipe(
            Layer.provide(Layer.mergeAll(Path.layer, BunFileSystem.layer))
          )
        )
      )
    )
  );
};

describe('machine', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.LOAD_CACHE = 'no';
    const { db } = await import('@/libs/db');
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(import.meta.dir, '..', '..', '..', 'libs', 'db', 'migrations'),
      }),
    });
    await migrator.migrateToLatest().catch((err) => {
      console.error('Error while migrating database...', err);
    });
  });

  afterEach(async () => {
    const { db } = await import('@/libs/db');
    await db.deleteFrom('playbackHistory').execute();
    await db.deleteFrom('ebookFile').execute();
    await db.deleteFrom('audiobookChapter').execute();
    await db.deleteFrom('unidentifiedAudiobookFile').execute();
    await db.deleteFrom('audiobookFile').execute();
    await db.deleteFrom('bookContributor').execute();
    await db.deleteFrom('bookSeries').execute();
    await db.deleteFrom('book').execute();
    await db.deleteFrom('series').execute();
    await db.deleteFrom('contributor').execute();
    await db.deleteFrom('library').execute();
  });

  test.each(['.voelignore', '.nomedia'])(
    'should delete identified files after %p is added',
    async (ignoreFilename) => {
      const { db } = await import('@/libs/db');
      const { libraryScanEffect } = await import('./machine');
      const { Audible } = await import('./audible');

      const insertedLibrary = await db
        .insertInto('library')
        .values({ name: 'LibOne', path: '/library' })
        .returning(['id', 'name', 'path'])
        .executeTakeFirstOrThrow();

      const layer1 = Layer.mergeAll(
        await makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {
                  asin: 'B0DNNM3KN4',
                  album: 'We Are All Guilty Here',
                  artist: 'Karin Slaughter',
                },
              },
            },
          },
        ]),
        Path.layer,
        Hash.Default
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer1), await makeCachedAudibleLayer())
      );

      const dbBook1 = await db
        .selectFrom('book')
        .select(['book.id', 'book.asin'])
        .where('book.asin', '=', 'B0DNNM3KN4')
        .executeTakeFirstOrThrow();

      expect(dbBook1.asin).toBe('B0DNNM3KN4');

      const dbFile = await db
        .selectFrom('audiobookFile')
        .select(['audiobookFile.id', 'audiobookFile.path', 'audiobookFile.deletedAt'])
        .where('audiobookFile.bookId', '=', dbBook1.id)
        .executeTakeFirstOrThrow();

      expect(dbFile.path).toBe('/library/a/fake.m4b');
      expect(dbFile.deletedAt).toBeNull();

      const layer2 = Layer.mergeAll(
        await makeFsLayer([
          { path: `/library/a/${ignoreFilename}` },
          {
            path: '/library/a/fake.m4b',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {
                  asin: 'B0DNNM3KN4',
                  album: 'We Are All Guilty Here',
                  artist: 'Karin Slaughter',
                },
              },
            },
          },
        ]),
        Path.layer,
        Hash.Default,
        Audible.Default
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer2))
      );

      const dbFile2 = await db
        .selectFrom('audiobookFile')
        .select(['audiobookFile.id', 'audiobookFile.path', 'audiobookFile.deletedAt'])
        .where('audiobookFile.bookId', '=', dbBook1.id)
        .executeTakeFirstOrThrow();

      expect(dbFile2.path).toBe('/library/a/fake.m4b');
      expect(dbFile2.deletedAt).not.toBeNull();

      const spyFetch = spyOn(global, 'fetch');
      const layer3 = Layer.mergeAll(
        await makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {
                  asin: 'B0DNNM3KN4',
                  album: 'We Are All Guilty Here',
                  artist: 'Karin Slaughter',
                },
              },
            },
          },
        ]),
        Path.layer,
        Hash.Default,
        Audible.DefaultWithoutDependencies.pipe(
          Layer.provide(
            Layer.mergeAll(
              Turndown.Default,
              FetchHttpClient.layer.pipe(
                Layer.provide(
                  Layer.succeed(FetchHttpClient.Fetch, spyFetch as unknown as typeof fetch)
                )
              )
            )
          )
        )
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer3))
      );

      const dbFile3 = await db
        .selectFrom('audiobookFile')
        .select(['audiobookFile.id', 'audiobookFile.path', 'audiobookFile.deletedAt'])
        .where('audiobookFile.bookId', '=', dbBook1.id)
        .executeTakeFirstOrThrow();

      expect(dbFile3.path).toBe('/library/a/fake.m4b');
      expect(dbFile3.deletedAt).toBeNull();

      // book should come back without the identification process being triggered
      expect(spyFetch).not.toHaveBeenCalled();
    }
  );
});
