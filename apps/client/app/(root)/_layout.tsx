import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AccountSelector, SubscriptionProvider } from '~/components/account-selector';
import { AuthModal } from '~/components/auth-modal';
import { PlaybackHistoryProvider } from '~/components/playback-history-provider';
import { Spinner } from '~/components/spinner';
import { Text } from '~/components/ui/text';

import { useMigrations } from '~/db/migrations';

import { instanceStore } from '~/lib/stores/instance';

export default function RootLayout() {
  return (
    <BottomSheetModalProvider>
      <DbMigrator>
        <SubscriptionProvider>
          <PlaybackHistoryProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="player"
                options={{ presentation: 'transparentModal', animation: 'none' }}
              />
            </Stack>
          </PlaybackHistoryProvider>

          <AccountSelector />
          <AuthModal />
        </SubscriptionProvider>
      </DbMigrator>
    </BottomSheetModalProvider>
  );
}

const DbMigrator = ({ children }: { children: ReactNode }) => {
  const mainDbMigration = useMigrations({ type: 'main', db: undefined });

  if (mainDbMigration.status === 'pending') {
    return (
      <View className="flex flex-1 justify-center items-center">
        <Spinner size={15} />
      </View>
    );
  }

  if (mainDbMigration.status === 'error') {
    return (
      <View className="flex flex-1 p-12 justify-center items-center">
        <Text>Main database migration failed: {mainDbMigration.error.message}</Text>
      </View>
    );
  }

  return <InstanceDbMigrator>{children}</InstanceDbMigrator>;
};

const InstanceDbMigrator = ({ children }: { children: ReactNode }) => {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const instanceDbMigration = useMigrations({ type: 'instance', db: instanceDb });

  if (instanceDbMigration.status === 'pending') {
    return (
      <View className="flex flex-1 justify-center items-center">
        <Spinner size={15} />
      </View>
    );
  }

  if (instanceDbMigration.status === 'error') {
    return (
      <View className="flex flex-1 p-12 justify-center items-center">
        <Text>Instance database migration failed: {instanceDbMigration.error.message}</Text>
      </View>
    );
  }

  return children;
};
