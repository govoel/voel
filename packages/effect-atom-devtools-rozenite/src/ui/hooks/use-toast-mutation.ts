import { useAtom } from '@effect/atom-react';
import { useToast } from '@rozenite/ui';
import { Cause, Exit, Inspectable } from 'effect';
import type { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { useCallback } from 'react';

export const useToastMutation = <A, E, W>(
  mutation: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
  {
    id,
    title,
  }: {
    readonly id: string;
    readonly title: string;
  }
) => {
  const [mutationResult, executeMutation] = useAtom(mutation, { mode: 'promiseExit' });
  const { add: addToast } = useToast();

  const executeWithErrorToast = useCallback(
    async (value: W) => {
      const exit = await executeMutation(value);

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
    [addToast, executeMutation, id, title]
  );

  return [mutationResult, executeWithErrorToast] as const;
};
