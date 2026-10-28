import { ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useEffect, useRef } from 'react';

import type { SheetComponent } from '#src/components/sheet';
import { useSheetPresentation } from '#src/components/sheet/presentation.ts';

export const Sheet = (({ children, onDismissed }) => {
  const sheet = useRef<ModalBottomSheetRef>(null);
  const { presented, dismiss, handleDismissed } = useSheetPresentation({ onDismissed });
  useEffect(() => {
    const presentation = sheet.current;
    if (presented || presentation === null) {
      return void 0;
    }
    let active = true;
    void presentation.hide().then(() => {
      if (active) {
        handleDismissed();
      }
      return void 0;
    });
    return () => {
      active = false;
    };
  }, [presented, handleDismissed]);
  return (
    <ModalBottomSheet ref={sheet} skipPartiallyExpanded onDismissRequest={handleDismissed}>
      {children({ dismiss })}
    </ModalBottomSheet>
  );
}) satisfies SheetComponent;
