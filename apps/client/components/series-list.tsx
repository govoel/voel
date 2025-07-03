import { Link } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn } from '~/lib/utils';

export function SeriesList({
  series,
  direction = 'vertical',
  className,
}: {
  series: {
    id: number;
    name: string;
    books: { id: number; cover: string | null; coverThumbhash: string | null }[];
  }[];
  direction?: 'horizontal' | 'vertical';
  className?: string;
}) {
  if (series.length === 0) {
    return (
      <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
        <Text className="text-center">No series found</Text>
      </View>
    );
  }

  return (
    <FlatList
      className={className}
      data={series}
      keyExtractor={(item) => item.id.toString()}
      scrollEnabled={direction === 'horizontal'}
      horizontal={direction === 'horizontal'}
      numColumns={direction === 'vertical' ? 2 : undefined}
      renderItem={({ item, index }) => (
        <Link
          href={{
            pathname: '/series/[seriesId]',
            params: { seriesId: item.id },
          }}
          asChild
          push
          withAnchor>
          <Pressable
            className={cn(
              'h-full',
              direction === 'vertical' ? (index > 1 ? 'pt-4 w-1/2' : 'w-1/2') : 'w-48',
              direction === 'vertical' ? (index % 2 === 0 ? 'pr-2' : 'pl-2') : 'mr-4 mb-2'
            )}>
            <AspectRatio ratio={1 / 1}>
              {item.books.length === 1 ? (
                <Image
                  className="w-full h-full rounded-md"
                  source={item.books[0].cover}
                  placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                />
              ) : item.books.length === 2 ? (
                <View className="flex flex-row">
                  <View className="w-1/2 h-full">
                    <Image
                      className="w-full h-full rounded-l-md"
                      source={item.books[0].cover}
                      placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                    />
                  </View>
                  <View className="w-1/2 h-full">
                    <Image
                      className="w-full h-full rounded-r-md"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                    />
                  </View>
                </View>
              ) : item.books.length === 3 ? (
                <View className="flex flex-row">
                  <View className="w-1/3 h-full">
                    <Image
                      className="w-full h-full rounded-l-md"
                      source={item.books[0].cover}
                      placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                    />
                  </View>
                  <View className="w-1/3 h-full">
                    <Image
                      className="w-full h-full"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                    />
                  </View>
                  <View className="w-1/3 h-full">
                    <Image
                      className="w-full h-full rounded-r-md"
                      source={item.books[2].cover}
                      placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                    />
                  </View>
                </View>
              ) : item.books.length === 4 ? (
                <>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tl-md"
                        source={item.books[0].cover}
                        placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      />
                    </View>
                  </View>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                      />
                    </View>
                  </View>
                </>
              ) : item.books.length > 4 ? (
                <>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tl-md"
                        source={item.books[0].cover}
                        placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      />
                    </View>
                  </View>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                      />
                      <View className="w-full h-full flex justify-center items-center absolute bg-muted/80 rounded-br-md">
                        <Large>+{item.books.length - 3}</Large>
                      </View>
                    </View>
                  </View>
                </>
              ) : null}
            </AspectRatio>
            <View className="pt-2">
              <Large className="border-none text-lg" numberOfLines={1}>
                {item.name}
              </Large>
              <Muted numberOfLines={1}>
                {item.books.length === 1
                  ? '1 book available'
                  : `${item.books.length} books available`}
              </Muted>
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}
