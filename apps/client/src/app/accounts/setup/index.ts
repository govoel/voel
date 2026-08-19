import { Effect, Match, Redacted, Schema, SchemaGetter } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

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

const setupServerWithAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setupServerWithAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setupServerWithAccount(input)))
).pipe(Atom.withLabel('setupServerWithAccountAtom'));

export const useSetupServerForm = ({ onSuccess }: { readonly onSuccess: () => Promise<void> }) => {
  const form = useAppForm({
    schema: SetupServerAccountInput,
    mutation: setupServerWithAccountAtom,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          BetterAuthClientInitializationError: () =>
            'Unexpected error during account setup. Try again.',
          AccountSignUpError: (signUpError) =>
            Match.value(signUpError.reason).pipe(
              Match.tagsExhaustive({
                BetterAuthApiError: (authReason) =>
                  authReason.message ||
                  'Failed to create the account. Check the server and try again.',
                AuthTransportError: () =>
                  'Unable to reach the server. Check your connection and try again.',
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
