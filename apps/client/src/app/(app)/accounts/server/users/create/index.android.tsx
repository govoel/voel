import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { RoleField } from '#src/domains/accounts/components/management/role-field';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { useCreateUserForm } from '#src/domains/accounts/features/server/users/create/model.ts';


const CreateUserForm = (props: Parameters<typeof useCreateUserForm>[0]) => {
  const form = useCreateUserForm(props);
  return (
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
  );
};

export default function CreateUserScreen() {
  const accountKey = useSelectedAccount();
  const router = useRouter();
  const sheetRef = useRef<ModalBottomSheetRef>(null);

  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <CreateUserForm
        key={JSON.stringify(accountKey)}
        accountKey={accountKey}
        onSuccess={async ({ userId }) => {
          await sheetRef.current?.hide();
          router.replace({ pathname: '/accounts/server/users/[id]', params: { id: userId } });
        }}
      />
    </AndroidAccountsSheet>
  );
}
