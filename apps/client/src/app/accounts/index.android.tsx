import { useAtomValue } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import PersonAdd from '@expo/material-symbols/person_add.xml';
import {
  Button,
  CircularProgressIndicator,
  Column,
  Host,
  Icon,
  ListItem,
  ModalBottomSheet,
  OutlinedButton,
  OutlinedTextField,
  Row,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Spacer,
  TextButton,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, paddingAll, size } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { accountsAtom } from '#src/services/accounts/atoms.ts';

export default function AccountsIndex() {
  const accounts = useAtomValue(accountsAtom);
  const colors = useMaterialColors();
  const [isPresented, setIsPresented] = useState(true);
  const [isAddPresented, setIsAddPresented] = useState(false);

  return (
    <>
      <Stack.Screen.Title>Switch Account</Stack.Screen.Title>

      <Host style={{ flex: 1 }} seedColor="red">
        {isPresented ? (
          <ModalBottomSheet
            onDismissRequest={() => {
              setIsPresented(false);
            }}
            showDragHandle={false}
            sheetGesturesEnabled={false}
            properties={{ shouldDismissOnBackPress: false, shouldDismissOnClickOutside: false }}>
            <Column modifiers={[padding(0, Spacing.three, 0, 0)]}>
              <Text variant="h3" modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
                Switch Account
              </Text>

              <ListItem modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
                <ListItem.LeadingContent>
                  <Icon source={AccountCircle} size={40} tint={colors.onSurfaceVariant} />
                </ListItem.LeadingContent>
                <ListItem.HeadlineContent>
                  <Text>@goknsh</Text>
                </ListItem.HeadlineContent>
                <ListItem.SupportingContent>
                  <Text variant="caption">https://voel.ark.black</Text>
                </ListItem.SupportingContent>
                <ListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </ListItem.TrailingContent>
              </ListItem>
              <ListItem modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
                <ListItem.LeadingContent>
                  <Icon source={AccountCircle} size={40} tint={colors.onSurfaceVariant} />
                </ListItem.LeadingContent>
                <ListItem.HeadlineContent>
                  <Text>@goknsh</Text>
                </ListItem.HeadlineContent>
                <ListItem.SupportingContent>
                  <Text variant="caption">https://voel.ark.black</Text>
                </ListItem.SupportingContent>
                <ListItem.TrailingContent>
                  <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                </ListItem.TrailingContent>
              </ListItem>

              {AsyncResult.matchWithError(accounts, {
                onInitial: () => (
                  <Row
                    horizontalAlignment="center"
                    modifiers={[fillMaxWidth(), paddingAll(Spacing.four)]}>
                    <CircularProgressIndicator />
                  </Row>
                ),
                onSuccess: (result) =>
                  result.value.accounts.length === 0 ? (
                    <Text
                      modifiers={[padding(Spacing.four, Spacing.two, Spacing.four, Spacing.two)]}>
                      No accounts
                    </Text>
                  ) : (
                    result.value.accounts.map((account) => (
                      <ListItem
                        key={`${account.serverUrl}-${account.username}`}
                        modifiers={[fillMaxWidth()]}
                        colors={{
                          containerColor: colors.surfaceContainerLow,
                          supportingContentColor: colors.onSurfaceVariant,
                        }}>
                        <ListItem.LeadingContent>
                          <Icon source={AccountCircle} size={40} tint={colors.onSurfaceVariant} />
                        </ListItem.LeadingContent>
                        <ListItem.HeadlineContent>
                          <Text>@{account.username}</Text>
                        </ListItem.HeadlineContent>
                        <ListItem.SupportingContent>
                          <Text variant="caption">{account.serverUrl}</Text>
                        </ListItem.SupportingContent>
                        <ListItem.TrailingContent>
                          <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
                        </ListItem.TrailingContent>
                      </ListItem>
                    ))
                  ),
                onError: () => <Text modifiers={[paddingAll(Spacing.four)]}>Error</Text>,
                onDefect: () => <Text modifiers={[paddingAll(Spacing.four)]}>Defect</Text>,
              })}

              <TextButton
                onClick={() => {
                  setIsAddPresented(true);
                }}
                modifiers={[
                  fillMaxWidth(),
                  padding(Spacing.three, Spacing.three, Spacing.three, 0),
                ]}>
                <Row horizontalAlignment="center" verticalAlignment="center">
                  <Icon source={PersonAdd} size={20} />
                  <Text>Add account</Text>
                </Row>
              </TextButton>
            </Column>
          </ModalBottomSheet>
        ) : null}

        {isAddPresented ? (
          <ModalBottomSheet
            onDismissRequest={() => {
              setIsAddPresented(false);
            }}>
            <Column
              modifiers={[padding(Spacing.three, Spacing.three, Spacing.three, Spacing.three)]}>
              <Text variant="h5" modifiers={[padding(Spacing.one, 0, Spacing.one, Spacing.two)]}>
                Add an account
              </Text>

              <OutlinedTextField singleLine isError modifiers={[fillMaxWidth()]}>
                <OutlinedTextField.Label>
                  <Text>Username</Text>
                </OutlinedTextField.Label>
                <OutlinedTextField.SupportingText>
                  <Text variant="caption">Testing validation error</Text>
                </OutlinedTextField.SupportingText>
              </OutlinedTextField>

              <OutlinedTextField
                singleLine
                visualTransformation="password"
                modifiers={[fillMaxWidth(), padding(0, Spacing.two, 0, 0)]}>
                <OutlinedTextField.Label>
                  <Text>Password</Text>
                </OutlinedTextField.Label>
              </OutlinedTextField>

              <Spacer modifiers={[size(0, Spacing.four)]} />

              <Button modifiers={[fillMaxWidth()]}>
                <Text>Login</Text>
              </Button>

              <OutlinedButton
                onClick={() => {
                  setIsAddPresented(false);
                }}
                colors={{ contentColor: colors.error }}
                modifiers={[fillMaxWidth(), padding(0, Spacing.two, 0, 0)]}>
                <Text>Cancel</Text>
              </OutlinedButton>
            </Column>
          </ModalBottomSheet>
        ) : null}
      </Host>
    </>
  );
}
