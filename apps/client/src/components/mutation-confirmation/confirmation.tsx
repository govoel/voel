import type { ComponentType } from 'react';

export type ConfirmationComponent = ComponentType<{
  readonly state: {
    readonly presented: boolean;
    readonly busy: boolean;
    readonly feedback: string;
    readonly execute: () => Promise<void>;
    readonly handleDismiss: () => void;
    readonly handleDismissed: () => void;
  };
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly role?: 'destructive' | 'default';
}>;

export declare const Confirmation: ConfirmationComponent;
