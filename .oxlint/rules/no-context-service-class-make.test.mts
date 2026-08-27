import { RuleTester } from 'oxlint/plugins-dev';

import { noContextServiceClassMakeRule } from './no-context-service-class-make.mts';

const filename = `${import.meta.dirname}/../../packages/effect-kysely/src/domain/models.ts`;

new RuleTester().run('no-context-service-class-make', noContextServiceClassMakeRule, {
  valid: [
    {
      filename,
      code: `
        class Database extends Context.Service<Database>()("Database", {
          make: Effect.succeed({ query: () => "result" })
        }) {}
      `,
    },
    {
      filename,
      code: `
        class Database extends Context.Service<Database, DatabaseShape>()("Database") {
          static readonly layer = Layer.succeed(this, { query: () => "result" })
        }

        class Factory {
          public static readonly make = () => new Factory()
        }
      `,
    },
  ],
  invalid: [
    {
      filename,
      code: `
        class Database extends Context.Service<Database, DatabaseShape>()("Database") {
          public static readonly make = Effect.succeed({ query: () => "result" })
        }
      `,
      errors: [
        {
          message:
            "Define 'make' in the Context.Service options object so the service type can be inferred.",
        },
      ],
    },
    {
      filename,
      code: `
        class Database extends Context.Service<Database, DatabaseShape>()("Database") {
          readonly make = () => Effect.succeed({ query: () => "result" })
        }
      `,
      errors: [
        {
          message:
            "Define 'make' in the Context.Service options object so the service type can be inferred.",
        },
      ],
    },
  ],
});
