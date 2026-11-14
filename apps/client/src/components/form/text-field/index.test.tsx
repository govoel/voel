import { FieldApi, FormApi } from '@tanstack/react-form';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { fieldContext, formContext } from '#src/components/form/hooks.tsx';
import { TextField as AndroidTextField } from '#src/components/form/text-field/index.android.tsx';
import { TextField as IOSTextField } from '#src/components/form/text-field/index.ios.tsx';

const nativeState = vi.hoisted(() => ({ set: vi.fn<(text: string) => void>() }));

vi.mock('@expo/ui/jetpack-compose', async () => {
  const { TextInput: Input, View } = await import('react-native');
  const TextField = ({
    ref,
    onValueChange,
  }: {
    ref?: ComponentProps<typeof Input>['ref'];
    onValueChange?: (text: string) => void;
  }) => <Input ref={ref} testID="native-text" onChangeText={onValueChange} />;
  return {
    TextField: Object.assign(TextField, { Label: View, Placeholder: View, SupportingText: View }),
    useNativeState: () => nativeState,
  };
});
vi.mock('@expo/ui/swift-ui', async () => {
  const { Text, TextInput: Input, View } = await import('react-native');
  return {
    Label: Text,
    VStack: View,
    TextField: ({
      ref,
      onTextChange,
    }: {
      ref?: ComponentProps<typeof Input>['ref'];
      onTextChange?: (text: string) => void;
    }) => <Input ref={ref} testID="native-text" onChangeText={onTextChange} />,
    useNativeState: () => nativeState,
  };
});
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  autocorrectionDisabled: () => ({}),
  disabled: () => ({}),
  font: () => ({}),
  foregroundStyle: () => ({}),
  keyboardType: () => ({}),
  textContentType: () => ({}),
  textInputAutocapitalization: () => ({}),
}));
vi.mock('#src/components/text', async () => {
  const { Text } = await import('react-native');
  return { Text };
});
vi.mock('#src/components/text/index.ios.tsx', async () => {
  const { Text } = await import('react-native');
  return { Text };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const createFixture = () => {
  const form = new FormApi({
    defaultValues: { name: 'Initial' },
    onSubmitMeta: void 0,
  });
  const field = new FieldApi({ form, name: 'name' });
  const unmountForm = form.mount();
  const unmountField = field.mount();
  return { form, field, unmountForm, unmountField };
};

const setup = async ({ TextField }: { readonly TextField: typeof AndroidTextField }) => {
  const { form, field, unmountForm, unmountField } = createFixture();
  const view = await render(
    <formContext.Provider value={form}>
      <fieldContext.Provider value={field}>
        <TextField label="Name" placeholder="Name" />
      </fieldContext.Provider>
    </formContext.Provider>
  );
  onTestFinished(async () => {
    await view.unmount();
    unmountField();
    unmountForm();
  });
  return { form, field, view };
};

describe.each([
  { platform: 'Android', TextField: AndroidTextField },
  { platform: 'iOS', TextField: IOSTextField },
])('$platform text-field synchronization', ({ TextField }) => {
  it('writes resets and silent store updates before React renders them', async () => {
    const { form } = await setup({ TextField });
    expect(nativeState.set).not.toHaveBeenCalled();

    await act(() => {
      form.reset({ name: 'Reset' });
      expect(nativeState.set).toHaveBeenLastCalledWith('Reset');
      form.setFieldValue('name', 'Programmatic', {
        dontRunListeners: true,
        dontValidate: true,
      });
      expect(nativeState.set).toHaveBeenLastCalledWith('Programmatic');
    });
    expect(nativeState.set).toHaveBeenCalledTimes(2);
  });

  it('does not echo native typing or metadata changes back into the input', async () => {
    const { form, field } = await setup({ TextField });
    await fireEvent.changeText(screen.getByTestId('native-text'), 'Typed');
    expect(field.store.state.value).toBe('Typed');
    await act(() => {
      form.setFieldMeta('name', (meta) => ({ ...meta, isBlurred: true }));
    });
    expect(nativeState.set).not.toHaveBeenCalled();

    await act(() => {
      form.reset({ name: 'Initial' });
    });
    expect(nativeState.set).toHaveBeenCalledExactlyOnceWith('Initial');
  });

  it('unsubscribes when the native input detaches', async () => {
    const { form, view } = await setup({ TextField });
    await view.unmount();
    form.reset({ name: 'Detached' });
    expect(nativeState.set).not.toHaveBeenCalled();
  });
});
