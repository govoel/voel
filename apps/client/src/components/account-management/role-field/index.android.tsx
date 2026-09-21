import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { roles, useRoleField } from '#src/components/account-management/role-field/index.tsx';
import { Text } from '#src/components/text';
import { Account } from '#src/services/database/main/schema.ts';

export const RoleField = () => {
  const field = useRoleField();
  return (
    <>
      <Text>Role</Text>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {roles.map((role) => (
          <SegmentedButton
            key={role}
            selected={field.value === role}
            enabled={!field.disabled}
            onClick={() => {
              field.handleSelect(role);
            }}>
            <SegmentedButton.Label>
              <Text>{Account.roleToDisplayString(role)}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </>
  );
};
