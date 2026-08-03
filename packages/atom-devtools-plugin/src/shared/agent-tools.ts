import { defineAgentToolContract } from '@rozenite/agent-shared';
import type { AgentToolContract } from '@rozenite/agent-shared';
import { Effect, Schema, SchemaTransformation } from 'effect';

import type { AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

interface AtomMutationResult {
  readonly success: true;
  readonly atomId: string;
  readonly stateId?: string;
}

const described = <S extends Schema.Top>(schema: S, description: string) =>
  schema.annotateKey({ description });

const AtomId = described(Schema.String, 'Stable atom ID returned by list-atoms.');
const Cursor = Schema.String.annotate({
  description: 'Cursor returned by a previous page.',
}).pipe(
  Schema.decodeTo(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    SchemaTransformation.numberFromString
  )
);
const Limit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })).pipe(
  Schema.annotate({ description: 'Maximum atoms to return.', default: 50 }),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(50))
);

export const ListAtomsArgs = Schema.Struct({
  query: described(Schema.optionalKey(Schema.String), 'Case-insensitive name or ID search.'),
  writable: described(Schema.optionalKey(Schema.Boolean), 'Only atoms matching writability.'),
  overridden: described(Schema.optionalKey(Schema.Boolean), 'Only atoms matching override status.'),
  stateCapable: described(
    Schema.optionalKey(Schema.Boolean),
    'Only atoms matching predefined-state capability.'
  ),
  cursor: Schema.optionalKey(Cursor),
  limit: Limit,
});
export type ListAtomsArgs = typeof ListAtomsArgs.Type;

export const GetAtomArgs = Schema.Struct({
  atomId: AtomId,
});
export type GetAtomArgs = typeof GetAtomArgs.Type;

export const ActivateStateArgs = Schema.Struct({
  atomId: AtomId,
  stateId: described(Schema.String, 'State ID returned by get-atom.'),
});
export type ActivateStateArgs = typeof ActivateStateArgs.Type;

export const EmptyArgs = Schema.Struct({});
export type EmptyArgs = typeof EmptyArgs.Type;

export const decodeListAtomsArgs = Schema.decodeUnknownEffect(ListAtomsArgs);
export const decodeGetAtomArgs = Schema.decodeUnknownEffect(GetAtomArgs);
export const decodeActivateStateArgs = Schema.decodeUnknownEffect(ActivateStateArgs);
export const decodeEmptyArgs = Schema.decodeUnknownEffect(EmptyArgs);

// Effect Schema remains canonical; Rozenite receives its generated JSON Schema.
const agentInputSchema = (schema: Schema.Top): AgentToolContract['inputSchema'] =>
  Schema.toJsonSchemaDocument(schema).schema;

export const atomDevToolsToolDefinitions = {
  listAtoms: defineAgentToolContract<
    typeof ListAtomsArgs.Encoded,
    {
      readonly items: readonly (typeof AtomSummary.Encoded)[];
      readonly total: number;
      readonly nextCursor?: string;
    }
  >({
    name: 'list-atoms',
    description:
      'List discovered Effect atoms. Filter by name or capabilities and paginate with the returned cursor.',
    inputSchema: agentInputSchema(ListAtomsArgs),
  }),
  getAtom: defineAgentToolContract<
    typeof GetAtomArgs.Encoded,
    { readonly atom: typeof AtomSnapshot.Encoded }
  >({
    name: 'get-atom',
    description:
      'Get an atom value, source, lifecycle metadata, subscribers, graph links, and predefined states.',
    inputSchema: agentInputSchema(GetAtomArgs),
  }),
  activateState: defineAgentToolContract<typeof ActivateStateArgs.Encoded, AtomMutationResult>({
    name: 'activate-state',
    description: 'Activate one predefined state on an atom.',
    inputSchema: agentInputSchema(ActivateStateArgs),
  }),
  clearState: defineAgentToolContract<typeof GetAtomArgs.Encoded, AtomMutationResult>({
    name: 'clear-state',
    description: 'Clear an atom state override and restore normal atom behavior.',
    inputSchema: agentInputSchema(GetAtomArgs),
  }),
  clearAllStates: defineAgentToolContract<typeof EmptyArgs.Encoded, { readonly success: true }>({
    name: 'clear-all-states',
    description: 'Clear every active atom state override in the app.',
    inputSchema: agentInputSchema(EmptyArgs),
  }),
  refreshAtom: defineAgentToolContract<typeof GetAtomArgs.Encoded, AtomMutationResult>({
    name: 'refresh-atom',
    description: 'Refresh an atom while preserving its active predefined state.',
    inputSchema: agentInputSchema(GetAtomArgs),
  }),
} as const satisfies Record<string, AgentToolContract>;
