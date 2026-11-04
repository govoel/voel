import { expect, it } from '@effect/vitest';
import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Array, Effect, Layer, Option, Schema } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';
import { vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import {
  LibraryDefinition,
  createLibrary,
  loadDraftSettings,
  sameDefinition,
} from '#src/app/accounts/(selected)/server/libraries/create/index.ts';
import { listLibrariesAtom } from '#src/app/accounts/(selected)/server/libraries/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { newRootRow } from '#src/domains/library/management.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/testing/utils.ts';

vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

const testRegistryLayer = Layer.fromBuild(
  Effect.fnUntraced(function* (memoMap, scope) {
    const services =
      yield* Effect.context<Layer.Success<ReturnType<typeof makeClientTestLayers>>>();
    return yield* AtomRegistry.layerOptions({
      initialValues: [
        Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
        Atom.initialValue(Atom.runtime.memoMap, memoMap),
      ],
    }).pipe((layer) => Layer.buildWithMemoMap(layer, memoMap, scope));
  })
);

it.layer(TestServerControllerClient.layer)('listLibrariesAtom', (iit) => {
  iit.effect(
    'represents empty libraries and stops at the final server cursor without an extra pull',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const query = listLibrariesAtom(account.key);
        const registry = yield* AtomRegistry.AtomRegistry;
        yield* Atom.mount(query);
        expect(yield* Atom.getResult(query, { suspendOnWaiting: true })).toEqual({
          items: [],
          done: true,
        });

        const client = yield* ApiClientMap.use((clients) => clients.acquire(account.key));
        yield* Effect.forEach(Array.range(1, 11), (index) =>
          client.library.create({
            payload: {
              name: Library.fields.name.make(`Library ${index}`),
              type: Library.fields.type.make('audiobook'),
              storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
              storagePluginSettings: StoragePluginSettingsInput.make({}),
              roots: [],
            },
          })
        );
        registry.refresh(query);
        const first = yield* Atom.getResult(query, { suspendOnWaiting: true });
        expect(first.items).toHaveLength(10);
        expect(first.done).toBe(false);
        yield* Atom.set(query, void 0);
        const last = yield* Atom.getResult(query, { suspendOnWaiting: true });
        expect(last.items).toHaveLength(11);
        expect(last.done).toBe(true);
        expect(new Set(Array.map(last.items, ({ id }) => id)).size).toBe(11);
      },
      (effect) =>
        effect.pipe(
          Effect.provide(testRegistryLayer.pipe(Layer.provideMerge(makeClientTestLayers())))
        )
    )
  );
  iit.effect(
    'loads draft settings without creating a library and commits complete configuration only',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account.key));
        const definition = yield* Schema.decodeEffect(LibraryDefinition)({
          name: 'Complete library',
          type: 'audiobook',
          storagePlugin: 'builtin:local',
        });
        const draft = yield* loadDraftSettings({ account: account.key, definition });
        expect(draft.fields).toEqual([]);
        expect(sameDefinition({ values: definition, definition: draft.definition })).toBe(true);
        expect(
          sameDefinition({
            values: { ...definition, name: 'Changed name' },
            definition: draft.definition,
          })
        ).toBe(false);
        expect(
          (yield* client.library.list({ query: { limit: 100, cursor: Option.none() } })).items
        ).toEqual([]);

        const invalid = yield* createLibrary({
          account: account.key,
          definition,
          values: {},
          roots: [newRootRow('relative')],
        }).pipe(Effect.flip);
        expect(invalid).toMatchObject({ _tag: 'LibraryInvalidRootError' });
        expect(
          (yield* client.library.list({ query: { limit: 100, cursor: Option.none() } })).items
        ).toEqual([]);
        const created = yield* createLibrary({
          account: account.key,
          definition,
          values: {},
          roots: [newRootRow('/media/books/../audiobooks'), newRootRow('/media/audiobooks')],
        });
        expect(yield* client.library.get({ params: created })).toMatchObject({
          name: definition.name,
          storagePluginSettings: Option.some({}),
          roots: [{ root: '/media/audiobooks' }],
        });
        expect(
          yield* createLibrary({ account: account.key, definition, values: {}, roots: [] }).pipe(
            Effect.flip
          )
        ).toMatchObject({ _tag: 'LibraryNameConflictError' });
      },
      (effect) =>
        effect.pipe(
          Effect.provide(testRegistryLayer.pipe(Layer.provideMerge(makeClientTestLayers())))
        )
    )
  );
});
