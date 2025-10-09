import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import { AccountSelectorAvatar } from '~/components/account-selector';

import { bottomTabBarHeightStore } from '~/app/(root)/(tabs)/_layout';

export const unstable_settings = {
  anchor: 'index',
};

export default function SettingsLayout() {
  const tabBarHeight = useBottomTabBarHeight();

  useEffect(() => {
    bottomTabBarHeightStore.trigger.setHeight({ height: tabBarHeight });
  }, [tabBarHeight]);

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
