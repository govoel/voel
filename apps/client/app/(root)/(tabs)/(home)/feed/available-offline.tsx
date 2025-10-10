import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';

import api from '~/lib/api';

export default function AvailableOfflineScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { data, error, refetch, isFetching } = api.feeds.getAvailableOffline.useQuery();

  return (
    <>
      <Stack.Screen options={{ title: 'Available Offline' }} />
      <BookList
        books={data}
        error={error}
        refetch={refetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        emptyListMessage="You haven&rsquo;t downloaded any books yet"
        ListHeaderComponent={
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            Available Offline
          </TitleWithRefetch>
        }
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />
    </>
  );
}
