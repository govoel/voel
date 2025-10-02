import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useUnstableNativeVariable } from 'nativewind';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingPlayer, OTAUpdateNotification } from '~/components/floating-player';

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <NativeTabs
        backgroundColor={`hsl(${useUnstableNativeVariable('--background')})`}
        indicatorColor={`hsl(${useUnstableNativeVariable('--muted')})`}
        tintColor={`hsl(${useUnstableNativeVariable('--foreground')})`}
        iconColor={`hsl(${useUnstableNativeVariable('--muted-foreground')})`}
        labelStyle={{
          color: `hsl(${useUnstableNativeVariable('--muted-foreground')})`,
          fontFamily: 'Voel-Inter-Medium',
        }}>
        <NativeTabs.Trigger name="(library)">
          <Label>Library</Label>
          <Icon sf="books.vertical" drawable="native_tab_icon_library" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(home)">
          <Label>Home</Label>
          <Icon sf="house" drawable="native_tab_icon_house" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Label>Settings</Label>
          <Icon sf="gear" drawable="native_tab_icon_settings" />
        </NativeTabs.Trigger>
      </NativeTabs>

      <View className="absolute w-full" style={{ bottom: bottom + 80 }}>
        <FloatingPlayer />
        <OTAUpdateNotification />
      </View>
    </>
  );
}
