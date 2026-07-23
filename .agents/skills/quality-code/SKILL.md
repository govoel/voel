---
name: quality-code
description: Use when writing or reviewing TypeScript/full-stack code. Encodes principles for type safety, Effect services, real tests over mocks, built-in Effect observability, and choosing abstractions only when they pay for themselves.
disable-model-invocation: true
---

# Writing quality TypeScript

Apply these principles when writing or reviewing TypeScript code in this project. Prefer Effect, Effect Schema, Effect services, and Layers over ad hoc alternatives.

## Make impossible states unrepresentable

Use the type system and Effect Schema to make invalid states fail at the boundary. Fewer reachable states means easier code to read and change.

### Branded schemas

Brand primitives with `Schema.brand` so they cannot be mixed up. Decode once at the boundary; downstream code trusts the branded type.

```ts
import { Schema } from "effect"

export const PhoneNumber = Schema.String.check(
  Schema.isPattern(/^\+?\d{10,15}$/)
).pipe(Schema.brand("PhoneNumber"))
export type PhoneNumber = typeof PhoneNumber.Type

export const decodePhoneNumber = Schema.decodeUnknownSync(PhoneNumber)

function sendSms(options: { readonly to: PhoneNumber; readonly body: string }) {
  /* input is trusted */
}
```

Do not roll your own `string & { __brand: ... }` types when an Effect Schema can validate and brand the value.

### Discriminated unions over flag bags

```ts
import { Schema } from "effect"

const User = Schema.Struct({ id: Schema.String, name: Schema.String })
type User = typeof User.Type

// Don't: invalid combinations are representable.
type State = { loading: boolean; user?: User; error?: string }

// Do: only valid states exist.
const State = Schema.Union(
  Schema.Struct({ status: Schema.Literal("loading") }),
  Schema.Struct({ status: Schema.Literal("success"), user: User }),
  Schema.Struct({ status: Schema.Literal("error"), error: Schema.String })
)
type State = typeof State.Type
```

## Let types flow end-to-end

DB schema → server → client should share types without manual duplication. A `users.email` branded as `Email` should arrive on the client still branded.

Do not restate types you can derive. Reach for `typeof MySchema.Type`, `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, and `Effect.Success` before writing a new interface.

```ts
// Don't — duplicate shape, drifts when the row changes
type UserSummary = { id: string; email: Email };
function renderUser(u: UserSummary) {
  /* ... */
}

// Do — derive from the source of truth
type User = Awaited<ReturnType<typeof db.query.users.findFirst>>;
function renderUser(u: Pick<User, "id" | "email">) {
  /* ... */
}
```

## Pass objects, not positional args

```ts
// Don't — swap two args, still compiles
sendEmail("Welcome!", "Hi there");
// Do — order-independent, self-documenting
sendEmail({ to: "alice@x.com", body: "Hi there" });
```

Skip on hot perf-critical paths; use elsewhere by default.

## Tests as real as possible

Use `@effect/vitest` with `it.effect` for Effect programs. Provide real or in-memory Layers when practical, and mock only third-party services that have no test environment.
