import { Picker } from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { roles, useRoleField } from '#src/components/account-management/role-field/index.ts';
import { Text } from '#src/components/text';

export const RoleField = () => {
  const field = useRoleField();
  return (
    <>
      <Picker
        label="Role"
        selection={field.value}
        onSelectionChange={field.handleSelect}
        modifiers={[pickerStyle('menu'), disabled(field.disabled)]}>
        {roles.map((role) => (
          <Text key={role} modifiers={[tag(role)]}>
            {role}
          </Text>
        ))}
      </Picker>
      <Text variant="caption">Administrators can manage all users and server settings.</Text>
    </>
  );
};
