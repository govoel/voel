# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a multi-context domain docs layout. `CONTEXT-MAP.md` at the repo root points to the relevant `CONTEXT.md` files for each context.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root. Use it to identify the contexts relevant to the topic, then read those contexts' `CONTEXT.md` files.
- **`docs/adr/`** for system-wide decisions that touch the area you're about to work in.
- **`src/<context>/docs/adr/`** for context-scoped decisions, when working in a specific context.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context repo:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                          <- system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  <- context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) but worth reopening because..._
