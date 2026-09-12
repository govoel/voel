import { useSelector } from '@tanstack/react-form';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { Action } from '#src/components/account-management/ui';
import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';

export const RoleField = () => {
  const field = useFieldContext<typeof AuthUser.fields.role.Encoded>();
  const form = useFormContext();
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <>
      <Text>Role: {field.state.value}</Text>
      {(['under18', 'user', 'admin'] as const).map((role) => (
        <Action
          key={role}
          title={role}
          busy={busy || field.state.value === role}
          onPress={() => {
            field.handleChange(role);
            field.handleBlur();
          }}
        />
      ))}
      <Text>Administrators can manage all users and server settings.</Text>
    </>
  );
};
