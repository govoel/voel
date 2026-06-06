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
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import { useAddAccountForm, useSetupServerForm } from '#src/app/accounts/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom, accountsSheetAtom } from '#src/services/accounts/atoms.ts';

const AddAccountForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAddAccountForm({ onClose });

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
  const form = useSetupServerForm({ onClose });

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

const SwitchAccountContent = () => {
  const [isAddAccountPresented, setIsAddAccountPresented] = useState(false);
  const [isSetupServerPresented, setIsSetupServerPresented] = useState(false);
  const accounts = useAtomValue(accountsAtom);

  return (
    <Group>
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
              setIsAddAccountPresented(true);
            }}
          />
          <Button
            label="Setup new server"
            systemImage="server.rack"
            onPress={() => {
              setIsSetupServerPresented(true);
            }}
          />
        </Section>
      </List>

      <BottomSheet
        isPresented={isAddAccountPresented}
        onIsPresentedChange={setIsAddAccountPresented}>
        <AddAccountForm
          onClose={() => {
            setIsAddAccountPresented(false);
          }}
        />
      </BottomSheet>

      <BottomSheet
        isPresented={isSetupServerPresented}
        onIsPresentedChange={setIsSetupServerPresented}>
        <SetupServerForm
          onClose={() => {
            setIsSetupServerPresented(false);
          }}
        />
      </BottomSheet>
    </Group>
  );
};

export default function AccountsIndex() {
  const [isPresented, setIsPresented] = useState(true);
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
            <SwitchAccountContent />
          </Group>
        </BottomSheet>
      </Host>
    </>
  );
}
