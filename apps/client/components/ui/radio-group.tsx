import { Button } from './button';
import * as RadioGroupPrimitive from '@rn-primitives/radio-group';
import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react';
import { View } from 'react-native';

import { cn } from '~/lib/utils';

const RadioGroup = forwardRef<RadioGroupPrimitive.RootRef, RadioGroupPrimitive.RootProps>(
  ({ className, ...props }, ref) => {
    return (
      <RadioGroupPrimitive.Root className={cn('gap-2 web:grid', className)} {...props} ref={ref} />
    );
  }
);
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = forwardRef<RadioGroupPrimitive.ItemRef, RadioGroupPrimitive.ItemProps>(
  ({ className, ...props }, ref) => {
    return (
      <RadioGroupPrimitive.Item
        ref={ref}
        className={cn(
          'native:h-[18] native:w-[18] aspect-square h-[16px] w-[16px] items-center justify-center rounded-full border border-primary text-primary web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
          props.disabled && 'opacity-50 web:cursor-not-allowed',
          className
        )}
        {...props}>
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <View className="native:h-[10] native:w-[10] aspect-square h-[9px] w-[9px] rounded-full bg-primary" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    );
  }
);
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

const RadioGroupItemWithLabel = forwardRef<
  ElementRef<typeof Button>,
  ComponentPropsWithoutRef<typeof Button> & {
    value: string;
    onButtonPress: () => void;
    buttonClassName?: string;
    radioGroupItemClassName?: string;
  }
>(({ value, onButtonPress, buttonClassName, radioGroupItemClassName, children, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      {...props}
      variant="ghost"
      className={cn('flex-row items-center justify-between', buttonClassName)}
      onPress={onButtonPress}>
      <>{children}</>
      <RadioGroupItem
        aria-labelledby={`label-for-${value}`}
        value={value}
        className={radioGroupItemClassName}
      />
    </Button>
  );
});
RadioGroupItemWithLabel.displayName = 'RadioGroupItemWithLabel';

export { RadioGroup, RadioGroupItem, RadioGroupItemWithLabel };
