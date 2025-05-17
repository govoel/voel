import * as RadioGroupPrimitive from '@rn-primitives/radio-group';
import { View } from 'react-native';

import { Button } from '~/components/ui/button';

import { cn } from '~/lib/utils';

const RadioGroup = ({
  ref,
  className,
  ...props
}: RadioGroupPrimitive.RootProps & {
  ref?: React.RefObject<RadioGroupPrimitive.RootRef>;
}) => {
  return (
    <RadioGroupPrimitive.Root className={cn('gap-2 web:grid', className)} {...props} ref={ref} />
  );
};
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = ({
  ref,
  className,
  ...props
}: RadioGroupPrimitive.ItemProps & {
  ref?: React.RefObject<RadioGroupPrimitive.ItemRef>;
}) => {
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
};
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

const RadioGroupItemWithLabel = ({
  ref,
  value,
  onButtonPress,
  buttonClassName,
  radioGroupItemClassName,
  children,
  ...props
}: RadioGroupPrimitive.ItemProps & {
  onButtonPress: React.ComponentProps<typeof Button>['onPress'];
  buttonClassName?: string;
  radioGroupItemClassName?: string;
  ref?: React.RefObject<RadioGroupPrimitive.ItemRef>;
}) => {
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
};
RadioGroupItemWithLabel.displayName = 'RadioGroupItemWithLabel';

export { RadioGroup, RadioGroupItem, RadioGroupItemWithLabel };
