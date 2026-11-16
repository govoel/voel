import Add from '@expo/material-symbols/add.xml';
import Delete from '@expo/material-symbols/delete.xml';
import { Column, Icon, IconButton, Row, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';

import { TextListFieldEntry, useTextListFieldState } from '#src/components/form/hooks.tsx';
import { TextField } from '#src/components/form/text-field/index.android.tsx';
import type { TextListFieldComponent } from '#src/components/form/text-list-field/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const TextListField = (({ label, purpose, placeholder }) => {
  const { entries, isSubmitting, add, remove } = useTextListFieldState();
  return (
    <Column modifiers={[fillMaxWidth()]} verticalArrangement={{ spacedBy: Spacing.one }}>
      <Text>{label}</Text>

      {Array.map(entries, (_, index) => (
        // Entries are positional: removing one shifts the rest, and each entry's text follows.
        <TextListFieldEntry key={index} index={index}>
          <TextField
            label={`${label} ${index + 1}`}
            labelVisibility="hidden"
            purpose={purpose}
            placeholder={placeholder}
            platformProps={{
              android: {
                modifiers: [fillMaxWidth()],
                trailingIcon: (
                  <IconButton
                    enabled={!isSubmitting}
                    onClick={() => {
                      remove({ indices: [index] });
                    }}>
                    <Icon
                      source={Delete}
                      size={24}
                      contentDescription={`Remove ${label} ${index + 1}`}
                    />
                  </IconButton>
                ),
              },
            }}
          />
        </TextListFieldEntry>
      ))}

      <Row>
        <TextButton enabled={!isSubmitting} onClick={add}>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: Spacing.one }}>
            <Icon source={Add} size={18} />
            <Text>Add</Text>
          </Row>
        </TextButton>
      </Row>
    </Column>
  );
}) satisfies TextListFieldComponent;
