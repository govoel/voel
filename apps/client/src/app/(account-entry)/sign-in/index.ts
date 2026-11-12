import { Effect, Redacted, Schema, SchemaGetter } from 'effect';

import { AuthSignInInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { ServerUrl } from '#src/domains/accounts/schema.ts';

class AddAccountInput extends AuthSignInInput.pipe(
  Schema.fieldsAssign({
    serverUrl: ServerUrl,
    password: AuthSignInInput.fields.password.pipe(
      Schema.decodeTo(Schema.Redacted(Schema.String, { disallowJsonEncode: true }), {
        decode: SchemaGetter.transform((password) => Redacted.make(password)),
        encode: SchemaGetter.forbiddenEncoding,
      })
    ),
  })
) {}

export const useAddAccountForm = ({
  initialAccount,
  onSuccess,
}: {
  readonly initialAccount?: {
    readonly serverUrl: string;
    readonly username: string;
  };
  readonly onSuccess: () => Promise<void>;
}) =>
  useAppForm({
    schema: AddAccountInput,
    onSubmit: ({ value }) =>
      AccountManager.pipe(Effect.flatMap((manager) => manager.signInAccount(value))),
    defaultValues: {
      serverUrl: initialAccount?.serverUrl ?? '',
      username: initialAccount?.username ?? '',
      password: '',
    },
    onFailure: accountFailureMessage,
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });
