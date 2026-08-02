import { defineAgentToolContract } from '@rozenite/agent-shared';
import type { AgentToolContract } from '@rozenite/agent-shared';
import { Schema } from 'effect';

import type { AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';

interface AtomMutationResult {
  readonly success: true;
  readonly atomId: string;
  readonly stateId?: string;
}

const Cursor = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

const TypeId = '@repo/atom-devtools-plugin/AgentTools' as const;

export class ListAtomsArgs extends Schema.Class<ListAtomsArgs, { readonly brand: unique symbol }>(
  `${TypeId}/ListAtomsArgs`
)({
  query: Schema.optional(Schema.String),
  writable: Schema.optional(Schema.Boolean),
  overridden: Schema.optional(Schema.Boolean),
  stateCapable: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Cursor),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class GetAtomArgs extends Schema.Class<GetAtomArgs, { readonly brand: unique symbol }>(
  `${TypeId}/GetAtomArgs`
)({
  atomId: Schema.String,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class ActivateStateArgs extends Schema.Class<
  ActivateStateArgs,
  { readonly brand: unique symbol }
>(`${TypeId}/ActivateStateArgs`)({
  atomId: Schema.String,
  stateId: Schema.String,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class EmptyArgs extends Schema.Class<EmptyArgs, { readonly brand: unique symbol }>(
  `${TypeId}/EmptyArgs`
)({}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

const atomIdProperty = {
  type: 'string',
  description: 'Stable atom ID returned by list-atoms.',
} as const;

export const atomDevToolsToolDefinitions = {
  listAtoms: defineAgentToolContract<
    typeof ListAtomsArgs.Encoded,
    {
      readonly items: readonly AtomSummaryDto[];
      readonly total: number;
      readonly nextCursor?: string;
    }
  >({
    name: 'list-atoms',
    description:
      'List discovered Effect atoms. Filter by name or capabilities and paginate with the returned cursor.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive name or ID search.' },
        writable: { type: 'boolean', description: 'Only atoms matching writability.' },
        overridden: { type: 'boolean', description: 'Only atoms matching override status.' },
        stateCapable: {
          type: 'boolean',
          description: 'Only atoms matching predefined-state capability.',
        },
        cursor: { type: 'string', description: 'Cursor returned by a previous page.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
    },
  }),
  getAtom: defineAgentToolContract<typeof GetAtomArgs.Encoded, { readonly atom: AtomSnapshotDto }>({
    name: 'get-atom',
    description:
      'Get an atom value, source, lifecycle metadata, subscribers, graph links, and predefined states.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
  activateState: defineAgentToolContract<typeof ActivateStateArgs.Encoded, AtomMutationResult>({
    name: 'activate-state',
    description: 'Activate one predefined state on an atom.',
    inputSchema: {
      type: 'object',
      properties: {
        atomId: atomIdProperty,
        stateId: { type: 'string', description: 'State ID returned by get-atom.' },
      },
      required: ['atomId', 'stateId'],
    },
  }),
  clearState: defineAgentToolContract<typeof GetAtomArgs.Encoded, AtomMutationResult>({
    name: 'clear-state',
    description: 'Clear an atom state override and restore normal atom behavior.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
  clearAllStates: defineAgentToolContract<typeof EmptyArgs.Encoded, { readonly success: true }>({
    name: 'clear-all-states',
    description: 'Clear every active atom state override in the app.',
    inputSchema: { type: 'object', properties: {} },
  }),
  refreshAtom: defineAgentToolContract<typeof GetAtomArgs.Encoded, AtomMutationResult>({
    name: 'refresh-atom',
    description: 'Refresh an atom while preserving its active predefined state.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
} as const satisfies Record<string, AgentToolContract>;
