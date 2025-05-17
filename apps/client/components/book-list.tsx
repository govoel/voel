import { Link } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Image } from '~/components/image';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { cn } from '~/lib/utils';

export function BookList({
  books,
}: {
  books: {
    id: number;
    cover: string | null;
    coverThumbhash: string | null;
    title: string;
    label?: string;
    authors?: { name: string }[];
    contributors?: { name: string }[];
  }[];
}) {
  return (
    <FlatList
      data={books}
      keyExtractor={(item) => item.id.toString()}
      scrollEnabled={false}
      numColumns={2}
      renderItem={({ item, index }) => (
        <Link
          href={{
            pathname: '/(tabs)/(library)/book/[bookId]',
            params: { bookId: item.id },
          }}
          asChild
          push>
          <Pressable className={cn('w-1/2 pt-4', index % 2 === 0 ? 'pr-2' : 'pl-2')}>
            <View className="flex flex-row items-center pb-2">
              {item.label ? (
                <Badge variant="outline">
                  <Text>{item.label}</Text>
                </Badge>
              ) : null}
            </View>
            {item.cover ? (
              <AspectRatio ratio={1 / 1}>
                <Image
                  className="w-full h-full rounded-md"
                  source={item.cover}
                  placeholder={{ thumbhash: item.coverThumbhash ?? undefined }}
                />
              </AspectRatio>
            ) : null}
            <View className="pt-2">
              <Large className="border-none" numberOfLines={1}>
                {item.title}
              </Large>
              {item.authors ? (
                <Muted numberOfLines={1}>
                  {item.authors.map((author) => author.name).join(', ')}
                </Muted>
              ) : null}
              {item.contributors ? (
                <Muted numberOfLines={1}>
                  {item.contributors.map((contributor) => contributor.name).join(', ')}
                </Muted>
              ) : null}
            </View>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={() => (
        <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
          <Text className="text-center">No books found</Text>
        </View>
      )}
    />
  );
}
