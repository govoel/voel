import { RuleTester } from 'oxlint/plugins-dev';

import { deterministicIdentifiersRule } from './deterministic-identifiers.mts';

// The rule only needs this path to be beneath a workspace package; the source file need not exist.
const filename = `${import.meta.dirname}/../../packages/effect-turso/src/domain/models.ts`;

new RuleTester().run('deterministic-identifiers', deterministicIdentifiersRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Class<User, { readonly brand: unique symbol }>(
          "@repo/effect-turso/domain/models/User"
        )({ name: Schema.String }) {}

        const UserId = Schema.String.pipe(
          Schema.brand("@repo/effect-turso/domain/models/UserId")
        )
      `,
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("@repo/effect-turso/domain/models/UserError")("UserError", {}) {}
      `,
    },
    {
      filename,
      code: `
        const packageName = "@repo/effect-turso"
        const userIdentifier = \`\${packageName}/domain/models/User\`

        class User extends Schema.Class<User, { readonly brand: unique symbol }>(
          userIdentifier
        )({ name: Schema.String }) {}

        const UserId = Schema.String.pipe(
          Schema.brand(\`\${packageName}/domain/models/UserId\`)
        )
      `,
    },
  ],
  invalid: [
    {
      filename,
      code: `
        class User extends Schema.Class<User, { readonly brand: unique symbol }>(
          "@repo/effect-turso/domain/index/User"
        )({ name: Schema.String }) {}
      `,
      errors: [
        {
          message: "Use the deterministic identifier '@repo/effect-turso/domain/models/User'.",
        },
      ],
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("@repo/effect-turso/domain/models/UserError")("user-error", {}) {}
      `,
      errors: [{ message: "Use the PascalCase class name 'UserError' as the tag." }],
    },
    {
      filename,
      code: `
        const UserId = Schema.String.pipe(Schema.brand("voel/other/UserId"))
      `,
      errors: [
        {
          message: "Use a static brand identifier beneath '@repo/effect-turso/domain/models/'.",
        },
      ],
    },
  ],
});
