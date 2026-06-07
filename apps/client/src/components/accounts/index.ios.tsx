import { useAtom, useAtomSet, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  ConfirmationDialog,
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
  disabled,
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
  setActiveAccountAtom,
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
  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);
  const [isAddAccountPresented, setIsAddAccountPresented] = useState(false);
  const [isSetupServerPresented, setIsSetupServerPresented] = useState(false);

  const accounts = useAtomValue(accountsAtom);
  const [setActiveAccount, setActiveAccountMutation] = useAtom(setActiveAccountAtom);

  const [isRemoveAccountConfirmationPresented, setIsRemoveAccountConfirmationPresented] =
    useState(false);
  const [removeAccount, removeAccountMutation] = useAtom(removeAccountAtom);

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
                <Button
                  modifiers={[tint('primary')]}
                  onPress={() => {
                    setIsSwitchAccountPresented(true);
                  }}>
                  <HStack alignment="center" spacing={Spacing.two}>
                    {Option.match(result.value.activeAccount, {
                      onNone: () => <Text>Pick an account</Text>,
                      onSome: ({ account }) => (
                        <>
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
                        </>
                      ),
                    })}

                    <Spacer />

                    <Icon
                      systemName="chevron.up.chevron.down"
                      modifiers={[
                        font({ textStyle: 'footnote', weight: 'semibold' }),
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      ]}
                    />
                  </HStack>
                </Button>
              ),
            onError: () => <Text>Error</Text>,
            onDefect: () => <Text>Defect</Text>,
          })}
        </Section>

        {AsyncResult.isSuccess(accounts) && Option.isSome(accounts.value.activeAccount) ? (
          <>
            <Section>
              <Button modifiers={[tint('primary')]}>
                <HStack>
                  <Text>Profile</Text>
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
              <Button modifiers={[tint('primary')]}>
                <HStack>
                  <Text>Settings</Text>
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

              <ConfirmationDialog
                title="Remove account from this device"
                isPresented={isRemoveAccountConfirmationPresented}
                onIsPresentedChange={setIsRemoveAccountConfirmationPresented}
                titleVisibility="visible">
                <ConfirmationDialog.Trigger>
                  <Button
                    label="Remove account from this device"
                    role="destructive"
                    onPress={() => {
                      setIsRemoveAccountConfirmationPresented(true);
                    }}
                  />
                </ConfirmationDialog.Trigger>
                <ConfirmationDialog.Actions>
                  <Button
                    label="Confirm"
                    role="destructive"
                    onPress={() => {
                      if (
                        AsyncResult.isSuccess(accounts) &&
                        Option.isSome(accounts.value.activeAccount)
                      ) {
                        removeAccountMutation({
                          serverUrl: accounts.value.activeAccount.value.account.serverUrl,
                          username: accounts.value.activeAccount.value.account.username,
                        });
                      }
                      setIsRemoveAccountConfirmationPresented(false);
                    }}
                  />
                  <Button label="Cancel" role="cancel" />
                </ConfirmationDialog.Actions>
                <ConfirmationDialog.Message>
                  <Text>
                    Are you sure you want to remove @
                    {accounts.value.activeAccount.value.account.username} on{' '}
                    {accounts.value.activeAccount.value.account.serverUrl.toString()} from this
                    device?
                  </Text>
                </ConfirmationDialog.Message>
              </ConfirmationDialog>
            </Section>

            <Section
              header={
                <VStack alignment="leading">
                  <Text variant="h4">Manage Server</Text>
                  <Text
                    variant="caption"
                    modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {accounts.value.activeAccount.value.account.serverUrl.hostname}
                  </Text>
                </VStack>
              }>
              <Button modifiers={[tint('primary')]}>
                <HStack>
                  <Text>Settings</Text>
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
              <Button modifiers={[tint('primary')]}>
                <HStack>
                  <Text>Libraries</Text>
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
              <Button modifiers={[tint('primary')]}>
                <HStack>
                  <Text>Users</Text>
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
            </Section>
          </>
        ) : null}

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

      {AsyncResult.isSuccess(accounts) ? (
        <BottomSheet
          isPresented={isSwitchAccountPresented}
          onIsPresentedChange={setIsSwitchAccountPresented}>
          <List modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
            <Section title="Pick an Account">
              {accounts.value.accounts.map((account) => (
                <Button
                  modifiers={[tint('primary'), disabled(AsyncResult.isWaiting(setActiveAccount))]}
                  key={`${account.serverUrl.toString()}-${account.username}`}
                  onPress={() => {
                    setActiveAccountMutation({
                      serverUrl: account.serverUrl,
                      username: account.username,
                      authClient: Option.none(),
                    });
                  }}>
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
                      <Text
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                        @{account.username}
                      </Text>
                      <Text
                        variant="caption"
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        {account.serverUrl.toString()}
                      </Text>
                    </VStack>

                    {AsyncResult.isWaiting(setActiveAccount) ? (
                      <>
                        <Spacer />
                        <ProgressView />
                      </>
                    ) : null}
                  </HStack>
                </Button>
              ))}
            </Section>
          </List>
        </BottomSheet>
      ) : null}

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
