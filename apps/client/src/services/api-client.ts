import { Effect, Layer, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountServerUrlAtom } from '#src/services/accounts/atoms.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { CommonExpoLayers } from '#src/services/layers.ts';

const AuthMiddlewareClientLive = RpcMiddleware.layerClient(
  AuthMiddleware,
  Effect.fnUntraced(function* ({ request, next }) {
    const currentAuthClient = yield* CurrentAuthClient;
    const cookie = yield* currentAuthClient.getCookie().pipe(Effect.option);

    return yield* next({
      ...request,
      headers: Option.match(cookie, {
        onNone: () => request.headers,
        onSome: (value) => Headers.set(request.headers, 'cookie', value),
      }),
    });
  })
);

// TODO: Call authClient to refresh session when an Unauthorized RPC response happens.
export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: (get) =>
    Layer.effect(
      RpcClient.Protocol,
      Effect.gen(function* () {
        const serverUrl = yield* get.result(activeAccountServerUrlAtom);
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(
            HttpClientRequest.prependUrl(
              Option.match(serverUrl, {
                onNone: () => '/api/rpc',
                onSome: (url) => `${url.toString()}/api/rpc`,
              })
            )
          )
        );

        return yield* RpcClient.makeProtocolHttp(client);
      })
    ).pipe(
      Layer.provideMerge(Layer.mergeAll(AuthMiddlewareClientLive, RpcSerialization.layerMsgPack)),
      Layer.provide(CommonExpoLayers)
    ),
}) {}
