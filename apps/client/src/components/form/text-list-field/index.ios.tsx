import { Button, HStack, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled, labelStyle } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';

import { TextListFieldEntry, useTextListFieldState } from '#src/components/form/hooks.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';
import type { TextListFieldComponent } from '#src/components/form/text-list-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const TextListField = (({ label, purpose, placeholder }) => {
  const { entries, isSubmitting, add, remove } = useTextListFieldState();
  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      {Array.map(entries, (_, index) => (
        // Entries are positional: removing one shifts the rest, and each entry's text follows.
        <HStack key={index} spacing={Spacing.one}>
          <TextListFieldEntry index={index}>
            <TextField
              label={`${label} ${index + 1}`}
              labelVisibility="hidden"
              purpose={purpose}
              placeholder={placeholder}
            />
          </TextListFieldEntry>
          {/* Borderless buttons keep a tap in this List row from triggering every button in it. */}
          <Button
            systemImage="minus.circle.fill"
            role="destructive"
            label={`Remove ${label} ${index + 1}`}
            modifiers={[
              buttonStyle('borderless'),
              labelStyle('iconOnly'),
              accessibilityLabel(`Remove ${label} ${index + 1}`),
              disabled(isSubmitting),
            ]}
            onPress={() => {
              remove(index);
            }}
          />
        </HStack>
      ))}

      <Button
        systemImage="plus.circle.fill"
        label="Add"
        modifiers={[
          buttonStyle('borderless'),
          accessibilityLabel(`Add to ${label}`),
          disabled(isSubmitting),
        ]}
        onPress={add}
      />
    </VStack>
  );
}) satisfies TextListFieldComponent;
