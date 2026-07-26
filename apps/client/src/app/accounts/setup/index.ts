import { Match, Redacted, Schema, SchemaGetter } from 'effect';

import { useAppForm } from '#src/components/form';
import { setupServerWithAccountAtom } from '#src/services/accounts/atoms.ts';
import { Account } from '#src/services/database/main/schema.ts';

export class SetupServerAccountSchema extends Schema.Class<
  SetupServerAccountSchema,
  { readonly brand: unique symbol }
>('voel/app/accounts/SetupServerAccountSchema')({
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
    schema: SetupServerAccountSchema,
    mutation: setupServerWithAccountAtom,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            'Unexpected error during account setup. Try again.',
          'voel/services/accounts/index/AccountSignUpError': (signUpError) =>
            signUpError.original.message ??
            'Failed to create the account. Check the server and try again.',
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
