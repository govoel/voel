# Domain boundaries

Business code is co-located under `src/domains` in the client, server, and API
specification. Organize by the feature that owns the behavior, not by technical
categories such as global repositories, models, and handlers. Domain folders can
contain schemas, persistence, application workflows, transport adapters, and tests.

- **Accounts (client):** account identity and profile schemas, atomic persistence,
  account management, authentication clients/credential storage, reactive state,
  and account-specific UI components.
- **Library:** the catalog and library configuration, storage-plugin workflows,
  HTTP adapters, and server/client database synchronization. The shared catalog
  schemas belong to the library domain; they are not a separate database API.
- **Plugins (server/specification):** plugin identities, resolution, construction,
  isolated invocation, and scoped caches.
- **Auth (server/specification):** session authentication, authorization middleware,
  auth routes, and the private auth database.

Cross-domain infrastructure stays in `services`: configuration, runtime wiring,
database factories, the client main database, and testing infrastructure. Expo
routes remain in `app`, and server route composition remains in `http.ts`.

## Ownership of guarantees

Repositories own persistence operations and interpret database outcomes. Account
queries and writes expose `AccountDatabaseError` only for connection unavailability
and lock contention, retaining the original cause. Invalid internal requests,
corrupt persisted rows, and every other SQL failure are defects, not retry prompts.
Library repositories translate expected absence/conflicts and defect on unexpected
SQL/schema failures. Effect SQL transaction-finalization failures remain defects.

Application workflows own coordination across persistence and plugins.
`LibraryService` holds the write transaction across loading the library snapshot,
plugin root validation, and root replacement. The repository also makes standalone
root replacement atomic; inside the workflow that transaction is a savepoint.
Do not move plugin validation outside the write lock without introducing an
equivalent consistency mechanism.

Plugin retirement belongs to the application service lifetime, not the HTTP
request. Successful rename/settings/delete operations schedule retirement without
waiting for plugin finalizers or interrupting in-flight acquisitions. HTTP adapters
own authorization and protocol/status mapping, not those workflow guarantees.
