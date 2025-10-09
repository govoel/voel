import { useTheme } from '@react-navigation/native';
import { type VariantProps, cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const alertVariants = cva(
  'flex flex-row bg-background w-full rounded-lg border border-border p-4 shadow shadow-foreground/10',
  {
    variants: {
      variant: {
        default: '',
        destructive: 'border-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = ({
  ref,
  className,
  variant,
  children,
  icon: Icon,
  iconSize = 18,
  iconClassName,
  ...props
}: React.ComponentPropsWithRef<typeof View> &
  VariantProps<typeof alertVariants> & {
    icon: LucideIcon;
    iconSize?: number;
    iconClassName?: string;
  }) => {
  const { colors } = useTheme();
  return (
    <View ref={ref} role="alert" className={alertVariants({ variant, className })} {...props}>
      <Icon
        className="mt-0.5"
        size={iconSize}
        color={variant === 'destructive' ? colors.notification : colors.text}
      />
      <View className="flex-1">{children}</View>
    </View>
  );
};
Alert.displayName = 'Alert';

const AlertTitle = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  ref?: React.RefObject<React.ComponentRef<typeof Text>>;
}) => (
  <Text
    ref={ref}
    className={cn('pl-2 text-base font-medium text-foreground', className)}
    {...props}
  />
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  ref?: React.RefObject<React.ComponentRef<typeof Text>>;
}) => (
  <Text
    ref={ref}
    className={cn('mt-1 pl-2 text-sm leading-relaxed text-foreground', className)}
    {...props}
  />
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
