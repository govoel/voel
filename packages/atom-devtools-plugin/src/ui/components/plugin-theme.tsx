import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { cn } from '#src/ui/lib/utils.ts';

export type PluginThemeName = 'light' | 'dark' | 'system';

interface PluginThemeContextValue {
  theme: PluginThemeName;
  setTheme: (theme: PluginThemeName) => void;
}

const PluginThemeContext = createContext<PluginThemeContextValue | null>(null);

export type PluginThemeProps = ComponentPropsWithoutRef<'div'> & {
  defaultTheme?: PluginThemeName;
  children?: ReactNode;
};

export const PluginTheme = ({
  defaultTheme = 'system',
  className,
  children,
  ...props
}: PluginThemeProps) => {
  const [theme, setTheme] = useState<PluginThemeName>(defaultTheme);
  const [systemIsDark, setSystemIsDark] = useState(false);
  const isDark = theme === 'dark' || (theme === 'system' && systemIsDark);

  useEffect(() => {
    const media =
      typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(prefers-color-scheme: dark)')
        : void 0;
    const update = () => {
      if (media !== void 0) {
        setSystemIsDark(media.matches);
      }
    };
    if (media !== void 0) {
      update();
      media.addEventListener('change', update);
    }
    return () => {
      if (media !== void 0) {
        media.removeEventListener('change', update);
      }
    };
  }, []);

  useEffect(() => {
    globalThis.document.documentElement.classList.toggle('dark', isDark);
    globalThis.document.documentElement.dataset['theme'] = isDark ? 'dark' : 'light';
  }, [isDark]);

  const context = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <PluginThemeContext.Provider value={context}>
      <div className={cn(isDark && 'dark', 'min-h-0', className)} {...props}>
        {children}
      </div>
    </PluginThemeContext.Provider>
  );
};

export const usePluginTheme = (): PluginThemeContextValue => {
  const context = useContext(PluginThemeContext);
  if (context === null) {
    throw new Error('usePluginTheme must be used within PluginTheme.');
  }
  return context;
};
