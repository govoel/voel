import {
  Button,
  Column,
  TextField as ComposeTextField,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { createFormHook, createFormHookContexts, useStore } from '@tanstack/react-form';
import type { ComponentProps } from 'react';
import { useEffect, useEffectEvent } from 'react';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '#src/components/text';

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const textStyle = {
  fontFamily: 'Google Sans',
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} satisfies NonNullable<ComponentProps<typeof ComposeTextField>['textStyle']>;

const getFieldError = (errors: unknown[]): string | null => {
  const messages = errors.flatMap((error) =>
    typeof error === 'object' && error !== null && 'message' in error ? [String(error.message)] : []
  );

  return messages.length > 0 ? messages.join(', ') : null;
};

const TextField = ({
  label,
  secureTextEntry = false,
  textFieldProps,
}: {
  readonly label: string;
  readonly secureTextEntry?: boolean;
  readonly textFieldProps?: Omit<
    ComponentProps<typeof ComposeTextField>,
    'value' | 'onValueChange' | 'onFocusChanged' | 'children'
  >;
}) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);
  const error = getFieldError(field.state.meta.errors as unknown[]);
  const isError = error !== null;
  const handleValueChange = useEffectEvent((nextValue: string) => {
    'worklet';

    value.value = nextValue;
    scheduleOnRN(field.handleChange, nextValue);
  });

  useEffect(() => {
    if (value.value !== field.state.value) {
      value.value = field.state.value;
    }
  }, [field.state.value, value]);

  return (
    <ComposeTextField
      {...textFieldProps}
      value={value}
      enabled={!isSubmitting}
      singleLine
      isError={isError}
      {...(secureTextEntry ? { visualTransformation: 'password' as const } : {})}
      textStyle={textStyle}
      modifiers={[fillMaxWidth(), ...(textFieldProps?.modifiers ?? [])]}
      onValueChange={handleValueChange}
      onFocusChanged={(focused) => {
        if (!focused) {
          field.handleBlur();
        }
      }}>
      <ComposeTextField.Label>
        <Text>{label}</Text>
      </ComposeTextField.Label>
      {error !== null ? (
        <ComposeTextField.SupportingText>
          <Text variant="caption">{error}</Text>
        </ComposeTextField.SupportingText>
      ) : null}
    </ComposeTextField>
  );
};

const SecureField = (props: Omit<ComponentProps<typeof TextField>, 'secureTextEntry'>) => (
  <TextField {...props} secureTextEntry />
);

const SubmitButton = ({
  children,
  enabled: enabledProp = true,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'>) => {
  const form = useFormContext();

  return (
    <Column>
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button
            {...props}
            enabled={canSubmit && !isSubmitting && enabledProp}
            onClick={() => {
              void form.handleSubmit();
            }}>
            {children}
          </Button>
        )}
      </form.Subscribe>
    </Column>
  );
};

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    SecureField,
  },
  formComponents: {
    SubmitButton,
  },
});
