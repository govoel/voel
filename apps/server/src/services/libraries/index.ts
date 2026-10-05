import type { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import {
  StoragePlugin,
  StoragePluginSettings,
  StoragePluginSettingsError,
} from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, RcMap, Unify } from 'effect';

import type { Library, LibraryRoot } from '@repo/spec-api/database/schema.ts';
import type { StoragePluginHealth } from '@repo/spec-api/library.ts';
import {
  LibraryInvalidRootError,
  LibraryInvalidStoragePluginSettingsError,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryUnconfiguredError,
} from '@repo/spec-api/library.ts';

import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { LibraryRepository } from '#src/services/libraries/repository.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/services/plugins/storage/index.ts';

/** Catalog operations capture app-lifetime dependencies and own every plugin lease. */
export class Libraries extends Context.Service<Libraries>()(
  '@repo/server/services/libraries/Libraries',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      const stores = yield* StoragePluginMap;
      const serviceScope = yield* Effect.scope;

      const find = ({ id }: Pick<Library, 'id'>) =>
        repository.getById({ id }).pipe(
          Effect.catchTag('NoSuchElementError', () => LibraryNotFoundError.make({ id })),
          Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die })
        );

      // Inspect only existing entries in the same maps used by operations, never build or probe.
      const health = Effect.fnUntraced(function* (row: Effect.Success<ReturnType<typeof find>>) {
        const [cached, failures] = yield* Effect.partition(
          [
            editors
              .contextEffectOption(
                StoragePluginSettingsMap.Key.make({
                  storagePlugin: row.storagePlugin,
                  library: row,
                })
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

      // Invalidation releases cache references, not in-flight leases. Retirement outlives
      // operations without delaying their result, but ends with the application's service scope.
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
        (effect) => effect.pipe(Effect.forkIn(serviceScope), Effect.asVoid)
      );

      return {
        get: Effect.fnUntraced(function* (args: Pick<Library, 'id'>) {
          const row = yield* find(args);
          return { ...row, storagePluginHealth: yield* health(row) };
        }),

        list: Effect.fnUntraced(function* ({
          cursor,
          limit,
        }: Parameters<typeof repository.list>[0]) {
          const rows = yield* repository.list({ cursor, limit: limit + 1 }).pipe(Effect.orDie);
          const items = yield* Effect.forEach(
            rows.slice(0, limit),
            (row) =>
              health(row).pipe(
                Effect.map(({ status }) => ({ ...row, storagePluginStatus: status }))
              ),
            { concurrency: 'unbounded' }
          );
          return {
            items,
            nextCursor:
              rows.length > limit
                ? Array.last(items).pipe(Option.map((item) => item.id))
                : Option.none(),
          };
        }),

        create: (args: Parameters<typeof repository.create>[0]) =>
          repository.create(args).pipe(
            Effect.catchReason('SqlError', 'UniqueViolation', () =>
              LibraryNameConflictError.make({ name: args.name })
            ),
            Effect.catchTags({
              SchemaError: Effect.die,
              SqlError: Effect.die,
              NoSuchElementError: Effect.die,
            })
          ),

        update: ({ id, name }: Pick<Library, 'id' | 'name'>) =>
          repository.rename({ id, name }).pipe(
            Effect.catchReason('SqlError', 'UniqueViolation', () =>
              LibraryNameConflictError.make({ name })
            ),
            Effect.catchTag('NoSuchElementError', () => LibraryNotFoundError.make({ id })),
            Effect.catchTags({ SchemaError: Effect.die, SqlError: Effect.die }),
            Effect.tap(() => retire({ id })),
            Effect.uninterruptible
          ),

        getStoragePluginSettingsForm: Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
          const row = yield* find({ id });
          const editor = yield* editors
            .contextEffect(
              StoragePluginSettingsMap.Key.make({ storagePlugin: row.storagePlugin, library: row })
            )
            .pipe(Effect.map(Context.get(StoragePluginSettings)));
          return yield* editor.getForm({ current: row.storagePluginSettings }).pipe(
            Effect.catchTag('SchemaError', () =>
              StoragePluginSettingsError.make({
                message:
                  'Storage plugin could not build the settings form from the current settings',
              })
            )
          );
        }, Effect.scoped),

        // Decode remains cancellable; once persistence starts, finish mutation and retirement.
        setStoragePluginSettings: Effect.fnUntraced(function* ({
          id,
          input,
        }: {
          readonly id: Library['id'];
          readonly input: StoragePluginSettingsInput;
        }) {
          const row = yield* find({ id });
          const editor = yield* editors
            .contextEffect(
              StoragePluginSettingsMap.Key.make({ storagePlugin: row.storagePlugin, library: row })
            )
            .pipe(Effect.map(Context.get(StoragePluginSettings)));
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
        }, Effect.scoped),

        // Keep the row, plugin lease, validation and replacement in the same SQL transaction.
        // The operation scope encloses commit/rollback as well as the plugin workflow.
        setRoots: Effect.fnUntraced(
          function* ({
            id,
            roots,
          }: {
            readonly id: Library['id'];
            readonly roots: ReadonlyArray<LibraryRoot['root']>;
          }) {
            const row = yield* find({ id });
            if (Option.isNone(row.storagePluginSettings)) {
              return yield* LibraryUnconfiguredError.make({ id });
            }

            const storage = yield* stores
              .contextEffect(
                StoragePluginMap.Key.make({
                  storagePlugin: row.storagePlugin,
                  library: row,
                  settings: row.storagePluginSettings.value,
                })
              )
              .pipe(Effect.map(Context.get(StoragePlugin)));
            const decoded = yield* Effect.validate(
              roots,
              (root) =>
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
        ),

        delete: ({ id }: Pick<Library, 'id'>) =>
          repository.deleteById({ id }).pipe(
            Effect.orDie,
            Effect.tap(() => retire({ id })),
            Effect.uninterruptible
          ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([
      LibraryDatabase.layer,
      LibraryRepository.layer,
      StoragePluginSettingsMap.layer,
      StoragePluginMap.layer,
    ])
  );
}
