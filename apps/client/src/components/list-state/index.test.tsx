import { fireEvent, render, screen } from '@testing-library/react-native';
import { Array, Predicate } from 'effect';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { ListState as AndroidListState } from '#src/components/list-state/index.android.tsx';
import { ListState as IosListState } from '#src/components/list-state/index.ios.tsx';

vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/constants/material.ts', () => ({
  useMaterialColors: () => ({
    onSurface: 'black',
    onSurfaceVariant: 'gray',
    primary: 'blue',
  }),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  LoadingIndicator: () => <ActivityIndicator testID="loading" />,
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({}),
  size: () => ({}),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  containerRelativeFrame: () => ({}),
  foregroundStyle: () => ({}),
  disabled: (value: boolean) => ({ disabled: value }),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  HStack: View,
  ProgressView: () => <ActivityIndicator testID="loading" />,
  Button: ({
    children,
    onPress,
    modifiers,
  }: PropsWithChildren<{
    readonly onPress: () => void;
    readonly modifiers: ReadonlyArray<object>;
  }>) => (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={Array.some(
        modifiers,
        (modifier) => Predicate.hasProperty(modifier, 'disabled') && modifier.disabled === true
      )}>
      {children}
    </Pressable>
  ),
}));
vi.mock('#src/components/segmented-list/index.tsx', () => ({
  SegmentedList: View,
  SegmentedListItem: Object.assign(
    ({
      children,
      onClick,
      enabled,
    }: PropsWithChildren<{ readonly onClick?: () => void; readonly enabled: boolean }>) =>
      onClick !== void 0 ? (
        <Pressable role="button" onPress={onClick} disabled={!enabled}>
          {children}
        </Pressable>
      ) : (
        <View>{children}</View>
      ),
    { HeadlineContent: View, TrailingContent: View }
  ),
}));

describe.each([
  ['iOS', IosListState],
  ['Android', AndroidListState],
] as const)('%s list states', (_platform, ListState) => {
  it('renders each state and only offers retry for errors', async () => {
    const handleRetry = vi.fn<() => void>();
    const view = await render(<ListState kind="loading" />);
    expect(screen.getByTestId('loading')).toBeVisible();

    await view.rerender(<ListState kind="empty" message="No items yet" />);
    expect(screen.getByText('No items yet')).toBeVisible();
    expect(screen.queryByTestId('loading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    await view.rerender(<ListState kind="message" message="Choose an account" />);
    expect(screen.getByText('Choose an account')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();

    await view.rerender(
      <ListState kind="error" message="Failed" onRetry={handleRetry} retrying={false} />
    );
    expect(screen.getByText('Failed')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(handleRetry).toHaveBeenCalledOnce();

    await view.rerender(<ListState kind="error" message="Failed" onRetry={handleRetry} retrying />);
    expect(screen.getByTestId('loading')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();

    await view.rerender(<ListState kind="loading" />);
    expect(screen.getByTestId('loading')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
