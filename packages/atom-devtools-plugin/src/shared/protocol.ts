import { Schema } from 'effect';

import { AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';

const TypeId = '@repo/atom-devtools-plugin/Protocol' as const;

const RequestId = Schema.String.annotateKey({
  description: 'Correlates a response with the request that produced it.',
});
const AtomId = Schema.String.annotateKey({ description: 'Stable atom identifier.' });

export class TransportError extends Schema.Class<TransportError, { readonly brand: unique symbol }>(
  `${TypeId}/TransportError`
)({
  code: Schema.Literals(['atom-not-found', 'state-not-found', 'not-ready', 'unknown']),
  message: Schema.String,
}) {}

const ResponseSchema = <S extends Schema.Top>(data: S) =>
  Schema.Union([
    Schema.Struct({
      requestId: RequestId,
      status: Schema.Literal('success'),
      data,
    }),
    Schema.Struct({
      requestId: RequestId,
      status: Schema.Literal('error'),
      error: TransportError,
    }),
  ]);

export class ActivateStateMutation extends Schema.TaggedClass<
  ActivateStateMutation,
  { readonly brand: unique symbol }
>(`${TypeId}/ActivateStateMutation`)('ActivateState', {
  atomId: AtomId,
  stateId: Schema.String.annotateKey({ description: 'Predefined state identifier.' }),
}) {}

export class ClearStateMutation extends Schema.TaggedClass<
  ClearStateMutation,
  { readonly brand: unique symbol }
>(`${TypeId}/ClearStateMutation`)('ClearState', { atomId: AtomId }) {}

export class ClearAllStatesMutation extends Schema.TaggedClass<
  ClearAllStatesMutation,
  { readonly brand: unique symbol }
>(`${TypeId}/ClearAllStatesMutation`)('ClearAllStates', {}) {}

export class RefreshAtomMutation extends Schema.TaggedClass<
  RefreshAtomMutation,
  { readonly brand: unique symbol }
>(`${TypeId}/RefreshAtomMutation`)('RefreshAtom', { atomId: AtomId }) {}

export const MutationSchema = Schema.Union([
  ActivateStateMutation,
  ClearStateMutation,
  ClearAllStatesMutation,
  RefreshAtomMutation,
]);
export type Mutation = typeof MutationSchema.Type;

class InitialState extends Schema.Class<InitialState, { readonly brand: unique symbol }>(
  `${TypeId}/InitialState`
)({ atoms: Schema.Array(AtomSummaryDto) }) {}

class EmptySuccess extends Schema.Class<EmptySuccess, { readonly brand: unique symbol }>(
  `${TypeId}/EmptySuccess`
)({}) {}

class RequestInitialStateEvent extends Schema.Class<
  RequestInitialStateEvent,
  { readonly brand: unique symbol }
>(`${TypeId}/RequestInitialStateEvent`)({ requestId: RequestId }) {}

class GetAtomEvent extends Schema.Class<GetAtomEvent, { readonly brand: unique symbol }>(
  `${TypeId}/GetAtomEvent`
)({ requestId: RequestId, atomId: AtomId }) {}

class MutationEvent extends Schema.Class<MutationEvent, { readonly brand: unique symbol }>(
  `${TypeId}/MutationEvent`
)({ requestId: RequestId, mutation: MutationSchema }) {}

export const atomDevToolsEventSchemas = {
  'request-initial-state': RequestInitialStateEvent,
  'initial-state-result': ResponseSchema(InitialState),
  catalog: InitialState,
  'get-atom': GetAtomEvent,
  'get-atom-result': ResponseSchema(AtomSnapshotDto),
  mutation: MutationEvent,
  'mutation-result': ResponseSchema(EmptySuccess),
} as const;

type EventSchemas = typeof atomDevToolsEventSchemas;

export type AtomDevToolsEventMap = {
  readonly [K in keyof EventSchemas]: EventSchemas[K]['Encoded'];
};
