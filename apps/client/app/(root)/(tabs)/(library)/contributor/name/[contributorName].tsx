import { Stack, useLocalSearchParams } from 'expo-router';
import type { Selectable } from 'kysely';
import React, { type ComponentPropsWithoutRef } from 'react';
import { View } from 'react-native';

import { BookList } from '~/components/book-list';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { H2 } from '~/components/ui/typography';

import api from '~/lib/api';
import type { InstanceDatabase } from '~/lib/db/schema/instance';

export default function ContributorNameScreen() {
  const { contributorName } = useLocalSearchParams<{ contributorName: string }>();

  const {
    data: booksAsAuthor,
    error: booksAsAuthorError,
    refetch: booksAsAuthorRefetch,
    isFetching: booksAsAuthorFetching,
  } = api.contributors.listBooksByName.useQuery('author', contributorName);

  const {
    data: booksAsNarrator,
    error: booksAsNarratorError,
    refetch: booksAsNarratorRefetch,
    isFetching: booksAsNarratorFetching,
  } = api.contributors.listBooksByName.useQuery('narrator', contributorName);

  const {
    data: booksAsEditor,
    error: booksAsEditorError,
    refetch: booksAsEditorRefetch,
    isFetching: booksAsEditorFetching,
  } = api.contributors.listBooksByName.useQuery('editor', contributorName);

  const {
    data: booksAsTranslator,
    error: booksAsTranslatorError,
    refetch: booksAsTranslatorRefetch,
    isFetching: booksAsTranslatorFetching,
  } = api.contributors.listBooksByName.useQuery('translator', contributorName);

  const {
    data: booksAsForeword,
    error: booksAsForewordError,
    refetch: booksAsForewordRefetch,
    isFetching: booksAsForewordFetching,
  } = api.contributors.listBooksByName.useQuery('foreword', contributorName);

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Contributor' }} />
      <FloatingPlayerDodgingScrollView>
        <H2 className="border-0 pt-4 text-center">{contributorName}</H2>

        <AsRoleBookList
          className="mt-4"
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
      </FloatingPlayerDodgingScrollView>
    </>
  );
}

const roleToText = {
  author: 'Author',
  narrator: 'Narrator',
  editor: 'Editor',
  translator: 'Translator',
  foreword: 'Foreword Author',
} as const;

export const AsRoleBookList = ({
  role,
  books,
  error,
  isFetching,
  refetch,
  className,
}: {
  role: Selectable<InstanceDatabase['bookContributor']>['role'];
  books: ComponentPropsWithoutRef<typeof BookList>['books'];
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  className?: string;
}) => {
  return (
    <View className={className}>
      <TitleWithRefetch refetch={refetch} isFetching={isFetching} className="mb-2">
        As {roleToText[role]} {books && books.length > 0 && `(${books.length})`}
      </TitleWithRefetch>

      <BookList
        books={books}
        direction="horizontal"
        error={error}
        refetch={refetch}
        className="mb-2"
      />
    </View>
  );
};
