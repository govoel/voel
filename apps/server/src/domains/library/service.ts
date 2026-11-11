import { Array, Context, Effect, Layer, Option, RcMap, Result } from 'effect';

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
        storageKey,
        ...library
      }: Effect.Success<ReturnType<typeof repository.getById>>) => ({
        ...library,
        storagePluginId: storageKey.storagePluginId,
        storagePluginSettings: storageKey.settings,
      });

      const health = Effect.fnUntraced(function* (
        row: Effect.Success<ReturnType<typeof repository.getById>>
      ) {
        const [editor, store] = yield* Effect.all(
          [
            editors.contextEffectOption(row.storageKey.storagePluginId),
            stores.contextEffectOption(row.storageKey),
          ],
          { concurrency: 'unbounded', mode: 'result' }
        );

        if (Result.isFailure(editor)) {
          return {
            status: 'unhealthy',
            errors: Result.isFailure(store) ? [editor.failure, store.failure] : [editor.failure],
          } as const satisfies typeof StoragePluginHealth.Type;
        }
        if (Result.isFailure(store)) {
          return {
            status: 'unhealthy',
            errors: [store.failure],
          } as const satisfies typeof StoragePluginHealth.Type;
        }
        return {
          status:
            Option.isSome(editor.success) || Option.isSome(store.success) ? 'healthy' : 'unknown',
        } as const satisfies typeof StoragePluginHealth.Type;
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
          request: Pick<Library, 'name' | 'type' | 'storagePluginId'> & {
            readonly id: Option.Option<Library['id']>;
          }
        ) {
          const current = yield* Option.match(request.id, {
            onNone: () => Effect.succeedNone,
            onSome: (id) =>
              repository
                .getById({ id })
                .pipe(Effect.map((row) => Option.some(row.storageKey.settings))),
          });
          const editor = yield* editors.acquire(request.storagePluginId);
          return yield* editor.getForm({
            library: { name: request.name, type: request.type },
            current,
          });
        }, Effect.scoped),
        create: Effect.fnUntraced(
          function* (request: typeof Library.jsonCreate.Type) {
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
            });
            return { id: created.id };
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: Effect.die }),
          Effect.scoped
        ),
        getStoragePluginSettingsForm: Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
          const row = yield* repository.getById({ id });
          const editor = yield* editors.acquire(row.storageKey.storagePluginId);
          return yield* editor.getForm({
            library: { type: row.type, name: row.name },
            current: Option.some(row.storageKey.settings),
          });
        }, Effect.scoped),
        update: Effect.fnUntraced(
          function* (request: typeof Library.jsonUpdate.Type & Pick<Library, 'id'>) {
            const row = yield* repository.getById({ id: request.id });
            const editor = yield* editors.acquire(request.storagePluginId);
            const settings = yield* editor.decodeFormSubmission({
              library: { name: request.name, type: request.type },
              current: Option.some(row.storageKey.settings),
              input: request.storagePluginSettings,
            });
            const updated = yield* repository.update({
              ...request,
              storagePluginSettings: settings,
            });
            yield* sql.afterCommit(launchStorageRetirement({ id: request.id }));
            return { id: updated.id };
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
