import { defineAgentToolContract } from '@rozenite/agent-shared';
import type { AgentToolContract } from '@rozenite/agent-shared';

import type { AtomSnapshot, AtomSummary } from '@repo/effect-atom-devtools-core/atom-dev-tools';

interface AtomDevToolsAtomInput {
  readonly atomId: string;
}

const emptyInputSchema = {
  type: 'object',
  properties: {},
} as const;

const atomIdProperty = {
  atomId: {
    type: 'string',
    description: 'Atom ID returned by list-atoms.',
  },
} as const;

export const atomDevToolsToolDefinitions = {
  listAtoms: defineAgentToolContract<undefined, readonly AtomSummary[]>({
    name: 'list-atoms',
    description: 'List all atoms currently tracked by Effect Atom DevTools.',
    readOnly: true,
    destructive: false,
    idempotent: true,
    inputSchema: emptyInputSchema,
  }),
  getAtomDetails: defineAgentToolContract<AtomDevToolsAtomInput, AtomSnapshot>({
    name: 'get-atom-details',
    description: 'Get the current Effect Atom DevTools snapshot for an atom.',
    readOnly: true,
    destructive: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: atomIdProperty,
      required: ['atomId'],
    },
  }),
  activatePredefinedState: defineAgentToolContract<
    AtomDevToolsAtomInput & { readonly stateId: string },
    { readonly activated: true; readonly atom: AtomSnapshot }
  >({
    name: 'activate-predefined-state',
    description: 'Activate a predefined state for an atom and return its resulting snapshot.',
    readOnly: false,
    destructive: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        ...atomIdProperty,
        stateId: {
          type: 'string',
          description: 'Predefined state ID returned by get-atom-details.',
        },
      },
      required: ['atomId', 'stateId'],
    },
  }),
  clearPredefinedState: defineAgentToolContract<
    AtomDevToolsAtomInput,
    { readonly cleared: true; readonly atom: AtomSnapshot }
  >({
    name: 'clear-predefined-state',
    description: "Clear an atom's active predefined state and return its resulting snapshot.",
    readOnly: false,
    destructive: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: atomIdProperty,
      required: ['atomId'],
    },
  }),
  clearAllPredefinedStates: defineAgentToolContract<undefined, { readonly cleared: true }>({
    name: 'clear-all-predefined-states',
    description: 'Clear active predefined states from every tracked atom.',
    readOnly: false,
    destructive: true,
    idempotent: true,
    inputSchema: emptyInputSchema,
  }),
  refreshAtom: defineAgentToolContract<
    AtomDevToolsAtomInput,
    { readonly refreshed: true; readonly atom: AtomSnapshot }
  >({
    name: 'refresh-atom',
    description: 'Refresh an atom and return its resulting snapshot.',
    readOnly: false,
    destructive: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: atomIdProperty,
      required: ['atomId'],
    },
  }),
} as const satisfies Record<string, AgentToolContract>;
