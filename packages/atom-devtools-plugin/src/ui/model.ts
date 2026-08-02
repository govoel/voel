import { Atom } from 'effect/unstable/reactivity';

import type { AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';

interface PanelState {
  readonly catalog: readonly AtomSummaryDto[];
  readonly search: string;
  readonly selectedId: string | undefined;
  readonly snapshot: AtomSnapshotDto | undefined;
  readonly loading: boolean;
  readonly initialRequestId: string | undefined;
  readonly atomRequestId: string | undefined;
  readonly pendingRequestId: string | undefined;
  readonly error: string | undefined;
  readonly confirmClearAll: boolean;
}

const initialPanelState: PanelState = {
  catalog: [],
  search: '',
  selectedId: void 0,
  snapshot: void 0,
  loading: true,
  initialRequestId: void 0,
  atomRequestId: void 0,
  pendingRequestId: void 0,
  error: void 0,
  confirmClearAll: false,
};

export const panelStateAtom = Atom.make<PanelState>(initialPanelState);

export const filteredCatalogAtom = Atom.make((get) => {
  const { catalog, search } = get(panelStateAtom);
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

export const withCatalog = (state: PanelState, catalog: readonly AtomSummaryDto[]): PanelState => {
  const selectedExists =
    state.selectedId === void 0 || catalog.some(({ id }) => id === state.selectedId);
  return {
    ...state,
    catalog,
    ...(selectedExists
      ? {}
      : {
          selectedId: void 0,
          snapshot: void 0,
          atomRequestId: void 0,
        }),
  };
};
