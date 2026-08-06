import { RegistryProvider, useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array, Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useEffect } from 'react';

import type {
  AtomLink,
  AtomSnapshot,
  AtomSummary,
  AtomSummaryEncodedType,
} from '@repo/atom-devtools-core';

import { Badge } from '#src/ui/components/ui/badge.tsx';
import { Button } from '#src/ui/components/ui/button.tsx';
import { Card } from '#src/ui/components/ui/card.tsx';
import { Input } from '#src/ui/components/ui/input.tsx';
import {
  activateStateMutationAtom,
  backAtom,
  catalogAtom,
  clearAllStatesMutationAtom,
  clearStateMutationAtom,
  errorMessage,
  mutationErrorAtom,
  mutationPendingAtom,
  refreshAtomMutationAtom,
  searchAtom,
  selectAtom,
  selectedIdAtom,
  snapshotAtoms,
} from '#src/ui/model.ts';
import { PanelClientConnection } from '#src/ui/panel-client-connection.tsx';
// oxlint-disable-next-line import/no-unassigned-import
import '#src/ui/globals.css';

type IndicatorColor = 'default' | 'success' | 'accent' | 'danger' | 'warning';

const getIndicatorVariant = (
  color: IndicatorColor
): 'secondary' | 'success' | 'accent' | 'destructive' | 'warning' => {
  if (color === 'default') {
    return 'secondary';
  }
  if (color === 'danger') {
    return 'destructive';
  }
  return color;
};

const Indicator = ({
  children,
  color = 'default',
}: {
  children: string;
  color?: IndicatorColor;
}) => <Badge variant={getIndicatorVariant(color)}>{children}</Badge>;

const AtomIndicators = ({ atom }: { readonly atom: typeof AtomSummary.Encoded }) => (
  <div className="flex flex-wrap gap-1.5">
    <Indicator color={atom.writable ? 'accent' : 'default'}>
      {atom.writable ? 'Writable' : 'Read-only'}
    </Indicator>
    {atom.overridden ? <Indicator color="warning">Overridden</Indicator> : null}
  </div>
);

const EmptyLinks = ({ label }: { readonly label: string }) => (
  <span className="text-xs text-muted-foreground">No {label.toLocaleLowerCase()}</span>
);

const AtomLinks = ({
  label,
  links,
}: {
  readonly label: string;
  readonly links: readonly (typeof AtomLink.Encoded)[];
}) => {
  const select = useAtomSet(selectAtom);

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {links.length === 0 ? <EmptyLinks label={label} /> : null}
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button
            key={link.id}
            size="sm"
            variant="secondary"
            onClick={() => {
              select(link.id);
            }}>
            {link.name}
          </Button>
        ))}
      </div>
    </section>
  );
};

const Metadata = ({ snapshot }: { readonly snapshot: typeof AtomSnapshot.Encoded }) => (
  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-xs">
    <dt className="text-muted-foreground">Stable ID</dt>
    <dd className="break-all font-mono text-foreground">{snapshot.id}</dd>
    <dt className="text-muted-foreground">Source</dt>
    <dd className="break-all font-mono text-foreground">{snapshot.source ?? 'Unknown'}</dd>
    <dt className="text-muted-foreground">Subscribers</dt>
    <dd>{snapshot.subscriberCount}</dd>
    <dt className="text-muted-foreground">Keep alive</dt>
    <dd>{snapshot.keepAlive ? 'Yes' : 'No'}</dd>
    <dt className="text-muted-foreground">Lazy</dt>
    <dd>{snapshot.lazy ? 'Yes' : 'No'}</dd>
    <dt className="text-muted-foreground">Idle TTL</dt>
    <dd>{snapshot.idleTTL === void 0 ? 'Default' : `${snapshot.idleTTL} ms`}</dd>
  </dl>
);

const ErrorNotice = ({ error }: { readonly error: string | undefined }) =>
  error === void 0 ? null : (
    <Card className="rounded-md border-destructive/60 p-3 text-sm text-destructive">{error}</Card>
  );

const AtomDetails = ({ snapshot }: { readonly snapshot: typeof AtomSnapshot.Encoded }) => {
  const activateState = useAtomSet(activateStateMutationAtom);
  const back = useAtomSet(backAtom);
  const clearState = useAtomSet(clearStateMutationAtom);
  const mutationError = useAtomValue(mutationErrorAtom);
  const refreshAtom = useAtomSet(refreshAtomMutationAtom);
  const pending = useAtomValue(mutationPendingAtom);

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              back(void 0);
            }}>
            Back
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{snapshot.name}</h2>
          </div>
          <AtomIndicators atom={snapshot} />
          <Button
            disabled={pending}
            size="sm"
            onClick={() => {
              refreshAtom({ payload: { atomId: snapshot.id } });
            }}>
            Refresh
          </Button>
        </div>

        <ErrorNotice error={mutationError} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-lg p-4">
            <h3 className="mb-3 text-sm font-semibold">Current value</h3>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
              {snapshot.value}
            </pre>
          </Card>
          <Card className="rounded-lg p-4">
            <h3 className="mb-3 text-sm font-semibold">Lifecycle</h3>
            <Metadata snapshot={snapshot} />
          </Card>
        </div>

        <Card className="rounded-lg p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Predefined states</h3>
            {snapshot.activeStateId === void 0 ? null : (
              <Button
                disabled={pending}
                size="sm"
                variant="destructive"
                onClick={() => {
                  clearState({ payload: { atomId: snapshot.id } });
                }}>
                Clear active state
              </Button>
            )}
          </div>
          {snapshot.states.length === 0 ? (
            <p className="text-xs text-muted-foreground">This atom has no predefined states.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {snapshot.states.map((state) => {
                const active = snapshot.activeStateId === state.id;
                return (
                  <button
                    key={state.id}
                    className="rounded-md border bg-card p-3 text-left hover:border-accent disabled:opacity-50"
                    disabled={pending}
                    type="button"
                    onClick={() => {
                      activateState({
                        payload: {
                          atomId: snapshot.id,
                          stateId: state.id,
                        },
                      });
                    }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{state.label}</span>
                      {active ? <Indicator color="success">Active</Indicator> : null}
                    </div>
                    {state.description === void 0 ? null : (
                      <p className="mt-1 text-xs text-muted-foreground">{state.description}</p>
                    )}
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      {state.id}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-lg p-4">
            <AtomLinks label="Dependencies" links={snapshot.dependencies} />
          </Card>
          <Card className="rounded-lg p-4">
            <AtomLinks label="Dependents" links={snapshot.dependents} />
          </Card>
        </div>
      </div>
    </main>
  );
};

const PanelHeader = ({ catalogCount }: { readonly catalogCount: number }) => {
  const clearAllStates = useAtomSet(clearAllStatesMutationAtom);

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3">
      <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center">
        <h1 className="truncate text-sm font-semibold">Atom DevTools</h1>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {catalogCount} discovered atom{catalogCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            clearAllStates({ payload: void 0 });
          }}>
          Clear all states
        </Button>
      </div>
    </header>
  );
};

const Catalog = ({ catalog }: { readonly catalog: readonly AtomSummaryEncodedType[] }) => {
  const [search, setSearch] = useAtom(searchAtom);
  const mutationError = useAtomValue(mutationErrorAtom);
  const select = useAtomSet(selectAtom);
  const query = search.trim().toLocaleLowerCase();
  const filteredCatalog = catalog
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

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
          <Input
            aria-label="Search atoms"
            className="pl-9 pr-9"
            placeholder="Search atoms by name or ID…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          {search.length > 0 ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 top-1/2 size-6 -translate-y-1/2 rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              type="button"
              onClick={() => {
                setSearch('');
              }}>
              ×
            </button>
          ) : null}
        </div>

        <ErrorNotice error={mutationError} />
        {filteredCatalog.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {catalog.length === 0
              ? 'No atoms discovered. Atoms appear after the app uses them.'
              : 'No atoms match this search.'}
          </p>
        ) : null}
        <div className="grid gap-2">
          {filteredCatalog.map((atom) => (
            <button
              key={atom.id}
              className="flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left hover:border-accent sm:flex-row sm:items-center"
              type="button"
              onClick={() => {
                select(atom.id);
              }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{atom.name}</div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {atom.id}
                </div>
              </div>
              <AtomIndicators atom={atom} />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
};

const SelectedAtomFallback = ({
  error,
  loading,
}: {
  readonly error?: string | undefined;
  readonly loading: boolean;
}) => {
  const mutationError = useAtomValue(mutationErrorAtom);
  const back = useAtomSet(backAtom);

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            back(void 0);
          }}>
          Back
        </Button>
        <ErrorNotice error={mutationError ?? error} />
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading atom…</p>
        ) : null}
      </div>
    </main>
  );
};

const SelectedAtom = ({ atomId }: { readonly atomId: string }) => {
  const [result, pull] = useAtom(snapshotAtoms(atomId));

  useEffect(() => {
    if (AsyncResult.isSuccess(result) && !result.waiting && !result.value.done) {
      pull(void 0);
    }
  }, [pull, result]);

  return AsyncResult.matchWithError(result, {
    onInitial: () => <SelectedAtomFallback loading />,
    onError: (error) => <SelectedAtomFallback error={errorMessage(error)} loading={false} />,
    onDefect: (defect) => <SelectedAtomFallback error={errorMessage(defect)} loading={false} />,
    onSuccess: ({ value }) => <AtomDetails snapshot={Array.lastNonEmpty(value.items)} />,
  });
};

const PanelContent = ({ catalog }: { readonly catalog: readonly AtomSummaryEncodedType[] }) => {
  const selectedId = useAtomValue(selectedIdAtom);
  return Option.match(selectedId, {
    onNone: () => <Catalog catalog={catalog} />,
    onSome: (atomId) => <SelectedAtom atomId={atomId} />,
  });
};

const CatalogFallback = ({
  error,
  loading,
}: {
  readonly error?: string | undefined;
  readonly loading: boolean;
}) => (
  <>
    <PanelHeader catalogCount={0} />
    <main className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <ErrorNotice error={error} />
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading atoms…</p>
        ) : null}
      </div>
    </main>
  </>
);

const Panel = () => {
  const [result, pull] = useAtom(catalogAtom);

  useEffect(() => {
    if (AsyncResult.isSuccess(result) && !result.waiting && !result.value.done) {
      pull(void 0);
    }
  }, [pull, result]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      {AsyncResult.matchWithError(result, {
        onInitial: () => <CatalogFallback loading />,
        onError: (error) => <CatalogFallback error={errorMessage(error)} loading={false} />,
        onDefect: (defect) => <CatalogFallback error={errorMessage(defect)} loading={false} />,
        onSuccess: ({ value }) => {
          const catalog = Array.lastNonEmpty(value.items);
          return (
            <>
              <PanelHeader catalogCount={catalog.length} />
              <PanelContent catalog={catalog} />
            </>
          );
        },
      })}
    </div>
  );
};

export default function AtomDevToolsPanel() {
  return (
    <RegistryProvider>
      <PanelClientConnection />
      <Panel />
    </RegistryProvider>
  );
}
