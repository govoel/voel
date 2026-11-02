/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { ForbiddenError, UnauthorizedError } from '@repo/spec-api/domains/auth/http.ts';
import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiClient, ApiClientMap } from '#src/api-client.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/testing/utils.ts';

const createInput = (name: string) => ({
  name: Library.jsonCreate.fields.name.make(name),
  type: Library.jsonCreate.fields.type.make('movie'),
  storagePlugin: Library.jsonCreate.fields.storagePlugin.make('builtin:local'),
});

it.layer(TestServerControllerClient.layer)('API client', (iit) => {
  iit.effect(
    'keeps requests bound to their account and server when the active account changes',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const clients = yield* ApiClientMap;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [admin, user] = yield* signInTestServerUsers(manager, server);
        const adminClient = yield* clients.acquire(admin.key);
        const userClient = yield* clients.acquire(user.key);
        expect(
          yield* userClient.library
            .list({ query: { limit: 100, cursor: Option.none() } })
            .pipe(Effect.flip)
        ).toBeInstanceOf(ForbiddenError);

        yield* adminClient.library.create({ payload: createInput('First server') });
        const otherServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [otherAdmin] = yield* signInTestServerUsers(manager, otherServer);
        const otherClient = yield* clients.acquire(otherAdmin.key);
        yield* otherClient.library.create({ payload: createInput('Second server') });
        expect(
          (yield* otherClient.library.list({ query: { limit: 100, cursor: Option.none() } })).items
        ).toMatchObject([{ name: 'Second server' }]);
        expect(
          (yield* adminClient.library.list({ query: { limit: 100, cursor: Option.none() } })).items
        ).toMatchObject([{ name: 'First server' }]);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'rejects signed-out requests and resumes after reauthentication without recreating the client',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const client = yield* ApiClient.make(account.key);
        const authentication = yield* AuthClientMap.use((auth) => auth.acquire(account.key));
        yield* client.library.create({ payload: createInput('Movies') });
        const request = client.library.list({ query: { limit: 100, cursor: Option.none() } });
        expect((yield* request).items).toMatchObject([{ name: 'Movies' }]);

        yield* authentication.signOut;
        expect(yield* request.pipe(Effect.flip)).toBeInstanceOf(UnauthorizedError);
        yield* manager.signInAccount({
          serverUrl: server.serverUrl,
          username: server.adminUsername,
          password: server.password,
        });
        expect((yield* request).items).toMatchObject([{ name: 'Movies' }]);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
