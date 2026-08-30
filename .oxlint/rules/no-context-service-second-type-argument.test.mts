import { RuleTester } from 'oxlint/plugins-dev';

import { noContextServiceSecondTypeArgumentRule } from './no-context-service-second-type-argument.mts';

const filename = `${import.meta.dirname}/fixture.ts`;

new RuleTester().run(
  'no-context-service-second-type-argument',
  noContextServiceSecondTypeArgumentRule,
  {
    valid: [
      {
        filename,
        code: `
          class Database extends Context.Service<Database>()("Database", {
            make: Effect.succeed({ query: () => "result" })
          }) {}
        `,
      },
      { filename, code: `const Database = Context.Service<DatabaseShape>("Database")` },
      {
        filename,
        code: `class Database extends Other.Service<Database, DatabaseShape>()("Database") {}`,
      },
    ],
    invalid: [
      {
        filename,
        code: `
          class Database extends Context.Service<Database, DatabaseShape>()("Database") {}
        `,
        errors: [
          {
            message:
              "Omit Context.Service's second type argument and infer the service type from make.",
          },
        ],
      },
      {
        filename,
        code: `const Database = Context.Service<DatabaseIdentifier, DatabaseShape>("Database")`,
        errors: [
          {
            message:
              "Omit Context.Service's second type argument and infer the service type from make.",
          },
        ],
      },
    ],
  }
);
