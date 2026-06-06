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
import { Effect, Redacted, Schema, SchemaGetter } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { SegmentedList, SegmentedListItem } from '#modules/design-system';
import { FormSubmitError, useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom, accountsSheetAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

const AddAccountSchema = Schema.Struct({
  serverUrl: Schema.URLFromString,
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
});

const SetupServerAccountSchema = Schema.Struct({
  serverUrl: Schema.URLFromString,
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  email: Schema.String.check(Schema.isNonEmpty({ message: 'Email is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
  password: Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' })).pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
});

type AccountFlow = 'add' | 'setup';

const AddAccountForm = ({ onClose }: { readonly onClose: () => void }) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: { serverUrl: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      yield* Effect.sleep(1000); // Simulate network delay
      const accountManager = yield* AccountManager;
      yield* accountManager.upsertAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during authentication. Try again.' }),
          'voel/services/accounts/index/AccountSignInError': (signInError) =>
            new FormSubmitError({
              message:
                signInError.original.message ??
                'Failed to sign in. Check your credentials and try again.',
            }),
          'voel/services/database/ClientDatabaseError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      onClose();
    }),
  });

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
  const form = useAppForm({
    runtime: Runtime,
    schema: SetupServerAccountSchema,
    defaultValues: { serverUrl: '', name: '', email: '', username: '', password: '' },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      const accountManager = yield* AccountManager;
      yield* accountManager.setupServerAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during account setup. Try again.' }),
          'voel/services/accounts/index/AccountSignUpError': (signUpError) =>
            new FormSubmitError({
              message:
                signUpError.original.message ??
                'Failed to create the account. Check the server and try again.',
            }),
          'voel/services/database/ClientDatabaseError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      onClose();
    }),
  });

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
