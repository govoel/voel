import { RuleTester } from 'oxlint/plugins-dev';

import {
  deterministicIdentifiersRule,
  noSchemaStructAssignmentRule,
  schemaClassBrandRule,
} from './effect-conventions.mts';

// The rule only needs this path to be beneath a workspace package; the source file need not exist.
const filename = `${import.meta.dirname}/../packages/effect-kysely/src/domain/models.ts`;

new RuleTester().run('deterministic-identifiers', deterministicIdentifiersRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Class<User, { readonly brand: unique symbol }>(
          "@repo/effect-kysely/domain/models/User"
        )({ name: Schema.String }) {}

        const UserId = Schema.String.pipe(
          Schema.brand("@repo/effect-kysely/domain/models/UserId")
        )
      `,
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("@repo/effect-kysely/domain/models/UserError")("UserError", {}) {}
      `,
    },
    {
      filename,
      code: `
        const packageName = "@repo/effect-kysely"
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
          "@repo/effect-kysely/domain/index/User"
        )({ name: Schema.String }) {}
      `,
      errors: [
        {
          message: "Use the deterministic identifier '@repo/effect-kysely/domain/models/User'.",
        },
      ],
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("@repo/effect-kysely/domain/models/UserError")("user-error", {}) {}
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
          message: "Use a static brand identifier beneath '@repo/effect-kysely/domain/models/'.",
        },
      ],
    },
  ],
});

new RuleTester().run('schema-class-brand', schemaClassBrandRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Class<User, { readonly brand: unique symbol }>("User")({}) {}
      `,
    },
    {
      filename,
      code: `class User extends Model.Class<User>("User")({}) {}`,
    },
    {
      filename,
      code: `
        class Admin extends User.extend<
          Admin,
          Record<never, never>,
          { readonly adminBrand: unique symbol }
        >("Admin")({}) {}
      `,
    },
  ],
  invalid: [
    {
      filename,
      code: `class User extends Schema.Class<User>("User")({}) {}`,
      errors: [{ message: 'Add { readonly brand: unique symbol } to this schema class.' }],
    },
    {
      filename,
      code: `
        class Admin extends User.extend<Admin, Record<never, never>>("Admin")({}) {}
      `,
      errors: [{ message: 'Add a readonly unique-symbol brand to this schema subclass.' }],
    },
  ],
});

new RuleTester().run('no-schema-struct-assignment', noSchemaStructAssignmentRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Class<
          User,
          { readonly brand: unique symbol }
        >("User")({ name: Schema.String }) {}
      `,
    },
    {
      filename,
      code: `
        const response = Schema.Array(
          Schema.Struct({ name: Schema.String })
        )

        const makeRow = () =>
          Schema.Struct({ name: Schema.String })

        const container = {
          user: Schema.Struct({ name: Schema.String })
        }
      `,
    },
  ],
  invalid: [
    {
      filename,
      code: `const User = Schema.Struct({ name: Schema.String })`,
      errors: [
        {
          message:
            'Define named schemas with Schema.Class/Schema.TaggedClass instead of assigning Schema.Struct.',
        },
      ],
    },
    {
      filename,
      code: `
        let User
        User = Schema.Struct({ name: Schema.String })
      `,
      errors: [
        {
          message:
            'Define named schemas with Schema.Class/Schema.TaggedClass instead of assigning Schema.Struct.',
        },
      ],
    },
    {
      filename,
      code: `
        const User = (Schema.Struct({ name: Schema.String }) satisfies Schema.Top)
      `,
      errors: [
        {
          message:
            'Define named schemas with Schema.Class/Schema.TaggedClass instead of assigning Schema.Struct.',
        },
      ],
    },
    {
      filename,
      code: `
        const User = Schema.Struct({ name: Schema.String }).pipe(
          Schema.annotations({ identifier: "User" })
        )
      `,
      errors: [
        {
          message:
            'Define named schemas with Schema.Class/Schema.TaggedClass instead of assigning Schema.Struct.',
        },
      ],
    },
  ],
});
