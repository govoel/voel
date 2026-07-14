import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { Platform } from 'react-native';

import { TestServerControllerApi } from '#src/services/testing/server-controller/spec.ts';

export class TestServerControllerClient extends Context.Service<TestServerControllerClient>()(
  'voel/services/testing/server-controller/client/TestServerControllerClient',
  {
    make: Effect.gen(function* () {
      const client = yield* RpcClient.make(TestServerControllerApi);

      return {
        start: (args: Parameters<(typeof client)['start']>['0']) =>
          Effect.acquireRelease(
            client
              .start(args)
              .pipe(
                Effect.as(
                  Platform.OS === 'ios'
                    ? `http://localhost:${args.port}`
                    : `http://10.0.2.2:${args.port}`
                )
              ),
            () => client.stop(args).pipe(Effect.catch(() => Effect.void))
          ),
        stop: client.stop,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provideMerge(
      RpcClient.layerProtocolHttp({
        url:
          Platform.OS === 'ios' ? 'http://localhost:6000/api/rpc' : 'http://10.0.2.2:6000/api/rpc',
      })
    ),
    Layer.provideMerge(Layer.mergeAll(RpcSerialization.layerJson, FetchHttpClient.layer))
  );
}
