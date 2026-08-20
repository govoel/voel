import { RuleTester } from 'oxlint/plugins-dev';

import { deterministicIdentifiersRule, schemaClassBrandRule } from './effect-conventions.mts';

const filename = '/repo/apps/client/src/domain/models.ts';

new RuleTester().run('deterministic-identifiers', deterministicIdentifiersRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Class<User, { readonly brand: unique symbol }>(
          "voel/domain/models/User"
        )({ name: Schema.String }) {}

        const UserId = Schema.String.pipe(Schema.brand("voel/domain/models/UserId"))
      `,
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("voel/domain/models/UserError")("UserError", {}) {}
      `,
    },
    {
      filename,
      code: `
        const packageName = "voel"
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
          "voel/domain/index/User"
        )({ name: Schema.String }) {}
      `,
      errors: [{ message: "Use the deterministic identifier 'voel/domain/models/User'." }],
    },
    {
      filename,
      code: `
        class UserError extends Schema.TaggedError<
          UserError,
          { readonly brand: unique symbol }
        >("voel/domain/models/UserError")("user-error", {}) {}
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
          message: "Use a static brand identifier beneath 'voel/domain/models/'.",
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
