import { Context, Effect, Layer, LayerMap, Option } from 'effect';
import { Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';
import type { RpcClientError, RpcGroup } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';

export class AccountApiClient extends Context.Service<
  AccountApiClient,
  RpcClient.RpcClient.Flat<RpcGroup.Rpcs<typeof Api>, RpcClientError.RpcClientError>
>()('voel/services/account-api-client/AccountApiClient') {
  public static readonly layer = (key: ActiveAccountKey) => {
    const AuthMiddlewareLive = RpcMiddleware.layerClient(
      AuthMiddleware,
      Effect.gen(function* () {
        const authClient = yield* acquireAuthClient(key);
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

    const ProtocolLive = Layer.effect(
      RpcClient.Protocol,
      Effect.gen(function* () {
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(`${key.serverUrl.toString()}/api/rpc`))
        );
        return yield* RpcClient.makeProtocolHttp(client);
      })
    );

    const ReadyProtocolLive = ProtocolLive.pipe(Layer.provide(RpcSerialization.layerMsgPack));

    return Layer.effect(AccountApiClient, RpcClient.make(Api, { flatten: true })).pipe(
      Layer.provide(Layer.mergeAll(AuthMiddlewareLive, ReadyProtocolLive))
    );
  };
}

export class AccountApiClientMap extends LayerMap.Service<AccountApiClientMap>()(
  'voel/services/account-api-client/AccountApiClientMap',
  { lookup: (key: ActiveAccountKey) => AccountApiClient.layer(key) }
) {}

export const acquireAccountApiClient = (key: ActiveAccountKey) =>
  AccountApiClientMap.contextEffect(key).pipe(Effect.map(Context.get(AccountApiClient)));
