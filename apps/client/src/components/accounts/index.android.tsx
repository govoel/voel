import { useAtom, useAtomSuspense, useAtomValue } from '@effect/atom-react';
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
import { Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useEffect, useRef, useState } from 'react';

import { SegmentedList, SegmentedListItem } from '#modules/design-system';
import {
  accountsSheetIsPresentedAtom,
  useAddAccountForm,
  useSetupServerForm,
} from '#src/components/accounts/shared.ts';
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

const SwitchAccountContent = () => {
  const [isAddAccountPresented, setIsAddAccountPresented] = useState(false);
  const [isSetupServerPresented, setIsSetupServerPresented] = useState(false);
  const accounts = useAtomValue(accountsAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <>
      <Column
        modifiers={[paddingAll(Spacing.three)]}
        verticalArrangement={{ spacedBy: Spacing.two }}>
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

        <FilledTonalButton
          onClick={() => {
            setIsAddAccountPresented(true);
          }}
          modifiers={[fillMaxWidth()]}>
          <Icon source={PersonAddIcon} size={18} tint={colors.onSurfaceVariant} />
          <Spacer modifiers={[width(Spacing.two)]} />
          <Text>Add account</Text>
        </FilledTonalButton>

        <FilledTonalButton
          onClick={() => {
            setIsSetupServerPresented(true);
          }}
          modifiers={[fillMaxWidth()]}>
          <Icon source={HostIcon} size={18} tint={colors.onSurfaceVariant} />
          <Spacer modifiers={[width(Spacing.two)]} />
          <Text>Setup new server</Text>
        </FilledTonalButton>
      </Column>

      {isAddAccountPresented ? (
        <ModalBottomSheet
          skipPartiallyExpanded
          onDismissRequest={() => {
            setIsAddAccountPresented(false);
          }}>
          <AddAccountForm
            onClose={() => {
              setIsAddAccountPresented(false);
            }}
          />
        </ModalBottomSheet>
      ) : null}

      {isSetupServerPresented ? (
        <ModalBottomSheet
          skipPartiallyExpanded
          onDismissRequest={() => {
            setIsSetupServerPresented(false);
          }}>
          <SetupServerForm
            onClose={() => {
              setIsSetupServerPresented(false);
            }}
          />
        </ModalBottomSheet>
      ) : null}
    </>
  );
};

export const AccountsSheet = () => {
  const [isPresented, setIsPresented] = useAtom(accountsSheetIsPresentedAtom);

  const sheet = useAtomSuspense(accountsSheetAtom);
  const lastPresentedRef = useRef<Option.Option<(typeof sheet)['value']['mode']>>(Option.none());

  useEffect(() => {
    if (sheet.value.mode === 'IDLE') {
      lastPresentedRef.current = Option.none();
      return;
    }

    if (
      Option.isSome(lastPresentedRef.current) &&
      lastPresentedRef.current.value === sheet.value.mode
    ) {
      return;
    }

    lastPresentedRef.current = Option.some(sheet.value.mode);
    setIsPresented(true);
  }, [sheet, setIsPresented]);

  return (
    <Host seedColor="#00AAFF">
      {isPresented ? (
        <ModalBottomSheet
          skipPartiallyExpanded
          onDismissRequest={() => {
            setIsPresented(false);
          }}
          showDragHandle={sheet.value.dismissable}
          sheetGesturesEnabled={sheet.value.dismissable}
          properties={{
            shouldDismissOnBackPress: sheet.value.dismissable,
            shouldDismissOnClickOutside: sheet.value.dismissable,
          }}>
          <SwitchAccountContent />
        </ModalBottomSheet>
      ) : null}
    </Host>
  );
};
