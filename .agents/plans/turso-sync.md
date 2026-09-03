# Self-hosted Turso Sync

## Decision

Replace the custom database replication protocol with Turso Database (not libsql) Sync. Use Voel's Turso JavaScript binding fork for the native protocol implementation while Bun owns authentication, database routing, and domain policy.

## Storage boundaries

- `auth.db`: Better Auth state. Never synced. Better Auth uses `@govoel/turso-database/compat` through an explicit Kysely SqliteDialect with transactions enabled.
- `library.db`: only client-safe shared tables and columns. Server writes; clients pull.
- `users/<user-id>.db`: user-private database for playback history, settings, etc. Server writes; clients pull. Clients use outbox for offline writes instead of Turso sync since Turso sync uses last push wins for conflict resolution.

Turso syncs whole databases, so we need to use files instead of table filters as the security boundary.

## Server design

1. All databases use Turso now through Voel's patched `@govoel/turso-database` N-API binding. Never open those files through `bun:sqlite`.
2. Bun remains the public gateway: Better Auth, ensuring valid sessions before Turso sync requests, identity-to-database routing, and read-only enforcement for the catalog endpoint.
3. After authentication and routing, Bun calls `database.handleSyncRequest({ method, path, body })`. The binding executes the request against that database's existing Turso connection and returns `{ status, contentType, body }`.

## Turso fork

The patch extracts the CLI sync server into the reusable `turso_sync_server` crate and exposes a transport-independent request handler through the native JavaScript database binding. The CLI continues using the same implementation. The fork's minimally modified NAPI workflow publishes `@govoel/turso-database` and its `@govoel/turso-database-<platform>` optional packages to GitHub Packages. Release tags use `voel-v<upstream-version>`; the package retains the upstream version and continues depending on upstream's `@tursodatabase/database-common` package.

References:

- https://github.com/tursodatabase/turso (upstream)
- https://github.com/govoel/turso (our fork)
