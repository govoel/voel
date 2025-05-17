import { Stack } from 'expo-router';

import { AccountSelectorAvatar } from '~/components/account-selector';

export default function HomeLayout() {
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
