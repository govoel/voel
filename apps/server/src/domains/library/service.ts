import { Array, Context, Effect, Layer, Option, RcMap, Unify } from 'effect';

import type { LibraryInput } from '@repo/spec-api/domains/library/http.ts';
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
        ...library
      }: Effect.Success<ReturnType<typeof repository.getById>>) => ({
        ...library,
        storagePluginId: storageKey.storagePluginId,
        storagePluginSettings: storageKey.settings,
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
          function* (request: typeof LibraryInput.Type) {
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
            yield* stores.acquire(created.storageKey);
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
          function* (request: typeof LibraryInput.Type & Pick<Library, 'id'>) {
            const row = yield* repository.getById({ id: request.id });
            const editor = yield* editors.acquire(request.storagePluginId);
            const settings = yield* editor.decodeFormSubmission({
              library: { name: request.name, type: request.type },
              current:
                row.storageKey.storagePluginId === request.storagePluginId
                  ? Option.some(row.storageKey.settings)
                  : Option.none(),
              input: request.storagePluginSettings,
            });
            yield* stores.acquire(
              StoragePluginKey.make({
                library: { id: request.id, type: request.type, name: request.name },
                storagePluginId: request.storagePluginId,
                settings,
              })
            );
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
