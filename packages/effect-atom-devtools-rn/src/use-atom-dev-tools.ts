import { RegistryContext } from '@effect/atom-react';
import { Effect, Inspectable, Stream } from 'effect';
import { AtomRegistry } from 'effect/unstable/reactivity';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  ActivateState,
  ClearAllStates,
  ClearState,
  AtomDevTools as CoreAtomDevTools,
  Refresh,
} from '@repo/atom-devtools-core';
import type {
  AtomId,
  AtomNotFound,
  AtomSnapshot,
  AtomSummary,
  StateNotFound,
} from '@repo/atom-devtools-core';

type StateId = AtomSnapshot['states'][number]['id'];

const useDevToolsService = (): readonly [
  CoreAtomDevTools['Service'] | undefined,
  readonly AtomSummary[],
] => {
  const registry = useContext(RegistryContext);
  const [service, setService] = useState<CoreAtomDevTools['Service']>();
  const [catalog, setCatalog] = useState<readonly AtomSummary[]>([]);

  useEffect(() => {
    let active = true;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        const devTools = yield* CoreAtomDevTools;
        yield* Effect.sync(() => {
          if (active) {
            setService(devTools);
          }
        });
        yield* devTools.catalog.pipe(
          Stream.runForEach((nextCatalog) =>
            Effect.gen(function* () {
              // Atom discovery can happen while another component is rendering. Yield before
              // notifying React so this subscription never updates during that render.
              yield* Effect.yieldNow;
              if (active) {
                setCatalog(nextCatalog);
              }
            })
          )
        );
      }).pipe(
        Effect.provide(CoreAtomDevTools.layer),
        Effect.provideService(AtomRegistry.AtomRegistry, registry),
        Effect.scoped
      )
    );

    return () => {
      active = false;
      fiber.interruptUnsafe();
    };
  }, [registry]);

  return [service, catalog];
};

const useSnapshot = (
  service: CoreAtomDevTools['Service'] | undefined,
  atomId: AtomId | undefined
): AtomSnapshot | undefined => {
  const [snapshot, setSnapshot] = useState<AtomSnapshot>();

  useEffect(() => {
    setSnapshot(void 0);
    if (service === void 0 || atomId === void 0) {
      return void 0;
    }

    let active = true;
    const fiber = Effect.runFork(
      service.watch(atomId).pipe(
        Stream.runForEach((nextSnapshot) =>
          Effect.sync(() => {
            if (active) {
              setSnapshot(nextSnapshot);
            }
          })
        ),
        Effect.catchTag('AtomNotFound', () => Effect.void)
      )
    );

    return () => {
      active = false;
      fiber.interruptUnsafe();
    };
  }, [atomId, service]);

  return snapshot;
};

type DevToolsCommand = ActivateState | ClearAllStates | ClearState | Refresh;
type CommandError = AtomNotFound | StateNotFound;

export interface AtomDevToolsProps {
  readonly buttonLabel?: string;
}

export interface AtomDevToolsController {
  readonly buttonLabel: string;
  readonly catalog: readonly AtomSummary[];
  readonly isPresented: boolean;
  readonly preview: string | undefined;
  readonly selectedId: AtomId | undefined;
  readonly snapshot: AtomSnapshot | undefined;
  readonly activateState: (atomId: AtomId, stateId: StateId) => void;
  readonly clearAllStates: () => void;
  readonly clearState: (atomId: AtomId) => void;
  readonly dismiss: () => void;
  readonly present: () => void;
  readonly refresh: (atomId: AtomId) => void;
  readonly selectAtom: (atomId: AtomId | undefined) => void;
}

export const useAtomDevTools = ({
  buttonLabel = 'Atom states',
}: AtomDevToolsProps): AtomDevToolsController => {
  const [service, catalog] = useDevToolsService();
  const [isPresented, setIsPresented] = useState(false);
  const [selectedId, setSelectedId] = useState<AtomId>();
  const snapshot = useSnapshot(service, selectedId);
  const preview = useMemo(
    () => (snapshot === void 0 ? void 0 : Inspectable.toStringUnknown(snapshot.value)),
    [snapshot]
  );

  const execute = useCallback(
    (command: DevToolsCommand): void => {
      if (service === void 0) {
        return;
      }
      Effect.runFork(
        service.execute(command).pipe(Effect.catch((_error: CommandError) => Effect.void))
      );
    },
    [service]
  );

  const dismiss = useCallback(() => {
    setIsPresented(false);
    setSelectedId(void 0);
  }, []);

  const present = useCallback(() => {
    setIsPresented(true);
  }, []);

  const selectAtom = useCallback((atomId: AtomId | undefined) => {
    setSelectedId(atomId);
  }, []);

  const clearAllStates = useCallback(() => {
    execute(new ClearAllStates());
  }, [execute]);

  const refresh = useCallback(
    (atomId: AtomId) => {
      execute(new Refresh({ atomId }));
    },
    [execute]
  );

  const clearState = useCallback(
    (atomId: AtomId) => {
      execute(new ClearState({ atomId }));
    },
    [execute]
  );

  const activateState = useCallback(
    (atomId: AtomId, stateId: StateId) => {
      execute(new ActivateState({ atomId, stateId }));
    },
    [execute]
  );

  useEffect(() => {
    if (selectedId !== void 0 && !catalog.some(({ id }) => id === selectedId)) {
      setSelectedId(void 0);
    }
  }, [catalog, selectedId]);

  return {
    activateState,
    buttonLabel,
    catalog,
    clearAllStates,
    clearState,
    dismiss,
    isPresented,
    present,
    preview,
    refresh,
    selectAtom,
    selectedId,
    snapshot,
  };
};
