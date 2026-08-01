import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../lib/utils.ts';
import { usePluginTheme } from './plugin-theme.tsx';
import { Button } from './ui/button.tsx';

type PluginHeaderProps = ComponentPropsWithoutRef<'header'> & {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

const ThemeSwitcher = () => {
  const { theme, setTheme } = usePluginTheme();
  return (
    <div
      aria-label="Theme switcher"
      className="flex items-center rounded-md border p-0.5"
      role="group">
      <Button
        aria-label="Use light theme"
        className="size-7"
        size="icon"
        variant={theme === 'light' ? 'secondary' : 'ghost'}
        onClick={() => {
          setTheme('light');
        }}>
        ☼
      </Button>
      <Button
        aria-label="Use dark theme"
        className="size-7"
        size="icon"
        variant={theme === 'dark' ? 'secondary' : 'ghost'}
        onClick={() => {
          setTheme('dark');
        }}>
        ☾
      </Button>
      <Button
        aria-label="Use system theme"
        className="size-7"
        size="icon"
        variant={theme === 'system' ? 'secondary' : 'ghost'}
        onClick={() => {
          setTheme('system');
        }}>
        ◐
      </Button>
    </div>
  );
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
      {subtitle !== undefined ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
    {actions !== undefined && actions !== null ? (
      <div className="flex min-w-0 shrink-0 items-center gap-2">{actions}</div>
    ) : null}
    <ThemeSwitcher />
  </header>
);
