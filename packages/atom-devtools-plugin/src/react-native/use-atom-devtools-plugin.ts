import { useAtomValue } from '@effect/atom-react';
import { useRozenitePluginAgentTool } from '@rozenite/agent-bridge';
import { Context, Effect } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { Atom } from 'effect/unstable/reactivity';

import { AtomDevTools, makeAtomDevToolsRpcHandlers } from '@repo/atom-devtools-core';

import { runTool } from '#src/react-native/operations.ts';
import {
  atomDevToolsToolDefinitions,
  decodeActivateStateArgs,
  decodeEmptyArgs,
  decodeGetAtomArgs,
  decodeListAtomsArgs,
} from '#src/shared/agent-tools.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';

type RpcHandlers = ReturnType<typeof makeAtomDevToolsRpcHandlers>;

export const useAtomDevToolsPlugin = <R, ER>(
  runtime: Atom.AtomRuntime<AtomDevTools | R, ER>
): void => {
  const runtimeResult = useAtomValue(runtime);
  const enabled = AsyncResult.isSuccess(runtimeResult);
  const run = async <A, E>(
    operation: (handlers: RpcHandlers) => Effect.Effect<A, E>
  ): Promise<A> => {
    const context = AsyncResult.getOrThrow(runtimeResult);
    const service = Context.get(context, AtomDevTools);
    return Effect.runPromise(operation(makeAtomDevToolsRpcHandlers(service)));
  };
  const handler =
    <Args, A, DecodeError, E>(
      decode: (input: unknown) => Effect.Effect<Args, DecodeError>,
      operation: (handlers: RpcHandlers, args: Args) => Effect.Effect<A, E>
    ) =>
    async (input: unknown): Promise<A> =>
      runTool(decode, input, async (args) => run((handlers) => operation(handlers, args)));

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.listAtoms,
    enabled,
    handler: handler(decodeListAtomsArgs, (handlers, args) => handlers.ListAtoms(args)),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.getAtom,
    enabled,
    handler: handler(decodeGetAtomArgs, (handlers, { atomId }) =>
      handlers.GetAtom({ atomId }).pipe(Effect.map((atom) => ({ atom })))
    ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.activateState,
    enabled,
    handler: handler(decodeActivateStateArgs, (handlers, args) =>
      handlers.ActivateState(args).pipe(Effect.as({ success: true as const, ...args }))
    ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearState,
    enabled,
    handler: handler(decodeGetAtomArgs, (handlers, args) =>
      handlers.ClearState(args).pipe(Effect.as({ success: true as const, ...args }))
    ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearAllStates,
    enabled,
    handler: handler(decodeEmptyArgs, (handlers) =>
      handlers.ClearAllStates().pipe(Effect.as({ success: true as const }))
    ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.refreshAtom,
    enabled,
    handler: handler(decodeGetAtomArgs, (handlers, args) =>
      handlers.RefreshAtom(args).pipe(Effect.as({ success: true as const, ...args }))
    ),
  });
};
