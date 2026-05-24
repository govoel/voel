import type { ComponentType, ReactNode } from 'react';

export interface TextModifier {
  $type: string;
  $scope?: string;
  [key: string]: unknown;
}

export type TextComponent = ComponentType<{
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption';
  color?: string;
  modifiers?: TextModifier[];
  children: ReactNode;
}>;

export declare const Text: TextComponent;
