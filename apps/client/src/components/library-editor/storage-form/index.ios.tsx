import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';

import { FormLayout } from '#src/components/form/layout';
import { StorageFields } from '#src/components/library-editor/storage-fields';
import { useStorageForm } from '#src/components/library-editor/storage-form/use-form.ts';
import { Text } from '#src/components/text';

export const StorageForm = (props: Parameters<typeof useStorageForm>[0]) => {
  const { form, descriptors } = useStorageForm(props);
  return (
    <form.AppForm>
      <FormLayout
        title="Storage"
        footer={
          <form.SubmitButton
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Done</Text>
          </form.SubmitButton>
        }
        sections={<StorageFields form={form} descriptors={descriptors} />}
      />
    </form.AppForm>
  );
};
