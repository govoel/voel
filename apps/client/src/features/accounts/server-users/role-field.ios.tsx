import { Picker } from '@expo/ui/swift-ui';
import { disabled, tag } from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';

import { roleLabels } from './role-options.ts';

export const RoleField = () => {
  const field = useFieldContext<typeof AuthUser.fields.role.Encoded>();
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <>
      <Picker
        label="Role"
        selection={field.state.value}
        modifiers={[disabled(isSubmitting)]}
        onSelectionChange={(role) => {
          field.handleChange(role);
          field.handleBlur();
        }}>
        {Object.entries(roleLabels).map(([role, label]) => (
          <Text key={role} modifiers={[tag(role)]}>
            {label}
          </Text>
        ))}
      </Picker>
      <Text>Administrators can manage all users and server settings.</Text>
    </>
  );
};
