import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { ComponentPropsWithoutRef, Key } from 'react';
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
  avatar?: string | null;
  avatarThumbhash?: string | null;
  name: string;
  bookCount: number;
};

type BaseOmitted =
  | 'data'
  | 'keyExtractor'
  | 'horizontal'
  | 'numColumns'
  | 'renderItem'
  | 'ListEmptyComponent';

export function PersonList({
  people,
  type,
  ref,
  isFetchingNextPage,
  ListFooterComponent,
  ...props
}: {
  people?: PersonListPerson[];
  type: 'author' | 'editor' | 'narrator' | 'translator';
  ref?: React.RefObject<FlashListRef<PersonListPerson> | null>;
  isFetchingNextPage?: boolean;
} & (
  | ({ direction: 'vertical'; error: Error | null; refetch: () => Promise<unknown> } & Omit<
      ComponentPropsWithoutRef<typeof FlashList>,
      BaseOmitted | 'className'
    >)
  | ({ direction: 'horizontal'; key: Key } & Omit<
      ComponentPropsWithoutRef<typeof FlashList>,
      BaseOmitted
    >)
)) {
  return (
    <FlashList
      {...props}
      ref={ref}
      data={people}
      keyExtractor={(item) => item.id.toString()}
      key={
        props.direction === 'horizontal'
          ? `person-list-${people && people.length > 0 ? 'horizontal' : 'vertical'}-${props.key}`
          : undefined
      }
      horizontal={props.direction === 'horizontal' && people && people.length > 0}
      numColumns={props.direction === 'vertical' ? 3 : undefined}
      extraData={props.direction === 'vertical' ? props.error : undefined}
      renderItem={
        props.direction === 'vertical' && props.error
          ? undefined
          : ({ item, index }) => (
              <Link
                href={
                  type === 'author'
                    ? {
                        pathname: '/author/[authorId]',
                        params: { authorId: item.id },
                      }
                    : type === 'editor'
                      ? {
                          pathname: '/editor/[editorName]',
                          params: { editorName: item.name },
                        }
                      : type === 'narrator'
                        ? {
                            pathname: '/narrator/[narratorName]',
                            params: { narratorName: item.name },
                          }
                        : {
                            pathname: '/translator/[translatorName]',
                            params: { translatorName: item.name },
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
                        : 'ml-4 mb-2'
                  )}>
                  <AspectRatio ratio={1 / 1}>
                    {item.avatar ? (
                      <Image
                        className="w-full h-full rounded-md"
                        source={item.avatar}
                        placeholder={{ thumbhash: item.avatarThumbhash ?? undefined }}
                      />
                    ) : (
                      <Avatar
                        alt={`Fallback Avatar for ${item.name}`}
                        className="rounded-md w-full h-full">
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
                      {item.bookCount === 1
                        ? '1 book available'
                        : `${item.bookCount} books available`}
                    </Muted>
                  </View>
                </Pressable>
              </Link>
            )
      }
      ListFooterComponent={
        <>
          {isFetchingNextPage ? (
            props.direction === 'vertical' ? (
              <View className="p-12 justify-center items-center">
                <Spinner size={15} />
              </View>
            ) : (
              <View className="flex-1 w-36 pb-12 flex justify-center items-center">
                <Spinner size={15} />
              </View>
            )
          ) : null}
          {ListFooterComponent}
        </>
      }
      ListEmptyComponent={
        props.direction === 'vertical' && props.error ? (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <Large>Error loading books</Large>
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
        ) : people?.length === 0 ? (
          <View className="flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4">
            <Text className="text-center">No {type}s found</Text>
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
