import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { EmptyState, PluginShell, Split, Toast } from '@rozenite/ui';
import { Option } from 'effect';

import { selectedAtomIdAtom } from '#src/ui/atoms.js';
import { AtomCatalogPane } from '#src/ui/components/atom-catalog.js';
import { AtomDetailsPane } from '#src/ui/components/atom-details.js';
import { AtomDevToolsPanelHeader } from '#src/ui/components/panel-header.js';

// oxlint-disable-next-line import/no-unassigned-import
import './styles.css';

const AtomDevToolsPanelContent = () => {
  const selectedAtomId = useAtomValue(selectedAtomIdAtom);

  return (
    <PluginShell>
      <Toast>
        <AtomDevToolsPanelHeader />

        <PluginShell.Body className="overflow-hidden">
          <Split direction="horizontal">
            <Split.Pane defaultSize={27} minSize={18} maxSize={45}>
              <AtomCatalogPane />
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
                onSome: (atomId) => <AtomDetailsPane atomId={atomId} />,
              })}
            </Split.Pane>
          </Split>
        </PluginShell.Body>
      </Toast>
    </PluginShell>
  );
};

export default function AtomDevToolsPanel() {
  return (
    <RegistryProvider>
      <AtomDevToolsPanelContent />
    </RegistryProvider>
  );
}
