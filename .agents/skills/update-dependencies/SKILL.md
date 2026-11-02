---
name: update-dependencies
description: Update workspace dependencies, coordinate Expo and related toolchains, review patches and upstream source, and identify concrete improvements we can adopt. Use when asked to update dependencies, inspect pending upgrades, or assess what a dependency release enables in this codebase.
disable-model-invocation: true
---

# Update Dependencies

An update is not just a manifest bump. Deliver a coherent, validated dependency graph and a source-backed review of what we can now simplify, remove, or improve.

## 1. Establish scope and actual available versions

- Read `AGENTS.md`, all workspace manifests, `bun.lock`, `renovate.json`, `patches/`, and relevant configuration. Preserve unrelated work.
- If asked what is pending or what changed, investigate and answer first; do not start updating. For an update request, apply required compatibility fixes, but discuss optional feature adoption or broader refactors before implementing them. Respect exclusions such as “Effect only” or “everything except Turso.”
- Check the registry and upstream releases directly. Renovate PRs are not an exhaustive or authoritative inventory. Record the current resolved version, target version, release channel, and compatibility constraints.
- Do not trust blanket `bun update`, especially for prereleases. Inspect dist-tags and explicit versions, compare the intended release channel, and set deliberate targets. Do not silently move a stable dependency onto a prerelease or a prerelease onto the wrong channel.
- Preserve intentional workspace-specific ranges and pins until compatibility is established. For example, client/devtools TypeScript and Rozenite's Vite can differ from the root toolchain. Derive these constraints from the current repo and upstream peers, not historical version numbers.
- Keep integration-heavy updates separable: Expo SDK, Effect/tooling, Turso, Better Auth, and Rozenite need their own compatibility review. Do not expand a targeted update or turn it into unrelated audit remediation.

## 2. Coordinate packages and their secondary configuration

### Expo

- Run `bun expo install --fix` from `apps/client` for SDK-managed dependencies. When changing SDKs, select the intended Expo release first, then let Expo align its managed packages.
- Do not independently bump packages beyond versions this command accepts, even if the registry offers newer releases. Respect Expo's React, React DOM, React Native, and related native-package constraints; align shared React versions across workspaces where required.
- Inspect local Expo configuration and patches for changes made obsolete by the SDK. For native configuration changes, check prebuild/config output and fingerprint coverage where relevant; patches affecting native code must participate in the native fingerprint.
- After the final install, run `bun expo install --check` from `apps/client`. Investigate duplicate native modules instead of papering over them with blanket overrides.

### Effect and the lint toolchain

- Update the runtime/platform/test packages as a compatible family. Review `@effect/vitest`'s test-runner peers and the resolved transitive graph as well as direct dependencies. Remove obsolete transitive pins rather than keeping overrides “just in case.”
- Keep `.repos/effect` aligned with the exact upstream release tag used by the dependencies, not upstream `main`. Inspect how the snapshot is currently maintained, resolve the tag to a commit, and verify the vendored files match that tag's Git tree exactly. A source-only request should not change dependency versions.
- Require signed source-update commits, including any synthetic squash/merge commits created by subtree tooling. Git's signing configuration alone is not proof: verify the resulting commits.
- Review `@effect/tsgo`, `oxlint`, `@oxlint/plugins`, `oxlint-tsgolint`, and the formatter together for compatibility. Run the root `prepare` script to reapply the configured Effect patcher after installing the new toolchain.
- Sync `.zed/settings.json`'s `lsp.effect-tsgo.settings.package_version` to the root `@effect/tsgo` version in the same update.
- Inspect new diagnostics and resolved rule/category settings. Do not disable rules merely to get a green upgrade: preserve the existing policy and fix findings, including Effect Array/Record/String preferences. Report genuine policy conflicts for discussion. Avoid redundant explicit rule entries when categories already enable them.

### Other coordinated updates

- Bun: align `engines.bun`, `packageManager`, workspace Bun type packages, and any explicit CI/runtime pins. Verify the actual Bun executable used for installation and validation.
- Better Auth: update the auth packages and Expo adapter together; inspect schema and generated-type changes. This app is not deployed, so existing migrations may be edited rather than adding compatibility machinery for nonexistent users.
- Rozenite/Vite: check the family together, preserving workspace-specific peer constraints rather than forcing every workspace onto one Vite major.
- Agent tools: when updating `agent-browser`, `agent-device`, or another tool with a checked-in skill, compare the upstream skill at the target release. Refresh only what changed, retaining local Bun commands, frontmatter, and intentional workflow adaptations. Explicitly report when no skill update is needed.

## 3. Reassess patches, overrides, and forks

- For every affected patch or override, determine why it exists and whether the released implementation now replaces it. Remove obsolete entries, patch files, suppressions, and workaround code together. Keep necessary customizations minimal.
- Check the actual published package as well as upstream source. A fix on upstream `main`, a changelog claim, or a cleanly applying old patch is not proof that our installed release contains the fix or that the patch remains correct.
- For generated packages, rebuild from clean source using the upstream release/CI toolchain. Establish what the unmodified build produces, then apply our source changes and regenerate JavaScript, declarations, and sourcemaps. Do not hand-edit generated outputs or merely rename a patch without checking it.
- Apply and verify the regenerated patch through Bun's patch/install workflow, updating `patchedDependencies` and removing stale versioned files. Explain when identical patch contents are justified by an unchanged upstream implementation.

### Turso requires special handling

- Read `govoel/turso`'s README before changing the fork. Its invariant is one minimal Voel patch atop the selected upstream release tag, not a merge of upstream `main`. Compare against that release tag when verifying ancestry.
- Review each customization for upstream equivalents; do not assume the sync-server bindings, WAL controls, or RN additions are still needed—or already replaced. Keep the fork update/publishing step distinct from the application's dependency/patch update.
- Do not push/rewrite the fork or publish a release without authorization. When authorized, verify the build/publish workflow succeeds and the target packages are actually available before completing the application update; a queued run is not publication.
- Coordinate the fork's database packages with the upstream common/sync/RN packages. Rebuild the RN patch using Turso's actual CI commands and toolchain, including generated dist files and sourcemaps. Do not substitute an approximate local build.
- Respect requests to leave native validation to CI, but state precisely what CI has verified and what remains untested locally or on-device.

## 4. Rebuild and verify the dependency graph

For dependency updates that change the lockfile, use the requested root sequence before pushing:

```bash
rm bun.lock && bun i -f && bun dedupe && bun prune
```

- Preserve a recoverable copy of the current lockfile before removing it, especially if it contains uncommitted work. If installation fails, restore that copy before handing off or retrying from a known state. Do not run competing dependency mutations concurrently.
- Inspect the regenerated lockfile. This sequence can refresh unrelated semver ranges; verify excluded packages, intentional pins, patches, and family alignment still hold. Correct unintended scope changes and disclose legitimate transitive refreshes.
- Check actual resolved versions and duplicate native modules, not just manifest text or “already up to date” output. Finish with `bun install --frozen-lockfile` and Expo's dependency check where applicable. Do not skip lifecycle hooks to hide patch failures.

## 5. Look for concrete improvements, not release-note summaries

Always include this review for a general dependency update; the user should not have to ask a second time.

- Use [the opensrc skill](../opensrc/SKILL.md) to inspect dependency implementations and tests; do not read library code directly from `node_modules`. Use exact old/new release tags or explicitly versioned source, and verify the source version. `.repos/effect` or a fetched cache can be stale.
- Compare the actual release delta against our call sites. Changelogs are navigation aids, not evidence. Do not attribute pre-existing features or unreleased upstream fixes to the upgrade.
- Prioritize deletions and simplifications: local workarounds now handled upstream, duplicated adapters/helpers, obsolete suppressions, manual lifecycle management, and handwritten test mocks. Then consider new capabilities that solve an existing need.
- For Effect, compare our custom SQL clients and copied/platform-specialized modules with the corresponding upstream implementations. Check transactions, connection ownership, pooling, preparation caches, error handling, interruption, and Metro/Bun compatibility before recommending mechanical alignment. Different drivers can legitimately need different behavior.
- Verify a proposed simplification against our actual runtime and import path. Preserve cancellation, cleanup, transaction, cache, and account-isolation guarantees. A new upstream API or passing type check does not prove an existing workaround can go. Use a focused behavioral probe when needed and retract a recommendation if it fails.
- Separate findings into: required migrations; benefits obtained automatically; actionable opt-in improvements; and things to retain or defer. For each worthwhile opt-in item, name the concrete local file/call site, the upstream change, what gets simpler or better, and any limitations. Rank the strongest candidates.
- Discuss optional changes before implementing them. Do not invent refactors to fill a list; “nothing useful beyond the automatic fixes” is acceptable when backed by inspection.

## 6. Validate and hand off

Run the repository's required command after the final changes:

```bash
bun turbo run check-types && bun turbo run lint && bun turbo run test && bun run format
```

- Inspect the final diff after formatting. Exercise the affected integration directly when source inspection or compatibility changes warrant it; compilation alone is not proof. Prefer existing focused tests and outcome assertions. Do not add test matrices for upstream internals, exact callback counts, source shape, or a deleted workaround.
- Report failures accurately, distinguishing upgrade regressions, existing failures, environment blockers, and validation not performed. Do not claim native builds or device behavior were verified by JS tests.
- Use signed commits and verify their signatures when committing. If filing a PR, follow [the file-pr skill](../file-pr/SKILL.md). Keep titles scoped and descriptions concise: problem, solution, meaningful validation and caveats.
- Split independent work into independent PRs unless a stack was requested. Verify the actual base-relative diff and commit ancestry: changing a PR's base does not remove an unrelated parent PR's changes.
- Handoff: summarize updated families, intentionally held versions and why, patch/override/skill changes, validation and omissions, and ranked source-backed opportunities for discussion.
