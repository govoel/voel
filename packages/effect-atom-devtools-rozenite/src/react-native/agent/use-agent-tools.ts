import { useRozenitePluginAgentTool } from '@rozenite/agent-bridge';
import { useMemo } from 'react';

import { makeAtomDevToolsAgentHandlers } from '#src/react-native/agent/handlers.ts';
import type { AtomDevToolsRuntime } from '#src/react-native/agent/handlers.ts';
import { atomDevToolsToolDefinitions } from '#src/shared/agent-tools.ts';
import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';

export const useAtomDevToolsAgentTools = (runtime: AtomDevToolsRuntime): void => {
  const handlers = useMemo(() => makeAtomDevToolsAgentHandlers(runtime), [runtime]);

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.listAtoms,
    handler: handlers.listAtoms,
  });

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.getAtomDetails,
    handler: handlers.getAtomDetails,
  });

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.activatePredefinedState,
    handler: handlers.activatePredefinedState,
  });

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearPredefinedState,
    handler: handlers.clearPredefinedState,
  });

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearAllPredefinedStates,
    handler: handlers.clearAllPredefinedStates,
  });

  useRozenitePluginAgentTool({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.refreshAtom,
    handler: handlers.refreshAtom,
  });
};
