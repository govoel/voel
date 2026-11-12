import { Host, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode, Ref } from 'react';

import { materialSeedColor } from '#src/constants/material.ts';

export const AndroidAccountsSheet = ({
  children,
  dismissable = true,
  ref,
}: {
  readonly children: ReactNode;
  readonly dismissable?: boolean;
  readonly ref?: Ref<ModalBottomSheetRef>;
}) => {
  const router = useRouter();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, [])
  );

  // Compose sheets use a native dialog window, which otherwise remains above
  // the next React Navigation screen even after this route loses focus.
  if (!focused) {
    return null;
  }

  return (
    <Host seedColor={materialSeedColor} style={{ flex: 1 }}>
      <ModalBottomSheet
        {...(ref !== null && ref !== void 0 ? { ref } : {})}
        skipPartiallyExpanded
        sheetGesturesEnabled={dismissable}
        showDragHandle={dismissable}
        properties={{
          shouldDismissOnBackPress: dismissable,
          shouldDismissOnClickOutside: dismissable,
        }}
        onDismissRequest={() => {
          if (dismissable) {
            router.back();
          }
        }}>
        {children}
      </ModalBottomSheet>
    </Host>
  );
};
