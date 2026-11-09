import { Array } from 'effect';
import { RuleTester } from 'oxlint/plugins-dev';

import { requireExplicitModelFieldsRule } from './require-explicit-model-fields.mts';

const message =
  'List the intended fields explicitly in Schema.Struct using individual model field schemas; do not use an entire model variant or its fields.';

new RuleTester().run('require-explicit-model-fields', requireExplicitModelFieldsRule, {
  valid: [
    {
      code: `
        HttpApiEndpoint.post('create', '/libraries', {
          payload: Schema.Struct({
            name: Library.jsonCreate.fields.name,
            settings: Library.jsonCreate.fields.settings,
          }),
          success: Schema.Struct({ id: Library.json.fields.id }),
        })
      `,
    },
    {
      code: `
        SqlSchema.findOne({
          Request: Schema.Struct({ name: Library.create.fields.name }),
          Result: Schema.Struct({ id: Library.fields.id }),
          execute: (request) => repository.create(request),
        })
      `,
    },
    {
      code: `
        HttpApiEndpoint.get('list', '/libraries', {
          success: Schema.Array(Schema.Struct({
            ...LibraryResponse.fields,
            name: (Library['json'].fields)['name'],
          })),
          error: LibraryNotFoundError,
        })
        SqlSchema.findOne({ Request: AccountKey, Result: AccountRow })
      `,
    },
    {
      code: `
        const fullSchema = Library.jsonCreate
        class Copy extends Schema.Struct({ ...Library.create.fields }) {}
        const options = { Request: Library.create, payload: Library.jsonCreate }
        other.findOne({ Request: Library.create })
        other.post('create', '/libraries', { payload: Library.jsonCreate })
        SqlSchema.findOne({
          Request: Schema.Void,
          Result: Row,
          execute: () => Library.create,
        })
      `,
    },
    {
      code: `
        SqlSchema.findOne({
          Request: Schema.Struct({ json: Library.create.fields.json }),
          Result: Schema.Struct({ update: Library.fields.update }),
        })
      `,
    },
  ],
  invalid: [
    ...Array.map(
      [
        'select',
        'insert',
        'create',
        'update',
        'upsert',
        'json',
        'jsonCreate',
        'jsonUpdate',
        'jsonUpsert',
      ],
      (variant) => ({
        code: `SqlSchema.findOne({ Request: Library.${variant}, Result: Row })`,
        errors: [{ message }],
      })
    ),
    ...Array.map(['params', 'query', 'headers', 'payload', 'success', 'error'], (property) => ({
      code: `HttpApiEndpoint.post('create', '/libraries', { ${property}: Library.jsonCreate })`,
      errors: [{ message }],
    })),
    {
      code: `SqlSchema.findAll({ Request: Schema.Void, Result: Library.json })`,
      errors: [{ message }],
    },
    {
      code: `HttpApiEndpoint.post('create', '/libraries', {
        payload: Schema.Struct({ ...Library.jsonCreate.fields }),
      })`,
      errors: [{ message }],
    },
    {
      code: `SqlSchema.findOne({
        Request: Schema.Struct({ id: Library.fields.id, ...Library.create.fields }),
      })`,
      errors: [{ message }],
    },
    {
      code: `SqlSchema.findOneOption({
        Request: Schema.Struct(Library.create.fields),
      })`,
      errors: [{ message }],
    },
    {
      code: `SqlSchema.void({
        Request: Schema.Struct({
          profile: Schema.Struct(Struct.omit(Account.update.fields, ['id'])),
        }),
      })`,
      errors: [{ message }],
    },
    {
      code: `SqlSchema.findOne({
        Request: Account.upsert.pipe(Schema.middlewareEncoding(crypto)),
      })`,
      errors: [{ message }],
    },
    {
      code: `HttpApiEndpoint.get('list', '/libraries', {
        success: Schema.Struct({ items: Schema.Array(Library.json) }),
      })`,
      errors: [{ message }],
    },
    {
      filename: 'boundary.ts',
      code: `HttpApiEndpoint.put('update', '/libraries', ({
        ['payload']: (Library['jsonUpdate'] as Schema.Top),
      } satisfies Options))`,
      errors: [{ message }],
    },
    {
      filename: 'boundary.ts',
      code: `HttpApiEndpoint.post('create', '/libraries', {
        payload: Schema.Struct({ ...(Library.jsonCreate.fields satisfies Schema.Struct.Fields) }),
      })`,
      errors: [{ message }],
    },
  ],
});
