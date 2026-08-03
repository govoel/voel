import { useAtomSet } from '@effect/atom-react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Atom } from 'effect/unstable/reactivity';
import { useCallback, useEffect } from 'react';

import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';
import type { AtomDevToolsEventMap, Mutation } from '#src/shared/protocol.ts';
import { backAtom, connectPanelAtom, mutateAtom, reloadAtom, selectAtom } from '#src/ui/model.ts';

interface PanelClient {
  readonly back: () => void;
  readonly reload: () => void;
  readonly selectAtom: (atomId: string) => void;
  readonly mutate: (mutation: Mutation) => void;
}

export const usePanelClient = (): PanelClient => {
  const client = useRozeniteDevToolsClient<AtomDevToolsEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });
  const connect = useAtomSet(connectPanelAtom);
  const backIntent = useAtomSet(backAtom);
  const reloadIntent = useAtomSet(reloadAtom);
  const selectIntent = useAtomSet(selectAtom);
  const mutateIntent = useAtomSet(mutateAtom);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }
    connect(client);
    return () => {
      connect(Atom.Interrupt);
    };
  }, [client, connect]);

  const back = useCallback(() => {
    backIntent(void 0);
  }, [backIntent]);
  const reload = useCallback(() => {
    reloadIntent(void 0);
  }, [reloadIntent]);
  const select = useCallback(
    (atomId: string) => {
      selectIntent(atomId);
    },
    [selectIntent]
  );
  const mutate = useCallback(
    (mutation: Mutation) => {
      mutateIntent(mutation);
    },
    [mutateIntent]
  );

  return { back, reload, selectAtom: select, mutate };
};
