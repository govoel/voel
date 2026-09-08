import { RuleTester } from 'oxlint/plugins-dev';

import { schemaClassBrandRule } from './schema-class-brand.mts';

const filename = `${import.meta.dirname}/../../packages/effect-turso/src/domain/models.ts`;

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
      code: `class User extends Schema.Struct({ name: Schema.String }) {}`,
    },
    {
      filename,
      code: `class Event extends Schema.TaggedStruct("Event", { id: Schema.String }) {}`,
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
      errors: [
        {
          message:
            'Add { readonly brand: unique symbol } to this schema class. If nominal typing is not desired, extend Schema.Struct, Schema.TaggedStruct, or Schema.Opaque instead.',
        },
      ],
    },
    {
      filename,
      code: `
        class Admin extends User.extend<Admin, Record<never, never>>("Admin")({}) {}
      `,
      errors: [
        {
          message:
            'Add a readonly unique-symbol brand to this schema subclass. If nominal typing is not desired, extend Schema.Struct, Schema.TaggedStruct, or Schema.Opaque instead.',
        },
      ],
    },
  ],
});
