import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { useStore } from '@tanstack/react-form';
import type { ComponentProps } from 'react';

import { useFormContext, useStandardSchemaFieldContext } from '#src/components/form/hooks.ts';
import type { SecureFieldComponent } from '#src/components/form/secure-field';
import { Text } from '#src/components/text';

const defaultTextStyle = {
  fontFamily: 'Google Sans',
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} as const satisfies NonNullable<ComponentProps<typeof ComposeTextField>['textStyle']>;

export const SecureField = (({ label, platformProps = {} }) => {
  const field = useStandardSchemaFieldContext<string>();
  const form = useFormContext();
  const isError = field.state.meta.isTouched && field.state.meta.errors.length > 0;
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);

  return (
    <ComposeTextField
      {...('android' in platformProps ? platformProps.android : {})}
      textStyle={{
        ...defaultTextStyle,
        ...('android' in platformProps ? platformProps.android.textStyle : {}),
      }}
      visualTransformation="password"
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
      isError={isError}>
      <ComposeTextField.Label>
        <Text>{label}</Text>
      </ComposeTextField.Label>
      {isError ? (
        <ComposeTextField.SupportingText>
          <Text variant="caption">
            {field.state.meta.errors.map((error) => error.message).join(', ')}
          </Text>
        </ComposeTextField.SupportingText>
      ) : null}
    </ComposeTextField>
  );
}) satisfies SecureFieldComponent;
