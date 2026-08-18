import { SQLiteError } from 'bun:sqlite';

import { BunPath } from '@effect/platform-bun';
import { Array, Effect, Layer, Option, Path, Schema, SchemaGetter, SchemaIssue } from 'effect';

import { DatabaseSqlError, jsonArrayFrom } from '@repo/effect-kysely';
import {
  Api,
  LibraryInvalidPathError,
  LibraryNameConflictError,
  LibraryNotFoundError,
} from '@repo/spec-api';
import type { ApiPayload } from '@repo/spec-api';
import { LibraryPath } from '@repo/spec-api/database/schema.ts';

import { Database } from '#src/services/database/index.ts';

class LibraryAbsolutePath extends Schema.Class<LibraryAbsolutePath>(
  '@repo/server/groups/library/LibraryAbsolutePath'
)({
  absolutePath: Schema.String.pipe(
    Schema.decodeTo(LibraryPath.fields.absolutePath, {
      decode: SchemaGetter.transformOrFail(
        Effect.fnUntraced(function* (absolutePath, options) {
          const path = yield* Path.Path;

          if (!path.isAbsolute(absolutePath)) {
            return yield* Effect.fail(
              new SchemaIssue.InvalidValue(
                { message: 'Expected an absolute path' },
                absolutePath,
                options
              )
            );
          }

          return path.resolve(absolutePath);
        })
      ),
      encode: SchemaGetter.passthrough(),
    })
  ),
}) {
  public static readonly decodeEffect = Schema.decodeEffect(this);
}

export const LibraryHandlersLayerNoDeps = Layer.mergeAll(
  Api.toLayerHandler(
    'libraryGet',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryGet'>) {
      const { db } = yield* Database;
      return yield* db
        .executeTakeFirstOption(
          db
            .selectFrom('library as l')
            .select([
              'l.id',
              'l.type',
              'l.name',
              (eb) =>
                jsonArrayFrom(
                  eb
                    .selectFrom('libraryPath as lp')
                    .select(['lp.id', 'lp.absolutePath'])
                    .whereRef('lp.libraryId', '=', 'l.id')
                    .where('lp.deletedAt', 'is', null)
                ).as('absolutePaths'),
            ])
            .where('l.id', '=', payload.id)
            .where('l.deletedAt', 'is', null)
        )
        .pipe(
          Effect.catchTags({ DatabaseSqlError: Effect.die }),
          Effect.flatMap(
            Option.match({
              onNone: () => LibraryNotFoundError.make({ id: payload.id }),
              onSome: Effect.succeed,
            })
          )
        );
    })
  ),
  Api.toLayerHandler(
    'libraryList',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryList'>) {
      const { db } = yield* Database;

      let query = db
        .selectFrom('library as l')
        .select([
          'l.id',
          'l.type',
          'l.name',
          (eb) =>
            jsonArrayFrom(
              eb
                .selectFrom('libraryPath as lp')
                .select(['lp.id', 'lp.absolutePath'])
                .whereRef('lp.libraryId', '=', 'l.id')
                .where('lp.deletedAt', 'is', null)
            ).as('absolutePaths'),
        ])
        .where('l.deletedAt', 'is', null)
        .orderBy('l.id')
        .limit(payload.limit + 1);

      if (Option.isSome(payload.cursor)) {
        query = query.where('l.id', '>', payload.cursor.value);
      }

      const result = yield* db
        .execute(query)
        .pipe(Effect.catchTags({ DatabaseSqlError: Effect.die }));
      const items = result.slice(0, payload.limit);

      return {
        items,
        nextCursor:
          result.length > payload.limit
            ? Array.last(items).pipe(Option.map((item) => item.id))
            : Option.none(),
      };
    })
  ),
  Api.toLayerHandler(
    'libraryUpsert',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryUpsert'>) {
      const [invalidPaths, absolutePaths] = yield* Effect.partition(
        payload.absolutePaths,
        ({ absolutePath }) =>
          LibraryAbsolutePath.decodeEffect({ absolutePath }).pipe(
            Effect.catchTags({ SchemaError: () => Effect.fail(absolutePath) })
          ),
        { concurrency: 'unbounded' }
      );

      if (Array.isReadonlyArrayNonEmpty(invalidPaths)) {
        return yield* LibraryInvalidPathError.make({ paths: invalidPaths });
      }

      const { db } = yield* Database;

      return yield* db
        .trx()
        .execute(
          Effect.fnUntraced(function* (trx) {
            const insertedLibrary = yield* Option.match(payload.id, {
              onNone: () =>
                trx.executeTakeFirstOrError(
                  trx
                    .insertInto('library')
                    .values({ name: payload.name, type: payload.type })
                    .onConflict((oc) =>
                      oc
                        .column('name')
                        .doUpdateSet((eb) => ({ type: eb.ref('excluded.type'), deletedAt: null }))
                    )
                    .returning(['id', 'name', 'type'])
                ),
              onSome: (id) =>
                trx
                  .executeTakeFirstOption(
                    trx
                      .updateTable('library')
                      .set({ name: payload.name, type: payload.type, deletedAt: null })
                      .where('library.id', '=', id)
                      .returning(['id', 'name', 'type'])
                  )
                  .pipe(
                    Effect.catchIf(
                      (error) =>
                        DatabaseSqlError.is(error) &&
                        error.cause instanceof SQLiteError &&
                        error.cause.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
                        error.cause.message.includes('library.name'),
                      () => LibraryNameConflictError.make({ name: payload.name })
                    ),
                    Effect.flatMap(
                      Option.match({
                        onNone: () => LibraryNotFoundError.make({ id }),
                        onSome: Effect.succeed,
                      })
                    )
                  ),
            });

            let removeOtherPathsQuery = trx
              .updateTable('libraryPath')
              .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
              .where('libraryPath.libraryId', '=', insertedLibrary.id)
              .where('libraryPath.deletedAt', 'is', null);

            if (Array.isReadonlyArrayNonEmpty(absolutePaths)) {
              removeOtherPathsQuery = removeOtherPathsQuery.where(
                'libraryPath.absolutePath',
                'not in',
                absolutePaths.map(({ absolutePath }) => absolutePath)
              );
            }

            yield* trx.execute(removeOtherPathsQuery);

            if (Array.isReadonlyArrayNonEmpty(absolutePaths)) {
              yield* trx.execute(
                trx
                  .insertInto('libraryPath')
                  .values(
                    absolutePaths.map(({ absolutePath }) => ({
                      libraryId: insertedLibrary.id,
                      absolutePath,
                    }))
                  )
                  .onConflict((oc) =>
                    oc.columns(['libraryId', 'absolutePath']).doUpdateSet({ deletedAt: null })
                  )
                  .returning(['absolutePath'])
              );
            }

            // TODO: Trigger a scan, and also clean up related tables based on the library type

            return { id: insertedLibrary.id };
          })
        )
        .pipe(
          Effect.catchTags({
            DatabaseNoSuchElementError: Effect.die,
            DatabaseSqlError: Effect.die,
          })
        );
    })
  ),
  Api.toLayerHandler(
    'libraryDelete',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryDelete'>) {
      const { db } = yield* Database;

      return yield* db
        .trx()
        .execute(
          Effect.fnUntraced(function* (trx) {
            yield* trx.execute(
              trx
                .updateTable('libraryPath')
                .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
                .where('libraryPath.libraryId', '=', payload.id)
            );

            yield* trx.execute(
              trx
                .updateTable('library')
                .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
                .where('library.id', '=', payload.id)
            );
          })
        )
        .pipe(Effect.catchTags({ DatabaseSqlError: Effect.die }));
    })
  )
);

export const LibraryHandlersLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provide([Database.layer, BunPath.layer])
);
