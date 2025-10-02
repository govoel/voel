import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { Markdown } from '~/components/markdown-renderer';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large, Small } from '~/components/ui/typography';

import api from '~/lib/api';

export default function SeriesIDScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();

  const {
    data: serie,
    error: serieError,
    refetch: serieRefetch,
  } = api.series.getById.useQuery(parseInt(seriesId, 10));

  const {
    data: books,
    error: booksError,
    refetch: booksRefetch,
    isFetching: booksIsFetching,
  } = api.series.listBooksById.useQuery(parseInt(seriesId, 10));

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Series' }} />
      <BookList
        books={books}
        error={booksError}
        refetch={booksRefetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            {serieError ? (
              <Card>
                <CardContent className="pt-4">
                  <Large>Error loading series {seriesId}</Large>
                  <Text className="text-muted-foreground">
                    {serieError.message || 'Unknown error'}
                  </Text>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onPress={() => serieRefetch()}>
                    <Text>Retry</Text>
                  </Button>
                </CardFooter>
              </Card>
            ) : serie ? (
              <>
                <H2 className="border-0 text-center">{serie.name}</H2>
                {books && (
                  <Small className="text-center">
                    {books.length} {books.length === 1 ? 'book' : 'books'} available
                  </Small>
                )}

                {serie.summary ? (
                  <View className="pt-4">
                    <Markdown content={serie.summary} />
                  </View>
                ) : null}
              </>
            ) : (
              <View className="p-12 justify-center items-center">
                <Spinner size={15} />
              </View>
            )}

            <TitleWithRefetch
              refetch={booksRefetch}
              isFetching={booksIsFetching}
              className="mt-4 mb-2">
              Books
            </TitleWithRefetch>
          </>
        }
      />
    </>
  );
}
