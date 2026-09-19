import type { ComponentType, ReactElement } from 'react';

export type ConfirmationComponent = ComponentType<{
  readonly state: {
    readonly presented: boolean;
    readonly busy: boolean;
    readonly feedback: string;
    readonly execute: () => Promise<void>;
    readonly handleDismiss: () => void;
  };
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly role?: 'destructive' | 'default';
  readonly trigger: ReactElement;
}>;

export declare const Confirmation: ConfirmationComponent;
