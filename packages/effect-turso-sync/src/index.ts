import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import type { SqlClient, SqlError } from 'effect/unstable/sql';

export class TursoSyncError extends Schema.TaggedError<
  TursoSyncError,
  { readonly brand: unique symbol }
>('@repo/effect-turso-sync/TursoSyncError')('TursoSyncError', {
  cause: Schema.Defect(),
  operation: Schema.Literal('pull'),
}) {}

export class TursoSyncClient extends Context.Service<
  TursoSyncClient,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- The service shape is the platform-independent contract.
  SqlClient.SqlClient & {
    readonly pull: Effect.Effect<boolean, TursoSyncError>;
  }
>()('@repo/effect-turso-sync/TursoSyncClient') {}

export interface TursoSyncClientOptions<R = never> {
  /** Local path used for the database and its synchronization metadata. */
  readonly path: string;
  /** Omitting the URL creates a local-only database. */
  readonly url?: string | (() => string | null);
  readonly authToken?: string | (() => Promise<string>);
  readonly longPollTimeoutMs?: number;
  readonly bootstrapIfEmpty?: boolean;
  readonly fetch?: typeof globalThis.fetch;
  /** Runs once after the physical connection has been established. */
  readonly onConnect?:
    | ((connection: {
        readonly exec: (sql: string) => Effect.Effect<void, SqlError.SqlError>;
      }) => Effect.Effect<void, SqlError.SqlError, R>)
    | undefined;
}
