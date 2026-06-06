import { useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import HostIcon from '@expo/material-symbols/host.xml';
import PersonAddIcon from '@expo/material-symbols/person_add.xml';
import {
  Column,
  FilledTonalButton,
  Host,
  Icon,
  LoadingIndicator,
  ModalBottomSheet,
  OutlinedButton,
  Row,
  Spacer,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, paddingAll, width } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { SegmentedList, SegmentedListItem } from '#modules/design-system';
import { useAddAccountForm, useSetupServerForm } from '#src/app/accounts/index.tsx';
import type { AccountFlow } from '#src/app/accounts/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom, accountsSheetAtom } from '#src/services/accounts/atoms.ts';

const AddAccountForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAddAccountForm({ onClose });

  return (
    <form.AppForm>
      <Column
        modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Add an account</Text>

        <form.AppField name="serverUrl">
          {(field) => (
            <field.TextField
              label="Server URL"
              placeholder="https://demo.voel.app"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'uri',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="username">
          {(field) => (
            <field.TextField
              label="Username"
              placeholder="you"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'ascii',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.SecureField
              label="Password"
              placeholder="ha!NiceTry"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>

        <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
          <Text>Login</Text>
        </form.SubmitButton>

        <OutlinedButton
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            form.reset();
            onClose();
          }}>
          <Text>Cancel</Text>
        </OutlinedButton>
      </Column>
    </form.AppForm>
  );
};

const SetupServerForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useSetupServerForm({ onClose });

  return (
    <form.AppForm>
      <Column
        modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Setup new server</Text>

        <form.AppField name="serverUrl">
          {(field) => (
            <field.TextField
              label="Server URL"
              placeholder="https://demo.voel.app"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'uri',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label="Name"
              placeholder="Your Name"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>

        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="Email"
              placeholder="you@example.com"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'email',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="username">
          {(field) => (
            <field.TextField
              label="Username"
              placeholder="you"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'ascii',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.SecureField
              label="Password"
              placeholder="ha!NiceTry"
              platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
            />
          )}
        </form.AppField>

        <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
          <Text>Create account</Text>
        </form.SubmitButton>

        <OutlinedButton
          modifiers={[fillMaxWidth()]}
          onClick={() => {
            form.reset();
            onClose();
          }}>
          <Text>Cancel</Text>
        </OutlinedButton>
      </Column>
    </form.AppForm>
  );
};

const SwitchAccountContent = ({
  onAddAccount,
  onSetupServer,
}: {
  readonly onAddAccount: () => void;
  readonly onSetupServer: () => void;
}) => {
  const accounts = useAtomValue(accountsAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <Column modifiers={[paddingAll(Spacing.three)]} verticalArrangement={{ spacedBy: Spacing.two }}>
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
              result.value.accounts.map((account, index) => (
                <SegmentedListItem
                  key={`${account.serverUrl.toString()}-${account.username}`}
                  index={index}
                  count={result.value.accounts.length}>
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
                  <SegmentedListItem.TrailingContent>
                    <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                  </SegmentedListItem.TrailingContent>
                </SegmentedListItem>
              ))
            )}
          </SegmentedList>
        ),
        onError: () => <Text modifiers={[paddingAll(Spacing.four)]}>Error</Text>,
        onDefect: () => <Text modifiers={[paddingAll(Spacing.four)]}>Defect</Text>,
      })}

      <FilledTonalButton onClick={onAddAccount} modifiers={[fillMaxWidth()]}>
        <Icon source={PersonAddIcon} size={18} tint={colors.onSurfaceVariant} />
        <Spacer modifiers={[width(Spacing.two)]} />
        <Text>Add account</Text>
      </FilledTonalButton>

      <FilledTonalButton onClick={onSetupServer} modifiers={[fillMaxWidth()]}>
        <Icon source={HostIcon} size={18} tint={colors.onSurfaceVariant} />
        <Spacer modifiers={[width(Spacing.two)]} />
        <Text>Setup new server</Text>
      </FilledTonalButton>
    </Column>
  );
};

export default function AccountsIndex() {
  const [isPresented, setIsPresented] = useState(true);
  const [accountFlow, setAccountFlow] = useState<AccountFlow | null>(null);
  const dismissable = useAtomValue(
    accountsSheetAtom,
    (state) => AsyncResult.isSuccess(state) && state.value.dismissable
  );

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }} seedColor="#00AAFF">
        {isPresented ? (
          <ModalBottomSheet
            onDismissRequest={() => {
              setIsPresented(false);
            }}
            showDragHandle={dismissable}
            sheetGesturesEnabled={dismissable}
            properties={{
              shouldDismissOnBackPress: dismissable,
              shouldDismissOnClickOutside: dismissable,
            }}>
            <SwitchAccountContent
              onAddAccount={() => {
                setAccountFlow('add');
              }}
              onSetupServer={() => {
                setAccountFlow('setup');
              }}
            />
          </ModalBottomSheet>
        ) : null}

        {accountFlow === null ? null : (
          <ModalBottomSheet
            onDismissRequest={() => {
              setAccountFlow(null);
            }}>
            {accountFlow === 'setup' ? (
              <SetupServerForm
                onClose={() => {
                  setAccountFlow(null);
                }}
              />
            ) : (
              <AddAccountForm
                onClose={() => {
                  setAccountFlow(null);
                }}
              />
            )}
          </ModalBottomSheet>
        )}
      </Host>
    </>
  );
}
