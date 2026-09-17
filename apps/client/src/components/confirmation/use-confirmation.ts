import { useAtomSet } from '@effect/atom-react';
import { Exit, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';

/** Mutation lifecycle only: callers own triggers, native presentation, and domain error messages. */
export const useConfirmation = <Input, Success, Failure>({
  mutation,
  input,
  onFailure,
  onSuccess,
}: {
  readonly mutation: Atom.AtomResultFn<Input, Success, Failure>;
  readonly input: Input;
  readonly onFailure: (props: { readonly error: Failure }) => string;
  readonly onSuccess?: () => void | Promise<void>;
}) => {
  const run = useAtomSet(mutation, { mode: 'promiseExit' });
  const locked = useRef(false);
  const [state, setState] = useState<
    | { readonly phase: 'closed' | 'confirming' | 'running' }
    | { readonly phase: 'failed' | 'completed'; readonly feedback: string }
  >({ phase: 'closed' });

  const execute = async () => {
    if (locked.current || (state.phase !== 'confirming' && state.phase !== 'failed')) {
      return;
    }
    locked.current = true;
    setState({ phase: 'running' });
    try {
      const result = await run(input);
      if (Exit.isFailure(result)) {
        const error = Exit.findErrorOption(result);
        setState({
          phase: 'failed',
          feedback: Option.isSome(error)
            ? onFailure({ error: error.value })
            : 'Unable to complete the request. Refresh before retrying.',
        });
      } else {
        setState({ phase: 'completed', feedback: 'Done.' });
        try {
          await onSuccess?.();
        } catch {
          // The mutation succeeded: never offer to repeat it because navigation/cleanup failed.
          setState({
            phase: 'completed',
            feedback: 'Request completed, but the follow-up failed. Refresh to continue.',
          });
        }
      }
    } catch {
      setState({
        phase: 'failed',
        feedback: 'Unable to confirm completion. Refresh before retrying.',
      });
    }
    locked.current = false;
  };

  return {
    presented:
      state.phase === 'confirming' || state.phase === 'running' || state.phase === 'failed',
    busy: state.phase === 'running',
    feedback: 'feedback' in state ? state.feedback : '',
    execute,
    open: () => {
      if (!locked.current) {
        setState({ phase: 'confirming' });
      }
    },
    handleDismiss: () => {
      if (!locked.current) {
        setState({ phase: 'closed' });
      }
    },
  };
};
