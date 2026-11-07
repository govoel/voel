import { StoragePluginSettingsLibrary } from '@govoel/plugins/storage';
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

      const details = ({
        settingsKey,
        storageKey,
        roots,
      }: Effect.Success<ReturnType<typeof repository.getById>>) => ({
        ...settingsKey.library,
        storagePlugin: settingsKey.storagePlugin,
        storagePluginSettings: Option.map(storageKey, ({ settings }) => settings),
        roots,
      });

      const health = Effect.fnUntraced(function* (
        row: Effect.Success<ReturnType<typeof repository.getById>>
      ) {
        const [cached, failures] = yield* Effect.partition(
          [
            editors.contextEffectOption(row.settingsKey).pipe(Effect.map(Option.isSome)),
            Option.match(row.storageKey, {
              onNone: () => Effect.succeed(false),
              onSome: (key) => stores.contextEffectOption(key).pipe(Effect.map(Option.isSome)),
            }),
          ],
          (check) => Unify.unify(check),
          { concurrency: 'unbounded' }
        );

        return Array.match(failures, {
          onEmpty: () => ({ status: Array.some(cached, Boolean) ? 'healthy' : 'unknown' }) as const,
          onNonEmpty: (errors) => ({ status: 'unhealthy', errors }) as const,
        }) satisfies typeof StoragePluginHealth.Type;
      }, Effect.scoped);

      const launchRetirement = Effect.fnUntraced(
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

      const decodeRoots = Effect.fnUntraced(function* ({
        storage,
        roots,
      }: {
        readonly storage: Effect.Success<ReturnType<typeof stores.acquire>>;
        readonly roots: ReadonlyArray<{ readonly root: string }>;
      }) {
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
        return Array.dedupe(decoded);
      });

      return {
        get: Effect.fnUntraced(function* (request: Pick<Library, 'id'>) {
          const row = yield* repository.getById(request);
          return { ...details(row), storagePluginHealth: yield* health(row) };
        }),
        list: Effect.fnUntraced(function* (request: Parameters<typeof repository.list>[0]) {
          const rows = yield* repository.list({ cursor: request.cursor, limit: request.limit + 1 });
          const items = yield* Effect.forEach(
            rows.slice(0, request.limit),
            (row) =>
              health(row).pipe(
                Effect.map(({ status }) => ({ ...details(row), storagePluginStatus: status }))
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
        getDraftStoragePluginSettingsForm: Effect.fnUntraced(function* (
          request: Parameters<typeof repository.create>[0]
        ) {
          const editor = yield* editors.acquire({
            storagePlugin: request.storagePlugin,
            library: StoragePluginSettingsLibrary.Draft({ name: request.name, type: request.type }),
          });
          return yield* editor.getForm({ current: Option.none() });
        }, Effect.scoped),
        create: Effect.fnUntraced(
          function* (
            request: Parameters<typeof repository.create>[0] & {
              readonly storagePluginSettings: StoragePluginSettingsInput;
              readonly roots: ReadonlyArray<{ readonly root: string }>;
            }
          ) {
            const editor = yield* editors.acquire({
              storagePlugin: request.storagePlugin,
              library: StoragePluginSettingsLibrary.Draft({
                name: request.name,
                type: request.type,
              }),
            });
            const settings = yield* editor.decodeFormSubmission({
              current: Option.none(),
              input: request.storagePluginSettings,
            });
            const result = yield* repository.create({
              name: request.name,
              type: request.type,
              storagePlugin: request.storagePlugin,
            });
            yield* repository
              .setSettings({ id: result.id, settings })
              .pipe(Effect.catchTags({ LibraryNotFoundError: Effect.die }));
            const configured = yield* repository
              .getById(result)
              .pipe(Effect.catchTags({ LibraryNotFoundError: Effect.die }));
            const storage = yield* Option.match(configured.storageKey, {
              onNone: () => Effect.die('Created library has no storage configuration'),
              onSome: stores.acquireScoped,
            });
            const roots = yield* decodeRoots({ storage, roots: request.roots });
            yield* repository.setRoots({ id: result.id, roots });
            return result;
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        rename: (request: Parameters<typeof repository.rename>[0]) =>
          repository.rename(request).pipe(
            Effect.tap(() => sql.afterCommit(launchRetirement({ id: request.id }))),
            sql.withTransaction,
            Effect.catchTags({ SqlError: Effect.die })
          ),
        getStoragePluginSettingsForm: Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
          const row = yield* repository.getById({ id });
          const editor = yield* editors.acquire({
            storagePlugin: row.settingsKey.storagePlugin,
            library: StoragePluginSettingsLibrary.Existing(row.settingsKey.library),
          });
          return yield* editor.getForm({
            current: Option.map(row.storageKey, ({ settings }) => settings),
          });
        }, Effect.scoped),
        setStoragePluginSettings: Effect.fnUntraced(
          function* ({
            id,
            input,
          }: Pick<Library, 'id'> & { readonly input: StoragePluginSettingsInput }) {
            const row = yield* repository.getById({ id });
            const editor = yield* editors.acquire({
              storagePlugin: row.settingsKey.storagePlugin,
              library: StoragePluginSettingsLibrary.Existing(row.settingsKey.library),
            });
            const settings = yield* editor.decodeFormSubmission({
              current: Option.map(row.storageKey, (key) => key.settings),
              input,
            });
            return yield* Effect.gen(function* () {
              const result = yield* repository.setSettings({ id, settings });
              const current = yield* repository.getById(result);
              const storage = yield* Option.match(current.storageKey, {
                onNone: () => Effect.die('Updated library has no storage configuration'),
                onSome: stores.acquireScoped,
              });
              const roots = yield* decodeRoots({ storage, roots: current.roots });
              yield* repository.setRoots({ id, roots });
              yield* sql.afterCommit(launchRetirement({ id }));
              return result;
            }).pipe(sql.withTransaction);
          },
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        setRoots: Effect.fnUntraced(
          function* ({
            id,
            roots,
          }: Pick<Library, 'id'> & { readonly roots: ReadonlyArray<{ readonly root: string }> }) {
            const row = yield* repository.getById({ id });
            if (Option.isNone(row.storageKey)) {
              return yield* LibraryUnconfiguredError.make({ id });
            }
            const storage = yield* stores.acquire(row.storageKey.value);
            const unique = yield* decodeRoots({ storage, roots });
            yield* repository.setRoots({ id, roots: unique });
            return { id, roots: Array.map(unique, (root) => ({ root })) };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        delete: (request: Pick<Library, 'id'>) =>
          repository.deleteById(request).pipe(
            Effect.tap(() => sql.afterCommit(launchRetirement(request))),
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
