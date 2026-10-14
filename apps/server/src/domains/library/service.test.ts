import { expect, it } from '@effect/vitest';
import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Effect, Exit, Fiber, Latch, Layer, Option } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { TursoClient } from '@repo/effect-turso';
import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { PluginFixture, TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { ApiConfig } from '#src/services/config.ts';

// No HTTP handlers, middleware, or auth database participate in these workflows.
const testLayer = LibraryService.layerNoDeps.pipe(
  Layer.provideMerge([LibraryRepository.layerNoDeps, pluginLayer]),
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provideMerge(TestScheduler.layer)
);

const createInput = (name: string) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePlugin: Library.fields.storagePlugin.make('npm:test'),
});

it.layer(testLayer)('library service without transport', (iit) => {
  iit.effect(
    'owns setup, validation, normalized roots, health, pagination, rename and deletion',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const library = yield* service.create(createInput('Direct workflow'));
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'unknown' });
      expect(yield* service.setRoots({ ...library, roots: [] }).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryUnconfiguredError',
      });
      expect(yield* service.getStoragePluginSettingsForm(library)).toMatchObject([
        { label: 'Direct workflow', initialValue: '' },
      ]);
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: ' /direct ' }),
      });
      expect(
        yield* service.setRoots({
          ...library,
          roots: [{ root: ' /one ' }, { root: '/one' }, { root: '/two' }],
        })
      ).toEqual({ ...library, roots: [{ root: '/one' }, { root: '/two' }] });
      expect(
        yield* service
          .setRoots({
            ...library,
            roots: [{ root: '/valid' }, { root: 'invalid' }],
          })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryInvalidRootError' });
      // Direct callers can submit values rejected before HTTP would invoke us.
      expect(
        yield* service.setRoots({ ...library, roots: [{ root: '' }] }).pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: '' }],
      });
      expect((yield* service.get(library)).roots.map(({ root }) => root)).toEqual(['/one', '/two']);
      expect((yield* service.get(library)).storagePluginHealth).toEqual({ status: 'healthy' });
      const next = yield* service.create(createInput('Direct next page'));
      const page = yield* service.list({ cursor: Option.none(), limit: 1 });
      expect(
        page.items.map(({ id, storagePluginStatus }) => ({ id, storagePluginStatus }))
      ).toEqual([{ id: library.id, storagePluginStatus: 'healthy' }]);
      expect(page.nextCursor).toEqual(Option.some(library.id));
      expect(
        (yield* service.list({ cursor: page.nextCursor, limit: 1 })).items.map(({ id }) => id)
      ).toEqual([next.id]);
      yield* service.rename({ ...library, name: Library.fields.name.make('Direct renamed') });
      expect(yield* service.getStoragePluginSettingsForm(library)).toMatchObject([
        { label: 'Direct renamed', initialValue: '/direct' },
      ]);
      yield* service.delete(library);
      yield* service.delete(library);
      expect(yield* service.get(library).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'holds BEGIN IMMEDIATE across decoding, rolls back nested replacement, and defects on begin failure',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const fixture = yield* PluginFixture;
      const sql = yield* LibraryDatabase;
      const config = yield* ApiConfig;
      const contender = yield* TursoClient.make({
        filename: config.db.libraryFilename,
        busyTimeout: 0,
      });
      const library = yield* service.create(createInput('Direct transaction'));
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      yield* service.setRoots({ ...library, roots: [{ root: '/original' }] });
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      fixture.controls.beforeRootDecode = (request) =>
        request.library.id === library.id
          ? started.open.pipe(Effect.andThen(release.await), Effect.asVoid)
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        release.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.beforeRootDecode = () => Effect.void;
            })
          )
        )
      );
      const pending = yield* service
        .setRoots({ ...library, roots: [{ root: '/pending' }] })
        .pipe(Effect.forkChild);
      yield* started.await;
      expect(
        yield* contender`
          update library
          set
            name = 'raced'
          where
            id = ${library.id}
        `.pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      yield* release.open;
      expect(yield* Fiber.join(pending)).toEqual({ ...library, roots: [{ root: '/pending' }] });
      fixture.controls.beforeRootDecode = () => Effect.void;

      // Fail after deleting the previous roots and inserting one new root in the nested savepoint.
      yield* sql`
        create trigger reject_direct_root before insert on libraryroot when new.root = '/rejected' begin
        select
          raise (abort, 'rejected');

        end
      `;
      yield* Effect.addFinalizer(() =>
        sql`
          drop trigger if exists reject_direct_root
        `.pipe(Effect.orDie)
      );
      expect(
        Exit.hasDies(
          yield* service
            .setRoots({
              ...library,
              roots: [{ root: '/inserted' }, { root: '/rejected' }],
            })
            .pipe(Effect.exit)
        )
      ).toBe(true);
      expect((yield* service.get(library)).roots.map(({ root }) => root)).toEqual(['/pending']);

      // A different connection owns the write lock: failure to begin is not a domain error.
      yield* sql`
        pragma busy_timeout = 1
      `;
      yield* contender`begin immediate`;
      yield* Effect.addFinalizer(() => contender`rollback`.pipe(Effect.orDie));
      const beginFailure = yield* service.setRoots({ ...library, roots: [] }).pipe(Effect.exit);
      expect(Exit.hasDies(beginFailure)).toBe(true);
      expect(Exit.findDefect(beginFailure)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SqlError' },
      });
    })
  );

  iit.effect(
    'retirement survives the caller scope and does not await blocked plugin finalizers',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const fixture = yield* PluginFixture;
      const { drainScheduler } = yield* TestScheduler;
      const library = yield* service.create(createInput('Direct retirement'));
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/retiring' }),
      });
      yield* service.setRoots({ ...library, roots: [{ root: '/one' }] });
      const started = yield* Latch.make();
      const release = yield* Latch.make();
      const finished = yield* Latch.make();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? started.open.pipe(
              Effect.andThen(release.await),
              Effect.andThen(finished.open),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        release.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.onFinalize = () => Effect.void;
            })
          )
        )
      );
      expect(
        yield* Effect.scoped(
          service.rename({ ...library, name: Library.fields.name.make('Direct retired') })
        )
      ).toEqual(library);
      yield* drainScheduler;
      expect(started.isOpen()).toBe(true);
      expect(finished.isOpen()).toBe(false);
      expect((yield* service.get(library)).name).toBe('Direct retired');
      expect(yield* service.getStoragePluginSettingsForm(library)).toMatchObject([
        { label: 'Direct retired', initialValue: '/retiring' },
      ]);
      yield* release.open;
      yield* finished.await;
    })
  );
});
