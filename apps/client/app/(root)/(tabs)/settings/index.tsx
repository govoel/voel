import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { authModalStore } from '~/components/auth-modal';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
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
import { useAuthInstance, useAuthSession } from '~/lib/stores/instance';

export default function SettingsIndexScreen() {
  const authInstance = useAuthInstance();
  const { data } = useAuthSession(authInstance);

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <FloatingPlayerDodgingLayout className="gap-y-4">
        {data && (
          <View className="overflow-hidden rounded-md border border-foreground/15">
            <Link href="/settings/profile" asChild push>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none bg-secondary/40">
                <View className="flex-row gap-x-2">
                  <UserCog className="text-muted-foreground" size="20" />
                  <Text>Profile</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </Link>
          </View>
        )}

        <View className="overflow-hidden rounded-md border border-foreground/15">
          <Link href="/settings/interface" asChild push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex-row gap-x-2">
                <Smartphone className="text-muted-foreground" size="20" />
                <Text>Interface</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
            <View className="flex-row gap-x-2">
              <Play className="text-muted-foreground" size="20" />
              <Text>Playback</Text>
            </View>
            <ChevronRight className="text-muted-foreground" size="20" />
          </Button>
          <Link href="/settings/downloads" asChild push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none bg-secondary/40">
              <View className="flex-row gap-x-2">
                <Download className="text-muted-foreground" size="20" />
                <Text>Downloads</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
        </View>

        {data && data.user.role === 'admin' && (
          <View className="overflow-hidden rounded-md border border-foreground/15">
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex-row gap-x-2">
                <ServerCog className="text-muted-foreground" size="20" />
                <Text>Server</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
            <Link href="/settings/manage/libraries" asChild push>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
                <View className="flex-row gap-x-2">
                  <FolderCog className="text-muted-foreground" size="20" />
                  <Text>Manage Libraries</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </Link>
            <Link href="/settings/manage/users" asChild push>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none bg-secondary/40">
                <View className="flex-row gap-x-2">
                  <Users className="text-muted-foreground" size="20" />
                  <Text>Manage Users</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </Link>
          </View>
        )}

        {data ? (
          <>
            <Button
              variant="destructive"
              onPress={() => {
                authInstance.signOut();
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
      </FloatingPlayerDodgingLayout>
    </>
  );
}
