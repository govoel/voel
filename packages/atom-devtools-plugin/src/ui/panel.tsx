import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import {
  Button,
  Chip,
  ConfirmDialog,
  PluginHeader,
  PluginTheme,
  SearchField,
  Surface,
} from '@rozenite/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ATOM_DEVTOOLS_PLUGIN_ID } from '../shared/agent-tools.ts';
import type { AtomDevToolsEventMap, Mutation } from '../shared/protocol.ts';
import type { AtomLinkDto, AtomSnapshotDto, AtomSummaryDto } from '../shared/transport.ts';
import './globals.css';

let requestSequence = 0;
const nextRequestId = (): string => {
  requestSequence += 1;
  return `atom-devtools-${requestSequence}`;
};

type IndicatorColor = 'default' | 'success' | 'accent' | 'danger' | 'warning';

const Indicator = ({
  children,
  color = 'default',
}: {
  children: string;
  color?: IndicatorColor;
}) => (
  <Chip color={color} size="sm" variant="soft">
    {children}
  </Chip>
);

const AtomIndicators = ({ atom }: { readonly atom: AtomSummaryDto }) => (
  <div className="flex flex-wrap gap-1.5">
    <Indicator color={atom.writable ? 'accent' : 'default'}>
      {atom.writable ? 'Writable' : 'Read-only'}
    </Indicator>
    {atom.overridden ? <Indicator color="warning">Overridden</Indicator> : null}
    {atom.stateCapable ? <Indicator color="success">States</Indicator> : null}
  </div>
);

const EmptyLinks = ({ label }: { readonly label: string }) => (
  <span className="text-xs text-muted">No {label.toLocaleLowerCase()}</span>
);

const AtomLinks = ({
  label,
  links,
  onSelect,
}: {
  readonly label: string;
  readonly links: readonly AtomLinkDto[];
  readonly onSelect: (atomId: string) => void;
}) => (
  <section className="space-y-2">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
    {links.length === 0 ? <EmptyLinks label={label} /> : null}
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Button
          key={link.id}
          size="sm"
          variant="secondary"
          onPress={() => {
            onSelect(link.id);
          }}>
          {link.name}
        </Button>
      ))}
    </div>
  </section>
);

const Metadata = ({ snapshot }: { readonly snapshot: AtomSnapshotDto }) => (
  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-xs">
    <dt className="text-muted">Stable ID</dt>
    <dd className="break-all font-mono text-foreground">{snapshot.id}</dd>
    <dt className="text-muted">Source</dt>
    <dd className="break-all font-mono text-foreground">{snapshot.source ?? 'Unknown'}</dd>
    <dt className="text-muted">Subscribers</dt>
    <dd>{snapshot.subscriberCount}</dd>
    <dt className="text-muted">Keep alive</dt>
    <dd>{snapshot.keepAlive ? 'Yes' : 'No'}</dd>
    <dt className="text-muted">Lazy</dt>
    <dd>{snapshot.lazy ? 'Yes' : 'No'}</dd>
    <dt className="text-muted">Idle TTL</dt>
    <dd>{snapshot.idleTTL === undefined ? 'Default' : `${snapshot.idleTTL} ms`}</dd>
  </dl>
);

interface DetailsProps {
  readonly snapshot: AtomSnapshotDto;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly onBack: () => void;
  readonly onMutation: (mutation: Mutation) => void;
  readonly onSelect: (atomId: string) => void;
}

const AtomDetails = ({ snapshot, pending, error, onBack, onMutation, onSelect }: DetailsProps) => (
  <main className="min-h-0 flex-1 overflow-auto p-4">
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onPress={onBack}>
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{snapshot.name}</h2>
        </div>
        <AtomIndicators atom={snapshot} />
        <Button
          isDisabled={pending}
          size="sm"
          onPress={() => {
            onMutation({ type: 'refresh-atom', atomId: snapshot.id });
          }}>
          Refresh
        </Button>
      </div>

      {error === undefined ? null : (
        <Surface className="rounded-md border border-danger/60 p-3 text-sm text-danger">
          {error}
        </Surface>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="rounded-lg border border-border p-4" variant="secondary">
          <h3 className="mb-3 text-sm font-semibold">Current value</h3>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
            {snapshot.valuePreview}
          </pre>
        </Surface>
        <Surface className="rounded-lg border border-border p-4" variant="secondary">
          <h3 className="mb-3 text-sm font-semibold">Lifecycle</h3>
          <Metadata snapshot={snapshot} />
        </Surface>
      </div>

      <Surface className="rounded-lg border border-border p-4" variant="secondary">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Predefined states</h3>
          {snapshot.activeStateId === undefined ? null : (
            <Button
              isDisabled={pending}
              size="sm"
              variant="danger"
              onPress={() => {
                onMutation({ type: 'clear-state', atomId: snapshot.id });
              }}>
              Clear active state
            </Button>
          )}
        </div>
        {snapshot.states.length === 0 ? (
          <p className="text-xs text-muted">This atom has no predefined states.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.states.map((state) => {
              const active = snapshot.activeStateId === state.id;
              return (
                <button
                  key={state.id}
                  className="rounded-md border border-border bg-surface p-3 text-left hover:border-accent disabled:opacity-50"
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    onMutation({
                      type: 'activate-state',
                      atomId: snapshot.id,
                      stateId: state.id,
                    });
                  }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{state.label}</span>
                    {active ? <Indicator color="success">Active</Indicator> : null}
                  </div>
                  {state.description === undefined ? null : (
                    <p className="mt-1 text-xs text-muted">{state.description}</p>
                  )}
                  <p className="mt-2 break-all font-mono text-[11px] text-muted">{state.id}</p>
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="rounded-lg border border-border p-4" variant="secondary">
          <AtomLinks label="Dependencies" links={snapshot.dependencies} onSelect={onSelect} />
        </Surface>
        <Surface className="rounded-lg border border-border p-4" variant="secondary">
          <AtomLinks label="Dependents" links={snapshot.dependents} onSelect={onSelect} />
        </Surface>
      </div>
    </div>
  </main>
);

export default function AtomDevToolsPanel() {
  const client = useRozeniteDevToolsClient<AtomDevToolsEventMap>({
    pluginId: ATOM_DEVTOOLS_PLUGIN_ID,
  });
  const [catalog, setCatalog] = useState<readonly AtomSummaryDto[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [snapshot, setSnapshot] = useState<AtomSnapshotDto>();
  const [loading, setLoading] = useState(true);
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const selectedIdRef = useRef(selectedId);
  const atomRequestIdRef = useRef<string | undefined>(void 0);
  const pendingRequestIdRef = useRef<string | undefined>(void 0);

  const requestAtom = useCallback(
    (atomId: string): void => {
      if (client === null) {
        return;
      }
      const requestId = nextRequestId();
      atomRequestIdRef.current = requestId;
      setLoading(true);
      setError(undefined);
      client.send('get-atom', { requestId, atomId });
    },
    [client]
  );

  const selectAtom = useCallback(
    (atomId: string): void => {
      setSelectedId(atomId);
      setSnapshot(undefined);
      requestAtom(atomId);
    },
    [requestAtom]
  );

  const requestInitialState = useCallback((): void => {
    if (client !== null) {
      client.send('request-initial-state', { requestId: nextRequestId() });
    }
  }, [client]);

  const applyCatalog = useCallback((atoms: readonly AtomSummaryDto[]): void => {
    setCatalog(atoms);
    const selected = selectedIdRef.current;
    if (selected !== undefined && !atoms.some(({ id }) => id === selected)) {
      selectedIdRef.current = undefined;
      setSelectedId(undefined);
      setSnapshot(undefined);
    }
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (client === null) {
      return () => void 0;
    }

    const initialSubscription = client.onMessage('initial-state-result', (response) => {
      if (response.status === 'success') {
        applyCatalog(response.data.atoms);
      } else {
        setError(response.error.message);
      }
      setLoading(false);
    });
    const catalogSubscription = client.onMessage('catalog', ({ atoms }) => {
      applyCatalog(atoms);
    });
    const atomSubscription = client.onMessage('get-atom-result', (response) => {
      if (response.requestId !== atomRequestIdRef.current) {
        return;
      }
      if (response.status === 'success') {
        setSnapshot(response.data);
        setError(undefined);
      } else {
        setSnapshot(undefined);
        setError(response.error.message);
      }
      setLoading(false);
    });
    const mutationSubscription = client.onMessage('mutation-result', (response) => {
      if (response.requestId !== pendingRequestIdRef.current) {
        return;
      }
      pendingRequestIdRef.current = undefined;
      setPendingRequestId(undefined);
      if (response.status === 'error') {
        setError(response.error.message);
        return;
      }
      setError(undefined);
      requestInitialState();
      if (selectedIdRef.current !== undefined) {
        requestAtom(selectedIdRef.current);
      }
    });

    // A new bridge client means the panel connected or reconnected. Never rely on
    // messages retained by a previous DevTools session.
    requestInitialState();
    if (selectedIdRef.current !== undefined) {
      requestAtom(selectedIdRef.current);
    }

    return () => {
      initialSubscription.remove();
      catalogSubscription.remove();
      atomSubscription.remove();
      mutationSubscription.remove();
    };
  }, [applyCatalog, client, requestAtom, requestInitialState]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return catalog
      .filter(
        (atom) =>
          query.length === 0 ||
          atom.name.toLocaleLowerCase().includes(query) ||
          atom.id.toLocaleLowerCase().includes(query)
      )
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }, [catalog, search]);

  const mutate = (mutation: Mutation): void => {
    if (client === null || pendingRequestId !== undefined) {
      return;
    }
    const requestId = nextRequestId();
    pendingRequestIdRef.current = requestId;
    setPendingRequestId(requestId);
    setError(undefined);
    client.send('mutation', { requestId, mutation });
  };

  return (
    <PluginTheme
      className="flex h-screen flex-col bg-background text-foreground"
      defaultTheme="dark">
      <PluginHeader
        title="Atom DevTools"
        subtitle={`${catalog.length} discovered atom${catalog.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button size="sm" variant="secondary" onPress={requestInitialState}>
              Reload
            </Button>
            <Button
              size="sm"
              variant="danger"
              onPress={() => {
                setConfirmClearAll(true);
              }}>
              Clear all states
            </Button>
          </>
        }
      />

      {selectedId !== undefined && snapshot !== undefined ? (
        <AtomDetails
          error={error}
          pending={pendingRequestId !== undefined}
          snapshot={snapshot}
          onBack={() => {
            setSelectedId(undefined);
            setSnapshot(undefined);
            setError(undefined);
          }}
          onMutation={mutate}
          onSelect={selectAtom}
        />
      ) : (
        <main className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto max-w-5xl space-y-4">
            <SearchField aria-label="Search atoms" value={search} onChange={setSearch}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search atoms by name or ID…" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            {error === undefined ? null : (
              <Surface className="rounded-md border border-danger/60 p-3 text-sm text-danger">
                {error}
              </Surface>
            )}
            {loading ? <p className="py-8 text-center text-sm text-muted">Loading atoms…</p> : null}
            {!loading && filteredCatalog.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {catalog.length === 0
                  ? 'No atoms discovered. Atoms appear after the app uses them.'
                  : 'No atoms match this search.'}
              </p>
            ) : null}
            <div className="grid gap-2">
              {filteredCatalog.map((atom) => (
                <button
                  key={atom.id}
                  className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left hover:border-accent sm:flex-row sm:items-center"
                  type="button"
                  onClick={() => {
                    selectAtom(atom.id);
                  }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{atom.name}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted">{atom.id}</div>
                  </div>
                  <AtomIndicators atom={atom} />
                </button>
              ))}
            </div>
          </div>
        </main>
      )}

      <ConfirmDialog
        confirmText="Clear all states"
        isOpen={confirmClearAll}
        message="This restores normal behavior for every atom with an active predefined state."
        title="Clear every forced state?"
        onClose={() => {
          setConfirmClearAll(false);
        }}
        onConfirm={() => {
          mutate({ type: 'clear-all-states' });
        }}
      />
    </PluginTheme>
  );
}
