import { useAtomSet, useAtomValue } from '@effect/atom-react';
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
import { Atom } from 'effect/unstable/reactivity';
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

type FormMutationError<TFormData> =
  | string
  | {
      readonly form?: string;
      readonly fields: Partial<Record<DeepKeys<TFormData>, string>>;
    };

interface FormMutationErrorState {
  readonly form: string | undefined;
  readonly fields: Readonly<Partial<Record<string, string>>>;
}

const emptyFormMutationError: FormMutationErrorState = {
  form: void 0,
  fields: {},
};

// Mutation failures describe the last request, not the validity of the current values. Putting
// them in TanStack's errorMap makes canSubmit false and prevents an unchanged value from retrying.
// Associate this separate state with the form API so field and form components can find it from
// their existing TanStack contexts without replacing AppForm.
const formMutationErrorAtoms = new WeakMap<AnyFormApi, Atom.Atom<FormMutationErrorState>>();

export const useFormMutationError = () => {
  const form = tanStackFormHookContexts.useFormContext();
  const mutationErrorAtom = formMutationErrorAtoms.get(form);

  if (mutationErrorAtom === void 0) {
    throw new Error('useFormMutationError must be used inside an AppForm');
  }

  return useAtomValue(mutationErrorAtom);
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

type EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta = never> = FormOptions<
  TEncoded,
  undefined,
  undefined,
  StandardSchemaV1<TEncoded, TType>,
  undefined,
  undefined,
  undefined,
  undefined,
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
    const mutationErrorAtom = useMemo(() => Atom.make(emptyFormMutationError), []);
    const setMutationError = useAtomSet(mutationErrorAtom);
    const submitAttemptRef = useRef(0);

    const form = useTanStackAppForm({
      ...props,
      listeners: {
        ...props.listeners,
        onChange: (listenerProps) => {
          submitAttemptRef.current += 1;
          setMutationError(emptyFormMutationError);
          props.listeners?.onChange?.(listenerProps);
        },
      },
      onSubmit: async (submitProps) => {
        const submitAttempt = submitAttemptRef.current + 1;
        submitAttemptRef.current = submitAttempt;
        setMutationError(emptyFormMutationError);

        const schemaResult = await standardSchema['~standard'].validate(submitProps.value);
        if (schemaResult.issues !== void 0) {
          throw new Error('Unexpected invalid data during submit');
        }
        if (submitAttempt !== submitAttemptRef.current) {
          return;
        }

        const mutationExit = await runMutation(schemaResult.value);
        if (submitAttempt !== submitAttemptRef.current) {
          return;
        }

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
          setMutationError(
            typeof formError === 'string'
              ? { form: formError, fields: {} }
              : { form: formError.form, fields: formError.fields }
          );
          return;
        }

        throw Cause.squash(mutationExit.cause);
      },
      validators: {
        onChangeAsync: standardSchema,
      },
    });
    formMutationErrorAtoms.set(form, mutationErrorAtom);

    useEffect(() => {
      let previousSubmissionAttempts = form.state.submissionAttempts;

      // TanStack does not invoke onChange when reset is called, so observe the reset transition
      // to clear the request error and make any in-flight result stale.
      const subscription = form.store.subscribe(() => {
        const { submissionAttempts } = form.state;
        if (previousSubmissionAttempts > 0 && submissionAttempts === 0) {
          submitAttemptRef.current += 1;
          setMutationError(emptyFormMutationError);
        }
        previousSubmissionAttempts = submissionAttempts;
      });

      return () => {
        subscription.unsubscribe();
      };
    }, [form, setMutationError]);

    return withoutFieldValidators(form);
  };

  return { ...formHook, useAppForm };
};
