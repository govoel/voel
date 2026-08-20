import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import {
  AtomId,
  AtomNotFound,
  AtomSnapshot,
  AtomSummary,
  PredefinedStateNotFound,
} from '#src/atom-dev-tools.ts';

export class AtomDevToolsAtomInput extends Schema.Class<
  AtomDevToolsAtomInput,
  { readonly brand: unique symbol }
>('@repo/effect-atom-devtools-core/rpc/AtomDevToolsAtomInput')({
  atomId: AtomId,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class ActivatePredefinedStateInput extends AtomDevToolsAtomInput.extend<
  ActivatePredefinedStateInput,
  Record<never, never>,
  { readonly activatePredefinedStateInputBrand: unique symbol }
>('@repo/effect-atom-devtools-core/rpc/ActivatePredefinedStateInput')({
  stateId: Schema.String,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

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
