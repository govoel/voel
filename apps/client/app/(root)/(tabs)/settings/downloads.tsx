import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AutoMarquee } from '~/components/auto-marquee';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button, ButtonWithLoading } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import api from '~/lib/api';
import { ChevronRight } from '~/lib/icons/ChevronRight';
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

  const [isResumeDownloadsLoading, setIsResumeDownloadsLoading] = useState(false);
  const [isPauseDownloadsLoading, setIsPauseDownloadsLoading] = useState(false);

  const { data, error, refetch, isFetching } = api.books.getByFileIds.useQuery(
    Object.keys(downloads ?? {})
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Downloads' }} />
      <FloatingPlayerDodgingLayout>
        <TitleWithRefetch refetch={refetch} isFetching={isFetching}>
          All Downloads
        </TitleWithRefetch>
        {downloads && Object.values(downloads).some((d) => !d.isTerminalState) ? (
          Object.values(downloads).some((d) => d.paused) ? (
            <ButtonWithLoading
              viewClassName="mt-2"
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
              viewClassName="mt-2"
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

        <Card className="mt-4">
          {error ? (
            <>
              <CardContent className="pt-4">
                <Large>Error loading books</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </>
          ) : downloadError ? (
            <>
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
            </>
          ) : data && downloads ? (
            <FlatList
              data={data}
              keyExtractor={(item) => `download-book-${item.id}`}
              scrollEnabled={false}
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
                      'flex-row native:h-20 h-16 justify-between rounded-none bg-secondary/40',
                      index !== 0 ? 'border-t border-foreground/15' : ''
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
                        <AutoMarquee spacing={20} speed={0.3}>
                          <Text>{item.title}</Text>
                        </AutoMarquee>
                        <AutoMarquee spacing={20} speed={0.3}>
                          <Muted>{item.authors.map((author) => author.name).join(', ')}</Muted>
                        </AutoMarquee>
                        <Muted>
                          {formatBytes(
                            item.files.reduce((a, c) => a + downloads[c.id].bytesDownloaded, 0)
                          )}
                        </Muted>
                      </View>
                    </View>
                    <ChevronRight className="ml-2 text-muted-foreground" size={20} />
                  </Button>
                </Link>
              )}
              ListEmptyComponent={
                <View className="flex flex-col items-center justify-center p-8">
                  <Text className="text-center">No downloads found</Text>
                </View>
              }
            />
          ) : (
            <CardContent className="p-12 justify-center items-center">
              <Spinner size={15} />
            </CardContent>
          )}
        </Card>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
