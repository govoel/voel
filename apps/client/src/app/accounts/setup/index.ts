import { Effect, Match, Redacted, Schema, SchemaGetter } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AuthSignUpInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { AccountManager } from '#src/services/accounts/index.ts';
import { ServerUrl } from '#src/services/accounts/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

class SetupServerAccountInput extends AuthSignUpInput.pipe(
  Schema.fieldsAssign({
    serverUrl: ServerUrl,
    password: AuthSignUpInput.fields.password.pipe(
      Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
        decode: SchemaGetter.transform((password) => Redacted.make(password)),
        encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
      })
    ),
  })
) {}

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
