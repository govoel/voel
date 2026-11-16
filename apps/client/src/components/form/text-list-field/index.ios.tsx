import { Button, List, Section } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled } from '@expo/ui/swift-ui/modifiers';

import { TextListFieldEntry, useTextListFieldState } from '#src/components/form/hooks.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';
import type { TextListFieldComponent } from '#src/components/form/text-list-field/index.tsx';

export const TextListField = (({ label, purpose, placeholder }) => {
  const { entries, isSubmitting, add, remove } = useTextListFieldState();
  return (
    <Section title={label}>
      <List.ForEach
        data={entries}
        // Entries are positional: removing one shifts the rest, and each entry's text follows.
        keyExtractor={(_, index) => `${index}`}
        // Each row binds its own form field, so rows can't be recycled across entries.
        recycling={false}
        {...(isSubmitting
          ? {}
          : {
              onDelete: (indices: ReadonlyArray<number>) => {
                remove({ indices });
              },
            })}>
        {({ index }) => (
          <TextListFieldEntry index={index}>
            <TextField
              label={`${label} ${index + 1}`}
              labelVisibility="hidden"
              purpose={purpose}
              placeholder={placeholder}
            />
          </TextListFieldEntry>
        )}
      </List.ForEach>
      <Button
        systemImage="plus.circle.fill"
        label="Add"
        modifiers={[accessibilityLabel(`Add to ${label}`), disabled(isSubmitting)]}
        onPress={add}
      />
    </Section>
  );
}) satisfies TextListFieldComponent;
