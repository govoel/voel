import { useAtom, useAtomRefresh } from '@effect/atom-react';
import Add from '@expo/material-symbols/add.xml';
import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Box, Column, FloatingActionButton, Icon, LazyColumn, Row } from '@expo/ui/jetpack-compose';
import { fillMaxSize, onSizeChanged, padding, semantics } from '@expo/ui/jetpack-compose/modifiers';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useRouter } from 'expo-router';

import { listLibrariesAtom } from '#src/app/accounts/(selected)/server/libraries/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { StorageStatus } from '#src/domains/library/components/storage-status';
import {
  libraryFailureMessage,
  mediaTypeLabel,
  storageProviderLabel,
} from '#src/domains/library/management.ts';

export default function ServerLibrariesScreen() {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = listLibrariesAtom(account);
  const [libraries, loadMoreLibraries] = useAtom(query);
  const refresh = useAtomRefresh(query);
  const { onSurfaceVariant } = useMaterialColors();
  const [createActionHeight, setCreateActionHeight] = useAtom(Atom.make(56));

  return (
    <AndroidAccountsSheet>
      {/* The native sheet consumes system-bar insets for both the list and the FAB. */}
      <Box modifiers={[fillMaxSize()]} contentAlignment="bottomEnd">
        <LazyColumn
          modifiers={[fillMaxSize()]}
          contentPadding={{
            start: Spacing.three,
            end: Spacing.three,
            bottom: createActionHeight + Spacing.three * 2,
          }}>
          <Text variant="h3" modifiers={[padding(0, 0, 0, Spacing.two)]}>
            Manage Libraries
          </Text>
          {AsyncResult.matchWithError(libraries, {
            onInitial: () => <ListState kind="loading" />,
            onSuccess: ({ value: page, waiting }) => (
              <>
                {page.items.length === 0 && page.done ? (
                  <ListState
                    kind="empty"
                    message="No libraries yet. Create a library to get started."
                  />
                ) : (
                  <LazyColumn.Items
                    data={page.items}
                    keyExtractor={(library) => String(library.id)}>
                    {({ item, index }) => (
                      <SegmentedListItem
                        index={index}
                        count={page.items.length}
                        modifiers={[
                          padding(0, 0, 0, index < page.items.length - 1 ? Spacing.half : 0),
                        ]}
                        onClick={() => {
                          router.push({
                            pathname: '/accounts/server/libraries/[id]',
                            params: { id: item.id },
                          });
                        }}>
                        <SegmentedListItem.HeadlineContent>
                          <Text>{item.name}</Text>
                        </SegmentedListItem.HeadlineContent>
                        <SegmentedListItem.SupportingContent>
                          <Text variant="caption" color={onSurfaceVariant}>
                            {mediaTypeLabel(item)} · {storageProviderLabel(item)}
                          </Text>
                        </SegmentedListItem.SupportingContent>
                        <SegmentedListItem.TrailingContent>
                          <Row
                            verticalAlignment="center"
                            horizontalArrangement={{ spacedBy: Spacing.two }}>
                            <StorageStatus status={item.storagePluginStatus} />
                            <Icon source={ChevronRight} size={24} tint={onSurfaceVariant} />
                          </Row>
                        </SegmentedListItem.TrailingContent>
                      </SegmentedListItem>
                    )}
                  </LazyColumn.Items>
                )}
                {!page.done ? (
                  <Column modifiers={[padding(0, Spacing.two, 0, 0)]}>
                    <PaginationFooter
                      key={page.items.length}
                      page={page}
                      waiting={waiting}
                      onLoadMore={loadMoreLibraries}
                    />
                  </Column>
                ) : null}
              </>
            ),
            onError: (error) => (
              <ListState
                kind="error"
                message={libraryFailureMessage({ error })}
                onRetry={refresh}
                retrying={libraries.waiting}
              />
            ),
            onDefect: () => (
              <ListState
                kind="error"
                message="Unable to load libraries."
                onRetry={refresh}
                retrying={libraries.waiting}
              />
            ),
          })}
        </LazyColumn>
        <FloatingActionButton
          modifiers={[
            padding(Spacing.three, Spacing.three, Spacing.three, Spacing.three),
            semantics({ contentDescription: 'Create library' }),
            onSizeChanged(({ height }) => {
              setCreateActionHeight(height);
            }),
          ]}
          onClick={() => {
            router.push('/accounts/server/libraries/create');
          }}>
          <FloatingActionButton.Icon>
            <Icon source={Add} size={24} />
          </FloatingActionButton.Icon>
        </FloatingActionButton>
      </Box>
    </AndroidAccountsSheet>
  );
}
