import { useAtomValue } from '@effect/atom-react';
import { Host, Icon } from '@expo/ui';
import {
  BottomSheet,
  Button,
  Group,
  HStack,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerRelativeFrame,
  disabled,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  headerProminence,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { Href } from 'expo-router';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  accountsWithActiveAccount,
  activeAccountLiteral,
  useRemoveAccountForm,
  useSetActiveAccount,
} from '#src/app/accounts/index.ts';
import { Text } from '#src/components/text';
import { iosTextStyle } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

const StackNavigationRow = ({ title, href }: { readonly title: string; readonly href: Href }) => (
  <Button
    modifiers={[tint('primary')]}
    onPress={() => {
      router.push(href);
    }}>
    <HStack>
      <Text>{title}</Text>
      <Spacer />
      <Icon
        name="chevron.right"
        modifiers={[
          font({ textStyle: 'footnote', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}
      />
    </HStack>
  </Button>
);

const AccountsList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased')]}>
    {children}

    <Section>
      <StackNavigationRow title="Add account" href="/accounts/add" />
      <StackNavigationRow title="Setup new server" href="/accounts/setup" />
    </Section>
  </List>
);

const RemoveAccountForm = ({
  account,
  onDismiss,
}: {
  readonly account: {
    readonly serverUrl: string;
    readonly userId: string;
    readonly username: string;
  };
  readonly onDismiss: () => void;
}) => {
  const form = useRemoveAccountForm({
    onSuccess: async () => {
      onDismiss();
    },
  });

  return (
    <form.AppForm>
      <VStack
        alignment="leading"
        spacing={Spacing.two}
        modifiers={[padding({ horizontal: Spacing.three, top: Spacing.four })]}>
        <Text variant="h3">Remove account from this device?</Text>
        <Text
          modifiers={[
            fixedSize({ horizontal: false, vertical: true }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          ]}>
          This will sign you out and remove all data associated with @{account.username} on{' '}
          {account.serverUrl} from this device.
        </Text>
        <form.SubmitButton
          platformProps={{
            ios: {
              disableAnimation: true,
              role: 'destructive',
              modifiers: [buttonStyle('bordered')],
            },
          }}
          containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
          <Text>Remove</Text>
        </form.SubmitButton>
        <Button role="cancel" modifiers={[buttonStyle('bordered')]} onPress={onDismiss}>
          <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
        </Button>
      </VStack>
    </form.AppForm>
  );
};

export default function AccountsScreen() {
  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  const [isRemoveAccountFormPresented, setIsRemoveAccountFormPresented] = useState(false);

  return (
    <>
      <Stack.Screen.Title>Manage Account</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(accounts, {
            onInitial: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <ProgressView
                    modifiers={[
                      containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                    ]}
                  />
                </Section>
              </AccountsList>
            ),
            onSuccess: ({ value: { accounts: accountList, activeAccount } }) => (
              <>
                <AccountsList>
                  <Section title="Switch Account">
                    {accountList.length === 0 ? (
                      <Text
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        No accounts
                      </Text>
                    ) : (
                      <Button
                        modifiers={[tint('primary')]}
                        onPress={() => {
                          setIsSwitchAccountPresented(true);
                        }}>
                        <HStack alignment="center" spacing={Spacing.two}>
                          {Option.match(activeAccount, {
                            onNone: () => <Text>Pick an account</Text>,
                            onSome: ({ account }) => (
                              <>
                                <Icon
                                  name="person.crop.circle.fill"
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
                            name="chevron.up.chevron.down"
                            modifiers={[
                              font({ textStyle: 'footnote', weight: 'semibold' }),
                              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                            ]}
                          />
                        </HStack>
                      </Button>
                    )}
                  </Section>

                  {Option.match(activeAccount, {
                    onNone: () => null,
                    onSome: ({ account }) => (
                      <>
                        <Section
                          header={
                            <VStack alignment="leading">
                              <Text variant="h4">Your Account</Text>
                              <Text
                                variant="caption"
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                                ]}>
                                @{account.username}
                              </Text>
                            </VStack>
                          }>
                          <StackNavigationRow title="Profile" href="/accounts/profile" />
                          <StackNavigationRow title="Settings" href="/accounts/settings" />

                          <Button
                            label="Remove account from this device"
                            role="destructive"
                            onPress={() => {
                              setIsRemoveAccountFormPresented(true);
                            }}
                          />
                        </Section>

                        <Section
                          header={
                            <VStack alignment="leading">
                              <Text variant="h4">Manage Server</Text>
                              <Text
                                variant="caption"
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                                ]}>
                                {account.hostname}
                              </Text>
                            </VStack>
                          }>
                          <StackNavigationRow title="Settings" href="/accounts/server/settings" />
                          <StackNavigationRow title="Libraries" href="/accounts/server/libraries" />
                          <StackNavigationRow title="Users" href="/accounts/server/users" />
                        </Section>
                      </>
                    ),
                  })}
                </AccountsList>

                <BottomSheet
                  isPresented={isSwitchAccountPresented}
                  onIsPresentedChange={setIsSwitchAccountPresented}>
                  <List modifiers={[headerProminence('increased')]}>
                    <Section
                      header={
                        <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
                          Pick an Account
                        </Text>
                      }>
                      {accountList.map((account) => (
                        <Button
                          modifiers={[
                            tint('primary'),
                            disabled(AsyncResult.isWaiting(setActiveAccount)),
                          ]}
                          key={`${account.serverUrl.toString()}-${account.userId}`}
                          onPress={() => {
                            void setActiveAccountAndDismiss({
                              input: {
                                serverUrl: account.serverUrl,
                                userId: account.userId,
                                authClient: Option.none(),
                              },
                              onSuccess: async () => {
                                setIsSwitchAccountPresented(false);
                              },
                            });
                          }}>
                          <HStack alignment="center" spacing={Spacing.two}>
                            <Icon
                              name={
                                account.active === activeAccountLiteral
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
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'primary' }),
                                ]}>
                                @{account.username}
                              </Text>
                              <Text
                                variant="caption"
                                modifiers={[
                                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                                ]}>
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

                {Option.match(activeAccount, {
                  onNone: () => null,
                  onSome: ({ account }) => (
                    <BottomSheet
                      fitToContents
                      isPresented={isRemoveAccountFormPresented}
                      onIsPresentedChange={setIsRemoveAccountFormPresented}>
                      <RemoveAccountForm
                        key={`${account.serverUrl}-${account.userId}`}
                        account={account}
                        onDismiss={() => {
                          setIsRemoveAccountFormPresented(false);
                        }}
                      />
                    </BottomSheet>
                  ),
                })}
              </>
            ),
            onError: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <Text>Error</Text>
                </Section>
              </AccountsList>
            ),
            onDefect: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <Text>Defect</Text>
                </Section>
              </AccountsList>
            ),
          })}
        </Group>
      </Host>
    </>
  );
}
