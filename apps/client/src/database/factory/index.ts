import { Context } from 'effect';
import type { Effect, Scope } from 'effect';
import type { Reactivity } from 'effect/reactivity';
import type { SqlError } from 'effect/sql';

import type { TursoSyncClient, TursoSyncClientOptions } from '@repo/effect-turso-sync';

export class TursoSyncClientFactory extends Context.Service<
  TursoSyncClientFactory,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- Platform-specific files provide the shared service shape.
  {
    readonly make: <R = never>(
      options: TursoSyncClientOptions<R>
    ) => Effect.Effect<
      TursoSyncClient['Service'],
      SqlError.SqlError,
      Reactivity.Reactivity | Scope.Scope | R
    >;
  }
>()('voel/database/factory/TursoSyncClientFactory') {}
