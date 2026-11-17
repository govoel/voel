import { RegistryContext, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import type { ObservableState } from '@expo/ui';
import {
  Field,
  createFormHook,
  createFormHookContexts,
  isFieldInGroup,
  useFormGroup,
  useSelector,
} from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  AppFieldExtendedReactFormApi,
  DeepKeys,
  DeepValue,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import {
  Array,
  Effect,
  Option,
  Order,
  Predicate,
  Record,
  Result,
  Schema,
  String,
  Struct,
} from 'effect';
import type { Scope } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';
import type { Reactivity } from 'effect/reactivity';
import { useContext, useEffect, useMemo, useRef } from 'react';
import type { ComponentType, Context, ReactNode } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

const formSubmissionError = Atom.family((_form: AnyFormApi) =>
  Atom.make<Option.Option<string>>(Option.none())
);

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

  /** A form from `useAppForm`, validated by its schema. */
  type AppForm<TEncoded, TSubmitMeta> = AppFieldExtendedReactFormApi<
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

  /**
   * Decodes and submits a value, reporting expected failures through `setError` and rethrowing
   * defects. Validation already accepted the value, so failing to decode it is a defect.
   */
  const runSubmission = async <TType, TSuccess, TFailure>({
    registry,
    decoded,
    onSubmit,
    onSuccess,
    onFailure,
    setError,
  }: {
    readonly registry: AtomRegistry.AtomRegistry;
    readonly decoded: Effect.Effect<TType, Schema.SchemaError>;
    readonly onSubmit: (
      value: TType
    ) => Effect.Effect<
      TSuccess,
      TFailure,
      TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
    >;
    readonly onSuccess: (props: {
      readonly value: TType;
      readonly result: TSuccess;
    }) => void | Promise<void>;
    readonly onFailure: (props: { readonly value: TType; readonly error: TFailure }) => string;
    readonly setError: (message: Option.Option<string>) => void;
  }) => {
    setError(Option.none());
    // Defects reject the promise, so only expected failures reach `result`.
    const { value, result } = await Effect.runPromise(
      AtomRegistry.getResult(
        registry,
        runtime.atom(
          decoded.pipe(
            Effect.orDie,
            Effect.flatMap((decodedValue) =>
              onSubmit(decodedValue).pipe(
                Effect.result,
                Effect.map((submitted) => ({ value: decodedValue, result: submitted }))
              )
            )
          )
        )
      )
    );
    await Result.match(result, {
      onSuccess: async (success) => onSuccess({ value, result: success }),
      onFailure: (error) => {
        setError(Option.some(onFailure({ value, error })));
      },
    });
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
  ): AppForm<TEncoded, TSubmitMeta>;
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
          decoded,
        }: {
          readonly callbacks: EffectSchemaSubmissionOptions<
            Value,
            TEncoded,
            TSuccess,
            TFailure,
            TSubmitMeta,
            TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
          >;
          readonly decoded: Effect.Effect<Value, Schema.SchemaError>;
        }) =>
          runSubmission({
            registry,
            decoded,
            onSubmit: (value) => callbacks.onSubmit({ ...submitProps, value }),
            onSuccess: async ({ value, result }) =>
              callbacks.onSuccess?.({ ...submitProps, result, value }),
            onFailure: ({ value, error }) => callbacks.onFailure({ ...submitProps, error, value }),
            setError: setSubmissionError,
          });

        await (options.schema === void 0
          ? submit({ callbacks: options, decoded: Effect.void })
          : submit({
              callbacks: options,
              decoded: Schema.decodeEffect(options.schema)(submitProps.value),
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
   * Pass the group to a submit button to submit just the group.
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
    readonly form: AppForm<TFormData, TSubmitMeta>;
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
    const setError = useAtomSet(submissionError);
    const group = useFormGroup({
      form,
      name,
      listeners: {
        onChange: () => {
          setError(Option.none());
        },
      },
      onGroupSubmit: async ({ value }) =>
        runSubmission({
          registry,
          decoded: Schema.decodeEffect(schema)(value),
          onSubmit: (decoded) => onSubmit({ value: decoded }),
          onSuccess: async (props) => onSuccess?.(props),
          onFailure,
          setError,
        }),
    });
    return Object.assign(group, { submissionError });
  };

  return { ...formHook, useAppForm, useAppFormGroup };
};

/**
 * Whether the field's form is saving, or a form group containing the field is being submitted
 * (see `useAppFormGroup`). Either way, the field's value is about to be used, so it can't change.
 */
const useIsFieldSubmitting = () => {
  const field = useFieldContext<unknown>();
  const isFormSubmitting = useSelector(field.form.store, (state) => state.isSubmitting);
  const isGroupSubmitting = useSelector(field.form.formGroupMetaDerived, (groups) =>
    Record.some(groups, (meta, name) => meta.isSubmitting && isFieldInGroup(name, field.name))
  );
  return isFormSubmitting || isGroupSubmitting;
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
  const isSubmitting = useIsFieldSubmitting();
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
  const isSubmitting = useIsFieldSubmitting();
  return {
    entries: field.state.value,
    isSubmitting,
    add: () => {
      field.pushValue('');
    },
    remove: ({ indices }: { readonly indices: Iterable<number> }) => {
      // Last first, so each removal leaves the remaining indices pointing at the same entries.
      for (const index of Array.sort(indices, Order.flip(Order.Number))) {
        field.removeValue(index);
      }
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

/**
 * The submission state of the surrounding form, or of `group`, a form group from `useAppFormGroup`
 * that's submitted on its own.
 */
export const useSubmitState = ({
  group,
}: {
  readonly group?:
    | {
        readonly state: {
          readonly meta: { readonly canSubmit: boolean; readonly isSubmitting: boolean };
        };
        readonly handleSubmit: () => Promise<void>;
        readonly submissionError: Atom.Atom<Option.Option<string>>;
      }
    | undefined;
} = {}) => {
  const form = useFormContext();
  const formApi = tanStackFormHookContexts.useFormContext();
  const submissionError = useAtomValue(group?.submissionError ?? formSubmissionError(formApi));
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
  return group === void 0
    ? {
        canSubmit,
        isSubmitting,
        errorMessage: Option.orElse(submissionError, () => Array.head(validationErrors)),
        submit: async () => form.handleSubmit(),
      }
    : {
        canSubmit: group.state.meta.canSubmit,
        isSubmitting: group.state.meta.isSubmitting,
        errorMessage: submissionError,
        submit: async () => group.handleSubmit(),
      };
};
