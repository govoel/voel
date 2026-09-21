import { useAtomRefresh, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import UnfoldMore from '@expo/material-symbols/unfold_more.xml';
import { Column, Icon } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useState } from 'react';

import {
  accountsWithActiveAccount,
  removeAccountAtom,
  removeAccountFailureMessage,
  useSetActiveAccount,
} from '#src/app/accounts/index.ts';
import {
  accountsSheetAtom,
  accountsSheetIsInvalidSession,
} from '#src/components/accounts-auto-presenter/model.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
import { ListState } from '#src/components/list-state';
import { MutationConfirmation } from '#src/components/mutation-confirmation';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
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

export default function AccountsScreen() {
  const accountsSheet = useAtomSuspense(accountsSheetAtom);
  const sessionExpired = accountsSheetIsInvalidSession(accountsSheet.value);

  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsWithActiveAccount);
  const refreshAccounts = useAtomRefresh(accountsWithActiveAccount);
  const [setActiveAccount, setActiveAccountAndDismiss] = useSetActiveAccount();

  const colors = useMaterialColors();

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
              <ListState kind="loading" />
            </Column>
          ),
          onSuccess: ({ value: { accounts: accountList, activeAccount } }) => (
            <>
              <Column verticalArrangement={{ spacedBy: Spacing.two }}>
                <Text variant="h3">Switch Account</Text>

                {accountList.length === 0 ? (
                  <ListState kind="empty" message="No accounts. Add an account to get started." />
                ) : (
                  <SegmentedList>
                    <SegmentedListItem
                      // Native slot discovery needs a fresh row when the slot layout changes.
                      key={Option.isSome(activeAccount) ? 'active-account' : 'pick-account'}
                      index={0}
                      count={sessionExpired && Option.isSome(activeAccount) ? 2 : 1}
                      onClick={() => {
                        setIsSwitchAccountPresented(true);
                      }}>
                      {Option.match(activeAccount, {
                        onNone: () => (
                          <SegmentedListItem.HeadlineContent>
                            <Text>Pick an account</Text>
                          </SegmentedListItem.HeadlineContent>
                        ),
                        onSome: (account) => (
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

                    {sessionExpired
                      ? Option.match(activeAccount, {
                          onNone: () => null,
                          onSome: (account) => (
                            <StackNavigationRow
                              index={1}
                              count={2}
                              title="Sign in again to continue using this account"
                              href={{
                                pathname: '/accounts/add',
                                params: {
                                  serverUrl: account.serverUrl.toString(),
                                  username: account.username,
                                  reauthenticate: 'true',
                                },
                              }}
                            />
                          ),
                        })
                      : null}
                  </SegmentedList>
                )}
              </Column>

              {Option.match(activeAccount, {
                onNone: () => null,
                onSome: (account) => (
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
                        <MutationConfirmation
                          key={`${account.serverUrl}-${account.userId}`}
                          mutation={removeAccountAtom}
                          onFailure={removeAccountFailureMessage}
                          title="Remove account from this device?"
                          confirmLabel="Remove"
                          message={`This will sign you out and remove all data associated with @${account.username} on ${account.serverUrl} from this device.`}
                          trigger={({ open, busy }) => (
                            <SegmentedListItem index={2} count={3} onClick={open} enabled={!busy}>
                              <SegmentedListItem.HeadlineContent>
                                <Text color={colors.error}>Remove account from this device</Text>
                              </SegmentedListItem.HeadlineContent>
                            </SegmentedListItem>
                          )}
                        />
                      </SegmentedList>
                    </Column>

                    {account.role === 'admin' ? (
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
                    ) : null}
                  </>
                ),
              })}

              <ControlledSheet
                presented={isSwitchAccountPresented}
                onDismiss={() => {
                  setIsSwitchAccountPresented(false);
                }}>
                {({ close }) => (
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
                          selected={account.active}
                          enabled={!AsyncResult.isWaiting(setActiveAccount)}
                          onClick={() => {
                            void setActiveAccountAndDismiss({
                              input: {
                                serverUrl: account.serverUrl,
                                userId: account.userId,
                              },
                              onSuccess: close,
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
                )}
              </ControlledSheet>
            </>
          ),
          onError: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h3">Switch Account</Text>
              <ListState
                kind="error"
                message="Unable to load accounts."
                onRetry={refreshAccounts}
                retrying={accounts.waiting}
              />
            </Column>
          ),
          onDefect: () => (
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text variant="h3">Switch Account</Text>
              <ListState
                kind="error"
                message="Unable to load accounts."
                onRetry={refreshAccounts}
                retrying={accounts.waiting}
              />
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
