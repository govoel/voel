import { Effect, Match, Redacted, Schema, SchemaGetter } from 'effect';

import { useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

class AddAccountInput extends Schema.Class<AddAccountInput, { readonly brand: unique symbol }>(
  'voel/app/accounts/add/index/AddAccountInput'
)({
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

const signInAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.signInAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.signInAccount(input)))
);

export const useAddAccountForm = ({ onSuccess }: { readonly onSuccess: () => Promise<void> }) => {
  const form = useAppForm({
    schema: AddAccountInput,
    mutation: signInAccountAtom,
    defaultValues: { serverUrl: '', username: '', password: '' },
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          BetterAuthClientInitializationError: () =>
            'Unexpected error during authentication. Try again.',
          AccountSignInError: (signInError) =>
            signInError.details.message ??
            'Failed to sign in. Check your credentials and try again.',
          AccountDatabaseError: () => 'A database error occurred. Try again.',
        })
      ),
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });

  return form;
};
