import { Context, Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import type { Reactivity } from 'effect/unstable/reactivity';
import type { SqlError } from 'effect/unstable/sql';

import type { TursoSyncClient, TursoSyncClientOptions } from '@repo/effect-turso-sync';

/** Acquires platform-specific Turso clients inside the requesting layer's scope. */
export class TursoSyncClientFactory extends Context.Service<TursoSyncClientFactory>()(
  'voel/services/database/turso-sync-client-factory/TursoSyncClientFactory',
  {
    make: (
      makeClient: <R = never>(
        options: TursoSyncClientOptions<R>
      ) => Effect.Effect<
        TursoSyncClient['Service'],
        SqlError.SqlError,
        Reactivity.Reactivity | Scope.Scope | R
      >
    ) => Effect.succeed({ make: makeClient }),
  }
) {
  public static readonly layer = (makeClient: Parameters<typeof this.make>[0]) =>
    Layer.effect(this, this.make(makeClient));
}
