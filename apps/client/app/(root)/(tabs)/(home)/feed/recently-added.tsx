import { Stack } from 'expo-router';

import { BookList } from '~/components/book-list';
import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';

import api from '~/lib/api';

export default function RecentlyAddedScreen() {
  const { data, error, refetch, isFetching, fetchNextPage, isFetchingNextPage } =
    api.books.listRecentlyAdded.useInfiniteQuery();

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
        ListHeaderComponent={
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            Recently Added
          </TitleWithRefetch>
        }
      />
    </>
  );
}
