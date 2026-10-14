import { useRouter, useTheme } from 'expo-router';
import { Button, Text, View } from 'react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 24,
        gap: 16,
        backgroundColor: colors.background,
      }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, color: colors.text }}>
        Welcome to Voel
      </Text>
      <Text style={{ color: colors.text }}>
        Sign in to an existing server or set up a new one to get started.
      </Text>
      <Button
        title="Sign in"
        color={colors.primary}
        onPress={() => {
          router.push('/(onboarding)/sign-in');
        }}
      />
      <Button
        title="Set up a server"
        color={colors.primary}
        onPress={() => {
          router.push('/(onboarding)/setup');
        }}
      />
    </View>
  );
}
