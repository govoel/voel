import type { Button as AndroidButton, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { BottomSheet, Button as IosButton } from '@expo/ui/swift-ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useImperativeHandle, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';

import { EditorSheet as AndroidEditorSheet } from './ui.android.tsx';
import { EditorSheet as IosEditorSheet } from './ui.ios.tsx';

const { hide } = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));

// Only the native presentation boundary is mocked; exercise the real sheet lifecycle.
vi.mock('@expo/ui/jetpack-compose', () => ({
  Button: ({ children, onClick }: Parameters<typeof AndroidButton>[0]) => (
    <Pressable onPress={onClick}>{children}</Pressable>
  ),
  ModalBottomSheet: ({
    children,
    onDismissRequest,
    ref,
  }: Parameters<typeof ModalBottomSheet>[0]) => {
    useImperativeHandle(ref, () => ({ hide, expand: hide, partialExpand: hide }), []);
    return (
      <>
        {children}
        <Pressable onPress={onDismissRequest}>
          <Text>Dismiss</Text>
        </Pressable>
      </>
    );
  },
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: vi.fn() }));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: ({ children, onPress }: Parameters<typeof IosButton>[0]) => (
    <Pressable onPress={onPress}>{children}</Pressable>
  ),
  BottomSheet: ({
    anchor,
    children,
    isPresented,
    onIsPresentedChange,
  }: Parameters<typeof BottomSheet>[0]) => (
    <>
      {anchor}
      {children}
      {isPresented ? (
        <Pressable
          onPress={() => {
            onIsPresentedChange(false);
          }}>
          <Text>Dismiss</Text>
        </Pressable>
      ) : null}
    </>
  ),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ disabled: vi.fn() }));
vi.mock('#src/components/android-sheet/index.tsx', () => ({ AndroidAccountsSheet: () => null }));
vi.mock('#src/components/text', async () => {
  const native = await import('react-native');
  return { Text: native.Text };
});

const Editor = ({ onSuccess }: Parameters<Parameters<typeof IosEditorSheet>[0]['children']>[0]) => {
  const [password, setPassword] = useState('');
  return (
    <>
      <TextInput testID="password" value={password} onChangeText={setPassword} />
      <Pressable
        onPress={() => {
          void onSuccess();
        }}>
        <Text>Save</Text>
      </Pressable>
    </>
  );
};

beforeEach(() => {
  hide.mockReset().mockResolvedValue();
});

it.each([
  { platform: 'Android', EditorSheet: AndroidEditorSheet },
  { platform: 'iOS', EditorSheet: IosEditorSheet },
])(
  '$platform retains edits across renders but clears them on dismissal and success',
  async ({ EditorSheet }) => {
    const view = await render(
      <EditorSheet title="Edit">{({ onSuccess }) => <Editor onSuccess={onSuccess} />}</EditorSheet>
    );
    expect(screen.queryByTestId('password')).toBeNull();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.changeText(screen.getByTestId('password'), 'secret');

    await view.rerender(
      <EditorSheet title="Edit again">
        {({ onSuccess }) => <Editor onSuccess={onSuccess} />}
      </EditorSheet>
    );
    expect(screen.getByTestId('password')).toHaveDisplayValue('secret');

    await fireEvent.press(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('password')).toBeNull();
    await fireEvent.press(screen.getByText('Edit again'));
    expect(screen.getByTestId('password')).toHaveDisplayValue('');

    await fireEvent.changeText(screen.getByTestId('password'), 'new secret');
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.queryByTestId('password')).toBeNull();
    await fireEvent.press(screen.getByText('Edit again'));
    expect(screen.getByTestId('password')).toHaveDisplayValue('');
  }
);

it('waits for the Android hide animation before unmounting the editor', async () => {
  const animation = Promise.withResolvers<Awaited<ReturnType<typeof hide>>>();
  hide.mockReturnValue(animation.promise);
  await render(
    <AndroidEditorSheet title="Edit">
      {({ onSuccess }) => <Editor onSuccess={onSuccess} />}
    </AndroidEditorSheet>
  );
  await fireEvent.press(screen.getByText('Edit'));
  await fireEvent.press(screen.getByText('Save'));
  expect(hide).toHaveBeenCalledOnce();
  expect(screen.getByTestId('password')).toBeOnTheScreen();

  await act(async () => {
    animation.resolve();
    await animation.promise;
  });
  expect(screen.queryByTestId('password')).toBeNull();
});
