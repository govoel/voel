import { LegendList, type LegendListRef } from '@legendapp/list';
import { Link } from 'expo-router';
import type { ComponentPropsWithoutRef } from 'react';
import { Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn, getInitials } from '~/lib/utils';

export type PersonListPerson = {
  id: number;
  contributorId: number | null;
  avatar: string | null;
  avatarThumbhash: string | null;
  name: string;
  bookCount: number;
};

type EnsureProp<K extends keyof ComponentPropsWithoutRef<typeof LegendList<PersonListPerson>>> = K;
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
  type,
  people,
  error,
  refetch,
}: {
  className?: string;
  type: 'author' | 'editor' | 'narrator' | 'translator' | 'foreword';
  people?: PersonListPerson[];
  error: Error | null;
  refetch: () => Promise<unknown>;
}) {
  if (error) {
    return (
      <Card className={cn('mb-4', className)}>
        <CardContent className="pt-4">
          <Large>Error loading {type}s</Large>
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

  if (people?.length === 0) {
    return (
      <View
        className={cn(
          'mb-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-muted px-8 py-16',
          className
        )}>
        <Text className="text-center">No {type}s found</Text>
      </View>
    );
  }

  return (
    <View className={cn('items-center justify-center p-12', className)}>
      <Spinner size={15} />
    </View>
  );
}

export function PersonList({
  people,
  type,
  ref,
  ...props
}: {
  people?: PersonListPerson[];
  type: 'author' | 'editor' | 'narrator' | 'translator' | 'foreword';
  ref?: React.RefObject<LegendListRef | null>;
  isFetchingNextPage?: boolean;
} & (
  | ({ direction: 'vertical'; error: Error | null; refetch: () => Promise<unknown> } & Omit<
      ComponentPropsWithoutRef<typeof LegendList<PersonListPerson>>,
      BaseOmitted | 'className'
    >)
  | ({
      direction: 'horizontal';
      error: Error | null;
      refetch: () => Promise<unknown>;
    } & Omit<
      ComponentPropsWithoutRef<typeof LegendList<PersonListPerson>>,
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
  if (props.direction === 'horizontal' && (people?.length === 0 || props.error)) {
    return (
      <EmptyComponent
        className={props.className}
        type={type}
        people={people}
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
      data={people ?? []}
      keyExtractor={(item) => item.id.toString()}
      horizontal={props.direction === 'horizontal'}
      numColumns={props.direction === 'vertical' ? 3 : undefined}
      renderItem={({ item, index }) => (
        <Link
          href={
            item.contributorId
              ? {
                  pathname: '/contributor/id/[contributorId]',
                  params: { contributorId: item.contributorId },
                }
              : {
                  pathname: '/contributor/name/[contributorName]',
                  params: { contributorName: item.name },
                }
          }
          asChild
          push
          withAnchor>
          <Pressable
            className={cn(
              'h-full',
              props.direction === 'vertical' ? (index > 2 ? 'pt-4' : '') : 'w-36',
              props.direction === 'vertical'
                ? index % 3 === 0
                  ? 'pr-2'
                  : index % 3 === 1
                    ? 'px-1'
                    : 'pl-2'
                : index === 0
                  ? 'mb-2'
                  : 'mb-2 ml-4'
            )}>
            <AspectRatio ratio={1 / 1}>
              {item.avatar ? (
                <Image
                  className="h-full w-full rounded-md"
                  source={item.avatar}
                  placeholder={{ thumbhash: item.avatarThumbhash ?? undefined }}
                  recyclingKey={item.id.toString()}
                />
              ) : (
                <Avatar
                  alt={`Fallback Avatar for ${item.name}`}
                  className="h-full w-full rounded-md">
                  <AvatarFallback className="rounded-none">
                    <Large className="text-5xl">{getInitials(item.name)}</Large>
                  </AvatarFallback>
                </Avatar>
              )}
            </AspectRatio>
            <View className="pt-2">
              <Large className="border-none text-lg" numberOfLines={1}>
                {item.name}
              </Large>
              <Muted numberOfLines={1}>
                {item.bookCount === 1 ? '1 book available' : `${item.bookCount} books available`}
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
                <View className="ml-4 flex w-32 flex-1 items-center justify-center pb-12">
                  <Spinner size={15} />
                </View>
              )
            ) : props.isFetchNextPageError ? (
              props.direction === 'vertical' ? (
                <Card className="mt-4">
                  <CardContent className="pt-4">
                    <Large>Error loading more {type}s</Large>
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
                    <Large>Error loading more {type}s</Large>
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
          <EmptyComponent type={type} people={people} error={props.error} refetch={props.refetch} />
        ) : null
      }
    />
  );
}
