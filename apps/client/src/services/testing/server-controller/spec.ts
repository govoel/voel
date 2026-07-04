import { PlatformError, Schema } from 'effect';
import { HttpClientError } from 'effect/unstable/http';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export const TestServerControllerApi = RpcGroup.make(
  Rpc.make('start', {
    payload: Schema.Struct({ port: Schema.Number }),
    success: Schema.Void,
    error: Schema.Union(
      [
        Schema.instanceOf(PlatformError.PlatformError),
        Schema.instanceOf(HttpClientError.HttpClientError),
      ],
      { mode: 'oneOf' }
    ),
  }),
  Rpc.make('stop', {
    payload: Schema.Struct({ port: Schema.Number }),
    success: Schema.Void,
    error: Schema.instanceOf(PlatformError.PlatformError),
  })
);
