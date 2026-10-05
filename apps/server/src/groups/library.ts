import {
  StoragePluginSettingsError,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, RcMap, Schema, Unify } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { SqlSchema } from 'effect/sql';

import { Api } from '@repo/spec-api';
import { Library, LibraryRoot } from '@repo/spec-api/database/schema.ts';
import type { StoragePluginHealth } from '@repo/spec-api/groups/library.ts';
import {
  LibraryInvalidRootError,
  LibraryInvalidStoragePluginSettingsError,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryUnconfiguredError,
} from '@repo/spec-api/groups/library.ts';

import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/services/plugins/storage/index.ts';

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
  '@repo/server/groups/library/LibraryRepository',
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

export const LibraryHandlersLayerNoDeps = HttpApiBuilder.group(Api, 'library', (handlers) =>
  Effect.gen(function* () {
    const sql = yield* LibraryDatabase;
    const repository = yield* LibraryRepository;
    const editors = yield* StoragePluginSettingsMap;
    const stores = yield* StoragePluginMap;
    const retirementScope = yield* Effect.scope;

    const get = ({ id }: Pick<Library, 'id'>) =>
      repository.getById({ id }).pipe(
        Effect.catchTag('NoSuchElementError', () => LibraryNotFoundError.make({ id })),
        Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die })
      );

    const health = Effect.fnUntraced(function* (row: typeof LibraryRow.Type) {
      const [cached, failures] = yield* Effect.partition(
        [
          editors
            .contextEffectOption(
              StoragePluginSettingsMap.Key.make({ storagePlugin: row.storagePlugin, library: row })
            )
            .pipe(Effect.map(Option.isSome)),
          Option.match(row.storagePluginSettings, {
            onNone: () => Effect.succeed(false),
            onSome: (settings) =>
              stores
                .contextEffectOption(
                  StoragePluginMap.Key.make({
                    storagePlugin: row.storagePlugin,
                    library: row,
                    settings,
                  })
                )
                .pipe(Effect.map(Option.isSome)),
          }),
        ],
        // Unify the checks' distinct error types before partitioning.
        (check) => Unify.unify(check),
        { concurrency: 'unbounded' }
      );

      return Array.match(failures, {
        onEmpty: () => ({ status: cached.some(Boolean) ? 'healthy' : 'unknown' }) as const,
        onNonEmpty: (errors) => ({ status: 'unhealthy', errors }) as const,
      }) satisfies typeof StoragePluginHealth.Type;
    }, Effect.scoped);

    // Retirement outlives requests but belongs to the handler layer's lifetime.
    // Invalidating releases the cache's reference, not scopes held by in-flight operations.
    const retire = Effect.fnUntraced(
      function* ({ id }: Pick<Library, 'id'>) {
        for (const key of yield* RcMap.keys(editors.rcMap)) {
          if (key.library.id === id) {
            yield* editors.invalidate(key);
          }
        }
        for (const key of yield* RcMap.keys(stores.rcMap)) {
          if (key.library.id === id) {
            yield* stores.invalidate(key);
          }
        }
      },
      (effect) => effect.pipe(Effect.forkIn(retirementScope), Effect.asVoid)
    );

    return (
      handlers
        .handle(
          'get',
          Effect.fnUntraced(function* ({ params }) {
            const row = yield* get(params);
            return { ...row, storagePluginHealth: yield* health(row) };
          })
        )

        // These endpoints are admin-only: setup must remain visible before settings exist.
        .handle(
          'list',
          Effect.fnUntraced(function* ({ query }) {
            const rows = yield* repository
              .list({ cursor: query.cursor, limit: query.limit + 1 })
              .pipe(Effect.orDie);
            const items = yield* Effect.forEach(
              rows.slice(0, query.limit),
              (row) =>
                health(row).pipe(
                  Effect.map(({ status }) => ({ ...row, storagePluginStatus: status }))
                ),
              { concurrency: 'unbounded' }
            );
            return {
              items,
              nextCursor:
                rows.length > query.limit
                  ? Array.last(items).pipe(Option.map((item) => item.id))
                  : Option.none(),
            };
          })
        )

        .handle(
          'create',
          Effect.fnUntraced(function* ({ payload }) {
            return yield* repository.create(payload).pipe(
              Effect.catchReason('SqlError', 'UniqueViolation', () =>
                LibraryNameConflictError.make({ name: payload.name })
              ),
              Effect.catchTags({
                SchemaError: Effect.die,
                SqlError: Effect.die,
                NoSuchElementError: Effect.die,
              })
            );
          })
        )

        .handle(
          'update',
          Effect.fnUntraced(function* ({ params: { id }, payload: { name } }) {
            return yield* repository.rename({ id, name }).pipe(
              Effect.catchReason('SqlError', 'UniqueViolation', () =>
                LibraryNameConflictError.make({ name })
              ),
              Effect.catchTag('NoSuchElementError', () => LibraryNotFoundError.make({ id })),
              Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die }),
              Effect.tap(() => retire({ id })),
              Effect.uninterruptible
            );
          })
        )

        .handle(
          'getStoragePluginSettingsForm',
          Effect.fnUntraced(function* ({ params: { id } }) {
            const row = yield* get({ id });
            const editor = yield* StoragePluginSettingsMap.acquire({
              storagePlugin: row.storagePlugin,
              library: row,
            });
            return yield* editor.getForm({ current: row.storagePluginSettings }).pipe(
              Effect.catchTag('SchemaError', () =>
                StoragePluginSettingsError.make({
                  message:
                    'Storage plugin could not build the settings form from the current settings',
                })
              )
            );
          }, Effect.scoped)
        )

        .handle(
          'setStoragePluginSettings',
          Effect.fnUntraced(function* ({ params: { id }, payload: { input } }) {
            const row = yield* get({ id });
            const editor = yield* StoragePluginSettingsMap.acquire({
              storagePlugin: row.storagePlugin,
              library: row,
            });
            const settings = yield* editor
              .decodeFormSubmission({ current: row.storagePluginSettings, input })
              .pipe(
                Effect.catchTag('SchemaError', () =>
                  LibraryInvalidStoragePluginSettingsError.make({
                    message: 'Submitted storage plugin settings failed validation',
                  })
                )
              );
            return yield* repository.setSettings({ id, settings }).pipe(
              Effect.catchTag('NoSuchElementError', () => LibraryNotFoundError.make({ id })),
              Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die }),
              Effect.tap(() => retire({ id })),
              Effect.uninterruptible
            );
          }, Effect.scoped)
        )

        // Keep the plugin context stable from loading through decoding and root replacement.
        .handle(
          'setRoots',
          Effect.fnUntraced(
            function* ({ params: { id }, payload: { roots } }) {
              const row = yield* get({ id });
              if (Option.isNone(row.storagePluginSettings)) {
                return yield* LibraryUnconfiguredError.make({ id });
              }

              const storage = yield* StoragePluginMap.acquire({
                storagePlugin: row.storagePlugin,
                library: row,
                settings: row.storagePluginSettings.value,
              });
              const decoded = yield* Effect.validate(
                roots,
                ({ root }) =>
                  storage
                    .decodeRootLocation({ location: root })
                    .pipe(
                      Effect.catchTag('StorageLocationValidationError', ({ message }) =>
                        Effect.fail({ root, message })
                      )
                    ),
                { concurrency: 'unbounded' }
              ).pipe(Effect.catch((error) => LibraryInvalidRootError.make({ roots: error })));
              const unique = Array.dedupe(decoded);
              yield* repository.setRoots({ id, roots: unique });
              return { id, roots: unique.map((root) => ({ root })) };
            },
            sql.withTransaction,
            Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die }),
            Effect.scoped
          )
        )

        .handle('delete', ({ params: { id } }) =>
          repository.deleteById({ id }).pipe(
            Effect.orDie,
            Effect.tap(() => retire({ id })),
            Effect.uninterruptible
          )
        )
    );
  })
);
