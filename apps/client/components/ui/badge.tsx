import * as Slot from '@rn-primitives/slot';
import type { SlottableViewProps } from '@rn-primitives/types';
import { type VariantProps, cva } from 'class-variance-authority';
import React from 'react';
import { View } from 'react-native';

import { TextClassContext } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const badgeVariants = cva(
  'web:inline-flex items-center rounded-full border border-border px-2.5 py-0.5 web:transition-colors web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary web:hover:opacity-80 active:opacity-80',
        secondary: 'border-transparent bg-secondary web:hover:opacity-80 active:opacity-80',
        destructive: 'border-transparent bg-destructive web:hover:opacity-80 active:opacity-80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const badgeTextVariants = cva('text-sm font-semibold ', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = SlottableViewProps & VariantProps<typeof badgeVariants>;

const Badge = React.forwardRef<React.ElementRef<typeof Slot.View | typeof View>, BadgeProps>(
  (props, ref) => {
    const Component = props.asChild ? Slot.View : View;
    return (
      <TextClassContext.Provider value={badgeTextVariants({ variant: props.variant })}>
        <Component
          className={cn(badgeVariants({ variant: props.variant }), props.className)}
          {...props}
          ref={ref}
        />
      </TextClassContext.Provider>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeTextVariants, badgeVariants };
export type { BadgeProps };
