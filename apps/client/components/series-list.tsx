import { LegendList, type LegendListRef } from '@legendapp/list';
import { Link } from 'expo-router';
import type { ComponentPropsWithoutRef } from 'react';
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

type EnsureProp<K extends keyof ComponentPropsWithoutRef<typeof LegendList<SeriesListSeries>>> = K;
type BaseOmitted = EnsureProp<
  | 'data'
  | 'keyExtractor'
  | 'horizontal'
  | 'numColumns'
  | 'renderItem'
  | 'ListEmptyComponent'
  | 'onEndReached'
  | 'children'
>;

function EmptyComponent({
  className,
  series,
  error,
  refetch,
}: {
  className?: string;
  series?: SeriesListSeries[];
  error: Error | null;
  refetch: () => Promise<unknown>;
}) {
  if (error) {
    return (
      <Card className={cn('mb-4', className)}>
        <CardContent className="pt-4">
          <Large>Error loading series</Large>
          <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onPress={() => refetch()}>
            <Text>Retry</Text>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (series?.length === 0) {
    return (
      <View
        className={cn(
          'mb-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-muted px-8 py-16',
          className
        )}>
        <Text className="text-center">No series found</Text>
      </View>
    );
  }

  return (
    <View className={cn('items-center justify-center p-12', className)}>
      <Spinner size={15} />
    </View>
  );
}

export function SeriesList({
  series,
  ref,
  ...props
}: {
  series?: SeriesListSeries[];
  ref?: React.RefObject<LegendListRef | null>;
} & (
  | ({ direction: 'vertical'; error: Error | null; refetch: () => Promise<unknown> } & Omit<
      ComponentPropsWithoutRef<typeof LegendList<SeriesListSeries>>,
      BaseOmitted | 'className'
    >)
  | ({
      direction: 'horizontal';
      error: Error | null;
      refetch: () => Promise<unknown>;
    } & Omit<
      ComponentPropsWithoutRef<typeof LegendList<SeriesListSeries>>,
      BaseOmitted | EnsureProp<'ListHeaderComponent' | 'ListEmptyComponent' | 'ListFooterComponent'>
    >)
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
  if (props.direction === 'horizontal' && (series?.length === 0 || props.error)) {
    return (
      <EmptyComponent
        className={props.className}
        series={series}
        error={props.error}
        refetch={props.refetch}
      />
    );
  }

  return (
    <LegendList
      {...props}
      recycleItems={true}
      ref={ref}
      data={series ?? []}
      keyExtractor={(item) => item.id.toString()}
      horizontal={props.direction === 'horizontal'}
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
                  : 'mb-2 ml-4'
            )}>
            <AspectRatio ratio={1 / 1}>
              {item.books.length === 1 ? (
                <Image
                  className="h-full w-full rounded-md"
                  source={item.books[0].cover}
                  placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                  recyclingKey={item.books[0].id.toString()}
                />
              ) : item.books.length === 2 ? (
                <View className="flex flex-row">
                  <View className="h-full w-1/2">
                    <Image
                      className="h-full w-full rounded-l-md"
                      source={item.books[0].cover}
                      placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[0].id.toString()}
                    />
                  </View>
                  <View className="h-full w-1/2">
                    <Image
                      className="h-full w-full rounded-r-md"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[1].id.toString()}
                    />
                  </View>
                </View>
              ) : item.books.length === 3 ? (
                <View className="flex flex-row">
                  <View className="h-full w-1/3">
                    <Image
                      className="h-full w-full rounded-l-md"
                      source={item.books[0].cover}
                      placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[0].id.toString()}
                    />
                  </View>
                  <View className="h-full w-1/3">
                    <Image
                      className="h-full w-full"
                      source={item.books[1].cover}
                      placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[1].id.toString()}
                    />
                  </View>
                  <View className="h-full w-1/3">
                    <Image
                      className="h-full w-full rounded-r-md"
                      source={item.books[2].cover}
                      placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                      recyclingKey={item.books[2].id.toString()}
                    />
                  </View>
                </View>
              ) : item.books.length === 4 ? (
                <>
                  <View className="flex h-1/2 flex-row">
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-tl-md"
                        source={item.books[0].cover}
                        placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[0].id.toString()}
                      />
                    </View>
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[1].id.toString()}
                      />
                    </View>
                  </View>
                  <View className="flex h-1/2 flex-row">
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[2].id.toString()}
                      />
                    </View>
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[3].id.toString()}
                      />
                    </View>
                  </View>
                </>
              ) : item.books.length > 4 ? (
                <>
                  <View className="flex h-1/2 flex-row">
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-tl-md"
                        source={item.books[0].cover}
                        placeholder={{ thumbhash: item.books[0].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[0].id.toString()}
                      />
                    </View>
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-tr-md"
                        source={item.books[1].cover}
                        placeholder={{ thumbhash: item.books[1].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[1].id.toString()}
                      />
                    </View>
                  </View>
                  <View className="flex h-1/2 flex-row">
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-bl-md"
                        source={item.books[2].cover}
                        placeholder={{ thumbhash: item.books[2].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[2].id.toString()}
                      />
                    </View>
                    <View className="h-full w-1/2">
                      <Image
                        className="h-full w-full rounded-br-md"
                        source={item.books[3].cover}
                        placeholder={{ thumbhash: item.books[3].coverThumbhash ?? undefined }}
                        recyclingKey={item.books[3].id.toString()}
                      />
                      <View className="absolute flex h-full w-full items-center justify-center rounded-br-md bg-muted/80">
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
                <View className="items-center justify-center p-12">
                  <Spinner size={15} />
                </View>
              ) : (
                <View className="ml-4 flex w-64 flex-1 items-center justify-center pb-12">
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
                <Card className="mb-2 ml-4 flex w-64 flex-1 justify-between">
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
          {props.direction === 'vertical' ? props.ListFooterComponent : null}
        </>
      }
      ListEmptyComponent={
        props.direction === 'vertical' ? (
          <EmptyComponent series={series} error={props.error} refetch={props.refetch} />
        ) : null
      }
    />
  );
}
