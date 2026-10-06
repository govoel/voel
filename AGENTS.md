# Information

The package manager and runtime used is `bun`.

# Validations

Run these commands after you are done with your changes: `bun turbo run check-types && bun turbo run lint && bun turbo run test && bun run format`

# Schema helpers

- Put reusable, schema-owned decoders, encoders, guards, and derived schemas on the named schema as `public static readonly` properties. Add only helpers with callers.
- Keep consumer-specific operations module-local, runtime-dependent operations inside their factory or service initialization, and simple one-off operations inline. Do not turn a branded primitive into a class solely for a single local helper.
- Use typed decoders for encoded input and unknown decoders for untrusted input. Static helpers capture their defining schema; subclasses that change the schema must define their own helpers.

# Browse library code

Use `.agents/skills/opensrc/SKILL.md` to browse the code of libraries this repo depends on. Effect v4's source code is in `.repos/effect`. Do not read from `node_modules` directly.
