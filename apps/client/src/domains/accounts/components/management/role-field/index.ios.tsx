import { Picker } from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';
import { Text } from '#src/components/text';
import { roles, useRoleField } from '#src/domains/accounts/components/management/role-field/index.tsx';
import { Account } from '#src/domains/accounts/schema.ts';


export const RoleField = () => {
  const field = useRoleField();
  return (
    <Picker
      label="Role"
      selection={field.value}
      onSelectionChange={field.handleSelect}
      modifiers={[pickerStyle('menu'), disabled(field.disabled)]}>
      {Array.map(roles, (role) => (
        <Text key={role} modifiers={[tag(role)]}>
          {Account.roleToDisplayString(role)}
        </Text>
      ))}
    </Picker>
  );
};
