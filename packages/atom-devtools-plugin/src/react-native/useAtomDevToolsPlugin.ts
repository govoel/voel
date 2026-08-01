import { RegistryContext } from '@effect/atom-react';
import { useRozenitePluginAgentTool } from '@rozenite/agent-bridge';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Option, Schema, Stream } from 'effect';
import { AtomRegistry } from 'effect/unstable/reactivity';
import { useContext, useEffect, useRef, useState } from 'react';

import {
  ActivateState,
  AtomDevTools,
  AtomId,
  AtomNotFound,
  ClearAllStates,
  ClearState,
  Refresh,
  StateNotFound,
} from '@repo/atom-devtools-core';
import type { AtomSummary } from '@repo/atom-devtools-core';

import { ATOM_DEVTOOLS_PLUGIN_ID, atomDevToolsToolDefinitions } from '../shared/agent-tools.ts';
import type {
  AtomDevToolsEventMap,
  Mutation,
  Response,
  TransportError,
} from '../shared/protocol.ts';
import { atomSnapshotToDto, atomSummaryToDto } from '../shared/transport.ts';
import type { AtomSummaryDto } from '../shared/transport.ts';

type Service = AtomDevTools['Service'];

const getSnapshot = Effect.fn('AtomDevToolsPlugin.getSnapshot')(function* (
  service: Service,
  atomId: string
) {
  const id = AtomId.make(atomId);
  const snapshot = yield* service.watch(id).pipe(Stream.runHead);
  return yield* Option.match(snapshot, {
    onNone: () => Effect.fail(new AtomNotFound({ id })),
    onSome: Effect.succeed,
  });
});

const enrichCatalog = Effect.fn('AtomDevToolsPlugin.enrichCatalog')(function* (
  service: Service,
  summaries: readonly AtomSummary[]
) {
  return yield* Effect.forEach(
    summaries,
    (summary) =>
      getSnapshot(service, summary.id).pipe(
        Effect.map((snapshot) => atomSummaryToDto(summary, snapshot.states.length > 0)),
        Effect.catchTag('AtomNotFound', () => Effect.succeed(atomSummaryToDto(summary, false)))
      ),
    { concurrency: 'unbounded' }
  );
});

const errorMessage = (error: unknown): string => {
  if (Schema.is(AtomNotFound)(error)) {
    return `Atom "${error.id}" was not found. Call list-atoms again to get current IDs.`;
  }
  if (Schema.is(StateNotFound)(error)) {
    return `State "${error.stateId}" was not found on atom "${error.atomId}". Call get-atom to list available states.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const transportError = (error: unknown): TransportError => {
  if (Schema.is(AtomNotFound)(error)) {
    return { code: 'atom-not-found', message: errorMessage(error) };
  }
  if (Schema.is(StateNotFound)(error)) {
    return { code: 'state-not-found', message: errorMessage(error) };
  }
  return { code: 'unknown', message: errorMessage(error) };
};

const runCommand = async (
  command: Effect.Effect<void, AtomNotFound | StateNotFound>
): Promise<void> => {
  try {
    await Effect.runPromise(command);
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
};

const executeMutation = (service: Service, mutation: Mutation) => {
  switch (mutation.type) {
    case 'activate-state': {
      return service.execute(
        new ActivateState({ atomId: AtomId.make(mutation.atomId), stateId: mutation.stateId })
      );
    }
    case 'clear-state': {
      return service.execute(new ClearState({ atomId: AtomId.make(mutation.atomId) }));
    }
    case 'clear-all-states': {
      return service.execute(new ClearAllStates());
    }
    case 'refresh-atom': {
      return service.execute(new Refresh({ atomId: AtomId.make(mutation.atomId) }));
    }
    default: {
      return Effect.die(new Error('Unknown Atom DevTools mutation.'));
    }
  }
};

const useCoreService = (): readonly [Service | undefined, readonly AtomSummaryDto[]] => {
  const registry = useContext(RegistryContext);
  const [service, setService] = useState<Service>();
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
              if (active) {
                setCatalog(nextCatalog);
              }
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

const useAgentTools = (service: Service | undefined, catalog: readonly AtomSummaryDto[]): void => {
  const enabled = service !== undefined;

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.listAtoms,
    enabled,
    handler: (args) => {
      const query = args.query?.trim().toLocaleLowerCase();
      const filtered = catalog
        .filter(
          (atom) =>
            (query === undefined ||
              atom.name.toLocaleLowerCase().includes(query) ||
              atom.id.toLocaleLowerCase().includes(query)) &&
            (args.writable === undefined || atom.writable === args.writable) &&
            (args.overridden === undefined || atom.overridden === args.overridden) &&
            (args.stateCapable === undefined || atom.stateCapable === args.stateCapable)
        )
        .sort((left, right) =>
          left.name === right.name
            ? left.id.localeCompare(right.id)
            : left.name.localeCompare(right.name)
        );
      const offset = args.cursor === undefined ? 0 : Math.trunc(Number(args.cursor));
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new Error(`Invalid cursor "${args.cursor}". Start without a cursor.`);
      }
      const limit = Math.min(100, Math.max(1, args.limit ?? 50));
      const items = filtered.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      return {
        items,
        total: filtered.length,
        ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
      };
    },
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.getAtom,
    enabled,
    handler: async ({ atomId }) => {
      if (service === undefined) {
        throw new Error('Atom DevTools is still starting. Retry the call.');
      }
      try {
        const atom = await Effect.runPromise(getSnapshot(service, atomId));
        return { atom: atomSnapshotToDto(atom) };
      } catch (error) {
        throw new Error(errorMessage(error), { cause: error });
      }
    },
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.activateState,
    enabled,
    handler: async ({ atomId, stateId }) => {
      if (service === undefined) {
        throw new Error('Atom DevTools is still starting. Retry the call.');
      }
      await runCommand(
        service.execute(new ActivateState({ atomId: AtomId.make(atomId), stateId }))
      );
      return { success: true, atomId, stateId };
    },
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearState,
    enabled,
    handler: async ({ atomId }) => {
      if (service === undefined) {
        throw new Error('Atom DevTools is still starting. Retry the call.');
      }
      await runCommand(service.execute(new ClearState({ atomId: AtomId.make(atomId) })));
      return { success: true, atomId };
    },
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.clearAllStates,
    enabled,
    handler: async () => {
      if (service === undefined) {
        throw new Error('Atom DevTools is still starting. Retry the call.');
      }
      await runCommand(service.execute(new ClearAllStates()));
      return { success: true as const };
    },
  });

  useRozenitePluginAgentTool({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
    tool: atomDevToolsToolDefinitions.refreshAtom,
    enabled,
    handler: async ({ atomId }) => {
      if (service === undefined) {
        throw new Error('Atom DevTools is still starting. Retry the call.');
      }
      await runCommand(service.execute(new Refresh({ atomId: AtomId.make(atomId) })));
      return { success: true, atomId };
    },
  });
};

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
    if (client === null) {
      return;
    }
    client.send('catalog', { atoms: catalog });
  }, [catalog, client]);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }

    const initialStateSubscription = client.onMessage('request-initial-state', ({ requestId }) => {
      const response: Response<{ readonly atoms: readonly AtomSummaryDto[] }> = {
        requestId,
        status: 'success',
        data: { atoms: catalogRef.current },
      };
      client.send('initial-state-result', response);
    });
    let stopSnapshotWatch = (): void => void 0;
    const atomSubscription = client.onMessage('get-atom', ({ atomId, requestId }) => {
      stopSnapshotWatch();
      if (service === undefined) {
        client.send('get-atom-result', {
          requestId,
          status: 'error',
          error: { code: 'not-ready', message: 'Atom DevTools is still starting. Retry shortly.' },
        });
        return;
      }
      const id = AtomId.make(atomId);
      const fiber = Effect.runFork(
        service.watch(id).pipe(
          Stream.runForEach((snapshot) =>
            Effect.sync(() => {
              client.send('get-atom-result', {
                requestId,
                status: 'success',
                data: atomSnapshotToDto(snapshot),
              });
            })
          ),
          Effect.catchTag('AtomNotFound', (error) =>
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
      stopSnapshotWatch = () => {
        fiber.interruptUnsafe();
      };
    });
    const mutationSubscription = client.onMessage('mutation', ({ mutation, requestId }) => {
      if (service === undefined) {
        client.send('mutation-result', {
          requestId,
          status: 'error',
          error: { code: 'not-ready', message: 'Atom DevTools is still starting. Retry shortly.' },
        });
        return;
      }
      void (async () => {
        try {
          await Effect.runPromise(executeMutation(service, mutation));
          client.send('mutation-result', {
            requestId,
            status: 'success',
            data: { mutation },
          });
        } catch (error) {
          client.send('mutation-result', {
            requestId,
            status: 'error',
            error: transportError(error),
          });
        }
      })();
    });

    return () => {
      stopSnapshotWatch();
      initialStateSubscription.remove();
      atomSubscription.remove();
      mutationSubscription.remove();
    };
  }, [client, service]);
};
