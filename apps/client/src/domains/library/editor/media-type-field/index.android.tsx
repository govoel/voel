import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import type { MediaTypeField as MediaTypeFieldComponent } from '#src/domains/library/editor/media-type-field/index.tsx';
import { useMediaTypeField } from '#src/domains/library/editor/media-type-field/index.tsx';
import { mediaTypeLabel } from '#src/domains/library/management.ts';

export const MediaTypeField = (({ types }) => {
  const field = useMediaTypeField();
  return (
    <>
      <Text>Media type</Text>
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
              <Text>{mediaTypeLabel({ type })}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </>
  );
}) satisfies typeof MediaTypeFieldComponent;
