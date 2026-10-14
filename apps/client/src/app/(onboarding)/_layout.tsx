import { Stack } from 'expo-router';

export const unstable_settings = { anchor: 'welcome' };

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ presentation: 'card' }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
    </Stack>
  );
}
