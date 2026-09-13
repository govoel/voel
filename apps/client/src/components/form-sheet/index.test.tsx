import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useImperativeHandle, useState } from 'react';
import type { PropsWithChildren, Ref } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormSheet as AndroidFormSheet } from './index.android.tsx';
import { FormSheet as IOSFormSheet } from './index.ios.tsx';

const { hide } = vi.hoisted(() => ({ hide: vi.fn(async () => void 0) }));

vi.mock('@expo/ui/jetpack-compose', () => ({
  ModalBottomSheet: ({
    children,
    ref,
    onDismissRequest,
  }: PropsWithChildren<{
    ref: Ref<{ hide: () => Promise<void> }>;
    onDismissRequest: () => void;
  }>) => {
    useImperativeHandle(ref, () => ({ hide }), []);
    return (
      <>
        <Pressable testID="dismiss" onPress={onDismissRequest} />
        {children}
      </>
    );
  },
}));
vi.mock('@expo/ui/swift-ui', () => ({
  BottomSheet: ({
    children,
    onIsPresentedChange,
  }: PropsWithChildren<{
    onIsPresentedChange: (open: boolean) => void;
  }>) => (
    <>
      <Pressable
        testID="dismiss"
        onPress={() => {
          onIsPresentedChange(false);
        }}
      />
      {children}
    </>
  ),
}));

const Editor = ({ close }: { close: () => Promise<void> }) => {
  const [password, setPassword] = useState('');
  return (
    <>
      <TextInput testID="password" value={password} onChangeText={setPassword} />
      <Pressable
        testID="save"
        onPress={() => {
          void close();
        }}>
        <Text>Save</Text>
      </Pressable>
    </>
  );
};

beforeEach(() => {
  hide.mockReset();
});

const Example = ({ Sheet }: { Sheet: typeof AndroidFormSheet }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="open"
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        {(close) => <Editor close={close} />}
      </Sheet>
    </>
  );
};

for (const [platform, Sheet] of [
  ['ios', IOSFormSheet],
  ['android', AndroidFormSheet],
] as const) {
  describe(`${platform} form sheet`, () => {
    it('discards sensitive state on dismissal and starts fresh on reopening', async () => {
      await render(<Example Sheet={Sheet} />);
      await fireEvent.press(screen.getByTestId('open'));
      await fireEvent.changeText(screen.getByTestId('password'), 'secret');
      await fireEvent.press(screen.getByTestId('dismiss'));
      expect(screen.queryByTestId('password')).toBeNull();
      await fireEvent.press(screen.getByTestId('open'));
      expect(screen.getByTestId('password').props['value']).toBe('');
    });

    it('closes on success, awaiting the Android hide animation before unmounting', async () => {
      const animation = Promise.withResolvers<boolean>();
      hide.mockImplementation(async () => {
        await animation.promise;
      });
      await render(<Example Sheet={Sheet} />);
      await fireEvent.press(screen.getByTestId('open'));
      await fireEvent.press(screen.getByTestId('save'));
      if (platform === 'android') {
        expect(hide).toHaveBeenCalledOnce();
        expect(screen.queryByTestId('password')).not.toBeNull();
      }
      await act(async () => {
        animation.resolve(true);
      });
      expect(screen.queryByTestId('password')).toBeNull();
    });
  });
}
