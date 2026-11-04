import { useSelector } from '@tanstack/react-form';
import type { ComponentType } from 'react';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';

export const types = ['audiobook', 'movie', 'show'] as const;
export const useTypeField = () => {
  const field = useFieldContext<(typeof types)[number]>();
  const form = useFormContext();
  return {
    value: field.state.value,
    disabled: useSelector(form.store, (state) => state.isSubmitting),
    handleSelect: (value: (typeof types)[number]) => {
      field.handleChange(value);
      field.handleBlur();
    },
  };
};
export declare const TypeField: ComponentType;
