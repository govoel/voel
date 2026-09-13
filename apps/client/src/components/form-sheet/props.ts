import type { ReactNode } from 'react';

export interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (close: () => Promise<void>) => ReactNode;
}
