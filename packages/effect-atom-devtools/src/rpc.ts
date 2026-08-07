import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { FromGroup } from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AtomNotFound, AtomSnapshot, AtomSummary, StateNotFound } from '#src/atom-dev-tools.ts';

export const AtomCatalog = Schema.Array(AtomSummary);

const AtomIdPayload = Schema.Struct({ atomId: Schema.String });
const ActivateStateError = Schema.Union([AtomNotFound, StateNotFound]);
const MutationSuccess = Schema.Struct({});

export const AtomDevToolsRpc = RpcGroup.make(
  Rpc.make('Catalog', {
    success: AtomCatalog,
    stream: true,
  }),
  Rpc.make('GetAtom', {
    payload: AtomIdPayload,
    success: AtomSnapshot,
    error: AtomNotFound,
  }),
  Rpc.make('WatchAtom', {
    payload: AtomIdPayload,
    success: AtomSnapshot,
    error: AtomNotFound,
    stream: true,
  }),
  Rpc.make('ActivateState', {
    payload: {
      atomId: Schema.String,
      stateId: Schema.String,
    },
    success: MutationSuccess,
    error: ActivateStateError,
  }),
  Rpc.make('ClearState', {
    payload: AtomIdPayload,
    success: MutationSuccess,
    error: AtomNotFound,
  }),
  Rpc.make('ClearAllStates', {
    success: MutationSuccess,
  }),
  Rpc.make('RefreshAtom', {
    payload: AtomIdPayload,
    success: MutationSuccess,
    error: AtomNotFound,
  })
);

export type AtomDevToolsRpcClient = FromGroup<typeof AtomDevToolsRpc, RpcClientError>;

/**
 * Rozenite provides message framing, so RPC protocol envelopes can be sent as
 * event payloads without another serialization layer.
 */
export interface AtomDevToolsRpcEventMap extends Record<string, unknown> {
  readonly 'rpc-request': FromClientEncoded;
  readonly 'rpc-response': FromServerEncoded;
}
