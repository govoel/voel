import {
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
  createNativeBottomTabNavigator,
} from '@bottom-tabs/react-navigation';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { withLayoutContext } from 'expo-router';
import { useUnstableNativeVariable } from 'nativewind';
import { View } from 'react-native';

import { FloatingPlayer, OTAUpdateNotification } from '~/components/floating-player';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

export const bottomTabBarHeightStore = createStore({
  context: {
    height: 0,
  },
  on: {
    setHeight: (context, event: { height: number }) => {
      if (context.height === event.height) return context;
      return { ...context, height: event.height };
    },
  },
});

export default function TabLayout() {
  const tabBarHeight = useSelector(bottomTabBarHeightStore, (state) => state.context.height);

  return (
    <>
      <Tabs
        initialRouteName="(home)"
        tabBarStyle={{ backgroundColor: `hsl(${useUnstableNativeVariable('--background')})` }}
        tabLabelStyle={{ fontFamily: 'VoelInter-Medium' }}
        tabBarActiveTintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
        activeIndicatorColor={`hsl(${useUnstableNativeVariable('--muted')})`}
        disablePageAnimations={true}>
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

      <View className="absolute w-full" style={{ bottom: tabBarHeight }}>
        <FloatingPlayer />
        <OTAUpdateNotification />
      </View>
    </>
  );
}
