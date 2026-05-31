import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type {
  AnyFieldApi,
  AnyFormApi,
  DeepKeys,
  FormOptions,
  StandardSchemaV1Issue,
} from '@tanstack/react-form';
import type { ManagedRuntime } from 'effect';
import { Effect, Schema, SchemaIssue } from 'effect';
import { useRef } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

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

const formatStandardSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

interface EffectSchemaFieldErrors<TEncoded> {
  readonly fields: Partial<Record<DeepKeys<TEncoded>, StandardSchemaV1Issue[]>>;
  readonly form?: undefined;
}

const getStandardSchemaIssuePath = <TEncoded>(
  issue: StandardSchemaV1Issue,
  formValue: unknown
): DeepKeys<TEncoded> => {
  let currentFormValue = formValue;
  let path = '';

  for (const [index, pathSegment] of (issue.path ?? []).entries()) {
    const segment = typeof pathSegment === 'object' ? pathSegment.key : pathSegment;
    const segmentAsNumber = Number(segment);

    path +=
      Array.isArray(currentFormValue) && !Number.isNaN(segmentAsNumber)
        ? `[${segmentAsNumber}]`
        : `${index > 0 ? '.' : ''}${String(segment)}`;

    currentFormValue =
      typeof currentFormValue === 'object' && currentFormValue !== null
        ? Reflect.get(currentFormValue, segment)
        : void 0;
  }

  return path as DeepKeys<TEncoded>;
};

const groupStandardSchemaIssues = <TEncoded>(
  issues: readonly StandardSchemaV1Issue[],
  formValue: unknown
): EffectSchemaFieldErrors<TEncoded> => {
  const fields: Partial<Record<DeepKeys<TEncoded>, StandardSchemaV1Issue[]>> = {};

  for (const issue of issues) {
    const path = getStandardSchemaIssuePath<TEncoded>(issue, formValue);
    fields[path] = [...(fields[path] ?? []), issue];
  }

  return { fields };
};

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

type EffectSchemaChangeValidator<TEncoded> = (props: {
  readonly value: TEncoded;
  readonly formApi: AnyFormApi;
  readonly signal: AbortSignal;
}) =>
  | EffectSchemaFieldErrors<TEncoded>
  | undefined
  | Promise<EffectSchemaFieldErrors<TEncoded> | undefined>;

type EffectSchemaSubmitValidator<TEncoded> = (props: {
  readonly value: TEncoded;
  readonly formApi: AnyFormApi;
  readonly signal: AbortSignal;
}) =>
  | string
  | null
  | undefined
  | EffectSchemaFieldErrors<TEncoded>
  | Promise<string | null | undefined | EffectSchemaFieldErrors<TEncoded>>;

type EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta = never> = FormOptions<
  TEncoded,
  undefined,
  undefined,
  EffectSchemaChangeValidator<TEncoded>,
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
  Parameters<NonNullable<EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>['onSubmit']>>[0],
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
> = Omit<EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>, 'onSubmit' | 'validators'> & {
  readonly schema: Schema.Codec<TType, TEncoded, TDecodingServices, TEncodingServices>;
  readonly onSubmit?: (props: EffectSchemaSubmitProps<TType, TEncoded, TSubmitMeta>) => unknown;
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
    const submitHandler =
      onSubmit === void 0
        ? {}
        : ({
            onSubmit: (submitProps) => {
              const parsed = parsedRef.current;

              if (parsed === void 0) {
                throw new Error('Unexpected submit without parsed data');
              }

              return onSubmit({ ...submitProps, value: parsed });
            },
          } satisfies Pick<EffectSchemaBaseFormOptions<TEncoded, TSubmitMeta>, 'onSubmit'>);

    const schemaDecodeEffect = Schema.decodeEffect(schema);
    const form = useTanStackAppForm({
      ...props,
      ...submitHandler,
      validators: {
        onChangeAsync: async ({ value, signal }) =>
          runtime.runPromise(
            Schema.decodeUnknownEffect(schema)(value, { errors: 'all' }).pipe(
              Effect.match({
                onFailure: (error) =>
                  groupStandardSchemaIssues<TEncoded>(
                    formatStandardSchemaIssue(error.issue).issues,
                    value
                  ),
                onSuccess: () => void 0,
              })
            ),
            { signal }
          ),
        onSubmitAsync: async ({ value, signal }) => {
          parsedRef.current = void 0;

          return runtime.runPromise(
            schemaDecodeEffect(value, { errors: 'all' }).pipe(
              Effect.match({
                onFailure: (error) =>
                  groupStandardSchemaIssues<TEncoded>(
                    formatStandardSchemaIssue(error.issue).issues,
                    value
                  ),
                onSuccess: (decodedValue) => {
                  parsedRef.current = decodedValue;
                  return null;
                },
              })
            ),
            { signal }
          );
        },
      },
    });

    return withoutFieldValidators(form);
  };

  return { ...formHook, useAppForm };
};
