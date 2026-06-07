import { useAtom, useAtomSet, useAtomSuspense, useAtomValue } from '@effect/atom-react';
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
  SwipeActions,
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
  labelStyle,
  padding,
  textContentType,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useEffect, useRef, useState } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import {
  accountsSheetIsPresentedAtom,
  useAddAccountForm,
  useSetupServerForm,
} from '#src/components/accounts/shared.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import {
  accountsAtom,
  accountsSheetAtom,
  removeAccountAtom,
} from '#src/services/accounts/atoms.ts';

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
  const removeAccount = useAtomSet(removeAccountAtom);

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
                  <SwipeActions key={`${account.serverUrl.toString()}-${account.username}`}>
                    <Button modifiers={[tint('primary')]}>
                      <HStack alignment="center" spacing={Spacing.two}>
                        <Icon
                          systemName={
                            account.active
                              ? 'person.crop.circle.fill.badge.checkmark'
                              : 'person.crop.circle.fill'
                          }
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

                    <SwipeActions.Actions edge="trailing">
                      <Button
                        label="Delete"
                        systemImage="trash"
                        role="destructive"
                        modifiers={[labelStyle('iconOnly')]}
                        onPress={() => {
                          removeAccount(account);
                        }}
                      />
                    </SwipeActions.Actions>
                  </SwipeActions>
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

export const AccountsSheet = () => {
  const [isPresented, setIsPresented] = useAtom(accountsSheetIsPresentedAtom);

  const sheet = useAtomSuspense(accountsSheetAtom);
  const lastPresentedRef = useRef<Option.Option<(typeof sheet)['value']['mode']>>(Option.none());

  useEffect(() => {
    if (sheet.value.mode === 'IDLE') {
      lastPresentedRef.current = Option.none();
      return;
    }

    if (
      Option.isSome(lastPresentedRef.current) &&
      lastPresentedRef.current.value === sheet.value.mode
    ) {
      return;
    }

    lastPresentedRef.current = Option.some(sheet.value.mode);
    setIsPresented(true);
  }, [sheet, setIsPresented]);

  return (
    <Host>
      <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
        <Group modifiers={[interactiveDismissDisabled(!sheet.value.dismissable)]}>
          <SwitchAccountContent />
        </Group>
      </BottomSheet>
    </Host>
  );
};
