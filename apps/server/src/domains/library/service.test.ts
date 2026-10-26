import { assert, expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Effect, Exit, Fiber, Latch, Layer, Match, Option, RcMap } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlClient, Statement } from 'effect/sql';

import { Library, LibraryInvalidRootError } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';

// No HTTP handlers, middleware, or auth database participate in this workflow.
const testLayer = LibraryService.layerNoDeps.pipe(
  Layer.provideMerge([LibraryRepository.layerNoDeps, pluginLayer]),
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provideMerge(TestScheduler.layer)
);

const mutate = Effect.fnUntraced(function* ({
  id,
  operation,
}: Pick<Library, 'id'> & { readonly operation: 'rename' | 'settings' | 'delete' }) {
  const service = yield* LibraryService;
  return yield* Match.value(operation).pipe(
    Match.when('rename', () =>
      service.rename({ id, name: Library.fields.name.make('Renamed') }).pipe(Effect.asVoid)
    ),
    Match.when('settings', () =>
      service
        .setStoragePluginSettings({
          id,
          input: StoragePluginSettingsInput.make({ root: '/updated' }),
        })
        .pipe(Effect.asVoid)
    ),
    Match.when('delete', () => service.delete({ id })),
    Match.exhaustive
  );
});

const cacheKeys = Effect.fnUntraced(function* ({ id }: Pick<Library, 'id'>) {
  const editors = yield* StoragePluginSettingsMap;
  const stores = yield* StoragePluginMap;
  return {
    editors: Array.filter(yield* RcMap.keys(editors.rcMap), (key) => key.library.id === id),
    stores: Array.filter(yield* RcMap.keys(stores.rcMap), (key) => key.library.id === id),
  };
});

const warmLibrary = Effect.fnUntraced(function* (name: string) {
  const repository = yield* LibraryRepository;
  const editors = yield* StoragePluginSettingsMap;
  const stores = yield* StoragePluginMap;
  const library = yield* repository.create({
    name: Library.fields.name.make(name),
    type: Library.fields.type.make('movie'),
    storagePlugin: Library.fields.storagePlugin.make('npm:test'),
  });
  const settings = StoragePluginSettingsPersisted.make({ prefix: '/initial' });
  yield* repository.setSettings({ ...library, settings });
  const row = yield* repository.getById(library);
  // Include an older snapshot: retirement must remove every identity for the ID,
  // not just the entry matching the row being changed.
  for (const snapshot of [row, { ...row, name: Library.fields.name.make(`${name} stale`) }]) {
    yield* Effect.scoped(
      Effect.all([
        editors.acquire({ storagePlugin: row.storagePlugin, library: snapshot }),
        stores.acquire({ storagePlugin: row.storagePlugin, library: snapshot, settings }),
      ])
    );
  }
  return { library, row, keys: yield* cacheKeys(library) };
});

it.layer(testLayer)('library service without transport', (iit) => {
  iit.effect.each(['rename', 'settings', 'delete'] as const)(
    '%s retires only its library after the outer commit, never on rollback or savepoint release',
    Effect.fnUntraced(function* (operation) {
      const sql = yield* LibraryDatabase;
      const repository = yield* LibraryRepository;
      const { drainScheduler } = yield* TestScheduler;
      const target = yield* warmLibrary(`${operation} target`);
      const unrelated = yield* warmLibrary(`${operation} unrelated`);
      expect(target.keys.editors).toHaveLength(2);
      expect(target.keys.stores).toHaveLength(2);

      const change = mutate({ ...target.library, operation });
      // A successful service savepoint does not own the final outcome.
      yield* sql
        .withTransaction(change.pipe(Effect.andThen(Effect.fail('outer rollback'))))
        .pipe(Effect.flip);
      yield* drainScheduler;
      expect(yield* repository.getById(target.library)).toEqual(target.row);
      expect(yield* cacheKeys(target.library)).toEqual(target.keys);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          // Discard callbacks from a rolled-back intermediate savepoint, even
          // when the surrounding transaction subsequently commits.
          yield* sql
            .withTransaction(change.pipe(Effect.andThen(Effect.fail('savepoint rollback'))))
            .pipe(Effect.flip);
          yield* drainScheduler;
          expect(yield* cacheKeys(target.library)).toEqual(target.keys);
        })
      );
      yield* drainScheduler;
      expect(yield* repository.getById(target.library)).toEqual(target.row);
      expect(yield* cacheKeys(target.library)).toEqual(target.keys);

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* change;
          yield* drainScheduler;
          expect(yield* cacheKeys(target.library)).toEqual(target.keys);
        })
      );
      yield* drainScheduler;
      expect(yield* cacheKeys(target.library)).toEqual({ editors: [], stores: [] });
      expect(yield* cacheKeys(unrelated.library)).toEqual(unrelated.keys);
      yield* Match.value(operation).pipe(
        Match.when(
          'delete',
          Effect.fnUntraced(function* () {
            const error = yield* repository.getById(target.library).pipe(Effect.flip);
            expect(error._tag).toBe('LibraryNotFoundError');
          })
        ),
        Match.orElse(
          Effect.fnUntraced(function* () {
            const row = yield* repository.getById(target.library);
            expect(row.name).toBe(operation === 'rename' ? 'Renamed' : target.row.name);
            expect(row.storagePluginSettings).toEqual(
              Option.some({ prefix: operation === 'settings' ? '/updated' : '/initial' })
            );
          })
        )
      );
    })
  );

  iit.effect.each(['body', 'commit'] as const)(
    'settings retirement follows the commit outcome when interrupted during the transaction %s',
    Effect.fnUntraced(function* (boundary) {
      const backing = yield* LibraryDatabase;
      const { drainScheduler } = yield* TestScheduler;
      const target = yield* warmLibrary(`Interrupted ${boundary}`);
      const entered = yield* Latch.make();
      const release = yield* Latch.make();

      // Inject the commit boundary while retaining real Turso connections and queries.
      // Both the service and repository must capture this client, not the suite's client.
      const databaseLayer = Layer.effect(
        LibraryDatabase,
        SqlClient.make({
          driver: backing.driver,
          acquirer: backing.reserve,
          compiler: Statement.makeCompilerSqlite(),
          spanAttributes: [],
          beginTransaction: 'BEGIN IMMEDIATE',
          releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
          commit: (connection) =>
            (boundary === 'commit'
              ? entered.open.pipe(Effect.andThen(release.await))
              : Effect.void
            ).pipe(
              Effect.andThen(connection.executeUnprepared('COMMIT', [], void 0)),
              Effect.asVoid
            ),
        }).pipe(
          Effect.map((client) =>
            Object.assign(client, { config: backing.config, syncHandler: backing.syncHandler })
          )
        )
      );

      yield* Effect.gen(function* () {
        const sql = yield* LibraryDatabase;
        const repository = yield* LibraryRepository;
        const request = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* mutate({ ...target.library, operation: 'settings' });
              if (boundary === 'body') {
                yield* entered.open;
                return yield* Effect.never;
              }
              return void 0;
            })
          )
          .pipe(Effect.forkChild);
        yield* entered.await;
        const interrupting = yield* Fiber.interrupt(request).pipe(Effect.forkChild);
        yield* drainScheduler;
        yield* release.open;
        yield* Fiber.join(interrupting);
        expect(Exit.hasInterrupts(yield* Fiber.await(request))).toBe(true);
        yield* drainScheduler;
        expect(yield* cacheKeys(target.library)).toEqual(
          boundary === 'commit' ? { editors: [], stores: [] } : target.keys
        );
        expect((yield* repository.getById(target.library)).storagePluginSettings).toEqual(
          Option.some({ prefix: boundary === 'commit' ? '/updated' : '/initial' })
        );
      }).pipe(
        Effect.ensuring(release.open),
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- this test boundary owns the service and retirement lifetime
        Effect.provide(
          LibraryService.layerNoDeps.pipe(
            Layer.provideMerge(LibraryRepository.layerNoDeps),
            Layer.provideMerge(databaseLayer),
            Layer.fresh
          )
        )
      );
    })
  );

  iit.effect(
    'reports a raw empty root as a typed validation error without changing configured roots',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const library = yield* service.create({
        name: Library.fields.name.make('Direct root validation'),
        type: Library.fields.type.make('movie'),
        storagePlugin: Library.fields.storagePlugin.make('npm:test'),
      });
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/configured' }),
      });
      yield* service.setRoots({ ...library, roots: [{ root: '/one' }, { root: '/two' }] });
      const before = yield* service.get(library);
      expect(before.storagePluginSettings).toEqual(Option.some({ prefix: '/configured' }));
      expect(Array.map(before.roots, ({ root }) => root)).toEqual(['/one', '/two']);

      // HTTP rejects the empty string before the service can validate it.
      const error = yield* service
        .setRoots({ ...library, roots: [{ root: '/replacement' }, { root: '' }] })
        .pipe(Effect.flip);
      assert.instanceOf(error, LibraryInvalidRootError);
      expect({ _tag: error._tag, roots: error.roots }).toEqual({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: '', message: 'Expected a value with a length of at least 1' }],
      });
      // Preserve root IDs and settings without coupling the check to cached health.
      const after = yield* service.get(library);
      expect({ settings: after.storagePluginSettings, roots: after.roots }).toEqual({
        settings: Option.some({ prefix: '/configured' }),
        roots: before.roots,
      });
    })
  );
});
