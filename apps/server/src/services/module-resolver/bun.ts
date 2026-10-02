import { Effect, Layer } from 'effect';

import { resolveSync } from 'bun';

import { ModuleResolutionError, ModuleResolver } from '#src/services/module-resolver/index.ts';

/** Bun's module resolution, including package exports, exposed through the shared service. */
export const BunModuleResolverLayer = Layer.succeed(ModuleResolver, {
  resolve: ({ specifier, directory }) =>
    Effect.try({
      try: () => resolveSync(specifier, directory),
      catch: (cause) => ModuleResolutionError.make({ specifier, directory, cause }),
    }),
});
