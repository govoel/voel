import { Button, HStack, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, frame, labelStyle } from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array } from 'effect';

import { useFormContext } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';
import type { RootFieldsProps } from '#src/domains/library/components/root-fields/index.tsx';

export const RootFields = ({ rows, onAdd, onRemove, renderField }: RootFieldsProps) => {
  const form = useFormContext();
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <>
      <Text variant="caption">Folders are on your server. Enter one path per row.</Text>
      {Array.map(rows, (row, index) => (
        <HStack key={row.key} spacing={12}>
          <VStack
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
            {renderField(index)}
          </VStack>
          <Button
            role="destructive"
            label={`Remove root ${index + 1}`}
            systemImage="minus.circle.fill"
            onPress={() => {
              onRemove(index);
            }}
            modifiers={[disabled(busy), buttonStyle('borderless'), labelStyle('iconOnly')]}
          />
        </HStack>
      ))}
      <Button
        label="Add root"
        systemImage="plus.circle.fill"
        onPress={onAdd}
        modifiers={[disabled(busy)]}
      />
    </>
  );
};
