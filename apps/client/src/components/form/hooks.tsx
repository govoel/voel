import { RegistryContext, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import { createFormHook, createFormHookContexts, useSelector } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  AppFieldExtendedReactFormApi,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import { Array, Cause, Effect, Exit, Option, Predicate, Schema, Struct } from 'effect';
import type { Scope } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';
import type { Reactivity } from 'effect/reactivity';
import { useContext, useMemo, useRef } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

const formSubmissionError = Atom.family((_form: AnyFormApi) =>
  Atom.make<Option.Option<string>>(Option.none())
);

export const useFormSubmissionError = () =>
  useAtomValue(formSubmissionError(tanStackFormHookContexts.useFormContext()));

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
      readonly errors: Array<FormFieldError>;
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
      readonly errors: Array<string | Record<string, Array<StandardSchemaV1Issue>>>;
    };
  };
} = tanStackFormHookContexts;

type EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta = never> = FormOptions<
  TEncoded,
  undefined,
  undefined,
  StandardSchemaV1<TEncoded, unknown> | undefined,
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
  Parameters<NonNullable<EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>['onSubmit']>>[0],
  'value'
> & {
  readonly value: TType;
};

type EffectSchemaSubmitSuccessProps<TType, TEncoded, TSuccess, TSubmitMeta> =
  EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta> & {
    readonly result: TSuccess;
  };

type EffectSchemaSubmitFailureProps<TType, TEncoded, TFailure, TSubmitMeta> = Omit<
  EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>,
  'meta'
> & {
  readonly error: TFailure;
  readonly meta?: TSubmitMeta;
};

interface EffectSchemaSubmissionOptions<
  TType,
  TEncoded,
  TSuccess,
  TFailure,
  TSubmitMeta,
  TServices,
> {
  readonly onSubmit: (
    props: EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>
  ) => Effect.Effect<TSuccess, TFailure, TServices>;
  readonly onSuccess?: (
    props: EffectSchemaSubmitSuccessProps<TType, TEncoded, TSuccess, TSubmitMeta>
  ) => void | Promise<void>;
  readonly onFailure: (
    props: EffectSchemaSubmitFailureProps<TType, TEncoded, TFailure, TSubmitMeta>
  ) => string;
}

type EffectSchemaFormOptions<
  TType,
  TEncoded,
  TSuccess,
  TFailure,
  TEncodingServices,
  TSubmitMeta,
  TServices,
> = Omit<
  EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>,
  'onSubmit' | 'validators' | 'defaultValues'
> &
  EffectSchemaSubmissionOptions<TType, TEncoded, TSuccess, TFailure, TSubmitMeta, TServices> &
  (
    | {
        readonly schema: Schema.Codec<TType, TEncoded, never, TEncodingServices>;
        readonly defaultValues?: TEncoded;
      }
    | {
        readonly schema?: never;
        readonly defaultValues?: never;
        readonly onSubmit: [Schema.Void['Type']] extends [TType]
          ? EffectSchemaSubmissionOptions<
              TType,
              TEncoded,
              TSuccess,
              TFailure,
              TSubmitMeta,
              TServices
            >['onSubmit']
          : never;
      }
  );

type EffectSchemaInternalFormOptions<
  TType,
  TEncoded,
  TSuccess,
  TFailure,
  TEncodingServices,
  TSubmitMeta,
  TServices,
> = Omit<
  EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>,
  'onSubmit' | 'validators' | 'defaultValues'
> &
  (
    | ({
        readonly schema: Schema.Codec<TType, TEncoded, never, TEncodingServices>;
        readonly defaultValues?: TEncoded;
      } & EffectSchemaSubmissionOptions<
        TType,
        TEncoded,
        TSuccess,
        TFailure,
        TSubmitMeta,
        TServices
      >)
    | ({
        readonly schema?: never;
        readonly defaultValues?: never;
      } & EffectSchemaSubmissionOptions<void, TEncoded, TSuccess, TFailure, TSubmitMeta, TServices>)
  );

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
  TServices,
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
  runtime,
}: {
  readonly fieldComponents: TFieldComponents;
  readonly fieldContext: Context<AnyFieldApi>;
  readonly formComponents: TFormComponents;
  readonly formContext: Context<AnyFormApi>;
  readonly runtime: Atom.AtomRuntime<TServices>;
}) => {
  const { useAppForm: useTanStackAppForm, ...formHook } = createFormHook({
    fieldComponents,
    fieldContext: hookFieldContext,
    formComponents,
    formContext: hookFormContext,
  });

  function useAppForm<
    TType = void,
    TEncoded = Record<string, never>,
    TSuccess = void,
    TFailure = never,
    TEncodingServices = never,
    TSubmitMeta = never,
  >(
    options: EffectSchemaFormOptions<
      TType,
      TEncoded,
      TSuccess,
      TFailure,
      TEncodingServices,
      TSubmitMeta,
      TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
    >
  ): FormWithoutFieldValidators<
    AppFieldExtendedReactFormApi<
      TEncoded,
      undefined,
      undefined,
      StandardSchemaV1<TEncoded, unknown> | undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TSubmitMeta,
      TFieldComponents,
      TFormComponents
    >
  >;
  function useAppForm<TType, TEncoded, TSuccess, TFailure, TEncodingServices, TSubmitMeta>(
    options: EffectSchemaInternalFormOptions<
      TType,
      TEncoded,
      TSuccess,
      TFailure,
      TEncodingServices,
      TSubmitMeta,
      TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
    >
  ) {
    const props = Struct.omit(options, ['schema', 'onSubmit', 'onFailure', 'onSuccess']);
    const registry = useContext(RegistryContext);
    useAtomMount(runtime);
    const standardSchema =
      options.schema === void 0 ? void 0 : Schema.toStandardSchemaV1(options.schema);

    const form = useTanStackAppForm({
      ...props,
      listeners: {
        ...props.listeners,
        onChange: (listenerProps) => {
          setSubmissionError(Option.none());
          props.listeners?.onChange?.(listenerProps);
        },
      },
      onSubmit: async (submitProps) => {
        setSubmissionError(Option.none());

        const submitDecoded = async <Value,>({
          callbacks,
          value,
        }: {
          readonly callbacks: EffectSchemaSubmissionOptions<
            Value,
            TEncoded,
            TSuccess,
            TFailure,
            TSubmitMeta,
            TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
          >;
          readonly value: Value;
        }) => {
          const submitExit = await Effect.runPromiseExit(
            AtomRegistry.getResult(
              registry,
              runtime.atom(Effect.suspend(() => callbacks.onSubmit({ ...submitProps, value })))
            )
          );

          if (Exit.isSuccess(submitExit)) {
            await callbacks.onSuccess?.({
              ...submitProps,
              result: submitExit.value,
              value,
            });
            return;
          }

          const error = Exit.findErrorOption(submitExit);
          if (Option.isSome(error)) {
            setSubmissionError(
              Option.some(
                callbacks.onFailure({
                  ...submitProps,
                  error: error.value,
                  value,
                })
              )
            );
            return;
          }

          throw Cause.squash(submitExit.cause);
        };

        if (options.schema === void 0) {
          await submitDecoded({ callbacks: options, value: void 0 });
        } else {
          const result = await Schema.toStandardSchemaV1(options.schema)['~standard'].validate(
            submitProps.value
          );
          if (result.issues !== void 0) {
            throw new Error('Unexpected invalid data during submit');
          }
          await submitDecoded({ callbacks: options, value: result.value });
        }
      },
      validators: { onChangeAsync: standardSchema },
    });
    const setSubmissionError = useAtomSet(formSubmissionError(form));
    const reset = useMemo(() => {
      const resetForm = form.reset;

      return (...args: Parameters<typeof resetForm>) => {
        setSubmissionError(Option.none());
        resetForm(...args);
      };
    }, [form, setSubmissionError]);

    return withoutFieldValidators(Object.assign(form, { reset }));
  }

  return { ...formHook, useAppForm };
};

export const useTextFieldState = () => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const hasFocused = useRef(false);
  return {
    field,
    isSubmitting,
    errorMessage: field.state.meta.isTouched ? Array.head(field.state.meta.errors) : Option.none(),
    onFocusChange: (focused: boolean) => {
      // Native controls can emit an initial unfocused event. Only real blur marks a field touched.
      if (focused) {
        hasFocused.current = true;
      } else if (hasFocused.current) {
        field.handleBlur();
      }
    },
  };
};

export const useSubmitState = () => {
  const form = useFormContext();
  const submissionError = useFormSubmissionError();
  const [canSubmit, isSubmitting, validationErrors] = useSelector(
    form.store,
    (state) =>
      [
        state.canSubmit,
        state.isSubmitting,
        Array.filter(
          state.errors,
          (error): error is string => Predicate.isString(error) && error.length > 0
        ),
      ] as const
  );
  return {
    form,
    canSubmit,
    isSubmitting,
    errorMessage: Option.orElse(submissionError, () => Array.head(validationErrors)),
  };
};
