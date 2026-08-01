import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils.ts';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
    {...props}
  />
);
