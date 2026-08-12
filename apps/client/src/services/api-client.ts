import { Effect, Layer, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { CommonClientLayers } from '#src/services/layers.ts';

export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: (get) => {
    const activeAccountKey = get.result(activeAccountKeyAtom);

    const AuthMiddlewareClientLayer = RpcMiddleware.layerClient(
      AuthMiddleware,
      Effect.gen(function* () {
        const accountKey = yield* activeAccountKey;

        if (Option.isNone(accountKey)) {
          return ({ request, next }) => next(request);
        }

        const authClient = yield* acquireAuthClient(accountKey.value);

        return ({ request, next }) =>
          authClient.getCookie.pipe(
            Effect.flatMap((cookie) =>
              next({
                ...request,
                headers: Option.match(cookie, {
                  onNone: () => request.headers,
                  onSome: (value) => Headers.set(request.headers, 'cookie', value),
                }),
              })
            )
          );
      })
    );

    return Layer.effect(
      RpcClient.Protocol,
      Effect.gen(function* () {
        const serverUrl = yield* activeAccountKey.pipe(
          Effect.map(
            Option.match({
              onNone: () => '/api/rpc',
              onSome: (accountKey) => `${accountKey.serverUrl.toString()}/api/rpc`,
            })
          )
        );
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(serverUrl))
        );

        return yield* RpcClient.makeProtocolHttp(client);
      })
    ).pipe(
      Layer.provideMerge(Layer.mergeAll(AuthMiddlewareClientLayer, RpcSerialization.layerMsgPack)),
      Layer.provide(CommonClientLayers)
    );
  },
}) {}
