import { Effect, Match, Redacted, Schema, SchemaGetter } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AuthSignUpInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { ServerUrl } from '#src/services/accounts/schema.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

class AddAccountInput extends Schema.Class<AddAccountInput, { readonly brand: unique symbol }>(
  'voel/app/accounts/add/AddAccountInput'
)({
  serverUrl: ServerUrl,
  username: Account.fields.username.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: AuthSignUpInput.fields.password.pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
}) {}

const signInAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.signInAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.signInAccount(input)))
).pipe(Atom.withLabel('signInAccountAtom'));

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
            Match.value(signInError.reason).pipe(
              Match.tagsExhaustive({
                BetterAuthApiError: (authReason) =>
                  authReason.message || 'Failed to sign in. Check your credentials and try again.',
                AuthTransportError: () =>
                  'Unable to reach the server. Check your connection and try again.',
                InvalidAuthInputError: () => 'Check the account details and try again.',
                InvalidAuthResponseError: () =>
                  'The server returned an invalid authentication response. Try again.',
              })
            ),
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
