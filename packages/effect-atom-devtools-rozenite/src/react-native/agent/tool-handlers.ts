import type { AgentTool } from '@rozenite/agent-shared';
import { Effect, Schema, Stream } from 'effect';

import { AtomDevTools } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import type { AtomId } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import {
  ActivatePredefinedStateInput,
  AtomDevToolsAtomInput,
} from '@repo/effect-atom-devtools-core/rpc';

import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';

class AgentToolError extends Schema.TaggedError<AgentToolError, { readonly brand: unique symbol }>(
  '@repo/effect-atom-devtools-rozenite/react-native/agent/tool-handlers/AgentToolError'
)('AgentToolError', {
  message: Schema.String,
}) {}

const emptyObjectInputSchema = {
  type: 'object',
  properties: {},
} as const;

const atomIdInputProperty = {
  atomId: {
    type: 'string',
    description: 'Atom ID returned by list-atoms.',
  },
} as const;

const makeAtomNotFoundError = (id: AtomId) =>
  new AgentToolError({
    message: `Atom "${id}" is not currently tracked. Call list-atoms to get a current atom ID.`,
  });

export const agentToolHandlers: ReadonlyArray<{
  readonly tool: AgentTool;
  readonly execute: (
    input: unknown
  ) => Effect.Effect<unknown, Schema.SchemaError | AgentToolError, AtomDevTools>;
}> = [
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.list-atoms`,
      description:
        'Return the latest catalog of atoms tracked by Effect Atom DevTools as an Option.',
      readOnly: true,
      destructive: false,
      idempotent: true,
      inputSchema: emptyObjectInputSchema,
    },
    execute: () => AtomDevTools.pipe(Effect.flatMap(({ catalog }) => catalog.pipe(Stream.runHead))),
  },
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.get-atom-details`,
      description: 'Return the current Effect Atom DevTools snapshot for an atom as an Option.',
      readOnly: true,
      destructive: false,
      idempotent: true,
      inputSchema: {
        type: 'object',
        properties: atomIdInputProperty,
        required: ['atomId'],
      },
    },
    execute: (input) =>
      AtomDevToolsAtomInput.decodeUnknownEffect(input).pipe(
        Effect.flatMap(({ atomId }) =>
          AtomDevTools.pipe(Effect.flatMap(({ watch }) => watch(atomId).pipe(Stream.runHead)))
        ),
        Effect.catchTag('AtomNotFound', ({ id }) => Effect.fail(makeAtomNotFoundError(id)))
      ),
  },
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.activate-predefined-state`,
      description: 'Activate a predefined state for an atom.',
      readOnly: false,
      destructive: false,
      idempotent: true,
      inputSchema: {
        type: 'object',
        properties: {
          ...atomIdInputProperty,
          stateId: {
            type: 'string',
            description: 'Predefined state ID returned by get-atom-details.',
          },
        },
        required: ['atomId', 'stateId'],
      },
    },
    execute: (input) =>
      ActivatePredefinedStateInput.decodeUnknownEffect(input).pipe(
        Effect.flatMap(({ atomId, stateId }) =>
          AtomDevTools.pipe(
            Effect.flatMap(({ activatePredefinedState }) =>
              activatePredefinedState(atomId, stateId)
            )
          )
        ),
        Effect.as({ activated: true } as const),
        Effect.catchTags({
          AtomNotFound: ({ id }) => Effect.fail(makeAtomNotFoundError(id)),
          PredefinedStateNotFound: ({ atomId, stateId }) =>
            Effect.fail(
              new AgentToolError({
                message: `Predefined state "${stateId}" was not found for atom "${atomId}". Call get-atom-details for that atom to list its available predefined states.`,
              })
            ),
        })
      ),
  },
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.clear-predefined-state`,
      description: "Clear an atom's active predefined state.",
      readOnly: false,
      destructive: false,
      idempotent: true,
      inputSchema: {
        type: 'object',
        properties: atomIdInputProperty,
        required: ['atomId'],
      },
    },
    execute: (input) =>
      AtomDevToolsAtomInput.decodeUnknownEffect(input).pipe(
        Effect.flatMap(({ atomId }) =>
          AtomDevTools.pipe(
            Effect.flatMap(({ clearPredefinedState }) => clearPredefinedState(atomId))
          )
        ),
        Effect.as({ cleared: true } as const),
        Effect.catchTag('AtomNotFound', ({ id }) => Effect.fail(makeAtomNotFoundError(id)))
      ),
  },
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.clear-all-predefined-states`,
      description: 'Clear active predefined states from every tracked atom.',
      readOnly: false,
      destructive: true,
      idempotent: true,
      inputSchema: emptyObjectInputSchema,
    },
    execute: () =>
      AtomDevTools.pipe(
        Effect.flatMap(({ clearAllPredefinedStates }) => clearAllPredefinedStates),
        Effect.as({ cleared: true } as const)
      ),
  },
  {
    tool: {
      name: `${EFFECT_ATOM_DEVTOOLS_PLUGIN_ID}.refresh-atom`,
      description: 'Refresh an atom.',
      readOnly: false,
      destructive: false,
      idempotent: false,
      inputSchema: {
        type: 'object',
        properties: atomIdInputProperty,
        required: ['atomId'],
      },
    },
    execute: (input) =>
      AtomDevToolsAtomInput.decodeUnknownEffect(input).pipe(
        Effect.flatMap(({ atomId }) =>
          AtomDevTools.pipe(Effect.flatMap(({ refresh }) => refresh(atomId)))
        ),
        Effect.as({ refreshed: true } as const),
        Effect.catchTag('AtomNotFound', ({ id }) => Effect.fail(makeAtomNotFoundError(id)))
      ),
  },
];
