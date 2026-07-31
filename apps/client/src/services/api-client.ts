import { Effect, Layer, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountAtom, activeAuthClientLayer } from '#src/services/accounts/atoms.ts';
import { AuthClient } from '#src/services/auth-client/service.ts';
import { CommonClientLayers } from '#src/services/layers.ts';

const AuthMiddlewareClientLive = RpcMiddleware.layerClient(
  AuthMiddleware,
  Effect.fnUntraced(function* ({ request, next }) {
    const authClient = yield* AuthClient;
    const cookie = yield* authClient.getCookie.pipe(Effect.option);

    return yield* next({
      ...request,
      headers: Option.match(cookie, {
        onNone: () => request.headers,
        onSome: (value) => Headers.set(request.headers, 'cookie', value),
      }),
    });
  })
);

// TODO: Call authClient to refresh the session after an unauthorized RPC response.
export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: (get) => {
    const activeAccount = get.result(activeAccountAtom);
    return Layer.effect(
      RpcClient.Protocol,
      Effect.gen(function* () {
        const serverUrl = yield* activeAccount.pipe(
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
      Layer.provide(activeAuthClientLayer(activeAccount)),
      Layer.provide(CommonClientLayers)
    );
  },
}) {}
