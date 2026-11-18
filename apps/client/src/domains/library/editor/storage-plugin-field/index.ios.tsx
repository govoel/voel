import { Picker } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import type { StoragePluginField as StoragePluginFieldComponent } from '#src/domains/library/editor/storage-plugin-field/index.tsx';
import {
  storageProviderOptionLabel,
  storageProviders,
  useStoragePluginField,
} from '#src/domains/library/editor/storage-plugin-field/index.tsx';

export const StoragePluginField = (({ storagePluginId, disabled: isDisabled, onChange }) => {
  const { provider, packageForm, selectProvider } = useStoragePluginField({
    storagePluginId,
    onChange,
  });
  return (
    <>
      <Picker
        label="Storage"
        selection={provider}
        onSelectionChange={selectProvider}
        modifiers={[pickerStyle('menu'), disabled(isDisabled)]}>
        {Array.map(storageProviders, (option) => (
          <Text key={option} modifiers={[tag(option)]}>
            {storageProviderOptionLabel(option)}
          </Text>
        ))}
      </Picker>
      {provider === 'npm' ? (
        <packageForm.AppForm>
          <packageForm.AppField name="package">
            {(field) => (
              <field.TextField label="Package" placeholder="@example/voel-storage" purpose="text" />
            )}
          </packageForm.AppField>
          <Text
            variant="caption"
            modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
            Loading a package installs it on the server and runs its code.
          </Text>
          <packageForm.SubmitButton disabled={isDisabled}>
            <Text>Load plugin</Text>
          </packageForm.SubmitButton>
        </packageForm.AppForm>
      ) : null}
    </>
  );
}) satisfies typeof StoragePluginFieldComponent;
