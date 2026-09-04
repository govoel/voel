import { BunPath } from '@effect/platform-bun';
import { Array, Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlSchema } from 'effect/unstable/sql';

import type { ApiPayload } from '@repo/spec-api';
import { Library, LibraryPath } from '@repo/spec-api/database/schema.ts';
import {
  LibraryInvalidPathError,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryRpcs,
} from '@repo/spec-api/groups/library.ts';

import { LibraryDatabase } from '#src/services/database/library/index.ts';

export class LibraryPathRepository extends Context.Service<LibraryPathRepository>()(
  '@repo/server/groups/library/LibraryPathRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;

      return {
        reconcile: SqlSchema.void({
          Request: Schema.Struct({
            libraryId: LibraryPath.upsert.fields.libraryId,
            absolutePaths: Schema.Array(LibraryPath.upsert.fields.absolutePath),
          }),
          execute: Effect.fnUntraced(function* ({ libraryId, absolutePaths }) {
            yield* sql`
              update "libraryPath"
              set
                "deletedAt" = time_to_milli (time_now ())
              where
                "libraryId" = ${libraryId}
                and "deletedAt" is null
                and not ${sql.in('absolutePath', absolutePaths)}
            `;

            if (Array.isReadonlyArrayNonEmpty(absolutePaths)) {
              yield* sql`
                insert into
                  "libraryPath" ${sql.insert(
                    absolutePaths.map((absolutePath) => ({ libraryId, absolutePath }))
                  )}
                on conflict ("libraryId", "absolutePath") do update
                set
                  "deletedAt" = null
              `;
            }
          }),
        }),

        deleteByLibraryId: SqlSchema.void({
          Request: Schema.Struct({ libraryId: LibraryPath.fields.libraryId }),
          execute: ({ libraryId }) =>
            sql`
              update "libraryPath"
              set
                "deletedAt" = time_to_milli (time_now ())
              where
                "libraryId" = ${libraryId}
            `,
        }),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(LibraryDatabase.layer));
}

export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/groups/library/LibraryRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;

      const librarySelection = sql`
        l.id,
        l.type,
        l.name,
        coalesce(
          (
            select
              json_group_array(
                json_object(
                  'id',
                  active_library_path.id,
                  'absolutePath',
                  active_library_path."absolutePath"
                )
              )
            from
              (
                select
                  lp.id,
                  lp."absolutePath"
                from
                  "libraryPath" as lp
                where
                  lp."libraryId" = l.id
                  and lp."deletedAt" is null
                order by
                  lp.id
              ) as active_library_path
          ),
          '[]'
        ) as "absolutePaths"
      `;

      return {
        getById: SqlSchema.findOne({
          Request: Schema.Struct({ id: Library.fields.id }),
          Result: Schema.Struct({
            id: Library.fields.id,
            type: Library.fields.type,
            name: Library.fields.name,
            absolutePaths: Schema.fromJsonString(
              Schema.Array(
                Schema.Struct({
                  id: LibraryPath.fields.id,
                  absolutePath: Schema.toType(LibraryPath.fields.absolutePath),
                })
              )
            ),
          }),
          execute: ({ id }) => sql`
            select
              ${librarySelection}
            from
              library as l
            where
              l.id = ${id}
              and l."deletedAt" is null
          `,
        }),

        list: SqlSchema.findAll({
          Request: Schema.Struct({
            cursor: Schema.Option(Library.fields.id),
            limit: Schema.Natural,
          }),
          Result: Schema.Struct({
            id: Library.fields.id,
            type: Library.fields.type,
            name: Library.fields.name,
            absolutePaths: Schema.fromJsonString(
              Schema.Array(
                Schema.Struct({
                  id: LibraryPath.fields.id,
                  absolutePath: Schema.toType(LibraryPath.fields.absolutePath),
                })
              )
            ),
          }),
          execute: ({ cursor, limit }) => {
            const afterCursor = Option.match(cursor, {
              onNone: () => sql.literal(''),
              onSome: (cursorId) => sql`
                and l.id > ${cursorId}
              `,
            });

            return sql`
              select
                ${librarySelection}
              from
                library as l
              where
                l."deletedAt" is null ${afterCursor}
              order by
                l.id
              limit
                ${limit}
            `;
          },
        }),

        upsert: SqlSchema.findOne({
          Request: Library.upsert,
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id, name, type }) =>
            Option.match(id, {
              onNone: () => sql`
                insert into
                  library ${sql.insert({ name, type })}
                on conflict (name) do update
                set
                  type = excluded.type,
                  "deletedAt" = null
                returning
                  id
              `,
              onSome: (libraryId) =>
                sql`
                  update library
                  set
                    ${sql.update({ name, type, deletedAt: null })}
                  where
                    id = ${libraryId}
                  returning
                    id
                `,
            }),
        }),

        deleteById: SqlSchema.void({
          Request: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id }) =>
            sql`
              update library
              set
                "deletedAt" = time_to_milli (time_now ())
              where
                id = ${id}
            `,
        }),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(LibraryDatabase.layer));
}

export const LibraryHandlersLayerNoDeps = LibraryRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* LibraryDatabase;
    const library = yield* LibraryRepository;
    const libraryPath = yield* LibraryPathRepository;

    return {
      libraryGet: ({ id }) =>
        library.getById({ id }).pipe(
          Effect.catchTags({
            NoSuchElementError: () => LibraryNotFoundError.make({ id }),
            SchemaError: Effect.die,
            SqlError: Effect.die,
          })
        ),

      libraryList: Effect.fnUntraced(function* (payload: ApiPayload<'libraryList'>) {
        const limit = payload.limit + 1;
        const rows = yield* library.list({ cursor: payload.cursor, limit }).pipe(
          Effect.catchTags({
            SchemaError: Effect.die,
            SqlError: Effect.die,
          })
        );
        const items = rows.slice(0, payload.limit);

        return {
          items,
          nextCursor:
            rows.length > payload.limit
              ? Array.last(items).pipe(Option.map((item) => item.id))
              : Option.none(),
        };
      }),

      libraryUpsert: Effect.fnUntraced(function* (payload: ApiPayload<'libraryUpsert'>) {
        const [invalidPaths, absolutePaths] = yield* Effect.partition(
          payload.absolutePaths,
          ({ absolutePath }) =>
            LibraryPath.decodeAbsolutePathEffect(absolutePath).pipe(
              Effect.catchTags({ SchemaError: () => Effect.fail(absolutePath) })
            ),
          { concurrency: 'unbounded' }
        );

        if (Array.isReadonlyArrayNonEmpty(invalidPaths)) {
          return yield* LibraryInvalidPathError.make({ paths: invalidPaths });
        }

        return yield* sql
          .withTransaction(
            library.upsert({ id: payload.id, name: payload.name, type: payload.type }).pipe(
              Effect.catchReason('SqlError', 'UniqueViolation', () =>
                LibraryNameConflictError.make({ name: payload.name })
              ),
              Effect.catchTag('NoSuchElementError', () =>
                Option.isSome(payload.id)
                  ? LibraryNotFoundError.make({ id: payload.id.value })
                  : Effect.die('A name-based library upsert did not return a library')
              ),
              Effect.flatMap(({ id: libraryId }) =>
                libraryPath
                  .reconcile({ libraryId, absolutePaths })
                  .pipe(Effect.as({ id: libraryId }))
              )
            )
          )
          .pipe(
            Effect.catchTags({
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
          );
      }),

      libraryDelete: ({ id }) =>
        sql
          .withTransaction(
            Effect.andThen(
              libraryPath.deleteByLibraryId({ libraryId: id }),
              library.deleteById({ id })
            )
          )
          .pipe(
            Effect.catchTags({
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
          ),
    };
  })
);

export const LibraryHandlersLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provide([
    LibraryDatabase.layer,
    LibraryRepository.layer,
    LibraryPathRepository.layer,
    BunPath.layer,
  ])
);
