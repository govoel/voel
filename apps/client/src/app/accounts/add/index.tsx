import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

export class AddAccountSchema extends Schema.Class<
  AddAccountSchema,
  { readonly brand: unique symbol }
>('voel/app/accounts/AddAccountSchema')({
  serverUrl: Schema.URLFromString,
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
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
      yield* Effect.sleep(1000);
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
