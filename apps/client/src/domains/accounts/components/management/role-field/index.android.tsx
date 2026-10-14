import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';
import { Text } from '#src/components/text';
import { roles, useRoleField } from '#src/domains/accounts/components/management/role-field/index.tsx';
import { Account } from '#src/domains/accounts/schema.ts';


export const RoleField = () => {
  const field = useRoleField();
  return (
    <>
      <Text>Role</Text>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {Array.map(roles, (role) => (
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
