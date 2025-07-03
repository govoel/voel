import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { instanceStore } from '~/lib/stores/instance';

export default function AvailableOfflineScreen() {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const instanceId = useSelector(instanceStore, (state) => state.context.instanceId);
  const { data, error, refetch, isFetching } = api.feeds.getAvailableOffline.useQuery(
    instanceDb,
    instanceId ?? '0'
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Available Offline' }} />
      <FloatingPlayerDodgingLayout>
        <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
          Available Offline
        </TitleWithRefetch>
        {error ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading books</Large>
              <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => refetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : data ? (
          <BookList books={data} />
        ) : (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        )}
      </FloatingPlayerDodgingLayout>
    </>
  );
}
