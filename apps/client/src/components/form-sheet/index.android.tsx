import { ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useState } from 'react';

import type { FormSheetProps } from './props.ts';

/** Keep content mounted through the hide animation, then discard its form state. */
export const FormSheet = ({ open, onOpenChange, children }: FormSheetProps) => {
  const [sheet, setSheet] = useState<ModalBottomSheetRef | null>(null);
  const close = async () => {
    await sheet?.hide();
    onOpenChange(false);
  };
  return open ? (
    <ModalBottomSheet
      ref={setSheet}
      skipPartiallyExpanded
      onDismissRequest={() => {
        onOpenChange(false);
      }}>
      {children(close)}
    </ModalBottomSheet>
  ) : null;
};
