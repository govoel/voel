import { Atom } from 'effect/unstable/reactivity';
import { AppState } from 'react-native';

export const appStateFocusSignalAtom = Atom.make((get) => {
  let activationCount = 0;
  let previousState = AppState.currentState;

  const subscription = AppState.addEventListener('change', (state) => {
    const becameActive = previousState !== 'active' && state === 'active';
    previousState = state;

    if (becameActive) {
      activationCount += 1;
      get.setSelf(activationCount);
    }
  });

  get.addFinalizer(() => {
    subscription.remove();
  });

  return activationCount;
});
