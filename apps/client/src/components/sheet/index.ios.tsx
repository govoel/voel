import { BottomSheet } from '@expo/ui/swift-ui';
import { useState } from 'react';

import type { SheetComponent } from '#src/components/sheet';
import { useSheetDismissal } from '#src/components/sheet/dismissal.ts';

export const Sheet = (({ children, onDismissed }) => {
  const [presented, setPresented] = useState(true);
  const handleDismissed = useSheetDismissal({ onDismissed });
  const dismiss = () => {
    setPresented(false);
  };
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
