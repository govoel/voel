import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, Schema, SchemaGetter } from 'effect';
import { SqlSchema } from 'effect/sql';

import {
  Library,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryRoot,
} from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';

class LibraryWrite extends Schema.Struct({
  ...Library.jsonCreate.fields,
  storagePluginSettings: StoragePluginSettingsPersisted.fromJsonString,
  roots: Schema.Array(LibraryRoot.fields.root),
}) {}

class LibraryRow extends Schema.Struct({
  id: Schema.toEncoded(Library.fields.id),
  type: Schema.toEncoded(Library.fields.type),
  name: Schema.toEncoded(Library.fields.name),
  storagePluginId: Schema.toEncoded(Library.fields.storagePluginId),
  storagePluginSettings: Schema.fromJsonString(Schema.toEncoded(StoragePluginSettingsPersisted)),
  roots: Schema.fromJsonString(
    Schema.toEncoded(
      Schema.Array(Schema.Struct({ id: LibraryRoot.fields.id, root: LibraryRoot.fields.root }))
    )
  ),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      id: Library.fields.id,
      type: Library.fields.type,
      name: Library.fields.name,
      storageKey: StoragePluginKey,
      roots: Schema.Array(
        Schema.Struct({ id: LibraryRoot.fields.id, root: LibraryRoot.fields.root })
      ),
    }),
    {
      decode: SchemaGetter.transform(
        ({ id, type, name, storagePluginId, storagePluginSettings, roots }) => ({
          id,
          type,
          name,
          storageKey: {
            library: { id, type, name },
            storagePluginId,
            settings: storagePluginSettings,
          },
          roots,
        })
      ),
      encode: SchemaGetter.transform(({ id, type, name, storageKey, roots }) => ({
        id,
        type,
        name,
        storagePluginId: storageKey.storagePluginId,
        storagePluginSettings: storageKey.settings,
        roots,
      })),
    }
  )
) {}

export class LibraryRepository extends Context.Service<LibraryRepository>()(
  '@repo/server/domains/library/repository/LibraryRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;
      const selection = sql`
        l.id,
        l.type,
        l.name,
        l."storagePluginId",
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

      const replaceRoots = SqlSchema.void({
        Request: Schema.Struct({ id: Library.fields.id, roots: LibraryWrite.fields.roots }),
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
        }),
      });

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
          Request: LibraryWrite,
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: ({ roots: _roots, ...library }) => sql`
            insert into
              library ${sql.insert(library)}
            returning
              id
          `,
        }),

        update: SqlSchema.findOne({
          Request: Schema.Struct({ id: Library.fields.id, ...LibraryWrite.fields }),
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: ({ id, roots: _roots, ...library }) => sql`
            update library
            set
              ${sql.update(library)}
            where
              id = ${id}
            returning
              id
          `,
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
        create: Effect.fnUntraced(
          function* (request: Parameters<typeof queries.create>[0]) {
            const library = yield* queries.create(request);
            yield* replaceRoots({ ...library, roots: request.roots });
            return yield* queries.getById(library);
          },
          sql.withTransaction,
          (effect, request) =>
            effect.pipe(
              Effect.catchReason('SqlError', 'UniqueViolation', () =>
                LibraryNameConflictError.make({ libraryName: request.name })
              ),
              Effect.catchTags({
                SchemaError: Effect.die,
                SqlError: Effect.die,
                NoSuchElementError: Effect.die,
              })
            )
        ),
        update: Effect.fnUntraced(
          function* (request: Parameters<typeof queries.update>[0]) {
            const library = yield* queries.update(request);
            yield* replaceRoots({ ...library, roots: request.roots });
            return yield* queries.getById(library);
          },
          sql.withTransaction,
          (effect, request) =>
            effect.pipe(
              Effect.catchReason('SqlError', 'UniqueViolation', () =>
                LibraryNameConflictError.make({ libraryName: request.name })
              ),
              Effect.catchTags({
                NoSuchElementError: () => LibraryNotFoundError.make({ id: request.id }),
                SchemaError: Effect.die,
                SqlError: Effect.die,
              })
            )
        ),
        deleteById: (request: Parameters<typeof queries.deleteById>[0]) =>
          queries.deleteById(request).pipe(Effect.orDie),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(LibraryDatabase.layer));
}
