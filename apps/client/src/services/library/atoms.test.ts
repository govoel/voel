/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Option, Schema } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { vi } from 'vitest';

import { Library } from '@repo/spec-api/database/schema.ts';
import {
  LibraryInvalidRootError,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryUnconfiguredError,
} from '@repo/spec-api/groups/library.ts';
import { ForbiddenError } from '@repo/spec-api/middlewares/auth.ts';
import { PluginLoadError } from '@repo/spec-api/plugins/index.ts';

import { makeStoragePluginSettingsFormOptions } from '#src/components/storage-plugin-settings-form/adapter.ts';
import { AccountManager, NoActiveAccountError } from '#src/services/accounts/index.ts';
import { ApiClientMap } from '#src/services/api-client/index.ts';
import {
  createLibraryAtom,
  deleteLibraryAtom,
  libraryAtom,
  libraryStoragePluginSettingsFormAtom,
  listLibrariesAtom,
  setLibraryRootsAtom,
  setLibraryStoragePluginSettingsAtom,
  updateLibraryAtom,
} from '#src/services/library/atoms.ts';
import { AtomTaskScheduler, makeClientAtomsTestLayer } from '#src/services/testing/atoms.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import { setupTestServerWithUsers, signInTestServerUsers } from '#src/services/testing/utils.ts';

const libraryInput = (name: string) => ({
  name: Library.jsonCreate.fields.name.make(name),
  type: Library.jsonCreate.fields.type.make('audiobook'),
  storagePlugin: Library.jsonCreate.fields.storagePlugin.make('builtin:local'),
});

const settled = { suspendOnWaiting: true };

const setupAdmin = Effect.fnUntraced(function* () {
  const manager = yield* AccountManager;
  const server = yield* setupTestServerWithUsers({ userCount: 1 });
  const [account] = yield* signInTestServerUsers(manager, server);
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  return { account, client };
});

it.layer(TestServerControllerClient.layer)('library management atoms', (iit) => {
  iit.effect(
    'preserves NoActiveAccountError for queries and mutations',
    Effect.fnUntraced(
      function* () {
        const id = Library.fields.id.make(1);
        expect(yield* Atom.getResult(listLibrariesAtom, settled).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
        expect(yield* Atom.getResult(libraryAtom(id), settled).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
        expect(
          yield* Atom.getResult(libraryStoragePluginSettingsFormAtom(id), settled).pipe(Effect.flip)
        ).toBeInstanceOf(NoActiveAccountError);
        yield* Atom.set(createLibraryAtom, libraryInput('Books'));
        expect(yield* Atom.getResult(createLibraryAtom, settled).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
      },
      (effect) => effect.pipe(Effect.provide(makeClientAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads empty catalogs and cursor pages, and restarts pagination after mutations or refresh',
    Effect.fnUntraced(
      function* () {
        const { client } = yield* setupAdmin();
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        yield* Atom.mount(listLibrariesAtom);
        expect(yield* Atom.getResult(listLibrariesAtom, settled)).toEqual({
          items: [],
          done: true,
        });
        for (let index = 0; index < 12; index += 1) {
          yield* client.library.create({ payload: libraryInput(`Books ${index}`) });
        }
        yield* Atom.refresh(listLibrariesAtom);
        const first = yield* Atom.getResult(listLibrariesAtom, settled);
        expect(first.items).toHaveLength(10);
        expect(first.done).toBe(false);
        yield* Atom.set(listLibrariesAtom, void 0);
        const all = yield* Atom.getResult(listLibrariesAtom, settled);
        expect(all.items).toHaveLength(12);
        expect(all.done).toBe(true);
        expect(new Set(all.items.map(({ id }) => id)).size).toBe(12);
        const list = vi.spyOn(client.library, 'list');
        yield* Atom.set(listLibrariesAtom, void 0);
        expect(list).not.toHaveBeenCalled();

        const [target] = all.items;
        expect(target).toBeDefined();
        if (!target) {
          return;
        }
        yield* Atom.set(deleteLibraryAtom, { id: target.id });
        yield* Atom.getResult(deleteLibraryAtom, settled);
        yield* drainAtomTasks;
        const restarted = yield* Atom.getResult(listLibrariesAtom, settled);
        expect(restarted.items).toHaveLength(10);
        expect(restarted.done).toBe(false);
        expect(restarted.items.some(({ id }) => id === target.id)).toBe(false);
        yield* Atom.set(listLibrariesAtom, void 0);
        expect((yield* Atom.getResult(listLibrariesAtom, settled)).items).toHaveLength(11);

        yield* Atom.set(createLibraryAtom, libraryInput('New books'));
        const created = yield* Atom.getResult(createLibraryAtom, settled);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(listLibrariesAtom, settled)).items).toHaveLength(10);
        yield* Atom.set(listLibrariesAtom, void 0);
        expect(
          (yield* Atom.getResult(listLibrariesAtom, settled)).items.some(
            ({ id }) => id === created.id
          )
        ).toBe(true);
        yield* Atom.refresh(listLibrariesAtom);
        expect((yield* Atom.getResult(listLibrariesAtom, settled)).items).toHaveLength(10);
      },
      (effect) => effect.pipe(Effect.provide(makeClientAtomsTestLayer()))
    )
  );

  iit.effect(
    'configures an empty form, replaces normalized roots, and invalidates only the changed library',
    Effect.fnUntraced(
      function* () {
        const { client } = yield* setupAdmin();
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        yield* Atom.set(createLibraryAtom, libraryInput('Books'));
        const library = yield* Atom.getResult(createLibraryAtom, settled);
        const other = yield* client.library.create({ payload: libraryInput('Other') });
        const detail = libraryAtom(library.id);
        const otherDetail = libraryAtom(other.id);
        const form = libraryStoragePluginSettingsFormAtom(library.id);
        yield* Atom.mount(detail);
        yield* Atom.mount(otherDetail);
        yield* Atom.mount(form);
        yield* Atom.mount(listLibrariesAtom);
        expect((yield* Atom.getResult(detail, settled)).storagePluginSettings).toEqual(
          Option.none()
        );
        yield* Atom.getResult(otherDetail, settled);
        const fields = yield* Atom.getResult(form, settled);
        expect(fields).toEqual([]);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).storagePluginHealth.status).toBe('healthy');
        yield* Atom.getResult(listLibrariesAtom, settled);

        yield* Atom.set(setLibraryRootsAtom, { ...library, roots: [{ root: '/books' }] });
        expect(
          yield* Atom.getResult(setLibraryRootsAtom, settled).pipe(Effect.flip)
        ).toBeInstanceOf(LibraryUnconfiguredError);
        const { schema, defaultValues } = makeStoragePluginSettingsFormOptions({ fields });
        const settings = setLibraryStoragePluginSettingsAtom(library.id);
        yield* Atom.set(settings, yield* Schema.decodeEffect(schema)(defaultValues));
        yield* Atom.getResult(settings, settled);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).storagePluginSettings).toEqual(
          Option.some({})
        );
        yield* Atom.getResult(form, settled);
        yield* drainAtomTasks;
        yield* Atom.getResult(detail, settled);
        yield* Atom.getResult(listLibrariesAtom, settled);

        const read = vi.spyOn(client.library, 'get');
        const getForm = vi.spyOn(client.library, 'getStoragePluginSettingsForm');
        yield* Atom.set(updateLibraryAtom, {
          ...library,
          name: Library.fields.name.make('Renamed'),
        });
        yield* Atom.getResult(updateLibraryAtom, settled);
        yield* drainAtomTasks;
        yield* Atom.getResult(form, settled);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).name).toBe('Renamed');
        expect(getForm).toHaveBeenCalledWith({ params: library });
        expect(read.mock.calls.every(([request]) => request.params.id === library.id)).toBe(true);
        read.mockClear();
        getForm.mockClear();
        yield* Atom.set(updateLibraryAtom, { ...library, name: Library.fields.name.make('Other') });
        expect(yield* Atom.getResult(updateLibraryAtom, settled).pipe(Effect.flip)).toBeInstanceOf(
          LibraryNameConflictError
        );
        yield* drainAtomTasks;
        expect(read).not.toHaveBeenCalled();
        expect(getForm).not.toHaveBeenCalled();

        yield* Atom.set(setLibraryRootsAtom, {
          ...library,
          roots: [{ root: '/books/../audio' }, { root: '/audio' }],
        });
        expect(yield* Atom.getResult(setLibraryRootsAtom, settled)).toEqual({
          ...library,
          roots: [{ root: '/audio' }],
        });
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).roots).toMatchObject([{ root: '/audio' }]);
        yield* Atom.set(setLibraryRootsAtom, { ...library, roots: [{ root: 'relative' }] });
        const invalid = yield* Atom.getResult(setLibraryRootsAtom, settled).pipe(Effect.flip);
        expect(invalid).toBeInstanceOf(LibraryInvalidRootError);
        if (Schema.is(LibraryInvalidRootError)(invalid)) {
          expect(invalid.roots[0].root).toBe('relative');
          expect(invalid.roots[0].message.length).toBeGreaterThan(0);
        }
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).roots).toMatchObject([{ root: '/audio' }]);
        yield* Atom.set(setLibraryRootsAtom, { ...library, roots: [] });
        yield* Atom.getResult(setLibraryRootsAtom, settled);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).roots).toEqual([]);

        yield* Atom.set(deleteLibraryAtom, library);
        yield* Atom.getResult(deleteLibraryAtom, settled);
        yield* drainAtomTasks;
        expect(yield* Atom.getResult(detail, settled).pipe(Effect.flip)).toBeInstanceOf(
          LibraryNotFoundError
        );
        expect(yield* Atom.getResult(form, settled).pipe(Effect.flip)).toBeInstanceOf(
          LibraryNotFoundError
        );
        yield* drainAtomTasks;
        expect(
          (yield* Atom.getResult(listLibrariesAtom, settled)).items.map(({ id }) => id)
        ).toEqual([other.id]);
      },
      (effect) => effect.pipe(Effect.provide(makeClientAtomsTestLayer()))
    )
  );

  iit.effect(
    'refreshes cached health after a settings editor fails to load',
    Effect.fnUntraced(
      function* () {
        yield* setupAdmin();
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        yield* Atom.set(createLibraryAtom, {
          ...libraryInput('Missing plugin'),
          storagePlugin: Library.jsonCreate.fields.storagePlugin.make(
            'npm:@voel/missing-test-plugin'
          ),
        });
        const library = yield* Atom.getResult(createLibraryAtom, settled);
        const detail = libraryAtom(library.id);
        yield* Atom.mount(detail);
        yield* Atom.mount(listLibrariesAtom);
        expect((yield* Atom.getResult(detail, settled)).storagePluginHealth.status).toBe('unknown');
        expect(
          (yield* Atom.getResult(listLibrariesAtom, settled)).items[0]?.storagePluginStatus
        ).toBe('unknown');
        expect(
          yield* Atom.getResult(libraryStoragePluginSettingsFormAtom(library.id), settled).pipe(
            Effect.flip
          )
        ).toBeInstanceOf(PluginLoadError);
        yield* drainAtomTasks;
        expect((yield* Atom.getResult(detail, settled)).storagePluginHealth).toMatchObject({
          status: 'unhealthy',
          errors: [{ _tag: 'PluginLoadError' }],
        });
        expect(
          (yield* Atom.getResult(listLibrariesAtom, settled)).items[0]?.storagePluginStatus
        ).toBe('unhealthy');
      },
      (effect) => effect.pipe(Effect.provide(makeClientAtomsTestLayer()))
    )
  );

  iit.effect(
    'isolates overlapping IDs across servers, clears stale results during switches, and preserves forbidden errors',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const first = yield* setupAdmin();
        const firstLibrary = yield* first.client.library.create({
          payload: libraryInput('First server'),
        });
        const second = yield* setupAdmin();
        const secondLibrary = yield* second.client.library.create({
          payload: libraryInput('Second server'),
        });
        expect(secondLibrary.id).toBe(firstLibrary.id);
        yield* manager.setActiveAccount(first.account);
        const detail = libraryAtom(firstLibrary.id);
        const form = libraryStoragePluginSettingsFormAtom(firstLibrary.id);
        yield* Atom.mount(detail);
        yield* Atom.mount(form);
        yield* Atom.mount(listLibrariesAtom);
        expect((yield* Atom.getResult(detail, settled)).name).toBe('First server');
        yield* Atom.getResult(form, settled);
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        yield* drainAtomTasks;
        yield* Atom.getResult(listLibrariesAtom, settled);
        const gate = yield* Deferred.make<boolean>();
        const { list, get, getStoragePluginSettingsForm: getForm } = second.client.library;
        vi.spyOn(second.client.library, 'list').mockImplementation((input) =>
          Effect.andThen(Deferred.await(gate), list(input))
        );
        vi.spyOn(second.client.library, 'get').mockImplementation((input) =>
          Effect.andThen(Deferred.await(gate), get(input))
        );
        vi.spyOn(second.client.library, 'getStoragePluginSettingsForm').mockImplementation(
          (input) => Effect.andThen(Deferred.await(gate), getForm(input))
        );
        yield* manager.setActiveAccount(second.account);
        yield* Effect.yieldNow;
        yield* drainAtomTasks;
        const registry = yield* AtomRegistry.AtomRegistry;
        expect(registry.get(listLibrariesAtom)).toMatchObject({ _tag: 'Initial', waiting: true });
        expect(registry.get(detail)).toMatchObject({ _tag: 'Initial', waiting: true });
        expect(registry.get(form)).toMatchObject({ _tag: 'Initial', waiting: true });
        yield* Deferred.succeed(gate, true);
        expect((yield* Atom.getResult(detail, settled)).name).toBe('Second server');
        yield* Atom.getResult(form, settled);
        yield* drainAtomTasks;
        expect(
          (yield* Atom.getResult(listLibrariesAtom, settled)).items.map(({ name }) => name)
        ).toEqual(['Second server']);

        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [, user] = yield* signInTestServerUsers(manager, server);
        yield* manager.setActiveAccount(user);
        yield* Effect.yieldNow;
        yield* drainAtomTasks;
        expect(yield* Atom.getResult(listLibrariesAtom, settled).pipe(Effect.flip)).toBeInstanceOf(
          ForbiddenError
        );
        expect(AsyncResult.value(registry.get(listLibrariesAtom))).toEqual(Option.none());
        yield* Atom.set(createLibraryAtom, libraryInput('Not allowed'));
        expect(yield* Atom.getResult(createLibraryAtom, settled).pipe(Effect.flip)).toBeInstanceOf(
          ForbiddenError
        );
        yield* manager.removeActiveAccount;
        yield* Effect.yieldNow;
        yield* drainAtomTasks;
        expect(yield* Atom.getResult(detail, settled).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
        expect(AsyncResult.value(registry.get(detail))).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeClientAtomsTestLayer()))
    )
  );
});
