import { Stack } from 'expo-router';

import { AccountSelectorAvatar } from '~/components/account-selector';

export default function LibraryLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerTitleStyle: { fontFamily: 'Voel-Inter-SemiBold' },
        headerRight: () => <AccountSelectorAvatar />,
      }}
    />
  );
}
