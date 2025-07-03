import { useSelector } from '@xstate/store/react';
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
import { instanceStore } from '~/lib/stores/instance';

export default function NarratorScreen() {
  const { narratorName } = useLocalSearchParams<{ narratorName: string }>();

  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isLoading } = api.contributors.listBooks.useQuery(
    instanceDb,
    narratorName,
    'narrator'
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Narrator' }} />
      <FloatingPlayerDodgingLayout>
        {error ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading narrator {narratorName}</Large>
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
            <H2 className="border-0 text-center">{narratorName}</H2>
            <Small className="text-center">
              {data.length} {data.length === 1 ? 'book' : 'books'} available
            </Small>

            <TitleWithRefetch refetch={refetch} isLoading={isLoading} className="mt-4 mb-2">
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
