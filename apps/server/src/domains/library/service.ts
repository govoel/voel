import type { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Array, Context, Effect, Layer, Option, RcMap, Unify } from 'effect';

import { LibraryInvalidRootError } from '@repo/spec-api/domains/library/schema.ts';
import type { Library, StoragePluginHealth } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';
import { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';

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
        storageKey,
        roots,
      }: Effect.Success<ReturnType<typeof repository.getById>>) => ({
        ...storageKey.library,
        storagePluginId: storageKey.storagePluginId,
        storagePluginSettings: storageKey.settings,
        roots,
      });

      const writeRequest = (row: Effect.Success<ReturnType<typeof repository.getById>>) => ({
        ...row.storageKey.library,
        storagePluginId: row.storageKey.storagePluginId,
        storagePluginSettings: row.storageKey.settings,
        roots: Array.map(row.roots, ({ root }) => root),
      });

      const health = Effect.fnUntraced(function* (
        row: Effect.Success<ReturnType<typeof repository.getById>>
      ) {
        const [cached, failures] = yield* Effect.partition(
          [
            editors
              .contextEffectOption(row.storageKey.storagePluginId)
              .pipe(Effect.map(Option.isSome)),
            stores.contextEffectOption(row.storageKey).pipe(Effect.map(Option.isSome)),
          ],
          (check) => Unify.unify(check),
          { concurrency: 'unbounded' }
        );

        return Array.match(failures, {
          onEmpty: () => ({ status: Array.some(cached, Boolean) ? 'healthy' : 'unknown' }) as const,
          onNonEmpty: (errors) => ({ status: 'unhealthy', errors }) as const,
        }) satisfies typeof StoragePluginHealth.Type;
      }, Effect.scoped);

      const launchStorageRetirement = Effect.fnUntraced(
        function* ({ id }: Pick<Library, 'id'>) {
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
          request: Pick<Library, 'name' | 'type' | 'storagePluginId'>
        ) {
          const editor = yield* editors.acquire(request.storagePluginId);
          return yield* editor.getForm({
            library: { name: request.name, type: request.type },
            current: Option.none(),
          });
        }, Effect.scoped),
        create: Effect.fnUntraced(
          function* (
            request: Pick<Library, 'name' | 'type' | 'storagePluginId'> & {
              readonly storagePluginSettings: StoragePluginSettingsInput;
              readonly roots: ReadonlyArray<{ readonly root: string }>;
            }
          ) {
            const editor = yield* editors.acquire(request.storagePluginId);
            const settings = yield* editor.decodeFormSubmission({
              library: { name: request.name, type: request.type },
              current: Option.none(),
              input: request.storagePluginSettings,
            });
            const created = yield* repository.create({
              name: request.name,
              type: request.type,
              storagePluginId: request.storagePluginId,
              storagePluginSettings: settings,
              roots: [],
            });
            const storage = yield* stores.acquire(created.storageKey);
            const roots = yield* decodeRoots({ storage, roots: request.roots });
            const configured = yield* repository.update({ ...writeRequest(created), roots }).pipe(
              Effect.catchTags({
                LibraryNotFoundError: Effect.die,
                LibraryNameConflictError: Effect.die,
              })
            );
            return { id: configured.storageKey.library.id };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        rename: Effect.fnUntraced(
          function* ({ id, name }: Pick<Library, 'id' | 'name'>) {
            const row = yield* repository.getById({ id });
            const updated = yield* repository.update({ ...writeRequest(row), name });
            yield* sql.afterCommit(launchStorageRetirement({ id }));
            return { id: updated.storageKey.library.id };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die })
        ),
        getStoragePluginSettingsForm: Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
          const row = yield* repository.getById({ id });
          const editor = yield* editors.acquire(row.storageKey.storagePluginId);
          return yield* editor.getForm({
            library: row.storageKey.library,
            current: Option.some(row.storageKey.settings),
          });
        }, Effect.scoped),
        setStoragePluginSettings: Effect.fnUntraced(
          function* ({
            id,
            input,
          }: Pick<Library, 'id'> & { readonly input: StoragePluginSettingsInput }) {
            const row = yield* repository.getById({ id });
            const editor = yield* editors.acquire(row.storageKey.storagePluginId);
            const settings = yield* editor.decodeFormSubmission({
              library: row.storageKey.library,
              current: Option.some(row.storageKey.settings),
              input,
            });
            return yield* Effect.gen(function* () {
              const current = yield* repository.getById({ id });
              const storage = yield* stores.acquire(
                StoragePluginKey.make({
                  library: current.storageKey.library,
                  storagePluginId: current.storageKey.storagePluginId,
                  settings,
                })
              );
              const roots = yield* decodeRoots({ storage, roots: current.roots });
              const updated = yield* repository
                .update({
                  ...writeRequest(current),
                  storagePluginSettings: settings,
                  roots,
                })
                .pipe(Effect.catchTags({ LibraryNameConflictError: Effect.die }));
              yield* sql.afterCommit(launchStorageRetirement({ id }));
              return { id: updated.storageKey.library.id };
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
            const storage = yield* stores.acquire(row.storageKey);
            const unique = yield* decodeRoots({ storage, roots });
            const updated = yield* repository
              .update({ ...writeRequest(row), roots: unique })
              .pipe(Effect.catchTags({ LibraryNameConflictError: Effect.die }));
            return {
              id: updated.storageKey.library.id,
              roots: Array.map(updated.roots, ({ root }) => ({ root })),
            };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        delete: (request: Pick<Library, 'id'>) =>
          repository.deleteById(request).pipe(
            Effect.tap(() => sql.afterCommit(launchStorageRetirement(request))),
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
