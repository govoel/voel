/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer, Option, Redacted, Ref, Scope } from 'effect';
import { FetchHttpClient, HttpClientError } from 'effect/http';
import { TestClock } from 'effect/testing';

import { Library } from '@repo/spec-api/database/schema.ts';
import { LibraryNameConflictError, LibraryNotFoundError } from '@repo/spec-api/groups/library.ts';
import { ForbiddenError, UnauthorizedError } from '@repo/spec-api/middlewares/auth.ts';

import { AccountManager } from '#src/services/accounts/index.ts';
import { ApiClient, ApiClientMap } from '#src/services/api-client/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  makeServerUrl,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/services/testing/utils.ts';

const libraryInput = {
  name: Library.jsonCreate.fields.name.make('Audiobooks'),
  type: Library.jsonCreate.fields.type.make('audiobook'),
  storagePlugin: Library.jsonCreate.fields.storagePlugin.make('builtin:local'),
};
const listInput = { cursor: Option.none(), limit: 10 };

it.layer(TestServerControllerClient.layer)('API client', (iit) => {
  iit.effect(
    'keeps requests bound to their sign-in and server when the active account changes',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [admin, user] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(admin));
        const changedProfile = {
          serverUrl: admin.serverUrl,
          authStorageId: admin.authStorageId,
          name: 'Changed profile',
        };
        const profileClient = yield* ApiClientMap.use((clients) => clients.acquire(changedProfile));

        const library = yield* client.library.create({ payload: libraryInput });
        expect(yield* profileClient.library.get({ params: library })).toMatchObject(libraryInput);
        expect(
          yield* client.library.create({ payload: libraryInput }).pipe(Effect.flip)
        ).toBeInstanceOf(LibraryNameConflictError);
        expect(
          yield* client.library
            .get({ params: { id: Library.fields.id.make(999_999) } })
            .pipe(Effect.flip)
        ).toBeInstanceOf(LibraryNotFoundError);

        const userClient = yield* ApiClientMap.use((clients) => clients.acquire(user));
        expect(
          yield* userClient.library.list({ query: listInput }).pipe(Effect.flip)
        ).toBeInstanceOf(ForbiddenError);

        const otherServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [otherAdmin] = yield* signInTestServerUsers(manager, otherServer);
        const otherClient = yield* ApiClientMap.use((clients) => clients.acquire(otherAdmin));
        expect((yield* otherClient.library.list({ query: listInput })).items).toEqual([]);
        // Switching the active account must not retarget an already acquired client.
        expect((yield* client.library.list({ query: listInput })).items).toHaveLength(1);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'reads current credentials for every call, including sign-out and reauthentication',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const authentication = yield* AuthClientMap.use((clients) => clients.acquire(account));
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        yield* client.library.create({ payload: libraryInput });

        yield* authentication.signOut;
        expect(yield* client.library.list({ query: listInput }).pipe(Effect.flip)).toBeInstanceOf(
          UnauthorizedError
        );

        yield* authentication.signIn.username({
          username: server.adminUsername,
          password: Redacted.value(server.password),
        });
        expect((yield* client.library.list({ query: listInput })).items).toHaveLength(1);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect.each(['invalid credentials', 'credential read failure'] as const)(
    'reports %s through the client error channel',
    (failure) =>
      Effect.gen(function* () {
        const failReads = yield* Ref.make(false);
        const items = new Map<string, string>();
        const storageLayer = Layer.unwrap(
          Effect.gen(function* () {
            const storage = yield* AuthClientStorage.make({
              getItem: (key) => items.get(key) ?? null,
              setItem: (key, value) => {
                items.set(key, value);
              },
              removeItem: async (key) => {
                items.delete(key);
              },
            });
            return Layer.mock(AuthClientStorage, {
              ...storage,
              getItem: (key) =>
                Ref.get(failReads).pipe(
                  Effect.flatMap((fail) => {
                    if (!fail) {
                      return storage.getItem(key);
                    }
                    if (failure === 'invalid credentials') {
                      return Effect.succeedSome(
                        JSON.stringify({
                          'auth.session_token': { value: 'invalid', expires: null },
                        })
                      );
                    }
                    return Effect.die(new Error('Storage unavailable'));
                  })
                ),
            });
          })
        );

        yield* Effect.gen(function* () {
          const manager = yield* AccountManager;
          const server = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, server);
          const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
          yield* Ref.set(failReads, true);

          const error = yield* client.library.list({ query: listInput }).pipe(Effect.flip);
          if (failure === 'invalid credentials') {
            expect(error).toBeInstanceOf(UnauthorizedError);
          } else {
            expect(error).toBeInstanceOf(HttpClientError.HttpClientError);
            expect(error).toMatchObject({
              reason: {
                _tag: 'TransportError',
                description: 'Unable to read API authentication credentials',
              },
            });
          }
        }).pipe(Effect.provide(makeClientTestLayers({ authClientStorageLayer: storageLayer })));
      })
  );

  iit.effect(
    'aborts the HTTP request when its caller is interrupted',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const started = yield* Deferred.make<InstanceType<typeof globalThis.Request>['signal']>();
        const runPromise = Effect.runPromiseWith(yield* Effect.context());
        const network = Object.assign(
          async (...[input, init]: Parameters<typeof globalThis.fetch>) => {
            const request = input instanceof Request ? input : new Request(input.toString(), init);
            return runPromise(
              Effect.gen(function* () {
                yield* Deferred.succeed(started, request.signal);
                return yield* Effect.callback<Response, DOMException>((resume) => {
                  request.signal.addEventListener(
                    'abort',
                    () => {
                      resume(Effect.fail(new DOMException('Aborted', 'AbortError')));
                    },
                    { once: true }
                  );
                });
              })
            );
          },
          { preconnect: () => void 0 }
        ) satisfies typeof globalThis.fetch;
        const client = yield* ApiClient.make(account).pipe(
          Effect.provide(
            FetchHttpClient.layer.pipe(
              Layer.fresh,
              Layer.provide(Layer.succeed(FetchHttpClient.Fetch, network))
            )
          )
        );
        const request = yield* client.library
          .list({ query: listInput })
          .pipe(Effect.forkScoped({ startImmediately: true }));
        const signal = yield* Deferred.await(started).pipe(
          Effect.timeout('10 seconds'),
          TestClock.withLive
        );
        expect(signal.aborted).toBe(false);
        yield* Fiber.interrupt(request);
        expect(signal.aborted).toBe(true);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'preserves HTTP transport errors when the server is unavailable',
    Effect.fnUntraced(
      function* () {
        const serverScope = yield* Scope.fork(yield* Effect.scope);
        const serverUrl = yield* makeServerUrl.pipe(Scope.provide(serverScope));
        const manager = yield* AccountManager;
        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Admin',
          email: 'admin@voel.app',
          username: 'admin',
          password: Redacted.make('password'),
        });
        const account = Option.getOrThrow(yield* manager.state);
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        yield* client.library.list({ query: listInput });
        yield* Scope.close(serverScope, Exit.void);
        const error = yield* client.library.list({ query: listInput }).pipe(Effect.flip);
        expect(error).toBeInstanceOf(HttpClientError.HttpClientError);
        expect(error).toMatchObject({ reason: { _tag: 'TransportError' } });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
