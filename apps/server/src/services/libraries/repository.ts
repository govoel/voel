import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlSchema } from 'effect/sql';

import { Library, LibraryRoot } from '@repo/spec-api/database/schema.ts';

import { LibraryDatabase } from '#src/services/database/library/index.ts';

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

/** SQL catalog operations; root replacement composes with an existing transaction. */
export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/services/libraries/repository/LibraryRepository',
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

      return {
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
                  "libraryRoot" ${sql.insert(roots.map((root) => ({ libraryId: id, root })))}
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
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(LibraryDatabase.layer));
}
