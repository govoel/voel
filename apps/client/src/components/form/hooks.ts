import { createFormHookContexts } from '@tanstack/react-form';
import type { StandardSchemaV1Issue } from '@tanstack/react-form';

type StandardSchemaFieldContext<TData> = Omit<
  ReturnType<typeof useFieldContext<TData>>,
  'state'
> & {
  readonly state: Omit<ReturnType<typeof useFieldContext<TData>>['state'], 'meta'> & {
    readonly meta: Omit<ReturnType<typeof useFieldContext<TData>>['state']['meta'], 'errors'> & {
      readonly errors: StandardSchemaV1Issue[];
    };
  };
};

export const { fieldContext, formContext, useFormContext, useFieldContext } =
  createFormHookContexts();

// TanStack erases validator generics when a reusable field component reads context.
// Our form hook only installs Effect Schema validators, so field errors are Standard Schema issues.
export const useStandardSchemaFieldContext = <TData>() =>
  useFieldContext<TData>() as StandardSchemaFieldContext<TData>;
