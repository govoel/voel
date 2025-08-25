import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { ExpandableSummary } from '~/components/expandable-summary';
import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { Image } from '~/components/image';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Text } from '~/components/ui/text';
import { H2, Large } from '~/components/ui/typography';

import api from '~/lib/api';

import { AsRoleBookList } from '~/app/(root)/(tabs)/(library)/contributor/name/[contributorName]';

export default function ContributorIDScreen() {
  const { contributorId: contributorIdRaw } = useLocalSearchParams<{ contributorId: string }>();

  const contributorId = parseInt(contributorIdRaw, 10);

  const {
    data: contributor,
    error: contributorError,
    refetch: contributorRefetch,
  } = api.contributors.getById.useQuery(contributorId);

  const {
    data: booksAsAuthor,
    error: booksAsAuthorError,
    refetch: booksAsAuthorRefetch,
    isFetching: booksAsAuthorFetching,
  } = api.contributors.listBooksById.useQuery('author', contributorId);

  const {
    data: booksAsNarrator,
    error: booksAsNarratorError,
    refetch: booksAsNarratorRefetch,
    isFetching: booksAsNarratorFetching,
  } = api.contributors.listBooksById.useQuery('narrator', contributorId);

  const {
    data: booksAsEditor,
    error: booksAsEditorError,
    refetch: booksAsEditorRefetch,
    isFetching: booksAsEditorFetching,
  } = api.contributors.listBooksById.useQuery('editor', contributorId);

  const {
    data: booksAsTranslator,
    error: booksAsTranslatorError,
    refetch: booksAsTranslatorRefetch,
    isFetching: booksAsTranslatorFetching,
  } = api.contributors.listBooksById.useQuery('translator', contributorId);

  const {
    data: booksAsForeword,
    error: booksAsForewordError,
    refetch: booksAsForewordRefetch,
    isFetching: booksAsForewordFetching,
  } = api.contributors.listBooksById.useQuery('foreword', contributorId);

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Contributor' }} />

      <FloatingPlayerDodgingScrollView>
        {contributorError ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading contributor {contributorId}</Large>
              <Text className="text-muted-foreground">
                {contributorError.message || 'Unknown error'}
              </Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => contributorRefetch()}>
                <Text>Retry</Text>
              </Button>
            </CardFooter>
          </Card>
        ) : contributor ? (
          <>
            {contributor.avatar ? (
              <AspectRatio ratio={1 / 1} className="mx-20">
                <Image
                  className="w-full h-full rounded-md"
                  source={contributor.avatar}
                  placeholder={{ thumbhash: contributor.avatarThumbhash ?? undefined }}
                />
              </AspectRatio>
            ) : null}

            <H2 className="border-0 pt-4 text-center">{contributor.name}</H2>

            {contributor.about ? (
              <View className="pt-4">
                <ExpandableSummary
                  summary={contributor.about}
                  expandText="Expand About"
                  collapseText="Collapse About"
                />
              </View>
            ) : null}
          </>
        ) : null}

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
