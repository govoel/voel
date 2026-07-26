import { Match, Redacted, Schema, SchemaGetter } from 'effect';

import { useAppForm } from '#src/components/form';
import { signInAccountAtom } from '#src/services/accounts/atoms.ts';
import { Account } from '#src/services/database/main/schema.ts';

class AddAccountSchema extends Schema.Class<AddAccountSchema, { readonly brand: unique symbol }>(
  'voel/app/accounts/AddAccountSchema'
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

export const useAddAccountForm = ({ onSuccess }: { readonly onSuccess: () => Promise<void> }) => {
  const form = useAppForm({
    schema: AddAccountSchema,
    mutation: signInAccountAtom,
    defaultValues: { serverUrl: '', username: '', password: '' },
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            'Unexpected error during authentication. Try again.',
          'voel/services/accounts/index/AccountSignInError': (signInError) =>
            signInError.original.message ??
            'Failed to sign in. Check your credentials and try again.',
          'voel/services/accounts/index/AccountDatabaseError': () =>
            'A database error occurred. Try again.',
        })
      ),
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });

  return form;
};
