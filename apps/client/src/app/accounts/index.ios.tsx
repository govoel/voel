import { useAtomRefresh, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import { Host, Icon } from '@expo/ui';
import { Button, Group, HStack, List, Section, Spacer, VStack } from '@expo/ui/swift-ui';
import {
  disabled,
  font,
  foregroundStyle,
  headerProminence,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { Href } from 'expo-router';
import { Stack, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';

import {
  accountsWithActiveAccount,
  removeAccountAtom,
  removeAccountFailureMessage,
} from '#src/app/accounts/index.ts';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { Sheet } from '#src/components/sheet';
import { useSheetSelection } from '#src/components/sheet/selection.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { AccountPicker } from '#src/domains/accounts/components/account-picker';
import {
  accountsSheetAtom,
  accountsSheetIsInvalidSession,
} from '#src/domains/accounts/components/auto-presenter/model.ts';

const StackNavigationRow = ({ title, href }: { readonly title: string; readonly href: Href }) => {
  const router = useRouter();

  return (
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
};

const AccountsList = ({ children }: PropsWithChildren) => (
  <List modifiers={[headerProminence('increased')]}>
    {children}

    <Section>
      <StackNavigationRow
        title="Add account"
        href={{ pathname: '/sign-in', params: { returnTo: '/accounts' } }}
      />
      <StackNavigationRow
        title="Setup new server"
        href={{ pathname: '/server-setup', params: { returnTo: '/accounts' } }}
      />
    </Section>
  </List>
);

export default function AccountsScreen() {
  const router = useRouter();
  const accountsSheet = useAtomSuspense(accountsSheetAtom);
  const sessionExpired = accountsSheetIsInvalidSession(accountsSheet.value);
  const [switchAccountSelection, dispatchSwitchAccount, SwitchAccountEvent] =
    useSheetSelection<'account'>();

  const accounts = useAtomValue(accountsWithActiveAccount);
  const refreshAccounts = useAtomRefresh(accountsWithActiveAccount);

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
                      <ListState
                        kind="empty"
                        message="No accounts. Add an account to get started."
                      />
                    ) : (
                      <Button
                        modifiers={[tint('primary')]}
                        onPress={() => {
                          dispatchSwitchAccount(SwitchAccountEvent.Open({ selection: 'account' }));
                        }}>
                        <HStack alignment="center" spacing={Spacing.two}>
                          {Option.match(activeAccount, {
                            onNone: () => <Text>Pick an account</Text>,
                            onSome: (account) => (
                              <>
                                <Icon
                                  name="person.crop.circle.fill"
                                  modifiers={[
                                    font({ textStyle: 'largeTitle', weight: 'bold' }),
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
                                    {account.key.serverUrl.toString()}
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

                    {sessionExpired
                      ? Option.match(activeAccount, {
                          onNone: () => null,
                          onSome: (account) => (
                            <StackNavigationRow
                              title="Sign in again to continue using this account"
                              href={{
                                pathname: '/sign-in',
                                params: {
                                  serverUrl: account.key.serverUrl.toString(),
                                  username: account.username,
                                  reauthenticate: 'true',
                                  returnTo: '/accounts',
                                },
                              }}
                            />
                          ),
                        })
                      : null}
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
                            key={`${account.key.serverUrl}-${account.key.userId}`}
                            mutation={removeAccountAtom(account.key)}
                            onSuccess={({ result }) => {
                              if (!result.accountsRemain) {
                                router.dismissTo('/');
                              }
                            }}
                            onFailure={removeAccountFailureMessage}
                            title="Remove account from this device?"
                            confirmLabel="Remove"
                            message={`This will sign you out and remove all data associated with @${account.username} on ${account.key.serverUrl} from this device.`}
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

                        {account.role === 'admin' ? (
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
                            <StackNavigationRow
                              title="Libraries"
                              href="/accounts/server/libraries"
                            />
                            <StackNavigationRow title="Users" href="/accounts/server/users" />
                          </Section>
                        ) : null}
                      </>
                    ),
                  })}
                </AccountsList>

                {Option.isSome(switchAccountSelection) ? (
                  <Sheet
                    onDismissed={() => {
                      dispatchSwitchAccount(SwitchAccountEvent.Dismissed());
                    }}>
                    {({ dismiss }) => <AccountPicker accounts={accountList} onSelected={dismiss} />}
                  </Sheet>
                ) : null}
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
