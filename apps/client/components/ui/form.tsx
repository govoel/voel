import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Spinner } from '~/components/spinner';

import { cn } from '~/lib/utils';

function FormFieldMessage({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Animated.Text>) {
  return (
    <Animated.Text
      entering={FadeInUp.duration(100)}
      exiting={FadeOutUp.duration(100)}
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}>
      {children}
    </Animated.Text>
  );
}

function TextField({
  label,
  inputProps,
}: {
  label: string;
  inputProps?: ComponentPropsWithoutRef<typeof Input>;
}) {
  const field = useFieldContext<string>();

  return (
    <View className="pb-4">
      <Label className="pb-2" nativeID={field.name}>
        {label}
      </Label>
      <Input
        {...inputProps}
        editable={!field.form.state.isSubmitting}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChangeText={field.handleChange}
      />
      {field.state.meta.isTouched && field.state.meta.errors.length ? (
        <FormFieldMessage className="pt-2">
          {field.state.meta.errors.map((error) => error.message).join(', ')}
        </FormFieldMessage>
      ) : null}
    </View>
  );
}

const SubmitButton = forwardRef<
  React.ElementRef<typeof Button>,
  ComponentPropsWithoutRef<typeof Button>
>((props, ref) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting]}
      children={([canSubmit, isSubmitting]) => (
        <View className="relative">
          <Button
            ref={ref}
            {...props}
            disabled={!canSubmit || isSubmitting}
            onPress={() => form.handleSubmit()}
          />

          {isSubmitting && (
            <View className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 rounded-md">
              <Spinner size={6} />
            </View>
          )}
        </View>
      )}
    />
  );
});
SubmitButton.displayName = 'SubmitButton';

export const { fieldContext, formContext, useFormContext, useFieldContext } =
  createFormHookContexts();

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
  },
  formComponents: {
    SubmitButton,
  },
});
