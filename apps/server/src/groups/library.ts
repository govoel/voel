import { Array, Effect, Layer, Option, Path, Schema, SchemaGetter, SchemaIssue } from 'effect';

import { jsonArrayFrom } from '@repo/source-tap';
import { Api } from '@repo/spec-api';
import type { ApiPayload } from '@repo/spec-api';
import { LibraryPath } from '@repo/spec-api/database/schema.ts';

import { Database } from '#src/services/database/index.ts';

class LibraryAbsolutePath extends Schema.Class<LibraryAbsolutePath>('LibraryAbsolutePath')({
  absolutePath: Schema.String.pipe(
    Schema.decodeTo(LibraryPath.fields.absolutePath, {
      decode: SchemaGetter.transformOrFail(
        Effect.fnUntraced(function* (absolutePath) {
          const path = yield* Path.Path;

          if (!path.isAbsolute(absolutePath)) {
            return yield* Effect.fail(
              new SchemaIssue.InvalidValue(Option.some(absolutePath), {
                message: 'Expected an absolute path',
              })
            );
          }

          return path.resolve(absolutePath);
        })
      ),
      encode: SchemaGetter.passthrough(),
    })
  ),
}) {
  public static readonly decodeEffect = Schema.decodeEffect(Schema.Array(this));
}

export const LibraryHandlers = Layer.mergeAll(
  Api.toLayerHandler(
    'libraryGet',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryGet'>) {
      const { db } = yield* Database;
      return yield* db.executeTakeFirstOrError(
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
            ).as('absolutePaths'),
        ])
        .where('l.deletedAt', 'is', null)
        .orderBy('l.id')
        .limit(payload.limit + 1);

      if (Option.isSome(payload.cursor)) {
        query = query.where('l.id', '>', payload.cursor.value);
      }

      const result = yield* db.execute(query);
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
      const absolutePaths = yield* LibraryAbsolutePath.decodeEffect(payload.absolutePaths, {
        errors: 'all',
      });

      const { db } = yield* Database;

      return yield* db.trx().execute(
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
              trx.executeTakeFirstOrError(
                trx
                  .updateTable('library')
                  .set({ name: payload.name, type: payload.type, deletedAt: null })
                  .where('library.id', '=', id)
                  .returning(['id', 'name', 'type'])
              ),
          });

          let removeOtherPathsQuery = trx
            .updateTable('libraryPath')
            .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
            .where('libraryPath.libraryId', '=', insertedLibrary.id)
            .where('libraryPath.deletedAt', 'is', null);

          if (absolutePaths.length > 0) {
            removeOtherPathsQuery = removeOtherPathsQuery.where(
              'libraryPath.absolutePath',
              'not in',
              absolutePaths.map(({ absolutePath }) => absolutePath)
            );
          }

          yield* trx.execute(removeOtherPathsQuery);

          if (absolutePaths.length > 0) {
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
      );
    })
  ),
  Api.toLayerHandler(
    'libraryDelete',
    Effect.fnUntraced(function* (payload: ApiPayload<'libraryDelete'>) {
      const { db } = yield* Database;

      return yield* db.trx().execute(
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
      );
    })
  )
);
