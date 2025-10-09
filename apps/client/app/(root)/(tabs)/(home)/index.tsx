import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';

export default function HomeScreen() {
  const {
    data: availableOffline,
    refetch: refetchAvailableOffline,
    isLoading: isAvailableOfflineLoading,
    isFetching: isAvailableOfflineFetching,
    error: availableOfflineError,
  } = api.feeds.getAvailableOffline.useQuery();

  const {
    data: recentlyAdded,
    refetch: refetchRecentlyAdded,
    isLoading: isRecentlyAddedLoading,
    isFetching: isRecentlyAddedFetching,
    error: recentlyAddedError,
    fetchNextPage: fetchNextPageForRecentlyAdded,
    isFetchingNextPage: isRecentlyAddedFetchingNextPage,
    isFetchNextPageError: isRecentlyAddedFetchingNextPageError,
  } = api.books.listRecentlyAdded.useInfiniteQuery();

  const {
    data: continueListening,
    refetch: refetchContinueListening,
    isLoading: isContinueListeningLoading,
    isFetching: isContinueListeningFetching,
    error: continueListeningError,
  } = api.feeds.getContinueListening.useQuery();

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <FloatingPlayerDodgingScrollView>
        {!isContinueListeningLoading ? (
          <>
            <TitleWithRefetch
              className="-ml-3 mb-2"
              refetch={refetchContinueListening}
              isFetching={isContinueListeningFetching}>
              <Link href="/feed/continue-listening" asChild push>
                <Button className="flex-row gap-x-1 pr-1" size="sm" variant="ghost">
                  <Large>Continue Listening</Large>
                  <ChevronRight className="text-muted-foreground" size={18} />
                </Button>
              </Link>
            </TitleWithRefetch>

            <BookList
              direction="horizontal"
              books={continueListening}
              error={continueListeningError}
              refetch={refetchContinueListening}
              className="mb-2"
              emptyListMessage="You haven&rsquo;t listened to any books yet"
            />
          </>
        ) : null}

        {!isRecentlyAddedLoading ? (
          <>
            <TitleWithRefetch
              className="-ml-3 mb-2"
              refetch={refetchRecentlyAdded}
              isFetching={isRecentlyAddedFetching}>
              <Link href="/feed/recently-added" asChild push>
                <Button className="flex-row gap-x-1 pr-1" size="sm" variant="ghost">
                  <Large>Recently Added</Large>
                  <ChevronRight className="text-muted-foreground" size={18} />
                </Button>
              </Link>
            </TitleWithRefetch>

            <BookList
              direction="horizontal"
              books={recentlyAdded}
              className="mb-2"
              onEndReached={fetchNextPageForRecentlyAdded}
              error={recentlyAddedError}
              refetch={refetchRecentlyAdded}
              isFetchingNextPage={isRecentlyAddedFetchingNextPage}
              isFetchNextPageError={isRecentlyAddedFetchingNextPageError}
            />
          </>
        ) : null}

        {!isAvailableOfflineLoading ? (
          <>
            <TitleWithRefetch
              className="-ml-3 mb-2"
              refetch={refetchAvailableOffline}
              isFetching={isAvailableOfflineFetching}>
              <Link href="/feed/available-offline" asChild push>
                <Button className="flex-row gap-x-1 pr-1" size="sm" variant="ghost">
                  <Large>Available Offline</Large>
                  <ChevronRight className="text-muted-foreground" size={18} />
                </Button>
              </Link>
            </TitleWithRefetch>

            <BookList
              direction="horizontal"
              books={availableOffline}
              error={availableOfflineError}
              refetch={refetchAvailableOffline}
              className="mb-2"
              emptyListMessage="You haven&rsquo;t downloaded any books yet"
            />
          </>
        ) : null}

        {isAvailableOfflineLoading || isRecentlyAddedLoading || isContinueListeningLoading ? (
          <View className="items-center justify-center p-12">
            <Spinner size={15} />
          </View>
        ) : null}
      </FloatingPlayerDodgingScrollView>
    </>
  );
}
