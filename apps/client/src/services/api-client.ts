import { Effect, Layer, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountServerUrlAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { CommonExpoLayers } from '#src/services/layers.ts';

const AuthMiddlewareClientLive = RpcMiddleware.layerClient(
  AuthMiddleware,
  Effect.fnUntraced(function* ({ request, next }) {
    const accountManager = yield* AccountManager;

    const state = yield* accountManager.state;

    if (Option.isNone(state)) {
      return yield* next(request);
    }

    return yield* next({
      ...request,
      headers: Headers.set(request.headers, 'cookie', state.value.state.authClient.getCookie()),
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
