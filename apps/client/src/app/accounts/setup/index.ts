import { Effect, Match, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AuthSignUpInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { authReasonMessage } from '#src/services/accounts/auth.ts';
import { redactPassword } from '#src/services/accounts/form-schema.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { ServerUrl } from '#src/services/accounts/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

class SetupServerAccountInput extends AuthSignUpInput.pipe(
  Schema.fieldsAssign({
    serverUrl: ServerUrl,
    password: AuthSignUpInput.fields.password.pipe(redactPassword),
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
            authReasonMessage({
              reason: signUpError.reason,
              rejected: 'Failed to create the account. Check the server and try again.',
              invalidInput: 'Check the account details and try again.',
              invalidResponse: 'The server returned an invalid authentication response. Try again.',
            }),
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
