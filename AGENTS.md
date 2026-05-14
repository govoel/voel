# Information

- The base branch for this repository is `main`.
- The package manager used is `bun`.

# Validations

Run `bun turbo run lint`, `bun turbo run format`, `bun --bun turbo run test` after changing any code.

# This project uses "effect"

Before writing any TypeScript code, YOU MUST read `.repos/effect/LLMS.md` and `.agents/skills/quality-code/SKILL.md` fully.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repo uses a multi-context domain docs layout rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.
