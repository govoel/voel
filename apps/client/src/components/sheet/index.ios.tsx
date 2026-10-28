import { BottomSheet } from '@expo/ui/swift-ui';
import { useReducer } from 'react';

import type { SheetComponent } from '#src/components/sheet';
import { useSheetDismissal } from '#src/components/sheet/dismissal.ts';

export const Sheet = (({ children, onDismissed }) => {
  const [presented, dismiss] = useReducer(() => false, true);
  const handleDismissed = useSheetDismissal({ onDismissed });
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
