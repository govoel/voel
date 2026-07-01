import { PlatformError, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export const TestServerControllerApi = RpcGroup.make(
  Rpc.make('start', {
    payload: Schema.Struct({ port: Schema.Number }),
    success: Schema.Void,
    error: Schema.instanceOf(PlatformError.PlatformError),
  }),
  Rpc.make('stop', {
    payload: Schema.Struct({ port: Schema.Number }),
    success: Schema.Void,
    error: Schema.instanceOf(PlatformError.PlatformError),
  })
);
