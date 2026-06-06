import { useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Form,
  Group,
  HStack,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  buttonStyle,
  containerRelativeFrame,
  font,
  foregroundStyle,
  frame,
  headerProminence,
  interactiveDismissDisabled,
  keyboardType,
  padding,
  textContentType,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Effect, Redacted, Schema, SchemaGetter } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import { FormSubmitError, useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom, accountsSheetAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

const AddAccountSchema = Schema.Struct({
  serverUrl: Schema.URLFromString,
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
});

const SetupServerAccountSchema = Schema.Struct({
  serverUrl: Schema.URLFromString,
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  email: Schema.String.check(Schema.isNonEmpty({ message: 'Email is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
});

type AccountFlow = 'add' | 'setup';

const AddAccountForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: { serverUrl: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      yield* Effect.sleep(1000); // Simulate network delay
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

  return (
    <form.AppForm>
      <VStack modifiers={[padding({ vertical: Spacing.three })]}>
        <Form modifiers={[headerProminence('increased')]}>
          <Section title="Add an account">
            <form.AppField name="serverUrl">
              {(field) => (
                <field.TextField
                  label="Server URL"
                  platformProps={{
                    ios: {
                      placeholder: 'https://demo.voel.app',
                      modifiers: [
                        keyboardType('url'),
                        textContentType('URL'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="username">
              {(field) => (
                <field.TextField
                  label="Username"
                  platformProps={{
                    ios: {
                      placeholder: 'you',
                      modifiers: [
                        keyboardType('ascii-capable'),
                        textContentType('username'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.SecureField
                  label="Password"
                  platformProps={{ ios: { placeholder: 'ha!NiceTry' } }}
                />
              )}
            </form.AppField>
          </Section>
        </Form>

        <Spacer />

        <VStack spacing={Spacing.two} modifiers={[padding({ horizontal: Spacing.three })]}>
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Login</Text>
          </form.SubmitButton>

          <Button
            role="destructive"
            modifiers={[buttonStyle('bordered')]}
            onPress={() => {
              form.reset();
              onClose();
            }}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
          </Button>
        </VStack>
      </VStack>
    </form.AppForm>
  );
};

const SetupServerForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: SetupServerAccountSchema,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      yield* Effect.sleep(1000); // Simulate network delay
      const accountManager = yield* AccountManager;
      yield* accountManager.setupServerAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during account setup. Try again.' }),
          'voel/services/accounts/index/AccountSignUpError': (signUpError) =>
            new FormSubmitError({
              message:
                signUpError.original.message ??
                'Failed to create the account. Check the server and try again.',
            }),
          'voel/services/database/ClientDatabaseError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      onClose();
    }),
  });

  return (
    <form.AppForm>
      <VStack modifiers={[padding({ vertical: Spacing.three })]}>
        <Form modifiers={[headerProminence('increased')]}>
          <Section title="Setup new server">
            <form.AppField name="serverUrl">
              {(field) => (
                <field.TextField
                  label="Server URL"
                  platformProps={{
                    ios: {
                      placeholder: 'https://demo.voel.app',
                      modifiers: [
                        keyboardType('url'),
                        textContentType('URL'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  platformProps={{
                    ios: { placeholder: 'Your Name', modifiers: [textContentType('name')] },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  label="Email"
                  platformProps={{
                    ios: {
                      placeholder: 'you@example.com',
                      modifiers: [
                        keyboardType('email-address'),
                        textContentType('emailAddress'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="username">
              {(field) => (
                <field.TextField
                  label="Username"
                  platformProps={{
                    ios: {
                      placeholder: 'you',
                      modifiers: [
                        keyboardType('ascii-capable'),
                        textContentType('username'),
                        textInputAutocapitalization('never'),
                        autocorrectionDisabled(),
                      ],
                    },
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.SecureField
                  label="Password"
                  platformProps={{ ios: { placeholder: 'ha!NiceTry' } }}
                />
              )}
            </form.AppField>
          </Section>
        </Form>

        <Spacer />

        <VStack spacing={Spacing.two} modifiers={[padding({ horizontal: Spacing.three })]}>
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Create account</Text>
          </form.SubmitButton>

          <Button
            role="destructive"
            modifiers={[buttonStyle('bordered')]}
            onPress={() => {
              form.reset();
              onClose();
            }}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
          </Button>
        </VStack>
      </VStack>
    </form.AppForm>
  );
};

const SwitchAccountContent = ({
  onAddAccount,
  onSetupServer,
}: {
  readonly onAddAccount: () => void;
  readonly onSetupServer: () => void;
}) => {
  const accounts = useAtomValue(accountsAtom);

  return (
    <List modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
      <Section title="Switch Account">
        {AsyncResult.matchWithError(accounts, {
          onInitial: () => (
            <ProgressView
              modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
            />
          ),
          onSuccess: (result) =>
            result.value.accounts.length === 0 ? (
              <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                No accounts
              </Text>
            ) : (
              result.value.accounts.map((account) => (
                <Button
                  modifiers={[tint('primary')]}
                  key={`${account.serverUrl.toString()}-${account.username}`}>
                  <HStack alignment="center" spacing={Spacing.two}>
                    <Icon
                      systemName="person.crop.circle.fill"
                      modifiers={[
                        iosTextStyle('largeTitle'),
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      ]}
                    />

                    <VStack alignment="leading" spacing={Spacing.one}>
                      <Text>@{account.username}</Text>
                      <Text
                        variant="caption"
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        {account.serverUrl.toString()}
                      </Text>
                    </VStack>

                    <Spacer />

                    <Icon
                      systemName="chevron.right"
                      modifiers={[
                        font({ textStyle: 'footnote', weight: 'semibold' }),
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      ]}
                    />
                  </HStack>
                </Button>
              ))
            ),
          onError: () => <Text>Error</Text>,
          onDefect: () => <Text>Defect</Text>,
        })}
      </Section>

      <Section>
        <Button
          label="Add account"
          systemImage="person.crop.circle.badge.plus"
          onPress={onAddAccount}
        />
        <Button label="Setup new server" systemImage="server.rack" onPress={onSetupServer} />
      </Section>
    </List>
  );
};

export default function AccountsIndex() {
  const [isPresented, setIsPresented] = useState(true);
  const [accountFlow, setAccountFlow] = useState<AccountFlow | null>(null);
  const dismissable = useAtomValue(
    accountsSheetAtom,
    (state) => AsyncResult.isSuccess(state) && state.value.dismissable
  );

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }}>
        <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
          <Group modifiers={[interactiveDismissDisabled(dismissable)]}>
            <SwitchAccountContent
              onAddAccount={() => {
                setAccountFlow('add');
              }}
              onSetupServer={() => {
                setAccountFlow('setup');
              }}
            />

            {accountFlow === null ? null : (
              <BottomSheet
                isPresented
                onIsPresentedChange={(presented) => {
                  if (!presented) {
                    setAccountFlow(null);
                  }
                }}>
                {accountFlow === 'setup' ? (
                  <SetupServerForm
                    onClose={() => {
                      setAccountFlow(null);
                    }}
                  />
                ) : (
                  <AddAccountForm
                    onClose={() => {
                      setAccountFlow(null);
                    }}
                  />
                )}
              </BottomSheet>
            )}
          </Group>
        </BottomSheet>
      </Host>
    </>
  );
}
