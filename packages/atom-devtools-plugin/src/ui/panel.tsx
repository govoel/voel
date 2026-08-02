import { RegistryProvider, useAtom, useAtomValue } from '@effect/atom-react';

import {
  ActivateStateMutation,
  ClearAllStatesMutation,
  ClearStateMutation,
  RefreshAtomMutation,
} from '#src/shared/protocol.ts';
import type { Mutation } from '#src/shared/protocol.ts';
import type { AtomLinkDto, AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';
import { ConfirmDialog } from '#src/ui/components/confirm-dialog.tsx';
import { PluginHeader } from '#src/ui/components/plugin-header.tsx';
import { PluginTheme } from '#src/ui/components/plugin-theme.tsx';
import { Badge } from '#src/ui/components/ui/badge.tsx';
import { Button } from '#src/ui/components/ui/button.tsx';
import { Card } from '#src/ui/components/ui/card.tsx';
import { Input } from '#src/ui/components/ui/input.tsx';
import { filteredCatalogAtom, panelStateAtom } from '#src/ui/model.ts';
import { usePanelClient } from '#src/ui/use-panel-client.ts';
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
  <span className="text-xs text-muted-foreground">No {label.toLocaleLowerCase()}</span>
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
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
    {links.length === 0 ? <EmptyLinks label={label} /> : null}
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Button
          key={link.id}
          size="sm"
          variant="secondary"
          onClick={() => {
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

const AtomDetails = ({
  snapshot,
  pending,
  error,
  onBack,
  onMutation,
  onSelect,
}: {
  readonly snapshot: AtomSnapshotDto;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly onBack: () => void;
  readonly onMutation: (mutation: Mutation) => void;
  readonly onSelect: (atomId: string) => void;
}) => (
  <main className="min-h-0 flex-1 overflow-auto p-4">
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onBack}>
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
            onMutation(new RefreshAtomMutation({ atomId: snapshot.id }));
          }}>
          Refresh
        </Button>
      </div>

      {error === void 0 ? null : (
        <Card className="rounded-md border-destructive/60 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

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
                onMutation(new ClearStateMutation({ atomId: snapshot.id }));
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
                    onMutation(
                      new ActivateStateMutation({
                        atomId: snapshot.id,
                        stateId: state.id,
                      })
                    );
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
          <AtomLinks label="Dependencies" links={snapshot.dependencies} onSelect={onSelect} />
        </Card>
        <Card className="rounded-lg p-4">
          <AtomLinks label="Dependents" links={snapshot.dependents} onSelect={onSelect} />
        </Card>
      </div>
    </div>
  </main>
);

const Panel = () => {
  const [state, setState] = useAtom(panelStateAtom);
  const filteredCatalog = useAtomValue(filteredCatalogAtom);
  const { mutate, reload, selectAtom } = usePanelClient();
  const {
    catalog,
    confirmClearAll,
    error,
    loading,
    pendingRequestId,
    search,
    selectedId,
    snapshot,
  } = state;

  return (
    <PluginTheme
      className="flex h-screen flex-col bg-background text-foreground"
      defaultTheme="dark">
      <PluginHeader
        title="Atom DevTools"
        subtitle={`${catalog.length} discovered atom${catalog.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={reload}>
              Reload
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setState((current) => ({ ...current, confirmClearAll: true }));
              }}>
              Clear all states
            </Button>
          </>
        }
      />

      {selectedId !== void 0 && snapshot !== void 0 ? (
        <AtomDetails
          error={error}
          pending={pendingRequestId !== void 0}
          snapshot={snapshot}
          onBack={() => {
            setState((current) => ({
              ...current,
              selectedId: void 0,
              snapshot: void 0,
              atomRequestId: void 0,
              error: void 0,
            }));
          }}
          onMutation={mutate}
          onSelect={selectAtom}
        />
      ) : (
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
                  const nextSearch = event.target.value;
                  setState((current) => ({ ...current, search: nextSearch }));
                }}
              />
              {search.length > 0 ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 size-6 -translate-y-1/2 rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  type="button"
                  onClick={() => {
                    setState((current) => ({ ...current, search: '' }));
                  }}>
                  ×
                </button>
              ) : null}
            </div>

            {error === void 0 ? null : (
              <Card className="rounded-md border-destructive/60 p-3 text-sm text-destructive">
                {error}
              </Card>
            )}
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading atoms…</p>
            ) : null}
            {!loading && filteredCatalog.length === 0 ? (
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
                    selectAtom(atom.id);
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
      )}

      <ConfirmDialog
        confirmText="Clear all states"
        open={confirmClearAll}
        message="This restores normal behavior for every atom with an active predefined state."
        title="Clear every forced state?"
        onOpenChange={(open) => {
          if (!open) {
            setState((current) => ({ ...current, confirmClearAll: false }));
          }
        }}
        onConfirm={() => {
          mutate(new ClearAllStatesMutation());
        }}
      />
    </PluginTheme>
  );
};

export default function AtomDevToolsPanel() {
  return (
    <RegistryProvider>
      <Panel />
    </RegistryProvider>
  );
}
