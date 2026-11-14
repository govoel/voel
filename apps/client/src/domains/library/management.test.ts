import { expect, it } from '@effect/vitest';
import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Array, Cause, Effect, Layer, Option, Schema, Stream, Struct } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { ForbiddenError } from '@repo/spec-api/domains/auth/http.ts';
import { Library, LibraryNotFoundError } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import {
  LibraryEditorInput,
  LibraryEditorMetadata,
  LibraryEditorSource,
  libraryStorageSettingsAtom,
  saveLibrary,
  settingsDefaults,
} from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  deleteLibrary,
  libraryStorageDetails,
  libraryStorageErrors,
  listLibrariesAtom,
  serverLibraryAtom,
} from '#src/domains/library/management.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/testing/utils.ts';

const makeManagementTestLayer = () =>
  Layer.fromBuild(
    Effect.fnUntraced(function* (memoMap, scope) {
      const services =
        yield* Effect.context<Layer.Success<ReturnType<typeof makeClientTestLayers>>>();
      const registry = AtomRegistry.layerOptions({
        initialValues: [
          Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
          Atom.initialValue(Atom.runtime.memoMap, memoMap),
        ],
      });
      return yield* Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(
        Layer.provideMerge(registry),
        (layer) => Layer.buildWithMemoMap(layer, memoMap, scope)
      );
    })
  ).pipe(Layer.provideMerge(makeClientTestLayers()));

const createInput = (name: string) => ({
  name: Library.jsonCreate.fields.name.make(name),
  type: Library.jsonCreate.fields.type.make('movie'),
  storagePluginId: Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
  storagePluginSettings: StoragePluginSettingsInput.make({ roots: [] }),
});

it.layer(TestServerControllerClient.layer)('library management', (iit) => {
  iit.effect(
    'reports an empty stream initially and after deleting the last library, and recovers on refresh',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account.key));
        const query = listLibrariesAtom(account.key);
        yield* Atom.mount(query);
        const empty = yield* Atom.getResult(query, { suspendOnWaiting: true }).pipe(Effect.flip);
        expect(empty).toBeInstanceOf(Cause.NoSuchElementError);

        const created = yield* client.library.create({ payload: createInput('Only library') });
        yield* Atom.refresh(query);
        const populated = yield* Atom.getResult(query, { suspendOnWaiting: true });
        expect(populated.items).toMatchObject([{ id: created.id, name: 'Only library' }]);

        yield* deleteLibrary({ account: account.key, id: created.id });
        const deleted = yield* Atom.getResult(query, { suspendOnWaiting: true }).pipe(Effect.flip);
        expect(deleted).toBeInstanceOf(Cause.NoSuchElementError);
      },
      (effect) => effect.pipe(Effect.provide(makeManagementTestLayer()))
    )
  );

  iit.effect(
    'paginates libraries and refreshes mounted queries after an idempotent deletion',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account.key));
        const created = yield* Effect.forEach(Array.range(1, 21), (n) =>
          client.library.create({ payload: createInput(String(n)) })
        );
        const query = listLibrariesAtom(account.key);
        yield* Atom.mount(query);
        const first = yield* Atom.getResult(query, { suspendOnWaiting: true });
        expect(first.items).toHaveLength(20);
        let loadedPage = first;
        while (!loadedPage.done) {
          yield* Atom.set(query, void 0);
          loadedPage = yield* Atom.getResult(query, { suspendOnWaiting: true });
        }
        expect(Array.map(loadedPage.items, ({ id }) => id)).toEqual(
          Array.map(created, ({ id }) => id)
        );
        const target = Option.getOrThrow(Array.head(first.items));
        const detail = serverLibraryAtom({ account: account.key, id: target.id });
        yield* Atom.mount(detail);
        const loaded = yield* Atom.getResult(detail);
        expect(loaded).toMatchObject({
          id: target.id,
          name: target.name,
        });
        expect(libraryStorageDetails({ library: loaded })).toEqual([
          { label: 'Provider', value: 'Local folders' },
          { label: 'Plugin status', value: 'Built successfully' },
        ]);
        expect(libraryStorageErrors({ library: loaded })).toEqual([]);
        const custom = {
          ...loaded,
          storagePluginId: Library.json.fields.storagePluginId.make('npm:test'),
          storagePluginHealth: { status: 'unknown' as const },
        };
        expect(libraryStorageDetails({ library: custom })).toEqual([
          { label: 'Provider', value: 'Custom plugin' },
          { label: 'Plugin ID', value: 'npm:test' },
          { label: 'Plugin status', value: 'Not checked' },
        ]);
        expect(libraryStorageErrors({ library: custom })).toEqual([]);
        const failure = PluginLoadError.make({ message: 'Plugin unavailable' });
        expect(
          libraryStorageErrors({
            library: {
              ...custom,
              storagePluginHealth: {
                status: 'unhealthy',
                errors: [failure, failure],
              },
            },
          })
        ).toEqual(['Plugin unavailable']);
        expect(
          libraryStorageErrors({
            library: {
              ...custom,
              storagePluginHealth: {
                status: 'unhealthy',
                errors: [failure, PluginLoadError.make({ message: '' })],
              },
            },
          })
        ).toEqual(['Plugin unavailable', 'Unable to construct the storage plugin.']);
        yield* deleteLibrary({ account: account.key, id: target.id });
        yield* deleteLibrary({ account: account.key, id: target.id });
        const changed = yield* Atom.toStreamResult(query).pipe(
          Stream.filter((page) => !Array.some(page.items, (item) => item.id === target.id)),
          Stream.runHead
        );
        const refreshed = Option.getOrThrow(changed);
        expect(Array.map(refreshed.items, ({ id }) => id)).toEqual(
          Array.map(
            Array.filter(created, ({ id }) => id !== target.id),
            ({ id }) => id
          )
        );
        const deleted = yield* Atom.getResult(detail, { suspendOnWaiting: true }).pipe(Effect.flip);
        expect(deleted).toBeInstanceOf(LibraryNotFoundError);
        expect(libraryFailureMessage({ error: deleted })).toBe('This library no longer exists.');
      },
      (effect) => effect.pipe(Effect.provide(makeManagementTestLayer()))
    )
  );

  iit.effect(
    'keeps library IDs scoped to the captured server after account selection changes',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [first] = yield* signInTestServerUsers(manager, firstServer);
        const clients = yield* ApiClientMap;
        const firstClient = yield* clients.acquire(first.key);
        const created = yield* firstClient.library.create({ payload: createInput('First server') });
        const secondServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [second] = yield* signInTestServerUsers(manager, secondServer);
        const secondClient = yield* clients.acquire(second.key);
        const other = yield* secondClient.library.create({ payload: createInput('Second server') });
        expect(other.id).toEqual(created.id);
        const firstDetail = serverLibraryAtom({ account: first.key, id: created.id });
        const secondDetail = serverLibraryAtom({ account: second.key, id: other.id });
        expect((yield* Atom.getResult(firstDetail)).name).toBe('First server');
        expect((yield* Atom.getResult(secondDetail)).name).toBe('Second server');
        yield* deleteLibrary({ account: first.key, id: created.id });
        expect((yield* secondClient.library.get({ params: other })).name).toBe('Second server');
        expect(
          (yield* firstClient.library.list({ query: { limit: 20, cursor: Option.none() } })).items
        ).toEqual([]);
      },
      (effect) => effect.pipe(Effect.provide(makeManagementTestLayer()))
    )
  );

  iit.effect(
    'keeps library views current after creation and preserves saved settings when editing',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const query = listLibrariesAtom(account.key);
        yield* Atom.mount(query);
        yield* Atom.getResult(query, { suspendOnWaiting: true }).pipe(Effect.flip);
        const values = yield* Schema.decodeEffect(LibraryEditorInput)({
          name: 'Audiobooks',
          type: 'audiobook',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/media/first'] },
        });
        const request = Struct.pick(values, Struct.keys(LibraryEditorMetadata.fields));
        const created = yield* saveLibrary({
          account: account.key,
          source: LibraryEditorSource.Create(),
          values,
        });
        expect((yield* Atom.getResult(query, { suspendOnWaiting: true })).items).toMatchObject([
          { id: created.id, name: 'Audiobooks' },
        ]);
        const detail = serverLibraryAtom({ account: account.key, id: created.id });
        yield* Atom.mount(detail);
        const library = yield* Atom.getResult(detail, { suspendOnWaiting: true });
        const editSource = LibraryEditorSource.Edit({ library });
        const editingFields = yield* Atom.getResult(
          libraryStorageSettingsAtom({
            account: account.key,
            id: Option.some(created.id),
            request,
          }),
          { suspendOnWaiting: true }
        );
        const updated = yield* Schema.decodeEffect(LibraryEditorInput)({
          ...request,
          name: 'Renamed',
          storagePluginSettings: settingsDefaults({ fields: editingFields }),
        });
        yield* saveLibrary({
          account: account.key,
          source: editSource,
          values: updated,
        });
        const saved = yield* Atom.getResult(detail, { suspendOnWaiting: true });
        expect(saved).toMatchObject({
          name: 'Renamed',
          storagePluginSettings: { roots: ['/media/first'] },
        });
        expect((yield* Atom.getResult(query, { suspendOnWaiting: true })).items).toMatchObject([
          { id: created.id, name: 'Renamed' },
        ]);
      },
      (effect) => effect.pipe(Effect.provide(makeManagementTestLayer()))
    )
  );

  iit.effect(
    'rejects non-admin access to library lists',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [, user] = yield* signInTestServerUsers(manager, server);
        const denied = yield* Atom.getResult(listLibrariesAtom(user.key)).pipe(Effect.flip);
        expect(denied).toBeInstanceOf(ForbiddenError);
      },
      (effect) => effect.pipe(Effect.provide(makeManagementTestLayer()))
    )
  );
});
