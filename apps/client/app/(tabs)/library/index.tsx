import { useQuery } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Text } from '~/components/ui/text';

import { instanceStore } from '~/lib/stores/instance';

export default function LibraryScreen() {
  const apiInstance = useSelector(instanceStore, (state) => state.context.apiInstance);
  const { data, error, refetch, isLoading } = useQuery(
    apiInstance.v1.sync.books.queryOptions({ since: 0 })
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <ScrollView className="px-6">
        <View className="py-6">
          <Text>Library</Text>
          <Text>{JSON.stringify(data, null, 2)}</Text>
        </View>
      </ScrollView>
    </>
  );
}
