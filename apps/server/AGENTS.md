# Server - Bun API

## OVERVIEW

Audiobook library server. Scans filesystem, identifies via Audible API, serves metadata + streams to clients.

## STRUCTURE

```
server/
└── src/
    ├── router/
    │   ├── root.ts           # tRPC root router
    │   └── v1/
    │       ├── library/      # Library scanning + identification (see AGENTS.md)
    │       ├── sync.ts       # Realtime sync subscriptions
    │       └── files.ts      # File streaming endpoint
    ├── libs/
    │   ├── auth/             # better-auth setup
    │   ├── db/               # Kysely + SQLite + SourceTap
    │   └── effect/           # Effect utilities
    ├── trpc.ts               # tRPC initialization
    ├── env.ts                # t3-env validation
    └── index.ts              # Hono server entry
```

## WHERE TO LOOK

| Task               | Location                            |
| ------------------ | ----------------------------------- |
| Add tRPC procedure | `src/router/v1/`                    |
| Add DB table       | `src/libs/db/schema.ts` + migration |
| Auth changes       | `src/libs/auth/auth.ts`             |
| Environment vars   | `src/env.ts`                        |

## CONVENTIONS

### tRPC Procedures

```typescript
// Use appropriate procedure base
publicProcedure     // No auth required
protectedProcedure  // Requires login
adminProcedure      // Requires admin role

// Always validate input
.input(z.object({ ... }))
```

### Effect TS

```typescript
// Wrap Kysely queries
const result = yield* toEffect(db.selectFrom('book')...);

// Use tagged errors
class MyError extends Data.TaggedError('MyError')<{ msg: string }> {}

// Handle with catchTags
Effect.catchTags({
  NotFoundError: () => Effect.succeed(null),
  QueryError: (e) => Effect.fail(new TRPCError(...))
})
```

### Database

- Migrations: `src/libs/db/migrations/` (timestamped)
- Run: `bunx kysely-ctl migrate:up`
- SourceTap tracks: library, book, contributor, series, etc.

## ANTI-PATTERNS

- **Never** use raw SQL without Kysely builder
- **Never** ignore Effect errors (always handle or propagate)
- **Never** block event loop (use Effect.gen for async)

## KEY FILES

| File                               | Purpose                              |
| ---------------------------------- | ------------------------------------ |
| `src/index.ts`                     | Hono app, routes, startup migrations |
| `src/trpc.ts`                      | tRPC init, middleware, procedures    |
| `src/libs/db/index.ts`             | Kysely + SourceTap setup             |
| `src/router/v1/library/machine.ts` | XState scan orchestration            |
