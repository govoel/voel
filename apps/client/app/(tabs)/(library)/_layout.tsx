import { Stack } from 'expo-router';

import { AccountSelectorAvatar } from '~/components/account-selector';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerTitleStyle: { fontFamily: 'Inter-SemiBold' },
        headerRight: () => <AccountSelectorAvatar />,
      }}
    />
  );
}
