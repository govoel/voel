import { BottomSheet, Column, Host, Text as UIText } from '@expo/ui';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '#src/constants/theme.ts';
import { useTheme } from '#src/hooks/use-theme.ts';

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: Spacing.three,
    width: 36,
  },
  sheetHost: {
    height: 1,
    position: 'absolute',
    width: 1,
  },
});

export const AccountAvatar = () => {
  const theme = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityLabel="Open account settings"
        accessibilityRole="button"
        hitSlop={Spacing.two}
        onPress={() => {
          setIsSettingsOpen(true);
        }}
        style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView name="person.crop.circle.fill" size={30} tintColor={theme.text} />
      </Pressable>

      <Host style={styles.sheetHost}>
        <BottomSheet
          isPresented={isSettingsOpen}
          onDismiss={() => {
            setIsSettingsOpen(false);
          }}
          testID="account-settings-sheet">
          <Column spacing={Spacing.three}>
            <UIText>Account</UIText>
            <UIText>Signed in as Voel user</UIText>
            <UIText>Settings</UIText>
            <UIText>Notifications</UIText>
            <UIText>Appearance</UIText>
            <UIText>Privacy</UIText>
          </Column>
        </BottomSheet>
      </Host>
    </>
  );
};
