import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { TextField } from '#src/components/form/text-field';
import { Text } from '#src/components/text';
import { useStoragePluginField } from '#src/domains/library/components/storage-plugin-field/index.tsx';

export const StoragePluginField = () => {
  const field = useStoragePluginField();
  return (
    <>
      <Text variant="caption">Storage plugin</Text>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        <SegmentedButton
          enabled={!field.busy}
          selected={field.local}
          onClick={() => {
            field.handleSelect('local');
          }}>
          <SegmentedButton.Label>
            <Text>Local files</Text>
          </SegmentedButton.Label>
        </SegmentedButton>
        <SegmentedButton
          enabled={!field.busy}
          selected={!field.local}
          onClick={() => {
            field.handleSelect('custom');
          }}>
          <SegmentedButton.Label>
            <Text>Custom plugin</Text>
          </SegmentedButton.Label>
        </SegmentedButton>
      </SingleChoiceSegmentedButtonRow>
      {!field.local ? (
        <TextField
          purpose="username"
          label="Plugin ID"
          placeholder="npm:@scope/storage-plugin"
          platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
        />
      ) : null}
    </>
  );
};
