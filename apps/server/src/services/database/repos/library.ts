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
          select l.id, l.type, l.name, json_group_array(lp.absolutePath) as absolutePaths
          from library l
          left join libraryPath lp on lp.libraryId = l.id
          where l.id = ${id} and l.deletedAt is null and lp.deletedAt is null
          group by l.id
        `,
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
                insert into library ${sql.insert(row)}
                on conflict (name) do update set type = excluded.type, deletedAt = null
                returning id, name, type`
            : sql`
                update library set ${sql.update({ type: row.type, name: row.name, deletedAt: null })}
                where id = ${row.id}
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

      const upsert = SqlSchema.findOne({
        Request: Schema.Struct({
          id: Schema.Option(LibraryTable.fields.id),
          type: MediaTypes,
          name: Schema.String,
          absolutePaths: Schema.Array(Schema.String),
        }),
        Result: Schema.Struct({ id: LibraryTable.fields.id }),
        execute: Effect.fn(
          function* ({ id, type, name, absolutePaths }) {
            const library = yield* upsertLibrary({ id, type, name }).pipe(
              toDatabaseError('LibraryRepository.upsertLibrary')
            );
            if (Array.isReadonlyArrayNonEmpty(absolutePaths)) {
              yield* upsertPaths({ libraryId: library.id, absolutePaths }).pipe(
                toDatabaseError('LibraryRepository.upsertPaths')
              );
              // TODO: Trigger a scan
            }
            return [{ id: library.id }];
          },
          (effect) => effect.pipe(sql.withTransaction)
        ),
      });

      const remove = SqlSchema.void({
        Request: Schema.Struct({ id: LibraryTable.fields.id }),
        execute: Effect.fn(
          function* ({ id }) {
            yield* sql`update libraryPath set deletedAt = unixepoch() where libraryId = ${id}`.pipe(
              toDatabaseError('LibraryRepository.removePaths')
            );
            yield* sql`update library set deletedAt = unixepoch() where id = ${id}`.pipe(
              toDatabaseError('LibraryRepository.removeLibrary')
            );
            // TODO: Soft-delete all related records
          },
          (effect) => effect.pipe(sql.withTransaction)
        ),
      });

      return {
        get: (request: Parameters<typeof get>['0']) =>
          get(request).pipe(toDatabaseError('LibraryRepository.get')),
        upsert: (request: Parameters<typeof upsert>['0']) =>
          upsert(request).pipe(toDatabaseError('LibraryRepository.upsert')),
        remove: (request: Parameters<typeof remove>['0']) =>
          remove(request).pipe(toDatabaseError('LibraryRepository.remove')),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
