import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';

import api from '~/lib/api';

export default function ContinueListeningScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { data, error, refetch, isFetching } = api.feeds.getContinueListening.useQuery();

  return (
    <>
      <Stack.Screen options={{ title: 'Continue Listening' }} />
      <BookList
        books={data}
        error={error}
        refetch={refetch}
        direction="vertical"
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        emptyListMessage="You haven&rsquo;t listened to any books yet"
        ListHeaderComponent={
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            Continue Listening
          </TitleWithRefetch>
        }
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />
    </>
  );
}
