import { useAtomSet } from '@effect/atom-react';
import { Exit, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';

import { authFailureMessage } from './auth-errors.ts';

/** Local submission state belongs to the mounted action, not the shared mutation atom. */
export const useAccountMutation = <
  Input,
  Success,
  Failure extends Parameters<typeof authFailureMessage>[0]['error'],
>({
  mutation,
}: {
  mutation: Atom.AtomResultFn<Input, Success, Failure>;
}) => {
  const run = useAtomSet(mutation, { mode: 'promiseExit' });
  const locked = useRef(false);
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'pending' }
    | { phase: 'success' }
    | { phase: 'failure'; message: string }
  >({ phase: 'idle' });

  const execute = async (input: Input) => {
    if (locked.current) {
      return false;
    }
    locked.current = true;
    setState({ phase: 'pending' });
    try {
      const result = await run(input);
      if (Exit.isSuccess(result)) {
        locked.current = false;
        setState({ phase: 'success' });
        return true;
      }
      const error = Exit.findErrorOption(result);
      setState({
        phase: 'failure',
        message: Option.isSome(error)
          ? authFailureMessage({ error: error.value })
          : 'Unable to complete the request. Refresh before retrying.',
      });
      locked.current = false;
      return false;
    } catch {
      setState({
        phase: 'failure',
        message: 'Unable to complete the request. Refresh before retrying.',
      });
      locked.current = false;
      return false;
    }
  };

  return { state, execute };
};
