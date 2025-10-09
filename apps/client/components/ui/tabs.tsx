import * as TabsPrimitive from '@rn-primitives/tabs';
import * as React from 'react';

import { TextClassContext } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = ({
  ref,
  className,
  ...props
}: TabsPrimitive.ListProps & {
  ref?: React.RefObject<TabsPrimitive.ListRef>;
}) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'native:h-12 native:px-1.5 h-10 items-center justify-center rounded-md bg-muted p-1 web:inline-flex',
      className
    )}
    {...props}
  />
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = ({
  ref,
  className,
  ...props
}: TabsPrimitive.TriggerProps & {
  ref?: React.RefObject<TabsPrimitive.TriggerRef>;
}) => {
  const { value } = TabsPrimitive.useRootContext();
  return (
    <TextClassContext
      value={cn(
        'native:text-base text-sm font-medium text-muted-foreground web:transition-all',
        value === props.value && 'text-foreground'
      )}>
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium shadow-none web:whitespace-nowrap web:ring-offset-background web:transition-all web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
          props.disabled && 'opacity-50 web:pointer-events-none',
          props.value === value && 'bg-background shadow-lg shadow-foreground/10',
          className
        )}
        {...props}
      />
    </TextClassContext>
  );
};
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = ({
  ref,
  className,
  ...props
}: TabsPrimitive.ContentProps & {
  ref?: React.RefObject<TabsPrimitive.ContentRef>;
}) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
