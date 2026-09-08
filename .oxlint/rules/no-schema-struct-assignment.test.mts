import { RuleTester } from 'oxlint/plugins-dev';

import { noSchemaStructAssignmentRule } from './no-schema-struct-assignment.mts';

const filename = `${import.meta.dirname}/../../packages/effect-turso/src/domain/models.ts`;

new RuleTester().run('no-schema-struct-assignment', noSchemaStructAssignmentRule, {
  valid: [
    {
      filename,
      code: `
        class User extends Schema.Struct({ name: Schema.String }) {
          public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this)
        }
      `,
    },
    {
      filename,
      code: `
        class UserCreated extends Schema.TaggedStruct("UserCreated", {
          name: Schema.String
        }) {}
      `,
    },
    {
      filename,
      code: `
        class User extends Schema.Opaque<User>()(
          Schema.Struct({ name: Schema.String })
        ) {}
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
            'Define named structural schemas with a class extending Schema.Struct, Schema.TaggedStruct, or Schema.Opaque so schema helpers can be declared as static fields.',
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
            'Define named structural schemas with a class extending Schema.Struct, Schema.TaggedStruct, or Schema.Opaque so schema helpers can be declared as static fields.',
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
            'Define named structural schemas with a class extending Schema.Struct, Schema.TaggedStruct, or Schema.Opaque so schema helpers can be declared as static fields.',
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
            'Define named structural schemas with a class extending Schema.Struct, Schema.TaggedStruct, or Schema.Opaque so schema helpers can be declared as static fields.',
        },
      ],
    },
  ],
});
