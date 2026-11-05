import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import { types, useTypeField } from '#src/domains/library/components/type-field/index.tsx';
import { libraryTypeLabels } from '#src/domains/library/management.ts';

export const TypeField = () => {
  const field = useTypeField();
  return (
    <>
      <Text>Type</Text>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {Array.map(types, (type) => (
          <SegmentedButton
            key={type}
            selected={field.value === type}
            enabled={!field.disabled}
            onClick={() => {
              field.handleSelect(type);
            }}>
            <SegmentedButton.Label>
              <Text>{libraryTypeLabels[type]}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </>
  );
};
