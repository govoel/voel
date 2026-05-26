import {
  Button,
  Label,
  SecureField as SwiftSecureField,
  TextField as SwiftTextField,
  VStack,
  useNativeState,
} from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { createFormHook, createFormHookContexts, useStore } from '@tanstack/react-form';
import type { ComponentProps } from 'react';
import { useEffect, useEffectEvent } from 'react';
import { PlatformColor } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';

import { iosTextStyle } from '#modules/design-system';
import { Spacing } from '#src/constants/theme.ts';

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const getFieldError = (errors: unknown[]): string | null => {
  const messages = errors.flatMap((error) =>
    typeof error === 'object' && error !== null && 'message' in error ? [String(error.message)] : []
  );

  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldMessage = ({ children }: { readonly children: string }) => (
  <Label
    title={children}
    modifiers={[iosTextStyle('caption'), foregroundStyle(PlatformColor('systemRed'))]}
  />
);

const TextField = ({
  label,
  placeholder = label,
  modifiers = [],
  textFieldProps,
}: {
  readonly label: string;
  readonly placeholder?: string;
  readonly modifiers?: ComponentProps<typeof SwiftTextField>['modifiers'];
  readonly textFieldProps?: Omit<
    ComponentProps<typeof SwiftTextField>,
    'text' | 'placeholder' | 'onTextChange' | 'onFocusChange' | 'modifiers'
  >;
}) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const text = useNativeState(field.state.value);
  const error = getFieldError(field.state.meta.errors as unknown[]);
  const handleTextChange = useEffectEvent((nextText: string) => {
    'worklet';

    text.value = nextText;
    scheduleOnRN(field.handleChange, nextText);
  });

  useEffect(() => {
    if (text.value !== field.state.value) {
      text.value = field.state.value;
    }
  }, [field.state.value, text]);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <SwiftTextField
        {...textFieldProps}
        text={text}
        placeholder={placeholder}
        modifiers={[...modifiers, disabled(isSubmitting)]}
        onTextChange={handleTextChange}
        onFocusChange={(focused) => {
          if (!focused) {
            field.handleBlur();
          }
        }}
      />
      {error !== null ? <FieldMessage>{error}</FieldMessage> : null}
    </VStack>
  );
};

const SecureField = ({
  label,
  placeholder = label,
  modifiers = [],
  secureFieldProps,
}: {
  readonly label: string;
  readonly placeholder?: string;
  readonly modifiers?: ComponentProps<typeof SwiftSecureField>['modifiers'];
  readonly secureFieldProps?: Omit<
    ComponentProps<typeof SwiftSecureField>,
    'text' | 'placeholder' | 'onTextChange' | 'onFocusChange' | 'modifiers'
  >;
}) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const text = useNativeState(field.state.value);
  const error = getFieldError(field.state.meta.errors as unknown[]);
  const handleTextChange = useEffectEvent((nextText: string) => {
    'worklet';

    text.value = nextText;
    scheduleOnRN(field.handleChange, nextText);
  });

  useEffect(() => {
    if (text.value !== field.state.value) {
      text.value = field.state.value;
    }
  }, [field.state.value, text]);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <SwiftSecureField
        {...secureFieldProps}
        text={text}
        placeholder={placeholder}
        modifiers={[...modifiers, disabled(isSubmitting)]}
        onTextChange={handleTextChange}
        onFocusChange={(focused) => {
          if (!focused) {
            field.handleBlur();
          }
        }}
      />
      {error !== null ? <FieldMessage>{error}</FieldMessage> : null}
    </VStack>
  );
};

const SubmitButton = ({
  modifiers = [],
  children,
  disabled: disabledProp,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onPress' | 'modifiers' | 'children'> & {
  readonly children: NonNullable<ComponentProps<typeof Button>['children']>;
  readonly modifiers?: ComponentProps<typeof Button>['modifiers'];
  readonly disabled?: boolean;
}) => {
  const form = useFormContext();

  return (
    <VStack spacing={Spacing.one}>
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button
            {...props}
            modifiers={[...modifiers, disabled(!canSubmit || isSubmitting || disabledProp)]}
            onPress={() => {
              void form.handleSubmit();
            }}>
            {children}
          </Button>
        )}
      </form.Subscribe>
    </VStack>
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
