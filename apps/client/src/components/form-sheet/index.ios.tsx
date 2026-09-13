import { BottomSheet } from '@expo/ui/swift-ui';

import type { FormSheetProps } from './props.ts';

/** Dismissal unmounts the editor, so reopening never restores sensitive form state. */
export const FormSheet = ({ open, onOpenChange, children }: FormSheetProps) => (
  <BottomSheet isPresented={open} onIsPresentedChange={onOpenChange}>
    {open
      ? children(async () => {
          onOpenChange(false);
        })
      : null}
  </BottomSheet>
);
