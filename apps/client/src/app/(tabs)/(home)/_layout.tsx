import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
