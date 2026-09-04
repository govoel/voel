import { Context } from 'effect';
import type { Effect, Scope } from 'effect';
import type { Reactivity } from 'effect/unstable/reactivity';
import type { SqlError } from 'effect/unstable/sql';

import type { TursoSyncClient, TursoSyncClientOptions } from '@repo/effect-turso-sync';

/** Acquires platform-specific Turso clients inside the requesting layer's scope. */
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
>()('voel/services/database/turso-sync-client-factory/TursoSyncClientFactory') {}
