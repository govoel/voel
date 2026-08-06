import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { FromGroup } from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';

import { AtomNotFound, AtomSnapshot, AtomSummary, StateNotFound } from '#src/atom-dev-tools.ts';

export const ListAtomsPayload = Schema.Struct({
  query: Schema.optionalKey(Schema.String),
  writable: Schema.optionalKey(Schema.Boolean),
  overridden: Schema.optionalKey(Schema.Boolean),
  cursor: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
});
export type ListAtomsPayload = typeof ListAtomsPayload.Type;

export const AtomSummaryEncoded = AtomSummary.toEncoded;
export type AtomSummaryEncoded = typeof AtomSummaryEncoded.Type;

export const AtomSnapshotEncoded = AtomSnapshot.toEncoded;
export type AtomSnapshotEncoded = typeof AtomSnapshotEncoded.Type;

export const AtomCatalog = Schema.Array(AtomSummaryEncoded);

export const AtomPage = Schema.Struct({
  items: Schema.Array(AtomSummaryEncoded),
  total: Schema.Int,
  nextCursor: Schema.optionalKey(Schema.String),
});
export type AtomPage = typeof AtomPage.Type;

const AtomIdPayload = Schema.Struct({ atomId: Schema.String });
const MutationError = Schema.Union([AtomNotFound, StateNotFound]);
const MutationSuccess = Schema.Struct({});

export const AtomDevToolsRpc = RpcGroup.make(
  Rpc.make('GetCatalog', {
    success: AtomCatalog,
  }),
  Rpc.make('Catalog', {
    success: AtomCatalog,
    stream: true,
  }),
  Rpc.make('ListAtoms', {
    payload: ListAtomsPayload,
    success: AtomPage,
  }),
  Rpc.make('GetAtom', {
    payload: AtomIdPayload,
    success: AtomSnapshotEncoded,
    error: AtomNotFound,
  }),
  Rpc.make('WatchAtom', {
    payload: AtomIdPayload,
    success: AtomSnapshotEncoded,
    error: AtomNotFound,
    stream: true,
  }),
  Rpc.make('ActivateState', {
    payload: {
      atomId: Schema.String,
      stateId: Schema.String,
    },
    success: MutationSuccess,
    error: MutationError,
  }),
  Rpc.make('ClearState', {
    payload: AtomIdPayload,
    success: MutationSuccess,
    error: MutationError,
  }),
  Rpc.make('ClearAllStates', {
    success: MutationSuccess,
    error: MutationError,
  }),
  Rpc.make('RefreshAtom', {
    payload: AtomIdPayload,
    success: MutationSuccess,
    error: MutationError,
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
