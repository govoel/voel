import { RegistryContext, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import type { ObservableState } from '@expo/ui';
import {
  Field,
  createFormHook,
  createFormHookContexts,
  useFormGroup,
  useSelector,
} from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  AppFieldExtendedReactFormApi,
  DeepKeys,
  DeepValue,
  FormApi,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import { Array, Cause, Effect, Exit, Option, Predicate, Schema, String, Struct } from 'effect';
import type { Scope } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';
import type { Reactivity } from 'effect/reactivity';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ComponentType, Context, ReactNode } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

const formSubmissionError = Atom.family((_form: AnyFormApi) =>
  Atom.make<Option.Option<string>>(Option.none())
);

/**
 * The submission state of the surrounding form group, if any. Inside a group, fields and submit
 * buttons act on the group instead of the whole form.
 */
const formGroupContext = createContext<
  Option.Option<{
    readonly canSubmit: boolean;
    readonly isSubmitting: boolean;
    readonly errorMessage: Option.Option<string>;
    readonly submit: () => Promise<void>;
  }>
>(Option.none());

type FormFieldError = string | StandardSchemaV1Issue;

const getFormFieldErrorMessage = (error: FormFieldError) =>
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

const decodeSubmitted = async <TType, TEncoded, TEncodingServices>({
  schema,
  value,
}: {
  readonly schema: Schema.Codec<TType, TEncoded, never, TEncodingServices>;
  readonly value: TEncoded;
}) => {
  const result = await Schema.toStandardSchemaV1(schema)['~standard'].validate(value);
  if (result.issues !== void 0) {
    throw new Error('Unexpected invalid data during submit');
  }
  return result.value;
};

/**
 * Scopes `children` to a form group from `useAppFormGroup`: submit buttons inside submit the group,
 * and fields inside are disabled while it's submitted.
 */
const AppFormGroup = ({
  group,
  children,
}: {
  readonly group: {
    readonly state: {
      readonly meta: { readonly canSubmit: boolean; readonly isSubmitting: boolean };
    };
    readonly handleSubmit: () => Promise<void>;
    readonly submissionError: Atom.Atom<Option.Option<string>>;
  };
  readonly children: ReactNode;
}) => {
  const { canSubmit, isSubmitting } = group.state.meta;
  const errorMessage = useAtomValue(group.submissionError);
  const value = useMemo(
    () =>
      Option.some({
        canSubmit,
        isSubmitting,
        errorMessage,
        submit: async () => group.handleSubmit(),
      }),
    [canSubmit, isSubmitting, errorMessage, group]
  );
  return <formGroupContext.Provider value={value}>{children}</formGroupContext.Provider>;
};

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

  /** Runs a submission, reporting expected failures through `setError` and rethrowing defects. */
  const runSubmission = async <TSuccess, TFailure>({
    registry,
    submit,
    onSuccess,
    onFailure,
    setError,
  }: {
    readonly registry: AtomRegistry.AtomRegistry;
    readonly submit: () => Effect.Effect<
      TSuccess,
      TFailure,
      TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
    >;
    readonly onSuccess: (result: TSuccess) => void | Promise<void>;
    readonly onFailure: (error: TFailure) => string;
    readonly setError: (message: Option.Option<string>) => void;
  }) => {
    setError(Option.none());
    const submitExit = await Effect.runPromiseExit(
      AtomRegistry.getResult(registry, runtime.atom(Effect.suspend(submit)))
    );

    if (Exit.isSuccess(submitExit)) {
      await onSuccess(submitExit.value);
      return;
    }

    const error = Exit.findErrorOption(submitExit);
    if (Option.isSome(error)) {
      setError(Option.some(onFailure(error.value)));
      return;
    }

    throw Cause.squash(submitExit.cause);
  };

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
  ): AppFieldExtendedReactFormApi<
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
        const submit = async <Value,>({
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
        }) =>
          runSubmission({
            registry,
            submit: () => callbacks.onSubmit({ ...submitProps, value }),
            onSuccess: async (result) => callbacks.onSuccess?.({ ...submitProps, result, value }),
            onFailure: (error) => callbacks.onFailure({ ...submitProps, error, value }),
            setError: setSubmissionError,
          });

        await (options.schema === void 0
          ? submit({ callbacks: options, value: void 0 })
          : submit({
              callbacks: options,
              value: await decodeSubmitted({ schema: options.schema, value: submitProps.value }),
            }));
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

    return Object.assign(form, { reset });
  }

  /**
   * A part of `form` that's submitted on its own, like a lookup that fills in the rest of the form.
   * The whole form's validation still applies to the group's fields when the group is submitted.
   * Render the group's submit button inside `<AppFormGroup group={group}>`.
   */
  const useAppFormGroup = <
    TFormData,
    TSubmitMeta,
    const TName extends DeepKeys<TFormData>,
    TType,
    TSuccess,
    TFailure,
    TEncodingServices = never,
  >({
    form,
    name,
    schema,
    onSubmit,
    onSuccess,
    onFailure,
  }: {
    readonly form: FormApi<
      TFormData,
      undefined,
      undefined,
      StandardSchemaV1<TFormData, unknown> | undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TSubmitMeta
    >;
    readonly name: TName;
    readonly schema: Schema.Codec<TType, DeepValue<TFormData, TName>, never, TEncodingServices>;
    readonly onSubmit: (props: {
      readonly value: TType;
    }) => Effect.Effect<
      TSuccess,
      TFailure,
      TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
    >;
    readonly onSuccess?: (props: {
      readonly value: TType;
      readonly result: TSuccess;
    }) => void | Promise<void>;
    readonly onFailure: (props: { readonly value: TType; readonly error: TFailure }) => string;
  }) => {
    const registry = useContext(RegistryContext);
    useAtomMount(runtime);
    const submissionError = useMemo(() => Atom.make(Option.none<string>()), []);
    const setError = (message: Option.Option<string>) => {
      registry.set(submissionError, message);
    };
    const group = useFormGroup({
      form,
      name,
      listeners: {
        onChange: () => {
          setError(Option.none());
        },
      },
      onGroupSubmit: async ({ value }) => {
        const decoded = await decodeSubmitted({ schema, value });
        await runSubmission({
          registry,
          submit: () => onSubmit({ value: decoded }),
          onSuccess: async (result) => onSuccess?.({ value: decoded, result }),
          onFailure: (error) => onFailure({ value: decoded, error }),
          setError,
        });
      },
    });
    return Object.assign(group, { submissionError });
  };

  return { ...formHook, useAppForm, useAppFormGroup, AppFormGroup };
};

/** Whether the field's form is saving, or its form group is being submitted. */
const useIsSubmitting = () => {
  const form = useFormContext();
  const group = useContext(formGroupContext);
  const isFormSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  return isFormSubmitting || Option.exists(group, ({ isSubmitting }) => isSubmitting);
};

export const useTextFieldState = () => {
  const field = useFieldContext<string>();
  const errorMessage = useSelector(
    field.store,
    (state) =>
      state.meta.isTouched
        ? Option.map(Array.head(state.meta.errors), getFormFieldErrorMessage)
        : Option.none(),
    { compare: Option.makeEquivalence(String.Equivalence) }
  );
  const isSubmitting = useIsSubmitting();
  const hasFocused = useRef(false);
  return {
    field,
    isSubmitting,
    errorMessage,
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

/**
 * Keeps a native field's text in sync with its form field. Typing flows to the form through the
 * returned change handler, and other form changes (reset, `setFieldValue`) flow back to `text`.
 */
export const useNativeTextSync = ({
  text,
}: {
  readonly text: Pick<ObservableState<string>, 'set'>;
}) => {
  const { store, handleChange } = useFieldContext<string>();
  // Native change events arrive asynchronously. Remembering the last text either side reported
  // keeps the form's echo of a stale keystroke from overwriting newer native input.
  const lastSyncedText = useRef(store.state.value);
  useEffect(() => {
    const syncToNative = () => {
      const { value } = store.state;
      if (lastSyncedText.current !== value) {
        lastSyncedText.current = value;
        text.set(value);
      }
    };
    syncToNative();
    const subscription = store.subscribe(syncToNative);
    return () => {
      subscription.unsubscribe();
    };
  }, [store, text]);
  return (value: string) => {
    lastSyncedText.current = value;
    handleChange(value);
  };
};

export const useTextListFieldState = () => {
  const field = useFieldContext<Array<string>>();
  const isSubmitting = useIsSubmitting();
  return {
    entries: field.state.value,
    isSubmitting,
    add: () => {
      field.pushValue('');
    },
    remove: (index: number) => {
      field.removeValue(index);
      field.handleBlur();
    },
  };
};

/**
 * Binds `children` to one entry of the surrounding list field, so text components like
 * `TextField` edit that entry the same way they edit a standalone field.
 */
export const TextListFieldEntry = ({
  index,
  children,
}: {
  readonly index: number;
  readonly children: ReactNode;
}) => {
  const field = useFieldContext<Array<string>>();
  return (
    <Field form={field.form} name={`${field.name}[${index}]`}>
      {(entry) => (
        <tanStackFormHookContexts.fieldContext.Provider value={entry}>
          {children}
        </tanStackFormHookContexts.fieldContext.Provider>
      )}
    </Field>
  );
};

/** The submission state of the surrounding form group, or else of the whole form. */
export const useSubmitState = () => {
  const form = useFormContext();
  const group = useContext(formGroupContext);
  const submissionError = useAtomValue(
    formSubmissionError(tanStackFormHookContexts.useFormContext())
  );
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
  return Option.getOrElse(group, () => ({
    canSubmit,
    isSubmitting,
    errorMessage: Option.orElse(submissionError, () => Array.head(validationErrors)),
    submit: async () => form.handleSubmit(),
  }));
};
