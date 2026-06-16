import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

export class SetupServerAccountSchema extends Schema.Class<
  SetupServerAccountSchema,
  { readonly brand: unique symbol }
>('voel/app/accounts/SetupServerAccountSchema')({
  serverUrl: Schema.URLFromString,
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  email: Schema.String.check(Schema.isNonEmpty({ message: 'Email is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
}) {}

export const useSetupServerForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: SetupServerAccountSchema,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      yield* Effect.sleep(1000);
      const accountManager = yield* AccountManager;
      yield* accountManager.setupServerAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during account setup. Try again.' }),
          'voel/services/accounts/index/AccountSignUpError': (signUpError) =>
            new FormSubmitError({
              message:
                signUpError.original.message ??
                'Failed to create the account. Check the server and try again.',
            }),
          'voel/services/database/ClientDatabaseError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      onClose();
    }),
  });

  return form;
};
