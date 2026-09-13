import { Column, RadioButton, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, selectable, selectableGroup } from '@expo/ui/jetpack-compose/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Record } from 'effect';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';

import { roleLabels } from './role-options.ts';

export const RoleField = () => {
  const field = useFieldContext<typeof AuthUser.fields.role.Encoded>();
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <Column modifiers={[selectableGroup()]}>
      <Text variant="caption">Role</Text>
      {Record.toEntries(roleLabels).map(([role, label]) => (
        <Row
          key={role}
          verticalAlignment="center"
          modifiers={[
            fillMaxWidth(),
            ...(isSubmitting
              ? []
              : [
                  selectable(
                    field.state.value === role,
                    () => {
                      field.handleChange(role);
                      field.handleBlur();
                    },
                    'radioButton'
                  ),
                ]),
          ]}>
          <RadioButton selected={field.state.value === role} />
          <Text>{label}</Text>
        </Row>
      ))}
      <Text>Administrators can manage all users and server settings.</Text>
    </Column>
  );
};
