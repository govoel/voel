import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Tabs } from 'expo-router';

import { AccountSelector } from '~/components/account-selector';
import { AuthModal } from '~/components/auth-modal';

import { Home } from '~/lib/icons/Home';
import { Library } from '~/lib/icons/Library';
import { Settings } from '~/lib/icons/Settings';

export default function TabLayout() {
  return (
    <BottomSheetModalProvider>
      <Tabs initialRouteName="(home)" screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
          }}
        />
        <Tabs.Screen
          name="(home)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
          }}
        />
      </Tabs>

      <AccountSelector />
      <AuthModal />
    </BottomSheetModalProvider>
  );
}
