import { BottomSheet } from '@expo/ui/swift-ui';
import type { ControlledSheetComponent } from '#src/components/controlled-sheet';


/** Unmount sheet content on dismissal so reopening starts with fresh local state. */
export const ControlledSheet = (({ presented, onDismissRequest, children }) => (
  <BottomSheet
    isPresented={presented}
    onIsPresentedChange={(visible) => {
      if (!visible && presented) {
        onDismissRequest();
      }
    }}>
    {presented ? children({ close: onDismissRequest }) : null}
  </BottomSheet>
)) satisfies ControlledSheetComponent;
