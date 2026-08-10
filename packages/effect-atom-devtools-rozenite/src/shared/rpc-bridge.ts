import { Data } from 'effect';
import type { RpcMessage } from 'effect/unstable/rpc';

export const RPC_CLIENT_EVENT = 'effect-rpc:client';
export const RPC_SERVER_EVENT = 'effect-rpc:server';

export type RpcBridgeClientMessage = Data.TaggedEnum<{
  readonly Start: { readonly sessionId: string };
  readonly End: { readonly sessionId: string };
  readonly Request: {
    readonly sessionId: string;
    readonly message: RpcMessage.FromClientEncoded;
  };
}>;

export const RpcBridgeClientMessage = Data.taggedEnum<RpcBridgeClientMessage>();

export type RpcBridgeServerMessage = Data.TaggedEnum<{
  readonly Ready: { readonly serverId: string };
  readonly Response: {
    readonly sessionId: string;
    readonly message: RpcMessage.FromServerEncoded;
  };
}>;

export const RpcBridgeServerMessage = Data.taggedEnum<RpcBridgeServerMessage>();

// Rozenite's event-map constraint works with a closed type alias rather than an interface.
// oxlint-disable-next-line typescript/consistent-type-definitions
export type RpcBridgeEventMap = {
  readonly [RPC_CLIENT_EVENT]: RpcBridgeClientMessage;
  readonly [RPC_SERVER_EVENT]: RpcBridgeServerMessage;
};
