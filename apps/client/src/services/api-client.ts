import { Layer, Option } from 'effect';
import { Headers as EffectHeaders, FetchHttpClient } from 'effect/unstable/http';
import { Atom, AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import type { VoelAuthClient } from '#src/services/auth-client.ts';
import { encodeServerUrl } from '#src/services/server-url.ts';
import type { ServerUrl } from '#src/services/server-url.ts';

export interface ApiClientConfig {
  readonly authClient: VoelAuthClient;
  readonly serverUrl: ServerUrl;
}

export const ApiClientConfigAtom = Atom.make<Option.Option<ApiClientConfig>>(Option.none()).pipe(
  Atom.keepAlive
);

const protocolLayer = ({ authClient, serverUrl }: ApiClientConfig) =>
  Layer.mergeAll(
    RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) => {
      const cookie = authClient.getCookie();

      return next({
        ...request,
        headers: EffectHeaders.merge(request.headers, EffectHeaders.fromInput({ cookie })),
      });
    }),
    RpcClient.layerProtocolHttp({ url: `${encodeServerUrl(serverUrl)}/api/rpc` }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerMsgPack)
    )
  );

export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: (get) =>
    protocolLayer(
      Option.getOrThrowWith(
        get(ApiClientConfigAtom),
        () => new Error('ApiClientConfigAtom must be configured before using ApiClient')
      )
    ),
}) {
  public static readonly initialConfig = (config: ApiClientConfig) =>
    Atom.initialValue(ApiClientConfigAtom, Option.some(config));
}
