import * as TabsPrimitive from '@rn-primitives/tabs';
import type { FlashListRef } from '@shopify/flash-list';
import { useStore } from '@tanstack/react-form';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as z from 'zod';

import { BookList, type BookListBook } from '~/components/book-list';
import { floatingPlayerStore } from '~/components/floating-player';
import { Search } from '~/components/icons/Search';
import { PersonList, type PersonListPerson } from '~/components/person-list';
import { SeriesList, type SeriesListSeries } from '~/components/series-list';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { cn } from '~/lib/utils';

export default function LibraryScreen() {
  const [currentTab, setCurrentTab] = useState('books');

  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <Tabs
        value={currentTab}
        onValueChange={(value) => {
          setCurrentTab(value);
        }}
        className="flex-1">
        <TabsContent value="search">
          <SearchTab />
        </TabsContent>

        <TabsContent value="books" className="flex-1">
          <BookTab />
        </TabsContent>

        <TabsContent value="authors" className="flex-1">
          <AuthorTab />
        </TabsContent>

        <TabsContent value="series" className="flex-1">
          <SeriesTab />
        </TabsContent>

        <View
          className={cn(
            'w-full absolute px-4',
            isPlayerActive && isUpdatePending
              ? 'bottom-[126]'
              : isPlayerActive
                ? 'bottom-[75]'
                : isUpdatePending
                  ? 'bottom-[60]'
                  : 'bottom-[10]'
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

const SearchTab = () => {
  const SearchForm = useAppForm({
    defaultValues: {
      query: '',
    },
    validators: {
      onChange: z.object({
        query: z.string().min(3, 'Search query must be at least 3 characters long'),
      }),
    },
    listeners: {
      onChangeDebounceMs: 500,
    },
  });

  const searchQuery = useStore(SearchForm.store, (state) =>
    state.isValid ? state.values.query : ''
  );

  const {
    data: bookSearchResults,
    error: bookSearchError,
    refetch: bookSearchRefetch,
    isFetching: bookSearchIsFetching,
  } = api.books.search.useQuery(searchQuery);

  const {
    data: authorSearchResults,
    error: authorSearchError,
    refetch: authorSearchRefetch,
    isFetching: authorSearchIsFetching,
  } = api.authors.search.useQuery(searchQuery);

  const {
    data: seriesSearchResults,
    error: seriesSearchError,
    refetch: seriesSearchRefetch,
    isFetching: seriesSearchIsFetching,
  } = api.series.search.useQuery(searchQuery);

  const {
    data: narratorSearchResults,
    error: narratorSearchError,
    refetch: narratorSearchRefetch,
    isFetching: narratorSearchIsFetching,
  } = api.contributors.search.useQuery('narrator', searchQuery);

  const {
    data: translatorSearchResults,
    error: translatorSearchError,
    refetch: translatorSearchRefetch,
    isFetching: translatorSearchIsFetching,
  } = api.contributors.search.useQuery('translator', searchQuery);

  const {
    data: editorSearchResults,
    error: editorSearchError,
    refetch: editorSearchRefetch,
    isFetching: editorSearchIsFetching,
  } = api.contributors.search.useQuery('editor', searchQuery);

  const bookListRef = useRef<FlashListRef<BookListBook>>(null);
  const authorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const seriesListRef = useRef<FlashListRef<SeriesListSeries>>(null);
  const narratorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const translatorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const editorListRef = useRef<FlashListRef<PersonListPerson>>(null);

  useEffect(() => {
    bookListRef.current?.scrollToTop({ animated: false });
    authorListRef.current?.scrollToTop({ animated: false });
    seriesListRef.current?.scrollToTop({ animated: false });
    narratorListRef.current?.scrollToTop({ animated: false });
    translatorListRef.current?.scrollToTop({ animated: false });
    editorListRef.current?.scrollToTop({ animated: false });
  }, [searchQuery]);

  return (
    <ScrollView className={cn(useFloatingPlayerAndTabsPaddingClass(), 'py-0')}>
      <View className={cn(useFloatingPlayerAndTabsPaddingClass(), 'px-0')}>
        <SearchForm.AppForm>
          <SearchForm.AppField
            name="query"
            children={(field) => (
              <field.TextField
                inputProps={{
                  placeholder: 'Search...',
                  autoFocus: true,
                  isLoading:
                    bookSearchIsFetching ||
                    authorSearchIsFetching ||
                    seriesSearchIsFetching ||
                    narratorSearchIsFetching ||
                    translatorSearchIsFetching ||
                    editorSearchIsFetching,
                }}
              />
            )}
          />
        </SearchForm.AppForm>

        {bookSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={bookSearchRefetch}
              isFetching={bookSearchIsFetching}>
              Books
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading books</Large>
                <Text className="text-muted-foreground">
                  {bookSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => bookSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : bookSearchResults && bookSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={bookSearchRefetch}
              isFetching={bookSearchIsFetching}>
              Books ({bookSearchResults.length})
            </TitleWithRefetch>
            <BookList
              ref={bookListRef}
              direction="horizontal"
              books={bookSearchResults}
              className="mb-2"
            />
          </>
        ) : null}

        {authorSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={authorSearchRefetch}
              isFetching={authorSearchIsFetching}>
              Authors
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading authors</Large>
                <Text className="text-muted-foreground">
                  {authorSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => authorSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : authorSearchResults && authorSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={authorSearchRefetch}
              isFetching={authorSearchIsFetching}>
              Authors ({authorSearchResults.length})
            </TitleWithRefetch>
            <PersonList
              ref={authorListRef}
              people={authorSearchResults}
              type="author"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {seriesSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={seriesSearchRefetch}
              isFetching={seriesSearchIsFetching}>
              Series
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading series</Large>
                <Text className="text-muted-foreground">
                  {seriesSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => seriesSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : seriesSearchResults && seriesSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={seriesSearchRefetch}
              isFetching={seriesSearchIsFetching}>
              Series ({seriesSearchResults.length})
            </TitleWithRefetch>
            <SeriesList
              ref={seriesListRef}
              series={seriesSearchResults}
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {narratorSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={narratorSearchRefetch}
              isFetching={narratorSearchIsFetching}>
              Narrators
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading narrators</Large>
                <Text className="text-muted-foreground">
                  {narratorSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => narratorSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : narratorSearchResults && narratorSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={narratorSearchRefetch}
              isFetching={narratorSearchIsFetching}>
              Narrators ({narratorSearchResults.length})
            </TitleWithRefetch>
            <PersonList
              ref={narratorListRef}
              people={narratorSearchResults}
              type="narrator"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {translatorSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={translatorSearchRefetch}
              isFetching={translatorSearchIsFetching}>
              Translators
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading translators</Large>
                <Text className="text-muted-foreground">
                  {translatorSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => translatorSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : translatorSearchResults && translatorSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={translatorSearchRefetch}
              isFetching={translatorSearchIsFetching}>
              Translators ({translatorSearchResults.length})
            </TitleWithRefetch>
            <PersonList
              ref={translatorListRef}
              people={translatorSearchResults}
              type="translator"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {editorSearchError ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={editorSearchRefetch}
              isFetching={editorSearchIsFetching}>
              Editors
            </TitleWithRefetch>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <Large>Error loading editors</Large>
                <Text className="text-muted-foreground">
                  {editorSearchError.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => editorSearchRefetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : editorSearchResults && editorSearchResults.length > 0 ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={editorSearchRefetch}
              isFetching={editorSearchIsFetching}>
              Editors ({editorSearchResults.length})
            </TitleWithRefetch>
            <PersonList
              ref={editorListRef}
              people={editorSearchResults}
              type="editor"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {bookSearchResults &&
          bookSearchResults.length === 0 &&
          authorSearchResults &&
          authorSearchResults.length === 0 &&
          seriesSearchResults &&
          seriesSearchResults.length === 0 &&
          narratorSearchResults &&
          narratorSearchResults.length === 0 &&
          translatorSearchResults &&
          translatorSearchResults.length === 0 &&
          editorSearchResults &&
          editorSearchResults.length === 0 && (
            <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted">
              <Text className="text-center">No results found</Text>
            </View>
          )}
      </View>
    </ScrollView>
  );
};

const useFloatingPlayerAndTabsPaddingClass = () => {
  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  if (isPlayerActive && isUpdatePending) return 'pt-6 pb-52 px-6';
  if (isPlayerActive) return 'pt-6 pb-40 px-6';
  if (isUpdatePending) return 'pt-6 pb-32 px-6';
  return 'pt-6 pb-20 px-6';
};

const BookTab = () => {
  const { data, error, refetch, isFetching, isFetchingNextPage, fetchNextPage } =
    api.books.list.useInfiniteQuery();

  return (
    <BookList
      books={data}
      error={error}
      refetch={refetch}
      onEndReached={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      direction="vertical"
      contentContainerClassName={useFloatingPlayerAndTabsPaddingClass()}
      ListHeaderComponent={
        <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
          All Books
        </TitleWithRefetch>
      }
    />
  );
};

const AuthorTab = () => {
  const { data, error, refetch, isFetching } = api.authors.list.useQuery();

  return (
    <PersonList
      people={data}
      error={error}
      refetch={refetch}
      type="author"
      direction="vertical"
      contentContainerClassName={useFloatingPlayerAndTabsPaddingClass()}
      ListHeaderComponent={
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
          ) : !data ? (
            <View className="p-12 justify-center items-center">
              <Spinner size={15} />
            </View>
          ) : null}
        </>
      }
    />
  );
};

const SeriesTab = () => {
  const { data, error, refetch, isFetching } = api.series.list.useQuery();

  return (
    <SeriesList
      series={data}
      error={error}
      refetch={refetch}
      direction="vertical"
      contentContainerClassName={useFloatingPlayerAndTabsPaddingClass()}
      ListHeaderComponent={() => (
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
          ) : !data ? (
            <View className="p-12 justify-center items-center">
              <Spinner size={15} />
            </View>
          ) : null}
        </>
      )}
    />
  );
};
