import { defineAgentToolDescriptors } from '@rozenite/agent-shared';
import type { AgentToolDescriptor } from '@rozenite/agent-shared';

import { ATOM_DEVTOOLS_PLUGIN_ID, atomDevToolsToolDefinitions } from '#src/shared/agent-tools.ts';

type AtomDevToolsTools = {
  readonly [K in keyof typeof atomDevToolsToolDefinitions]: AgentToolDescriptor;
};

export const atomDevToolsTools: AtomDevToolsTools = defineAgentToolDescriptors(
  ATOM_DEVTOOLS_PLUGIN_ID,
  atomDevToolsToolDefinitions
);
