import { useAtomRefresh, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Badge, Button, ScrollArea } from '@rozenite/ui';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { ReactNode } from 'react';

import type { AtomId, AtomSnapshot } from '@repo/effect-atom-devtools-core/atom-dev-tools';

import {
  activatePredefinedStateMutation,
  atomSnapshotAtomFamily,
  clearPredefinedStateMutation,
  refreshAtomMutation,
  selectedAtomIdAtom,
} from '#src/ui/atoms.ts';
import { ErrorState, LoadingState } from '#src/ui/components/async-states.tsx';
import { useToastMutation } from '#src/ui/hooks/use-toast-mutation.ts';

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
  <Badge tone={value ? 'primary' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>
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

const PredefinedStatesSection = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => {
  const [activateResult, activatePredefinedState] = useToastMutation(
    activatePredefinedStateMutation,
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
            const isActive =
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
                    {isActive ? <Badge>Active</Badge> : null}
                  </div>
                  {state.description !== void 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{state.description}</p>
                  ) : null}
                  <code className="mt-1 block truncate text-xs text-muted-foreground">
                    {state.id}
                  </code>
                </div>
                <Button
                  tone="neutral"
                  variant={isActive ? 'solid' : 'outline'}
                  size="sm"
                  disabled={isActive || AsyncResult.isWaiting(activateResult)}
                  onClick={() => {
                    void activatePredefinedState({
                      payload: { atomId: snapshot.id, stateId: state.id },
                    });
                  }}>
                  {isActive ? 'Active' : 'Activate'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
};

const CurrentValueSection = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <DetailSection title="Current value">
    <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-xs leading-5 text-foreground">
      {snapshot.value}
    </pre>
  </DetailSection>
);

const AtomLinksSection = ({
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

const AtomRelationshipsSection = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    <AtomLinksSection
      title={`Dependencies (${snapshot.dependencies.length})`}
      links={snapshot.dependencies}
    />
    <AtomLinksSection
      title={`Dependents (${snapshot.dependents.length})`}
      links={snapshot.dependents}
    />
  </div>
);

const AtomMetadataSection = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
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

const AtomSourceSection = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => (
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

const AtomSnapshotView = ({ snapshot }: { readonly snapshot: AtomSnapshot }) => {
  const [clearStateResult, clearPredefinedState] = useToastMutation(clearPredefinedStateMutation, {
    id: 'clear-predefined-state-error',
    title: 'Unable to clear predefined state',
  });
  const [refreshResult, refreshAtom] = useToastMutation(refreshAtomMutation, {
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
            size="sm"
            disabled={AsyncResult.isWaiting(refreshResult)}
            onClick={() => {
              void refreshAtom({ payload: { atomId: snapshot.id } });
            }}>
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasActivePredefinedState || AsyncResult.isWaiting(clearStateResult)}
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
          <PredefinedStatesSection snapshot={snapshot} />
          <CurrentValueSection snapshot={snapshot} />
          <AtomRelationshipsSection snapshot={snapshot} />
          <AtomMetadataSection snapshot={snapshot} />
          <AtomSourceSection snapshot={snapshot} />
        </div>
      </ScrollArea>
    </div>
  );
};

export const AtomDetailsPane = ({ atomId }: { readonly atomId: AtomId }) => {
  const snapshotAtom = atomSnapshotAtomFamily(atomId);
  const snapshotResult = useAtomValue(snapshotAtom);
  const retry = useAtomRefresh(snapshotAtom);

  return AsyncResult.match(snapshotResult, {
    onInitial: () => <LoadingState label="Subscribing to atom…" />,
    onFailure: ({ cause }) => (
      <ErrorState title="Unable to watch this atom" cause={cause} onRetry={retry} />
    ),
    onSuccess: ({ value }) => <AtomSnapshotView snapshot={value} />,
  });
};
