import { useAtomDevTools } from '@repo/effect-atom-devtools-rozenite';

import { AppRegistry } from '#src/services/registry.ts';

export const AtomDevToolsIntegration = () => {
  useAtomDevTools({ registry: AppRegistry });
  return null;
};
