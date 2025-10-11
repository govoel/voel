import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { authModalStore } from '~/components/auth-modal';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { Download } from '~/components/icons/Download';
import { FolderCog } from '~/components/icons/FolderCog';
import { Info } from '~/components/icons/Info';
import { Play } from '~/components/icons/Play';
import { ServerCog } from '~/components/icons/ServerCog';
import { Smartphone } from '~/components/icons/Smartphone';
import { UserCog } from '~/components/icons/UserCog';
import { Users } from '~/components/icons/Users';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Muted } from '~/components/ui/typography';

import { useAuthInstance, useAuthSession } from '~/lib/stores/instance';

export default function SettingsIndexScreen() {
  const authInstance = useAuthInstance();
  const { data } = useAuthSession(authInstance);

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <FloatingPlayerDodgingScrollView className="gap-y-4">
        {data && (
          <View className="overflow-hidden rounded-md">
            <Link href="/settings/profile" asChild push>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none bg-secondary/40">
                <View className="flex flex-row items-center justify-center gap-x-2">
                  <UserCog className="text-muted-foreground" size="20" />
                  <Text>Profile</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </Link>
          </View>
        )}

        <View className="overflow-hidden rounded-md">
          <Link href="/settings/interface" asChild push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <Smartphone className="text-muted-foreground" size="20" />
                <Text>Interface</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
            <View className="flex flex-row items-center justify-center gap-x-2">
              <Play className="text-muted-foreground" size="20" />
              <Text>Playback</Text>
            </View>
            <ChevronRight className="text-muted-foreground" size="20" />
          </Button>
          <Link href="/settings/downloads" asChild push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none bg-secondary/40">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <Download className="text-muted-foreground" size="20" />
                <Text>Downloads</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
        </View>

        {data && data.user.role === 'admin' && (
          <View className="overflow-hidden rounded-md">
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <ServerCog className="text-muted-foreground" size="20" />
                <Text>Server</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
            <Link href="/settings/manage/libraries" asChild push>
              <Button
                variant="ghost"
                className="flex-row justify-between rounded-none border-b border-foreground/15 bg-secondary/40">
                <View className="flex flex-row items-center justify-center gap-x-2">
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
                <View className="flex flex-row items-center justify-center gap-x-2">
                  <Users className="text-muted-foreground" size="20" />
                  <Text>Manage Users</Text>
                </View>
                <ChevronRight className="text-muted-foreground" size="20" />
              </Button>
            </Link>
          </View>
        )}

        <View className="overflow-hidden rounded-md">
          <Link href="/settings/app-info" asChild push>
            <Button
              variant="ghost"
              className="flex-row justify-between rounded-none bg-secondary/40">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <Info className="text-muted-foreground" size="20" />
                <Text>App Info</Text>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
        </View>

        {data ? (
          <View className="gap-y-2">
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
          </View>
        ) : (
          <Button
            onPress={() => {
              authModalStore.send({ type: 'presentAuthModal' });
            }}>
            <Text>Sign In</Text>
          </Button>
        )}
      </FloatingPlayerDodgingScrollView>
    </>
  );
}
