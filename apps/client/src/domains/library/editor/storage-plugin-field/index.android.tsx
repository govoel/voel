import { SegmentedButton, SingleChoiceSegmentedButtonRow } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';

import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import type { StoragePluginField as StoragePluginFieldComponent } from '#src/domains/library/editor/storage-plugin-field/index.tsx';
import {
  storageProviderOptionLabel,
  storageProviders,
  useStoragePluginField,
} from '#src/domains/library/editor/storage-plugin-field/index.tsx';

export const StoragePluginField = (({ storagePluginId, disabled, onChange }) => {
  const colors = useMaterialColors();
  const { provider, packageForm, selectProvider } = useStoragePluginField({
    storagePluginId,
    onChange,
  });
  return (
    <>
      <Text>Storage</Text>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {Array.map(storageProviders, (option) => (
          <SegmentedButton
            key={option}
            selected={provider === option}
            enabled={!disabled}
            onClick={() => {
              selectProvider(option);
            }}>
            <SegmentedButton.Label>
              <Text>{storageProviderOptionLabel(option)}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
      {provider === 'npm' ? (
        <packageForm.AppForm>
          <packageForm.AppField name="package">
            {(field) => (
              <field.TextField label="Package" placeholder="@example/voel-storage" purpose="text" />
            )}
          </packageForm.AppField>
          <Text variant="caption" color={colors.onSurfaceVariant}>
            Loading a package installs it on the server and runs its code.
          </Text>
          <packageForm.SubmitButton
            disabled={disabled}
            platformProps={{ android: { variant: 'text' } }}>
            <Text>Load plugin</Text>
          </packageForm.SubmitButton>
        </packageForm.AppForm>
      ) : null}
    </>
  );
}) satisfies typeof StoragePluginFieldComponent;
