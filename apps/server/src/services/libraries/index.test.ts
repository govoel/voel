/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
  StorageRootLocation,
} from '@govoel/plugins/storage';
import { Deferred, Effect, Fiber, Option, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { expectTypeOf } from 'vitest';

import { TursoClient } from '@repo/effect-turso';
import { Library } from '@repo/spec-api/database/schema.ts';

import { ApiConfig } from '#src/services/config.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { Libraries } from '#src/services/libraries/index.ts';
import { LibraryRepository } from '#src/services/libraries/repository.ts';
import {
  Input,
  PluginFixture,
  createInput,
  librariesTestLayer,
} from '#src/services/libraries/test-fixture.ts';
import { StoragePluginMap } from '#src/services/plugins/storage/index.ts';

it('owns the dependencies and scope of every public operation', () => {
  expectTypeOf<
    Effect.Services<ReturnType<Libraries['Service'][keyof Libraries['Service']]>>
  >().toEqualTypeOf<never>();
});

it.layer(librariesTestLayer)('library lifecycle', (iit) => {
  iit.effect.each(['success', 'rejection', 'interruption'] as const)(
    'holds an invalidated storage lease through decoding and releases it on %s',
    Effect.fnUntraced(
      function* (outcome) {
        const libraries = yield* Libraries;
        const repository = yield* LibraryRepository;
        const stores = yield* StoragePluginMap;
        const fixture = yield* PluginFixture;
        const library = yield* libraries.create(createInput(`Lease ${outcome}`, 'npm:test'));
        const settings = StoragePluginSettingsPersisted.make({ prefix: '/lease' });
        yield* repository.setSettings({ ...library, settings });
        const row = yield* repository.getById(library);
        const started = yield* Deferred.make<boolean>();
        const release = yield* Deferred.make<boolean>();
        const finalized = yield* Deferred.make<boolean>();
        const { beforeRootDecode, onFinalize } = fixture.controls;
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(release, true).pipe(
            Effect.andThen(
              Effect.sync(() => {
                Object.assign(fixture.controls, { beforeRootDecode, onFinalize });
              })
            )
          )
        );
        fixture.controls.beforeRootDecode = (request) =>
          request.library.id === library.id
            ? Deferred.succeed(started, true).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.asVoid
              )
            : beforeRootDecode(request);
        fixture.controls.onFinalize = (request) =>
          request.library.id === library.id
            ? Deferred.succeed(finalized, true).pipe(Effect.asVoid)
            : onFinalize(request);

        const pending = yield* libraries
          .setRoots({
            id: library.id,
            roots: [StorageRootLocation.make(outcome === 'rejection' ? 'relative' : '/pending')],
          })
          .pipe(Effect.forkChild);
        yield* Deferred.await(started);
        yield* stores.invalidate(
          StoragePluginMap.Key.make({
            library: row,
            storagePlugin: row.storagePlugin,
            settings,
          })
        );
        expect(yield* Deferred.isDone(finalized)).toBe(false);
        expect(
          [...fixture.activeStorage].some(({ library: active }) => active.id === library.id)
        ).toBe(true);

        if (outcome === 'interruption') {
          yield* Fiber.interrupt(pending);
        } else {
          yield* Deferred.succeed(release, true);
          if (outcome === 'rejection') {
            expect(yield* Fiber.join(pending).pipe(Effect.flip)).toMatchObject({
              _tag: 'LibraryInvalidRootError',
              roots: [{ root: 'relative' }],
            });
          } else {
            expect(yield* Fiber.join(pending)).toEqual({
              ...library,
              roots: [{ root: '/pending' }],
            });
          }
        }
        yield* Deferred.await(finalized);
        expect(
          [...fixture.activeStorage].filter(({ library: active }) => active.id === library.id)
        ).toEqual([]);
        expect((yield* repository.getById(library)).roots.map(({ root }) => root)).toEqual(
          outcome === 'success' ? ['/pending'] : []
        );
      },
      (effect) => TestClock.withLive(effect.pipe(Effect.timeout('3 seconds')))
    )
  );

  iit.effect(
    'collects cached failures from both plugin components',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const repository = yield* LibraryRepository;
      const library = yield* libraries.create(createInput('Failed health', 'npm:missing'));
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({}),
      });
      expect(
        yield* libraries.getStoragePluginSettingsForm({ id: library.id }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect(
        yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [
          { _tag: 'PluginLoadError', message: 'Plugin unavailable' },
          { _tag: 'PluginLoadError', message: 'Plugin unavailable' },
        ],
      });
    })
  );

  iit.effect(
    'reads only cached plugin health, reports failures, and forgets retired instances',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const library = yield* libraries.create(createInput('Health', 'npm:test'));
      const listItem = Effect.gen(function* () {
        return (yield* libraries.list({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === library.id
        );
      });
      for (let index = 0; index < 2; index += 1) {
        expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
          status: 'unknown',
        });
        expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
      }

      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: 'unavailable' }),
      });
      // Persisted settings alone do not imply that storage is healthy.
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* libraries.getStoragePluginSettingsForm({ id: library.id });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });

      yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip);
      for (let index = 0; index < 2; index += 1) {
        expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toMatchObject({
          status: 'unhealthy',
          errors: [{ _tag: 'StoragePluginConstructionError', message: 'Storage unavailable' }],
        });
        const item = yield* listItem;
        expect(item).toMatchObject({ storagePluginStatus: 'unhealthy' });
        expect(item).not.toHaveProperty('storagePluginHealth');
      }

      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/healthy' }),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      yield* libraries.setRoots({ id: library.id, roots: [] });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
        status: 'healthy',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'healthy' });

      yield* libraries.update({ id: library.id, name: Library.fields.name.make('New health') });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth).toEqual({
        status: 'unknown',
      });
      expect(yield* listItem).toMatchObject({ storagePluginStatus: 'unknown' });
    })
  );

  iit.effect(
    'excludes cached health for obsolete settings and library context',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const repository = yield* LibraryRepository;
      const library = yield* libraries.create(createInput('Stale health', 'npm:test'));
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: 'unavailable' }),
      });
      yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip);
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth.status).toBe(
        'unhealthy'
      );

      // Leave old entries cached, as can happen while retirement is still in progress.
      yield* repository.setSettings({
        ...library,
        settings: StoragePluginSettingsPersisted.make({ prefix: '/current' }),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth.status).toBe('unknown');
      yield* libraries.getStoragePluginSettingsForm({ id: library.id });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth.status).toBe('healthy');
      yield* repository.rename({
        ...library,
        name: Library.fields.name.make('New health context'),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginHealth.status).toBe('unknown');
      expect(
        (yield* libraries.list({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === library.id
        )
      ).toMatchObject({ storagePluginStatus: 'unknown' });
    })
  );

  iit.effect(
    'rolls back root removal when standalone replacement fails to insert',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const sql = yield* LibraryDatabase;
      const library = yield* repository.create(createInput('Atomic roots'));
      yield* repository.setRoots({
        ...library,
        roots: [StorageRootLocation.make('/original')],
      });
      yield* Effect.acquireRelease(
        sql`
          create trigger "rejectRootReplacement" before insert on "libraryRoot" when new.root = '/rejected-root-replacement' begin
          select
            raise (abort, 'Root insertion rejected');

          end;
        `,
        () =>
          sql`
            drop trigger "rejectRootReplacement"
          `.pipe(Effect.orDie)
      );

      expect(
        yield* repository
          .setRoots({ ...library, roots: [StorageRootLocation.make('/rejected-root-replacement')] })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError' });
      expect((yield* repository.getById(library)).roots.map(({ root }) => root)).toEqual([
        '/original',
      ]);
    })
  );

  iit.effect(
    'creates unconfigured libraries and explicitly configures local storage',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const sql = yield* LibraryDatabase;
      const library = yield* libraries.create(createInput('Local'));
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.none()
      );
      expect(
        yield* sql`
          select
            "storagePluginSettings"
          from
            library
          where
            id = ${library.id}
        `
      ).toEqual([{ storagePluginSettings: null }]);
      expect(
        (yield* libraries.list({ cursor: Option.none(), limit: 100 })).items.some(
          ({ id }) => id === library.id
        )
      ).toBe(true);
      expect(
        yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryUnconfiguredError' });
      expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toEqual([]);
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({}),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.some({})
      );
      expect(
        yield* sql`
          select
            "storagePluginSettings"
          from
            library
          where
            id = ${library.id}
        `
      ).toEqual([{ storagePluginSettings: '{}' }]);
      expect(
        yield* libraries
          .setRoots({ id: library.id, roots: [StorageRootLocation.make('relative')] })
          .pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: 'relative', message: 'Library root locations must be absolute paths' }],
      });
    })
  );

  iit.effect(
    'reports all rejected roots with their messages without changing persisted roots',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const library = yield* libraries.create(createInput('Invalid roots'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({}),
      });
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/original')] });
      expect(
        yield* libraries
          .setRoots({
            id: library.id,
            roots: [
              StorageRootLocation.make('relative'),
              StorageRootLocation.make('/valid'),
              StorageRootLocation.make('/nul\0'),
            ],
          })
          .pipe(Effect.flip)
      ).toMatchObject({
        _tag: 'LibraryInvalidRootError',
        roots: [
          { root: 'relative', message: 'Library root locations must be absolute paths' },
          { root: '/nul\0', message: 'Library root locations must not contain NUL characters' },
        ],
      });
      expect((yield* libraries.get({ id: library.id })).roots.map(({ root }) => root)).toEqual([
        '/original',
      ]);
    })
  );

  iit.effect(
    'defers plugin loading and rejects name conflicts without resurrecting rows',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const missing = yield* libraries.create(createInput('Missing plugin', 'npm:missing'));
      expect(yield* libraries.get({ id: missing.id })).toMatchObject({
        storagePlugin: 'npm:missing',
        storagePluginSettings: Option.none(),
        storagePluginHealth: { status: 'unknown' },
      });
      expect(
        yield* libraries.getStoragePluginSettingsForm({ id: missing.id }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'PluginLoadError' });
      expect((yield* libraries.get({ id: missing.id })).storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'PluginLoadError', message: 'Plugin unavailable' }],
      });
      expect(
        (yield* libraries.list({ cursor: Option.none(), limit: 100 })).items.find(
          ({ id }) => id === missing.id
        )
      ).toMatchObject({ storagePluginStatus: 'unhealthy' });
      const original = yield* libraries.create(createInput('Unique'));
      expect(yield* libraries.create(createInput('Unique')).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNameConflictError',
      });
      const other = yield* libraries.create(createInput('Other'));
      expect(
        yield* libraries
          .update({ id: other.id, name: Library.fields.name.make('Unique') })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNameConflictError' });
      expect((yield* libraries.get({ id: other.id })).name).toBe('Other');
      yield* libraries.delete({ id: original.id });
      yield* libraries.delete({ id: original.id });
      expect(
        yield* libraries
          .update({ id: original.id, name: Library.fields.name.make('Gone') })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: 'LibraryNotFoundError' });
      const recreated = yield* libraries.create(createInput('Unique'));
      expect(recreated.id).not.toBe(original.id);
    })
  );

  iit.effect(
    'round-trips transformed settings, retries setup with stable identity, and isolates libraries',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const library = yield* libraries.create(createInput('Remote', 'npm:test'));
      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toEqual([
          { _tag: 'TextField', name: 'root', label: 'Remote', placeholder: '', initialValue: '' },
        ]);
      }
      const failure = yield* libraries
        .setStoragePluginSettings({
          id: library.id,
          input: StoragePluginSettingsInput.make({ root: 123 }),
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: 'LibraryInvalidStoragePluginSettingsError',
        message: 'Submitted storage plugin settings failed validation',
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.none()
      );
      yield* libraries.getStoragePluginSettingsForm({ id: library.id });
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: 'unavailable' }),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.some({ prefix: 'unavailable' })
      );
      expect(
        yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toMatchObject([
        { initialValue: 'unavailable', label: 'Remote' },
      ]);
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: ' /remote ' }),
      });
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/remote' })
      );
      expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toMatchObject([
        { initialValue: '/remote', label: 'Remote' },
      ]);
      yield* libraries.setRoots({
        id: library.id,
        roots: [StorageRootLocation.make(' /one '), StorageRootLocation.make('/one')],
      });
      expect((yield* libraries.get({ id: library.id })).roots.map(({ root }) => root)).toEqual([
        '/one',
      ]);
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/one')] });
      expect((yield* libraries.get({ id: library.id })).roots.map(({ root }) => root)).toEqual([
        '/one',
      ]);
      yield* libraries.update({ id: library.id, name: Library.fields.name.make('Rejected') });
      expect((yield* libraries.get({ id: library.id })).name).toBe('Rejected');
      expect(
        yield* libraries.setRoots({ id: library.id, roots: [] }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginConstructionError' });
      yield* libraries.update({ id: library.id, name: Library.fields.name.make('Renamed') });
      expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toMatchObject([
        { label: 'Renamed', initialValue: '/remote' },
      ]);
      const second = yield* libraries.create(createInput('Second remote', 'npm:test'));
      expect(yield* libraries.getStoragePluginSettingsForm({ id: second.id })).toEqual([
        {
          _tag: 'TextField',
          name: 'root',
          label: 'Second remote',
          placeholder: '',
          initialValue: '',
        },
      ]);
      fixture.controls.invalidForm = true;
      expect(
        yield* libraries.getStoragePluginSettingsForm({ id: second.id }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'StoragePluginSettingsError' });
      fixture.controls.invalidForm = false;
      yield* libraries.setRoots({ id: library.id, roots: [] });
      expect((yield* libraries.get({ id: library.id })).roots).toEqual([]);
    })
  );

  iit.effect(
    'returns before idle plugin cleanup finishes and retires beyond the caller scope',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const library = yield* libraries.create(createInput('Background retirement', 'npm:test'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/background' }),
      });
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/one')] });

      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      const finished = yield* Deferred.make<boolean>();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(Deferred.succeed(finished, true)),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, true).pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.onFinalize = () => Effect.void;
            })
          )
        )
      );

      // Closing this caller scope must not interrupt or await retirement.
      const response = yield* Effect.scoped(
        libraries.update({ id: library.id, name: Library.fields.name.make('Background renamed') })
      );
      expect(response).toEqual(library);
      yield* Deferred.await(started);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      expect((yield* libraries.get({ id: library.id })).name).toBe('Background renamed');
      expect(yield* libraries.getStoragePluginSettingsForm({ id: library.id })).toMatchObject([
        { label: 'Background renamed', initialValue: '/background' },
      ]);
      expect((yield* libraries.get({ id: library.id })).roots.map(({ root }) => root)).toEqual([
        '/one',
      ]);
      yield* Deferred.succeed(release, true);
      yield* Deferred.await(finished);
    })
  );

  iit.effect(
    'holds the write lock throughout root decoding and releases it after replacement',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const config = yield* ApiConfig;
      const contender = yield* TursoClient.make({
        filename: config.db.libraryFilename,
        busyTimeout: 0,
      });
      const library = yield* libraries.create(createInput('Locked root context', 'npm:test'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/original')] });
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeRootDecode = (request) =>
        request.library.id === library.id && request.location === '/pending'
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, true).pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.beforeRootDecode = () => Effect.void;
            })
          )
        )
      );
      const pending = yield* libraries
        .setRoots({ id: library.id, roots: [StorageRootLocation.make('/pending')] })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      // A separate connection proves the write lock prevents context changes during decoding.
      expect(
        yield* contender`
          update library
          set
            name = 'Renamed root context'
          where
            id = ${library.id}
        `.pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      expect(
        yield* contender`
          update library
          set
            "storagePluginSettings" = '{"prefix":"/updated"}'
          where
            id = ${library.id}
        `.pipe(Effect.flip)
      ).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      expect(yield* libraries.get({ id: library.id })).toMatchObject({
        name: 'Locked root context',
        storagePluginSettings: Option.some({ prefix: '/initial' }),
        roots: [{ root: '/original' }],
      });
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toEqual({ ...library, roots: [{ root: '/pending' }] });
      expect((yield* libraries.get({ id: library.id })).roots.map(({ root }) => root)).toEqual([
        '/pending',
      ]);
      yield* libraries.update({
        id: library.id,
        name: Library.fields.name.make('Renamed root context'),
      });
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/updated' }),
      });
      expect(yield* libraries.get({ id: library.id })).toMatchObject({
        name: 'Renamed root context',
        storagePluginSettings: Option.some({ prefix: '/updated' }),
      });
    })
  );

  iit.effect(
    'concurrent renames and settings edits commit only their own fields',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const library = yield* libraries.create(createInput('Concurrent metadata', 'npm:test'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      const settingsStarted = yield* Deferred.make<boolean>();
      const settingsRelease = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
        Schema.is(Input)(request.input) &&
        request.input.root === '/pending-settings'
          ? Deferred.succeed(settingsStarted, true).pipe(
              Effect.andThen(Deferred.await(settingsRelease))
            )
          : Effect.void;
      const settings = yield* libraries
        .setStoragePluginSettings({
          id: library.id,
          input: StoragePluginSettingsInput.make({ root: '/pending-settings' }),
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(settingsStarted);
      // Renaming while decoding is blocked must not overwrite settings or hold a write lock.
      yield* libraries.update({ id: library.id, name: Library.fields.name.make('Final name') });
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/initial' })
      );
      yield* Deferred.succeed(settingsRelease, true);
      yield* Fiber.join(settings);
      expect(yield* libraries.get({ id: library.id })).toMatchObject({
        name: 'Final name',
        storagePluginSettings: Option.some({ prefix: '/pending-settings' }),
      });
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'concurrent settings submissions are last-write-wins',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const library = yield* libraries.create(createInput('Concurrent settings', 'npm:test'));
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id &&
        Schema.is(Input)(request.input) &&
        request.input.root === '/slow'
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      const slow = yield* libraries
        .setStoragePluginSettings({
          id: library.id,
          input: StoragePluginSettingsInput.make({ root: '/slow' }),
        })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/fast' }),
      });
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(slow);
      expect((yield* libraries.get({ id: library.id })).storagePluginSettings).toEqual(
        Option.some({ prefix: '/slow' })
      );
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'deletion during settings decoding returns not-found and releases storage',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const fixture = yield* PluginFixture;
      const library = yield* libraries.create(createInput('Delete pending settings', 'npm:test'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({ root: '/initial' }),
      });
      yield* libraries.getStoragePluginSettingsForm({ id: library.id });
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/one')] });
      expect(
        [...fixture.activeStorage]
          .filter(({ library: row }) => row.id === library.id)
          .map(({ settings }) => settings)
      ).toEqual([{ prefix: '/initial' }]);
      const retired = yield* Deferred.make<boolean>();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(retired, true).pipe(Effect.asVoid)
          : Effect.void;
      const started = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      fixture.controls.beforeDecode = (request) =>
        request.library.id === library.id
          ? Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid
            )
          : Effect.void;
      const pending = yield* libraries
        .setStoragePluginSettings({
          id: library.id,
          input: StoragePluginSettingsInput.make({ root: '/deleted' }),
        })
        .pipe(Effect.flip, Effect.forkChild);
      yield* Deferred.await(started);
      yield* libraries.delete({ id: library.id });
      yield* Deferred.await(retired);
      expect(
        [...fixture.activeStorage].filter(({ library: row }) => row.id === library.id)
      ).toEqual([]);
      yield* Deferred.succeed(release, true);
      expect(yield* Fiber.join(pending)).toMatchObject({ _tag: 'LibraryNotFoundError' });
      expect(yield* libraries.get({ id: library.id }).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
      fixture.controls.onFinalize = () => Effect.void;
      fixture.controls.beforeDecode = () => Effect.void;
    })
  );

  iit.effect(
    'hard deletion cascades roots and mappings but preserves shared media',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const sql = yield* LibraryDatabase;
      const library = yield* libraries.create(createInput('Delete cascade'));
      yield* libraries.setStoragePluginSettings({
        id: library.id,
        input: StoragePluginSettingsInput.make({}),
      });
      yield* libraries.setRoots({ id: library.id, roots: [StorageRootLocation.make('/delete')] });
      yield* sql`
        insert into
          "mediaFile" (location, "durationMs")
        values
          ('/shared', 100)
      `;
      yield* sql`
        insert into
          "libraryFileMap" (
            "libraryId",
            "mediaFileId",
            "matchFailureReason",
            "customOrder"
          )
        select
          ${library.id},
          id,
          'unmatched',
          0
        from
          "mediaFile"
        where
          location = '/shared'
      `;
      expect(
        yield* sql`
          select
            root
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([{ root: '/delete' }]);
      expect(
        yield* sql`
          select
            "matchFailureReason",
            "customOrder"
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([{ matchFailureReason: 'unmatched', customOrder: 0 }]);
      yield* libraries.delete({ id: library.id });
      expect(
        yield* sql`
          select
            id
          from
            "libraryRoot"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([]);
      expect(
        yield* sql`
          select
            id
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `
      ).toEqual([]);
      expect(
        yield* sql`
          select
            location
          from
            "mediaFile"
          where
            location = '/shared'
        `
      ).toEqual([{ location: '/shared' }]);
      expect(yield* libraries.get({ id: library.id }).pipe(Effect.flip)).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'paginates listings including libraries awaiting setup',
    Effect.fnUntraced(function* () {
      const libraries = yield* Libraries;
      const marker = yield* libraries.create(createInput('Page marker'));
      const first = yield* libraries.create(createInput('Page first'));
      yield* libraries.create(createInput('Page second'));
      const page = yield* libraries.list({ cursor: Option.some(marker.id), limit: 1 });
      expect(
        page.items.map(({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page first', storagePluginStatus: 'unknown' }]);
      expect(page.nextCursor).toEqual(Option.some(first.id));
      const last = yield* libraries.list({ cursor: page.nextCursor, limit: 10 });
      expect(
        last.items.map(({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page second', storagePluginStatus: 'unknown' }]);
      expect(last.nextCursor).toEqual(Option.none());
    })
  );
});
