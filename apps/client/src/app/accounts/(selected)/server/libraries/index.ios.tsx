import { useAtom, useAtomRefresh } from '@effect/atom-react';
import { Icon } from '@expo/ui';
import { Button, HStack, Host, List, Section, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, headerProminence, tint } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useRouter } from 'expo-router';

import { listLibrariesAtom } from '#src/app/accounts/(selected)/server/libraries/index.ts';
import { ListState } from '#src/components/list-state';
import { PaginationFooter } from '#src/components/pagination-footer';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';

export default function ServerLibrariesScreen() {
  const account = useSelectedAccount();
  const router = useRouter();
  const query = listLibrariesAtom(account);
  const [libraries, loadMoreLibraries] = useAtom(query);
  const refresh = useAtomRefresh(query);

  return (
    <>
      <Stack.Screen.Title>Libraries</Stack.Screen.Title>
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
                  {page.items.length === 0 && page.done ? (
                    <ListState
                      kind="empty"
                      message="No libraries yet. Create a library to get started."
                    />
                  ) : (
                    <List.ForEach data={page.items} keyExtractor={(library) => String(library.id)}>
                      {({ item }) => (
                        <Button
                          modifiers={[tint('primary')]}
                          onPress={() => {
                            router.push({
                              pathname: '/accounts/server/libraries/[id]',
                              params: { id: String(item.id) },
                            });
                          }}>
                          <HStack>
                            <Text>{item.name}</Text>
                            <Spacer />
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
                  )}
                  <PaginationFooter
                    key={page.items.length}
                    page={page}
                    waiting={waiting}
                    onLoadMore={loadMoreLibraries}
                  />
                </>
              ),
              onError: () => (
                <ListState
                  kind="error"
                  message="Unable to load libraries."
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
          </Section>
        </List>
      </Host>
    </>
  );
}
