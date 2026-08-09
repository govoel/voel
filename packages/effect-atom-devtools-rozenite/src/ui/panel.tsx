import {
  RegistryProvider,
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from '@effect/atom-react';
import {
  Badge,
  Button,
  EmptyState,
  PluginHeader,
  PluginShell,
  ScrollArea,
  Sidebar,
  Split,
  Toast,
  useToast,
} from '@rozenite/ui';
import { Cause, Exit, Inspectable, Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { Atom } from 'effect/unstable/reactivity';
import { useCallback } from 'react';
import type { ReactNode } from 'react';

import type {
  AtomId,
  AtomSnapshot,
  AtomSummary,
} from '@repo/effect-atom-devtools-core/atom-dev-tools';

import {
  activatePredefinedStateAtom,
  catalogAtom,
  clearAllPredefinedStatesAtom,
  clearPredefinedStateAtom,
  refreshAtom,
  selectedAtomIdAtom,
  snapshotAtom,
} from '#src/ui/model.ts';

// Rozenite panels import the shared UI stylesheet from their browser entry point.
// oxlint-disable-next-line import/no-unassigned-import
import './styles.css';

const LoadingState = ({ label }: { readonly label: string }) => (
  <div
    className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground"
    role="status">
    <span className="mr-2 inline-block size-3 animate-pulse rounded-full bg-primary" />
    {label}
  </div>
);

const ErrorState = ({
  title,
  cause,
  onRetry,
}: {
  readonly title: string;
  readonly cause: Cause.Cause<unknown>;
  readonly onRetry?: () => void;
}) => (
  <EmptyState
    title={title}
    description={
      <pre className="max-h-32 max-w-lg overflow-auto whitespace-pre-wrap text-left font-mono text-xs">
        {Cause.pretty(cause)}
      </pre>
    }
    action={
      onRetry ? (
        <Button variant="outline" size="compact" onClick={onRetry}>
          Retry
        </Button>
      ) : null
    }
  />
);

const DetailSection = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
    <div className="border-b border-border px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const BooleanValue = ({ value }: { readonly value: boolean }) => (
  <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>
);

const MetadataRow = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <div className="grid min-w-0 grid-cols-[minmax(6rem,0.35fr)_minmax(0,1fr)] gap-4 border-b border-border py-2.5 last:border-b-0">
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-sm text-foreground">{children}</dd>
  </div>
);

const useMutationWithErrorToast = <A, E, W>(
  mutation: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
  {
    id,
    title,
  }: {
    readonly id: string;
    readonly title: string;
  }
) => {
  const [status, runMutation] = useAtom(mutation, { mode: 'promiseExit' });
  const { add: addToast } = useToast();

  const runMutationWithErrorToast = useCallback(
    async (value: W) => {
      const exit = await runMutation(value);

      if (Exit.isFailure(exit)) {
        addToast({
          id,
          title,
          description: Inspectable.toStringUnknown(Cause.squash(exit.cause)),
          type: 'error',
          priority: 'high',
        });
      }

      return exit;
    },
    [addToast, id, runMutation, title]
  );

  return [status, runMutationWithErrorToast] as const;
};

const PredefinedStatesPanel = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => {
  const [activatePredefinedStateStatus, activatePredefinedState] = useMutationWithErrorToast(
    activatePredefinedStateAtom,
    {
      id: 'activate-predefined-state-error',
      title: 'Unable to activate predefined state',
    }
  );

  return (
    <DetailSection title="Predefined states">
      {snapshot.predefinedStates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This atom does not expose predefined states.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {snapshot.predefinedStates.map((state) => {
            const active =
              Option.isSome(snapshot.activePredefinedStateId) &&
              snapshot.activePredefinedStateId.value === state.id;

            return (
              <div
                key={state.id}
                className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {state.label}
                    </span>
                    {active ? <Badge>Active</Badge> : null}
                  </div>
                  {state.description !== void 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{state.description}</p>
                  ) : null}
                  <code className="mt-1 block truncate text-xs text-muted-foreground">
                    {state.id}
                  </code>
                </div>
                <Button
                  variant={active ? 'secondary' : 'outline'}
                  size="compact"
                  disabled={active || AsyncResult.isWaiting(activatePredefinedStateStatus)}
                  onClick={() => {
                    void activatePredefinedState({
                      payload: { atomId: snapshot.id, stateId: state.id },
                    });
                  }}>
                  {active ? 'Active' : 'Activate'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
};

const CurrentValuePanel = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <DetailSection title="Current value">
    <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-xs leading-5 text-foreground">
      {snapshot.value}
    </pre>
  </DetailSection>
);

const AtomLinks = ({
  title,
  links,
}: {
  readonly title: string;
  readonly links: AtomSnapshot['dependencies'];
}) => {
  const setSelectedAtomId = useAtomSet(selectedAtomIdAtom);

  return (
    <DetailSection title={title}>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-col gap-1">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setSelectedAtomId(Option.some(link.id));
              }}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {link.name}
              </span>
              <code className="min-w-0 max-w-full truncate text-xs text-muted-foreground">
                {link.id}
              </code>
            </button>
          ))}
        </div>
      )}
    </DetailSection>
  );
};

const GraphPanel = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    <AtomLinks
      title={`Dependencies (${snapshot.dependencies.length})`}
      links={snapshot.dependencies}
    />
    <AtomLinks title={`Dependents (${snapshot.dependents.length})`} links={snapshot.dependents} />
  </div>
);

const MetadataPanel = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <DetailSection title="Atom metadata">
    <dl>
      <MetadataRow label="Keep alive">
        <BooleanValue value={snapshot.keepAlive} />
      </MetadataRow>
      <MetadataRow label="Lazy">
        <BooleanValue value={snapshot.lazy} />
      </MetadataRow>
      <MetadataRow label="Idle TTL">
        {snapshot.idleTTL === void 0 ? (
          <span className="text-muted-foreground">Default</span>
        ) : (
          `${snapshot.idleTTL} ms`
        )}
      </MetadataRow>
      <MetadataRow label="Subscribers">{snapshot.subscriberCount}</MetadataRow>
    </dl>
  </DetailSection>
);

const SourcePanel = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <DetailSection title="Source">
    {snapshot.source !== void 0 ? (
      <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-xs leading-5 text-foreground">
        {snapshot.source}
      </pre>
    ) : (
      <p className="text-sm text-muted-foreground">
        No source information was attached to this atom.
      </p>
    )}
  </DetailSection>
);

const SnapshotDetails = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => {
  const [clearPredefinedStateStatus, clearPredefinedState] = useMutationWithErrorToast(
    clearPredefinedStateAtom,
    {
      id: 'clear-predefined-state-error',
      title: 'Unable to clear predefined state',
    }
  );
  const [refreshStatus, refresh] = useMutationWithErrorToast(refreshAtom, {
    id: 'refresh-atom-error',
    title: 'Unable to refresh atom',
  });
  const hasActivePredefinedState = Option.isSome(snapshot.activePredefinedStateId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{snapshot.name}</h2>
            <Badge variant="outline">{snapshot.writable ? 'Writable' : 'Read only'}</Badge>
            {hasActivePredefinedState ? <Badge>Predefined state</Badge> : null}
          </div>
          <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
            {snapshot.id}
          </code>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="compact"
            disabled={AsyncResult.isWaiting(refreshStatus)}
            onClick={() => {
              void refresh({ payload: { atomId: snapshot.id } });
            }}>
            Refresh
          </Button>
          <Button
            variant="outline"
            size="compact"
            disabled={
              !hasActivePredefinedState || AsyncResult.isWaiting(clearPredefinedStateStatus)
            }
            onClick={() => {
              void clearPredefinedState({ payload: { atomId: snapshot.id } });
            }}>
            Clear state
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="min-h-full min-w-0 [&>[role=presentation]]:!min-w-full [&>[role=presentation]]:max-w-full">
        <div className="flex min-w-0 flex-col gap-4 p-4">
          <PredefinedStatesPanel snapshot={snapshot} />
          <CurrentValuePanel snapshot={snapshot} />
          <GraphPanel snapshot={snapshot} />
          <MetadataPanel snapshot={snapshot} />
          <SourcePanel snapshot={snapshot} />
        </div>
      </ScrollArea>
    </div>
  );
};

const AtomDetails = ({ atomId }: { readonly atomId: AtomId }) => {
  const atomSnapshotAtom = snapshotAtom(atomId);
  const snapshot = useAtomValue(atomSnapshotAtom);
  const retry = useAtomRefresh(atomSnapshotAtom);

  return AsyncResult.match(snapshot, {
    onInitial: () => <LoadingState label="Subscribing to atom…" />,
    onFailure: ({ cause }) => (
      <ErrorState title="Unable to watch this atom" cause={cause} onRetry={retry} />
    ),
    onSuccess: ({ value }) => <SnapshotDetails snapshot={value} />,
  });
};

const AtomSidebar = ({ catalog }: { readonly catalog: readonly AtomSummary[] }) => {
  const [selectedAtomId, setSelectedAtomId] = useAtom(selectedAtomIdAtom);

  return (
    <Sidebar className="w-full overflow-hidden border-r-0 p-0">
      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="min-w-0 overflow-x-hidden [&>[role=presentation]]:!min-w-full [&>[role=presentation]]:max-w-full">
        {catalog.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No atoms are being tracked.
          </div>
        ) : (
          <Sidebar.Group className="p-2">
            {catalog.map((atom) => (
              <Sidebar.Item
                key={atom.id}
                className="h-auto py-2"
                selected={Option.contains(selectedAtomId, atom.id)}
                trailing={
                  <span className="flex items-center gap-1.5">
                    {atom.hasActivePredefinedState ? (
                      <span
                        className="size-2 rounded-full bg-primary"
                        title="A predefined state is active"
                      />
                    ) : null}
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {atom.writable ? 'RW' : 'RO'}
                    </Badge>
                  </span>
                }
                onClick={() => {
                  setSelectedAtomId(Option.some(atom.id));
                }}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{atom.name}</span>
                  <code className="truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {atom.id}
                  </code>
                </span>
              </Sidebar.Item>
            ))}
          </Sidebar.Group>
        )}
      </ScrollArea>
    </Sidebar>
  );
};

const CatalogPane = () => {
  const catalog = useAtomValue(catalogAtom);
  const retry = useAtomRefresh(catalogAtom);

  return AsyncResult.match(catalog, {
    onInitial: () => <LoadingState label="Subscribing to atom catalog…" />,
    onFailure: ({ cause }) => (
      <ErrorState title="Unable to load atoms" cause={cause} onRetry={retry} />
    ),
    onSuccess: ({ value }) => <AtomSidebar catalog={value} />,
  });
};

const PanelHeader = () => {
  const [clearAllPredefinedStatesStatus, clearAllPredefinedStates] = useMutationWithErrorToast(
    clearAllPredefinedStatesAtom,
    {
      id: 'clear-all-predefined-states-error',
      title: 'Unable to clear all predefined states',
    }
  );

  return (
    <PluginHeader>
      <PluginHeader.Title>Effect Atom DevTools</PluginHeader.Title>
      <PluginHeader.Actions>
        <Button
          variant="outline"
          size="compact"
          disabled={AsyncResult.isWaiting(clearAllPredefinedStatesStatus)}
          onClick={() => {
            void clearAllPredefinedStates({ payload: void 0 });
          }}>
          Clear all states
        </Button>
      </PluginHeader.Actions>
    </PluginHeader>
  );
};

const ConnectedPanel = () => {
  const selectedAtomId = useAtomValue(selectedAtomIdAtom);

  return (
    <PluginShell>
      <Toast.Provider>
        <PanelHeader />

        <PluginShell.Body className="overflow-hidden">
          <Split direction="horizontal">
            <Split.Pane defaultSize={27} minSize={18} maxSize={45}>
              <CatalogPane />
            </Split.Pane>
            <Split.Handle />
            <Split.Pane className="flex min-w-0 flex-col overflow-hidden">
              {Option.match(selectedAtomId, {
                onNone: () => (
                  <EmptyState
                    title="Select an atom"
                    description="Choose a tracked atom from the sidebar to inspect its live value and runtime details."
                  />
                ),
                onSome: (atomId) => <AtomDetails atomId={atomId} />,
              })}
            </Split.Pane>
          </Split>
        </PluginShell.Body>
      </Toast.Provider>
    </PluginShell>
  );
};

const AtomDevToolsPanel = () => (
  <RegistryProvider>
    <ConnectedPanel />
  </RegistryProvider>
);

export default AtomDevToolsPanel;
