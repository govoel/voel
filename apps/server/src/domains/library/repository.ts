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

class LibraryRecord extends Schema.Struct({
  storageKey: StoragePluginKey,
  roots: Schema.Array(Schema.Struct({ id: LibraryRoot.fields.id, root: LibraryRoot.fields.root })),
}) {}

class LibraryWrite extends Schema.Struct({
  ...Library.jsonCreate.fields,
  storagePluginSettings: StoragePluginSettingsPersisted.fromJsonString,
  roots: Schema.Array(LibraryRoot.fields.root),
}) {}

const libraryColumns = {
  id: Schema.toEncoded(Library.fields.id),
  type: Schema.toEncoded(Library.fields.type),
  name: Schema.toEncoded(Library.fields.name),
  storagePluginId: Schema.toEncoded(Library.fields.storagePluginId),
  storagePluginSettings: Schema.fromJsonString(Schema.toEncoded(StoragePluginSettingsPersisted)),
};

class StorageRow extends Schema.Struct(libraryColumns).pipe(
  Schema.decodeTo(StoragePluginKey, {
    decode: SchemaGetter.transform(
      ({ id, type, name, storagePluginId, storagePluginSettings }) => ({
        library: { id, type, name },
        storagePluginId,
        settings: storagePluginSettings,
      })
    ),
    encode: SchemaGetter.transform(({ library, storagePluginId, settings }) => ({
      ...library,
      storagePluginId,
      storagePluginSettings: settings,
    })),
  })
) {}

class LibraryRow extends Schema.Struct({
  ...libraryColumns,
  roots: Schema.fromJsonString(Schema.toEncoded(LibraryRecord.fields.roots)),
}).pipe(
  Schema.decodeTo(LibraryRecord, {
    decode: SchemaGetter.transform(
      ({ id, type, name, storagePluginId, storagePluginSettings, roots }) => ({
        storageKey: {
          library: { id, type, name },
          storagePluginId,
          settings: storagePluginSettings,
        },
        roots,
      })
    ),
    encode: SchemaGetter.transform(({ storageKey, roots }) => ({
      ...storageKey.library,
      storagePluginId: storageKey.storagePluginId,
      storagePluginSettings: storageKey.settings,
      roots,
    })),
  })
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

      const replaceRoots = SqlSchema.findAll({
        Request: Schema.Struct({ id: Library.fields.id, roots: LibraryWrite.fields.roots }),
        Result: LibraryRecord.fields.roots.value,
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
          return yield* sql`
            select
              id,
              root
            from
              "libraryRoot"
            where
              "libraryId" = ${id}
            order by
              id
          `;
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
          Result: StorageRow,
          execute: ({ roots: _roots, ...library }) => sql`
            insert into
              library ${sql.insert(library)}
            returning
              id,
              type,
              name,
              "storagePluginId",
              "storagePluginSettings"
          `,
        }),

        update: SqlSchema.findOne({
          Request: Schema.Struct({ id: Library.fields.id, ...LibraryWrite.fields }),
          Result: StorageRow,
          execute: ({ id, roots: _roots, ...library }) => sql`
            update library
            set
              ${sql.update(library)}
            where
              id = ${id}
            returning
              id,
              type,
              name,
              "storagePluginId",
              "storagePluginSettings"
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
            const storageKey = yield* queries.create(request);
            const roots = yield* replaceRoots({ id: storageKey.library.id, roots: request.roots });
            return { storageKey, roots };
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
            const storageKey = yield* queries.update(request);
            const roots = yield* replaceRoots({ id: storageKey.library.id, roots: request.roots });
            return { storageKey, roots };
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
