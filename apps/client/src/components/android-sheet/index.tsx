import { Host, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

export const AndroidAccountsSheet = ({ children }: { readonly children: ReactNode }) => (
  <Host seedColor="#00AAFF" style={{ flex: 1 }}>
    <ModalBottomSheet
      skipPartiallyExpanded
      onDismissRequest={() => {
        router.back();
      }}>
      {children}
    </ModalBottomSheet>
  </Host>
);
