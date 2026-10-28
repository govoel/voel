import { BottomSheet } from '@expo/ui/swift-ui';

import type { SheetComponent } from '#src/components/sheet';
import { useSheetPresentation } from '#src/components/sheet/presentation.ts';

export const Sheet = (({ children, onDismissed }) => {
  const { presented, dismiss, handleDismissed } = useSheetPresentation({ onDismissed });
  return (
    <BottomSheet
      isPresented={presented}
      onIsPresentedChange={(visible) => {
        if (!visible) {
          dismiss();
        }
      }}
      onDismiss={handleDismissed}>
      {children({ dismiss })}
    </BottomSheet>
  );
}) satisfies SheetComponent;
