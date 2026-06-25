import { expect, it, vi } from '@effect/vitest';
import { Context, Effect, Layer, Option, Redacted } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { AllRoutes } from '@repo/server';
import { ApiConfig } from '@repo/server/services/config.ts';

import { makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';

const makeServerTestLayers = () =>
  Layer.mergeAll(
    Layer.effectDiscard(
      Effect.gen(function* () {
        const { handler, dispose } = HttpRouter.toWebHandler(
          AllRoutes.pipe(
            Layer.provide(Layer.mergeAll(HttpServer.layerServices, ApiConfig.layerTest()))
          )
        );
        yield* Effect.addFinalizer(() => Effect.tryPromise(async () => dispose()));

        vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
          const request = input instanceof Request ? input : new Request(String(input), init);
          return handler(request);
        });
        yield* Effect.addFinalizer(() => Effect.sync(() => vi.unstubAllGlobals()));
      })
    )
  );

const makeClientTestLayers = () =>
  Layer.mergeAll(CommonGlobalLayers).pipe(
    Layer.provideMerge(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layerTest({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    ),
    Layer.provideMerge(AppConfig.layerTest())
  );

it.layer(Layer.mergeAll(makeServerTestLayers(), makeClientTestLayers()))(
  'activeAccountSessionAtom',
  (iit) => {
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

        expect(
          yield* AtomRegistry.getResult(registry, activeAccountAtom, { suspendOnWaiting: true })
        ).toBe(Option.none());

        const context = yield* AtomRegistry.getResult(registry, runtime, {
          suspendOnWaiting: true,
        });

        const manager = Context.get(context, AccountManager);

        yield* manager.setupServerWithAccount({
          serverUrl: Account.fields.serverUrl.make('http://test/'),
          name: 'Test Admin',
          email: 'test.admin@voel.app',
          username: Account.fields.username.make('test.admin'),
          password: Redacted.make('ha!niceTry'),
        });

        expect(
          yield* AtomRegistry.getResult(registry, activeAccountAtom, {
            suspendOnWaiting: true,
          }).pipe(Effect.map(Option.map(({ account }) => account)))
        );
      })
    );

    iit.todo('subscribes to authClient.useSession and emits session changes');

    iit.todo('does not resubscribe when AccountManager emits changes for the same auth client');
  }
);
