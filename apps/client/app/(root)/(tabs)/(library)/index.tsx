import * as TabsPrimitive from '@rn-primitives/tabs';
import { useStore } from '@tanstack/react-form';
import { useSelector } from '@xstate/store/react';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import * as z from 'zod';

import { BookList } from '~/components/book-list';
import { floatingPlayerStore } from '~/components/floating-player';
import { Search } from '~/components/icons/Search';
import { PersonList } from '~/components/person-list';
import { SeriesList } from '~/components/series-list';
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
            <View
              className={
                isPlayerActive && isUpdatePending
                  ? 'pb-52 pt-6'
                  : isPlayerActive
                    ? 'pb-40 pt-6'
                    : isUpdatePending
                      ? 'pb-32 pt-6'
                      : 'pb-20 pt-6'
              }>
              <TabsContent value="search">
                <SearchTab />
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

  const bookListRef = useRef<FlatList>(null);
  const authorListRef = useRef<FlatList>(null);
  const seriesListRef = useRef<FlatList>(null);
  const narratorListRef = useRef<FlatList>(null);
  const translatorListRef = useRef<FlatList>(null);
  const editorListRef = useRef<FlatList>(null);

  useEffect(() => {
    bookListRef.current?.scrollToOffset({ offset: 0, animated: false });
    authorListRef.current?.scrollToOffset({ offset: 0, animated: false });
    seriesListRef.current?.scrollToOffset({ offset: 0, animated: false });
    narratorListRef.current?.scrollToOffset({ offset: 0, animated: false });
    translatorListRef.current?.scrollToOffset({ offset: 0, animated: false });
    editorListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchQuery]);

  return (
    <>
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
            books={bookSearchResults}
            direction="horizontal"
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
    </>
  );
};

const BookTab = () => {
  const { data, error, refetch, isFetching } = api.books.list.useQuery();

  return (
    <>
      <TitleWithRefetch className="mb-2" refetch={refetch} isFetching={isFetching}>
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
  const { data, error, refetch, isFetching } = api.authors.list.useQuery();

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
        <PersonList people={data} type="author" />
      ) : (
        <View className="p-12 justify-center items-center">
          <Spinner size={15} />
        </View>
      )}
    </>
  );
};

const SeriesTab = () => {
  const { data, error, refetch, isFetching } = api.series.list.useQuery();

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
