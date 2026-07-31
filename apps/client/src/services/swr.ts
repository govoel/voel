import { Effect, Queue, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

const swrFocusSignalAtom = Atom.make(
  Stream.suspend(() =>
    Stream.callback<AppStateStatus>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          AppState.addEventListener('change', (state) => {
            Queue.offerUnsafe(queue, state);
          })
        ),
        (subscription) =>
          Effect.sync(() => {
            subscription.remove();
          })
      )
    ).pipe(
      Stream.scan(
        { activationCount: 0, previousState: AppState.currentState },
        ({ activationCount, previousState }, currentState) => ({
          activationCount:
            previousState !== 'active' && currentState === 'active'
              ? activationCount + 1
              : activationCount,
          previousState: currentState,
        })
      ),
      Stream.drop(1),
      Stream.map(({ activationCount }) => activationCount)
    )
  ),
  { initialValue: 0 }
).pipe(Atom.withLabel('SWR focus signal'));

export const swr = (options: Omit<Parameters<typeof Atom.swr>[1], 'focusSignal'>) =>
  Atom.swr({
    ...options,
    focusSignal: swrFocusSignalAtom,
  });
