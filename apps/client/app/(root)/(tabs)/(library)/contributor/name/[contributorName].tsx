import { Stack, useLocalSearchParams } from 'expo-router';
import type { Selectable } from 'kysely';
import React, { type ComponentPropsWithoutRef } from 'react';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large } from '~/components/ui/typography';

import api from '~/lib/api';
import type { InstanceDatabase } from '~/lib/db/schema/instance';

export default function ContributorNameScreen() {
  const { contributorName } = useLocalSearchParams<{ contributorName: string }>();

  const {
    data: booksAsAuthor,
    error: booksAsAuthorError,
    refetch: booksAsAuthorRefetch,
    isFetching: booksAsAuthorFetching,
    isLoading: booksAsAuthorLoading,
  } = api.contributors.listBooksByName.useQuery('author', contributorName);

  const {
    data: booksAsNarrator,
    error: booksAsNarratorError,
    refetch: booksAsNarratorRefetch,
    isFetching: booksAsNarratorFetching,
    isLoading: booksAsNarratorLoading,
  } = api.contributors.listBooksByName.useQuery('narrator', contributorName);

  const {
    data: booksAsEditor,
    error: booksAsEditorError,
    refetch: booksAsEditorRefetch,
    isFetching: booksAsEditorFetching,
    isLoading: booksAsEditorLoading,
  } = api.contributors.listBooksByName.useQuery('editor', contributorName);

  const {
    data: booksAsTranslator,
    error: booksAsTranslatorError,
    refetch: booksAsTranslatorRefetch,
    isFetching: booksAsTranslatorFetching,
    isLoading: booksAsTranslatorLoading,
  } = api.contributors.listBooksByName.useQuery('translator', contributorName);

  const {
    data: booksAsForeword,
    error: booksAsForewordError,
    refetch: booksAsForewordRefetch,
    isFetching: booksAsForewordFetching,
    isLoading: booksAsForewordLoading,
  } = api.contributors.listBooksByName.useQuery('foreword', contributorName);

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Contributor' }} />
      <FloatingPlayerDodgingScrollView>
        <H2 className="border-0 pt-4 text-center">{contributorName}</H2>

        <AsRoleBookList
          role="author"
          books={booksAsAuthor}
          error={booksAsAuthorError}
          isFetching={booksAsAuthorFetching}
          refetch={booksAsAuthorRefetch}
        />

        <AsRoleBookList
          role="narrator"
          books={booksAsNarrator}
          error={booksAsNarratorError}
          isFetching={booksAsNarratorFetching}
          refetch={booksAsNarratorRefetch}
        />

        <AsRoleBookList
          role="editor"
          books={booksAsEditor}
          error={booksAsEditorError}
          isFetching={booksAsEditorFetching}
          refetch={booksAsEditorRefetch}
        />

        <AsRoleBookList
          role="translator"
          books={booksAsTranslator}
          error={booksAsTranslatorError}
          isFetching={booksAsTranslatorFetching}
          refetch={booksAsTranslatorRefetch}
        />

        <AsRoleBookList
          role="foreword"
          books={booksAsForeword}
          error={booksAsForewordError}
          isFetching={booksAsForewordFetching}
          refetch={booksAsForewordRefetch}
        />

        {booksAsAuthorLoading ||
        booksAsNarratorLoading ||
        booksAsEditorLoading ||
        booksAsTranslatorLoading ||
        booksAsForewordLoading ? (
          <View className="p-12 justify-center items-center">
            <Spinner size={15} />
          </View>
        ) : null}
      </FloatingPlayerDodgingScrollView>
    </>
  );
}

export const AsRoleBookList = ({
  role,
  books,
  error,
  isFetching,
  refetch,
}: {
  role: Selectable<InstanceDatabase['bookContributor']>['role'];
  books: ComponentPropsWithoutRef<typeof BookList>['books'];
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}) => {
  if (error) {
    return (
      <>
        <TitleWithRefetch refetch={refetch} isFetching={isFetching} className="mt-4 mb-2">
          As {role.charAt(0).toUpperCase() + role.slice(1)}
        </TitleWithRefetch>
        <Card className="mb-4">
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
      </>
    );
  }

  if (books && books.length > 0) {
    return (
      <>
        <TitleWithRefetch refetch={refetch} isFetching={isFetching} className="mt-4 mb-2">
          As {role.charAt(0).toUpperCase() + role.slice(1)} ({books.length})
        </TitleWithRefetch>

        <BookList books={books} key={`as-${role}`} direction="horizontal" />
      </>
    );
  }

  return null;
};
