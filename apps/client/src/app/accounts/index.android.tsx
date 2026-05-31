import { useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import PersonAdd from '@expo/material-symbols/person_add.xml';
import {
  Button,
  Column,
  FilledTonalButton,
  Host,
  Icon,
  LoadingIndicator,
  ModalBottomSheet,
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
import { accountsAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

const AddAccountSchema = Schema.Struct({
  serverUrl: Schema.URLFromString,
  username: Schema.NonEmptyString,
  password: Schema.NonEmptyString.pipe(
    Schema.decodeTo(Schema.Redacted(Schema.String), {
      decode: SchemaGetter.transform((password) => Redacted.make(password)),
      encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
    })
  ),
});

export default function AccountsIndex() {
  const accounts = useAtomValue(accountsAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });
  const [isPresented, setIsPresented] = useState(true);
  const [isAddPresented, setIsAddPresented] = useState(false);
  const form = useAppForm({
    runtime: Runtime,
    schema: AddAccountSchema,
    defaultValues: {
      serverUrl: '',
      username: '',
      password: '',
    },
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      const accountManage = yield* AccountManager;
      yield* accountManage.upsertAccount(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/index/BetterAuthClientInitializationError': () =>
            new FormSubmitError({ message: 'Unexpected error during authentication. Try again.' }),
          'voel/services/accounts/index/AccountSignInError': (signInError) =>
            new FormSubmitError({ message: `Sign in failed: ${signInError.message}` }),
          'voel/services/database/ClientDatabaseError': () =>
            new FormSubmitError({ message: 'A database error occurred. Try again.' }),
        })
      );

      form.reset();
      setIsAddPresented(false);
    }),
  });

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }} seedColor="#00AAFF">
        {isPresented ? (
          <ModalBottomSheet
            onDismissRequest={() => {
              setIsPresented(false);
            }}
            showDragHandle={false}
            sheetGesturesEnabled={false}
            properties={{ shouldDismissOnBackPress: false, shouldDismissOnClickOutside: false }}>
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
                  setIsAddPresented(true);
                }}
                modifiers={[fillMaxWidth()]}>
                <Icon source={PersonAdd} size={18} tint={colors.onSurfaceVariant} />
                <Spacer modifiers={[width(Spacing.two)]} />
                <Text>Add account</Text>
              </FilledTonalButton>
            </Column>
          </ModalBottomSheet>
        ) : null}

        {isAddPresented ? (
          <ModalBottomSheet
            onDismissRequest={() => {
              setIsAddPresented(false);
            }}>
            <form.AppForm>
              <Column
                modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
                verticalArrangement={{ spacedBy: Spacing.two }}>
                <Text variant="h3">Add an account</Text>

                <form.AppField name="serverUrl">
                  {(field) => (
                    <field.TextField
                      label="Server URL"
                      platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                    />
                  )}
                </form.AppField>

                <form.AppField name="username">
                  {(field) => (
                    <field.TextField
                      label="Username"
                      platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                    />
                  )}
                </form.AppField>

                <form.AppField name="password">
                  {(field) => (
                    <field.SecureField
                      label="Password"
                      platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
                    />
                  )}
                </form.AppField>

                <form.AppForm>
                  <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
                    <Text>Login</Text>
                  </form.SubmitButton>
                </form.AppForm>

                <Button
                  modifiers={[fillMaxWidth()]}
                  onClick={() => {
                    form.reset();
                    setIsAddPresented(false);
                  }}>
                  <Text>Cancel</Text>
                </Button>
              </Column>
            </form.AppForm>
          </ModalBottomSheet>
        ) : null}
      </Host>
    </>
  );
}
