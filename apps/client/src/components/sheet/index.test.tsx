import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import type { BottomSheet } from '@expo/ui/swift-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer } from 'effect';
import { Atom } from 'effect/reactivity';
import type { ComponentProps } from 'react';
import { useImperativeHandle, useMemo, useState } from 'react';
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
  readonly dismiss: () => void;
  readonly operation: Effect.Effect<void>;
  readonly onSaved: () => void;
}) => {
  const [draft, setDraft] = useState('Fresh draft');
  const mutation = useMemo(() => runtime.fn(() => operation), [operation]);
  const form = useAppForm({
    mutation,
    onFailure: () => 'Failed',
    onSuccess: () => {
      onSaved();
      dismiss();
    },
  });
  return (
    <form.AppForm>
      <Text>{name}</Text>
      <TextInput testID="draft" value={draft} onChangeText={setDraft} />
      <Pressable onPress={() => void form.handleSubmit()}>
        <Text>Save</Text>
      </Pressable>
      <Pressable onPress={dismiss}>
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
  const [editor, setEditor] = useState<'A' | 'B' | null>(null);
  return (
    <>
      <Pressable
        onPress={() => {
          setEditor((current) => current ?? 'A');
        }}>
        <Text>Open A</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setEditor((current) => current ?? 'B');
        }}>
        <Text>Open B</Text>
      </Pressable>
      {editor !== null ? (
        <Sheet
          key={editor}
          onDismissed={() => {
            onDismissed();
            setEditor(null);
          }}>
          {({ dismiss }) => (
            <Editor name={editor} dismiss={dismiss} operation={operation} onSaved={onSaved} />
          )}
        </Sheet>
      ) : null}
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
