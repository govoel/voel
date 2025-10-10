import { FlashList } from '@shopify/flash-list';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button, ButtonWithLoading } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import api from '~/lib/api';
import { useAuthInstance, useInstanceId } from '~/lib/stores/instance';
import { cn, formatBytes } from '~/lib/utils';

import Player, { useDownloadStatus } from '~/modules/voel-audio';

export default function SettingsDownloadsScreen() {
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const {
    data: downloads,
    error: downloadError,
    refetch: refetchDownloadsStatus,
  } = useDownloadStatus(instanceId);
  const tabBarHeight = useBottomTabBarHeight();

  const [isResumeDownloadsLoading, setIsResumeDownloadsLoading] = useState(false);
  const [isPauseDownloadsLoading, setIsPauseDownloadsLoading] = useState(false);

  const { data, error, refetch, isFetching } = api.books.getByFileIds.useQuery(
    Object.keys(downloads ?? {})
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Downloads' }} />
      <FlashList
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
              All Downloads
            </TitleWithRefetch>
            {downloads && Object.values(downloads).some((d) => !d.isTerminalState) ? (
              Object.values(downloads).some((d) => d.paused) ? (
                <ButtonWithLoading
                  viewClassName="mb-2"
                  variant="secondary"
                  isLoading={isResumeDownloadsLoading}
                  onPress={() => {
                    setIsResumeDownloadsLoading(true);
                    setIsPauseDownloadsLoading(false);
                    Player.setCookie(authInstance.getCookie());
                    Player.resumeDownloads();
                  }}>
                  <Text>Resume all downloads</Text>
                </ButtonWithLoading>
              ) : (
                <ButtonWithLoading
                  viewClassName="mb-2"
                  variant="secondary"
                  isLoading={isPauseDownloadsLoading}
                  onPress={() => {
                    setIsPauseDownloadsLoading(true);
                    setIsResumeDownloadsLoading(false);
                    Player.pauseDownloads();
                  }}>
                  <Text>Pause all downloads</Text>
                </ButtonWithLoading>
              )
            ) : null}
            {error ? (
              <Card className="mb-2">
                <CardContent className="pt-4">
                  <Large>Error loading books</Large>
                  <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onPress={() => refetch()}>
                    <Text>Retry</Text>
                  </Button>
                </CardFooter>
              </Card>
            ) : null}
            {downloadError ? (
              <Card className="mb-2">
                <CardContent className="pt-4">
                  <Large>Error loading downloads</Large>
                  <Text className="text-muted-foreground">
                    {downloadError.message || 'Unknown error'}
                  </Text>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onPress={() => refetchDownloadsStatus()}>
                    <Text>Retry</Text>
                  </Button>
                </CardFooter>
              </Card>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !error && !downloadError && !data && !downloads ? (
            <View className="items-center justify-center p-12">
              <Spinner size={15} />
            </View>
          ) : (
            <View className="mb-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-muted px-8 py-16">
              <Text className="text-center">No downloads found</Text>
            </View>
          )
        }
        data={data && downloads ? data : []}
        keyExtractor={(item) => `download-book-${item.id}`}
        renderItem={({ item, index }) => (
          <Link
            href={{
              pathname: '/book/[bookId]',
              params: { bookId: item.id },
            }}
            asChild
            push
            withAnchor>
            <Button
              variant="ghost"
              className={cn(
                'native:h-20 h-16 flex-row justify-between rounded-none border border-b-0 border-foreground/15 bg-secondary/40',
                index === 0 ? 'rounded-t-md' : '',
                index === data!.length - 1 ? 'rounded-b-md border-b' : ''
              )}>
              <View className="flex-1 flex-row items-center justify-center gap-x-2">
                <AspectRatio ratio={1 / 1} className="h-full">
                  <Image
                    className="h-full w-full rounded-md"
                    source={{
                      uri: item.cover ?? undefined,
                      thumbhash: item.coverThumbhash ?? undefined,
                    }}
                  />
                </AspectRatio>
                <View className="flex-1">
                  <Text numberOfLines={1}>{item.title}</Text>
                  <Muted numberOfLines={1}>
                    {item.authors.map((author) => author.name).join(', ')}
                  </Muted>
                  <Muted>
                    {formatBytes(
                      item.files.reduce((a, c) => a + (downloads?.[c.id].bytesDownloaded ?? 0), 0)
                    )}
                  </Muted>
                </View>
              </View>
              <ChevronRight className="ml-2 text-muted-foreground" size={20} />
            </Button>
          </Link>
        )}
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />
    </>
  );
}
