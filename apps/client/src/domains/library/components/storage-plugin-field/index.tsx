import { useSelector } from '@tanstack/react-form';
import type { ComponentType } from 'react';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';

export const useStoragePluginField = () => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  return {
    local: field.state.value === 'builtin:local',
    busy,
    handleSelect: (value: 'local' | 'custom') => {
      field.handleChange(value === 'local' ? 'builtin:local' : 'npm:');
      field.handleBlur();
    },
  };
};
export declare const StoragePluginField: ComponentType;
