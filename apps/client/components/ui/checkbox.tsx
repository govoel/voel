import * as CheckboxPrimitive from '@rn-primitives/checkbox';
import * as React from 'react';
import { Platform } from 'react-native';

import { Check } from '~/components/icons/Check';
import { Minus } from '~/components/icons/Minus';

import { cn } from '~/lib/utils';

const Checkbox = ({
  ref,
  className,
  checked,
  indeterminate = false,
  ...props
}: CheckboxPrimitive.RootProps & {
  ref?: React.RefObject<CheckboxPrimitive.RootRef>;
  checked: boolean;
  indeterminate?: boolean;
}) => {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'web:peer native:h-[20] native:w-[20] native:rounded h-4 w-4 shrink-0 rounded-sm border border-primary disabled:cursor-not-allowed disabled:opacity-50 web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
        (checked || indeterminate) && 'bg-primary',
        className
      )}
      checked={checked || indeterminate}
      {...props}>
      <CheckboxPrimitive.Indicator className={cn('h-full w-full items-center justify-center')}>
        {checked ? (
          <Check
            size={12}
            strokeWidth={Platform.OS === 'web' ? 2.5 : 3.5}
            className="text-primary-foreground"
          />
        ) : indeterminate ? (
          <Minus
            size={12}
            strokeWidth={Platform.OS === 'web' ? 2.5 : 3.5}
            className="text-primary-foreground"
          />
        ) : null}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
};
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
