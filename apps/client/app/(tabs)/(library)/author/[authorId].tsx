import { useSelector } from '@xstate/store/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { BookList } from '~/components/book-list';
import { ExpandableSummary } from '~/components/expandable-summary';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large, Small } from '~/components/ui/typography';

import api from '~/lib/api';
import { instanceStore } from '~/lib/stores/instance';

export default function AuthorScreen() {
  const { authorId } = useLocalSearchParams<{ authorId: string }>();

  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isLoading } = api.authors.get.useQuery(
    instanceDb,
    parseInt(authorId, 10)
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Author' }} />
      <ScrollView className="px-6">
        <View className="py-6">
          {error ? (
            <Card>
              <CardContent className="pt-4">
                <Large>Error loading author {authorId}</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          ) : data ? (
            <>
              <AspectRatio ratio={1 / 1} className="mx-20">
                <Image
                  className="w-full h-full rounded-md"
                  source={data.avatar}
                  placeholder={{ thumbhash: data.avatarThumbhash }}
                />
              </AspectRatio>

              <H2 className="border-0 pt-4 text-center">{data.name}</H2>
              <Small className="text-center">
                {data.books.length} {data.books.length === 1 ? 'book' : 'books'} available
              </Small>

              <View className="pt-4">
                <ExpandableSummary
                  summary={data.about ?? '_About is not available for this author._'}
                  expandText="Expand About"
                  collapseText="Collapse About"
                />
              </View>

              <TitleWithRefetch refetch={refetch} isLoading={isLoading} className="pt-4">
                Books
              </TitleWithRefetch>
              <BookList books={data.books} />
            </>
          ) : (
            <View className="p-12 justify-center items-center">
              <Spinner size={15} />
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}
