import type {
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
} from '@govoel/plugins/storage';
import { useMemo } from 'react';

import { useAppForm } from '#src/components/form';
import { makeStoragePluginSettingsFormOptions } from '#src/components/storage-plugin-settings-form/adapter.ts';

/**
 * Bind a loaded, secret-free descriptor array to the normal form lifecycle.
 * The caller owns fetching and mutation wiring. Mount the editor only after loading,
 * keyed by account/library identity so drafts never cross accounts or libraries.
 * Render `fields` in order with `form.AppField` and the matching native field control.
 * Refreshed initial values preserve dirty drafts; `form.reset()` adopts the latest defaults.
 */
export const useStoragePluginSettingsForm = <TSuccess, TFailure>({
  fields,
  ...props
}: Omit<
  Parameters<
    typeof useAppForm<StoragePluginSettingsInput, Record<string, string>, TSuccess, TFailure>
  >[0],
  'schema' | 'defaultValues'
> & {
  readonly fields: StoragePluginSettingsForm;
}) => {
  const options = useMemo(() => makeStoragePluginSettingsFormOptions({ fields }), [fields]);
  const form = useAppForm({ ...props, ...options });
  return { form, fields };
};
