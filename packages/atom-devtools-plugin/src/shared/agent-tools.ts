import { defineAgentToolContract } from '@rozenite/agent-shared';
import type { AgentToolContract } from '@rozenite/agent-shared';

import type { AtomSnapshotDto, AtomSummaryDto } from './transport.ts';

export const ATOM_DEVTOOLS_PLUGIN_ID = '@repo/atom-devtools-plugin';

export interface ListAtomsArgs {
  readonly query?: string;
  readonly writable?: boolean;
  readonly overridden?: boolean;
  readonly stateCapable?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListAtomsResult {
  readonly items: readonly AtomSummaryDto[];
  readonly total: number;
  readonly nextCursor?: string;
}

export interface GetAtomArgs {
  readonly atomId: string;
}

export interface GetAtomResult {
  readonly atom: AtomSnapshotDto;
}

export interface ActivateStateArgs extends GetAtomArgs {
  readonly stateId: string;
}

export type ClearStateArgs = GetAtomArgs;
export type RefreshAtomArgs = GetAtomArgs;

export interface AtomMutationResult {
  readonly success: true;
  readonly atomId: string;
  readonly stateId?: string;
}

export interface ClearAllStatesResult {
  readonly success: true;
}

const atomIdProperty = {
  type: 'string',
  description: 'Stable atom ID returned by list-atoms.',
} as const;

export const atomDevToolsToolDefinitions = {
  listAtoms: defineAgentToolContract<ListAtomsArgs, ListAtomsResult>({
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
  getAtom: defineAgentToolContract<GetAtomArgs, GetAtomResult>({
    name: 'get-atom',
    description:
      'Get an atom value, source, lifecycle metadata, subscribers, graph links, and predefined states.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
  activateState: defineAgentToolContract<ActivateStateArgs, AtomMutationResult>({
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
  clearState: defineAgentToolContract<ClearStateArgs, AtomMutationResult>({
    name: 'clear-state',
    description: 'Clear an atom state override and restore normal atom behavior.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
  clearAllStates: defineAgentToolContract<undefined, ClearAllStatesResult>({
    name: 'clear-all-states',
    description: 'Clear every active atom state override in the app.',
    inputSchema: { type: 'object', properties: {} },
  }),
  refreshAtom: defineAgentToolContract<RefreshAtomArgs, AtomMutationResult>({
    name: 'refresh-atom',
    description: 'Refresh an atom while preserving its active predefined state.',
    inputSchema: {
      type: 'object',
      properties: { atomId: atomIdProperty },
      required: ['atomId'],
    },
  }),
} as const satisfies Record<string, AgentToolContract>;
