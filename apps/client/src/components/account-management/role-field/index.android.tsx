import { RadioButton } from '@expo/ui/jetpack-compose';

import { roles, useRoleField } from '#src/components/account-management/role-field/index.tsx';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';

export const RoleField = () => {
  const field = useRoleField();
  return (
    <>
      <Text variant="caption">Role</Text>
      <SegmentedList>
        {roles.map((role, index) => (
          <SegmentedListItem
            key={role}
            index={index}
            count={roles.length}
            selected={field.value === role}
            enabled={!field.disabled}
            onClick={() => {
              field.handleSelect(role);
            }}>
            <SegmentedListItem.LeadingContent>
              <RadioButton selected={field.value === role} enabled={!field.disabled} />
            </SegmentedListItem.LeadingContent>
            <SegmentedListItem.HeadlineContent>
              <Text>{role}</Text>
            </SegmentedListItem.HeadlineContent>
          </SegmentedListItem>
        ))}
      </SegmentedList>
      <Text variant="caption">Administrators can manage all users and server settings.</Text>
    </>
  );
};
