import { Host, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useRouter } from 'expo-router';
import type { ReactNode, Ref } from 'react';

import { materialSeedColor } from '#src/constants/material.ts';

export const AndroidAccountsSheet = ({
  children,
  ref,
}: {
  readonly children: ReactNode;
  readonly ref?: Ref<ModalBottomSheetRef>;
}) => {
  const router = useRouter();

  return (
    <Host seedColor={materialSeedColor} style={{ flex: 1 }}>
      <ModalBottomSheet
        {...(ref ? { ref } : {})}
        skipPartiallyExpanded
        onDismissRequest={() => {
          router.back();
        }}>
        {children}
      </ModalBottomSheet>
    </Host>
  );
};
