import { Link, Stack } from 'expo-router';
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
import { ChevronRight } from '~/lib/icons/ChevronRight';

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
  } = api.books.listRecentlyAdded.useQuery();

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
      <FloatingPlayerDodgingLayout>
        {isAvailableOfflineLoading && isRecentlyAddedLoading && isContinueListeningLoading ? (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        ) : (
          <>
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

                {continueListening ? (
                  <BookList
                    books={continueListening}
                    direction="horizontal"
                    className="mb-2"
                    emptyListMessage="You haven&rsquo;t listened to any books yet"
                  />
                ) : continueListeningError ? (
                  <Card className="mb-4">
                    <CardContent className="pt-4">
                      <Large>Error loading books</Large>
                      <Text className="text-muted-foreground">
                        {continueListeningError.message || 'Unknown error'}
                      </Text>
                    </CardContent>
                    <CardFooter>
                      <Button
                        size="sm"
                        className="w-full"
                        onPress={() => refetchContinueListening()}>
                        <Text>Retry</Text>
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
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

                {recentlyAdded ? (
                  <BookList books={recentlyAdded} direction="horizontal" className="mb-2" />
                ) : recentlyAddedError ? (
                  <Card className="mb-4">
                    <CardContent className="pt-4">
                      <Large>Error loading books</Large>
                      <Text className="text-muted-foreground">
                        {recentlyAddedError.message || 'Unknown error'}
                      </Text>
                    </CardContent>
                    <CardFooter>
                      <Button size="sm" className="w-full" onPress={() => refetchRecentlyAdded()}>
                        <Text>Retry</Text>
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
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

                {availableOffline ? (
                  <BookList
                    books={availableOffline}
                    direction="horizontal"
                    className="mb-2"
                    emptyListMessage="You haven&rsquo;t downloaded any books yet"
                  />
                ) : availableOfflineError ? (
                  <Card className="mb-4">
                    <CardContent className="pt-4">
                      <Large>Error loading books</Large>
                      <Text className="text-muted-foreground">
                        {availableOfflineError.message || 'Unknown error'}
                      </Text>
                    </CardContent>
                    <CardFooter>
                      <Button
                        size="sm"
                        className="w-full"
                        onPress={() => refetchAvailableOffline()}>
                        <Text>Retry</Text>
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </FloatingPlayerDodgingLayout>
    </>
  );
}
