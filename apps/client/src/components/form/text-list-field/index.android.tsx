import Close from '@expo/material-symbols/close.xml';
import { Column, Icon, IconButton, Row, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, weight } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';

import { TextListFieldItem, useTextListFieldState } from '#src/components/form/hooks.tsx';
import { TextField } from '#src/components/form/text-field/index.android.tsx';
import type { TextListFieldComponent } from '#src/components/form/text-list-field/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const TextListField = (({ label, placeholder, purpose }) => {
  const { indices, isSubmitting, add, remove } = useTextListFieldState();
  return (
    <Column modifiers={[fillMaxWidth()]} verticalArrangement={{ spacedBy: Spacing.one }}>
      <Text>{label}</Text>
      {Array.map(indices, (index) => (
        <Row key={index} verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <TextListFieldItem index={index}>
            <TextField
              label={`${label}, item ${index + 1}`}
              labelVisibility="hidden"
              placeholder={placeholder}
              purpose={purpose}
              platformProps={{ android: { modifiers: [weight(1)] } }}
            />
          </TextListFieldItem>
          <IconButton
            enabled={!isSubmitting}
            modifiers={[semantics({ contentDescription: `Remove ${label}, item ${index + 1}` })]}
            onClick={() => {
              remove({ indices: [index] });
            }}>
            <Icon source={Close} size={24} />
          </IconButton>
        </Row>
      ))}
      <Row>
        <TextButton
          enabled={!isSubmitting}
          modifiers={[semantics({ contentDescription: `Add to ${label}` })]}
          onClick={add}>
          <Text>Add</Text>
        </TextButton>
      </Row>
    </Column>
  );
}) satisfies TextListFieldComponent;
