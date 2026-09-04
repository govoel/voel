import { Context } from 'effect';
import type { Duration, Effect } from 'effect';
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
  readonly authToken?: string | (() => Promise<string>);
  readonly clientName?: string;
  readonly remoteEncryption?: {
    readonly key: string;
    readonly cipher:
      | 'aes256gcm'
      | 'aes128gcm'
      | 'chacha20poly1305'
      | 'aegis128l'
      | 'aegis128x2'
      | 'aegis128x4'
      | 'aegis256'
      | 'aegis256x2'
      | 'aegis256x4';
  };
  readonly longPollTimeoutMs?: number;
  readonly bootstrapIfEmpty?: boolean;
  readonly pushOperationsThreshold?: number;
  readonly pullBytesThreshold?: number;
  readonly logicalMvccPull?: boolean;
  readonly partialSyncExperimental?: {
    readonly bootstrapStrategy:
      | { readonly kind: 'prefix'; readonly length: number }
      | { readonly kind: 'query'; readonly query: string };
    readonly segmentSize?: number;
    readonly prefetch?: boolean;
  };

  /** How long SQLite waits when the database is busy. Defaults to 5 seconds. */
  readonly busyTimeout?: Duration.Input | undefined;
  /** Runs once after the physical connection has been established. */
  readonly onConnect?:
    | ((connection: {
        readonly exec: (sql: string) => Effect.Effect<void, SqlError.SqlError>;
      }) => Effect.Effect<void, SqlError.SqlError, R>)
    | undefined;
  readonly spanAttributes?: Record<string, unknown> | undefined;
  readonly transformResultNames?: ((str: string) => string) | undefined;
  readonly transformQueryNames?: ((str: string) => string) | undefined;
  readonly prepareCacheSize?: number | undefined;
  readonly prepareCacheTTL?: Duration.Input | undefined;
}
