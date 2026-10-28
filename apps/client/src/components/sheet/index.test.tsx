import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import type { BottomSheet } from '@expo/ui/swift-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer, Option } from 'effect';
import { Atom } from 'effect/reactivity';
import type { ComponentProps } from 'react';
import { useImperativeHandle, useMemo, useReducer } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
} from '#src/components/form/hooks.tsx';
import type { SheetComponent } from '#src/components/sheet';
import { Sheet as AndroidSheet } from '#src/components/sheet/index.android.tsx';
import { Sheet as IosSheet } from '#src/components/sheet/index.ios.tsx';
import { useSheetSelection } from '#src/components/sheet/selection.ts';

const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));

vi.mock('@expo/ui/swift-ui', () => ({
  BottomSheet: ({
    children,
    isPresented,
    onIsPresentedChange,
    onDismiss,
  }: Pick<
    ComponentProps<typeof BottomSheet>,
    'children' | 'isPresented' | 'onIsPresentedChange' | 'onDismiss'
  >) => (
    <View>
      {children}
      <Pressable
        onPress={() => {
          onIsPresentedChange(false);
        }}>
        <Text>Swipe away</Text>
      </Pressable>
      {!isPresented ? (
        <Pressable onPress={onDismiss}>
          <Text>Finish native dismissal</Text>
        </Pressable>
      ) : null}
    </View>
  ),
}));

vi.mock('@expo/ui/jetpack-compose', () => ({
  ModalBottomSheet: ({
    children,
    ref,
    onDismissRequest,
  }: Pick<ComponentProps<typeof ModalBottomSheet>, 'children' | 'ref' | 'onDismissRequest'>) => {
    useImperativeHandle(
      ref,
      () =>
        ({
          hide: native.hide,
          expand: async () => void 0,
          partialExpand: async () => void 0,
        }) satisfies ModalBottomSheetRef
    );
    return (
      <View>
        {children}
        <Pressable onPress={onDismissRequest}>
          <Text>Swipe away</Text>
        </Pressable>
      </View>
    );
  },
}));

const { useAppForm } = createEffectSchemaFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
});
const runtime = Atom.runtime(Layer.empty);

const Editor = ({
  name,
  dismiss,
  operation,
  onSaved,
}: {
  readonly name: string;
  readonly dismiss: () => void | Promise<void>;
  readonly operation: Effect.Effect<void>;
  readonly onSaved: () => void;
}) => {
  const [draft, changeDraft] = useReducer((_draft: string, text: string) => text, 'Fresh draft');
  const mutation = useMemo(() => runtime.fn(() => operation), [operation]);
  const form = useAppForm({
    mutation,
    onFailure: () => 'Failed',
    onSuccess: async () => {
      onSaved();
      await dismiss();
    },
  });
  return (
    <form.AppForm>
      <Text>{name}</Text>
      <TextInput testID="draft" value={draft} onChangeText={changeDraft} />
      <Pressable onPress={() => void form.handleSubmit()}>
        <Text>Save</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void dismiss();
        }}>
        <Text>Cancel</Text>
      </Pressable>
    </form.AppForm>
  );
};

const Editors = ({
  Sheet,
  operation,
  onSaved,
  onDismissed,
}: {
  readonly Sheet: SheetComponent;
  readonly operation: Effect.Effect<void>;
  readonly onSaved: () => void;
  readonly onDismissed: () => void;
}) => {
  const [editorSelection, dispatchEditor] = useSheetSelection<'A' | 'B'>();
  return (
    <>
      <Pressable
        onPress={() => {
          dispatchEditor({ _tag: 'Open', selection: 'A' });
        }}>
        <Text>Open A</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          dispatchEditor({ _tag: 'Open', selection: 'B' });
        }}>
        <Text>Open B</Text>
      </Pressable>
      {Option.match(editorSelection, {
        onNone: () => null,
        onSome: (editor) => (
          <Sheet
            key={editor}
            onDismissed={() => {
              onDismissed();
              dispatchEditor({ _tag: 'Dismissed' });
            }}>
            {({ dismiss }) => (
              <Editor name={editor} dismiss={dismiss} operation={operation} onSaved={onSaved} />
            )}
          </Sheet>
        ),
      })}
    </>
  );
};

beforeEach(() => {
  native.hide.mockReset();
});

describe.each([
  { platform: 'iOS', Sheet: IosSheet },
  { platform: 'Android', Sheet: AndroidSheet },
])('$platform sheet ownership', ({ platform, Sheet }) => {
  it('ignores an old save after dismissal and reopening without losing the new draft', async () => {
    const saved = await Effect.runPromise(Deferred.make<undefined>());
    const dismissed = await Effect.runPromise(Deferred.make<undefined>());
    native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
    const onSaved = vi.fn<() => void>();
    const onDismissed = vi.fn<() => void>();
    await render(
      <Editors
        Sheet={Sheet}
        operation={Deferred.await(saved)}
        onSaved={onSaved}
        onDismissed={onDismissed}
      />
    );
    await fireEvent.press(screen.getByText('Open A'));
    await fireEvent.press(screen.getByText('Save'));
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(onDismissed).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Open B'));
    expect(screen.queryByText('B')).toBeNull();
    if (platform === 'iOS') {
      await fireEvent.press(screen.getByText('Finish native dismissal'));
    } else {
      await waitFor(() => {
        expect(native.hide).toHaveBeenCalledOnce();
      });
      await act(async () => {
        await Effect.runPromise(Deferred.succeed(dismissed, void 0));
      });
    }
    expect(onDismissed).toHaveBeenCalledOnce();
    await fireEvent.press(screen.getByText('Open B'));
    await fireEvent.changeText(screen.getByTestId('draft'), 'New draft');
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(saved, void 0));
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('B')).toBeOnTheScreen();
    expect(screen.getByTestId('draft')).toHaveDisplayValue('New draft');
    expect(onDismissed).toHaveBeenCalledOnce();
    expect(native.hide).toHaveBeenCalledTimes(platform === 'Android' ? 1 : 0);
  });

  it('retains a successful form until native dismissal completes', async () => {
    const dismissed = await Effect.runPromise(Deferred.make<undefined>());
    native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
    const onSaved = vi.fn<() => void>();
    const onDismissed = vi.fn<() => void>();
    await render(
      <Editors Sheet={Sheet} operation={Effect.void} onSaved={onSaved} onDismissed={onDismissed} />
    );
    await fireEvent.press(screen.getByText('Open A'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(onDismissed).not.toHaveBeenCalled();
    if (platform === 'iOS') {
      await fireEvent.press(screen.getByText('Finish native dismissal'));
    } else {
      await waitFor(() => {
        expect(native.hide).toHaveBeenCalledOnce();
      });
      // A swipe/back completion can race with programmatic hide completion.
      await fireEvent.press(screen.getByText('Swipe away'));
      await act(async () => {
        await Effect.runPromise(Deferred.succeed(dismissed, void 0));
      });
    }
    expect(screen.queryByText('A')).toBeNull();
    expect(onDismissed).toHaveBeenCalledOnce();
  });
});

it('does not report dismissal after the Android presentation unmounts during hide', async () => {
  const dismissed = await Effect.runPromise(Deferred.make<undefined>());
  native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
  const onDismissed = vi.fn<() => void>();
  const view = await render(
    <AndroidSheet onDismissed={onDismissed}>
      {({ dismiss }) => (
        <Pressable onPress={() => void dismiss()}>
          <Text>Dismiss</Text>
        </Pressable>
      )}
    </AndroidSheet>
  );
  await fireEvent.press(screen.getByText('Dismiss'));
  expect(native.hide).toHaveBeenCalledOnce();
  await view.rerender(<Text>Another presentation</Text>);
  await act(async () => {
    await Effect.runPromise(Deferred.succeed(dismissed, void 0));
  });
  expect(screen.getByText('Another presentation')).toBeOnTheScreen();
  expect(onDismissed).not.toHaveBeenCalled();
});
