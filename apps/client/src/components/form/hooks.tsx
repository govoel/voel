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
  FormGroupApiOptions,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import {
  Array,
  Effect,
  Equal,
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
import type { Context, ReactNode } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

const formResetSignal = Atom.family((_form: AnyFormApi) => Atom.make(0));

const makeSubmissionError = (form: AnyFormApi) =>
  Atom.writable(
    (get) => {
      get(formResetSignal(form));
      return Option.none<string>();
    },
    (context, error: Option.Option<string>) => {
      context.setSelf(error);
    }
  );

const formSubmissionError = Atom.family(makeSubmissionError);

const groupSubmissionError = Atom.family((form: AnyFormApi) =>
  Atom.family((_name: string) => makeSubmissionError(form))
);

type FormFieldError = string | StandardSchemaV1Issue;

const getFormFieldErrorMessage = (error: FormFieldError) =>
  Predicate.isString(error) ? error : error.message;

export const {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
}: Omit<typeof tanStackFormHookContexts, 'useFieldContext' | 'useFormContext'> & {
  readonly useFieldContext: <TData>() => Omit<
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

interface EffectSchemaSubmissionOptions<TProps, TSuccess, TFailure, TServices> {
  readonly onSubmit: (props: TProps) => Effect.Effect<TSuccess, TFailure, TServices>;
  readonly onSuccess?: (props: TProps & { readonly result: TSuccess }) => void | Promise<void>;
  readonly onFailure: (props: TProps & { readonly error: TFailure }) => string;
}

type EffectSchemaBaseFormGroupOptions<
  TFormData,
  TName extends DeepKeys<TFormData>,
  TParentSubmitMeta,
  TSubmitMeta,
> = FormGroupApiOptions<
  TFormData,
  TName,
  DeepValue<TFormData, TName>,
  undefined,
  undefined,
  StandardSchemaV1<DeepValue<TFormData, TName>, unknown> | undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  TSubmitMeta,
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
  TParentSubmitMeta
>;

export const createEffectSchemaFormHook = <
  TServices,
  const TFieldComponents extends Parameters<typeof createFormHook>[0]['fieldComponents'],
  const TFormComponents extends Parameters<typeof createFormHook>[0]['formComponents'],
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
  const { useAppForm: useTanStackAppForm } = createFormHook({
    fieldComponents,
    fieldContext: hookFieldContext,
    formComponents,
    formContext: hookFormContext,
  });

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
    options: Omit<
      EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>,
      'onSubmit' | 'validators' | 'defaultValues'
    > &
      EffectSchemaSubmissionOptions<
        EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>,
        TSuccess,
        TFailure,
        TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
      > &
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
                  EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>,
                  TSuccess,
                  TFailure,
                  TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
                >['onSubmit']
              : never;
          }
      )
  ): AppForm<TEncoded, TSubmitMeta>;
  function useAppForm<TType, TEncoded, TSuccess, TFailure, TEncodingServices, TSubmitMeta>(
    options: Omit<
      EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>,
      'onSubmit' | 'validators' | 'defaultValues'
    > &
      (
        | ({
            readonly schema: Schema.Codec<TType, TEncoded, never, TEncodingServices>;
            readonly defaultValues?: TEncoded;
          } & EffectSchemaSubmissionOptions<
            EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>,
            TSuccess,
            TFailure,
            TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
          >)
        | ({
            readonly schema?: never;
            readonly defaultValues?: never;
          } & EffectSchemaSubmissionOptions<
            EffectSchemaSubmitProps<void, TEncoded, TSubmitMeta>,
            TSuccess,
            TFailure,
            TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
          >)
      )
  ) {
    const props = Struct.omit(options, ['schema', 'onSubmit', 'onFailure', 'onSuccess']);
    const registry = useContext(RegistryContext);
    useAtomMount(runtime);
    const standardSchema =
      options.schema === void 0 ? void 0 : Schema.toStandardSchemaV1(options.schema);

    const form = Equal.byReferenceUnsafe(
      useTanStackAppForm({
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
              EffectSchemaSubmitProps<Value, TEncoded, TSubmitMeta>,
              TSuccess,
              TFailure,
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
              onFailure: ({ value, error }) =>
                callbacks.onFailure({ ...submitProps, error, value }),
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
      })
    );
    const setSubmissionError = useAtomSet(formSubmissionError(form));
    const signalReset = useAtomSet(formResetSignal(form));
    const reset = useMemo(() => {
      const resetForm = form.reset;

      return (...args: Parameters<typeof resetForm>) => {
        signalReset((count) => count + 1);
        resetForm(...args);
      };
    }, [form, signalReset]);

    return Object.assign(form, { reset });
  }

  const useAppFormGroup = <
    TFormData,
    TParentSubmitMeta,
    const TName extends DeepKeys<TFormData>,
    TType,
    TSuccess,
    TFailure,
    TEncodingServices = never,
    TSubmitMeta = never,
  >({
    form,
    name,
    schema,
    onSubmitMeta,
    onSubmit,
    onSuccess,
    onFailure,
  }: {
    readonly form: AppForm<TFormData, TParentSubmitMeta>;
    readonly name: TName;
    readonly schema: Schema.Codec<TType, DeepValue<TFormData, TName>, never, TEncodingServices>;
    readonly onSubmitMeta?: TSubmitMeta;
  } & EffectSchemaSubmissionOptions<
    Omit<
      Parameters<
        NonNullable<
          EffectSchemaBaseFormGroupOptions<
            TFormData,
            TName,
            TParentSubmitMeta,
            TSubmitMeta
          >['onGroupSubmit']
        >
      >[0],
      'value'
    > & { readonly value: TType },
    TSuccess,
    TFailure,
    TServices | Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity
  >) => {
    const registry = useContext(RegistryContext);
    useAtomMount(runtime);
    const submissionError = groupSubmissionError(form)(name);
    const setError = useAtomSet(submissionError);
    const options: EffectSchemaBaseFormGroupOptions<
      TFormData,
      TName,
      TParentSubmitMeta,
      TSubmitMeta
    > = {
      form,
      name,
      ...(onSubmitMeta === void 0 ? {} : { onSubmitMeta }),
      validators: { onChangeAsync: Schema.toStandardSchemaV1(schema) },
      listeners: {
        onChange: () => {
          setError(Option.none());
        },
      },
      onGroupSubmit: async (submitProps) =>
        runSubmission({
          registry,
          decoded: Schema.decodeEffect(schema)(submitProps.value),
          onSubmit: (value) => onSubmit({ ...submitProps, value }),
          onSuccess: async ({ value, result }) => onSuccess?.({ ...submitProps, value, result }),
          onFailure: ({ value, error }) => onFailure({ ...submitProps, value, error }),
          setError,
        }),
    };
    const group = useFormGroup(options);
    return Object.assign(group, { submissionError });
  };

  return { useAppForm, useAppFormGroup };
};

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
      for (const index of Array.sort(indices, Order.flip(Order.Number))) {
        field.removeValue(index);
      }
      field.handleBlur();
    },
  };
};

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
        submit: form.handleSubmit,
      }
    : {
        canSubmit: group.state.meta.canSubmit,
        isSubmitting: group.state.meta.isSubmitting,
        errorMessage: submissionError,
        submit: group.handleSubmit,
      };
};
