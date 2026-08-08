import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import {
  AtomId,
  AtomNotFound,
  AtomSnapshot,
  AtomSummary,
  PredefinedStateNotFound,
} from '#src/atom-dev-tools.ts';

export const AtomDevToolsRpc = RpcGroup.make(
  Rpc.make('catalog', {
    success: Schema.Array(AtomSummary),
    stream: true,
  }),
  Rpc.make('watch', {
    payload: Schema.Struct({ id: AtomId }),
    success: AtomSnapshot,
    error: AtomNotFound,
    stream: true,
  }),
  Rpc.make('activatePredefinedState', {
    payload: Schema.Struct({
      atomId: AtomId,
      stateId: Schema.String,
    }),
    error: Schema.Union([AtomNotFound, PredefinedStateNotFound], { mode: 'oneOf' }),
  }),
  Rpc.make('clearPredefinedState', {
    payload: Schema.Struct({ id: AtomId }),
    error: AtomNotFound,
  }),
  Rpc.make('clearAllPredefinedStates'),
  Rpc.make('refresh', {
    payload: Schema.Struct({ id: AtomId }),
    error: AtomNotFound,
  })
);
