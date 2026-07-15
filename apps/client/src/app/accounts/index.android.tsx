import { useAtomSet, useAtomSuspense, useAtomValue } from '@effect/atom-react';
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
  useSetActiveAccount,
} from '#src/app/accounts/index.tsx';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsSheetAtom, removeAccountAtom } from '#src/services/accounts/atoms.ts';

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

export default function AccountsScreen() {
  const accountsSheet = useAtomSuspense(accountsSheetAtom);

  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);
  const switchAccountSheetRef = useRef<ModalBottomSheetRef>(null);

  const dismissSwitchAccountSheet = async () => {
    await switchAccountSheetRef.current?.hide();
    setIsSwitchAccountPresented(false);
  };

  const accounts = useAtomValue(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  const [isRemoveConfirmationPresented, setIsRemoveConfirmationPresented] = useState(false);
  const removeAccountMutation = useAtomSet(removeAccountAtom);

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
        <Column verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h3">Switch Account</Text>

          {AsyncResult.matchWithError(accounts, {
            onInitial: () => (
              <Row horizontalAlignment="center">
                <LoadingIndicator modifiers={[fillMaxWidth()]} />
              </Row>
            ),
            onSuccess: (result) => (
              <SegmentedList>
                {result.value.accounts.length === 0 ? (
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
                    {Option.match(result.value.activeAccount, {
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
            ),
            onError: () => <Text modifiers={[paddingAll(Spacing.four)]}>Error</Text>,
            onDefect: () => <Text modifiers={[paddingAll(Spacing.four)]}>Defect</Text>,
          })}
        </Column>

        {AsyncResult.isSuccess(accounts) && Option.isSome(accounts.value.activeAccount) ? (
          <>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Column verticalArrangement={{ spacedBy: 0 }}>
                <Text variant="h4">Manage User</Text>
                <Text variant="caption" color={colors.onSurfaceVariant}>
                  @{accounts.value.activeAccount.value.account.username}
                </Text>
              </Column>
              <SegmentedList>
                <StackNavigationRow index={0} count={3} title="Profile" href="/accounts/profile" />
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
                    setIsRemoveConfirmationPresented(true);
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
                  {accounts.value.activeAccount.value.account.hostname}
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

            {isRemoveConfirmationPresented ? (
              <AlertDialog
                onDismissRequest={() => {
                  setIsRemoveConfirmationPresented(false);
                }}>
                <AlertDialog.Title>
                  <Text>Remove account from this device?</Text>
                </AlertDialog.Title>
                <AlertDialog.Text>
                  <Text>
                    This will sign you out and remove all data associated with @
                    {accounts.value.activeAccount.value.account.username} on{' '}
                    {accounts.value.activeAccount.value.account.serverUrl.toString()} from this
                    device.
                  </Text>
                </AlertDialog.Text>
                <AlertDialog.ConfirmButton>
                  <TextButton
                    onClick={() => {
                      if (
                        AsyncResult.isSuccess(accounts) &&
                        Option.isSome(accounts.value.activeAccount)
                      ) {
                        removeAccountMutation({
                          serverUrl: accounts.value.activeAccount.value.account.serverUrl,
                          userId: accounts.value.activeAccount.value.account.userId,
                        });
                      }
                      setIsRemoveConfirmationPresented(false);
                    }}>
                    <Text color={colors.error}>Remove</Text>
                  </TextButton>
                </AlertDialog.ConfirmButton>
                <AlertDialog.DismissButton>
                  <TextButton
                    onClick={() => {
                      setIsRemoveConfirmationPresented(false);
                    }}>
                    <Text>Cancel</Text>
                  </TextButton>
                </AlertDialog.DismissButton>
              </AlertDialog>
            ) : null}
          </>
        ) : null}

        {AsyncResult.isSuccess(accounts) && isSwitchAccountPresented ? (
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
                {accounts.value.accounts.map((account, index) => (
                  <SegmentedListItem
                    key={`${account.serverUrl.toString()}-${account.userId}`}
                    index={index}
                    count={accounts.value.accounts.length}
                    selected={account.active === activeAccountLiteral}
                    enabled={!AsyncResult.isWaiting(setActiveAccount)}
                    onClick={() => {
                      void setActiveAccountAndDismiss(
                        {
                          serverUrl: account.serverUrl,
                          userId: account.userId,
                          authClient: Option.none(),
                        },
                        () => {
                          void dismissSwitchAccountSheet();
                        }
                      );
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

        <SegmentedList>
          <StackNavigationRow index={0} count={2} title="Add account" href="/accounts/add" />
          <StackNavigationRow index={1} count={2} title="Setup new server" href="/accounts/setup" />
        </SegmentedList>
      </Column>
    </AndroidAccountsSheet>
  );
}
