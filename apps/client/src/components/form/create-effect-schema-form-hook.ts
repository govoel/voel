import { createFormHook } from '@tanstack/react-form';
import type { AnyFieldApi, AnyFormApi, FormOptions, StandardSchemaV1 } from '@tanstack/react-form';
import { Schema } from 'effect';
import { createElement } from 'react';
import type { ComponentProps, ComponentType, Context } from 'react';

type EffectSchemaFormOptions<TFormData, TSubmitMeta = never> = Omit<
  FormOptions<
    TFormData,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    StandardSchemaV1<TFormData, TFormData>,
    undefined,
    undefined,
    undefined,
    undefined,
    TSubmitMeta
  >,
  'validators'
> & {
  readonly schema: Schema.Decoder<TFormData>;
  readonly validators?: never;
};

type WithoutValidators<TProps> = Omit<TProps, 'validators'> & {
  readonly validators?: never;
};

const toFormStandardSchema = <TFormData>(schema: Schema.Decoder<TFormData>) => {
  const standardSchema = Schema.toStandardSchemaV1(schema);

  // Effect decoders validate unknown input, while TanStack form validators are typed as
  // accepting the current form value. Standard Schema's validate function also receives
  // unknown at runtime, so this adapter only narrows the phantom input type TanStack uses.
  return {
    '~standard': {
      validate: standardSchema['~standard'].validate,
      vendor: standardSchema['~standard'].vendor,
      version: standardSchema['~standard'].version,
    },
  } satisfies StandardSchemaV1<TFormData, TFormData>;
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
  fieldContext,
  formComponents,
  formContext,
}: {
  readonly fieldComponents: TFieldComponents;
  readonly fieldContext: Context<AnyFieldApi>;
  readonly formComponents: TFormComponents;
  readonly formContext: Context<AnyFormApi>;
}) => {
  const formHook = createFormHook({ fieldComponents, fieldContext, formComponents, formContext });
  const useTanStackAppForm = formHook.useAppForm;

  // App forms render Standard Schema issues directly in field components. Accepting the
  // Effect schema here, rather than arbitrary TanStack validators at each call site,
  // keeps that error shape enforced and makes custom string/object validators a type error.
  const useAppForm = <TFormData, TSubmitMeta = never>({
    schema,
    ...props
  }: EffectSchemaFormOptions<TFormData, TSubmitMeta>) => {
    const form = useTanStackAppForm({
      ...props,
      validators: {
        onSubmit: toFormStandardSchema(schema),
      },
    });

    const AppField = ({
      validators: _validators,
      ...fieldProps
    }: WithoutValidators<ComponentProps<typeof form.AppField>>) =>
      createElement(form.AppField, fieldProps);

    const appForm: Omit<typeof form, 'AppField'> & { readonly AppField: typeof AppField } =
      Object.assign(form, { AppField });

    return appForm;
  };

  return { ...formHook, useAppForm };
};
