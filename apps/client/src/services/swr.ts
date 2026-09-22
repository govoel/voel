import { Atom } from 'effect/unstable/reactivity';
import { AppState } from 'react-native';

const swrFocusSignalAtom = Atom.readable((get) => {
  let activationCount = 0;
  let previousState = AppState.currentState;
  const subscription = AppState.addEventListener('change', (state) => {
    const activated = previousState !== 'active' && state === 'active';
    previousState = state;
    if (activated) {
      activationCount += 1;
      get.setSelf(activationCount);
    }
  });

  get.addFinalizer(() => {
    subscription.remove();
  });
  return activationCount;
}).pipe(Atom.withLabel('swrFocusSignalAtom'));

export const swr = (options: Omit<Parameters<typeof Atom.swr>[1], 'focusSignal'>) =>
  Atom.swr({
    ...options,
    focusSignal: swrFocusSignalAtom,
  });
