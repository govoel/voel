import { useAtomSet } from '@effect/atom-react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Atom } from 'effect/unstable/reactivity';
import { useEffect } from 'react';

import type { AtomDevToolsRpcEventMap } from '@repo/atom-devtools-core';

import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';
import { connectPanelAtom } from '#src/ui/model.ts';

export const PanelClientConnection = () => {
  const client = useRozeniteDevToolsClient<AtomDevToolsRpcEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });
  const connect = useAtomSet(connectPanelAtom);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }
    connect(client);
    return () => {
      connect(Atom.Interrupt);
    };
  }, [client, connect]);

  return null;
};
