import { Context, Layer } from 'effect';
import { Headers as EffectHeaders, FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';
import type { RpcGroup } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import type { VoelAuthClient } from '#src/services/auth-client.ts';
import { encodeServerUrl } from '#src/services/server-url.ts';
import type { ServerUrl } from '#src/services/server-url.ts';

export class ApiClient extends Context.Service<
  ApiClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof Api>, RpcClientError>
>()('voel/services/api-client/ApiClient', {
  make: RpcClient.make(Api),
}) {
  public static readonly layer = ({
    authClient,
    serverUrl,
  }: {
    readonly authClient: VoelAuthClient;
    readonly serverUrl: ServerUrl;
  }) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) => {
          const cookie = authClient.getCookie();

          return next({
            ...request,
            headers: EffectHeaders.merge(request.headers, EffectHeaders.fromInput({ cookie })),
          });
        })
      ),
      Layer.provide(RpcClient.layerProtocolHttp({ url: `${encodeServerUrl(serverUrl)}/api/rpc` })),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerMsgPack)
    );
}
