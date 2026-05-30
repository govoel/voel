import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  FormOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import type { ManagedRuntime} from 'effect';
import { Effect, Schema, SchemaIssue } from 'effect';
import { useRef } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

import { Runtime } from '#src/services/runtime.ts';

const tanStackFormHookContexts = createFormHookContexts();

export type EffectSchemaForRuntime<TRuntime extends ManagedRuntime.ManagedRuntime<never, unknown>> =
  TRuntime extends ManagedRuntime.ManagedRuntime<infer R, unknown>
    ? Schema.Codec<unknown, unknown, R, unknown>
    : never;

const formatStandardSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

const createRuntimeStandardSchema = <
  R,
  E,
  TSchema extends Schema.Codec<unknown, unknown, R, unknown>,
>(
  runtime: ManagedRuntime.ManagedRuntime<R, E>,
  schema: TSchema
): StandardSchemaV1<TSchema['Encoded'], TSchema['Type']> => ({
  '~standard': {
    validate: async (value) =>
      runtime.runPromise(
        Schema.decodeEffect(schema)(value, { errors: 'all' }).pipe(
          Effect.match({
            onFailure: (error) => formatStandardSchemaIssue(error.issue),
            onSuccess: (decodedValue) => ({ value: decodedValue }),
          })
        )
      ),
    vendor: 'effect',
    version: 1,
  },
});

type EffectFormSchema = EffectSchemaForRuntime<typeof Runtime>;

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

type StandardSchemaFormHookContexts = Omit<typeof tanStackFormHookContexts, 'useFieldContext'> & {
  readonly useFieldContext: <TData>() => StandardSchemaFieldContext<TData>;
};

export const { fieldContext, formContext, useFormContext, useFieldContext } =
  tanStackFormHookContexts as StandardSchemaFormHookContexts;

type EffectSchemaSubmitValidator<TSchema extends EffectFormSchema> = (props: {
  readonly value: TSchema['Encoded'];
  readonly formApi: AnyFormApi;
  readonly signal: AbortSignal;
}) => string | null | Promise<string | null>;

type EffectSchemaBaseFormOptions<
  TSchema extends EffectFormSchema,
  TSubmitMeta = never,
> = FormOptions<
  TSchema['Encoded'],
  undefined,
  undefined,
  StandardSchemaV1<TSchema['Encoded'], TSchema['Type']>,
  undefined,
  undefined,
  undefined,
  EffectSchemaSubmitValidator<TSchema>,
  undefined,
  undefined,
  undefined,
  TSubmitMeta
>;

type EffectSchemaSubmitProps<TSchema extends EffectFormSchema, TSubmitMeta> = Omit<
  Parameters<NonNullable<EffectSchemaBaseFormOptions<TSchema, TSubmitMeta>['onSubmit']>>[0],
  'value'
> & {
  readonly value: TSchema['Type'];
};

type EffectSchemaFormOptions<TSchema extends EffectFormSchema, TSubmitMeta = never> = Omit<
  EffectSchemaBaseFormOptions<TSchema, TSubmitMeta>,
  'onSubmit' | 'validators'
> & {
  readonly schema: TSchema;
  readonly onSubmit?: (props: EffectSchemaSubmitProps<TSchema, TSubmitMeta>) => unknown;
};

type ParsedRef<T> =
  | {
      readonly value: T;
    }
  | undefined;

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
  const useAppForm = <TSchema extends EffectFormSchema, TSubmitMeta = never>({
    onSubmit,
    schema,
    ...props
  }: EffectSchemaFormOptions<TSchema, TSubmitMeta>) => {
    const parsedRef = useRef<ParsedRef<TSchema['Type']>>(void 0);
    const submitHandler =
      onSubmit === void 0
        ? {}
        : ({
            onSubmit: (submitProps) => {
              const parsed = parsedRef.current;

              if (parsed === void 0) {
                throw new Error('Unexpected submit without parsed data');
              }

              return onSubmit({ ...submitProps, value: parsed.value });
            },
          } satisfies Pick<EffectSchemaBaseFormOptions<TSchema, TSubmitMeta>, 'onSubmit'>);

    const form = useTanStackAppForm({
      ...props,
      ...submitHandler,
      validators: {
        onChangeAsync: createRuntimeStandardSchema(Runtime, schema),
        onSubmitAsync: async ({ value }) => {
          parsedRef.current = void 0;

          return Runtime.runPromise(
            Schema.decodeEffect(schema)(value, { errors: 'all' }).pipe(
              Effect.match({
                onFailure: (error) => error.message,
                onSuccess: (decodedValue) => {
                  parsedRef.current = { value: decodedValue };
                  return null;
                },
              })
            )
          );
        },
      },
    });

    return withoutFieldValidators(form);
  };

  return { ...formHook, useAppForm };
};
