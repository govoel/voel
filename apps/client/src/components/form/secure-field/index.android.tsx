import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import { useRef } from 'react';
import type { ComponentProps } from 'react';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import type { SecureFieldComponent } from '#src/components/form/secure-field';
import { Text } from '#src/components/text';

const defaultTextStyle = {
  fontFamily: 'Google Sans',
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} as const satisfies NonNullable<ComponentProps<typeof ComposeTextField>['textStyle']>;

export const SecureField = (({ label, placeholder, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const errorMessage = field.state.meta.isTouched
    ? Array.head(field.state.meta.errors)
    : Option.none();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);
  const hasFocusedRef = useRef(false);

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
        // Android Compose emits an initial unfocused event as the field mounts. Treating that
        // as a blur marks every field as touched, so whole-form onChange validation becomes
        // visible before the user has interacted with those fields.
        if (focused) {
          hasFocusedRef.current = true;
          return;
        }

        if (!hasFocusedRef.current) {
          return;
        }

        field.handleBlur();
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

      {typeof placeholder === 'string' && placeholder.length > 0 ? (
        <ComposeTextField.Placeholder>
          <Text>{placeholder}</Text>
        </ComposeTextField.Placeholder>
      ) : null}

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
}) satisfies SecureFieldComponent;
