import { Stack } from 'expo-router';

export default function AccountEntryLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
