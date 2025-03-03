import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { RadioGroup, RadioGroupItemWithLabel } from '~/components/ui/radio-group';
import { Text } from '~/components/ui/text';

import { MoonStar } from '~/lib/icons/MoonStar';
import { Sun } from '~/lib/icons/Sun';
import { SunMoon } from '~/lib/icons/SunMoon';
import { type Theme, themeStore } from '~/lib/stores/color-scheme';

export default function InterfaceScreen() {
  const theme = useSelector(themeStore, (state) => state.context.theme);
  const onLabelPress = (theme: Theme) => () => {
    themeStore.send({ type: 'setTheme', theme });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Interface', headerTitleAlign: 'center' }} />
      <View className="p-6">
        <Text className="pb-2 text-foreground/75">Theme</Text>
        <RadioGroup
          value={theme}
          onValueChange={(value) => {
            themeStore.send({ type: 'setTheme', theme: value as Theme });
          }}
          className="gap-0 divide-y divide-foreground overflow-hidden rounded-md border border-foreground/15 bg-secondary/40">
          <RadioGroupItemWithLabel
            value="system"
            onButtonPress={onLabelPress('system')}
            buttonClassName="border-b border-foreground/15">
            <View className="flex-row gap-x-2">
              <SunMoon className="text-foreground/50" size="20" />
              <Text>System</Text>
            </View>
          </RadioGroupItemWithLabel>
          <RadioGroupItemWithLabel
            value="light"
            onButtonPress={onLabelPress('light')}
            buttonClassName="border-b border-foreground/15">
            <View className="flex-row gap-x-2">
              <Sun className="text-foreground/50" size="20" />
              <Text>Light</Text>
            </View>
          </RadioGroupItemWithLabel>
          <RadioGroupItemWithLabel value="dark" onButtonPress={onLabelPress('dark')}>
            <View className="flex-row gap-x-2">
              <MoonStar className="text-foreground/50" size="20" />
              <Text>Dark</Text>
            </View>
          </RadioGroupItemWithLabel>
        </RadioGroup>
      </View>
    </>
  );
}
