import { defineAgentToolDescriptors } from '@rozenite/agent-shared';
import type { AgentToolDescriptor } from '@rozenite/agent-shared';

import { atomDevToolsToolDefinitions } from '#src/shared/agent-tools.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';

type AtomDevToolsTools = {
  readonly [K in keyof typeof atomDevToolsToolDefinitions]: AgentToolDescriptor;
};

export const atomDevToolsTools: AtomDevToolsTools = defineAgentToolDescriptors(
  ATOM_DEVTOOLS_PLUGIN_ID,
  atomDevToolsToolDefinitions
);
