import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useSelector } from '@xstate/store/react';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AccountSelector, SubscriptionProvider } from '~/components/account-selector';
import { AuthModal } from '~/components/auth-modal';
import { FloatingPlayer } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { Text } from '~/components/ui/text';

import { useMigrations } from '~/db/migrations';

import { Home } from '~/lib/icons/Home';
import { Library } from '~/lib/icons/Library';
import { Settings } from '~/lib/icons/Settings';
import { instanceStore } from '~/lib/stores/instance';

export default function TabLayout() {
  return (
    <BottomSheetModalProvider>
      <DbMigrator>
        <SubscriptionProvider>
          <Tabs initialRouteName="(home)" screenOptions={{ headerShown: false }}>
            <Tabs.Screen
              name="(library)"
              options={{
                title: 'Library',
                tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
                tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
              }}
            />
            <Tabs.Screen
              name="(home)"
              options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
                tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
              }}
            />
            <Tabs.Screen
              name="settings"
              options={{
                title: 'Settings',
                tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
                tabBarLabelStyle: { fontFamily: 'Inter-Regular' },
              }}
            />
          </Tabs>
        </SubscriptionProvider>
      </DbMigrator>

      <FloatingPlayer className="absolute bottom-[50]" />

      <AccountSelector />
      <AuthModal />
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
