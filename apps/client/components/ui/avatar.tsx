import * as AvatarPrimitive from '@rn-primitives/avatar';
import * as React from 'react';

import { cn } from '~/lib/utils';

const AvatarPrimitiveRoot = AvatarPrimitive.Root;
const AvatarPrimitiveImage = AvatarPrimitive.Image;
const AvatarPrimitiveFallback = AvatarPrimitive.Fallback;

const Avatar = ({
  ref,
  className,
  ...props
}: AvatarPrimitive.RootProps & {
  ref?: React.RefObject<AvatarPrimitive.RootRef>;
}) => (
  <AvatarPrimitiveRoot
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
);
Avatar.displayName = AvatarPrimitiveRoot.displayName;

const AvatarImage = ({
  ref,
  className,
  ...props
}: AvatarPrimitive.ImageProps & {
  ref?: React.RefObject<AvatarPrimitive.ImageRef>;
}) => (
  <AvatarPrimitiveImage
    ref={ref}
    className={cn('aspect-square h-full w-full', className)}
    {...props}
  />
);
AvatarImage.displayName = AvatarPrimitiveImage.displayName;

const AvatarFallback = ({
  ref,
  className,
  ...props
}: AvatarPrimitive.FallbackProps & {
  ref?: React.RefObject<AvatarPrimitive.FallbackRef>;
}) => (
  <AvatarPrimitiveFallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted',
      className
    )}
    {...props}
  />
);
AvatarFallback.displayName = AvatarPrimitiveFallback.displayName;

export { Avatar, AvatarFallback, AvatarImage };
