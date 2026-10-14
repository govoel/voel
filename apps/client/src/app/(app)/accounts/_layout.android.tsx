import { Stack } from 'expo-router';

export default function AccountsLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: 'transparentModal',
        contentStyle: { backgroundColor: 'transparent' },
        headerShown: false,
      }}
    />
  );
}
