import * as Slot from '@rn-primitives/slot';
import type { SlottableTextProps, TextRef } from '@rn-primitives/types';
import { createContext, use } from 'react';
import { Text as RNText } from 'react-native';

import { cn } from '~/lib/utils';

const TextClassContext = createContext<string | undefined>(undefined);

const Text = ({
  ref,
  className,
  asChild = false,
  ...props
}: SlottableTextProps & {
  ref?: React.RefObject<TextRef>;
}) => {
  const textClass = use(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn('text-base font-normal text-foreground web:select-text', textClass, className)}
      ref={ref}
      {...props}
    />
  );
};
Text.displayName = 'Text';

export { Text, TextClassContext };
