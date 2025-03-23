import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { RadioGroupItemWithLabel, RadioGroup as RadioGroupItems } from './radio-group';
import { Text } from './text';
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
  className,
  inputProps,
}: {
  label: string;
  className?: string;
  inputProps?: ComponentPropsWithoutRef<typeof Input>;
}) {
  const field = useFieldContext<string>();

  return (
    <View className={cn('pb-4', className)}>
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

function RadioGroup<T extends readonly [] | readonly string[]>({
  label,
  optionValues,
  optionLabels,
}: {
  label: string;
  optionValues: T;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  optionLabels: { [K in keyof T]: string };
}) {
  const field = useFieldContext<string>();

  return (
    <View className="pb-4">
      <Label className="pb-2" nativeID={field.name}>
        {label}
      </Label>
      <RadioGroupItems
        value={field.state.value}
        onValueChange={field.handleChange}
        disabled={!field.form.state.isSubmitting}
        className="gap-0 divide-y divide-foreground overflow-hidden rounded-md border border-input">
        {optionLabels.map((label, index) => (
          <RadioGroupItemWithLabel
            key={index}
            value={optionValues[index]}
            onButtonPress={() => field.handleChange(optionValues[index])}
            buttonClassName={index === 0 ? 'rounded-none' : 'rounded-none border-t border-input'}>
            <Text>{label}</Text>
          </RadioGroupItemWithLabel>
        ))}
      </RadioGroupItems>
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
  ComponentPropsWithoutRef<typeof Button> & { viewClassName?: string }
>(({ viewClassName, disabled, ...props }, ref) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting]}
      children={([canSubmit, isSubmitting]) => (
        <View className={cn(viewClassName, 'relative')}>
          <Button
            ref={ref}
            {...props}
            disabled={!canSubmit || isSubmitting || disabled}
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
    RadioGroup,
  },
  formComponents: {
    SubmitButton,
  },
});
