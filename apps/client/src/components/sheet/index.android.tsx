import { ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useRef } from 'react';

import type { SheetComponent } from '#src/components/sheet';
import { useSheetDismissal } from '#src/components/sheet/dismissal.ts';

export const Sheet = (({ children, onDismissed }) => {
  const sheet = useRef<ModalBottomSheetRef>(null);
  const dismissal = useRef<Promise<void> | null>(null);
  const handleDismissed = useSheetDismissal({ onDismissed });
  const dismiss = async () => {
    const presentation = sheet.current;
    if (presentation === null) {
      return;
    }
    dismissal.current ??= presentation.hide();
    await dismissal.current;
    // This opening may have unmounted while its native animation was running.
    if (sheet.current === presentation) {
      handleDismissed();
    }
  };
  return (
    <ModalBottomSheet ref={sheet} skipPartiallyExpanded onDismissRequest={handleDismissed}>
      {children({ dismiss })}
    </ModalBottomSheet>
  );
}) satisfies SheetComponent;
