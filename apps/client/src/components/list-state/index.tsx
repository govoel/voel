import type { ComponentType } from 'react';

export type ListStateComponent = ComponentType<
  | { readonly kind: 'loading' }
  | { readonly kind: 'message'; readonly message: string }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly onRetry: () => void;
      readonly retrying: boolean;
    }
>;

export declare const ListState: ListStateComponent;
