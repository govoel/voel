import { Data } from 'effect';
import type { RpcMessage } from 'effect/unstable/rpc';

export const RPC_CLIENT_EVENT = 'effect-rpc:client';
export const RPC_RESPONSE_EVENT = 'effect-rpc:response';

export type RpcBridgeClientMessage = Data.TaggedEnum<{
  readonly Start: { readonly sessionId: string };
  readonly End: { readonly sessionId: string };
  readonly Request: {
    readonly sessionId: string;
    readonly message: RpcMessage.FromClientEncoded;
  };
}>;

export const RpcBridgeClientMessage = Data.taggedEnum<RpcBridgeClientMessage>();

export interface RpcBridgeResponse {
  readonly sessionId: string;
  readonly message: RpcMessage.FromServerEncoded;
}

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
export type RpcBridgeEventMap = {
  readonly [RPC_CLIENT_EVENT]: RpcBridgeClientMessage;
  readonly [RPC_RESPONSE_EVENT]: RpcBridgeResponse;
};
