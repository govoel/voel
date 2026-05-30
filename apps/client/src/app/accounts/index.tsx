import { useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Form,
  Group,
  HStack,
  Label,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  font,
  foregroundStyle,
  frame,
  headerProminence,
  interactiveDismissDisabled,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Effect, Redacted, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

const AddAccountSchema = Schema.Struct({
  serverUrl: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  password: Schema.NonEmptyString,
});

const getSubmitErrorMessage = (error: unknown) =>
  error instanceof Error && error.message.length > 0 ? error.message : 'Unable to add account';

export default function AccountsIndex() {
  const accounts = useAtomValue(accountsAtom);
  const [isPresented, setIsPresented] = useState(true);

  const [isAddPresented, setIsAddPresented] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

      try {
        await Runtime.runPromise(
          AccountManager.pipe(
            Effect.flatMap((manager) =>
              manager.upsertAccount({
                serverUrl: value.serverUrl,
                username: value.username,
                password: Redacted.make(value.password),
              })
            )
          )
        );
      } catch (error) {
        setSubmitError(getSubmitErrorMessage(error));
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
                          key={`${account.serverUrl}-${account.username}`}>
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
                                {account.serverUrl}
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
                            platformProps={{ ios: { placeholder: 'https://demo.voel.app' } }}
                          />
                        )}
                      </form.AppField>
                      <form.AppField name="username">
                        {(field) => <field.TextField label="Username" />}
                      </form.AppField>
                      <form.AppField name="password">
                        {(field) => <field.SecureField label="Password" />}
                      </form.AppField>
                      {submitError !== null ? (
                        <Label
                          title={submitError}
                          modifiers={[
                            iosTextStyle('caption'),
                            foregroundStyle('red'),
                            padding({ top: Spacing.one }),
                          ]}
                        />
                      ) : null}
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
