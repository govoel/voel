import { useAtomSuspense, useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import UnfoldMore from '@expo/material-symbols/unfold_more.xml';
import {
  AlertDialog,
  Column,
  Icon,
  LoadingIndicator,
  ModalBottomSheet,
  Row,
  TextButton,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useRef, useState } from 'react';

import {
  accountsWithActiveAccount,
  activeAccountLiteral,
  useRemoveAccountForm,
  useSetActiveAccount,
} from '#src/app/accounts/index.ts';
import { accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const StackNavigationRow = ({
  index,
  count,
  title,
  href,
}: {
  readonly index: number;
  readonly count: number;
  readonly title: string;
  readonly href: Href;
}) => (
  <SegmentedListItem
    index={index}
    count={count}
    onClick={() => {
      router.push(href);
    }}>
    <SegmentedListItem.HeadlineContent>
      <Text>{title}</Text>
    </SegmentedListItem.HeadlineContent>
    <SegmentedListItem.TrailingContent>
      <Icon source={ChevronRight} size={24} />
    </SegmentedListItem.TrailingContent>
  </SegmentedListItem>
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
  const colors = useMaterialColors({ seedColor: '#00AAFF' });
  const form = useRemoveAccountForm({
    onSuccess: async () => {
      onDismiss();
    },
  });

  return (
    <form.AppForm>
      <AlertDialog onDismissRequest={onDismiss}>
        <AlertDialog.Title>
          <Text>Remove account from this device?</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>
            This will sign you out and remove all data associated with @{account.username} on{' '}
            {account.serverUrl} from this device.
          </Text>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <form.SubmitButton platformProps={{ android: { variant: 'text' } }}>
            <Text color={colors.error}>Remove</Text>
          </form.SubmitButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <TextButton onClick={onDismiss}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </form.AppForm>
  );
};

export default function AccountsScreen() {
  const accountsSheet = useAtomSuspense(accountsSheetAtom);

  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);
  const switchAccountSheetRef = useRef<ModalBottomSheetRef>(null);

  const accounts = useAtomValue(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  const [isRemoveAccountFormPresented, setIsRemoveAccountFormPresented] = useState(false);

  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <AndroidAccountsSheet dismissable={accountsSheet.value.dismissable}>
      <Column
        modifiers={[
          padding(
            Spacing.three,
            accountsSheet.value.dismissable ? 0 : Spacing.four,
            Spacing.three,
            Spacing.three
          ),
        ]}
        verticalArrangement={{ spacedBy: Spacing.four }}>
        {AsyncResult.matchWithError(accounts, {
          onInitial: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h3">Switch Account</Text>
              <Row horizontalAlignment="center">
                <LoadingIndicator modifiers={[fillMaxWidth()]} />
              </Row>
            </Column>
          ),
          onSuccess: ({ value: { accounts: accountList, activeAccount } }) => (
            <>
              <Column verticalArrangement={{ spacedBy: Spacing.two }}>
                <Text variant="h3">Switch Account</Text>

                <SegmentedList>
                  {accountList.length === 0 ? (
                    <SegmentedListItem index={0} count={1} enabled={false}>
                      <SegmentedListItem.HeadlineContent>
                        <Text color={colors.onSurfaceVariant}>No accounts</Text>
                      </SegmentedListItem.HeadlineContent>
                    </SegmentedListItem>
                  ) : (
                    <SegmentedListItem
                      index={0}
                      count={1}
                      onClick={() => {
                        setIsSwitchAccountPresented(true);
                      }}>
                      {Option.match(activeAccount, {
                        onNone: () => (
                          <SegmentedListItem.HeadlineContent>
                            <Text>Pick an account</Text>
                          </SegmentedListItem.HeadlineContent>
                        ),
                        onSome: ({ account }) => (
                          <>
                            <SegmentedListItem.LeadingContent>
                              <Icon source={AccountCircle} size={32} />
                            </SegmentedListItem.LeadingContent>
                            <SegmentedListItem.HeadlineContent>
                              <Text>@{account.username}</Text>
                            </SegmentedListItem.HeadlineContent>
                            <SegmentedListItem.SupportingContent>
                              <Text variant="caption" color={colors.onSurfaceVariant}>
                                {account.serverUrl.toString()}
                              </Text>
                            </SegmentedListItem.SupportingContent>
                          </>
                        ),
                      })}
                      <SegmentedListItem.TrailingContent>
                        <Icon source={UnfoldMore} size={24} tint={colors.onSurfaceVariant} />
                      </SegmentedListItem.TrailingContent>
                    </SegmentedListItem>
                  )}
                </SegmentedList>
              </Column>

              {Option.match(activeAccount, {
                onNone: () => null,
                onSome: ({ account }) => (
                  <>
                    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
                      <Column verticalArrangement={{ spacedBy: 0 }}>
                        <Text variant="h4">Your Account</Text>
                        <Text variant="caption" color={colors.onSurfaceVariant}>
                          @{account.username}
                        </Text>
                      </Column>
                      <SegmentedList>
                        <StackNavigationRow
                          index={0}
                          count={3}
                          title="Profile"
                          href="/accounts/profile"
                        />
                        <StackNavigationRow
                          index={1}
                          count={3}
                          title="Settings"
                          href="/accounts/settings"
                        />
                        <SegmentedListItem
                          index={2}
                          count={3}
                          onClick={() => {
                            setIsRemoveAccountFormPresented(true);
                          }}>
                          <SegmentedListItem.HeadlineContent>
                            <Text color={colors.error}>Remove account from this device</Text>
                          </SegmentedListItem.HeadlineContent>
                        </SegmentedListItem>
                      </SegmentedList>
                    </Column>

                    <Column verticalArrangement={{ spacedBy: Spacing.two }}>
                      <Column verticalArrangement={{ spacedBy: 0 }}>
                        <Text variant="h4">Manage Server</Text>
                        <Text variant="caption" color={colors.onSurfaceVariant}>
                          {account.hostname}
                        </Text>
                      </Column>
                      <SegmentedList>
                        <StackNavigationRow
                          index={0}
                          count={3}
                          title="Settings"
                          href="/accounts/server/settings"
                        />
                        <StackNavigationRow
                          index={1}
                          count={3}
                          title="Libraries"
                          href="/accounts/server/libraries"
                        />
                        <StackNavigationRow
                          index={2}
                          count={3}
                          title="Users"
                          href="/accounts/server/users"
                        />
                      </SegmentedList>
                    </Column>

                    {isRemoveAccountFormPresented ? (
                      <RemoveAccountForm
                        account={account}
                        onDismiss={() => {
                          setIsRemoveAccountFormPresented(false);
                        }}
                      />
                    ) : null}
                  </>
                ),
              })}

              {isSwitchAccountPresented ? (
                <ModalBottomSheet
                  ref={switchAccountSheetRef}
                  skipPartiallyExpanded
                  onDismissRequest={() => {
                    setIsSwitchAccountPresented(false);
                  }}>
                  <Column
                    modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
                    verticalArrangement={{ spacedBy: Spacing.two }}>
                    <Text variant="h3">Pick an Account</Text>
                    <SegmentedList>
                      {accountList.map((account, index) => (
                        <SegmentedListItem
                          key={`${account.serverUrl.toString()}-${account.userId}`}
                          index={index}
                          count={accountList.length}
                          selected={account.active === activeAccountLiteral}
                          enabled={!AsyncResult.isWaiting(setActiveAccount)}
                          onClick={() => {
                            void setActiveAccountAndDismiss({
                              input: {
                                serverUrl: account.serverUrl,
                                userId: account.userId,
                                authClient: Option.none(),
                              },
                              onSuccess: async () => {
                                await switchAccountSheetRef.current?.hide();
                              },
                            });
                          }}>
                          <SegmentedListItem.LeadingContent>
                            <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
                          </SegmentedListItem.LeadingContent>
                          <SegmentedListItem.HeadlineContent>
                            <Text>@{account.username}</Text>
                          </SegmentedListItem.HeadlineContent>
                          <SegmentedListItem.SupportingContent>
                            <Text variant="caption" color={colors.onSurfaceVariant}>
                              {account.serverUrl.toString()}
                            </Text>
                          </SegmentedListItem.SupportingContent>
                        </SegmentedListItem>
                      ))}
                    </SegmentedList>
                  </Column>
                </ModalBottomSheet>
              ) : null}
            </>
          ),
          onError: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h3">Switch Account</Text>
              <Text modifiers={[paddingAll(Spacing.four)]}>Error</Text>
            </Column>
          ),
          onDefect: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h3">Switch Account</Text>
              <Text modifiers={[paddingAll(Spacing.four)]}>Defect</Text>
            </Column>
          ),
        })}

        <SegmentedList>
          <StackNavigationRow index={0} count={2} title="Add account" href="/accounts/add" />
          <StackNavigationRow index={1} count={2} title="Setup new server" href="/accounts/setup" />
        </SegmentedList>
      </Column>
    </AndroidAccountsSheet>
  );
}
