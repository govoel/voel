import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import { Button, HStack, Host, List, Section, Spacer, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  font,
  foregroundStyle,
  frame,
  headerProminence,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';

import type { StoragePluginStatus } from '@repo/spec-api/domains/library/schema.ts';

import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import {
  listLibrariesAtom,
  mediaTypeLabel,
  storageProviderLabel,
  storageStatusLabel,
} from '#src/domains/library/management.ts';

export default function ServerLibrariesScreen() {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = listLibrariesAtom(account);
  const [libraries, loadMoreLibraries] = useAtom(query);
  const refresh = useAtomRefresh(query);

  return (
    <>
      <Stack.Screen.Title>Manage Libraries</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          accessibilityLabel="Create library"
          onPress={() => {
            router.push('/accounts/server/libraries/create');
          }}>
          Create library
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }}>
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Section title="Libraries">
            {AsyncResult.matchWithError(libraries, {
              onInitial: () => <ListState kind="loading" />,
              onSuccess: ({ value: page, waiting }) => (
                <>
                  <List.ForEach data={page.items} keyExtractor={(library) => String(library.id)}>
                    {({ item }) => (
                      <Button
                        modifiers={[
                          tint('primary'),
                          accessibilityLabel(
                            `${item.name}, ${mediaTypeLabel(item)}, ${storageProviderLabel(item)}, ${storageStatusLabel({ status: item.storagePluginStatus })}`
                          ),
                        ]}
                        onPress={() => {
                          router.push({
                            pathname: '/accounts/server/libraries/[id]',
                            params: { id: item.id },
                          });
                        }}>
                        <HStack>
                          <VStack alignment="leading" spacing={2}>
                            <Text>{item.name}</Text>
                            <Text
                              variant="caption"
                              modifiers={[
                                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                              ]}>
                              {mediaTypeLabel(item)} · {storageProviderLabel(item)}
                            </Text>
                          </VStack>
                          <Spacer />
                          <StorageStatus status={item.storagePluginStatus} />
                          <Icon
                            name="chevron.right"
                            modifiers={[
                              font({ textStyle: 'footnote', weight: 'semibold' }),
                              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                            ]}
                          />
                        </HStack>
                      </Button>
                    )}
                  </List.ForEach>
                  <PaginationFooter
                    key={page.items.length}
                    page={page}
                    waiting={waiting}
                    onLoadMore={loadMoreLibraries}
                  />
                </>
              ),
              onError: (error) =>
                Match.value(error).pipe(
                  Match.tag('NoSuchElementError', () => (
                    <ListState
                      kind="empty"
                      message="No libraries yet. Create a library to get started."
                    />
                  )),
                  Match.tag(
                    'UnauthorizedError',
                    'ForbiddenError',
                    'SchemaError',
                    'HttpClientError',
                    'BetterAuthClientInitializationError',
                    (failure) => (
                      <ListState
                        kind="error"
                        message={libraryFailureMessage({ error: failure })}
                        onRetry={refresh}
                        retrying={libraries.waiting}
                      />
                    )
                  ),
                  Match.exhaustive
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
          </Section>
        </List>
      </Host>
    </>
  );
}

const StorageStatus = ({ status }: { readonly status: typeof StoragePluginStatus.Type }) => {
  const appearance = Match.value(status).pipe(
    Match.literalsExhaustive({
      healthy: () => ({
        name: 'checkmark' as const,
        style: { type: 'hierarchical' as const, style: 'secondary' as const },
      }),
      unknown: () => ({
        name: 'questionmark.circle' as const,
        style: { type: 'hierarchical' as const, style: 'secondary' as const },
      }),
      unhealthy: () => ({ name: 'exclamationmark.triangle' as const, style: 'orange' as const }),
    })
  );
  return (
    <Icon
      name={appearance.name}
      modifiers={[
        accessibilityLabel(storageStatusLabel({ status })),
        foregroundStyle(appearance.style),
      ]}
    />
  );
};
