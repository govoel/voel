import { useAtomValue } from '@effect/atom-react';
import { Host, Icon } from '@expo/ui';
import {
  Alert,
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
import { Stack, router } from 'expo-router';
import { useState } from 'react';

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

const RemoveAccountAlert = ({
  account,
  isPresented,
  onIsPresentedChange,
}: {
  readonly account: {
    readonly serverUrl: string;
    readonly userId: string;
    readonly username: string;
  };
  readonly isPresented: boolean;
  readonly onIsPresentedChange: (isPresented: boolean) => void;
}) => {
  const form = useRemoveAccountForm({
    defaultValues: { serverUrl: account.serverUrl, userId: account.userId },
    onSuccess: async () => {
      onIsPresentedChange(false);
    },
  });

  return (
    <form.AppForm>
      <Alert
        title="Remove account from this device?"
        isPresented={isPresented}
        onIsPresentedChange={onIsPresentedChange}>
        <Alert.Trigger>
          <Button
            label="Remove account from this device"
            role="destructive"
            onPress={() => {
              form.reset();
              onIsPresentedChange(true);
            }}
          />
        </Alert.Trigger>
        <Alert.Actions>
          <form.SubmitButton platformProps={{ ios: { role: 'destructive' } }}>
            <Text>Remove</Text>
          </form.SubmitButton>
          <Button label="Cancel" role="cancel" />
        </Alert.Actions>
        <Alert.Message>
          <Text>
            This will sign you out and remove all data associated with @{account.username} on{' '}
            {account.serverUrl} from this device.
          </Text>
        </Alert.Message>
      </Alert>
    </form.AppForm>
  );
};

export default function AccountsScreen() {
  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  const [isRemoveAccountConfirmationPresented, setIsRemoveAccountConfirmationPresented] =
    useState(false);

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
                      <Text variant="h4">Your Account</Text>
                      <Text
                        variant="caption"
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        @{accounts.value.activeAccount.value.account.username}
                      </Text>
                    </VStack>
                  }>
                  <StackNavigationRow title="Profile" href="/accounts/profile" />
                  <StackNavigationRow title="Settings" href="/accounts/settings" />

                  <RemoveAccountAlert
                    key={`${accounts.value.activeAccount.value.account.serverUrl}-${accounts.value.activeAccount.value.account.userId}`}
                    account={accounts.value.activeAccount.value.account}
                    isPresented={isRemoveAccountConfirmationPresented}
                    onIsPresentedChange={setIsRemoveAccountConfirmationPresented}
                  />
                </Section>

                <Section
                  header={
                    <VStack alignment="leading">
                      <Text variant="h4">Manage Server</Text>
                      <Text
                        variant="caption"
                        modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                        {accounts.value.activeAccount.value.account.hostname}
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
              <List modifiers={[headerProminence('increased')]}>
                <Section
                  header={
                    <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
                      Pick an Account
                    </Text>
                  }>
                  {accounts.value.accounts.map((account) => (
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
          ) : null}
        </Group>
      </Host>
    </>
  );
}
