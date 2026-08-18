/* oxlint-disable effecttsgo/strict-effect-provide -- test utilities construct isolated clients */
import { Array, Effect, Layer, Option, Predicate, Random, Redacted } from 'effect';
import type { Types } from 'effect';

import type { Selectable } from '@repo/effect-kysely';

import { UuidGenerator } from '#src/services/accounts/index.ts';
import type { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClient, AuthClientKey } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';
import { MainDatabaseTestLayer } from '#src/services/database/main/testing.ts';
import { AppRuntimeLayerNoDeps } from '#src/services/runtime.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';

export const makeClientTestLayers = (authClientStorageMap = new Map<string, string>()) =>
  AppRuntimeLayerNoDeps.pipe(
    Layer.provideMerge(MainDatabaseTestLayer),
    Layer.provideMerge(
      Layer.mergeAll(
        AuthClientStorage.layerTest(authClientStorageMap),
        UuidGenerator.layerTest,
        XxHash.layerTest,
        AppConfig.layerTest()
      )
    )
  );

export const makeServerUrl = Effect.gen(function* () {
  const port = yield* Random.nextIntBetween(49_152, 65_535);
  return yield* TestServerControllerClient.use((controller) => controller.start({ port })).pipe(
    Effect.map((url) => Account.fields.serverUrl.make(url))
  );
});

export const makeUsername = (prefix = 'test.user') =>
  Random.nextInt.pipe(
    Effect.map((suffix) => Account.fields.username.make(`${prefix}.${Math.abs(suffix)}`))
  );

export const makeAuthClient = Effect.fnUntraced(function* ({
  serverUrl,
}: Pick<Selectable<AccountTable>, 'serverUrl'>) {
  const uuidGenerator = yield* UuidGenerator;
  const authStorageId = Account.fields.authStorageId.make(yield* uuidGenerator.v4);
  const storage = new Map<string, string>();

  return yield* AuthClient.pipe(
    Effect.provide(
      AuthClient.layerNoDeps(new AuthClientKey({ serverUrl, authStorageId })).pipe(
        Layer.provide(Layer.mergeAll(AuthClientStorage.layerTest(storage), XxHash.layerTest))
      )
    )
  );
});

interface TestServer<UserCount extends number> {
  readonly adminUsername: Selectable<AccountTable>['username'];
  readonly password: Redacted.Redacted;
  readonly serverUrl: Selectable<AccountTable>['serverUrl'];
  readonly userCount: UserCount;
  readonly usernames: Types.TupleOf<UserCount, Selectable<AccountTable>['username']>;
}

export const setupTestServerWithUsers = Effect.fnUntraced(function* <
  const UserCount extends number,
>({ userCount }: { readonly userCount: UserCount }) {
  const serverUrl = yield* makeServerUrl;
  const password = Redacted.make('ha!niceTry');
  const usernames = yield* Effect.forEach(
    Array.makeBy(userCount, (index) => index),
    (index) => makeUsername(index === 0 ? 'test.admin' : `test.user.${index}`)
  );
  const adminUsername = Array.headNonEmpty(usernames);
  const adminAuthClient = yield* makeAuthClient({ serverUrl });

  yield* adminAuthClient.signUp.email({
    name: 'Test Admin',
    email: `${adminUsername}@voel.app`,
    username: adminUsername,
    password: Redacted.value(password),
  });

  yield* Effect.forEach(
    Array.tailNonEmpty(usernames),
    Effect.fnUntraced(function* (username, index) {
      yield* adminAuthClient.admin.createUser({
        name: `Test User ${index + 1}`,
        email: `${username}@voel.app`,
        password: Redacted.value(password),
        role: 'user',
        data: { username },
      });
      return void 0;
    }),
    { discard: true, concurrency: 'unbounded' }
  );

  if (!Predicate.isTupleOf(usernames, userCount)) {
    return yield* Effect.die(new Error('Created an unexpected number of test users'));
  }

  return {
    adminUsername,
    password,
    serverUrl,
    userCount,
    usernames,
  } satisfies TestServer<UserCount>;
});

export const signInTestServerUsers = Effect.fnUntraced(function* <const UserCount extends number>(
  manager: AccountManager['Service'],
  { password, serverUrl, userCount, usernames }: TestServer<UserCount>
) {
  const db = yield* MainDatabase;
  const accounts = yield* Effect.forEach(
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- seems like a false positive
    usernames,
    Effect.fnUntraced(function* (username) {
      yield* manager.signInAccount({ serverUrl, username, password });
      const activeAccountKey = Option.getOrThrow(yield* manager.state);
      return yield* db.executeTakeFirstOrError(
        db
          .selectFrom('account')
          .where('serverUrl', '=', activeAccountKey.serverUrl)
          .where('userId', '=', activeAccountKey.userId)
          .selectAll()
      );
    })
  );

  if (!Predicate.isTupleOf(accounts, userCount)) {
    return yield* Effect.die(new Error('Signed in an unexpected number of test users'));
  }

  return accounts;
});
