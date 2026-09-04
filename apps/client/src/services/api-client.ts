import { Effect, Layer, Option } from 'effect';
import { FetchHttpClient, Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { make as makeReactNativeTursoSyncClient } from '@repo/effect-turso-sync-rn';
import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { AuthClientMap, acquireAuthClient } from '#src/services/auth-client/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

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
            Effect.catchTags({ AuthClientGetCookieError: Effect.die }),
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

    return Layer.merge(
      AuthMiddlewareClientLayer,
      Layer.effect(
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
      )
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          AuthClientMap.layer,
          FetchHttpClient.layer,
          RpcSerialization.layerSchemaBinary({ fingerprintPayloads: true })
        ).pipe(
          Layer.provide(
            MainDatabase.layer.pipe(
              Layer.provide(TursoSyncClientFactory.layer(makeReactNativeTursoSyncClient))
            )
          )
        )
      )
    );
  },
}) {}
