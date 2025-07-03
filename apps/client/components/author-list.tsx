import { Link } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn, getInitials } from '~/lib/utils';

export function AuthorList({
  authors,
  direction = 'vertical',
  className,
}: {
  authors: {
    id: number;
    avatar: string | null;
    avatarThumbhash: string | null;
    name: string;
    bookCount: number;
  }[];
  direction?: 'horizontal' | 'vertical';
  className?: string;
}) {
  if (authors.length === 0) {
    return (
      <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
        <Text className="text-center">No authors found</Text>
      </View>
    );
  }

  return (
    <FlatList
      className={className}
      data={authors}
      keyExtractor={(item) => item.id.toString()}
      scrollEnabled={direction === 'horizontal'}
      horizontal={direction === 'horizontal'}
      numColumns={direction === 'vertical' ? 3 : undefined}
      renderItem={({ item, index }) => (
        <Link
          href={{
            pathname: '/author/[authorId]',
            params: { authorId: item.id },
          }}
          asChild
          push
          withAnchor>
          <Pressable
            className={cn(
              'h-full',
              direction === 'vertical' ? (index > 2 ? 'pt-4 w-1/3' : 'w-1/3') : 'w-48',
              direction === 'vertical'
                ? index % 3 === 0
                  ? 'pr-2'
                  : index % 3 === 1
                    ? 'px-1'
                    : 'pl-2'
                : 'mr-4 mb-2'
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
                {item.bookCount === 1 ? '1 book available' : `${item.bookCount} books available`}
              </Muted>
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}
