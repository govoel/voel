import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '#src/ui/lib/utils.ts';

type PluginHeaderProps = ComponentPropsWithoutRef<'header'> & {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export const PluginHeader = ({
  title,
  subtitle,
  actions,
  className,
  ...props
}: PluginHeaderProps) => (
  <header
    className={cn(
      'sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3',
      className
    )}
    {...props}>
    <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center">
      <h1 className="truncate text-sm font-semibold">{title}</h1>
      {subtitle !== void 0 ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
    {actions !== void 0 && actions !== null ? (
      <div className="flex min-w-0 shrink-0 items-center gap-2">{actions}</div>
    ) : null}
  </header>
);
