import { RegistryContext } from '@effect/atom-react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Array } from 'effect';
import type { Effect as EffectType } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AndroidLibraryScreen from '#src/app/accounts/(selected)/server/libraries/[id]/index.android.tsx';
import IosLibraryScreen from '#src/app/accounts/(selected)/server/libraries/[id]/index.ios.tsx';
import AndroidLibrariesScreen from '#src/app/accounts/(selected)/server/libraries/index.android.tsx';
import IosLibrariesScreen from '#src/app/accounts/(selected)/server/libraries/index.ios.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';

const navigation = vi.hoisted(() => ({ push: vi.fn(), dismissTo: vi.fn(), id: '1' }));
const confirmation = vi.hoisted(() =>
  vi.fn<
    (props: {
      readonly defaultValues: { readonly id: number };
      readonly message: string;
      readonly onSuccess: () => void;
    }) => void
  >()
);

vi.mock('#src/runtime/index.ts', async () => {
  const { Context, Effect, Layer, LayerMap } = await import('effect');
  const { Atom } = await import('effect/reactivity');
  const { FetchHttpClient } = await import('effect/http');
  const { HttpApiClient, HttpApiMiddleware } = await import('effect/http-api');
  const { Api } = await import('@repo/spec-api');
  const { AuthMiddleware } = await import('@repo/spec-api/domains/auth/http.ts');
  const { ApiClient, ApiClientMap } = await import('#src/api-client.ts');
  const makeClient = (
    account: AccountKey
  ): EffectType.Effect<
    EffectType.Success<ReturnType<typeof ApiClient.make>>,
    EffectType.Error<ReturnType<typeof ApiClient.make>>
  > =>
    HttpApiClient.make(Api, { baseUrl: account.serverUrl }).pipe(
      Effect.provide([
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(
              FetchHttpClient.Fetch,
              Object.assign(
                // oxlint-disable-next-line effecttsgo/global-fetch -- Resolve the current transport spy instead of capturing the first test's fetch in the shared layer.
                async (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args),
                globalThis.fetch
              )
            )
          )
        ),
        HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request)),
      ])
    );
  const clients = LayerMap.make((account: AccountKey) =>
    Layer.effect(ApiClient, makeClient(account))
  ).pipe(
    Effect.map((map) => ({
      ...map,
      acquire: (account: AccountKey) =>
        map.contextEffect(account).pipe(Effect.map(Context.get(ApiClient))),
    }))
  );
  return { AppRuntime: Atom.runtime(Layer.effect(ApiClientMap, clients)) };
});
vi.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));
vi.mock('expo-router', () => ({
  useRouter: () => navigation,
  useLocalSearchParams: () => ({ id: navigation.id }),
  Stack: {
    Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> },
    Toolbar: Object.assign(NativeContainer, { Button: NativeButton }),
  },
}));
vi.mock('@expo/material-symbols/add.xml', () => ({ default: 1 }));
vi.mock('@expo/material-symbols/chevron_right.xml', () => ({ default: 2 }));
vi.mock('@expo/ui', () => ({ Icon: () => null }));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: NativeContainer,
  HStack: NativeContainer,
  VStack: NativeContainer,
  Spacer: () => null,
  List: Object.assign(NativeContainer, { ForEach: NativeItems }),
  Section: ({ children, title }: PropsWithChildren<{ readonly title?: string }>) => (
    <View>
      <Text>{title}</Text>
      {children}
    </View>
  ),
  Button: NativeButton,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: () => ({}),
  font: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
  headerProminence: () => ({}),
  tint: () => ({}),
  disabled: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Box: NativeContainer,
  Column: NativeContainer,
  Row: NativeContainer,
  LazyColumn: Object.assign(NativeContainer, { Items: NativeItems }),
  Icon: () => null,
  FloatingActionButton: Object.assign(NativeFab, { Icon: NativeContainer }),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxSize: () => ({}),
  padding: () => ({}),
  semantics: () => ({}),
  onSizeChanged: () => ({}),
}));
vi.mock('#src/components/android-sheet/index.tsx', () => ({
  AndroidAccountsSheet: ({ children }: PropsWithChildren) => <View>{children}</View>,
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/constants/material.ts', () => ({
  useMaterialColors: () => ({ onSurfaceVariant: 'gray', error: 'red' }),
}));
vi.mock('#src/components/segmented-list/index.tsx', () => ({
  SegmentedList: NativeContainer,
  SegmentedListItem: Object.assign(NativeItem, {
    HeadlineContent: NativeContainer,
    SupportingContent: NativeContainer,
    TrailingContent: NativeContainer,
  }),
}));
vi.mock('#src/components/detail-rows', () => ({
  DetailRows: ({
    details,
  }: {
    readonly details: ReadonlyArray<{ label: string; value: string }>;
  }) => (
    <>
      {Array.map(details, ({ label, value }) => (
        <View key={label}>
          <Text>{label}</Text>
          <Text>{value}</Text>
        </View>
      ))}
    </>
  ),
}));
vi.mock('#src/components/list-state', () => ({
  ListState: (props: {
    readonly kind: string;
    readonly message?: string;
    readonly onRetry?: () => void;
  }) => (
    <View>
      <Text>{props.kind === 'loading' ? 'Loading' : props.message}</Text>
      {props.onRetry !== void 0 ? (
        <Pressable onPress={props.onRetry}>
          <Text>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  ),
}));
vi.mock('#src/components/pagination-footer', () => ({
  PaginationFooter: ({
    page,
    onLoadMore,
  }: {
    readonly page: { readonly done: boolean };
    readonly onLoadMore: () => void;
  }) =>
    page.done ? null : (
      <Pressable onPress={onLoadMore}>
        <Text>Load more</Text>
      </Pressable>
    ),
}));
vi.mock('#src/domains/library/components/storage-status', () => ({
  StorageStatus: ({ status }: { readonly status: string }) => <Text>{status}</Text>,
}));
vi.mock('#src/components/mutation-confirmation', () => ({
  MutationConfirmation: (
    props: Parameters<typeof confirmation>[0] & {
      readonly trigger: (state: { open: () => void; busy: boolean }) => ReactElement;
    }
  ) =>
    props.trigger({
      open: () => {
        confirmation(props);
      },
      busy: false,
    }),
}));

// oxlint-disable eslint/func-style -- Mock factories run before initializers; declarations keep these adapters hoist-safe.
function NativeContainer({ children }: PropsWithChildren) {
  return <View>{children}</View>;
}
function NativeButton({
  children,
  onPress,
  accessibilityLabel,
}: PropsWithChildren<{ readonly onPress: () => void; readonly accessibilityLabel?: string }>) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Pressable>
  );
}
function NativeItem({ children, onClick }: PropsWithChildren<{ readonly onClick?: () => void }>) {
  return <Pressable onPress={onClick}>{children}</Pressable>;
}
function NativeFab({ children, onClick }: PropsWithChildren<{ readonly onClick: () => void }>) {
  return (
    <Pressable onPress={onClick} accessibilityLabel="Create library">
      {children}
    </Pressable>
  );
}
function NativeItems<Item>({
  data,
  children,
  keyExtractor,
}: {
  readonly data: ReadonlyArray<Item>;
  readonly keyExtractor: (item: Item) => string;
  readonly children: (row: { item: Item; index: number }) => ReactNode;
}) {
  return (
    <>
      {Array.map(data, (item, index) => (
        <View key={keyExtractor(item)}>{children({ item, index })}</View>
      ))}
    </>
  );
}

// oxlint-enable eslint/func-style

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const library = {
  id: 1,
  name: 'Movies',
  type: 'movie',
  storagePluginId: 'builtin:local',
  storagePluginSettings: { roots: [] },
};
const registries = new Set<AtomRegistry.AtomRegistry>();
const renderScreen = async (children: ReactElement) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  return render(children, {
    wrapper: ({ children: content }: PropsWithChildren) => (
      <RegistryContext.Provider value={registry}>
        <SelectedAccountContext.Provider value={account}>{content}</SelectedAccountContext.Provider>
      </RegistryContext.Provider>
    ),
  });
};

beforeEach(() => {
  navigation.push.mockClear();
  navigation.dismissTo.mockClear();
  navigation.id = '1';
  confirmation.mockClear();
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.restoreAllMocks();
});

describe.each([
  { platform: 'iOS', ListScreen: IosLibrariesScreen, DetailScreen: IosLibraryScreen },
  { platform: 'Android', ListScreen: AndroidLibrariesScreen, DetailScreen: AndroidLibraryScreen },
])('$platform library management', ({ ListScreen, DetailScreen }) => {
  it('loads successive pages and navigates to create and library details', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return Response.json(
        url.searchParams.has('cursor')
          ? {
              items: [{ ...library, id: 2, name: 'More movies', storagePluginStatus: 'unknown' }],
              nextCursor: { _tag: 'None' },
            }
          : {
              items: [{ ...library, storagePluginStatus: 'healthy' }],
              nextCursor: { _tag: 'Some', value: 1 },
            }
      );
    });
    await renderScreen(<ListScreen />);
    await screen.findByText('Movies');
    await fireEvent.press(screen.getByLabelText('Create library'));
    expect(navigation.push).toHaveBeenCalledWith('/accounts/server/libraries/create');
    await fireEvent.press(screen.getByText('Movies'));
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/accounts/server/libraries/[id]',
      params: { id: 1 },
    });
    await fireEvent.press(screen.getByText('Load more'));
    await screen.findByText('More movies');
    expect(fetch).toHaveBeenCalledTimes(2);
    const request = fetch.mock.calls[1]?.[0];
    expect(
      new URL(request instanceof Request ? request.url : String(request)).searchParams.get('cursor')
    ).toBe('1');
  });

  it('retries a failed request and presents an empty list without hiding create', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ _tag: 'ForbiddenError' }, { status: 403 }))
      .mockImplementation(async () => Response.json({ items: [], nextCursor: { _tag: 'None' } }));
    await renderScreen(<ListScreen />);
    await screen.findByText('Only server administrators can manage libraries.');
    await fireEvent.press(screen.getByText('Retry'));
    await screen.findByText('No libraries yet. Create a library to get started.');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Create library')).toBeOnTheScreen();
  });

  it('shows plugin failures without loading plugin settings, and offers edit and confirmation', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        ...library,
        storagePluginId: 'npm:@example/storage@1.2.3',
        storagePluginHealth: {
          status: 'unhealthy',
          errors: [{ _tag: 'PluginLoadError', message: 'Cannot import storage plugin.' }],
        },
      })
    );
    await renderScreen(<DetailScreen />);
    await screen.findByText('Cannot import storage plugin.');
    expect(screen.getByText('npm:@example/storage@1.2.3')).toBeOnTheScreen();
    expect(screen.getByText('Needs attention')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Edit library'));
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/accounts/server/libraries/[id]/edit',
      params: { id: 1 },
    });
    await fireEvent.press(screen.getByText('Delete library'));
    expect(confirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValues: { id: 1 },
        message: 'Delete “Movies” from this server? This cannot be undone.',
      })
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(new URL(request instanceof Request ? request.url : String(request)).pathname).toBe(
      '/api/libraries/1'
    );
    await act(async () => confirmation.mock.calls[0]?.[0].onSuccess());
    expect(navigation.dismissTo).toHaveBeenCalledWith('/accounts/server/libraries');
  });

  it('rejects an invalid route before issuing a request', async () => {
    navigation.id = 'invalid';
    const fetch = vi.spyOn(globalThis, 'fetch');
    await renderScreen(<DetailScreen />);
    await screen.findByText('The library ID or server response is invalid.');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('Edit library')).toBeNull();
  });
});
