import { defineAgentToolDescriptors } from '@rozenite/agent-shared';

import { ATOM_DEVTOOLS_PLUGIN_ID, atomDevToolsToolDefinitions } from './src/shared/agent-tools.ts';

export { ATOM_DEVTOOLS_PLUGIN_ID, atomDevToolsToolDefinitions } from './src/shared/agent-tools.ts';

export const atomDevToolsTools = defineAgentToolDescriptors(
  ATOM_DEVTOOLS_PLUGIN_ID,
  atomDevToolsToolDefinitions
);

export type {
  ActivateStateArgs,
  AtomMutationResult,
  ClearAllStatesResult,
  ClearStateArgs,
  GetAtomArgs,
  GetAtomResult,
  ListAtomsArgs,
  ListAtomsResult,
  RefreshAtomArgs,
} from './src/shared/agent-tools.ts';
export type { AtomSnapshotDto, AtomSummaryDto, JsonValue } from './src/shared/transport.ts';
