import { useAtomSet, useAtomValue } from '@effect/atom-react';
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
  multilineTextAlignment,
  padding,
  textContentType,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Cause, Exit, Match, Option, Redacted, Schema, SchemaGetter } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { PlatformColor } from 'react-native';

import { Icon, iosTextStyle } from '#modules/design-system';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom, upsertAccountAtom } from '#src/services/accounts/atoms.ts';
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  const upsertAccountMutation = useAtomSet(upsertAccountAtom, { mode: 'promiseExit' });

  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: {
      serverUrl: '',
      username: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const exit = await upsertAccountMutation(value);

      if (Exit.isFailure(exit)) {
        const errorOption = Exit.findErrorOption(exit).pipe(
          Option.map((accountError) =>
            Match.valueTags(accountError, {
              'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
                'Unexpected error during authentication. Try again.',
              'voel/services/accounts/index/AccountSignInError': (signInError) =>
                `Sign in failed: ${signInError.message}`,
              'voel/services/database/ClientDatabaseSqlError': (databaseError) =>
                `Database error: ${databaseError.message}`,
              'voel/services/database/ClientDatabaseNoSuchElementError': () =>
                'Database error: No such element',
              'voel/services/database/ClientDatabaseDecodeError': () =>
                'Database error: Decode error',
            })
          ),
          Option.getOrElse(() => 'Unknown error')
        );

        setSubmitError(errorOption);
        return;
      }

      form.reset();
      setIsAddPresented(false);
    },
    onSubmitInvalid: () => {
      setSubmitError(null);
    },
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
                    setSubmitError(null);
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
                    {submitError === null ? null : (
                      <Text
                        modifiers={[
                          foregroundStyle(PlatformColor('systemRed')),
                          multilineTextAlignment('center'),
                        ]}>
                        {submitError}
                      </Text>
                    )}

                    <form.SubmitButton
                      platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}>
                      <Text modifiers={[frame({ maxWidth: Infinity })]}>Login</Text>
                    </form.SubmitButton>

                    <Button
                      role="destructive"
                      modifiers={[buttonStyle('bordered')]}
                      onPress={() => {
                        form.reset();
                        setSubmitError(null);
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
