import { useAtomSuspense, useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import UnfoldMore from '@expo/material-symbols/unfold_more.xml';
import { Column, Icon, LoadingIndicator, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
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
import { accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ControlledSheet } from '#src/components/controlled-sheet';
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

  const [isSwitchAccountPresented, setIsSwitchAccountPresented] = useState(false);

  const accounts = useAtomValue(accountsWithActiveAccount);
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
                      {Option.isSome(activeAccount) ? (
                        <SegmentedListItem.LeadingContent>
                          <Icon source={AccountCircle} size={32} />
                        </SegmentedListItem.LeadingContent>
                      ) : null}
                      {/* Keep the native headline slot mounted when the active account is removed. */}
                      <SegmentedListItem.HeadlineContent>
                        <Text>
                          {Option.match(activeAccount, {
                            onNone: () => 'Pick an account',
                            onSome: (account) => `@${account.username}`,
                          })}
                        </Text>
                      </SegmentedListItem.HeadlineContent>
                      {Option.isSome(activeAccount) ? (
                        <SegmentedListItem.SupportingContent>
                          <Text variant="caption" color={colors.onSurfaceVariant}>
                            {activeAccount.value.serverUrl.toString()}
                          </Text>
                        </SegmentedListItem.SupportingContent>
                      ) : null}
                      <SegmentedListItem.TrailingContent>
                        <Icon source={UnfoldMore} size={24} tint={colors.onSurfaceVariant} />
                      </SegmentedListItem.TrailingContent>
                    </SegmentedListItem>
                  )}
                </SegmentedList>
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
