import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { Redirect } from 'expo-router';
import { useReducer, useRef } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useCreateUserForm } from '#src/app/accounts/(selected)/server/users/create/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { RoleField } from '#src/domains/accounts/components/management/role-field';

export default function CreateUserScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const [createdUserId, userCreated] = useReducer(
    (
      _current: Option.Option<typeof AuthUser.fields.id.Type>,
      userId: typeof AuthUser.fields.id.Type
    ) => Option.some(userId),
    Option.none()
  );
  const form = useCreateUserForm({
    onSuccess: async ({ userId }) => {
      const sheet = sheetRef.current;
      if (sheet === null) {
        return;
      }
      await sheet.hide();
      userCreated(userId);
    },
  });
  if (Option.isSome(createdUserId)) {
    return (
      <Redirect
        href={{ pathname: '/accounts/server/users/[id]', params: { id: createdUserId.value } }}
      />
    );
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title="Create user"
          footer={
            <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
              <Text>Create user</Text>
            </form.SubmitButton>
          }>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                purpose="name"
                label="Name"
                placeholder="Someone Else"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="username">
            {(field) => (
              <field.TextField
                purpose="username"
                label="Username"
                placeholder="someoneElse"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                purpose="email"
                label="Email"
                placeholder="someone@else.com"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.SecureField
                purpose="newPassword"
                label="Password"
                placeholder="iKnowYourPassword!"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="confirmPassword">
            {(field) => (
              <field.SecureField
                purpose="newPassword"
                label="Confirm password"
                placeholder="iKnowYourPassword!"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>
          <form.AppField name="role">{() => <RoleField />}</form.AppField>
        </FormLayout>
      </form.AppForm>
    </AndroidAccountsSheet>
  );
}
