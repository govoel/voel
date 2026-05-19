import type { ComponentType, ReactNode } from 'react';

export type TextComponent = ComponentType<{
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption';
  children: ReactNode;
}>;

export declare const Text: TextComponent;
