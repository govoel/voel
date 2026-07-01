import { Context, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import { TestServerControllerApi } from '#src/services/testing/server-controller/spec.ts';

export class TestServerControllerClient extends Context.Service<TestServerControllerClient>()(
  'voel/services/testing/server-controller/client/TestServerControllerClient',
  { make: RpcClient.make(TestServerControllerApi) }
) {
  public static readonly layer = ({ url }: { url: string }) =>
    Layer.effect(this, this.make).pipe(
      Layer.provideMerge(RpcClient.layerProtocolHttp({ url })),
      Layer.provideMerge(Layer.mergeAll(RpcSerialization.layerJson, FetchHttpClient.layer))
    );
}
