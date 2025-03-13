import { useSelector } from '@xstate/store/react';
import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { authModalStore } from '~/components/auth-modal';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Muted } from '~/components/ui/typography';

import { ChevronRight } from '~/lib/icons/ChevronRight';
import { Download } from '~/lib/icons/Download';
import { FolderCog } from '~/lib/icons/FolderCog';
import { Play } from '~/lib/icons/Play';
import { ServerCog } from '~/lib/icons/ServerCog';
import { Smartphone } from '~/lib/icons/Smartphone';
import { UserCog } from '~/lib/icons/UserCog';
import { Users } from '~/lib/icons/Users';
import { instanceStore, useAuthSession } from '~/lib/stores/instance';

export default function SettingsIndexScreen() {
  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const { data } = useAuthSession(authClient);

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <View className="gap-y-4 p-6">
        {data && (
          <View className="overflow-hidden rounded-md border border-foreground/15">
            <Link href="/settings/profile" asChild>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none bg-secondary/40">
                <View className="flex-row gap-x-2">
                  <UserCog className="text-foreground/50" size="20" />
                  <Text>Profile</Text>
                </View>
                <ChevronRight className="text-foreground/50" size="20" />
              </Button>
            </Link>
          </View>
        )}

        <View className="overflow-hidden rounded-md border border-foreground/15">
          <Link href="/settings/interface" asChild>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex-row gap-x-2">
                <Smartphone className="text-foreground/50" size="20" />
                <Text>Interface</Text>
              </View>
              <ChevronRight className="text-foreground/50" size="20" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
            <View className="flex-row gap-x-2">
              <Play className="text-foreground/50" size="20" />
              <Text>Playback</Text>
            </View>
            <ChevronRight className="text-foreground/50" size="20" />
          </Button>
          <Button variant="ghost" className="flex-row justify-between rounded-none bg-secondary/40">
            <View className="flex-row gap-x-2">
              <Download className="text-foreground/50" size="20" />
              <Text>Download</Text>
            </View>
            <ChevronRight className="text-foreground/50" size="20" />
          </Button>
        </View>

        {data && data.user.role === 'admin' && (
          <View className="overflow-hidden rounded-md border border-foreground/15">
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex-row gap-x-2">
                <ServerCog className="text-foreground/50" size="20" />
                <Text>Server</Text>
              </View>
              <ChevronRight className="text-foreground/50" size="20" />
            </Button>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex-row gap-x-2">
                <FolderCog className="text-foreground/50" size="20" />
                <Text>Manage Libraries</Text>
              </View>
              <ChevronRight className="text-foreground/50" size="20" />
            </Button>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none bg-secondary/40">
              <View className="flex-row gap-x-2">
                <Users className="text-foreground/50" size="20" />
                <Text>Manage Users</Text>
              </View>
              <ChevronRight className="text-foreground/50" size="20" />
            </Button>
          </View>
        )}

        {data ? (
          <>
            <Button
              variant="destructive"
              onPress={() => {
                authClient.signOut();
              }}>
              <Text>Sign Out</Text>
            </Button>
            <Muted className="text-center">
              Signed in as {data.user.username} ({data.user.role})
            </Muted>
          </>
        ) : (
          <Button
            onPress={() => {
              authModalStore.send({ type: 'presentAuthModal' });
            }}>
            <Text>Sign In</Text>
          </Button>
        )}
      </View>
    </>
  );
}
