# Information

The package manager and runtime used is `bun`.

This app has not been deployed anywhere and has no users at present. As a result, we don't worry about backwards compatability, migrating existing data, and are able to edit existing database migration files.

# Validations

Run this command after you are done with your changes: `bun turbo run check-types && bun turbo run lint && bun turbo run test && bun run format`.

# Browse library code

Use `.agents/skills/opensrc/SKILL.md` to browse the code of libraries this repo depends on. Effect v4's source code is in `.repos/effect`. Do not read from `node_modules` directly.

## Typescript Coding Preferences

The type checker is a proof assistant. Use it to eliminate impossible states, mismatched primitives, and unhandled variants at compile time.

The patterns:

- `any` is the enemy, inferred types are our friend. Our system should adapt to changes, instead of requiring changes everywhere.
- Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface.
- Avoid explicit return types unless absolutely necessary. Rely on inferred types and `satisfies` to validate without widening types.
- Model variants with a literal discriminant so impossible states can't be represented. No optional-field bags.
- Use `Schema` for rigorous and robust validation. Be strict and explicit, `Schema` is extremely capable.
- Brand primitives with `Schema.brand` so they can't be mixed up.
- Build the shape so illegal values can't be constructed. `Array.NonEmptyArray` for non-empty, `Types.TupleOf` or `Types.TupleOfAtLeast` for length, etc.
- Use `Match` for exhaustive pattern matching and `Predicate` for type narrowing.
- Pass objects, not positional. This way arguments are self-documenting.
- Inline one-line functions that exist just to call another function.
- Inline `type`s and `interface`s when they're used only once.
- Avoid unnecessarily `export`ing things, `export` only when we know there is an external consumer.
- Use `void 0` instead of `undefined`.
