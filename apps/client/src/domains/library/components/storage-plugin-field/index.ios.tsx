import { Picker, Text } from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { TextField } from '#src/components/form/text-field';
import { useStoragePluginField } from '#src/domains/library/components/storage-plugin-field/index.tsx';

export const StoragePluginField = () => {
  const field = useStoragePluginField();
  return (
    <>
      <Picker
        label="Storage plugin"
        selection={field.local ? 'local' : 'custom'}
        onSelectionChange={field.handleSelect}
        modifiers={[pickerStyle('menu'), disabled(field.busy)]}>
        <Text modifiers={[tag('local')]}>Local files</Text>
        <Text modifiers={[tag('custom')]}>Custom plugin</Text>
      </Picker>
      {!field.local ? (
        <TextField purpose="username" label="Plugin ID" placeholder="npm:@scope/storage-plugin" />
      ) : null}
    </>
  );
};
