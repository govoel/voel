import { Context, Effect, Layer, Option, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { expect, it } from '@repo/effect-react-native-harness';

import { makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';

const makeClientTestLayers = () =>
  CommonGlobalLayers.pipe(
    Layer.provideMerge(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    ),
    Layer.provideMerge(Layer.mergeAll(AuthClientStorage.layerTest, AppConfig.layerTest()))
  );

it.layer(makeClientTestLayers())('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'creates an account and sets it as the active account',
    Effect.fnUntraced(function* () {
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

      const context = yield* AtomRegistry.getResult(registry, runtime);

      const manager = Context.get(context, AccountManager);

      yield* manager.setupServerWithAccount({
        serverUrl: Account.fields.serverUrl.make('http://test/'),
        name: 'Test Admin',
        email: 'test.admin@voel.app',
        username: Account.fields.username.make('test.admin'),
        password: Redacted.make('ha!niceTry'),
      });

      expect(
        yield* AtomRegistry.getResult(registry, activeAccountAtom).pipe(
          Effect.map(Option.map(({ account }) => account)),
          Effect.map(({ valueOrUndefined }) => valueOrUndefined)
        )
      ).toMatchObject({
        serverUrl: 'http://test/',
        username: 'test.admin',
        active: 1,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });
    })
  );

  iit.todo('subscribes to authClient.useSession and emits session changes');

  iit.todo('does not resubscribe when AccountManager emits changes for the same auth client');
});
