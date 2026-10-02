import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

/** Internal resolution failure; callers decide how to expose it at their boundary. */
export class ModuleResolutionError extends Schema.TaggedError<
  ModuleResolutionError,
  { readonly brand: unique symbol }
>('@repo/server/services/module-resolver/ModuleResolutionError')('ModuleResolutionError', {
  specifier: Schema.String,
  directory: Schema.String,
  cause: Schema.Defect(),
}) {}

/** Resolve a module specifier from a directory without importing or evaluating it. */
export class ModuleResolver extends Context.Service<
  ModuleResolver,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- runtime implementations provide this contract
  {
    readonly resolve: (request: {
      readonly specifier: string;
      readonly directory: string;
    }) => Effect.Effect<string, ModuleResolutionError>;
  }
>()('@repo/server/services/module-resolver/ModuleResolver') {}
