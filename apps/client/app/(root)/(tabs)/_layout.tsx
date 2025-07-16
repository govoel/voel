import { Tabs } from 'expo-router';

import { FloatingPlayer } from '~/components/floating-player';
import { Home } from '~/components/icons/Home';
import { Library } from '~/components/icons/Library';
import { Settings } from '~/components/icons/Settings';

export default function TabLayout() {
  return (
    <>
      <Tabs initialRouteName="(home)" screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="(library)"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Voel-Inter-Regular' },
          }}
        />
        <Tabs.Screen
          name="(home)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Voel-Inter-Regular' },
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
            tabBarLabelStyle: { fontFamily: 'Voel-Inter-Regular' },
          }}
        />
      </Tabs>

      <FloatingPlayer className="absolute bottom-[50]" />
    </>
  );
}
