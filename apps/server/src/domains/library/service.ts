import type { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, RcMap, Unify } from 'effect';

import {
  LibraryInvalidRootError,
  LibraryUnconfiguredError,
} from '@repo/spec-api/domains/library/schema.ts';
import type { Library, StoragePluginHealth } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';

export class LibraryService extends Context.Service<LibraryService>()(
  '@repo/server/domains/library/service/LibraryService',
  {
    make: Effect.gen(function* () {
      const sql = yield* LibraryDatabase;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      const stores = yield* StoragePluginMap;
      const retirementScope = yield* Effect.scope;

      const health = Effect.fnUntraced(function* (
        row: Effect.Success<ReturnType<typeof repository.getById>>
      ) {
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

      // afterCommit only launches retirement: waiting here could deadlock against a
      // plugin editor still held by the request. Retirement belongs to the service lifetime.
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

      return {
        get: Effect.fnUntraced(function* (request: Pick<Library, 'id'>) {
          const row = yield* repository.getById(request);
          return { ...row, storagePluginHealth: yield* health(row) };
        }),
        list: Effect.fnUntraced(function* (request: Parameters<typeof repository.list>[0]) {
          const rows = yield* repository.list({ cursor: request.cursor, limit: request.limit + 1 });
          const items = yield* Effect.forEach(
            rows.slice(0, request.limit),
            (row) =>
              health(row).pipe(
                Effect.map(({ status }) => ({ ...row, storagePluginStatus: status }))
              ),
            { concurrency: 'unbounded' }
          );
          return {
            items,
            nextCursor:
              rows.length > request.limit
                ? Array.last(items).pipe(Option.map((item) => item.id))
                : Option.none(),
          };
        }),
        create: repository.create,
        rename: (request: Parameters<typeof repository.rename>[0]) =>
          repository.rename(request).pipe(
            Effect.tap(() => sql.afterCommit(retire({ id: request.id }))),
            sql.withTransaction,
            Effect.catchTags({ SqlError: Effect.die })
          ),
        getStoragePluginSettingsForm: Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
          const row = yield* repository.getById({ id });
          const editor = yield* editors.acquire({ storagePlugin: row.storagePlugin, library: row });
          return yield* editor.getForm({ current: row.storagePluginSettings });
        }, Effect.scoped),
        setStoragePluginSettings: Effect.fnUntraced(function* ({
          id,
          input,
        }: Pick<Library, 'id'> & { readonly input: StoragePluginSettingsInput }) {
          const row = yield* repository.getById({ id });
          const editor = yield* editors.acquire({ storagePlugin: row.storagePlugin, library: row });
          // Decode before opening the persistence transaction. It owns registration
          // and launches retirement after the outermost commit, even during cancellation.
          const settings = yield* editor.decodeFormSubmission({
            current: row.storagePluginSettings,
            input,
          });
          return yield* repository.setSettings({ id, settings }).pipe(
            Effect.tap(() => sql.afterCommit(retire({ id }))),
            sql.withTransaction,
            Effect.catchTags({ SqlError: Effect.die })
          );
        }, Effect.scoped),
        // The outer transaction holds the write lock from loading the snapshot through decoding.
        // The repository's replacement transaction is a nested savepoint, not a second unit of work.
        setRoots: Effect.fnUntraced(
          function* ({
            id,
            roots,
          }: Pick<Library, 'id'> & { readonly roots: ReadonlyArray<{ readonly root: string }> }) {
            const row = yield* repository.getById({ id });
            if (Option.isNone(row.storagePluginSettings)) {
              return yield* LibraryUnconfiguredError.make({ id });
            }
            const storage = yield* stores.acquire({
              storagePlugin: row.storagePlugin,
              library: row,
              settings: row.storagePluginSettings.value,
            });
            const decoded = yield* Effect.validate(
              roots,
              ({ root }) =>
                storage.decodeRootLocation({ location: root }).pipe(
                  Effect.catchTags({
                    StorageLocationValidationError: ({ message }) => Effect.fail({ root, message }),
                  })
                ),
              { concurrency: 'unbounded' }
            ).pipe(Effect.catch((error) => LibraryInvalidRootError.make({ roots: error })));
            const unique = Array.dedupe(decoded);
            yield* repository.setRoots({ id, roots: unique });
            return { id, roots: unique.map((root) => ({ root })) };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        delete: (request: Pick<Library, 'id'>) =>
          repository.deleteById(request).pipe(
            Effect.tap(() => sql.afterCommit(retire(request))),
            sql.withTransaction,
            Effect.catchTags({ SqlError: Effect.die })
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
