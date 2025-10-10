import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';

import api from '~/lib/api';

export default function RecentlyAddedScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const {
    data,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = api.books.listRecentlyAdded.useInfiniteQuery();

  return (
    <>
      <Stack.Screen options={{ title: 'Recently Added' }} />
      <BookList
        books={data}
        error={error}
        refetch={refetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        onEndReached={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        ListHeaderComponent={
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            Recently Added
          </TitleWithRefetch>
        }
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />
    </>
  );
}
