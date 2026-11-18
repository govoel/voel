import { useSelector } from '@tanstack/react-form';
import type { Array } from 'effect';
import type { ComponentType } from 'react';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import type { LibraryEditorValues } from '#src/domains/library/editor/schema.ts';

export const useMediaTypeField = () => {
  const field = useFieldContext<(typeof LibraryEditorValues.Encoded)['type']>();
  const form = useFormContext();
  const disabled = useSelector(form.store, (state) => state.isSubmitting);
  return {
    value: field.state.value,
    disabled,
    handleSelect: (type: (typeof LibraryEditorValues.Encoded)['type']) => {
      field.handleChange(type);
      field.handleBlur();
    },
  };
};

export declare const MediaTypeField: ComponentType<{
  /** The media types the storage plugin supports. */
  readonly types: Array.NonEmptyReadonlyArray<(typeof LibraryEditorValues.Encoded)['type']>;
}>;
