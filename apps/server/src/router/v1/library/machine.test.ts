import { FetchHttpClient, KeyValueStore, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { fetch } from 'bun';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Effect, Layer, Option, Schema } from 'effect';
import { FileMigrationProvider, Migrator, type Selectable } from 'kysely';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Turndown } from '@/router/v1/library/audible/turndown';
import {
  FFProbeStdoutSchema,
  FsExtended,
  makeFsExtended,
  makeFsExtendedNoop,
} from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

import type { AudiobookFileTable } from '@/libs/db/schema';

const makeFsLayer = Effect.fn(function* (
  paths: {
    path: string;
    to?: string;
    ffprobe?: typeof FFProbeStdoutSchema.Type;
    partialHash?: string;
  }[]
) {
  const tmp = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), 'voel-test-')));

  for (const p of paths) {
    const full = path.normalize(path.join(tmp, p.path));
    yield* Effect.promise(() => fs.mkdir(path.dirname(full), { recursive: true }));

    if (p.to) {
      const targetFull = path.normalize(path.join(tmp, p.to));
      yield* Effect.promise(() => fs.mkdir(path.dirname(targetFull), { recursive: true }));
      yield* Effect.promise(() => fs.writeFile(targetFull, ''));
      yield* Effect.promise(() => fs.symlink(targetFull, full));
    } else {
      yield* Effect.promise(() => fs.writeFile(full, ''));
    }
  }

  const originalFsExtended = yield* makeFsExtended();

  let currentFd = 300;
  const fdToPaths = new Map<number, string>();

  return makeFsExtendedNoop({
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
    open: (p) => {
      const fd = currentFd++;
      fdToPaths.set(fd, p.toString());
      return Effect.succeed(fd);
    },
    ffprobe: (fd) =>
      Effect.gen(function* () {
        const mock = paths.find((x) => x.path === fdToPaths.get(fd))?.ffprobe;

        if (mock) {
          return mock;
        }

        return yield* Effect.die('ffprobe not mocked');
      }),
    partialHash: (fd) =>
      Effect.gen(function* () {
        const mock = paths.find((x) => x.path === fdToPaths.get(fd))?.partialHash;

        if (mock) {
          return mock;
        }

        return yield* Effect.die(`partialHash not mocked for fd ${fd} / path ${fdToPaths.get(fd)}`);
      }),
  });
});

const makeCachedAudibleLayer = async () => {
  const {
    Audible,
    ProductBookSchema,
    ProductSeriesSchema,
    BookSearchResponseSchema,
    ChapterResponseSchema,
  } = await import('./audible');

  return Effect.gen(function* () {
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
  );
};

const expectFileIsIdentified = async ({
  path,
  bookId,
  hash,
  deleted,
}: {
  path: string;
  bookId: number;
  hash: string;
  deleted: boolean;
}) => {
  const { db } = await import('@/libs/db');
  const dbFile = await db
    .selectFrom('audiobookFile')
    .select([
      'audiobookFile.bookId',
      'audiobookFile.reason',
      'audiobookFile.path',
      'audiobookFile.mtimeMs',
      'audiobookFile.partialFileHash',
      'audiobookFile.deletedAt',
    ])
    .where('audiobookFile.path', '=', path)
    .executeTakeFirstOrThrow();

  expect(dbFile.bookId).toBe(bookId);
  expect(dbFile.reason).toBeNull();
  expect(dbFile.partialFileHash).toBe(hash);

  if (deleted) {
    expect(dbFile.deletedAt).not.toBeNull();
  } else {
    expect(dbFile.deletedAt).toBeNull();
  }

  return dbFile;
};

const expectFileIsUnidentified = async ({
  path,
  reason,
  deleted,
}: {
  path: string;
  reason: Selectable<AudiobookFileTable>['reason'];
  deleted: boolean;
}) => {
  const { db } = await import('@/libs/db');
  const dbFile = await db
    .selectFrom('audiobookFile')
    .select([
      'audiobookFile.bookId',
      'audiobookFile.reason',
      'audiobookFile.path',
      'audiobookFile.mtimeMs',
      'audiobookFile.partialFileHash',
      'audiobookFile.deletedAt',
    ])
    .where('audiobookFile.path', '=', path)
    .executeTakeFirstOrThrow();

  expect(dbFile.bookId).toBeNull();
  expect(dbFile.reason).toBe(reason);
  expect(dbFile.partialFileHash).toBeNull();

  if (deleted) {
    expect(dbFile.deletedAt).not.toBeNull();
  } else {
    expect(dbFile.deletedAt).toBeNull();
  }

  return dbFile;
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
    await db.deleteFrom('audiobookFile').execute();
    await db.deleteFrom('bookContributor').execute();
    await db.deleteFrom('bookSeries').execute();
    await db.deleteFrom('book').execute();
    await db.deleteFrom('series').execute();
    await db.deleteFrom('contributor').execute();
    await db.deleteFrom('library').execute();
  });

  test.each(['.voelignore', '.nomedia'])(
    'should delete files after %p is added',
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
        Layer.effect(
          FsExtended,
          makeFsLayer([
            {
              path: '/library/a/fake.m4b',
              partialHash: 'fakeHash',
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
            {
              path: '/library/a/fake2.m4b',
              partialHash: 'fakeHash2',
              ffprobe: {
                chapters: [],
                format: {
                  start_time: 0,
                  duration: 1000,
                  tags: {},
                },
              },
            },
          ]).pipe(Effect.provide(Hash.Default))
        ),
        Layer.effect(Audible, await makeCachedAudibleLayer()),
        Path.layer
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer1))
      );

      const dbBook1 = await db
        .selectFrom('book')
        .select(['book.id', 'book.asin'])
        .where('book.asin', '=', 'B0DNNM3KN4')
        .executeTakeFirstOrThrow();

      expect(dbBook1.asin).toBe('B0DNNM3KN4');

      await expectFileIsIdentified({
        path: '/library/a/fake.m4b',
        bookId: dbBook1.id,
        hash: 'fakeHash',
        deleted: false,
      });

      await expectFileIsUnidentified({
        path: '/library/a/fake2.m4b',
        reason: 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME',
        deleted: false,
      });

      const layer2 = Layer.mergeAll(
        Layer.effect(
          FsExtended,
          makeFsLayer([
            { path: `/library/a/${ignoreFilename}` },
            {
              path: '/library/a/fake.m4b',
              partialHash: 'fakeHash',
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
            {
              path: '/library/a/fake2.m4b',
              partialHash: 'fakeHash2',
              ffprobe: {
                chapters: [],
                format: {
                  start_time: 0,
                  duration: 1000,
                  tags: {},
                },
              },
            },
          ]).pipe(Effect.provide(Hash.Default))
        ),
        Layer.effect(Audible, await makeCachedAudibleLayer()),
        Path.layer
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer2))
      );

      await expectFileIsIdentified({
        path: '/library/a/fake.m4b',
        bookId: dbBook1.id,
        hash: 'fakeHash',
        deleted: true,
      });

      await expectFileIsUnidentified({
        path: '/library/a/fake2.m4b',
        reason: 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME',
        deleted: true,
      });

      const spyFetch = spyOn(global, 'fetch');
      const layer3 = Layer.mergeAll(
        Layer.effect(
          FsExtended,
          makeFsLayer([
            {
              path: '/library/a/fake.m4b',
              partialHash: 'fakeHash',
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
            {
              path: '/library/a/fake2.m4b',
              partialHash: 'fakeHash2',
              ffprobe: {
                chapters: [],
                format: {
                  start_time: 0,
                  duration: 1000,
                  tags: {},
                },
              },
            },
          ]).pipe(Effect.provide(Hash.Default))
        ),
        Path.layer,
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

      await expectFileIsIdentified({
        path: '/library/a/fake.m4b',
        bookId: dbBook1.id,
        hash: 'fakeHash',
        deleted: false,
      });

      await expectFileIsUnidentified({
        path: '/library/a/fake2.m4b',
        reason: 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME',
        deleted: false,
      });

      // book should come back without the identification process being triggered
      expect(spyFetch).not.toHaveBeenCalled();
    }
  );

  test.each(['.voelignore', '.nomedia'])(
    'should not insert files whose directory contains %p',
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
        Layer.effect(
          FsExtended,
          makeFsLayer([
            { path: `/library/a/${ignoreFilename}` },
            {
              path: '/library/a/fake.m4b',
              partialHash: 'fakeHash',
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
          ]).pipe(Effect.provide(Hash.Default))
        ),
        Layer.effect(Audible, await makeCachedAudibleLayer()),
        Path.layer
      );

      await Effect.runPromise(
        libraryScanEffect({
          id: insertedLibrary.id,
          name: insertedLibrary.name,
          path: insertedLibrary.path,
        }).pipe(Effect.provide(layer1))
      );

      expect(await db.selectFrom('book').select(['book.id']).execute()).toBeEmpty();

      expect(
        await db.selectFrom('audiobookFile').select(['audiobookFile.id']).execute()
      ).toBeEmpty();
    }
  );

  test("manually identified files don't get marked as unidentified on re-scan", async () => {
    const { db } = await import('@/libs/db');
    const { libraryScanEffect } = await import('./machine');
    const { Audible } = await import('./audible');

    const insertedLibrary = await db
      .insertInto('library')
      .values({ name: 'LibOne', path: '/library' })
      .returning(['id', 'name', 'path'])
      .executeTakeFirstOrThrow();

    const spyFetch = spyOn(global, 'fetch');
    const layer1 = Layer.mergeAll(
      Layer.effect(
        FsExtended,
        makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            partialHash: 'fakeHash',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {},
              },
            },
          },
        ]).pipe(Effect.provide(Hash.Default))
      ),
      Path.layer,
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
      }).pipe(Effect.provide(layer1))
    );

    expect(await db.selectFrom('book').select(['book.id', 'book.asin']).execute()).toBeEmpty();

    await expectFileIsUnidentified({
      path: '/library/a/fake.m4b',
      reason: 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME',
      deleted: false,
    });

    expect(spyFetch).not.toHaveBeenCalled();

    const { forceIdentifyAudiobook } = await import('./identifying/forceIdentifyAudiobook');

    const layer2 = Layer.mergeAll(
      Layer.effect(
        FsExtended,
        makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            partialHash: 'fakeHash',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {},
              },
            },
          },
        ]).pipe(Effect.provide(Hash.Default))
      ),
      Layer.effect(Audible, await makeCachedAudibleLayer()),
      Path.layer
    );

    await Effect.runPromise(
      forceIdentifyAudiobook({
        libraryId: insertedLibrary.id,
        asin: 'B0DNNM3KN4',
        files: [{ directory: '/library/a', name: 'fake.m4b' }],
      }).pipe(Effect.provide(layer2))
    );

    const dbBook = await db
      .selectFrom('book')
      .select(['book.id', 'book.asin'])
      .where('book.asin', '=', 'B0DNNM3KN4')
      .executeTakeFirstOrThrow();

    expect(dbBook.asin).toBe('B0DNNM3KN4');

    await expectFileIsIdentified({
      path: '/library/a/fake.m4b',
      bookId: dbBook.id,
      hash: 'fakeHash',
      deleted: false,
    });

    await Effect.runPromise(
      libraryScanEffect({
        id: insertedLibrary.id,
        name: insertedLibrary.name,
        path: insertedLibrary.path,
      }).pipe(Effect.provide(layer1))
    );

    const dbBook3 = await db
      .selectFrom('book')
      .select(['book.id', 'book.asin'])
      .where('book.asin', '=', 'B0DNNM3KN4')
      .executeTakeFirstOrThrow();

    expect(dbBook3.asin).toBe('B0DNNM3KN4');
    expect(dbBook.id).toBe(dbBook3.id);

    await expectFileIsIdentified({
      path: '/library/a/fake.m4b',
      bookId: dbBook3.id,
      hash: 'fakeHash',
      deleted: false,
    });

    expect(spyFetch).not.toHaveBeenCalled();
  });

  test("change in mtimeMs but not partialFileHash updates db's mtimeMs without re-identification", async () => {
    const { db } = await import('@/libs/db');
    const { libraryScanEffect } = await import('./machine');
    const { Audible } = await import('./audible');

    const insertedLibrary = await db
      .insertInto('library')
      .values({ name: 'LibOne', path: '/library' })
      .returning(['id', 'name', 'path'])
      .executeTakeFirstOrThrow();

    const layer1 = Layer.mergeAll(
      Layer.effect(
        FsExtended,
        makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            partialHash: 'fakeHash',
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
        ]).pipe(Effect.provide(Hash.Default))
      ),
      Layer.effect(Audible, await makeCachedAudibleLayer()),
      Path.layer
    );

    await Effect.runPromise(
      libraryScanEffect({
        id: insertedLibrary.id,
        name: insertedLibrary.name,
        path: insertedLibrary.path,
      }).pipe(Effect.provide(layer1))
    );

    const dbBook1 = await db
      .selectFrom('book')
      .select(['book.id', 'book.asin'])
      .where('book.asin', '=', 'B0DNNM3KN4')
      .executeTakeFirstOrThrow();

    expect(dbBook1.asin).toBe('B0DNNM3KN4');

    const file1 = await expectFileIsIdentified({
      path: '/library/a/fake.m4b',
      bookId: dbBook1.id,
      hash: 'fakeHash',
      deleted: false,
    });

    const spyFetch = spyOn(global, 'fetch');
    const layer2 = Layer.mergeAll(
      Layer.effect(
        FsExtended,
        makeFsLayer([
          {
            path: '/library/a/fake.m4b',
            partialHash: 'fakeHash',
            ffprobe: {
              chapters: [],
              format: {
                start_time: 0,
                duration: 1000,
                tags: {},
              },
            },
          },
        ]).pipe(Effect.provide(Hash.Default))
      ),
      Path.layer,
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
      }).pipe(Effect.provide(layer2))
    );

    const dbBook2 = await db
      .selectFrom('book')
      .select(['book.id', 'book.asin'])
      .where('book.asin', '=', 'B0DNNM3KN4')
      .executeTakeFirstOrThrow();

    expect(dbBook2.asin).toBe('B0DNNM3KN4');
    expect(dbBook2.id).toBe(dbBook1.id);

    const file2 = await expectFileIsIdentified({
      path: '/library/a/fake.m4b',
      bookId: dbBook2.id,
      hash: 'fakeHash',
      deleted: false,
    });

    expect(file2.mtimeMs).toBeGreaterThan(file1.mtimeMs);

    expect(spyFetch).not.toHaveBeenCalled();
  });
});
