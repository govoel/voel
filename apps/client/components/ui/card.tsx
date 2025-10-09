import type { TextRef, ViewRef } from '@rn-primitives/types';
import * as React from 'react';
import { Text, type TextProps, View, type ViewProps } from 'react-native';

import { TextClassContext } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const Card = ({
  ref,
  className,
  ...props
}: ViewProps & {
  ref?: React.RefObject<ViewRef>;
}) => (
  <View
    ref={ref}
    className={cn(
      'rounded-lg border border-border bg-card shadow-sm shadow-foreground/10',
      className
    )}
    {...props}
  />
);
Card.displayName = 'Card';

const CardHeader = ({
  ref,
  className,
  ...props
}: ViewProps & {
  ref?: React.RefObject<ViewRef>;
}) => <View ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
CardHeader.displayName = 'CardHeader';

const CardTitle = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & {
  ref?: React.RefObject<TextRef>;
}) => (
  <Text
    role="heading"
    aria-level={3}
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight text-card-foreground',
      className
    )}
    {...props}
  />
);
CardTitle.displayName = 'CardTitle';

const CardDescription = ({
  ref,
  className,
  ...props
}: TextProps & {
  ref?: React.RefObject<TextRef>;
}) => (
  <Text
    ref={ref}
    className={cn('text-sm font-normal text-muted-foreground', className)}
    {...props}
  />
);
CardDescription.displayName = 'CardDescription';

const CardContent = ({
  ref,
  className,
  ...props
}: ViewProps & {
  ref?: React.RefObject<ViewRef>;
}) => (
  <TextClassContext value="text-card-foreground">
    <View ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  </TextClassContext>
);
CardContent.displayName = 'CardContent';

const CardFooter = ({
  ref,
  className,
  ...props
}: ViewProps & {
  ref?: React.RefObject<ViewRef>;
}) => (
  <View ref={ref} className={cn('flex flex-row items-center p-6 pt-0', className)} {...props} />
);
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
