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
import { useCallback, useMemo, useRef } from 'react';
import type { ComponentProps, ComponentType, Context, PropsWithChildren } from 'react';

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

interface StandardSchemaFormError {
  readonly form: Record<string, StandardSchemaV1Issue[]>;
  readonly fields: Record<string, StandardSchemaV1Issue[]>;
}

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
}) =>
  | FormMutationError<TEncoded>
  | StandardSchemaFormError
  | null
  | Promise<FormMutationError<TEncoded> | StandardSchemaFormError | null>;

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

const standardSchemaFailureToFormError = (
  issues: readonly StandardSchemaV1Issue[],
  formValue: unknown
): StandardSchemaFormError => {
  const errors = new Map<string, StandardSchemaV1Issue[]>();

  for (const issue of issues) {
    let currentValue = formValue;
    let path = '';

    for (const [index, pathSegment] of (issue.path ?? []).entries()) {
      const segment = typeof pathSegment === 'object' ? pathSegment.key : pathSegment;
      const segmentAsNumber = Number(segment);

      path +=
        Array.isArray(currentValue) && !Number.isNaN(segmentAsNumber)
          ? `[${segmentAsNumber}]`
          : `${index > 0 ? '.' : ''}${String(segment)}`;

      currentValue =
        typeof currentValue === 'object' && currentValue !== null
          ? Reflect.get(currentValue, segment)
          : void 0;
    }

    errors.set(path, [...(errors.get(path) ?? []), issue]);
  }

  const errorRecord = Object.fromEntries(errors);
  return { fields: errorRecord, form: errorRecord };
};

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
    const parsedRef = useRef<Option.Option<TType>>(Option.none());
    const submitAttemptRef = useRef(0);

    const form = useTanStackAppForm({
      ...props,
      onSubmit: async (submitProps) => {
        const parsed = parsedRef.current;
        const submitAttempt = submitAttemptRef.current + 1;
        submitAttemptRef.current = submitAttempt;

        if (Option.isNone(parsed)) {
          throw new Error('Unexpected submit without parsed data');
        }

        const mutationExit = await runMutation(parsed.value);
        if (submitAttempt !== submitAttemptRef.current) {
          return;
        }

        if (Exit.isSuccess(mutationExit)) {
          await onSuccess?.({ ...submitProps, result: mutationExit.value, value: parsed.value });
          return;
        }

        const error = Exit.findErrorOption(mutationExit);
        if (Option.isSome(error)) {
          const formError = onFailure({ ...submitProps, error: error.value, value: parsed.value });
          submitProps.formApi.setErrorMap({ onSubmit: formError });
          return;
        }

        throw Cause.squash(mutationExit.cause);
      },
      validators: {
        onChangeAsync: standardSchema,
        onSubmitAsync: async ({ signal, value }) => {
          const submitAttempt = submitAttemptRef.current + 1;
          submitAttemptRef.current = submitAttempt;
          parsedRef.current = Option.none();

          const schemaResult = await standardSchema['~standard'].validate(value);
          if (schemaResult.issues !== void 0) {
            return standardSchemaFailureToFormError(schemaResult.issues, value);
          }

          if (signal.aborted || submitAttempt !== submitAttemptRef.current) {
            return null;
          }

          parsedRef.current = Option.some(schemaResult.value);
          return null;
        },
      },
    });

    const contextForm = useMemo(() => {
      const reset = form.reset.bind(form);

      const resetWithMutation = ((...resetArgs: Parameters<typeof reset>) => {
        submitAttemptRef.current += 1;
        parsedRef.current = Option.none();
        reset(...resetArgs);
      }) satisfies typeof form.reset;

      return new Proxy(form, {
        get: (target, property, receiver) => {
          if (property === 'reset') {
            return resetWithMutation;
          }

          return Reflect.get(target, property, receiver);
        },
      });
    }, [form]);

    const EffectSchemaAppForm = useCallback(
      ({ children }: PropsWithChildren) => (
        <hookFormContext.Provider value={contextForm}>{children}</hookFormContext.Provider>
      ),
      [contextForm]
    );

    const wrappedForm = useMemo(
      () =>
        new Proxy(contextForm, {
          get: (target, property, receiver) => {
            if (property === 'AppForm') {
              return EffectSchemaAppForm;
            }

            return Reflect.get(target, property, receiver);
          },
        }),
      [EffectSchemaAppForm, contextForm]
    );

    return withoutFieldValidators(wrappedForm);
  };

  return { ...formHook, useAppForm };
};
