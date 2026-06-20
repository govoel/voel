import { useAtomSet, useAtomValue } from '@effect/atom-react';
import * as ScopedAtom from '@effect/atom-react/ScopedAtom';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import type { ManagedRuntime } from 'effect';
import { Cause, Effect, Exit, Option, Schema, SchemaIssue } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { useCallback, useContext, useMemo, useRef } from 'react';
import type { ComponentProps, ComponentType, Context, PropsWithChildren } from 'react';

const tanStackFormHookContexts = createFormHookContexts();

type ManagedRuntimeServices<TRuntime extends ManagedRuntime.ManagedRuntime<never, unknown>> =
  ManagedRuntime.ManagedRuntime.Services<TRuntime>;

export type EffectSchemaForRuntime<
  TRuntime extends ManagedRuntime.ManagedRuntime<never, unknown>,
  TType,
  TEncoded,
  TDecodingServices extends ManagedRuntimeServices<TRuntime>,
  TEncodingServices,
> = Schema.Codec<TType, TEncoded, TDecodingServices, TEncodingServices>;

export class FormSubmitError extends Schema.TaggedErrorClass<
  FormSubmitError,
  { readonly brand: unique symbol }
>()('voel/components/form/hooks/FormSubmitError', { message: Schema.String }) {}

const isFormSubmitError = Schema.is(FormSubmitError);

const formSubmitErrorAtom = ScopedAtom.make((atom: Atom.Writable<Option.Option<string>>) => atom);

export const useFormSubmitError = () => {
  const submitErrorAtom = useContext(formSubmitErrorAtom.Context);
  const submitError = useAtomValue(submitErrorAtom);

  return submitError;
};

const formatStandardSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

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
      readonly errors: StandardSchemaV1Issue[];
    };
  };
};

type StringErrorFormContext = Omit<
  ReturnType<typeof tanStackFormHookContexts.useFormContext>,
  'state'
> & {
  readonly state: Omit<
    ReturnType<typeof tanStackFormHookContexts.useFormContext>['state'],
    'errors'
  > & {
    readonly errors: string[];
  };
};

type StandardSchemaFormHookContexts = Omit<
  typeof tanStackFormHookContexts,
  'useFieldContext' | 'useFormContext'
> & {
  readonly useFieldContext: <TData>() => StandardSchemaFieldContext<TData>;
  readonly useFormContext: () => StringErrorFormContext;
};

export const {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
}: StandardSchemaFormHookContexts = tanStackFormHookContexts;

type EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta = never> = FormOptions<
  TEncoded,
  undefined,
  undefined,
  StandardSchemaV1<TEncoded, TType>,
  undefined,
  undefined,
  undefined,
  StandardSchemaV1<TEncoded, TType>,
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

type EffectSchemaFormOptions<
  R,
  TType,
  TEncoded,
  TDecodingServices extends R,
  TEncodingServices,
  TSubmitMeta = never,
> = Omit<EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta>, 'onSubmit' | 'validators'> & {
  readonly schema: Schema.Codec<TType, TEncoded, TDecodingServices, TEncodingServices>;
  readonly onSubmit?: (
    props: EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>
  ) => Effect.Effect<unknown, FormSubmitError, R>;
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

  // App forms render Standard Schema issues directly in field components. Accepting the
  // Effect schema here, rather than arbitrary TanStack validators at each call site,
  // keeps that error shape enforced and makes custom string/object validators a type error.
  const useAppForm = <
    R,
    E,
    TType,
    TEncoded,
    TDecodingServices extends R = R,
    TEncodingServices = never,
    TSubmitMeta = never,
  >({
    onSubmit,
    runtime,
    schema,
    ...props
  }: EffectSchemaFormOptions<
    R,
    TType,
    TEncoded,
    TDecodingServices,
    TEncodingServices,
    TSubmitMeta
  > & {
    readonly runtime: ManagedRuntime.ManagedRuntime<R, E>;
  }) => {
    const parsedRef = useRef<Option.Option<TType>>(Option.none());
    const submitErrorAtom = useMemo(() => Atom.make<Option.Option<string>>(Option.none()), []);
    const setSubmitError = useAtomSet(submitErrorAtom);
    // TanStack passes AbortSignals to async validators, but not to onSubmit. Keep a local
    // generation counter so a reset or newer submit can make older submit results stale.
    const submitAttemptRef = useRef(0);

    const submitHandler =
      onSubmit === void 0
        ? {}
        : ({
            onSubmit: async (submitProps) => {
              const parsed = parsedRef.current;
              const submitAttempt = submitAttemptRef.current + 1;
              submitAttemptRef.current = submitAttempt;

              setSubmitError(Option.none());

              if (Option.isNone(parsed)) {
                throw new Error('Unexpected submit without parsed data');
              }

              const submitExit = await runtime.runPromiseExit(
                onSubmit({ ...submitProps, value: parsed.value })
              );

              // A reset or a later submit may have happened while the Effect was running. In
              // that case this submit no longer owns the form-level error slot.
              if (submitAttempt !== submitAttemptRef.current) {
                return;
              }

              if (Exit.isSuccess(submitExit)) {
                return;
              }

              const formSubmitError = Option.filter(
                Exit.findErrorOption(submitExit),
                isFormSubmitError
              );

              if (Option.isSome(formSubmitError)) {
                setSubmitError(Option.some(formSubmitError.value.message));
                return;
              }

              throw Cause.squash(submitExit.cause);
            },
          } satisfies Pick<EffectSchemaBaseFormOptions<TType, TEncoded, TSubmitMeta>, 'onSubmit'>);

    const schemaDecodeUnknownEffect = Schema.decodeUnknownEffect(schema);
    const form = useTanStackAppForm({
      ...props,
      ...submitHandler,
      validators: {
        onChangeAsync: {
          '~standard': {
            vendor: 'effect-voel',
            version: 1,
            validate: async (value) =>
              runtime.runPromise(
                schemaDecodeUnknownEffect(value, { errors: 'all' }).pipe(
                  Effect.match({
                    onFailure: (error) => formatStandardSchemaIssue(error.issue),
                    onSuccess: (decodedValue) => ({ value: decodedValue }),
                  })
                )
              ),
          },
        },
        onSubmitAsync: {
          '~standard': {
            vendor: 'effect-voel',
            version: 1,
            validate: async (value) => {
              setSubmitError(Option.none());
              parsedRef.current = Option.none();

              return runtime.runPromise(
                schemaDecodeUnknownEffect(value, { errors: 'all' }).pipe(
                  Effect.match({
                    onFailure: (error) => formatStandardSchemaIssue(error.issue),
                    onSuccess: (decodedValue) => {
                      parsedRef.current = Option.some(decodedValue);
                      return { value: decodedValue };
                    },
                  })
                )
              );
            },
          },
        },
      },
    });

    const resetForm = useMemo(() => {
      const reset = form.reset.bind(form);

      const resetWithSubmitError = ((...resetArgs: Parameters<typeof reset>) => {
        // Reset clears visible submit state and invalidates any in-flight submit that might
        // otherwise finish later and restore a stale FormSubmitError.
        submitAttemptRef.current += 1;
        parsedRef.current = Option.none();
        setSubmitError(Option.none());
        reset(...resetArgs);
      }) satisfies typeof form.reset;

      return new Proxy(form, {
        get: (target, property, receiver) => {
          if (property === 'reset') {
            return resetWithSubmitError;
          }

          return Reflect.get(target, property, receiver);
        },
      });
    }, [form, setSubmitError]);

    const FormSubmitErrorAppForm = useCallback(
      ({ children }: PropsWithChildren) => (
        <formSubmitErrorAtom.Provider value={submitErrorAtom}>
          <hookFormContext.Provider value={resetForm}>{children}</hookFormContext.Provider>
        </formSubmitErrorAtom.Provider>
      ),
      [resetForm, submitErrorAtom]
    );

    const wrappedForm = useMemo(
      () =>
        new Proxy(resetForm, {
          get: (target, property, receiver) => {
            if (property === 'AppForm') {
              return FormSubmitErrorAppForm;
            }

            return Reflect.get(target, property, receiver);
          },
        }),
      [FormSubmitErrorAppForm, resetForm]
    );

    return withoutFieldValidators(wrappedForm);
  };

  return { ...formHook, useAppForm };
};
