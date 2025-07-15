import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large, Small } from '~/components/ui/typography';

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
      <FloatingPlayerDodgingLayout>
        {error ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading translator {translatorName}</Large>
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
            <H2 className="border-0 text-center">{translatorName}</H2>
            <Small className="text-center">
              {data.length} {data.length === 1 ? 'book' : 'books'} available
            </Small>

            <TitleWithRefetch refetch={refetch} isFetching={isFetching} className="mt-4 mb-2">
              Books
            </TitleWithRefetch>
            <BookList books={data} />
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
