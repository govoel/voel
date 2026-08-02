import { RegistryContext } from '@effect/atom-react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/unstable/reactivity';
import { useCallback, useContext, useEffect } from 'react';

import { subscribe } from '#src/shared/bridge.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';
import { atomDevToolsEventSchemas } from '#src/shared/protocol.ts';
import type { AtomDevToolsEventMap, Mutation } from '#src/shared/protocol.ts';
import { panelStateAtom, withCatalog } from '#src/ui/model.ts';

type Client = NonNullable<ReturnType<typeof useRozeniteDevToolsClient<AtomDevToolsEventMap>>>;

let requestSequence = 0;
const nextRequestId = (): string => {
  requestSequence += 1;
  return `atom-devtools-${requestSequence}`;
};

const requestInitialState = Effect.fnUntraced(function* (
  client: Client,
  registry: AtomRegistry.AtomRegistry
) {
  const requestId = nextRequestId();
  yield* Effect.sync(() => {
    registry.update(panelStateAtom, (state) => ({
      ...state,
      initialRequestId: requestId,
      loading: state.snapshot === void 0,
      error: void 0,
    }));
    client.send('request-initial-state', { requestId });
  });
});

const requestAtom = Effect.fnUntraced(function* (
  client: Client,
  registry: AtomRegistry.AtomRegistry,
  atomId: string
) {
  const requestId = nextRequestId();
  yield* Effect.sync(() => {
    registry.update(panelStateAtom, (state) => ({
      ...state,
      atomRequestId: requestId,
      loading: true,
      error: void 0,
    }));
    client.send('get-atom', { requestId, atomId });
  });
});

const connectPanel = Effect.fnUntraced(function* (
  client: Client,
  registry: AtomRegistry.AtomRegistry
) {
  yield* subscribe(client, {
    event: 'initial-state-result',
    schema: atomDevToolsEventSchemas['initial-state-result'],
    handler: (response) =>
      Effect.sync(() => {
        registry.update(panelStateAtom, (state) => {
          if (state.initialRequestId !== response.requestId) {
            return state;
          }
          if (response.status === 'error') {
            return {
              ...state,
              initialRequestId: void 0,
              loading: false,
              error: response.error.message,
            };
          }
          return {
            ...withCatalog(state, response.data.atoms),
            initialRequestId: void 0,
            loading: false,
          };
        });
      }),
  });

  yield* subscribe(client, {
    event: 'catalog',
    schema: atomDevToolsEventSchemas.catalog,
    handler: ({ atoms }) =>
      Effect.sync(() => {
        registry.update(panelStateAtom, (state) => withCatalog(state, atoms));
      }),
  });

  yield* subscribe(client, {
    event: 'get-atom-result',
    schema: atomDevToolsEventSchemas['get-atom-result'],
    handler: (response) =>
      Effect.sync(() => {
        registry.update(panelStateAtom, (state) => {
          if (state.atomRequestId !== response.requestId) {
            return state;
          }
          if (response.status === 'error') {
            return {
              ...state,
              snapshot: void 0,
              atomRequestId: void 0,
              loading: false,
              error: response.error.message,
            };
          }
          return {
            ...state,
            snapshot: response.data,
            loading: false,
            error: void 0,
          };
        });
      }),
  });

  yield* subscribe(client, {
    event: 'mutation-result',
    schema: atomDevToolsEventSchemas['mutation-result'],
    handler: (response) =>
      Effect.gen(function* () {
        const state = registry.get(panelStateAtom);
        if (state.pendingRequestId !== response.requestId) {
          return;
        }
        registry.update(panelStateAtom, (current) => ({
          ...current,
          pendingRequestId: void 0,
          error: response.status === 'error' ? response.error.message : void 0,
        }));
        if (response.status === 'success') {
          yield* requestInitialState(client, registry);
          const { selectedId } = registry.get(panelStateAtom);
          if (selectedId !== void 0) {
            yield* requestAtom(client, registry, selectedId);
          }
        }
      }),
  });

  yield* requestInitialState(client, registry);
  const { selectedId } = registry.get(panelStateAtom);
  if (selectedId !== void 0) {
    yield* requestAtom(client, registry, selectedId);
  }

  return yield* Effect.never;
});

interface PanelClient {
  readonly reload: () => void;
  readonly selectAtom: (atomId: string) => void;
  readonly mutate: (mutation: Mutation) => void;
}

export const usePanelClient = (): PanelClient => {
  const registry = useContext(RegistryContext);
  const client = useRozeniteDevToolsClient<AtomDevToolsEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }
    const fiber = Effect.runFork(connectPanel(client, registry).pipe(Effect.scoped));
    return () => {
      fiber.interruptUnsafe();
    };
  }, [client, registry]);

  const reload = useCallback((): void => {
    if (client !== null) {
      Effect.runFork(requestInitialState(client, registry));
    }
  }, [client, registry]);

  const selectAtom = useCallback(
    (atomId: string): void => {
      registry.update(panelStateAtom, (state) => ({
        ...state,
        selectedId: atomId,
        snapshot: void 0,
        error: void 0,
      }));
      if (client !== null) {
        Effect.runFork(requestAtom(client, registry, atomId));
      }
    },
    [client, registry]
  );

  const mutate = useCallback(
    (mutation: Mutation): void => {
      if (client === null || registry.get(panelStateAtom).pendingRequestId !== void 0) {
        return;
      }
      const requestId = nextRequestId();
      registry.update(panelStateAtom, (state) => ({
        ...state,
        pendingRequestId: requestId,
        error: void 0,
      }));
      client.send('mutation', { requestId, mutation });
    },
    [client, registry]
  );

  return { reload, selectAtom, mutate };
};
