import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { H2, Small } from '~/components/ui/typography';

import api from '~/lib/api';

export default function NarratorScreen() {
  const { narratorName } = useLocalSearchParams<{ narratorName: string }>();

  const { data, error, refetch, isFetching } = api.contributors.listBooks.useQuery(
    'narrator',
    narratorName
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Narrator' }} />
      <BookList
        books={data}
        error={error}
        refetch={refetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            <H2 className="border-0 text-center">{narratorName}</H2>
            {data ? (
              <Small className="text-center">
                {data.length} {data.length === 1 ? 'book' : 'books'} available
              </Small>
            ) : null}

            <TitleWithRefetch refetch={refetch} isFetching={isFetching} className="mt-4 mb-2">
              Books
            </TitleWithRefetch>
          </>
        }
      />
    </>
  );
}
