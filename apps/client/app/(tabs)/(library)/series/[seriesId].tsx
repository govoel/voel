import { useSelector } from '@xstate/store/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { BookList } from '~/components/book-list';
import { ExpandableSummary } from '~/components/expandable-summary';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large, Small } from '~/components/ui/typography';

import api from '~/lib/api';
import { instanceStore } from '~/lib/stores/instance';

export default function SeriesScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();

  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isLoading } = api.series.get.useQuery(
    instanceDb,
    parseInt(seriesId, 10)
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Series' }} />
      <ScrollView className="px-6">
        <View className="py-6">
          {error ? (
            <Card>
              <CardContent className="pt-4">
                <Large>Error loading series {seriesId}</Large>
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
              <H2 className="border-0 text-center">{data.name}</H2>
              <Small className="text-center">
                {data.books.length} {data.books.length === 1 ? 'book' : 'books'} available
              </Small>

              {data.summary ? (
                <View className="pt-4">
                  <ExpandableSummary
                    summary={data.summary}
                    expandText="Expand Summary"
                    collapseText="Collapse Summary"
                  />
                </View>
              ) : null}

              <TitleWithRefetch refetch={refetch} isLoading={isLoading} className="pt-4">
                Books
              </TitleWithRefetch>
              <BookList books={data.books.sort((a, b) => a.sort - b.sort)} />
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
