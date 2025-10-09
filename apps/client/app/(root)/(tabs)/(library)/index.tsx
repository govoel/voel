import * as TabsPrimitive from '@rn-primitives/tabs';
import type { FlashListRef } from '@shopify/flash-list';
import { useStore } from '@tanstack/react-form';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import * as z from 'zod';

import { BookList, type BookListBook } from '~/components/book-list';
import { floatingPlayerStore } from '~/components/floating-player';
import { Search } from '~/components/icons/Search';
import { PersonList, type PersonListPerson } from '~/components/person-list';
import { SeriesList, type SeriesListSeries } from '~/components/series-list';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { useAppForm } from '~/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';

import api from '~/lib/api';
import { cn } from '~/lib/utils';

export default function LibraryScreen() {
  const [currentTab, setCurrentTab] = useState('books');

  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  const tabBarHeight = useBottomTabBarHeight();

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
          className="w-full absolute px-4"
          style={{
            bottom:
              (Platform.OS === 'ios' ? tabBarHeight : 0) +
              (isPlayerActive && isUpdatePending
                ? 126
                : isPlayerActive
                  ? 75
                  : isUpdatePending
                    ? 60
                    : 10),
          }}>
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
  } = api.contributors.search.useQuery('author', searchQuery);

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

  const {
    data: forewordSearchResults,
    error: forewordSearchError,
    refetch: forewordSearchRefetch,
    isFetching: forewordSearchIsFetching,
  } = api.contributors.search.useQuery('foreword', searchQuery);

  const bookListRef = useRef<FlashListRef<BookListBook>>(null);
  const authorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const seriesListRef = useRef<FlashListRef<SeriesListSeries>>(null);
  const narratorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const translatorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const editorListRef = useRef<FlashListRef<PersonListPerson>>(null);
  const forewordListRef = useRef<FlashListRef<PersonListPerson>>(null);

  useEffect(() => {
    bookListRef.current?.scrollToTop({ animated: false });
    authorListRef.current?.scrollToTop({ animated: false });
    seriesListRef.current?.scrollToTop({ animated: false });
    narratorListRef.current?.scrollToTop({ animated: false });
    translatorListRef.current?.scrollToTop({ animated: false });
    editorListRef.current?.scrollToTop({ animated: false });
    forewordListRef.current?.scrollToTop({ animated: false });
  }, [searchQuery]);

  return (
    <ScrollView className="px-6">
      <View className={useFloatingPlayerAndTabsPaddingClass()}>
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
                    editorSearchIsFetching ||
                    forewordSearchIsFetching,
                }}
              />
            )}
          />
        </SearchForm.AppForm>

        {bookSearchError || (bookSearchResults && bookSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={bookSearchRefetch}
              isFetching={bookSearchIsFetching}>
              Books
              {bookSearchResults &&
                bookSearchResults.length > 0 &&
                ` (${bookSearchResults.length})`}
            </TitleWithRefetch>
            <BookList
              ref={bookListRef}
              direction="horizontal"
              books={bookSearchResults}
              className="mb-2"
              error={bookSearchError}
              refetch={bookSearchRefetch}
            />
          </>
        ) : null}

        {authorSearchError || (authorSearchResults && authorSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={authorSearchRefetch}
              isFetching={authorSearchIsFetching}>
              Authors
              {authorSearchResults &&
                authorSearchResults.length > 0 &&
                ` (${authorSearchResults.length})`}
            </TitleWithRefetch>
            <PersonList
              ref={authorListRef}
              people={authorSearchResults}
              error={authorSearchError}
              refetch={authorSearchRefetch}
              type="author"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {seriesSearchError || (seriesSearchResults && seriesSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={seriesSearchRefetch}
              isFetching={seriesSearchIsFetching}>
              Series
              {seriesSearchResults &&
                seriesSearchResults.length > 0 &&
                ` (${seriesSearchResults.length})`}
            </TitleWithRefetch>
            <SeriesList
              ref={seriesListRef}
              series={seriesSearchResults}
              error={seriesSearchError}
              refetch={seriesSearchRefetch}
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {narratorSearchError || (narratorSearchResults && narratorSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={narratorSearchRefetch}
              isFetching={narratorSearchIsFetching}>
              Narrators
              {narratorSearchResults &&
                narratorSearchResults.length > 0 &&
                ` (${narratorSearchResults.length})`}
            </TitleWithRefetch>
            <PersonList
              ref={narratorListRef}
              people={narratorSearchResults}
              error={narratorSearchError}
              refetch={narratorSearchRefetch}
              type="narrator"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {translatorSearchError ||
        (translatorSearchResults && translatorSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={translatorSearchRefetch}
              isFetching={translatorSearchIsFetching}>
              Translators
              {translatorSearchResults &&
                translatorSearchResults.length > 0 &&
                ` (${translatorSearchResults.length})`}
            </TitleWithRefetch>
            <PersonList
              ref={translatorListRef}
              people={translatorSearchResults}
              error={translatorSearchError}
              refetch={translatorSearchRefetch}
              type="translator"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {editorSearchError || (editorSearchResults && editorSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={editorSearchRefetch}
              isFetching={editorSearchIsFetching}>
              Editors
              {editorSearchResults &&
                editorSearchResults.length > 0 &&
                ` (${editorSearchResults.length})`}
            </TitleWithRefetch>
            <PersonList
              ref={editorListRef}
              people={editorSearchResults}
              error={editorSearchError}
              refetch={editorSearchRefetch}
              type="editor"
              direction="horizontal"
              className="mb-2"
            />
          </>
        ) : null}

        {forewordSearchError || (forewordSearchResults && forewordSearchResults.length > 0) ? (
          <>
            <TitleWithRefetch
              className="mb-2"
              refetch={forewordSearchRefetch}
              isFetching={forewordSearchIsFetching}>
              Forewords
              {forewordSearchResults &&
                forewordSearchResults.length > 0 &&
                ` (${forewordSearchResults.length})`}
            </TitleWithRefetch>
            <PersonList
              ref={forewordListRef}
              people={forewordSearchResults}
              error={forewordSearchError}
              refetch={forewordSearchRefetch}
              type="foreword"
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
          editorSearchResults.length === 0 &&
          forewordSearchResults &&
          forewordSearchResults.length === 0 && (
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

  if (isPlayerActive && isUpdatePending) return 'pt-6 pb-52';
  if (isPlayerActive) return 'pt-6 pb-40';
  if (isUpdatePending) return 'pt-6 pb-32';
  return 'pt-6 pb-20';
};

const BookTab = () => {
  const {
    data,
    error,
    refetch,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    isFetchNextPageError,
  } = api.books.list.useInfiniteQuery();

  return (
    <BookList
      books={data}
      error={error}
      refetch={refetch}
      onEndReached={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetchNextPageError={isFetchNextPageError}
      direction="vertical"
      contentContainerClassName={cn(useFloatingPlayerAndTabsPaddingClass(), 'px-6')}
      ListHeaderComponent={
        <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
          All Books
        </TitleWithRefetch>
      }
    />
  );
};

const AuthorTab = () => {
  const { data, error, refetch, isFetching } = api.contributors.list.useQuery('author');

  return (
    <PersonList
      people={data}
      error={error}
      refetch={refetch}
      type="author"
      direction="vertical"
      contentContainerClassName={cn(useFloatingPlayerAndTabsPaddingClass(), 'px-6')}
      ListHeaderComponent={
        <>
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            All Authors
          </TitleWithRefetch>
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
      contentContainerClassName={cn(useFloatingPlayerAndTabsPaddingClass(), 'px-6')}
      ListHeaderComponent={() => (
        <>
          <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
            All Series
          </TitleWithRefetch>
        </>
      )}
    />
  );
};
