import { Stack } from 'expo-router';

export default function AccountEntryLayout() {
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
