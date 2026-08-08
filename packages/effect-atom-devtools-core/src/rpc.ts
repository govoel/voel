import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import {
  ActivatePredefinedStateInput,
  AtomDevToolsAtomInput,
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
    payload: AtomDevToolsAtomInput,
    success: AtomSnapshot,
    error: AtomNotFound,
    stream: true,
  }),
  Rpc.make('activatePredefinedState', {
    payload: ActivatePredefinedStateInput,
    error: Schema.Union([AtomNotFound, PredefinedStateNotFound], { mode: 'oneOf' }),
  }),
  Rpc.make('clearPredefinedState', {
    payload: AtomDevToolsAtomInput,
    error: AtomNotFound,
  }),
  Rpc.make('clearAllPredefinedStates'),
  Rpc.make('refresh', {
    payload: AtomDevToolsAtomInput,
    error: AtomNotFound,
  })
);
