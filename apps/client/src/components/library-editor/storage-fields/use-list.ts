import { useSelector } from '@tanstack/react-form';
import { Array, Order } from 'effect';

import { useFieldContext } from '#src/components/form/hooks.tsx';

export const useStorageList = () => {
  const field = useFieldContext<Array<string>>();
  const submitting = useSelector(field.form.store, (state) => state.isSubmitting);
  return {
    field,
    submitting,
    handleRemove: ({ indices }: { readonly indices: ReadonlyArray<number> }) => {
      for (const index of Array.sort(indices, Order.flip(Order.Number))) {
        field.removeValue(index);
      }
    },
  };
};
