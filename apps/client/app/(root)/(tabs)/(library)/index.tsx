import * as TabsPrimitive from '@rn-primitives/tabs';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AuthorList } from '~/components/author-list';
import { BookList } from '~/components/book-list';
import { floatingPlayerStore } from '~/components/floating-player';
import { SeriesList } from '~/components/series-list';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { Search } from '~/lib/icons/Search';
import { instanceStore } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

export default function LibraryScreen() {
  const [currentTab, setCurrentTab] = useState('books');

  const floatingPlayerIsActive = useSelector(
    floatingPlayerStore,
    (state) => state.context.isActive
  );

  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <View className="flex-1">
        <Tabs
          value={currentTab}
          onValueChange={(value) => {
            scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
            setCurrentTab(value);
          }}
          className="flex-1">
          <ScrollView className="px-6" ref={scrollViewRef}>
            <View className={floatingPlayerIsActive ? 'pb-40 pt-6' : 'pb-20 pt-6'}>
              <TabsContent value="search">
                <Input placeholder="Search..." autoFocus />
              </TabsContent>

              <TabsContent value="books">
                <BookTab />
              </TabsContent>

              <TabsContent value="authors">
                <AuthorTab />
              </TabsContent>

              <TabsContent value="series">
                <SeriesTab />
              </TabsContent>
            </View>
          </ScrollView>

          <View
            className={cn(
              'w-full absolute px-4',
              floatingPlayerIsActive ? 'bottom-[75]' : 'bottom-[10]'
            )}>
            <TabsList className="w-full flex-row">
              <TabsTrigger value="authors" className="flex-1">
                <Text>Authors</Text>
              </TabsTrigger>
              <TabsTrigger value="books" className="flex-1">
                <Text>Books</Text>
              </TabsTrigger>
              <TabsTrigger value="series" className="flex-1">
                <Text>Series</Text>
              </TabsTrigger>
              <SearchTabsTrigger />
            </TabsList>
          </View>
        </Tabs>
      </View>
    </>
  );
}

const SearchTabsTrigger = () => {
  const { value } = TabsPrimitive.useRootContext();

  return (
    <TabsTrigger value="search">
      <Search
        className={value === 'search' ? 'text-foreground' : 'text-muted-foreground'}
        size={18}
      />
    </TabsTrigger>
  );
};

const BookTab = () => {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isLoading } = api.books.list.useQuery(instanceDb);

  return (
    <>
      <TitleWithRefetch className="mb-2" refetch={refetch} isLoading={isLoading}>
        All Books
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
    </>
  );
};

const AuthorTab = () => {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isFetching } = api.authors.list.useQuery(instanceDb);

  return (
    <>
      <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
        All Authors
      </TitleWithRefetch>
      {error ? (
        <Card>
          <CardContent className="pt-4">
            <Large>Error loading authors</Large>
            <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onPress={() => refetch()}>
              <Text>Retry</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : data ? (
        <AuthorList authors={data} />
      ) : (
        <View className="p-12 justify-center items-center">
          <Spinner size={15} />
        </View>
      )}
    </>
  );
};

const SeriesTab = () => {
  const instanceDb = useSelector(instanceStore, (state) => state.context.instanceDb);
  const { data, error, refetch, isFetching } = api.series.list.useQuery(instanceDb);

  return (
    <>
      <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
        All Series
      </TitleWithRefetch>
      {error ? (
        <Card>
          <CardContent className="pt-4">
            <Large>Error loading series</Large>
            <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onPress={() => refetch()}>
              <Text>Retry</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : data ? (
        <SeriesList series={data} />
      ) : (
        <View className="p-12 justify-center items-center">
          <Spinner size={15} />
        </View>
      )}
    </>
  );
};
