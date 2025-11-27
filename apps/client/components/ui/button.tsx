import { useMutation } from '@tanstack/react-query';
import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';
import { type GestureResponderEvent, Pressable, View } from 'react-native';

import { Spinner } from '~/components/spinner';
import { TextClassContext } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const buttonVariants = cva(
  'group flex items-center justify-center rounded-md web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary web:hover:opacity-90 active:opacity-90',
        destructive: 'bg-destructive web:hover:opacity-90 active:opacity-90',
        outline:
          'border border-input bg-background web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent',
        secondary: 'bg-secondary web:hover:opacity-80 active:opacity-80',
        ghost: 'web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent',
        link: 'web:underline-offset-4 web:hover:underline web:focus:underline ',
      },
      size: {
        default: 'h-10 px-4 py-2 native:h-12 native:px-5 native:py-3',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8 native:h-14',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  'web:whitespace-nowrap text-sm native:text-base font-medium text-foreground web:transition-colors',
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: 'group-active:text-accent-foreground',
        secondary: 'text-secondary-foreground group-active:text-secondary-foreground',
        ghost: 'group-active:text-accent-foreground',
        link: 'text-primary group-active:underline',
      },
      size: {
        default: '',
        sm: '',
        lg: 'native:text-lg',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = ComponentPropsWithRef<typeof Pressable> & VariantProps<typeof buttonVariants>;

const Button = ({ ref, className, variant, size, ...props }: ButtonProps) => {
  return (
    <TextClassContext
      value={cn(
        props.disabled && 'web:pointer-events-none',
        buttonTextVariants({ variant, size })
      )}>
      <Pressable
        className={cn(
          props.disabled && 'opacity-50 web:pointer-events-none',
          buttonVariants({ variant, size, className })
        )}
        ref={ref}
        role="button"
        {...props}
      />
    </TextClassContext>
  );
};
Button.displayName = 'Button';

const ButtonWithLoading = ({
  ref,
  viewClassName,
  isLoading = false,
  spinnerSize = 6,
  onPress,
  disabled,
  ...props
}: Omit<ButtonProps, 'onPress'> & {
  onPress: (event: GestureResponderEvent) => Promise<void>;
  viewClassName?: string;
  isLoading?: boolean;
  spinnerSize?: number;
}) => {
  const onPressMutation = useMutation({
    retry: 0,
    networkMode: 'always',
    mutationFn: onPress,
  });

  return (
    <View className={cn(viewClassName, 'relative')}>
      <Button
        ref={ref}
        disabled={disabled || isLoading || onPressMutation.isPending}
        onPress={(e) => onPressMutation.mutate(e)}
        {...props}
      />

      {isLoading || onPressMutation.isPending ? (
        <View className="absolute inset-0 flex w-full items-center justify-center rounded-md bg-muted/80">
          <Spinner size={spinnerSize} />
        </View>
      ) : null}
    </View>
  );
};
ButtonWithLoading.displayName = 'ButtonWithLoading';

export { Button, ButtonWithLoading, buttonTextVariants, buttonVariants };
export type { ButtonProps };
