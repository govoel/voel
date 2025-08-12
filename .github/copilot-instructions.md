# Voel

Voel is a multi-platform audiobook application consisting of a React Native/Expo mobile client and a Bun-based API server. This is a monorepo using Bun workspaces with shared TypeScript packages.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Essential Setup
- **Install Bun runtime**: `curl -fsSL https://bun.sh/install | bash && source ~/.bashrc`
- **Install all dependencies**: `bun install --frozen-lockfile` -- takes 6 minutes. NEVER CANCEL. Set timeout to 10+ minutes.
- **Verify setup**: `bun --version` (should match bun-types version in workspace root package.json)

### Development Workflow
- **Start server in dev mode**: `cd apps/server && bun run dev` -- runs on http://localhost:3000
- **Start client development**: `cd apps/client && bun run start` -- starts Expo development server

### Testing and Quality Assurance
- **Run all tests**: `bun run --filter '*' --bun test` -- takes 3 seconds. NEVER CANCEL. Set timeout to 5+ minutes.
- **Run all linting**: `bun run --filter '*' --bun lint` -- takes 44 seconds. NEVER CANCEL. Set timeout to 60+ minutes.
- **Run server tests only**: `cd apps/server && bun run test` -- takes 3 seconds
- **Run server linting only**: `cd apps/server && bun run lint` -- takes 8 seconds
- **Run client linting only**: `cd apps/client && bun run lint` -- takes 27 seconds

### Build Processes
- **Android builds**: Require extensive setup with JDK 17, Android SDK, Gradle, and ccache. See .github/workflows/build-client.yml for full setup
- **Server compile**: See Dockerfile for current build command used in production

## Validation

### Server Validation
- **Always test server endpoints after changes**: 
  - Start server: `cd apps/server && bun run dev`
  - Test tRPC endpoints: `curl -s -X POST http://localhost:3000/api/trpc/v1.library.create -H "Content-Type: application/json" -d '{}' | head -1`
  - Expected: Admin authentication error (FORBIDDEN)
- **ALWAYS run through complete server startup and API request validation** after making server changes

### CI/CD Validation
- **ALWAYS run linting before committing**: `bun run --filter '*' --bun lint`
- **ALWAYS run tests before committing**: `bun run --filter '*' --bun test` 
- **Format code**: `cd apps/server && bun run format` or `cd apps/client && bun run format`

## Repository Structure

### Applications
- **apps/client**: React Native/Expo mobile application with Android builds, tRPC client
- **apps/server**: Bun-based API server using Hono framework, tRPC server, SQLite database

### Shared Packages
- **packages/schemas**: Shared Zod validation schemas for API contracts
- **packages/source-tap**: Custom Kysely plugin for real-time database change tracking

### Key Technologies
- **Runtime**: Bun (check bun-types version in workspace root package.json)
- **Client**: React Native, Expo SDK, React (check apps/client/package.json for versions)
- **Server**: Hono, tRPC, Kysely ORM, SQLite, Effect-TS
- **Auth**: better-auth with custom username-based flow
- **Deployment**: Docker containers for server, GitHub Actions for CI/CD

## Common Tasks

### Database Operations
- **Server uses SQLite with Kysely ORM**
- **Migrations run automatically in production**
- **Database is in-memory for tests**
- **Auth system allows signup for first user only, then administrator creates additional users**

### API Development
- **tRPC procedures are in apps/server/src/router/v1/**
- **All admin operations require authentication**
- **API routes**: `/api/auth/*`, `/api/trpc/*`, `/api/v1/files/:id`

### Client Development  
- **Uses Expo Router for navigation**
- **Three build variants**: development, preview, release
- **Android builds use ccache for native modules**
- **Metro bundler for JavaScript bundling**

### Environment Variables
- **RELEASE_CHANNEL**: Controls client build variant (development/preview/release)
- **NODE_ENV**: Controls server environment (development/production)
- **VOEL_ANDROID_APP_JKS_PASSWORD**: Required for Android signing

## Known Issues
- **Client spinner component**: ESLint warning about missing useEffect dependencies
- **Client has no tests**: Test infrastructure exists only for server and source-tap packages

## Build Timing Reference
- **bun install**: ~6 minutes
- **Workspace linting**: ~44 seconds  
- **Workspace testing**: ~3 seconds
- **Individual server lint**: ~8 seconds
- **Individual client lint**: ~27 seconds
- **Android builds**: 15+ minutes (with caching)

## Frequently Used Commands

```bash
# Repository root commands
ls -la /home/runner/work/voel/voel/

# Start everything for development
bun install --frozen-lockfile
cd apps/server && bun run dev &
cd apps/client && bun run start &

# Validate changes before committing
bun run --filter '*' --bun lint
bun run --filter '*' --bun test
```
