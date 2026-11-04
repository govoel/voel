import Add from '@expo/material-symbols/add.xml';
import Delete from '@expo/material-symbols/delete.xml';
import { Column, Icon, IconButton, OutlinedButton, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, weight } from '@expo/ui/jetpack-compose/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array } from 'effect';

import { useFormContext } from '#src/components/form/hooks.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import type { RootFieldsProps } from '#src/domains/library/components/root-fields/index.tsx';

export const RootFields = ({ rows, onAdd, onRemove, renderField }: RootFieldsProps) => {
  const form = useFormContext();
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  const colors = useMaterialColors();
  return (
    <>
      <Text variant="caption" color={colors.onSurfaceVariant}>
        Folders are on your server. Enter one path per row.
      </Text>
      {Array.map(rows, (row, index) => (
        <Row key={row.key} verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
          <Column modifiers={[weight(1)]}>{renderField(index)}</Column>
          <IconButton
            enabled={!busy}
            onClick={() => {
              onRemove(index);
            }}
            modifiers={[semantics({ contentDescription: `Remove root ${index + 1}` })]}>
            <Icon source={Delete} size={24} tint={colors.onSurfaceVariant} />
          </IconButton>
        </Row>
      ))}
      <OutlinedButton enabled={!busy} onClick={onAdd} modifiers={[fillMaxWidth()]}>
        <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
          <Icon source={Add} size={20} />
          <Text>Add root</Text>
        </Row>
      </OutlinedButton>
    </>
  );
};
