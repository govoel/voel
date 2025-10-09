import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { H2, Small } from '~/components/ui/typography';

import api from '~/lib/api';

export default function SeriesNameScreen() {
  const { seriesName } = useLocalSearchParams<{ seriesName: string }>();

  const {
    data: books,
    error: booksError,
    refetch: booksRefetch,
    isFetching: booksIsFetching,
  } = api.series.listBooksByName.useQuery(seriesName);

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
            <H2 className="border-0 text-center">{seriesName}</H2>
            {books && (
              <Small className="text-center">
                {books.length} {books.length === 1 ? 'book' : 'books'} available
              </Small>
            )}

            <TitleWithRefetch
              refetch={booksRefetch}
              isFetching={booksIsFetching}
              className="mb-2 mt-4">
              Books
            </TitleWithRefetch>
          </>
        }
      />
    </>
  );
}
