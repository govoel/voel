import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { ComponentPropsWithoutRef, Key } from 'react';
import { Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn } from '~/lib/utils';

export type SeriesListSeries = {
  id: number;
  seriesId: number | null;
  name: string;
  books: { id: number; cover: string | null; coverThumbhash: string | null }[];
};

type EnsureProp<K extends keyof ComponentPropsWithoutRef<typeof FlashList>> = K;
type BaseOmitted = EnsureProp<
  | 'data'
  | 'keyExtractor'
  | 'horizontal'
  | 'numColumns'
  | 'renderItem'
  | 'ListEmptyComponent'
  | 'onEndReached'
>;

export function SeriesList({
  series,
  ref,
  ListFooterComponent,
  ...props
}: {
  series?: SeriesListSeries[];
  ref?: React.RefObject<FlashListRef<SeriesListSeries> | null>;
} & (
  | ({ direction: 'vertical'; error: Error | null; refetch: () => Promise<unknown> } & Omit<
      ComponentPropsWithoutRef<typeof FlashList>,
      BaseOmitted | 'className'
    >)
  | ({
      direction: 'horizontal';
      key: Key;
      error: Error | null;
      refetch: () => Promise<unknown>;
    } & Omit<ComponentPropsWithoutRef<typeof FlashList>, BaseOmitted>)
) &
  (
    | {
        onEndReached: () => void;
        isFetchingNextPage: boolean;
        isFetchNextPageError: boolean;
      }
    | {
        onEndReached?: undefined;
      }
  )) {
  return (
    <FlashList
      {...props}
      ref={ref}
      data={series}
      keyExtractor={(item) => item.id.toString()}
      key={
        props.direction === 'horizontal'
          ? `series-list-${series && series.length > 0 ? 'horizontal' : 'vertical'}-${props.key}`
          : undefined
      }
      horizontal={props.direction === 'horizontal' && series && series.length > 0}
      numColumns={props.direction === 'vertical' ? 2 : undefined}
      renderItem={({ item, index }) => (
        <Link
          href={
            item.seriesId
              ? {
                  pathname: '/series/id/[seriesId]',
                  params: { seriesId: item.id },
                }
              : {
                  pathname: '/series/name/[seriesName]',
                  params: { seriesName: item.name },
                }
          }
          asChild
          push
          withAnchor>
          <Pressable
            className={cn(
              'h-full',
              props.direction === 'vertical' ? (index > 1 ? 'pt-4' : '') : 'w-48',
              props.direction === 'vertical'
                ? index % 2 === 0
                  ? 'pr-2'
                  : 'pl-2'
                : index === 0
                  ? 'mb-2'
                  : 'ml-4 mb-2'
            )}>
            <AspectRatio ratio={1 / 1}>
              {item.books.length === 1 ? (
                <Image
                  className="w-full h-full rounded-md"
                  source={item.books[0].cover}
                  placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                  recyclingKey={item.books[0].id.toString()}
                />
              ) : item.books.length === 2 ? (
                <View className="flex flex-row">
                  <View className="w-1/2 h-full">
                    <Image
                      className="w-full h-full rounded-l-md"
                      source={item.books[0].cover}
                      placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[0].id.toString()}
                    />
                  </View>
                  <View className="w-1/2 h-full">
                    <Image
                      className="w-full h-full rounded-r-md"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[1].id.toString()}
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
                      recyclingKey={item.books[0].id.toString()}
                    />
                  </View>
                  <View className="w-1/3 h-full">
                    <Image
                      className="w-full h-full"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[1].id.toString()}
                    />
                  </View>
                  <View className="w-1/3 h-full">
                    <Image
                      className="w-full h-full rounded-r-md"
                      source={item.books[2].cover}
                      placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[2].id.toString()}
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
                        recyclingKey={item.books[0].id.toString()}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[1].id.toString()}
                      />
                    </View>
                  </View>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[2].id.toString()}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[3].id.toString()}
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
                        recyclingKey={item.books[0].id.toString()}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[1].id.toString()}
                      />
                    </View>
                  </View>
                  <View className="flex flex-row h-1/2">
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[2].id.toString()}
                      />
                    </View>
                    <View className="w-1/2 h-full">
                      <Image
                        className="w-full h-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[3].id.toString()}
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
      ListFooterComponent={
        <>
          {props.onEndReached ? (
            props.isFetchingNextPage ? (
              props.direction === 'vertical' ? (
                <View className="p-12 justify-center items-center">
                  <Spinner size={15} />
                </View>
              ) : (
                <View className="flex-1 ml-4 w-64 pb-12 flex justify-center items-center">
                  <Spinner size={15} />
                </View>
              )
            ) : props.isFetchNextPageError ? (
              props.direction === 'vertical' ? (
                <Card className="mt-4">
                  <CardContent className="pt-4">
                    <Large>Error loading more books</Large>
                    <Text className="text-muted-foreground">
                      {props.error?.message || 'Unknown error'}
                    </Text>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" onPress={() => props.onEndReached()}>
                      <Text>Retry</Text>
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card className="mb-2 ml-4 w-64 flex-1 flex justify-between">
                  <CardContent className="pt-4">
                    <Large>Error loading more books</Large>
                    <Text className="text-muted-foreground">
                      {props?.error?.message || 'Unknown error'}
                    </Text>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" onPress={() => props?.onEndReached?.()}>
                      <Text>Retry</Text>
                    </Button>
                  </CardFooter>
                </Card>
              )
            ) : null
          ) : null}
          {ListFooterComponent}
        </>
      }
      ListEmptyComponent={
        props.error ? (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <Large>Error loading series</Large>
              <Text className="text-muted-foreground">
                {props.error.message || 'Unknown error'}
              </Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => props.refetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : series?.length === 0 ? (
          <View className="flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4 w-full">
            <Text className="text-center">No series found</Text>
          </View>
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )
      }
    />
  );
}
