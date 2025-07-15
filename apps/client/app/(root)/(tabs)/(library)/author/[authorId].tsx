import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { ExpandableSummary } from '~/components/expandable-summary';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large, Small } from '~/components/ui/typography';

import api from '~/lib/api';

export default function AuthorScreen() {
  const { authorId } = useLocalSearchParams<{ authorId: string }>();

  const {
    data: author,
    error: authorError,
    refetch: authorRefetch,
  } = api.authors.get.useQuery(parseInt(authorId, 10));

  const {
    data: books,
    error: booksError,
    refetch: booksRefetch,
    isFetching: booksFetching,
  } = api.authors.listBooks.useQuery(parseInt(authorId, 10));

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Author' }} />
      <FloatingPlayerDodgingLayout>
        {authorError ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading author {authorId}</Large>
              <Text className="text-muted-foreground">
                {authorError.message || 'Unknown error'}
              </Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => authorRefetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : author ? (
          <>
            {author.avatar ? (
              <AspectRatio ratio={1 / 1} className="mx-20">
                <Image
                  className="w-full h-full rounded-md"
                  source={author.avatar}
                  placeholder={{ thumbhash: author.avatarThumbhash ?? undefined }}
                />
              </AspectRatio>
            ) : null}

            <H2 className="border-0 pt-4 text-center">{author.name}</H2>
            {books && (
              <Small className="text-center">
                {books.length} {books.length === 1 ? 'book' : 'books'} available
              </Small>
            )}

            {author.about ? (
              <View className="pt-4">
                <ExpandableSummary
                  summary={author.about}
                  expandText="Expand About"
                  collapseText="Collapse About"
                />
              </View>
            ) : null}
          </>
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )}

        {booksError ? (
          <Card className={authorError ? 'mt-4' : ''}>
            <CardContent className="pt-4">
              <Large>Error loading author&rsquo;s books</Large>
              <Text className="text-muted-foreground">{booksError.message || 'Unknown error'}</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => authorRefetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : books ? (
          <>
            <TitleWithRefetch
              refetch={booksRefetch}
              isFetching={booksFetching}
              className="mt-4 mb-2">
              Books
            </TitleWithRefetch>
            <BookList books={books} />
          </>
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )}
      </FloatingPlayerDodgingLayout>
    </>
  );
}
