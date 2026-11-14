import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

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
          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Done</Text>
          </form.SubmitButton>
        }>
        <StorageFields form={form} descriptors={descriptors} />
      </FormLayout>
    </form.AppForm>
  );
};
