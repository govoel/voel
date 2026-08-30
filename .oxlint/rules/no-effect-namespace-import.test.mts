import { RuleTester } from 'oxlint/plugins-dev';

import { noEffectNamespaceImportRule } from './no-effect-namespace-import.mts';

const filename = `${import.meta.dirname}/fixture.ts`;

new RuleTester().run('no-effect-namespace-import', noEffectNamespaceImportRule, {
  valid: [
    { filename, code: `import { Effect } from 'effect'` },
    { filename, code: `import { SqlClient } from 'effect/unstable/sql'` },
    { filename, code: `import type { SqlConnection } from 'effect/unstable/sql'` },
    { filename, code: `import * as React from 'react'` },
    { filename, code: `import * as Effectful from 'effectful'` },
  ],
  invalid: [
    {
      filename,
      code: `import * as Effect from 'effect'`,
      errors: [
        { message: 'Use a named import from an Effect barrel instead of a namespace import.' },
      ],
    },
    {
      filename,
      code: `import * as SqlClient from 'effect/unstable/sql/SqlClient'`,
      errors: [
        { message: 'Use a named import from an Effect barrel instead of a namespace import.' },
      ],
    },
    {
      filename,
      code: `import type * as SqlConnection from 'effect/unstable/sql/SqlConnection'`,
      errors: [
        { message: 'Use a named import from an Effect barrel instead of a namespace import.' },
      ],
    },
  ],
});
