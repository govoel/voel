import type { ModalBottomSheetProps } from '@expo/ui/jetpack-compose';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';
import { ControlledSheet } from '#src/components/controlled-sheet/index.android.tsx';


const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<null>>() }));

vi.mock('@expo/ui/jetpack-compose', async () => {
  const React = await import('react');
  const Native = await import('react-native');

  const ModalBottomSheet = ({ ref, children, onDismissRequest }: ModalBottomSheetProps) => {
    const [hidden, setHidden] = React.useState(false);
    React.useImperativeHandle(ref, () => ({
      hide: async () => {
        await native.hide();
        setHidden(true);
      },
      expand: async () => void 0,
      partialExpand: async () => void 0,
    }));

    return (
      <Native.View testID="native-sheet">
        <Native.Text>{hidden ? 'Native hidden' : 'Native visible'}</Native.Text>
        <Native.Button title="Native dismiss" onPress={onDismissRequest} />
        {children}
      </Native.View>
    );
  };
  return { ModalBottomSheet };
});

const Editor = ({ owner, close }: { owner: string; close: () => void }) => {
  const [draft, setDraft] = useState('');
  return (
    <View>
      <Text>Editing {owner}</Text>
      <TextInput testID="draft" value={draft} onChangeText={setDraft} />
      <Button title="Close editor" onPress={close} />
    </View>
  );
};

const ControlledParent = () => {
  const [editor, setEditor] = useState<string | null>('first');
  return (
    <View>
      <Text>Desired: {editor ?? 'closed'}</Text>
      <Button
        title="Open second"
        onPress={() => {
          setEditor('second');
        }}
      />
      <ControlledSheet
        presented={editor !== null}
        onDismissRequest={() => {
          setEditor(null);
        }}>
        {({ close }) => <Editor key={editor} owner={editor ?? ''} close={close} />}
      </ControlledSheet>
    </View>
  );
};

afterEach(() => {
  native.hide.mockReset();
  vi.restoreAllMocks();
});

it('closes logically and disposes the draft before the native hide finishes', async () => {
  const hide = Promise.withResolvers<null>();
  native.hide.mockReturnValue(hide.promise);
  const view = await render(<ControlledParent />);
  await fireEvent.changeText(view.getByTestId('draft'), 'unsaved');

  await fireEvent.press(view.getByText('Close editor'));

  expect(view.getByText('Desired: closed')).toBeTruthy();
  expect(view.queryByTestId('draft')).toBeNull();
  expect(view.getByTestId('native-sheet')).toBeTruthy();

  await act(async () => {
    hide.resolve(null);
    await hide.promise;
  });
  expect(view.queryByTestId('native-sheet')).toBeNull();
  expect(view.getByText('Desired: closed')).toBeTruthy();
});

it('keeps a queued editor open after the old native dismissal finishes', async () => {
  const hide = Promise.withResolvers<null>();
  native.hide.mockReturnValue(hide.promise);
  const view = await render(<ControlledParent />);
  await fireEvent.changeText(view.getByTestId('draft'), 'old draft');
  await fireEvent.press(view.getByText('Close editor'));
  await fireEvent.press(view.getByText('Open second'));
  await fireEvent.press(view.getByText('Native dismiss'));

  expect(view.getByText('Desired: second')).toBeTruthy();
  expect(view.queryByTestId('draft')).toBeNull();

  await act(async () => {
    hide.resolve(null);
    await hide.promise;
  });
  expect(view.getByText('Desired: second')).toBeTruthy();
  expect(view.getByText('Editing second')).toBeTruthy();
  expect(view.getByTestId('draft')).toHaveDisplayValue('');
  expect(view.getByText('Native visible')).toBeTruthy();

  await fireEvent.press(view.getByText('Native dismiss'));
  expect(view.getByText('Desired: closed')).toBeTruthy();
  expect(view.queryByTestId('draft')).toBeNull();
});

it('releases a rejected native hide and honors the latest desired presentation', async () => {
  const hide = Promise.withResolvers<null>();
  const error = new Error('Native host unavailable');
  native.hide.mockReturnValueOnce(hide.promise).mockRejectedValue(error);
  const view = await render(<ControlledParent />);
  await fireEvent.press(view.getByText('Close editor'));
  await fireEvent.press(view.getByText('Open second'));

  await act(async () => {
    hide.reject(error);
    await hide.promise.catch(() => void 0);
  });
  expect(view.getByText('Desired: second')).toBeTruthy();
  expect(view.getByText('Editing second')).toBeTruthy();
  expect(view.getByText('Native visible')).toBeTruthy();

  await fireEvent.press(view.getByText('Close editor'));
  expect(view.getByText('Desired: closed')).toBeTruthy();
  expect(view.queryByTestId('native-sheet')).toBeNull();
});
