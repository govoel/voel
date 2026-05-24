import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { interactiveDismissDisabled } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

export default function AccountsLayout() {
  const [isPresented, setIsPresented] = useState(true);
  const { width } = useWindowDimensions();

  return (
    <Host style={{ position: 'absolute', width }}>
      <BottomSheet isPresented={isPresented} onIsPresentedChange={setIsPresented}>
        <Group modifiers={[interactiveDismissDisabled()]}>
          <RNHostView>
            <View style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  headerTransparent: true,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
