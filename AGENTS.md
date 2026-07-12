# Information

- The package manager and runtime used is `bun`.

# Validations

Run these commands in parallel after you are done with your changes:

- `bun run lint`
- `bun run format`
- `bun turbo run check-types`
- `bun turbo run test && bun run --filter=voel harness:all`

# This project uses "effect"

Before writing any Effect code, YOU MUST read `.repos/effect/LLMS.md` fully.

# Browse library code

Use `.agents/skills/opensrc/SKILL.md` to browse the code of libraries this repo depends on. Do not read from `node_modules` directly.
