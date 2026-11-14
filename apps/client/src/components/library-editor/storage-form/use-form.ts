import type { Option } from 'effect';

import { useAppForm } from '#src/components/form';
import type { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { storageSettingsSchema } from '#src/domains/library/editor.ts';

export const useStorageForm = ({
  storage,
  commitStorage,
  onSuccess,
}: {
  readonly storage: Option.Option.Value<ReturnType<typeof useLibraryForm>['storage']>;
  readonly commitStorage: ReturnType<typeof useLibraryForm>['commitStorage'];
  readonly onSuccess: () => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: storageSettingsSchema(storage.descriptors),
    defaultValues: storage.values,
    onSubmit: ({ value }) => commitStorage({ storage, values: value }),
    onFailure: () => 'Storage settings changed. Close and reopen them to try again.',
    onSuccess,
  });
  return { form, descriptors: storage.descriptors };
};
