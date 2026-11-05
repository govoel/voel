---
name: update-dependencies
description: Update dependencies with compatible versions, minimal workarounds, and source-backed opportunities to simplify or improve this codebase.
disable-model-invocation: true
---

# Update Dependencies

Deliver a compatible, validated update—not just newer version numbers.

## Required outcomes

- The requested dependencies are current on the intended release channel, compatible across workspaces, and reproducibly installed from the lockfile. Intentional pins and excluded packages remain intact.
- Related configuration stays aligned: `.repos/effect` exactly matches the installed Effect release tag; Zed matches `@effect/tsgo`; Bun's engine, package-manager, and type versions agree; checked-in tool skills remain accurate.
- Expo-managed dependencies agree with `bun expo install --fix`. The lockfile is regenerated with `rm bun.lock && bun i -f && bun dedupe && bun prune`, preserving unrelated work and reviewing incidental upgrades.
- Patches, overrides, and workarounds are still necessary and minimal; obsolete ones are removed. Generated patch outputs, including declarations and sourcemaps, match upstream's CI build. Turso fork updates preserve its README's one-patch-on-a-release invariant.
- General updates include concrete opportunities to adopt new functionality, improve existing code, or delete complexity. Recommendations are grounded in actual released source and our call sites—not just changelogs. Use [opensrc](../opensrc/SKILL.md); consider our custom SQL clients and other upstream-derived implementations when relevant. Distinguish automatic benefits from changes worth discussing, with limitations made explicit.
- Required repository checks pass, and affected behavior is verified directly where needed. The handoff explains what changed, intentional holds, remaining opportunities, and anything unverified. Commits are signed and verified; PRs follow [file-pr](../file-pr/SKILL.md).

## Guardrails

- Don't treat a question or assessment as permission to edit. Discuss optional adoption and broader refactors before implementing them. Keep independent work out of the update's PR.
- Don't trust blanket `bun update` for prereleases or Renovate PRs as the complete update inventory. Don't silently switch release channels or override Expo's supported versions.
- Don't flatten intentional workspace-specific constraints, disable lint rules, skip lifecycle hooks, or add compatibility layers merely to make an upgrade pass.
- Don't assume a fix on upstream `main` is released, a cleanly applying patch is correct, or a new API makes our workaround redundant. Preserve runtime-specific behavior, resource ownership, cancellation, transactions, and account isolation.
- Don't hand-edit generated patch artifacts, retain obsolete overrides “just in case,” or push/rewrite a fork or publish packages without authorization. A queued publishing workflow is not an available package.
- Don't add tests of upstream internals or implementation details merely because dependencies changed. Don't claim compilation or JS tests prove native/device behavior, and don't invent refactors when no useful opportunity exists.
