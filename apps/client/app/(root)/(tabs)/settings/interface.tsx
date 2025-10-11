import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { MoonStar } from '~/components/icons/MoonStar';
import { Sun } from '~/components/icons/Sun';
import { SunMoon } from '~/components/icons/SunMoon';
import { RadioGroup, RadioGroupItemWithLabel } from '~/components/ui/radio-group';
import { Text } from '~/components/ui/text';

import { type Theme, themeStore } from '~/lib/stores/color-scheme';

export default function InterfaceScreen() {
  const theme = useSelector(themeStore, (state) => state.context.theme);
  const onLabelPress = (theme: Theme) => () => {
    themeStore.send({ type: 'setTheme', theme });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Interface', headerTitleAlign: 'center' }} />
      <FloatingPlayerDodgingScrollView>
        <Text className="pb-2 text-foreground/75">Theme</Text>
        <RadioGroup
          value={theme}
          onValueChange={(value) => {
            themeStore.send({ type: 'setTheme', theme: value as Theme });
          }}
          className="gap-0 divide-y divide-foreground overflow-hidden rounded-md bg-secondary/40">
          <RadioGroupItemWithLabel
            value="system"
            onButtonPress={onLabelPress('system')}
            buttonClassName="rounded-none border-b border-foreground/15">
            <View className="flex-row gap-x-2">
              <SunMoon className="text-muted-foreground" size="20" />
              <Text>System</Text>
            </View>
          </RadioGroupItemWithLabel>
          <RadioGroupItemWithLabel
            value="light"
            onButtonPress={onLabelPress('light')}
            buttonClassName="rounded-none border-b border-foreground/15">
            <View className="flex-row gap-x-2">
              <Sun className="text-muted-foreground" size="20" />
              <Text>Light</Text>
            </View>
          </RadioGroupItemWithLabel>
          <RadioGroupItemWithLabel
            value="dark"
            onButtonPress={onLabelPress('dark')}
            buttonClassName="rounded-none">
            <View className="flex-row gap-x-2">
              <MoonStar className="text-muted-foreground" size="20" />
              <Text>Dark</Text>
            </View>
          </RadioGroupItemWithLabel>
        </RadioGroup>
      </FloatingPlayerDodgingScrollView>
    </>
  );
}
