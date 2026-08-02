import { RegistryContext } from '@effect/atom-react';
import { useRozenitePluginAgentTool } from '@rozenite/agent-bridge';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Stream } from 'effect';
import type { Fiber } from 'effect';
import { AtomRegistry } from 'effect/unstable/reactivity';
import { useContext, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
  ActivateState,
  AtomDevTools,
  AtomId,
  ClearAllStates,
  ClearState,
  Refresh,
} from '@repo/atom-devtools-core';

import {
  AtomDevToolsNotReady,
  enrichCatalog,
  executeMutation,
  getSnapshot,
  requireService,
  runTool,
  transportError,
} from '#src/react-native/operations.ts';
import type { AtomDevToolsService } from '#src/react-native/operations.ts';
import {
  ActivateStateArgs,
  EmptyArgs,
  GetAtomArgs,
  ListAtomsArgs,
  atomDevToolsToolDefinitions,
} from '#src/shared/agent-tools.ts';
import { subscribe } from '#src/shared/bridge.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';
import { atomDevToolsEventSchemas } from '#src/shared/protocol.ts';
import type { AtomDevToolsEventMap } from '#src/shared/protocol.ts';
import { AtomSnapshotDto } from '#src/shared/transport.ts';
import type { AtomSummaryDto } from '#src/shared/transport.ts';

const useCoreService = (): readonly [
  AtomDevToolsService | undefined,
  readonly AtomSummaryDto[],
] => {
  const registry = useContext(RegistryContext);
  const [service, setService] = useState<AtomDevToolsService>();
  const [catalog, setCatalog] = useState<readonly AtomSummaryDto[]>([]);

  useEffect(() => {
    let active = true;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        const nextService = yield* AtomDevTools;
        yield* Effect.sync(() => {
          if (active) {
            setService(nextService);
          }
        });
        yield* nextService.catalog.pipe(
          Stream.mapEffect((summaries) => enrichCatalog(nextService, summaries)),
          Stream.runForEach((nextCatalog) =>
            Effect.gen(function* () {
              yield* Effect.yieldNow;
              yield* Effect.sync(() => {
                if (active) {
                  setCatalog(nextCatalog);
                }
              });
            })
          )
        );
      }).pipe(
        Effect.provide(AtomDevTools.layer),
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

const useAgentTools = (
  service: AtomDevToolsService | undefined,
  catalog: readonly AtomSummaryDto[]
): void => {
  const enabled = service !== void 0;

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.listAtoms,
    enabled,
    handler: async (input) =>
      runTool(ListAtomsArgs.decodeUnknownEffect, input, (args) =>
        Effect.sync(() => {
          const query = args.query?.trim().toLocaleLowerCase();
          const filtered = catalog
            .filter(
              (atom) =>
                (query === void 0 ||
                  atom.name.toLocaleLowerCase().includes(query) ||
                  atom.id.toLocaleLowerCase().includes(query)) &&
                (args.writable === void 0 || atom.writable === args.writable) &&
                (args.overridden === void 0 || atom.overridden === args.overridden) &&
                (args.stateCapable === void 0 || atom.stateCapable === args.stateCapable)
            )
            .toSorted((left, right) =>
              left.name === right.name
                ? left.id.localeCompare(right.id)
                : left.name.localeCompare(right.name)
            );
          const offset = args.cursor ?? 0;
          const limit = args.limit ?? 50;
          const items = filtered.slice(offset, offset + limit);
          const nextOffset = offset + items.length;
          return {
            items,
            total: filtered.length,
            ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
          };
        })
      ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.getAtom,
    enabled,
    handler: async (input) =>
      runTool(GetAtomArgs.decodeUnknownEffect, input, ({ atomId }) =>
        requireService(service).pipe(
          Effect.flatMap((ready) => getSnapshot(ready, atomId)),
          Effect.map((atom) => ({ atom: AtomSnapshotDto.fromSnapshot(atom) }))
        )
      ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.activateState,
    enabled,
    handler: async (input) =>
      runTool(ActivateStateArgs.decodeUnknownEffect, input, ({ atomId, stateId }) =>
        requireService(service).pipe(
          Effect.flatMap((ready) =>
            ready.execute(new ActivateState({ atomId: AtomId.make(atomId), stateId }))
          ),
          Effect.as({ success: true as const, atomId, stateId })
        )
      ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearState,
    enabled,
    handler: async (input) =>
      runTool(GetAtomArgs.decodeUnknownEffect, input, ({ atomId }) =>
        requireService(service).pipe(
          Effect.flatMap((ready) => ready.execute(new ClearState({ atomId: AtomId.make(atomId) }))),
          Effect.as({ success: true as const, atomId })
        )
      ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearAllStates,
    enabled,
    handler: async (input) =>
      runTool(EmptyArgs.decodeUnknownEffect, input, () =>
        requireService(service).pipe(
          Effect.flatMap((ready) => ready.execute(new ClearAllStates())),
          Effect.as({ success: true as const })
        )
      ),
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.refreshAtom,
    enabled,
    handler: async (input) =>
      runTool(GetAtomArgs.decodeUnknownEffect, input, ({ atomId }) =>
        requireService(service).pipe(
          Effect.flatMap((ready) => ready.execute(new Refresh({ atomId: AtomId.make(atomId) }))),
          Effect.as({ success: true as const, atomId })
        )
      ),
  });
};

const connectBridge = Effect.fnUntraced(function* (
  client: NonNullable<ReturnType<typeof useRozeniteDevToolsClient<AtomDevToolsEventMap>>>,
  service: AtomDevToolsService | undefined,
  catalog: RefObject<readonly AtomSummaryDto[]>
) {
  let snapshotFiber: Fiber.Fiber<void> | undefined = void 0;
  const runFork = Effect.runForkWith(yield* Effect.context());
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      snapshotFiber?.interruptUnsafe();
    })
  );

  yield* subscribe(client, {
    event: 'request-initial-state',
    schema: atomDevToolsEventSchemas['request-initial-state'],
    handler: ({ requestId }) =>
      Effect.sync(() => {
        client.send('initial-state-result', {
          requestId,
          status: 'success',
          data: { atoms: catalog.current },
        });
      }),
  });

  yield* subscribe(client, {
    event: 'get-atom',
    schema: atomDevToolsEventSchemas['get-atom'],
    handler: ({ atomId, requestId }) =>
      Effect.sync(() => {
        snapshotFiber?.interruptUnsafe();
        if (service === void 0) {
          client.send('get-atom-result', {
            requestId,
            status: 'error',
            error: transportError(new AtomDevToolsNotReady()),
          });
          return;
        }

        snapshotFiber = runFork(
          service.watch(AtomId.make(atomId)).pipe(
            Stream.runForEach((snapshot) =>
              Effect.sync(() => {
                client.send('get-atom-result', {
                  requestId,
                  status: 'success',
                  data: AtomSnapshotDto.fromSnapshot(snapshot),
                });
              })
            ),
            Effect.catch((error) =>
              Effect.sync(() => {
                client.send('get-atom-result', {
                  requestId,
                  status: 'error',
                  error: transportError(error),
                });
              })
            )
          )
        );
      }),
  });

  yield* subscribe(client, {
    event: 'mutation',
    schema: atomDevToolsEventSchemas.mutation,
    handler: ({ mutation, requestId }) =>
      requireService(service).pipe(
        Effect.flatMap((ready) => executeMutation(ready, mutation)),
        Effect.match({
          onFailure: (error) => {
            client.send('mutation-result', {
              requestId,
              status: 'error',
              error: transportError(error),
            });
          },
          onSuccess: () => {
            client.send('mutation-result', {
              requestId,
              status: 'success',
              data: {},
            });
          },
        })
      ),
  });

  return yield* Effect.never;
});

export const useAtomDevToolsPlugin = (): void => {
  const [service, catalog] = useCoreService();
  const catalogRef = useRef(catalog);
  const client = useRozeniteDevToolsClient<AtomDevToolsEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });

  useAgentTools(service, catalog);

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    if (client !== null) {
      client.send('catalog', { atoms: catalog });
    }
  }, [catalog, client]);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }
    const fiber = Effect.runFork(connectBridge(client, service, catalogRef).pipe(Effect.scoped));
    return () => {
      fiber.interruptUnsafe();
    };
  }, [client, service]);
};
