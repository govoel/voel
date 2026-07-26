import { Effect, Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

const CommonExpoLayers = Layer.unwrap(
  Effect.promise(async () => {
    const layers = await import('#src/services/layers.expo.ts');
    return layers.CommonExpoLayers;
  })
);

export const AppRuntime = Atom.runtime(CommonExpoLayers);
