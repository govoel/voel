import { BottomSheet } from '@expo/ui/swift-ui';

import type { ControlledSheetComponent } from '#src/components/controlled-sheet';

/** Unmount sheet content on dismissal so reopening starts with fresh local state. */
export const ControlledSheet = (({ presented, onDismiss, children }) => (
  <BottomSheet
    isPresented={presented}
    onIsPresentedChange={(visible) => {
      if (!visible) {
        onDismiss();
      }
    }}>
    {presented
      ? children({
          close: async () => {
            onDismiss();
          },
        })
      : null}
  </BottomSheet>
)) satisfies ControlledSheetComponent;
