import { Array, Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { toDatabaseError } from '@repo/spec-api/database/index.ts';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';

export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/services/database/repos/library/LibraryRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const get = SqlSchema.findOne({
        Request: Schema.Struct({ id: LibraryTable.fields.id }),
        Result: Schema.Struct({
          ...LibraryTable.fields,
          absolutePaths: Schema.fromJsonString(LibraryTable.fields.absolutePaths),
        }),
        execute: ({ id }) => sql`
          select
            l.id, l.type, l.name,
            coalesce((select json_group_array(absolutePath) from libraryPath where libraryId = l.id and deletedAt is null), '[]') as absolutePaths
          from library l
          where l.id = ${id} and l.deletedAt is null`,
      });

      const list = SqlSchema.findAll({
        Request: Schema.Struct({
          cursor: Schema.Option(LibraryTable.fields.id),
          limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
        }),
        Result: Schema.Struct({
          ...LibraryTable.fields,
          absolutePaths: Schema.fromJsonString(LibraryTable.fields.absolutePaths),
        }),
        execute: ({ cursor, limit }) =>
          Option.isSome(cursor)
            ? sql`
                select
                  l.id, l.type, l.name,
                  coalesce((select json_group_array(absolutePath) from libraryPath where libraryId = l.id and deletedAt is null), '[]') as absolutePaths
                from library l
                where l.deletedAt is null and l.id > ${cursor.value}
                order by l.id
                limit ${limit + 1}`
            : sql`
                select
                  l.id, l.type, l.name,
                  coalesce((select json_group_array(absolutePath) from libraryPath where libraryId = l.id and deletedAt is null), '[]') as absolutePaths
                from library l
                where l.deletedAt is null
                order by l.id
                limit ${limit + 1}`,
      });

      const upsertLibrary = SqlSchema.findOne({
        Request: Schema.Struct({
          id: Schema.Option(LibraryTable.fields.id),
          type: MediaTypes,
          name: Schema.String,
        }),
        Result: Schema.Struct({
          id: LibraryTable.fields.id,
          name: LibraryTable.fields.name,
          type: LibraryTable.fields.type,
        }),
        execute: (row) =>
          Option.isNone(row.id)
            ? sql`
                insert into library ${sql.insert({ name: row.name, type: row.type })}
                on conflict (name) do update set type = excluded.type, deletedAt = null
                returning id, name, type`
            : sql`
                update library set ${sql.update({ name: row.name, type: row.type, deletedAt: null })}
                where id = ${row.id.value}
                returning id, name, type`,
      });

      const upsertPaths = SqlSchema.findAll({
        Request: Schema.Struct({
          libraryId: LibraryTable.fields.id,
          absolutePaths: Schema.NonEmptyArray(Schema.String),
        }),
        Result: Schema.Struct({ absolutePath: LibraryTable.fields.absolutePaths.schema }),
        execute: ({ libraryId, absolutePaths }) => sql`
          insert into libraryPath ${sql.insert(absolutePaths.map((absolutePath) => ({ libraryId, absolutePath })))}
          on conflict (libraryId, absolutePath) do update set deletedAt = null
          returning absolutePath`,
      });

      const removeOtherPaths = SqlSchema.void({
        Request: Schema.Struct({
          libraryId: LibraryTable.fields.id,
          absolutePaths: Schema.Array(Schema.String),
        }),
        execute: ({ libraryId, absolutePaths }) =>
          absolutePaths.length > 0
            ? sql`update libraryPath set deletedAt = unixepoch() where libraryId = ${libraryId} and absolutePath not in ${sql.in(absolutePaths)}`
            : sql`update libraryPath set deletedAt = unixepoch() where libraryId = ${libraryId}`,
      });

      const deletePaths = SqlSchema.void({
        Request: Schema.Struct({ libraryId: LibraryTable.fields.id }),
        execute: ({ libraryId }) => sql`
          update libraryPath set deletedAt = unixepoch() where libraryId = ${libraryId}`,
      });

      const deleteLibrary = SqlSchema.void({
        Request: Schema.Struct({ id: LibraryTable.fields.id }),
        execute: ({ id }) => sql`
          update library set deletedAt = unixepoch() where id = ${id}`,
      });

      return {
        list: (request: Parameters<typeof list>['0']) =>
          list(request).pipe(
            Effect.map((rows) => {
              const items = rows.slice(0, request.limit);

              return {
                items,
                nextCursor:
                  rows.length > request.limit && Array.isReadonlyArrayNonEmpty(items)
                    ? Option.some(Array.lastNonEmpty(items).id)
                    : Option.none(),
              };
            }),
            toDatabaseError('LibraryRepository.list')
          ),

        get: (request: Parameters<typeof get>['0']) =>
          get(request).pipe(toDatabaseError('LibraryRepository.get')),

        upsert: Effect.fn(
          function* ({
            id,
            type,
            name,
            absolutePaths,
          }: {
            id: Option.Option<(typeof LibraryTable)['Type']['id']>;
            type: (typeof MediaTypes)['Type'];
            name: string;
            absolutePaths: readonly string[];
          }) {
            const library = yield* upsertLibrary({ id, type, name }).pipe(
              toDatabaseError('LibraryRepository.upsertLibrary')
            );
            yield* removeOtherPaths({ libraryId: library.id, absolutePaths }).pipe(
              toDatabaseError('LibraryRepository.removeOtherPaths')
            );
            if (Array.isReadonlyArrayNonEmpty(absolutePaths)) {
              yield* upsertPaths({ libraryId: library.id, absolutePaths }).pipe(
                toDatabaseError('LibraryRepository.upsertPaths')
              );
              // TODO: Trigger a scan, and also clean up related tables based on the library type
            }
            return { id: library.id };
          },
          (effect) => effect.pipe(sql.withTransaction, toDatabaseError('LibraryRepository.upsert'))
        ),

        delete: Effect.fn(
          function* ({ id }: { id: (typeof LibraryTable)['Type']['id'] }) {
            yield* deletePaths({ libraryId: id }).pipe(
              toDatabaseError('LibraryRepository.deletePaths')
            );
            yield* deleteLibrary({ id }).pipe(toDatabaseError('LibraryRepository.deleteLibrary'));
          },
          (effect) => effect.pipe(sql.withTransaction, toDatabaseError('LibraryRepository.delete'))
        ),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
