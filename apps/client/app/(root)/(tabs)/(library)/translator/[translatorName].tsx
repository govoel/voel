import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { H2, Small } from '~/components/ui/typography';

import api from '~/lib/api';

export default function TranslatorScreen() {
  const { translatorName } = useLocalSearchParams<{ translatorName: string }>();

  const { data, error, refetch, isFetching } = api.contributors.listBooks.useQuery(
    'translator',
    translatorName
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Translator' }} />
      <BookList
        books={data}
        error={error}
        refetch={refetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            <H2 className="border-0 text-center">{translatorName}</H2>
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
