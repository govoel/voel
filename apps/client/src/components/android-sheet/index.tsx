import { Host, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { router } from 'expo-router';
import type { ReactNode, Ref } from 'react';

export const AndroidAccountsSheet = ({
  children,
  ref,
}: {
  readonly children: ReactNode;
  readonly ref?: Ref<ModalBottomSheetRef>;
}) => (
  <Host seedColor="#00AAFF" style={{ flex: 1 }}>
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
