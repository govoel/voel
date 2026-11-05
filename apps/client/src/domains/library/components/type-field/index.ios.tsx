import { Picker } from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import { types, useTypeField } from '#src/domains/library/components/type-field/index.tsx';
import { libraryTypeLabels } from '#src/domains/library/management.ts';

export const TypeField = () => {
  const field = useTypeField();
  return (
    <Picker
      label="Type"
      selection={field.value}
      onSelectionChange={field.handleSelect}
      modifiers={[pickerStyle('menu'), disabled(field.disabled)]}>
      {Array.map(types, (type) => (
        <Text key={type} modifiers={[tag(type)]}>
          {libraryTypeLabels[type]}
        </Text>
      ))}
    </Picker>
  );
};
