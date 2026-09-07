import { Context } from 'effect';
import type { Effect } from 'effect';
import type { SqlClient, SqlError } from 'effect/unstable/sql';

export class TursoSyncClient extends Context.Service<
  TursoSyncClient,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- The service shape is the platform-independent contract.
  SqlClient.SqlClient
>()('@repo/effect-turso-sync/TursoSyncClient') {}

export interface TursoSyncClientOptions<R = never> {
  /** Local path used for the database and its synchronization metadata. */
  readonly path: string;
  /** Omitting the URL creates a local-only database. */
  readonly url?: string | (() => string | null);
  /** Evaluated before each remote request; interrupted when its sync operation is cancelled. */
  readonly authToken?: Effect.Effect<string, never, R>;
  readonly longPollTimeoutMs?: number;
  readonly bootstrapIfEmpty?: boolean;
  /** Runs once with the SQL client after connecting, before the client is exposed. */
  readonly onConnect?:
    | ((client: SqlClient.SqlClient) => Effect.Effect<void, SqlError.SqlError, R>)
    | undefined;
}
