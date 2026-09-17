import type { ComponentProps, ReactElement } from 'react';

import { Confirmation } from '#src/components/confirmation';
import { useConfirmation } from '#src/components/confirmation/use-confirmation.ts';

/** Bind an atom mutation to native confirmation without choosing its trigger or error policy. */
export const MutationConfirmation = <Input, Success, Failure>({
  trigger,
  ...props
}: Parameters<typeof useConfirmation<Input, Success, Failure>>[0] &
  Omit<ComponentProps<typeof Confirmation>, 'state' | 'trigger'> & {
    readonly trigger: (
      state: Pick<ReturnType<typeof useConfirmation>, 'open' | 'busy'>
    ) => ReactElement;
  }) => {
  const state = useConfirmation(props);
  return <Confirmation {...props} state={state} trigger={trigger(state)} />;
};
