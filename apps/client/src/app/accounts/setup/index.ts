import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { Runtime } from '#src/services/runtime.ts';

export class SetupServerAccountInput extends Schema.Class<
  SetupServerAccountInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/setup/index/SetupServerAccountInput')({
  serverUrl: Account.fields.serverUrl.check(
    Schema.makeFilter((s) => (URL.canParse(s) ? true : 'Server URL must be a valid URL'))
  ),
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  email: Schema.String.check(Schema.isNonEmpty({ message: 'Email is required' })),
  username: Account.fields.username.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
}) {}

export const useSetupServerForm = ({ onSuccess }: { readonly onSuccess: () => Promise<void> }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: SetupServerAccountInput,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      const accountManager = yield* AccountManager;
      yield* accountManager.setupServerWithAccount(value).pipe(
        Effect.catchTags({
          BetterAuthClientInitializationError: () =>
            new FormSubmitError({ message: 'Unexpected error during account setup. Try again.' }),
          AccountSignUpError: (signUpError) =>
            new FormSubmitError({
              message:
                signUpError.details.message ??
                'Failed to create the account. Check the server and try again.',
            }),
          AccountDatabaseError: () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      yield* Effect.promise(async () => {
        await onSuccess();
      });
    }),
  });

  return form;
};
