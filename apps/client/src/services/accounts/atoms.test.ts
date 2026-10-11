/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import {
  Array,
  Cause,
  Clock,
  Context,
  DateTime,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Redacted,
  Scheduler,
  Stream,
} from 'effect';
import { AsyncResult, Atom, AtomRegistry, Reactivity } from 'effect/reactivity';
import { TestClock } from 'effect/testing';
import { AppState } from 'react-native';
import { vi } from 'vitest';

import { Library } from '@repo/spec-api/database/schema.ts';
import { LibraryNotFoundError } from '@repo/spec-api/groups/library.ts';
import { ForbiddenError } from '@repo/spec-api/middlewares/auth.ts';

import { ownSessionsAtom, revokeOwnSessionAtom } from '#src/app/accounts/profile/index.ts';
import {
  deleteServerUserAtom,
  serverUserAtom,
  serverUserSessionsAtom,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { AccountsSheet, accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import {
  accountsAtom,
  activeAccountApiClientAtom,
  activeAccountAtom,
} from '#src/services/accounts/atoms.ts';
import {
  AccountManager,
  ActiveAccountKey,
  NoActiveAccountError,
} from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { ApiClientMap } from '#src/services/api-client/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import {
  libraryAtom,
  libraryStoragePluginSettingsFormAtom,
  listLibrariesAtom,
} from '#src/services/libraries/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/services/testing/utils.ts';

// The atoms share modules with form hooks; native form widgets are not used here.
vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

it('canonicalizes library keys without losing account or library identity', () => {
  const identity = {
    serverUrl: Account.fields.serverUrl.make('https://library-keys.example.test'),
    userId: Account.fields.userId.make('reader'),
    authStorageId: Account.fields.authStorageId.make('sign-in'),
  };
  const account = ActiveAccountKey.make(identity);
  const decoratedAccount = Object.assign(ActiveAccountKey.make(account), {
    name: 'Mutable profile name',
    active: true,
  });
  const id = Library.fields.id.make(1);
  const input = { account: decoratedAccount, id, extra: 'not query identity' };
  expect(listLibrariesAtom(decoratedAccount)).toBe(listLibrariesAtom(account));
  for (const family of [libraryAtom, libraryStoragePluginSettingsFormAtom]) {
    expect(family(input)).toBe(family({ account, id }));
    expect(family({ account, id: Library.fields.id.make(2) })).not.toBe(family(input));
  }
  for (const distinctAccount of [
    ActiveAccountKey.make({
      ...identity,
      serverUrl: Account.fields.serverUrl.make('https://other-library-keys.example.test'),
    }),
    ActiveAccountKey.make({ ...identity, userId: Account.fields.userId.make('other-reader') }),
    ActiveAccountKey.make({
      ...identity,
      authStorageId: Account.fields.authStorageId.make('other-sign-in'),
    }),
  ]) {
    expect(listLibrariesAtom(distinctAccount)).not.toBe(listLibrariesAtom(account));
    for (const family of [libraryAtom, libraryStoragePluginSettingsFormAtom]) {
      expect(family({ account: distinctAccount, id })).not.toBe(family({ account, id }));
    }
  }
});

// Route atom callbacks and service fibers through one drainable dispatcher.
// Draining runs queued work; it does not wait for SQL, network requests, or timers.
class TestScheduler extends Context.Service<TestScheduler>()(
  'voel/services/accounts/atoms.test/TestScheduler',
  {
    make: Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler();
      const dispatcher = scheduler.makeDispatcher();

      return {
        scheduler: {
          executionMode: scheduler.executionMode,
          shouldYield: (fiber) => scheduler.shouldYield(fiber),
          makeDispatcher: () => dispatcher,
        } satisfies Scheduler.Scheduler,
        scheduleTask: (task: () => void) => {
          let active = true;
          dispatcher.scheduleTask(() => {
            if (!active) {
              return;
            }

            active = false;
            task();
          }, 0);

          return () => {
            active = false;
          };
        },
        drainScheduler: Effect.sync(() => {
          dispatcher.flush();
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.unwrap(
    this.pipe(Effect.map(({ scheduler }) => Layer.succeed(Scheduler.Scheduler, scheduler)))
  ).pipe(Layer.provideMerge(Layer.effect(this, this.make)));
}

const TestAccountsAtomsLayer = Layer.fromBuild((memoMap, scope) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<
      | Layer.Success<ReturnType<typeof makeClientTestLayers>>
      | Layer.Success<typeof TestScheduler.layer>
    >();
    const { scheduleTask } = yield* TestScheduler;
    const registryLayer = AtomRegistry.layerOptions({
      initialValues: [
        Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
        Atom.initialValue(Atom.runtime.memoMap, memoMap),
      ],
      scheduleTask,
    });

    return yield* Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(
      Layer.provideMerge(registryLayer),
      (layer) => Layer.buildWithMemoMap(layer, memoMap, scope)
    );
  })
);

const makeAccountsAtomsTestLayer = () =>
  TestAccountsAtomsLayer.pipe(
    Layer.provideMerge(makeClientTestLayers()),
    Layer.provideMerge(TestScheduler.layer)
  );

const waitForSessionRequest = Effect.fnUntraced(function* (authClient: AuthClient['Service']) {
  const session = yield* authClient.getSession;
  if (!session.waiting) {
    return;
  }

  yield* authClient.sessionChanges.pipe(
    Stream.filter((state) => !state.waiting),
    Stream.runHead
  );
});

// A reused client can still hold its pre-sign-in result before Better Auth starts refetching.
const waitForAuthenticatedSession = (authClient: AuthClient['Service']) =>
  authClient.sessionChanges.pipe(
    Stream.filter(
      (session) =>
        AsyncResult.isSuccess(session) && !session.waiting && Option.isSome(session.value)
    ),
    Stream.runHead
  );

it.layer(TestServerControllerClient.layer)('library query atoms', (iit) => {
  iit.effect(
    'refreshes all mounted library queries on library invalidation',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const key = ActiveAccountKey.make(account);
        const { id } = yield* client.library.create({
          payload: {
            name: Library.fields.name.make('Before invalidation'),
            type: Library.fields.type.make('audiobook'),
            storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
          },
        });
        const list = listLibrariesAtom(key);
        const detail = libraryAtom({ account: key, id });
        const form = libraryStoragePluginSettingsFormAtom({ account: key, id });
        for (const query of [list, detail, form]) {
          yield* Atom.mount<Atom.Type<typeof query>>(query);
          yield* Atom.getResult<Atom.Success<typeof query>, Atom.Failure<typeof query>>(query);
        }
        const reads = [
          vi.spyOn(client.library, 'list'),
          vi.spyOn(client.library, 'get'),
          vi.spyOn(client.library, 'getStoragePluginSettingsForm'),
        ];
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const read of reads) {
              read.mockRestore();
            }
          })
        );

        yield* client.library.update({
          params: { id },
          payload: { name: Library.fields.name.make('After invalidation') },
        });
        yield* Reactivity.invalidate(['library']);
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({
          name: 'After invalidation',
        });
        expect(
          (yield* Atom.getResult(list, { suspendOnWaiting: true })).items.map(({ name }) => name)
        ).toEqual(['After invalidation']);
        expect(yield* Atom.getResult(form, { suspendOnWaiting: true })).toEqual([]);
        for (const read of reads) {
          expect(read).toHaveBeenCalled();
        }
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'revalidates stale queries on app focus but keeps a fresh list cached',
    Effect.fnUntraced(
      function* () {
        const events = vi.spyOn(AppState, 'addEventListener');
        const now = yield* Clock.currentTimeMillis.pipe(TestClock.withLive);
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            events.mockRestore();
            clock.mockRestore();
          })
        );
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const key = ActiveAccountKey.make(account);
        const { id } = yield* client.library.create({
          payload: {
            name: Library.fields.name.make('Focus library'),
            type: Library.fields.type.make('audiobook'),
            storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
          },
        });
        const list = listLibrariesAtom(key);
        const detail = libraryAtom({ account: key, id });
        const form = libraryStoragePluginSettingsFormAtom({ account: key, id });
        for (const query of [list, detail, form]) {
          yield* Atom.mount<Atom.Type<typeof query>>(query);
          yield* Atom.getResult<Atom.Success<typeof query>, Atom.Failure<typeof query>>(query);
        }
        const reads = [
          vi.spyOn(client.library, 'list'),
          vi.spyOn(client.library, 'get'),
          vi.spyOn(client.library, 'getStoragePluginSettingsForm'),
        ];
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const read of reads) {
              read.mockRestore();
            }
          })
        );
        const [, focus] = Option.getOrThrow(Array.last(events.mock.calls));
        yield* Effect.sync(() => {
          clock.mockReturnValue(now + 1);
          focus('background');
          focus('active');
        });
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({ id });
        yield* Atom.getResult(form, { suspendOnWaiting: true });
        expect(reads[0]).not.toHaveBeenCalled();
        expect(reads[1]).toHaveBeenCalled();
        expect(reads[2]).toHaveBeenCalled();

        yield* Effect.sync(() => {
          clock.mockReturnValue(now + 10_001);
          focus('background');
          focus('active');
        });
        expect((yield* Atom.getResult(list, { suspendOnWaiting: true })).items).toHaveLength(1);
        expect(reads[0]).toHaveBeenCalledWith({ query: { cursor: Option.none(), limit: 10 } });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'accumulates server pages, refreshes from the beginning, and reads details and settings forms',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const key = ActiveAccountKey.make(account);
        const list = listLibrariesAtom(key);
        yield* Atom.mount(list);
        expect(yield* Atom.getResult(list).pipe(Effect.flip)).toBeInstanceOf(
          Cause.NoSuchElementError
        );
        const input = {
          type: Library.fields.type.make('audiobook'),
          storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
        };
        const libraries = yield* Effect.forEach(
          Array.makeBy(11, (index) => `Library ${index + 1}`),
          (name) =>
            client.library.create({ payload: { ...input, name: Library.fields.name.make(name) } })
        );
        const read = vi.spyOn(client.library, 'list');
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            read.mockRestore();
          })
        );
        yield* Atom.refresh(list);
        const first = yield* Atom.getResult(list, { suspendOnWaiting: true });
        expect(first.items.map(({ id }) => id)).toEqual(libraries.slice(0, 10).map(({ id }) => id));
        expect(first.done).toBe(false);
        expect(read).toHaveBeenNthCalledWith(1, { query: { cursor: Option.none(), limit: 10 } });

        yield* Atom.set(list, void 0);
        const second = yield* Atom.getResult(list, { suspendOnWaiting: true });
        expect(second.items.map(({ id }) => id)).toEqual(libraries.map(({ id }) => id));
        expect(second.done).toBe(false);
        expect(read).toHaveBeenNthCalledWith(2, {
          query: {
            cursor: Option.some(Option.getOrThrow(Array.last(first.items)).id),
            limit: 10,
          },
        });
        yield* Atom.set(list, void 0);
        expect(yield* Atom.getResult(list, { suspendOnWaiting: true })).toEqual({
          items: second.items,
          done: true,
        });
        expect(read).toHaveBeenCalledTimes(2);

        yield* Atom.refresh(list);
        expect(yield* Atom.getResult(list, { suspendOnWaiting: true })).toEqual(first);
        expect(read).toHaveBeenNthCalledWith(3, { query: { cursor: Option.none(), limit: 10 } });
        const { id } = Option.getOrThrow(Option.fromNullishOr(libraries[0]));
        expect(yield* Atom.getResult(libraryAtom({ account: key, id }))).toMatchObject({
          ...input,
          id,
          name: 'Library 1',
          roots: [],
          storagePluginHealth: { status: 'unknown' },
        });
        expect(
          yield* Atom.getResult(libraryStoragePluginSettingsFormAtom({ account: key, id }))
        ).toEqual([]);
        const missingId = Library.fields.id.make(999_999);
        expect(
          yield* Atom.getResult(libraryAtom({ account: key, id: missingId })).pipe(Effect.flip)
        ).toBeInstanceOf(LibraryNotFoundError);
        expect(
          yield* Atom.getResult(
            libraryStoragePluginSettingsFormAtom({ account: key, id: missingId })
          ).pipe(Effect.flip)
        ).toBeInstanceOf(LibraryNotFoundError);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'keeps same-account results while refreshing, including after a failed refresh',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const { id } = yield* client.library.create({
          payload: {
            name: Library.fields.name.make('Refresh library'),
            type: Library.fields.type.make('audiobook'),
            storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
          },
        });
        const detail = libraryAtom({ account: ActiveAccountKey.make(account), id });
        yield* Atom.mount(detail);
        const original = yield* Atom.getResult(detail);
        yield* client.library.delete({ params: { id } });

        const release = yield* Deferred.make<boolean>();
        const { get: getLibrary } = client.library;
        const read = vi
          .spyOn(client.library, 'get')
          .mockImplementation((payload) =>
            Deferred.await(release).pipe(Effect.andThen(getLibrary(payload)))
          );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            read.mockRestore();
          })
        );
        yield* Atom.refresh(detail);
        const refreshing = yield* Atom.get(detail);
        expect(refreshing.waiting).toBe(true);
        expect(AsyncResult.value(refreshing)).toEqual(Option.some(original));
        expect(read).toHaveBeenCalledOnce();

        yield* Deferred.succeed(release, true);
        expect(
          yield* Atom.getResult(detail, { suspendOnWaiting: true }).pipe(Effect.flip)
        ).toBeInstanceOf(LibraryNotFoundError);
        expect(AsyncResult.value(yield* Atom.get(detail))).toEqual(Option.some(original));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'selects separate state for another server while its queries are pending',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [firstAccount] = yield* signInTestServerUsers(manager, firstServer);
        const firstClient = yield* ApiClientMap.use((clients) => clients.acquire(firstAccount));
        const input = {
          type: Library.fields.type.make('audiobook'),
          storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
        };
        const { id } = yield* firstClient.library.create({
          payload: {
            ...input,
            name: Library.fields.name.make('First server'),
          },
        });
        yield* Effect.forEach(
          Array.makeBy(10, (index) => `Extra ${index}`),
          (name) =>
            firstClient.library.create({
              payload: { ...input, name: Library.fields.name.make(name) },
            })
        );
        const firstKey = ActiveAccountKey.make(firstAccount);
        const list = listLibrariesAtom(firstKey);
        const detail = libraryAtom({ account: firstKey, id });
        const form = libraryStoragePluginSettingsFormAtom({ account: firstKey, id });
        const queries = [list, detail, form];

        const secondServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const release = yield* Deferred.make<boolean>();
        yield* manager.signInAccount({
          serverUrl: secondServer.serverUrl,
          username: secondServer.adminUsername,
          password: secondServer.password,
        });
        const secondKey = Option.getOrThrow(yield* manager.state);
        const secondClient = yield* ApiClientMap.use((clients) => clients.acquire(secondKey));
        const secondLibrary = yield* secondClient.library.create({
          payload: {
            ...input,
            name: Library.fields.name.make('Second server'),
          },
        });
        expect(secondLibrary.id).toBe(id);
        const {
          list: listLibraries,
          get: getLibrary,
          getStoragePluginSettingsForm: getForm,
        } = secondClient.library;
        const reads = [
          vi
            .spyOn(secondClient.library, 'list')
            .mockImplementation((payload) =>
              Deferred.await(release).pipe(Effect.andThen(listLibraries(payload)))
            ),
          vi
            .spyOn(secondClient.library, 'get')
            .mockImplementation((payload) =>
              Deferred.await(release).pipe(Effect.andThen(getLibrary(payload)))
            ),
          vi
            .spyOn(secondClient.library, 'getStoragePluginSettingsForm')
            .mockImplementation((payload) =>
              Deferred.await(release).pipe(Effect.andThen(getForm(payload)))
            ),
        ];
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const read of reads) {
              read.mockRestore();
            }
          })
        );

        for (const query of queries) {
          yield* Atom.mount<Atom.Type<typeof query>>(query);
          yield* Atom.getResult<Atom.Success<typeof query>, Atom.Failure<typeof query>>(query);
        }
        yield* Atom.set(list, void 0);
        expect((yield* Atom.getResult(list, { suspendOnWaiting: true })).items).toHaveLength(11);
        const secondList = listLibrariesAtom(secondKey);
        const secondDetail = libraryAtom({ account: secondKey, id });
        const secondForm = libraryStoragePluginSettingsFormAtom({ account: secondKey, id });
        expect(secondList).not.toBe(list);
        expect(secondDetail).not.toBe(detail);
        expect(secondForm).not.toBe(form);
        for (const query of [secondList, secondDetail, secondForm]) {
          yield* Atom.mount<Atom.Type<typeof query>>(query);
          const pending = yield* Atom.get<Atom.Type<typeof query>>(query);
          expect(pending.waiting).toBe(true);
          expect(
            AsyncResult.value<Atom.Success<typeof query>, Atom.Failure<typeof query>>(pending)
          ).toEqual(Option.none());
        }
        for (const read of reads) {
          expect(read).toHaveBeenCalled();
        }
        expect(reads[0]).toHaveBeenCalledWith({ query: { cursor: Option.none(), limit: 10 } });

        yield* Deferred.succeed(release, true);
        expect(yield* Atom.getResult(secondDetail, { suspendOnWaiting: true })).toMatchObject({
          id,
          name: 'Second server',
        });
        expect(
          (yield* Atom.getResult(secondList, { suspendOnWaiting: true })).items.map(
            ({ name }) => name
          )
        ).toEqual(['Second server']);
        expect(yield* Atom.getResult(secondForm, { suspendOnWaiting: true })).toEqual([]);
        expect(yield* Atom.getResult(detail)).toMatchObject({ name: 'First server' });
        expect((yield* Atom.getResult(list)).items).toHaveLength(11);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'isolates users and sign-in identities and preserves server authorization errors',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [admin, user] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(admin));
        const { id } = yield* client.library.create({
          payload: {
            name: Library.fields.name.make('Admin library'),
            type: Library.fields.type.make('audiobook'),
            storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
          },
        });
        const adminKey = ActiveAccountKey.make(admin);
        const adminList = listLibrariesAtom(adminKey);
        const adminDetail = libraryAtom({ account: adminKey, id });
        const adminForm = libraryStoragePluginSettingsFormAtom({ account: adminKey, id });
        expect(listLibrariesAtom(ActiveAccountKey.make(admin))).toBe(adminList);
        expect(libraryAtom({ account: ActiveAccountKey.make(admin), id })).toBe(adminDetail);
        expect(
          libraryStoragePluginSettingsFormAtom({ account: ActiveAccountKey.make(admin), id })
        ).toBe(adminForm);
        const adminQueries = [adminList, adminDetail, adminForm];
        for (const query of adminQueries) {
          yield* Atom.mount<Atom.Type<typeof query>>(query);
          yield* Atom.getResult<Atom.Success<typeof query>, Atom.Failure<typeof query>>(query);
        }

        const userKey = ActiveAccountKey.make(user);
        expect(listLibrariesAtom(userKey)).not.toBe(adminList);
        for (const query of [
          listLibrariesAtom(userKey),
          libraryAtom({ account: userKey, id }),
          libraryStoragePluginSettingsFormAtom({ account: userKey, id }),
        ]) {
          expect(
            yield* Atom.getResult<Atom.Success<typeof query>, Atom.Failure<typeof query>>(
              query
            ).pipe(Effect.flip)
          ).toBeInstanceOf(ForbiddenError);
          expect(
            AsyncResult.value<Atom.Success<typeof query>, Atom.Failure<typeof query>>(
              yield* Atom.get<Atom.Type<typeof query>>(query)
            )
          ).toEqual(Option.none());
        }

        yield* manager.signInAccount({
          serverUrl: server.serverUrl,
          username: server.adminUsername,
          password: server.password,
        });
        const newKey = Option.getOrThrow(yield* manager.state);
        const newDetail = libraryAtom({ account: newKey, id });
        expect(listLibrariesAtom(newKey)).not.toBe(adminList);
        expect(newDetail).not.toBe(adminDetail);
        expect(libraryStoragePluginSettingsFormAtom({ account: newKey, id })).not.toBe(adminForm);
        expect(yield* Atom.getResult(newDetail)).toMatchObject({ name: 'Admin library' });
        expect(yield* Atom.getResult(adminDetail)).toMatchObject({
          name: 'Admin library',
        });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('activeAccountApiClientAtom', (iit) => {
  iit.effect(
    'fails without an active account',
    Effect.fnUntraced(
      function* () {
        expect(yield* Atom.getResult(activeAccountApiClientAtom).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'selects the newly active client and clears it when the account is removed',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [admin, user] = yield* signInTestServerUsers(manager, server);
        yield* manager.setActiveAccount(admin);
        yield* Atom.mount(activeAccountApiClientAtom);
        const adminClient = yield* Atom.getResult(activeAccountApiClientAtom);
        expect(
          (yield* adminClient.library.list({ query: { cursor: Option.none(), limit: 10 } })).items
        ).toEqual([]);

        const observeClientChange = Effect.gen(function* () {
          const subscribed = yield* Deferred.make<true>();
          const next = yield* Atom.toStream(activeAccountApiClientAtom).pipe(
            Stream.tap(() => Deferred.succeed(subscribed, true)),
            Stream.drop(1),
            Stream.dropWhile((state) => state.waiting),
            Stream.runHead,
            Effect.forkChild
          );
          yield* Deferred.await(subscribed).pipe(Effect.timeout('10 seconds'), TestClock.withLive);
          return next;
        });
        const nextUserClient = yield* observeClientChange;
        yield* manager.setActiveAccount(user);
        const userClient = yield* AsyncResult.toExit(
          Option.getOrThrow(
            yield* Fiber.join(nextUserClient).pipe(Effect.timeout('10 seconds'), TestClock.withLive)
          )
        );
        expect(
          yield* userClient.library
            .list({ query: { cursor: Option.none(), limit: 10 } })
            .pipe(Effect.flip)
        ).toBeInstanceOf(ForbiddenError);

        const nextRemovedClient = yield* observeClientChange;
        yield* manager.removeActiveAccount;
        const removedClient = Option.getOrThrow(
          yield* Fiber.join(nextRemovedClient).pipe(
            Effect.timeout('10 seconds'),
            TestClock.withLive
          )
        );
        expect(yield* AsyncResult.toExit(removedClient).pipe(Effect.flip)).toBeInstanceOf(
          NoActiveAccountError
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('accountsAtom', (iit) => {
  iit.effect(
    'reacts to account table mutations',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsAtom)).toMatchObject([
          {
            serverUrl: testServer.serverUrl,
            username: account.username,
            active: true,
          },
        ]);

        yield* manager.removeActiveAccount;

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'returns persisted account rows with current active flags',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        expect(yield* Atom.getResult(accountsAtom)).toMatchObject([
          {
            serverUrl: testServer.serverUrl,
            username: firstAccount.username,
            active: false,
          },
          {
            serverUrl: testServer.serverUrl,
            username: secondAccount.username,
            active: true,
          },
        ]);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

describe('accountsSheetAtom', () => {
  it.effect(
    'shows onboarding and cannot be dismissed when there are no accounts',
    Effect.fnUntraced(
      function* () {
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Onboarding({ dismissable: false })
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  it.layer(TestServerControllerClient.layer)('with persisted accounts', (iit) => {
    iit.effect(
      'requires account selection and cannot be dismissed when no account is active',
      Effect.fnUntraced(
        function* () {
          const accountRepository = yield* AccountRepository;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({
            userCount: 1,
          });
          yield* signInTestServerUsers(manager, testServer);
          yield* accountRepository.deactivateAll();

          yield* Effect.gen(function* () {
            expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
              AccountsSheet.MustPickAccount({ dismissable: false })
            );
          }).pipe(
            Effect.provide(
              Layer.fresh(TestAccountsAtomsLayer).pipe(
                Layer.provideMerge(Layer.fresh(AccountManager.layerNoDeps))
              )
            )
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });

  describe('session states', () => {
    it.effect(
      'stays idle and dismissable while the session is pending',
      Effect.fnUntraced(
        function* () {
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          const { drainScheduler } = yield* TestScheduler;
          const manager = yield* AccountManager;
          const accountRepository = yield* AccountRepository;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://pending-session.example.test'),
            userId: Account.fields.userId.make('pending-session-id'),
            username: Account.fields.username.make('pending-session'),
            name: Account.fields.name.make('Pending Session'),
            email: Account.fields.email.make('pending-session@example.test'),
            authStorageId: Account.fields.authStorageId.make('pending-session-auth-storage'),
            role: Account.fields.role.make('user'),
            profilePicture: Account.fields.profilePicture.make(null),
            active: false,
          };
          yield* accountRepository.upsert(account);
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            const signal = input instanceof Request ? input.signal : init?.signal;
            if (signal === void 0) {
              throw new Error('Expected the get-session request to have an AbortSignal.');
            }

            return runPromise(Effect.never, {
              // @ts-expect-error - React Native's AbortSignal type omits DOM-only members.
              signal,
            });
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
          });

          const activeAccount = Option.getOrThrow(yield* manager.state);
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccount)
          );
          expect(yield* authClient.getSession).toMatchObject({
            _tag: 'Initial',
            waiting: true,
          });
          yield* drainScheduler;
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
            AccountsSheet.Idle({ dismissable: true })
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );

    it.effect(
      'stays idle and dismissable when the app starts offline',
      Effect.fnUntraced(
        function* () {
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          const { drainScheduler } = yield* TestScheduler;
          const manager = yield* AccountManager;
          const accountRepository = yield* AccountRepository;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://failed-session.example.test'),
            userId: Account.fields.userId.make('failed-session-id'),
            username: Account.fields.username.make('failed-session'),
            name: Account.fields.name.make('Failed Session'),
            email: Account.fields.email.make('failed-session@example.test'),
            authStorageId: Account.fields.authStorageId.make('failed-session-auth-storage'),
            role: Account.fields.role.make('user'),
            profilePicture: Account.fields.profilePicture.make(null),
            active: false,
          };
          yield* accountRepository.upsert(account);
          const getSessionResponse = yield* Deferred.make<Response, Error>();
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            return runPromise(Deferred.await(getSessionResponse));
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
          });
          const activeAccount = Option.getOrThrow(yield* manager.state);
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccount)
          );

          yield* Deferred.fail(getSessionResponse, new Error('get-session request failed'));
          yield* authClient.refreshSession({ query: { disableCookieCache: true } });
          yield* waitForSessionRequest(authClient);

          const failedSession = yield* authClient.getSession;
          expect(failedSession).toMatchObject({ _tag: 'Failure', waiting: false });
          expect(Option.isSome(AsyncResult.error(failedSession))).toBe(true);

          yield* drainScheduler;
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
            AccountsSheet.Idle({ dismissable: true })
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });
});

it.layer(TestServerControllerClient.layer)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'stays idle and dismissable when the session is valid',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });

        const activeAccount = Option.getOrThrow(yield* manager.state);
        const authClient = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(activeAccount)
        );
        yield* waitForAuthenticatedSession(authClient);
        const validSession = yield* authClient.getSession;
        expect(validSession).toMatchObject({ _tag: 'Success', waiting: false });
        expect(Option.isSome(Option.flatten(AsyncResult.value(validSession)))).toBe(true);

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'shows an invalid session and remains dismissable after session revocation',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        const activeAccount = Option.getOrThrow(yield* manager.state);
        const authClient = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(activeAccount)
        );
        yield* Atom.mount(accountsSheetAtom);
        yield* waitForAuthenticatedSession(authClient);
        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );

        const invalidSessionFiber = yield* authClient.sessionChanges.pipe(
          Stream.filter(
            (session) =>
              AsyncResult.isSuccess(session) && !session.waiting && Option.isNone(session.value)
          ),
          Stream.runHead,
          Effect.forkChild
        );
        const revokeResult = yield* authClient.signOut;
        expect(revokeResult).toBe(void 0);

        yield* authClient.refreshSession({ query: { disableCookieCache: true } });
        yield* Fiber.join(invalidSessionFiber);

        expect(
          yield* Atom.toStreamResult(accountsSheetAtom).pipe(
            Stream.filter(AccountsSheet.$is('InvalidSession')),
            Stream.runHead
          )
        ).toEqual(Option.some(AccountsSheet.InvalidSession({ dismissable: true })));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'observes the session of the newly active account after switching accounts',
    Effect.fnUntraced(
      function* () {
        const authClients = yield* AuthClientMap;
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: firstAccount.userId,
        });
        const firstClient = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(firstClient);

        yield* Atom.mount(accountsSheetAtom);
        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
        });
        const secondClient = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(secondClient);
        yield* secondClient.signOut;
        yield* secondClient.refreshSession({ query: { disableCookieCache: true } });

        expect(
          yield* Atom.toStreamResult(accountsSheetAtom).pipe(
            Stream.filter(AccountsSheet.$is('InvalidSession')),
            Stream.runHead
          )
        ).toEqual(Option.some(AccountsSheet.InvalidSession({ dismissable: true })));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'keeps using the same session when the active account is reselected',
    Effect.fnUntraced(
      function* () {
        const authClients = yield* AuthClientMap;
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);
        const client = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(client);

        yield* Atom.mount(accountsSheetAtom);
        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: account.userId,
        });

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );
        expect(yield* authClients.acquire(Option.getOrThrow(yield* manager.state))).toBe(client);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('listUsersAtom', (iit) => {
  iit.effect(
    'fails with NoActiveAccountError without an active account',
    Effect.fnUntraced(
      function* () {
        const error = yield* Atom.getResult(listUsersAtom).pipe(Effect.flip);

        expect(error).toBeInstanceOf(NoActiveAccountError);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads successive pages until all users are returned',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 12 });
        yield* manager.signInAccount({
          serverUrl: testServer.serverUrl,
          username: testServer.adminUsername,
          password: testServer.password,
        });
        yield* Atom.mount(listUsersAtom);

        const firstPage = yield* Atom.getResult(listUsersAtom, {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        yield* Atom.set(listUsersAtom, void 0);
        const allUsers = yield* Atom.getResult(listUsersAtom, {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        yield* Atom.set(listUsersAtom, void 0);
        expect(
          yield* Atom.getResult(listUsersAtom, {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });

        // Invalidation must restart pagination, not append
        // refreshed rows to the already accumulated pages.
        const target = allUsers.items.find((user) => user.username !== testServer.adminUsername);
        expect(target).toBeDefined();
        if (!target) {
          return;
        }
        yield* Atom.set(deleteServerUserAtom, { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const refreshed = yield* Atom.getResult(listUsersAtom, { suspendOnWaiting: true });
        expect(refreshed.items).toHaveLength(10);
        expect(refreshed.items.some((user) => user.id === target.id)).toBe(false);
        yield* Atom.set(listUsersAtom, void 0);
        const remaining = yield* Atom.getResult(listUsersAtom, { suspendOnWaiting: true });
        expect(remaining.items).toHaveLength(11);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads users from the newly active server after switching accounts',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        yield* Atom.mount(listUsersAtom);
        const firstResult = yield* Atom.getResult(listUsersAtom, { suspendOnWaiting: true });
        const firstUsernames = firstResult.items.map((user) => user.username);
        expect(firstUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          firstServer.usernames.sort((first, second) => first.localeCompare(second))
        );

        const secondServer = yield* setupTestServerWithUsers({ userCount: 6 });
        const subscribed = yield* Deferred.make<true>();
        const nextUsers = yield* Atom.toStream(listUsersAtom).pipe(
          Stream.tap(() => Deferred.succeed(subscribed, true)),
          Stream.drop(1),
          // A source switch must start a refresh, then publish its first completed result.
          Stream.dropWhile((state, index) => {
            if (index === 0) {
              expect(state.waiting).toBe(true);
            }
            return state.waiting;
          }),
          Stream.mapEffect(AsyncResult.toExit),
          Stream.runHead,
          Effect.forkChild
        );
        yield* Deferred.await(subscribed).pipe(Effect.timeout('10 seconds'), TestClock.withLive);
        yield* manager.signInAccount({
          serverUrl: secondServer.serverUrl,
          username: secondServer.adminUsername,
          password: secondServer.password,
        });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const secondResult = Option.getOrThrow(
          yield* Fiber.join(nextUsers).pipe(Effect.timeout('10 seconds'), TestClock.withLive)
        );
        const secondUsernames = secondResult.items.map((user) => user.username);
        expect(secondUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          secondServer.usernames.sort((first, second) => first.localeCompare(second))
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('auth query invalidation', (iit) => {
  iit.effect(
    'refreshes user queries after successful mutations, but not failed mutations',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        yield* manager.signInAccount({
          serverUrl: testServer.serverUrl,
          username: testServer.adminUsername,
          password: testServer.password,
        });
        const authClientKey = Option.getOrThrow(yield* manager.state);
        const client = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(authClientKey)
        );
        const users = yield* client.admin.listUsers({ limit: 10, offset: 0 });
        const target = Option.getOrThrow(
          Option.fromNullishOr(
            users.users.find((user) => user.username !== testServer.adminUsername)
          )
        );
        const currentUser = (yield* client.readSession).user;
        const detail = serverUserAtom(currentUser.id);
        yield* Atom.mount(detail);
        yield* Atom.mount(listUsersAtom);
        yield* Atom.getResult(detail, { suspendOnWaiting: true });
        yield* Atom.getResult(listUsersAtom, { suspendOnWaiting: true });
        const read = vi.spyOn(client.admin, 'getUser');
        const list = vi.spyOn(client.admin, 'listUsers');
        const { drainScheduler } = yield* TestScheduler;

        yield* Atom.set(deleteServerUserAtom, { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true });
        yield* drainScheduler;
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({
          id: currentUser.id,
        });
        const refreshed = yield* Atom.getResult(listUsersAtom, { suspendOnWaiting: true });
        expect(refreshed.items.some((user) => user.id === target.id)).toBe(false);
        expect(read).toHaveBeenCalled();
        expect(list).toHaveBeenCalled();
        read.mockClear();
        list.mockClear();

        yield* Atom.set(deleteServerUserAtom, {
          userId: Account.fields.userId.make('missing-user'),
        });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true }).pipe(Effect.flip);
        yield* drainScheduler;
        expect(read).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'revoking a device session refreshes both own and admin session queries',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);
        const client = yield* AuthClientMap.use((authClients) => authClients.acquire(account));
        const session = yield* client.readSession;
        const adminSessions = serverUserSessionsAtom(account.userId);
        yield* Atom.mount(ownSessionsAtom);
        yield* Atom.mount(adminSessions);
        expect(
          (yield* Atom.getResult(ownSessionsAtom, { suspendOnWaiting: true })).sessions.length
        ).toBeGreaterThan(1);
        yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        const other = (yield* client.listSessions).find((item) => item.id !== session.session.id);
        expect(other).toBeDefined();
        if (!other) {
          return;
        }

        yield* Atom.set(revokeOwnSessionAtom, { token: other.token });
        yield* Atom.getResult(revokeOwnSessionAtom, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const own = yield* Atom.getResult(ownSessionsAtom, { suspendOnWaiting: true });
        const admin = yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        expect(own.sessions.some((item) => item.id === other.id)).toBe(false);
        expect(admin.sessions.some((item) => item.id === other.id)).toBe(false);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('activeAccountAtom', (iit) => {
  iit.effect(
    'reflects an account created by AccountManager',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const serverUrl = yield* makeServerUrl;

        const manager = yield* AccountManager;
        yield* Atom.mount(activeAccountAtom);

        expect(yield* Atom.getResult(activeAccountAtom)).toBe(Option.none());

        const username = yield* makeUsername();

        const subscribed = yield* Deferred.make<true>();
        // This long-lived stream stays waiting; assert its very next result, not a matching value.
        const nextAccount = yield* Atom.toStream(activeAccountAtom).pipe(
          Stream.tap(() => Deferred.succeed(subscribed, true)),
          Stream.drop(1),
          Stream.mapEffect(AsyncResult.toExit),
          Stream.runHead,
          Effect.forkChild
        );
        yield* Deferred.await(subscribed).pipe(Effect.timeout('10 seconds'), TestClock.withLive);
        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        yield* drainScheduler;

        const activeAccount = Option.getOrThrow(
          Option.getOrThrow(
            yield* Fiber.join(nextAccount).pipe(Effect.timeout('10 seconds'), TestClock.withLive)
          )
        );

        expect(activeAccount).toMatchObject({
          serverUrl,
          username,
          active: true,
        });
        expect(DateTime.isUtc(activeAccount.createdAt)).toBe(true);
        expect(DateTime.isUtc(activeAccount.updatedAt)).toBe(true);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});
