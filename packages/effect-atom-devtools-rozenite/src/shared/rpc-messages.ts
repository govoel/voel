import type { RpcMessage } from 'effect/unstable/rpc';

export const EFFECT_RPC_REQUEST_MESSAGE = 'effect-rpc:request';
export const EFFECT_RPC_RESPONSE_MESSAGE = 'effect-rpc:response';

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
export type EffectRpcEventMap = {
  readonly [EFFECT_RPC_REQUEST_MESSAGE]: RpcMessage.FromClientEncoded;
  readonly [EFFECT_RPC_RESPONSE_MESSAGE]: RpcMessage.FromServerEncoded;
};
