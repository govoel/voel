import { useSelector } from '@tanstack/react-form';
import { Array, Order } from 'effect';
import { useRef, useState } from 'react';

import { useFieldContext } from '#src/components/form/hooks.tsx';

export const useStorageList = () => {
  const field = useFieldContext<Array<string>>();
  const [keys, setKeys] = useState(() => Array.map(field.state.value, (_, index) => index));
  const nextKey = useRef(field.state.value.length);
  const submitting = useSelector(field.form.store, (state) => state.isSubmitting);
  return {
    field,
    keys,
    submitting,
    handleAdd: () => {
      const key = nextKey.current;
      nextKey.current += 1;
      setKeys((previous) => Array.append(previous, key));
      field.pushValue('');
    },
    handleRemove: ({ indices }: { readonly indices: ReadonlyArray<number> }) => {
      setKeys((previous) => Array.filter(previous, (_, index) => !Array.contains(indices, index)));
      for (const index of Array.sort(indices, Order.flip(Order.Number))) {
        field.removeValue(index);
      }
    },
  };
};
