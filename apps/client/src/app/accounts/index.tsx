import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  ConfirmationDialog,
  Group,
  HStack,
  List,
  ProgressView,
  Section,
  Spacer,
  VStack,
} from '@expo/ui/swift-ui';
import {
  containerRelativeFrame,
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
import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Icon, iosTextStyle } from '#modules/design-system';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import {
  accountsAtom,
  removeAccountAtom,
  setActiveAccountAtom,
} from '#src/services/accounts/atoms.ts';

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
        systemName="chevron.right"
        modifiers={[
          font({ textStyle: 'footnote', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}
      />
    </HStack>
  </Button>
);

export default function AccountsScreen() {
  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsAtom);
  const [setActiveAccount, setActiveAccountMutation] = useAtom(setActiveAccountAtom);

  const [isRemoveAccountConfirmationPresented, setIsRemoveAccountConfirmationPresented] =
    useState(false);
  const removeAccountMutation = useAtomSet(removeAccountAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Account</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          <List modifiers={[headerProminence('increased')]}>
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
                <Section
                  header={
                    <VStack alignment="leading">
                      <Text variant="h4">Manage User</Text>
                      <Text
                        variant="caption"
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        @{accounts.value.activeAccount.value.account.username}
                      </Text>
                    </VStack>
                  }>
                  <StackNavigationRow title="Profile" href="/accounts/profile" />
                  <StackNavigationRow title="Settings" href="/accounts/settings" />

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
                        device? This will sign you out and remove all data associated with this
                        account from this device.
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
                  <StackNavigationRow title="Settings" href="/accounts/server/settings" />
                  <StackNavigationRow title="Libraries" href="/accounts/server/libraries" />
                  <StackNavigationRow title="Users" href="/accounts/server/users" />
                </Section>
              </>
            ) : null}

            <Section>
              <StackNavigationRow title="Add account" href="/accounts/add" />
              <StackNavigationRow title="Setup new server" href="/accounts/setup" />
            </Section>
          </List>

          {AsyncResult.isSuccess(accounts) ? (
            <BottomSheet
              isPresented={isSwitchAccountPresented}
              onIsPresentedChange={setIsSwitchAccountPresented}>
              <List
                modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
                <Section title="Pick an Account">
                  {accounts.value.accounts.map((account) => (
                    <Button
                      modifiers={[
                        tint('primary'),
                        disabled(AsyncResult.isWaiting(setActiveAccount)),
                      ]}
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
          ) : null}
        </Group>
      </Host>
    </>
  );
}
