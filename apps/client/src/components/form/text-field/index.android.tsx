import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import type { ComponentProps } from 'react';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.ts';
import type { TextFieldComponent } from '#src/components/form/text-field';
import { Text } from '#src/components/text';

const defaultTextStyle = {
  fontFamily: 'Google Sans',
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} as const satisfies NonNullable<ComponentProps<typeof ComposeTextField>['textStyle']>;

export const TextField = (({ label, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const errorMessage = field.state.meta.isTouched
    ? Array.head(field.state.meta.errors)
    : Option.none();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);

  return (
    <ComposeTextField
      {...('android' in platformProps ? platformProps.android : {})}
      textStyle={{
        ...defaultTextStyle,
        ...('android' in platformProps ? platformProps.android.textStyle : {}),
      }}
      value={value}
      onValueChange={field.handleChange}
      onFocusChanged={(focused) => {
        if (!focused) {
          field.handleBlur();
        }
      }}
      enabled={
        !isSubmitting &&
        ('android' in platformProps ? (platformProps.android.enabled ?? true) : true)
      }
      singleLine={'android' in platformProps ? (platformProps.android.singleLine ?? true) : true}
      isError={Option.isSome(errorMessage)}>
      <ComposeTextField.Label>
        <Text>{label}</Text>
      </ComposeTextField.Label>

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: ({ message }) => (
          <ComposeTextField.SupportingText>
            <Text variant="caption">{message}</Text>
          </ComposeTextField.SupportingText>
        ),
      })}
    </ComposeTextField>
  );
}) satisfies TextFieldComponent;
