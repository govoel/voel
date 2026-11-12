import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { AuthSignUpInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { ServerUrl } from '#src/domains/accounts/schema.ts';

class SetupServerAccountInput extends AuthSignUpInput.pipe(
  Schema.fieldsAssign({
    serverUrl: ServerUrl,
    password: AuthSignUpInput.fields.password.pipe(
      Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
        decode: SchemaGetter.transform((password) => Redacted.make(password)),
        encode: SchemaGetter.forbiddenEncoding,
      })
    ),
  })
) {}

export const useSetupServerForm = ({ onSuccess }: { readonly onSuccess: () => Promise<void> }) =>
  useAppForm({
    schema: SetupServerAccountInput,
    onSubmit: ({ value }) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.setupServerWithAccount(value))),
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onFailure: accountFailureMessage,
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });
