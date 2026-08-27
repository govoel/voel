import { RuleTester } from 'oxlint/plugins-dev';

import { noSchemaStructAssignmentRule } from './no-schema-struct-assignment.mts';

const filename = `${import.meta.dirname}/../../packages/effect-kysely/src/domain/models.ts`;

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
