import { Button, List } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled } from '@expo/ui/swift-ui/modifiers';

import { TextListFieldItem, useTextListFieldState } from '#src/components/form/hooks.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';
import type { TextListFieldComponent } from '#src/components/form/text-list-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';

export const TextListField = (({ label, placeholder, purpose }) => {
  const { indices, isSubmitting, add, remove } = useTextListFieldState();
  return (
    <>
      <Text variant="caption">{label}</Text>
      <List.ForEach
        data={indices}
        keyExtractor={String}
        recycling={false}
        {...(isSubmitting
          ? {}
          : {
              onDelete: (removed: Array<number>) => {
                remove({ indices: removed });
              },
            })}>
        {({ item: index }) => (
          <TextListFieldItem index={index}>
            <TextField
              label={`${label}, item ${index + 1}`}
              labelVisibility="hidden"
              placeholder={placeholder}
              purpose={purpose}
            />
          </TextListFieldItem>
        )}
      </List.ForEach>
      <Button
        onPress={add}
        modifiers={[accessibilityLabel(`Add to ${label}`), disabled(isSubmitting)]}>
        <Text>Add</Text>
      </Button>
    </>
  );
}) satisfies TextListFieldComponent;
