import { Picker } from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import type { MediaTypeField as MediaTypeFieldComponent } from '#src/domains/library/editor/media-type-field/index.tsx';
import { useMediaTypeField } from '#src/domains/library/editor/media-type-field/index.tsx';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

export const MediaTypeField = (({ types }) => {
  const field = useMediaTypeField();
  return (
    <Picker
      label="Media type"
      selection={field.value}
      onSelectionChange={field.handleSelect}
      modifiers={[pickerStyle('menu'), disabled(field.disabled)]}>
      {Array.map(types, (type) => (
        <Text key={type} modifiers={[tag(type)]}>
          {mediaTypeLabel({ type })}
        </Text>
      ))}
    </Picker>
  );
}) satisfies typeof MediaTypeFieldComponent;
