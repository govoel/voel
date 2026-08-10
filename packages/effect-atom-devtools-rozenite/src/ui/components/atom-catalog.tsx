import { useAtom, useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Badge, ScrollArea, Sidebar } from '@rozenite/ui';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';

import type { AtomSummary } from '@repo/effect-atom-devtools-core/atom-dev-tools';

import { atomCatalogAtom, selectedAtomIdAtom } from '#src/ui/atoms.ts';
import { ErrorState, LoadingState } from '#src/ui/components/async-states.tsx';

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
            {catalog.map((atomSummary) => (
              <Sidebar.Item
                key={atomSummary.id}
                className="h-auto py-2"
                selected={Option.contains(selectedAtomId, atomSummary.id)}
                trailing={
                  <span className="flex items-center gap-1.5">
                    {atomSummary.hasActivePredefinedState ? (
                      <span
                        className="size-2 rounded-full bg-primary"
                        title="A predefined state is active"
                      />
                    ) : null}
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {atomSummary.writable ? 'RW' : 'RO'}
                    </Badge>
                  </span>
                }
                onClick={() => {
                  setSelectedAtomId(Option.some(atomSummary.id));
                }}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{atomSummary.name}</span>
                  <code className="truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {atomSummary.id}
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

export const AtomCatalogPane = () => {
  const catalogResult = useAtomValue(atomCatalogAtom);
  const retry = useAtomRefresh(atomCatalogAtom);

  return AsyncResult.match(catalogResult, {
    onInitial: () => <LoadingState label="Subscribing to atom catalog…" />,
    onFailure: ({ cause }) => (
      <ErrorState title="Unable to load atoms" cause={cause} onRetry={retry} />
    ),
    onSuccess: ({ value }) => <AtomSidebar catalog={value} />,
  });
};
