import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlSchema } from 'effect/sql';

import {
  Library,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryRoot,
} from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';

class LibraryRow extends Schema.Struct({
  id: Library.fields.id,
  type: Library.fields.type,
  name: Library.fields.name,
  storagePlugin: Library.fields.storagePlugin,
  storagePluginSettings: Library.fields.storagePluginSettings,
  roots: Schema.fromJsonString(
    Schema.Array(Schema.Struct({ id: LibraryRoot.fields.id, root: LibraryRoot.fields.root }))
  ),
}) {}

export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/domains/library/repository/LibraryRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;
      const selection = sql`
        l.id,
        l.type,
        l.name,
        l."storagePlugin",
        l."storagePluginSettings",
        coalesce(
          (
            select
              json_group_array(json_object('id', r.id, 'root', r.root))
            from
              (
                select
                  id,
                  root
                from
                  "libraryRoot"
                where
                  "libraryId" = l.id
                order by
                  id
              ) as r
          ),
          '[]'
        ) as roots
      `;

      const queries = {
        getById: SqlSchema.findOne({
          Request: Schema.Struct({ id: Library.fields.id }),
          Result: LibraryRow,
          execute: ({ id }) => sql`
            select
              ${selection}
            from
              library as l
            where
              l.id = ${id}
          `,
        }),

        list: SqlSchema.findAll({
          Request: Schema.Struct({
            cursor: Schema.Option(Library.fields.id),
            limit: Schema.Natural,
          }),
          Result: LibraryRow,
          execute: ({ cursor, limit }) => sql`
            select
              ${selection}
            from
              library as l ${Option.match(cursor, {
                onNone: () => sql.literal(''),
                onSome: (id) => sql`
                  where
                    l.id > ${id}
                `,
              })}
            order by
              l.id
            limit
              ${limit}
          `,
        }),

        create: SqlSchema.findOne({
          Request: Library.jsonCreate,
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: (request) => sql`
            insert into
              library ${sql.insert(request)}
            returning
              id
          `,
        }),

        rename: SqlSchema.findOne({
          Request: Schema.Struct({ id: Library.fields.id, name: Library.fields.name }),
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id, name }) =>
            sql`
              update library
              set
                name = ${name}
              where
                id = ${id}
              returning
                id
            `,
        }),

        setSettings: SqlSchema.findOne({
          Request: Schema.Struct({
            id: Library.fields.id,
            settings: StoragePluginSettingsPersisted.fromJsonString,
          }),
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id, settings }) =>
            sql`
              update library
              set
                "storagePluginSettings" = ${settings}
              where
                id = ${id}
              returning
                id
            `,
        }),

        setRoots: SqlSchema.void({
          Request: Schema.Struct({
            id: Library.fields.id,
            roots: Schema.Array(LibraryRoot.fields.root),
          }),
          execute: Effect.fnUntraced(function* ({ id, roots }) {
            yield* sql`
              delete from "libraryRoot"
              where
                "libraryId" = ${id}
                and not ${sql.in('root', roots)}
            `;
            if (Array.isReadonlyArrayNonEmpty(roots)) {
              yield* sql`
                insert into
                  "libraryRoot" ${sql.insert(Array.map(roots, (root) => ({ libraryId: id, root })))}
                on conflict ("libraryId", root) do nothing
              `;
            }
          }, sql.withTransaction),
        }),

        deleteById: SqlSchema.void({
          Request: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id }) => sql`
            delete from library
            where
              id = ${id}
          `,
        }),
      };

      return {
        getById: (request: Parameters<typeof queries.getById>[0]) =>
          queries.getById(request).pipe(
            Effect.catchTags({
              NoSuchElementError: () => LibraryNotFoundError.make({ id: request.id }),
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
          ),
        list: (request: Parameters<typeof queries.list>[0]) =>
          queries.list(request).pipe(Effect.orDie),
        create: (request: Parameters<typeof queries.create>[0]) =>
          queries.create(request).pipe(
            Effect.catchReason('SqlError', 'UniqueViolation', () =>
              LibraryNameConflictError.make({ libraryName: request.name })
            ),
            Effect.catchTags({
              SchemaError: Effect.die,
              SqlError: Effect.die,
              NoSuchElementError: Effect.die,
            })
          ),
        rename: (request: Parameters<typeof queries.rename>[0]) =>
          queries.rename(request).pipe(
            Effect.catchReason('SqlError', 'UniqueViolation', () =>
              LibraryNameConflictError.make({ libraryName: request.name })
            ),
            Effect.catchTags({
              NoSuchElementError: () => LibraryNotFoundError.make({ id: request.id }),
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
          ),
        setSettings: (request: Parameters<typeof queries.setSettings>[0]) =>
          queries.setSettings(request).pipe(
            Effect.catchTags({
              NoSuchElementError: () => LibraryNotFoundError.make({ id: request.id }),
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
          ),
        setRoots: (request: Parameters<typeof queries.setRoots>[0]) =>
          queries.setRoots(request).pipe(Effect.orDie),
        deleteById: (request: Parameters<typeof queries.deleteById>[0]) =>
          queries.deleteById(request).pipe(Effect.orDie),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(LibraryDatabase.layer));
}
