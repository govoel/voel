/* oxlint-disable effecttsgo/strict-effect-provide -- test utilities construct isolated clients */
import { Array, Effect, Layer, Option, Predicate, Random, Redacted } from 'effect';
import type { Types } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { AppConfig } from '#src/config.ts';
import { TursoSyncClientFactoryBunLayer } from '#src/database/factory/bun.ts';
import { MainDatabaseTestLayer } from '#src/database/main/testing.ts';
import { CryptoDigest } from '#src/domains/accounts/auth-client/crypto-digest.ts';
import { AuthClient, AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { Encryption } from '#src/domains/accounts/encryption/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import { LibraryDatabaseMap } from '#src/domains/library/database.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';

export const makeClientTestLayers = ({
  config,
  accountRepositoryLayer = AccountRepository.layerNoDeps,
}: {
  readonly config?: Parameters<typeof AppConfig.layerTest>[0];
  readonly accountRepositoryLayer?: typeof AccountRepository.layerNoDeps;
} = {}) =>
  Layer.mergeAll(AccountManager.layerNoDeps, LibraryDatabaseMap.layerNoDeps).pipe(
    Layer.provideMerge(AuthClientMap.layerNoDeps),
    Layer.provideMerge(accountRepositoryLayer),
    Layer.provideMerge(MainDatabaseTestLayer),
    Layer.provideMerge(
      Layer.mergeAll(
        Encryption.layerTest,
        CryptoDigest.layerTest,
        AppConfig.layerTest(config),
        Reactivity.layer,
        TursoSyncClientFactoryBunLayer
      )
    )
  );

export const makeServerUrl = TestServerControllerClient.pipe(
  Effect.flatMap((controller) => controller.start)
);

export const makeUsername = (prefix = 'test.user') =>
  Random.nextInt.pipe(
    Effect.map((suffix) => Account.fields.username.make(`${prefix}.${Math.abs(suffix)}`))
  );

export const makeAuthClient = Effect.fnUntraced(function* ({
  serverUrl,
}: Pick<AccountKey, 'serverUrl'>) {
  return yield* AuthClient.makeTemporary({ serverUrl });
});

interface TestServer<UserCount extends number> {
  readonly adminUsername: Account['username'];
  readonly password: Redacted.Redacted;
  readonly serverUrl: AccountKey['serverUrl'];
  readonly userCount: UserCount;
  readonly usernames: Types.TupleOf<UserCount, Account['username']>;
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
        role: Account.fields.role.make('user'),
        username,
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
  const accountRepository = yield* AccountRepository;
  const accounts = yield* Effect.forEach(
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- seems like a false positive
    usernames,
    Effect.fnUntraced(function* (username) {
      yield* manager.signInAccount({ serverUrl, username, password });
      const activeAccountKey = Option.getOrThrow(yield* manager.state);
      return yield* accountRepository.getByKey(activeAccountKey);
    })
  );

  if (!Predicate.isTupleOf(accounts, userCount)) {
    return yield* Effect.die(new Error('Signed in an unexpected number of test users'));
  }

  return accounts;
});
