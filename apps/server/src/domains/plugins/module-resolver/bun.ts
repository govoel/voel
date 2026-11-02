import { Effect, Layer } from 'effect';

import { resolveSync } from 'bun';

import {
  ModuleResolutionError,
  ModuleResolver,
} from '#src/domains/plugins/module-resolver/index.ts';

export const BunModuleResolverLayer = Layer.succeed(ModuleResolver, {
  resolve: ({ specifier, directory }) =>
    Effect.try({
      try: () => resolveSync(specifier, directory),
      catch: (cause) => ModuleResolutionError.make({ specifier, directory, cause }),
    }),
});
