# VOEL - Audiobook Server & Client

## OVERVIEW

Self-hosted audiobook server (Bun/Hono/tRPC/Effect) with offline-first React Native client (Expo). Server scans libraries, identifies audiobooks via Audible, streams content. Client syncs metadata to local SQLite, plays via native audio module.

## STRUCTURE

```
voel/
├── apps/
│   ├── client/          # Expo React Native (Expo Router, NativeWind)
│   └── server/          # Bun API (Hono, tRPC, Effect, Kysely)
├── packages/
│   ├── schemas/         # Shared Zod schemas (@voel/schemas)
│   ├── source-tap/      # Kysely plugin for realtime DB change tracking
│   ├── scripts/         # CI/CD utilities
│   └── patches/         # Dependency patches
├── .github/workflows/   # CI: lint, typecheck, test, build, deploy
└── Dockerfile           # Server container (Bun compile)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add tRPC endpoint | `apps/server/src/router/v1/` | Follow existing router pattern |
| Add client screen | `apps/client/app/(root)/(tabs)/` | Expo Router file-based |
| Add shared type | `packages/schemas/v1/` | Export from index.ts |
| DB migration (server) | `apps/server/src/libs/db/migrations/` | Timestamped Kysely migrations |
| DB migration (client) | `apps/client/lib/db/migrations/` | Local SQLite schema |
| Native audio changes | `apps/client/modules/voel-audio/` | iOS (Swift) + Android (Kotlin) |

## COMMANDS

```bash
# Bootstrap
bun install

# Development
cd apps/client && bun run start          # Expo dev server
cd apps/server && bun run dev            # Server with watch

# Quality
bun run --filter '*' typecheck           # All workspaces
bun run --filter '*' lint                # ESLint + Prettier check
bun run --filter '*' format              # Auto-fix

# Testing
cd apps/server && bun test               # Server tests (Bun test)

# Database
cd apps/server && bunx kysely-ctl migrate:up  # Apply migrations
```

## CONVENTIONS

### Naming
- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`

### Path Aliases
- Server: `@/*` → `apps/server/src/*`
- Client: `~/*` → `apps/client/*`

### Import Order (Prettier)
- External deps → Internal by alias → Relative

### Commits
Conventional: `feat(client):`, `fix(server):`, `chore:`

### Version Control (GitButler)
Use `but` CLI instead of `git` for branch/commit operations:
```bash
but status              # Workspace overview (branches, commits, files)
but commit -m "msg"     # Commit to current branch
but commit -c "name"    # Create new branch and commit
but branch new "name"   # Create branch without committing
but absorb              # Auto-amend changes into appropriate commits
but undo                # Undo last operation
but review publish      # Create/update PR on GitHub
```

## ANTI-PATTERNS

- **Never** suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never** commit `.env*` files
- **Never** empty catch blocks
- **Never** skip pre-commit hooks

## KEY ARCHITECTURAL DECISIONS

### Server
- **Effect TS**: Used for complex orchestration (library scanning, error handling)
- **XState**: State machines for long-running processes
- **SourceTap**: Custom Kysely plugin emits DB change events for sync

### Client
- **Offline-First**: Full SQLite database synced from server
- **Instance System**: Supports multiple server connections
- **Native Audio**: Custom Expo module for background playback

### Shared
- **tRPC**: End-to-end type safety between client and server
- **Zod**: Shared schemas in `@voel/schemas`

## CI/CD NOTES

- Self-hosted runners for heavy builds
- Buildah (not Docker) for server images
- EOAS for Expo OTA updates (not EAS)
- `skip-duplicate-actions` for path-based workflow skipping
