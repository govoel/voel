import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Host, Icon } from '@expo/ui';
import {
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
  disabled,
  font,
  foregroundStyle,
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
  removeAccountAtom,
  removeAccountFailureMessage,
  useSetActiveAccount,
} from '#src/app/accounts/index.ts';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
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

export default function AccountsScreen() {
  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsWithActiveAccount);
  const refreshAccounts = useAtomRefresh(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  return (
    <>
      <Stack.Screen.Title>Manage Account</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          {AsyncResult.matchWithError(accounts, {
            onInitial: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <ListState kind="loading" />
                </Section>
              </AccountsList>
            ),
            onSuccess: ({ value: { accounts: accountList, activeAccount } }) => (
              <>
                <AccountsList>
                  <Section title="Switch Account">
                    {accountList.length === 0 ? (
                      <ListState kind="message" message="No accounts" />
                    ) : (
                      <Button
                        modifiers={[tint('primary')]}
                        onPress={() => {
                          setIsSwitchAccountPresented(true);
                        }}>
                        <HStack alignment="center" spacing={Spacing.two}>
                          {Option.match(activeAccount, {
                            onNone: () => <Text>Pick an account</Text>,
                            onSome: (account) => (
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
                    onSome: (account) => (
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

                          <MutationConfirmation
                            key={`${account.serverUrl}-${account.userId}`}
                            mutation={removeAccountAtom}
                            onFailure={removeAccountFailureMessage}
                            title="Remove account from this device?"
                            confirmLabel="Remove"
                            message={`This will sign you out and remove all data associated with @${account.username} on ${account.serverUrl} from this device.`}
                            trigger={({ open, busy }) => (
                              <Button
                                label="Remove account from this device"
                                role="destructive"
                                onPress={open}
                                modifiers={[disabled(busy)]}
                              />
                            )}
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

                <ControlledSheet
                  presented={isSwitchAccountPresented}
                  onDismiss={() => {
                    setIsSwitchAccountPresented(false);
                  }}>
                  {({ close }) => (
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
                                },
                                onSuccess: close,
                              });
                            }}>
                            <HStack alignment="center" spacing={Spacing.two}>
                              <Icon
                                name={
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
                  )}
                </ControlledSheet>
              </>
            ),
            onError: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <ListState
                    kind="error"
                    message="Unable to load accounts."
                    onRetry={refreshAccounts}
                    retrying={accounts.waiting}
                  />
                </Section>
              </AccountsList>
            ),
            onDefect: () => (
              <AccountsList>
                <Section title="Switch Account">
                  <ListState
                    kind="error"
                    message="Unable to load accounts."
                    onRetry={refreshAccounts}
                    retrying={accounts.waiting}
                  />
                </Section>
              </AccountsList>
            ),
          })}
        </Group>
      </Host>
    </>
  );
}
