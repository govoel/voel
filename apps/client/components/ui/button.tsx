import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { Pressable, View } from 'react-native';

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

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

const Button = ({
  ref,
  className,
  variant,
  size,
  ...props
}: ButtonProps & {
  ref?: React.RefObject<React.ComponentRef<typeof Pressable>>;
}) => {
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
  ...props
}: ButtonProps & {
  ref?: React.RefObject<React.ComponentRef<typeof Pressable>>;
  viewClassName?: string;
  isLoading?: boolean;
}) => {
  return (
    <View className={cn(viewClassName, 'relative')}>
      <Button ref={ref} {...props} />

      {isLoading && (
        <View className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 rounded-md">
          <Spinner size={6} />
        </View>
      )}
    </View>
  );
};
ButtonWithLoading.displayName = 'ButtonWithLoading';

export { Button, ButtonWithLoading, buttonTextVariants, buttonVariants };
export type { ButtonProps };
