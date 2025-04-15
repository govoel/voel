import { FlashList } from '@shopify/flash-list';
import { useSelector } from '@xstate/store/react';
import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AutoMarquee } from '~/components/auto-marquee';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import api from '~/lib/api';
import { instanceStore } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

export default function LibraryScreen() {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isLoading } = api.books.list.useQuery(instanceDb, {
    withAuthors: true,
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ScrollView className="px-6">
        <View className="py-6">
          <TitleWithRefetch refetch={refetch} isLoading={isLoading}>
            All Books
          </TitleWithRefetch>
          {error ? (
            <Card>
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
          ) : data ? (
            <FlashList
              data={data}
              numColumns={2}
              renderItem={({ item, index }) => (
                <Link
                  href={{
                    pathname: '/(tabs)/(library)/book/[bookId]',
                    params: { bookId: item.id },
                  }}
                  asChild>
                  <Pressable className={cn('w-full pt-4', index % 2 === 0 ? 'pr-2' : 'pl-2')}>
                    <AspectRatio className="flex-1" ratio={1 / 1}>
                      {item.cover ? (
                        <Image
                          className="w-full h-full rounded-md"
                          source={item.cover}
                          placeholder={{ thumbhash: item.coverThumbhash }}
                        />
                      ) : null}
                    </AspectRatio>
                    <View className="pt-2">
                      <AutoMarquee spacing={20} speed={0.75}>
                        <Large className="border-none">{item.title}</Large>
                      </AutoMarquee>
                      {item.authors ? (
                        <AutoMarquee spacing={20} speed={0.75}>
                          <Muted>{item.authors.map((author) => author.name).join(', ')}</Muted>
                        </AutoMarquee>
                      ) : null}
                    </View>
                  </Pressable>
                </Link>
              )}
              keyExtractor={(item) => item.id.toString()}
              estimatedItemSize={10}
              ListEmptyComponent={() => (
                <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
                  <Text className="text-center">No books found</Text>
                </View>
              )}
            />
          ) : (
            <Card>
              <CardContent className="p-12 justify-center items-center">
                <Spinner size={15} />
              </CardContent>
            </Card>
          )}
        </View>
      </ScrollView>
    </>
  );
}
