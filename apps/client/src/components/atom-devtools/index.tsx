import { useAtomDevToolsPlugin } from '@repo/atom-devtools-plugin';

import { AppRuntime } from '#src/services/runtime.ts';

export const AtomDevToolsIntegration = () => {
  useAtomDevToolsPlugin(AppRuntime);
  return null;
};
