import { RegistryContext, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import { useRozenitePluginAgentTool } from '@rozenite/agent-bridge';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Cause, Effect } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/unstable/reactivity';
import { useContext, useEffect } from 'react';

import type { AtomSummary } from '@repo/atom-devtools-core';

import {
  catalogAtom,
  executeMutationAtom,
  listAtomsAtom,
  lookupSnapshotAtom,
  observeSnapshotAtom,
} from '#src/react-native/model.ts';
import { protocolError, runTool } from '#src/react-native/operations.ts';
import {
  atomDevToolsToolDefinitions,
  decodeActivateStateArgs,
  decodeEmptyArgs,
  decodeGetAtomArgs,
  decodeListAtomsArgs,
} from '#src/shared/agent-tools.ts';
import { encodePayload, subscribe } from '#src/shared/bridge.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';
import {
  ActivateStateMutation,
  AtomDevToolsNotReady,
  ClearAllStatesMutation,
  ClearStateMutation,
  RefreshAtomMutation,
  atomDevToolsEventSchemas,
} from '#src/shared/protocol.ts';
import type { AtomDevToolsEventMap, Mutation } from '#src/shared/protocol.ts';

type Client = NonNullable<ReturnType<typeof useRozeniteDevToolsClient<AtomDevToolsEventMap>>>;

const useAgentTools = (): void => {
  const catalog = useAtomValue(catalogAtom);
  const listAtoms = useAtomSet(listAtomsAtom, { mode: 'promise' });
  const getSnapshot = useAtomSet(lookupSnapshotAtom, { mode: 'promise' });
  const executeMutation = useAtomSet(executeMutationAtom, { mode: 'promise' });
  const enabled = AsyncResult.isSuccess(catalog);

  const mutate = async (mutation: Mutation) => executeMutation(mutation);

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.listAtoms,
    enabled,
    handler: async (input) => runTool(decodeListAtomsArgs, input, listAtoms),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.getAtom,
    enabled,
    handler: async (input) =>
      runTool(decodeGetAtomArgs, input, async ({ atomId }) => ({
        atom: await getSnapshot(atomId),
      })),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.activateState,
    enabled,
    handler: async (input) =>
      runTool(decodeActivateStateArgs, input, async ({ atomId, stateId }) => {
        await mutate(new ActivateStateMutation({ atomId, stateId }));
        return {
          success: true as const,
          atomId,
          stateId,
        };
      }),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearState,
    enabled,
    handler: async (input) =>
      runTool(decodeGetAtomArgs, input, async ({ atomId }) => {
        await mutate(new ClearStateMutation({ atomId }));
        return {
          success: true as const,
          atomId,
        };
      }),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearAllStates,
    enabled,
    handler: async (input) =>
      runTool(decodeEmptyArgs, input, async () => {
        await mutate(new ClearAllStatesMutation());
        return { success: true as const };
      }),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.refreshAtom,
    enabled,
    handler: async (input) =>
      runTool(decodeGetAtomArgs, input, async ({ atomId }) => {
        await mutate(new RefreshAtomMutation({ atomId }));
        return {
          success: true as const,
          atomId,
        };
      }),
  });
};

const sendCatalog = (
  client: Client,
  requestId: string,
  catalog: AsyncResult.AsyncResult<readonly (typeof AtomSummary.Encoded)[], unknown>
): void => {
  if (AsyncResult.isSuccess(catalog)) {
    client.send(
      'initial-state-result',
      encodePayload(atomDevToolsEventSchemas['initial-state-result'], {
        requestId,
        status: 'success',
        data: { atoms: catalog.value },
      })
    );
    return;
  }
  const error = AsyncResult.isFailure(catalog)
    ? Cause.squash(catalog.cause)
    : new AtomDevToolsNotReady();
  client.send(
    'initial-state-result',
    encodePayload(atomDevToolsEventSchemas['initial-state-result'], {
      requestId,
      status: 'error',
      error: protocolError(error),
    })
  );
};

const connectBridge = Effect.fn('AtomDevToolsBridge.connect')(function* (
  client: Client,
  registry: AtomRegistry.AtomRegistry
) {
  let observed: { readonly atomId: string; readonly requestId: string } | undefined = void 0;

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      registry.subscribe(observeSnapshotAtom, (result) => {
        if (observed === void 0) {
          return;
        }
        if (AsyncResult.isSuccess(result)) {
          if (result.value.id === observed.atomId) {
            client.send(
              'get-atom-result',
              encodePayload(atomDevToolsEventSchemas['get-atom-result'], {
                requestId: observed.requestId,
                status: 'success',
                data: result.value,
              })
            );
          }
        } else if (AsyncResult.isFailure(result)) {
          client.send(
            'get-atom-result',
            encodePayload(atomDevToolsEventSchemas['get-atom-result'], {
              requestId: observed.requestId,
              status: 'error',
              error: protocolError(Cause.squash(result.cause)),
            })
          );
        }
      })
    ),
    (unsubscribe) =>
      Effect.sync(() => {
        unsubscribe();
      })
  );

  yield* subscribe(client, {
    event: 'request-initial-state',
    schema: atomDevToolsEventSchemas['request-initial-state'],
    handler: ({ requestId }) =>
      Effect.sync(() => {
        sendCatalog(client, requestId, registry.get(catalogAtom));
      }),
  });

  yield* subscribe(client, {
    event: 'get-atom',
    schema: atomDevToolsEventSchemas['get-atom'],
    handler: ({ atomId, requestId }) =>
      Effect.sync(() => {
        observed = { atomId, requestId };
        registry.set(observeSnapshotAtom, atomId);
      }),
  });

  yield* subscribe(client, {
    event: 'mutation',
    schema: atomDevToolsEventSchemas.mutation,
    handler: ({ mutation, requestId }) =>
      Effect.sync(() => {
        registry.set(executeMutationAtom, mutation);
      }).pipe(
        Effect.andThen(
          AtomRegistry.getResult(registry, executeMutationAtom, { suspendOnWaiting: true })
        ),
        Effect.match({
          onFailure: (error) => {
            client.send(
              'mutation-result',
              encodePayload(atomDevToolsEventSchemas['mutation-result'], {
                requestId,
                status: 'error',
                error: protocolError(error),
              })
            );
          },
          onSuccess: () => {
            client.send(
              'mutation-result',
              encodePayload(atomDevToolsEventSchemas['mutation-result'], {
                requestId,
                status: 'success',
                data: {},
              })
            );
          },
        })
      ),
  });

  return yield* Effect.never;
});

export const useAtomDevToolsPlugin = (): void => {
  const registry = useContext(RegistryContext);
  const catalog = useAtomValue(catalogAtom);
  const client = useRozeniteDevToolsClient<AtomDevToolsEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });

  useAtomMount(observeSnapshotAtom);
  useAtomMount(executeMutationAtom);
  useAgentTools();

  useEffect(() => {
    if (client !== null && AsyncResult.isSuccess(catalog)) {
      client.send(
        'catalog',
        encodePayload(atomDevToolsEventSchemas.catalog, { atoms: catalog.value })
      );
    }
  }, [catalog, client]);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }
    const interrupt = Effect.runCallback(connectBridge(client, registry).pipe(Effect.scoped));
    return interrupt;
  }, [client, registry]);
};
