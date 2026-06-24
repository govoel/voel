import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form/index.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { Runtime } from '#src/services/runtime.ts';

export class AddAccountSchema extends Schema.Class<
  AddAccountSchema,
  { readonly brand: unique symbol }
>('voel/app/accounts/AddAccountSchema')({
  serverUrl: Account.fields.serverUrl.check(
    Schema.makeFilter((s) => (URL.canParse(s) ? true : 'Server URL must be a valid URL'))
  ),
  username: Account.fields.username.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
}) {}

export const useAddAccountForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: { serverUrl: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      const accountManager = yield* AccountManager;
      yield* accountManager.upsertAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during authentication. Try again.' }),
          'voel/services/accounts/index/AccountSignInError': (signInError) =>
            new FormSubmitError({
              message:
                signInError.original.message ??
                'Failed to sign in. Check your credentials and try again.',
            }),
          '@repo/effect-kysely/effect-kysely/DatabaseSqlError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      onClose();
    }),
  });

  return form;
};
