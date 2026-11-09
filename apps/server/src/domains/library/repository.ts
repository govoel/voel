import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Context, Effect, Layer, Option, Schema, SchemaGetter } from 'effect';
import { SqlSchema } from 'effect/sql';

import {
  Library,
  LibraryNameConflictError,
  LibraryNotFoundError,
} from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';

class LibraryRow extends Schema.Struct({
  id: Schema.toEncoded(Library.fields.id),
  type: Schema.toEncoded(Library.fields.type),
  name: Schema.toEncoded(Library.fields.name),
  storagePluginId: Schema.toEncoded(Library.fields.storagePluginId),
  storagePluginSettings: Schema.fromJsonString(Schema.toEncoded(StoragePluginSettingsPersisted)),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      id: Library.fields.id,
      type: Library.fields.type,
      name: Library.fields.name,
      storageKey: StoragePluginKey,
    }),
    {
      decode: SchemaGetter.transform(
        ({ id, type, name, storagePluginId, storagePluginSettings }) => ({
          id,
          type,
          name,
          storageKey: {
            library: { id, type, name },
            storagePluginId,
            settings: storagePluginSettings,
          },
        })
      ),
      encode: SchemaGetter.transform(({ id, type, name, storageKey }) => ({
        id,
        type,
        name,
        storagePluginId: storageKey.storagePluginId,
        storagePluginSettings: storageKey.settings,
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
        id,
        type,
        name,
        "storagePluginId",
        "storagePluginSettings"
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
          Request: Schema.Struct({
            name: Library.create.fields.name,
            type: Library.create.fields.type,
            storagePluginId: Library.create.fields.storagePluginId,
            storagePluginSettings: Library.create.fields.storagePluginSettings,
          }),
          Result: LibraryRow,
          execute: (library) => sql`
            insert into
              library ${sql.insert(library)}
            returning
              ${selection}
          `,
        }),

        update: SqlSchema.findOne({
          Request: Schema.Struct({
            id: Library.fields.id,
            name: Library.create.fields.name,
            type: Library.create.fields.type,
            storagePluginId: Library.create.fields.storagePluginId,
            storagePluginSettings: Library.create.fields.storagePluginSettings,
          }),
          Result: LibraryRow,
          execute: ({ id, ...library }) => sql`
            update library
            set
              ${sql.update(library)}
            where
              id = ${id}
            returning
              ${selection}
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
        update: (request: Parameters<typeof queries.update>[0]) =>
          queries.update(request).pipe(
            Effect.catchReason('SqlError', 'UniqueViolation', () =>
              LibraryNameConflictError.make({ libraryName: request.name })
            ),
            Effect.catchTags({
              NoSuchElementError: () => LibraryNotFoundError.make({ id: request.id }),
              SchemaError: Effect.die,
              SqlError: Effect.die,
            })
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
