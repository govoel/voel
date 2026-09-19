import { ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useRef } from 'react';

import type { ControlledSheetComponent } from '#src/components/controlled-sheet';

export const ControlledSheet = (({ presented, onDismiss, children }) => {
  const sheet = useRef<ModalBottomSheetRef>(null);
  return presented ? (
    <ModalBottomSheet ref={sheet} skipPartiallyExpanded onDismissRequest={onDismiss}>
      {children({
        close: async () => {
          await sheet.current?.hide();
          onDismiss();
        },
      })}
    </ModalBottomSheet>
  ) : null;
}) satisfies ControlledSheetComponent;
