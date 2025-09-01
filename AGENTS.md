# Repository Guidelines

## Project Structure & Modules
- `apps/client`: Expo React Native app (Expo Router, Tailwind). UI in `components/`, routes in `app/`.
- `apps/server`: Bun + TypeScript API (Hono + tRPC, Effect). Code in `src/`; DB via Kysely with migrations in `src/libs/db/migrations/`.
- `packages/schemas`: Shared Zod schemas and lint config.
- `packages/source-tap`: Shared data utilities.

## Build, Test, and Development
- Bootstrap: `bun install` at repo root.
- Client dev: `cd apps/client && bun run start` (or `bun run ios` / `bun run android`).
- Server dev: `cd apps/server && bun run dev` (watches `src/index.ts`).
- Server tests: `cd apps/server && bun test`.
- Type checks: `bun run --filter '*' typecheck`.
- Lint/format: `bun run --filter '*' lint` and `bun run --filter '*' format`.

## Coding Style & Naming
- Language: TypeScript (ES modules, strict). Prefer explicit types at boundaries.
- Formatting: Prettier (sorted imports via `@trivago/prettier-plugin-sort-imports`).
- Linting: ESLint (`typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-import(-zod)`).
- Indentation/quotes: Prettier defaults (2 spaces, single quotes where configured).
- Paths: Server uses `@/*` → `apps/server/src/*`; Client uses `~/...` for app-local imports.
- Names: files kebab-case; types/interfaces PascalCase; functions/vars camelCase.

## Testing Guidelines
- Runner: Bun test (server). Place tests next to code as `*.test.ts`.
- Style: Unit-first with clear inputs/outputs; keep tests deterministic. Snapshots are fine for structured responses.
- Run: `cd apps/server && bun test` (use `-t` to focus).

## Commit & Pull Request Guidelines
- Commits: Conventional style with scope, e.g. `feat(client): add profile avatar`, `fix(server): handle missing token`, `chore: update deps`.
- PRs: Provide summary, rationale, and testing notes. Link issues. Include screenshots/screen recordings for UI changes (client).
- Hygiene: Keep PRs small and focused; ensure `typecheck`, `lint`, and relevant tests pass.

## Security & Configuration
- Environment: Validate via `@t3-oss/env-core` (server). Store secrets in `.env.local`; never commit `.env*`.
- Data: Apply Kysely migrations before features that rely on new schema. Example: `cd apps/server && bunx kysely-ctl migrate:up`.
