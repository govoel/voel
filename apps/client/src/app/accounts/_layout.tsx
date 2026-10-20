import { Stack } from 'expo-router';

import { MutationConfirmationProvider } from '#src/components/mutation-confirmation';
import { accountManagementScreenLayout } from '#src/domains/accounts/components/selected-account-boundary';

export const unstable_settings = {
  anchor: 'index',
};

export default function AccountsLayout() {
  return (
    <MutationConfirmationProvider>
      <Stack
        screenLayout={accountManagementScreenLayout}
        screenOptions={{
          headerTransparent: true,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </MutationConfirmationProvider>
  );
}
