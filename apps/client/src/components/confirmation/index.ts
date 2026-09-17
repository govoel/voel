import type { ComponentType, ReactElement } from 'react';

import type { useConfirmation } from '#src/components/confirmation/use-confirmation.ts';

export type ConfirmationComponent = ComponentType<{
  readonly state: ReturnType<typeof useConfirmation>;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly role?: 'destructive' | 'default';
  readonly trigger: ReactElement;
}>;

export declare const Confirmation: ConfirmationComponent;
