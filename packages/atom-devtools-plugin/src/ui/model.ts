import type { RozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import type { AtomRegistry } from 'effect/unstable/reactivity';

import type { AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

import { encodePayload, subscribe } from '#src/shared/bridge.ts';
import { atomDevToolsEventSchemas } from '#src/shared/protocol.ts';
import type { AtomDevToolsEventMap, Mutation, TransportError } from '#src/shared/protocol.ts';

type Client = RozeniteDevToolsClient<AtomDevToolsEventMap>;

interface Requests {
  readonly initial: string | undefined;
  readonly atom: string | undefined;
  readonly mutation: string | undefined;
}

export interface PanelView {
  readonly catalog: readonly (typeof AtomSummary.Encoded)[];
  readonly confirmClearAll: boolean;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly mutationPending: boolean;
  readonly search: string;
  readonly selectedId: string | undefined;
  readonly snapshot: typeof AtomSnapshot.Encoded | undefined;
}

const clientAtom = Atom.make<Client | undefined>(void 0);
const requestsAtom = Atom.make<Requests>({
  initial: void 0,
  atom: void 0,
  mutation: void 0,
});
const requestSequenceAtom = Atom.make(0);
const catalogResultAtom = Atom.make<
  AsyncResult.AsyncResult<readonly (typeof AtomSummary.Encoded)[], TransportError>
>(AsyncResult.initial(true));
const snapshotResultAtom = Atom.make<
  AsyncResult.AsyncResult<typeof AtomSnapshot.Encoded, TransportError>
>(AsyncResult.initial());
const mutationResultAtom = Atom.make<AsyncResult.AsyncResult<void, TransportError>>(
  AsyncResult.initial()
);
const selectedIdAtom = Atom.make<string | undefined>(void 0);

export const searchAtom = Atom.make('');
export const confirmClearAllAtom = Atom.make(false);

const nextRequestId = (registry: AtomRegistry.AtomRegistry): string => {
  const sequence = registry.get(requestSequenceAtom) + 1;
  registry.set(requestSequenceAtom, sequence);
  return `atom-devtools-${sequence}`;
};

const requestCatalog = (client: Client, registry: AtomRegistry.AtomRegistry): void => {
  const requestId = nextRequestId(registry);
  registry.update(requestsAtom, (requests) => ({ ...requests, initial: requestId }));
  registry.update(catalogResultAtom, AsyncResult.waiting);
  client.send(
    'request-initial-state',
    encodePayload(atomDevToolsEventSchemas['request-initial-state'], { requestId })
  );
};

const requestSnapshot = (options: {
  readonly atomId: string;
  readonly client: Client;
  readonly preservePrevious: boolean;
  readonly registry: AtomRegistry.AtomRegistry;
}): void => {
  const { atomId, client, preservePrevious, registry } = options;
  const requestId = nextRequestId(registry);
  registry.update(requestsAtom, (requests) => ({ ...requests, atom: requestId }));
  registry.update(snapshotResultAtom, (result) =>
    preservePrevious ? AsyncResult.waiting(result) : AsyncResult.initial(true)
  );
  client.send(
    'get-atom',
    encodePayload(atomDevToolsEventSchemas['get-atom'], { requestId, atomId })
  );
};

const replaceCatalog = (
  registry: AtomRegistry.AtomRegistry,
  catalog: readonly (typeof AtomSummary.Encoded)[]
): void => {
  registry.set(catalogResultAtom, AsyncResult.success(catalog));
  const selectedId = registry.get(selectedIdAtom);
  if (selectedId !== void 0 && !catalog.some(({ id }) => id === selectedId)) {
    registry.set(selectedIdAtom, void 0);
    registry.set(snapshotResultAtom, AsyncResult.initial());
    registry.update(requestsAtom, (requests) => ({ ...requests, atom: void 0 }));
  }
};

const errorOf = <A>(result: AsyncResult.AsyncResult<A, TransportError>): string | undefined =>
  Option.getOrUndefined(Option.map(AsyncResult.error(result), ({ message }) => message));

export const panelViewAtom = Atom.make((get): PanelView => {
  const catalogResult = get(catalogResultAtom);
  const snapshotResult = get(snapshotResultAtom);
  const mutationResult = get(mutationResultAtom);
  const catalog = Option.getOrElse(AsyncResult.value(catalogResult), () => []);
  const snapshot = Option.getOrUndefined(AsyncResult.value(snapshotResult));
  return {
    catalog,
    confirmClearAll: get(confirmClearAllAtom),
    error: errorOf(mutationResult) ?? errorOf(snapshotResult) ?? errorOf(catalogResult),
    loading:
      (catalogResult.waiting && catalog.length === 0) ||
      (get(selectedIdAtom) !== void 0 && snapshot === void 0),
    mutationPending: mutationResult.waiting,
    search: get(searchAtom),
    selectedId: get(selectedIdAtom),
    snapshot,
  };
});

export const filteredCatalogAtom = Atom.make((get) => {
  const { catalog, search } = get(panelViewAtom);
  const query = search.trim().toLocaleLowerCase();
  return catalog
    .filter(
      (atom) =>
        query.length === 0 ||
        atom.name.toLocaleLowerCase().includes(query) ||
        atom.id.toLocaleLowerCase().includes(query)
    )
    .toSorted((left, right) =>
      left.name === right.name
        ? left.id.localeCompare(right.id)
        : left.name.localeCompare(right.name)
    );
});

export const reloadAtom = Atom.fn<undefined>()(
  Effect.fn('PanelModel.reload')(function* (_, get) {
    const client = get(clientAtom);
    if (client !== void 0) {
      yield* Effect.sync(() => {
        get.registry.set(mutationResultAtom, AsyncResult.initial());
        requestCatalog(client, get.registry);
      });
    }
  })
);

export const selectAtom = Atom.fn<string>()(
  Effect.fn('PanelModel.selectAtom')(function* (atomId, get) {
    yield* Effect.sync(() => {
      get.registry.set(selectedIdAtom, atomId);
      get.registry.set(snapshotResultAtom, AsyncResult.initial(true));
      get.registry.set(mutationResultAtom, AsyncResult.initial());
      const client = get(clientAtom);
      if (client !== void 0) {
        requestSnapshot({ atomId, client, preservePrevious: false, registry: get.registry });
      }
    });
  })
);

export const backAtom = Atom.fn<undefined>()(
  Effect.fn('PanelModel.back')(function* (_, get) {
    yield* Effect.sync(() => {
      get.registry.set(selectedIdAtom, void 0);
      get.registry.set(snapshotResultAtom, AsyncResult.initial());
      get.registry.set(mutationResultAtom, AsyncResult.initial());
      get.registry.update(requestsAtom, (requests) => ({ ...requests, atom: void 0 }));
    });
  })
);

export const mutateAtom = Atom.fn<Mutation>()(
  Effect.fn('PanelModel.mutate')(function* (mutation, get) {
    yield* Effect.sync(() => {
      const client = get(clientAtom);
      if (client === void 0 || get.registry.get(mutationResultAtom).waiting) {
        return;
      }
      const requestId = nextRequestId(get.registry);
      get.registry.update(requestsAtom, (requests) => ({ ...requests, mutation: requestId }));
      get.registry.set(mutationResultAtom, AsyncResult.initial(true));
      get.registry.set(confirmClearAllAtom, false);
      client.send(
        'mutation',
        encodePayload(atomDevToolsEventSchemas.mutation, { requestId, mutation })
      );
    });
  })
);

export const connectPanelAtom = Atom.fn<Client>()(
  Effect.fn('PanelModel.connect')(function* (client, get) {
    const { registry } = get;
    yield* Effect.sync(() => {
      registry.set(clientAtom, client);
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (registry.get(clientAtom) === client) {
          registry.set(clientAtom, void 0);
          registry.set(requestsAtom, {
            initial: void 0,
            atom: void 0,
            mutation: void 0,
          });
          registry.set(mutationResultAtom, AsyncResult.initial());
        }
      })
    );

    yield* subscribe(client, {
      event: 'initial-state-result',
      schema: atomDevToolsEventSchemas['initial-state-result'],
      handler: (response) =>
        Effect.sync(() => {
          if (registry.get(requestsAtom).initial !== response.requestId) {
            return;
          }
          registry.update(requestsAtom, (requests) => ({ ...requests, initial: void 0 }));
          if (response.status === 'error') {
            registry.set(catalogResultAtom, AsyncResult.fail(response.error));
          } else {
            replaceCatalog(registry, response.data.atoms);
          }
        }),
    });

    yield* subscribe(client, {
      event: 'catalog',
      schema: atomDevToolsEventSchemas.catalog,
      handler: ({ atoms }) =>
        Effect.sync(() => {
          replaceCatalog(registry, atoms);
        }),
    });

    yield* subscribe(client, {
      event: 'get-atom-result',
      schema: atomDevToolsEventSchemas['get-atom-result'],
      handler: (response) =>
        Effect.sync(() => {
          if (registry.get(requestsAtom).atom !== response.requestId) {
            return;
          }
          registry.update(requestsAtom, (requests) => ({ ...requests, atom: void 0 }));
          if (response.status === 'error') {
            registry.set(snapshotResultAtom, AsyncResult.fail(response.error));
            registry.set(selectedIdAtom, void 0);
          } else if (registry.get(selectedIdAtom) === response.data.id) {
            registry.set(snapshotResultAtom, AsyncResult.success(response.data));
          }
        }),
    });

    yield* subscribe(client, {
      event: 'mutation-result',
      schema: atomDevToolsEventSchemas['mutation-result'],
      handler: (response) =>
        Effect.sync(() => {
          if (registry.get(requestsAtom).mutation !== response.requestId) {
            return;
          }
          registry.update(requestsAtom, (requests) => ({ ...requests, mutation: void 0 }));
          if (response.status === 'error') {
            registry.set(mutationResultAtom, AsyncResult.fail(response.error));
            return;
          }
          registry.set(mutationResultAtom, AsyncResult.success(void 0));
          requestCatalog(client, registry);
          const selectedId = registry.get(selectedIdAtom);
          if (selectedId !== void 0) {
            requestSnapshot({ atomId: selectedId, client, preservePrevious: true, registry });
          }
        }),
    });

    yield* Effect.sync(() => {
      requestCatalog(client, registry);
      const selectedId = registry.get(selectedIdAtom);
      if (selectedId !== void 0) {
        requestSnapshot({ atomId: selectedId, client, preservePrevious: true, registry });
      }
    });
    return yield* Effect.never;
  })
);
