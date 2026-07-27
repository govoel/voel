import { useAtomSet } from '@effect/atom-react';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  DeepKeys,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import { Cause, Exit, Option, Schema } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { useMemo } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

type FormMutationError<TFormData> =
  | string
  | {
      readonly form?: string;
      readonly fields: Partial<Record<DeepKeys<TFormData>, string>>;
    };

export type FormFieldError = string | StandardSchemaV1Issue;

export const getFormFieldErrorMessage = (error: FormFieldError) =>
  typeof error === 'string' ? error : error.message;

type StandardSchemaFieldContext<TData> = Omit<
  ReturnType<typeof tanStackFormHookContexts.useFieldContext<TData>>,
  'state'
> & {
  readonly state: Omit<
    ReturnType<typeof tanStackFormHookContexts.useFieldContext<TData>>['state'],
    'meta'
  > & {
    readonly meta: Omit<
      ReturnType<typeof tanStackFormHookContexts.useFieldContext<TData>>['state']['meta'],
      'errors'
    > & {
      readonly errors: FormFieldError[];
    };
  };
};

export const {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
}: Omit<typeof tanStackFormHookContexts, 'useFieldContext' | 'useFormContext'> & {
  readonly useFieldContext: <TData>() => StandardSchemaFieldContext<TData>;
  readonly useFormContext: () => Omit<
    ReturnType<typeof tanStackFormHookContexts.useFormContext>,
    'state'
  > & {
    readonly state: Omit<
      ReturnType<typeof tanStackFormHookContexts.useFormContext>['state'],
      'errors'
    > & {
      readonly errors: (string | Record<string, StandardSchemaV1Issue[]>)[];
    };
  };
} = tanStackFormHookContexts;

type EffectSchemaSubmitValidator<TEncoded> = (props: {
  readonly value: TEncoded;
  readonly formApi: AnyFormApi;
  readonly signal: AbortSignal;
}) => FormMutationError<TEncoded> | null | Promise<FormMutationError<TEncoded> | null>;

// Mutation failures are stored in TanStack's onSubmit error slot. Returning null
// clears the previous failure so the form can be submitted again without a field change.
const clearMutationErrorValidator = () => null;

type EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta = never> = FormOptions<
  TEncoded,
  undefined,
  undefined,
  StandardSchemaV1<TEncoded, TType>,
  undefined,
  undefined,
  undefined,
  EffectSchemaSubmitValidator<TEncoded>,
  undefined,
  undefined,
  undefined,
  TSubmitMeta
>;

type EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta> = Omit<
  Parameters<NonNullable<EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta>['onSubmit']>>[0],
  'value'
> & {
  readonly value: TType;
};

type EffectSchemaMutationSuccessProps<TType, TEncoded, TSuccess, TSubmitMeta> =
  EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta> & {
    readonly result: TSuccess;
  };

type EffectSchemaMutationFailureProps<TType, TEncoded, TFailure, TSubmitMeta> = Omit<
  EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>,
  'meta'
> & {
  readonly error: TFailure;
  readonly meta?: TSubmitMeta;
};

type EffectSchemaFormOptions<
  TType,
  TEncoded,
  TSuccess,
  TFailure,
  TEncodingServices,
  TSubmitMeta = never,
> = Omit<EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta>, 'onSubmit' | 'validators'> & {
  readonly schema: Schema.Codec<TType, TEncoded, never, TEncodingServices>;
  readonly mutation: Atom.AtomResultFn<TType, TSuccess, TFailure>;
  readonly onSuccess?: (
    props: EffectSchemaMutationSuccessProps<TType, TEncoded, TSuccess, TSubmitMeta>
  ) => void | Promise<void>;
  readonly onFailure: (
    props: EffectSchemaMutationFailureProps<TType, TEncoded, TFailure, TSubmitMeta>
  ) => FormMutationError<TEncoded>;
};

// TanStack exposes AppField as a component whose props are inferred through any-based
// React component helpers. Preserve that inference while only removing validator props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppFieldWithoutValidators<TAppField extends ComponentType<any>> = ComponentType<
  Omit<ComponentProps<TAppField>, 'validators'>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormWithoutFieldValidators<TForm extends { readonly AppField: ComponentType<any> }> = Omit<
  TForm,
  'AppField'
> & {
  readonly AppField: AppFieldWithoutValidators<TForm['AppField']>;
};

const withoutFieldValidators = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TForm extends { readonly AppField: ComponentType<any> },
>(
  form: TForm
): FormWithoutFieldValidators<TForm> => form;

export const createEffectSchemaFormHook = <
  // TanStack's createFormHook preserves each component's actual props through an any-based
  // component map constraint. Keeping that shape here avoids collapsing AppField components
  // to ComponentType<unknown>, which would make <field.TextField /> unusable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TFieldComponents extends Record<string, ComponentType<any>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TFormComponents extends Record<string, ComponentType<any>>,
>({
  fieldComponents,
  fieldContext: hookFieldContext,
  formComponents,
  formContext: hookFormContext,
}: {
  readonly fieldComponents: TFieldComponents;
  readonly fieldContext: Context<AnyFieldApi>;
  readonly formComponents: TFormComponents;
  readonly formContext: Context<AnyFormApi>;
}) => {
  const { useAppForm: useTanStackAppForm, ...formHook } = createFormHook({
    fieldComponents,
    fieldContext: hookFieldContext,
    formComponents,
    formContext: hookFormContext,
  });

  const useAppForm = <
    TType,
    TEncoded,
    TSuccess,
    TFailure,
    TEncodingServices = never,
    TSubmitMeta = never,
  >({
    mutation,
    onFailure,
    onSuccess,
    schema,
    ...props
  }: EffectSchemaFormOptions<
    TType,
    TEncoded,
    TSuccess,
    TFailure,
    TEncodingServices,
    TSubmitMeta
  >) => {
    const runMutation = useAtomSet(mutation, { mode: 'promiseExit' });
    const standardSchema = useMemo(() => Schema.toStandardSchemaV1(schema), [schema]);

    const form = useTanStackAppForm({
      ...props,
      onSubmit: async (submitProps) => {
        const schemaResult = await standardSchema['~standard'].validate(submitProps.value);
        if (schemaResult.issues !== void 0) {
          throw new Error('Unexpected invalid data during submit');
        }

        const mutationExit = await runMutation(schemaResult.value);

        if (Exit.isSuccess(mutationExit)) {
          await onSuccess?.({
            ...submitProps,
            result: mutationExit.value,
            value: schemaResult.value,
          });
          return;
        }

        const error = Exit.findErrorOption(mutationExit);
        if (Option.isSome(error)) {
          const formError = onFailure({
            ...submitProps,
            error: error.value,
            value: schemaResult.value,
          });
          submitProps.formApi.setErrorMap({ onSubmit: formError });
          return;
        }

        throw Cause.squash(mutationExit.cause);
      },
      validators: {
        onChangeAsync: standardSchema,
        onSubmitAsync: clearMutationErrorValidator,
      },
    });

    return withoutFieldValidators(form);
  };

  return { ...formHook, useAppForm };
};
