import type { RpcMessage } from 'effect/unstable/rpc';

export const RPC_REQUEST_EVENT = 'effect-rpc:request';
export const RPC_RESPONSE_EVENT = 'effect-rpc:response';

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
export type RpcBridgeEventMap = {
  readonly [RPC_REQUEST_EVENT]: RpcMessage.FromClientEncoded;
  readonly [RPC_RESPONSE_EVENT]: RpcMessage.FromServerEncoded;
};
