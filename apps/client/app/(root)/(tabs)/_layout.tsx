import {
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
  createNativeBottomTabNavigator,
} from '@bottom-tabs/react-navigation';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { withLayoutContext } from 'expo-router';
import { useUnstableNativeVariable } from 'nativewind';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingPlayer, OTAUpdateNotification } from '~/components/floating-player';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <Tabs
        initialRouteName="(home)"
        tabBarStyle={{ backgroundColor: `hsl(${useUnstableNativeVariable('--background')})` }}
        tabLabelStyle={{ fontFamily: 'Voel-Inter-Medium' }}
        tabBarActiveTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
        activeIndicatorColor={`hsl(${useUnstableNativeVariable('--muted')})`}
        disablePageAnimations={true}
        screenOptions={{ freezeOnBlur: true }}>
        <Tabs.Screen
          name="(library)"
          options={{
            title: 'Library',
            tabBarIcon: () => require('lucide-static/icons/library.svg'),
          }}
        />
        <Tabs.Screen
          name="(home)"
          options={{
            title: 'Home',
            tabBarIcon: () => require('lucide-static/icons/house.svg'),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: () => require('lucide-static/icons/settings.svg'),
          }}
        />
      </Tabs>

      <View className="absolute w-full" style={{ bottom: bottom + 80 }}>
        <FloatingPlayer />
        <OTAUpdateNotification />
      </View>
    </>
  );
}
