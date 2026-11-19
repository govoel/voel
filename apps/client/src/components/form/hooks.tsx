import { RegistryContext, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import type { ObservableState } from '@expo/ui';
import { Field, createFormHook, createFormHookContexts, useSelector } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  AppFieldExtendedReactFormApi,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import {
  Array,
  Cause,
  Effect,
  Exit,
  Option,
  Order,
  Predicate,
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

const formSubmissionError = Atom.family((_form: AnyFormApi) =>
  Atom.make<Option.Option<string>>(Option.none())
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
            EffectSchemaSubmitProps<Value, TEncoded, TSubmitMeta>,
            TSuccess,
            TFailure,
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

    return Object.assign(form, { reset });
  }

  return { useAppForm };
};

export const useTextFieldState = () => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const errorMessage = useSelector(
    field.store,
    (state) =>
      state.meta.isTouched
        ? Option.map(Array.head(state.meta.errors), getFormFieldErrorMessage)
        : Option.none(),
    { compare: Option.makeEquivalence(String.Equivalence) }
  );
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
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
  const isSubmitting = useSelector(field.form.store, (state) => state.isSubmitting);
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

export const useSubmitState = () => {
  const form = useFormContext();
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
  return {
    form,
    canSubmit,
    isSubmitting,
    errorMessage: Option.orElse(submissionError, () => Array.head(validationErrors)),
  };
};
