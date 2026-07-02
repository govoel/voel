import { Context, Effect, Layer, Option, Random, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { expect, it } from '@repo/effect-react-native-harness';

import { makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';

const makeClientTestLayers = () =>
  CommonGlobalLayers.pipe(
    Layer.provideMerge(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    ),
    Layer.provideMerge(
      Layer.mergeAll(
        AuthClientStorage.layerTest,
        AppConfig.layerTest(),
        TestServerControllerClient.layer
      )
    )
  );

it.layer(makeClientTestLayers())('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'creates an account and sets it as the active account',
    Effect.fnUntraced(function* () {
      const port = yield* Random.nextIntBetween(49_152, 65_535);
      const serverUrl = yield* TestServerControllerClient.use((controller) =>
        controller.start({ port })
      ).pipe(Effect.map(Account.fields.serverUrl.make));

      const services = yield* Effect.context<AccountManager | MainDatabase>();
      const runtime = Atom.runtime(Layer.succeedContext(services));
      const { activeAccountAtom } = makeAccountsAtoms(runtime);

      const registry = AtomRegistry.make();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          registry.dispose();
        })
      );

      registry.mount(runtime);
      registry.mount(activeAccountAtom);

      expect(yield* AtomRegistry.getResult(registry, activeAccountAtom)).toBe(Option.none());

      const manager = yield* AtomRegistry.getResult(registry, runtime).pipe(
        Effect.map(Context.get(AccountManager))
      );

      const username = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );

      yield* manager.setupServerWithAccount({
        serverUrl,
        name: 'Test Admin',
        email: `${username}@voel.app`,
        username,
        password: Redacted.make('ha!niceTry'),
      });

      const activeAccount = yield* AtomRegistry.getResult(registry, activeAccountAtom).pipe(
        Effect.map(Option.map(({ account }) => account))
      );

      expect(activeAccount.valueOrUndefined).toMatchObject({
        serverUrl,
        username,
        active: 1,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });
    })
  );

  iit.todo('subscribes to authClient.useSession and emits session changes');

  iit.todo('does not resubscribe when AccountManager emits changes for the same auth client');
});
