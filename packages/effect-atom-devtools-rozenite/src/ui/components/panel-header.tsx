import { Button, PluginHeader } from '@rozenite/ui';
import { AsyncResult } from 'effect/unstable/reactivity';

import { clearAllPredefinedStatesMutation } from '#src/ui/atoms.ts';
import { useToastMutation } from '#src/ui/hooks/use-toast-mutation.ts';

export const AtomDevToolsPanelHeader = () => {
  const [clearAllResult, clearAllPredefinedStates] = useToastMutation(
    clearAllPredefinedStatesMutation,
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
          size="sm"
          disabled={AsyncResult.isWaiting(clearAllResult)}
          onClick={() => {
            void clearAllPredefinedStates({ payload: void 0 });
          }}>
          Clear all states
        </Button>
      </PluginHeader.Actions>
    </PluginHeader>
  );
};
