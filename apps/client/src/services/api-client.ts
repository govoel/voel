import { Effect, Layer, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { CommonClientLayers } from '#src/services/layers.ts';

const AuthMiddlewareClientLive = RpcMiddleware.layerClient(
  AuthMiddleware,
  Effect.fnUntraced(function* ({ request, next }) {
    const accountState = yield* AccountManager.pipe(Effect.flatMap((manager) => manager.state));
    const cookie = yield* Option.match(accountState, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: ({ account }) =>
        acquireAuthClient(account).pipe(
          Effect.flatMap((authClient) => authClient.getCookie()),
          Effect.catchTag('BetterAuthClientInitializationError', () =>
            Effect.succeed(Option.none())
          )
        ),
    });

    return yield* next({
      ...request,
      headers: Option.match(cookie, {
        onNone: () => request.headers,
        onSome: (value) => Headers.set(request.headers, 'cookie', value),
      }),
    });
  }, Effect.scoped)
);

// TODO: Call authClient to refresh the session after an unauthorized RPC response.
export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: (get) =>
    Layer.effect(
      RpcClient.Protocol,
      Effect.gen(function* () {
        const serverUrl = yield* get.result(activeAccountAtom).pipe(
          Effect.map(
            Option.match({
              onNone: () => '/api/rpc',
              onSome: ({ account }) => `${account.serverUrl.toString()}/api/rpc`,
            })
          )
        );
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(serverUrl))
        );

        return yield* RpcClient.makeProtocolHttp(client);
      })
    ).pipe(
      Layer.provideMerge(Layer.mergeAll(AuthMiddlewareClientLive, RpcSerialization.layerMsgPack)),
      Layer.provide(CommonClientLayers)
    ),
}) {}
