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
import { Effect, Match, Redacted, Schema, SchemaGetter } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import { FormSubmitError, useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom } from '#src/services/accounts/atoms.ts';
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

export default function AccountsIndex() {
  const accounts = useAtomValue(accountsAtom);
  const [isPresented, setIsPresented] = useState(true);

  const [isAddPresented, setIsAddPresented] = useState(false);

  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: {
      serverUrl: '',
      username: '',
      password: '',
    },
    onSubmit: ({ value }) =>
      AccountManager.pipe(
        Effect.flatMap((manager) => manager.upsertAccount(value)),
        Effect.tap(() =>
          Effect.sync(() => {
            form.reset();
            setIsAddPresented(false);
          })
        ),
        Effect.mapError((accountError) =>
          Match.valueTags(accountError, {
            'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
              new FormSubmitError({
                message: 'Unexpected error during authentication. Try again.',
              }),
            'voel/services/accounts/index/AccountSignInError': (signInError) =>
              new FormSubmitError({ message: `Sign in failed: ${signInError.message}` }),
            'voel/services/database/ClientDatabaseError': () =>
              new FormSubmitError({ message: 'A database error occurred. Try again.' }),
          })
        )
      ),
  });

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }}>
        <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
          <Group modifiers={[interactiveDismissDisabled()]}>
            <List modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
              <Section title="Switch Account">
                {AsyncResult.matchWithError(accounts, {
                  onInitial: () => (
                    <ProgressView
                      modifiers={[
                        containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                      ]}
                    />
                  ),
                  onSuccess: (result) =>
                    result.value.accounts.length === 0 ? (
                      <Text
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
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
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                                ]}>
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
                  onPress={() => {
                    setIsAddPresented(true);
                  }}
                />
              </Section>
            </List>

            <BottomSheet isPresented={isAddPresented} onIsPresentedChange={setIsAddPresented}>
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
                        {(field) => <field.SecureField label="Password" />}
                      </form.AppField>
                    </Section>
                  </Form>

                  <Spacer />

                  <VStack
                    spacing={Spacing.two}
                    modifiers={[padding({ horizontal: Spacing.three })]}>
                    <form.SubmitButton
                      platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}>
                      <Text modifiers={[frame({ maxWidth: Infinity })]}>Login</Text>
                    </form.SubmitButton>

                    <Button
                      role="destructive"
                      modifiers={[buttonStyle('bordered')]}
                      onPress={() => {
                        form.reset();
                        setIsAddPresented(false);
                      }}>
                      <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
                    </Button>
                  </VStack>
                </VStack>
              </form.AppForm>
            </BottomSheet>
          </Group>
        </BottomSheet>
      </Host>
    </>
  );
}
