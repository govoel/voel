---
name: opensrc
description: Fetch dependency source code to give AI agents deeper implementation context. Use when the agent needs to understand how a library works internally, read source code for a package, fetch implementation details for a dependency, or explore how an npm/PyPI/crates.io package is built. Triggers include "fetch source for", "read the source of", "how does X work internally", "get the implementation of", "opensrc path", or any task requiring access to dependency source code beyond types and docs.
disable-model-invocation: true
---

# Source Code Fetching with opensrc

Fetches dependency source code so agents can read implementations, not just types. Clones repositories at the correct version tag and caches them globally at `~/.opensrc/`.

## Core Pattern

```bash
rg "parse" $(bun opensrc path effect)
cat $(bun opensrc path effect)/src/types.ts
find $(bun opensrc path effect) -name "*.test.ts"
```

`bun opensrc path <pkg>` prints the absolute path to cached source. If not cached, it fetches automatically. Progress goes to stderr, path to stdout, so `$(bun opensrc path ...)` works in subshells.

## Fetching Source Code

```bash
bun opensrc path effect
bun opensrc path effect-ts/effect-smol

# Multiple packages at once
bun opensrc path effect @expo/ui

# Specific versions
bun opensrc path effect@4.1.4
bun opensrc path Effect-TS/effect@effect@4.1.4
bun opensrc path expo/expo@expo@58.0.24
bun opensrc path owner/repo@v1.0.0
bun opensrc path owner/repo#main
```

### Version Resolution

For npm packages, opensrc auto-detects the installed version from lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`). Use `--cwd` to resolve from a different project:

```bash
bun opensrc path zod --cwd /path/to/project
```

For repos, use `@ref` or `#ref` to select a branch or tag.

Verify the fetched source before treating it as a release. In opensrc 0.7.3, npm version fetching tries only `v<version>` and `<version>` tags, then falls back to the default branch. Monorepos such as Effect and Expo use package-prefixed tags; request the exact repository tag as above. A version-looking cache directory is not proof of a matching checkout. Inspect the package version and, where needed, compare against the published tarball. Repository refs must be branches or tags accepted by `git clone --branch`; a raw commit SHA also falls back to the default branch.

If you get an error like "Error: error decoding response body", try the repo instead of package name or git clone the repo directly.
