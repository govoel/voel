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
import { Effect, Schema, SchemaIssue } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { createElement, useRef } from 'react';
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

export class FormSubmitError extends Schema.TaggedErrorClass<FormSubmitError>()(
  'voel/components/form/hooks/FormSubmitError',
  { message: Schema.String }
) {}

const formSubmitErrorScopedAtom = ScopedAtom.make(
  (atom: Atom.Writable<FormSubmitError | null>) => atom
);

export const useFormSubmitError = () => {
  const submitErrorAtom = formSubmitErrorScopedAtom.use();
  return useAtomValue(submitErrorAtom);
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
    const parsedRef = useRef<undefined | TType>(void 0);
    const submitErrorAtomRef = useRef<Atom.Writable<FormSubmitError | null> | undefined>(void 0);

    if (submitErrorAtomRef.current === void 0) {
      submitErrorAtomRef.current = Atom.make<FormSubmitError | null>(null);
    }

    const submitErrorAtom = submitErrorAtomRef.current;
    const setSubmitError = useAtomSet(submitErrorAtom);
    const submitHandler =
      onSubmit === void 0
        ? {}
        : ({
            onSubmit: async (submitProps) => {
              const parsed = parsedRef.current;

              if (parsed === void 0) {
                throw new Error('Unexpected submit without parsed data');
              }

              return runtime.runPromise(onSubmit({ ...submitProps, value: parsed }));
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
              parsedRef.current = void 0;

              return runtime.runPromise(
                schemaDecodeUnknownEffect(value, { errors: 'all' }).pipe(
                  Effect.match({
                    onFailure: (error) => formatStandardSchemaIssue(error.issue),
                    onSuccess: (decodedValue) => {
                      parsedRef.current = decodedValue;
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

    const formInternalsRef = useRef<
      | {
          readonly form: typeof form;
          readonly AppForm: typeof form.AppForm;
          readonly reset: typeof form.reset;
        }
      | undefined
    >(void 0);

    if (formInternalsRef.current?.form !== form) {
      formInternalsRef.current = {
        form,
        AppForm: form.AppForm,
        reset: form.reset.bind(form),
      };
    }

    const { AppForm: TanStackAppForm, reset } = formInternalsRef.current;

    const FormSubmitErrorAppForm = ({ children }: PropsWithChildren) =>
      createElement(
        formSubmitErrorScopedAtom.Provider,
        { value: submitErrorAtom },
        createElement(TanStackAppForm, null, children)
      );

    form.AppForm = FormSubmitErrorAppForm;
    form.reset = ((...resetArgs: Parameters<typeof reset>) => {
      setSubmitError(null);
      reset(...resetArgs);
    }) satisfies typeof form.reset;

    return withoutFieldValidators(form);
  };

  return { ...formHook, useAppForm };
};
