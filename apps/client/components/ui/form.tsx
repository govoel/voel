import { useBottomSheetInternal } from '@gorhom/bottom-sheet';
import { createFormHook, createFormHookContexts, useStore } from '@tanstack/react-form';
import { type ComponentPropsWithRef, type ComponentPropsWithoutRef, useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { ButtonWithLoading } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  RadioGroupItemWithLabel,
  RadioGroup as RadioGroupItems,
} from '~/components/ui/radio-group';
import { Text } from '~/components/ui/text';

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
  label = '',
  className,
  inputProps,
}: {
  label?: string;
  className?: string;
  inputProps?: ComponentPropsWithoutRef<typeof Input>;
}) {
  const field = useFieldContext<string>();

  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  const { shouldHandleKeyboardEvents } = useBottomSheetInternal();

  useEffect(() => {
    return () => {
      shouldHandleKeyboardEvents.value = false;
    };
  }, [shouldHandleKeyboardEvents]);

  return (
    <View className={cn('pb-4', className)}>
      {label.length > 0 && (
        <Label className="pb-2" nativeID={field.name}>
          {label}
        </Label>
      )}
      <Input
        {...inputProps}
        editable={!isSubmitting}
        value={field.state.value}
        onFocus={() => {
          shouldHandleKeyboardEvents.value = true;
        }}
        onBlur={() => {
          shouldHandleKeyboardEvents.value = false;
          field.handleBlur();
        }}
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

  optionLabels: { [K in keyof T]: string };
}) {
  const field = useFieldContext<string>();

  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return (
    <View className="pb-4">
      <Label className="pb-2" nativeID={field.name}>
        {label}
      </Label>
      <RadioGroupItems
        value={field.state.value}
        onValueChange={field.handleChange}
        disabled={!isSubmitting}
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

const SubmitButton = ({
  ref,
  viewClassName,
  disabled,
  ...props
}: ComponentPropsWithRef<typeof ButtonWithLoading> & { viewClassName?: string }) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting]}
      children={([canSubmit, isSubmitting]) => (
        <ButtonWithLoading
          ref={ref}
          {...props}
          disabled={!canSubmit || isSubmitting || disabled}
          onPress={() => form.handleSubmit()}
          isLoading={isSubmitting}
        />
      )}
    />
  );
};
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
