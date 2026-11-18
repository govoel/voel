import { RegistryContext } from '@effect/atom-react';
import { StoragePluginSettingsForms } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Array, Effect, Option } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';

import {
  TextListFieldItem,
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useFieldContext,
  useSubmitState,
  useTextListFieldState,
} from '#src/components/form/hooks.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import type { LibraryEditor as LibraryEditorComponent } from '#src/domains/library/editor/index.tsx';

const TextField = ({ label }: { readonly label: string }) => {
  const field = useFieldContext<string>();
  const value = useSelector(field.store, (state) => state.value);
  return <TextInput accessibilityLabel={label} value={value} onChangeText={field.handleChange} />;
};
const TextListField = ({ label }: { readonly label: string }) => {
  const { indices, add } = useTextListFieldState();
  return (
    <>
      {Array.map(indices, (index) => (
        <TextListFieldItem key={index} index={index}>
          <TextField label={`${label}, item ${index + 1}`} />
        </TextListFieldItem>
      ))}
      <Pressable role="button" onPress={add}>
        <Text>Add to {label}</Text>
      </Pressable>
    </>
  );
};
const SubmitButton = ({ children }: PropsWithChildren) => {
  const { form, canSubmit, isSubmitting, errorMessage } = useSubmitState();
  return (
    <>
      <Pressable
        role="button"
        disabled={!canSubmit || isSubmitting}
        onPress={() => void form.handleSubmit()}>
        {children}
      </Pressable>
      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (message) => <Text>{message}</Text>,
      })}
    </>
  );
};

const api = vi.hoisted(() => ({
  loadForms:
    vi.fn<
      (request: {
        readonly storagePluginId: string;
      }) => Effect.Effect<
        Effect.Success<typeof localForms>,
        PluginLoadError | Effect.Error<typeof localForms>
      >
    >(),
  save: vi.fn<(request: unknown) => Effect.Effect<{ readonly id: number }>>(),
}));

vi.mock('#src/runtime/index.ts', async () => {
  const { Layer } = await import('effect');
  const { Atom } = await import('effect/reactivity');
  return { AppRuntime: Atom.runtime(Layer.empty) };
});
vi.mock('#src/domains/library/management.ts', async () => {
  const { Atom } = await import('effect/reactivity');
  const { Effect: effect } = await import('effect');
  return {
    storagePluginSettingsFormsAtom: Atom.family((request: { readonly storagePluginId: string }) =>
      Atom.make(effect.suspend(() => api.loadForms(request)))
    ),
    saveLibrary: (request: unknown) => effect.suspend(() => api.save(request)),
  };
});
vi.mock('#src/components/form', async () => {
  const { AppRuntime: runtime } = await import('#src/runtime/index.ts');
  return createEffectSchemaFormHook({
    runtime,
    fieldContext,
    formContext,
    fieldComponents: { TextField, TextListField, SecureField: TextField },
    formComponents: { SubmitButton },
  });
});
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({
    children,
    footer,
    sections = [],
  }: PropsWithChildren<{
    readonly footer: ReactNode;
    readonly sections?: ReadonlyArray<{
      readonly key: string;
      readonly title: string;
      readonly content: ReactNode;
    }>;
  }>) => (
    <View>
      {children}
      {Array.map(sections, ({ key, title, content }) => (
        <View key={key}>
          <Text>{title}</Text>
          {content}
        </View>
      ))}
      {footer}
    </View>
  ),
}));
vi.mock('#src/components/list-state', () => ({
  ListState: (props: {
    readonly kind: string;
    readonly message?: string;
    readonly onRetry?: () => void;
  }) => (
    <>
      <Text>{props.kind === 'loading' ? 'Loading' : props.message}</Text>
      {props.onRetry === void 0 ? null : (
        <Pressable role="button" onPress={props.onRetry}>
          <Text>Retry</Text>
        </Pressable>
      )}
    </>
  ),
}));
vi.mock('#src/components/text', () => ({ Text }));
// Platform views can't load outside a device, so the pickers use their shared hooks directly.
vi.mock('#src/domains/library/editor/storage-plugin-field', async () => {
  const actual = await import('#src/domains/library/editor/storage-plugin-field/index.tsx');
  return {
    ...actual,
    StoragePluginField: (props: ComponentProps<typeof actual.StoragePluginField>) => {
      const { provider, packageForm, selectProvider } = actual.useStoragePluginField(props);
      return (
        <>
          {Array.map(actual.storageProviders, (option) => (
            <Pressable
              key={option}
              role="button"
              accessibilityState={{ selected: provider === option }}
              onPress={() => {
                selectProvider(option);
              }}>
              <Text>{actual.storageProviderOptionLabel(option)}</Text>
            </Pressable>
          ))}
          {provider === 'npm' ? (
            <packageForm.AppForm>
              <packageForm.AppField name="package">
                {(field) => <field.TextField label="Package" placeholder="" purpose="text" />}
              </packageForm.AppField>
              <packageForm.SubmitButton>
                <Text>Load plugin</Text>
              </packageForm.SubmitButton>
            </packageForm.AppForm>
          ) : null}
        </>
      );
    },
  };
});
vi.mock('#src/domains/library/editor/media-type-field', async () => {
  const actual = await import('#src/domains/library/editor/media-type-field/index.tsx');
  return {
    ...actual,
    MediaTypeField: ({ types }: ComponentProps<typeof actual.MediaTypeField>) => {
      const field = actual.useMediaTypeField();
      return (
        <>
          <Text>Media type: {field.value}</Text>
          {Array.map(types, (type) => (
            <Pressable
              key={type}
              role="button"
              onPress={() => {
                field.handleSelect(type);
              }}>
              <Text>Use {type}</Text>
            </Pressable>
          ))}
        </>
      );
    },
  };
});

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const roots = {
  kind: 'TextListField',
  name: 'roots',
  label: 'Directories',
  placeholder: '/path/to/media',
  purpose: 'text',
  initialValue: [],
} as const;
const localForms = StoragePluginSettingsForms.decodeEffect({
  audiobook: [roots],
  movie: [roots],
  show: [roots],
});
const bucketForms = StoragePluginSettingsForms.decodeEffect({
  audiobook: [
    {
      kind: 'TextField',
      name: 'bucket',
      label: 'Bucket',
      placeholder: 'media',
      purpose: 'text',
      initialValue: 'media',
    },
  ],
});

const registries = new Set<AtomRegistry.AtomRegistry>();
const renderEditor = async (
  props: Pick<ComponentProps<typeof LibraryEditorComponent>, 'library'>
) => {
  // Imported after the stubs above exist, since loading the editor runs the mock factories.
  const { LibraryEditor } = await import('#src/domains/library/editor/index.tsx');
  const registry = AtomRegistry.make();
  registries.add(registry);
  const onSaved = vi.fn();
  await render(
    <LibraryEditor
      {...props}
      submitButton={
        <SubmitButton>
          <Text>Save library</Text>
        </SubmitButton>
      }
      onSaved={onSaved}
    />,
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <RegistryContext.Provider value={registry}>
          <SelectedAccountContext.Provider value={account}>
            {children}
          </SelectedAccountContext.Provider>
        </RegistryContext.Provider>
      ),
    }
  );
  return { onSaved };
};

beforeEach(() => {
  api.loadForms.mockImplementation(({ storagePluginId }) =>
    storagePluginId === 'builtin:local' ? localForms : bucketForms
  );
  api.save.mockImplementation(() => Effect.succeed({ id: 7 }));
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.clearAllMocks();
});

describe('LibraryEditor', () => {
  it("carries the name across storage plugins and saves the loaded plugin's settings", async () => {
    const { onSaved } = await renderEditor({ library: Option.none() });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Books');
    await fireEvent.press(screen.getByRole('button', { name: 'Use show' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Directories' }));
    await fireEvent.changeText(screen.getByLabelText('Directories, item 1'), '/media/shows');

    await fireEvent.press(screen.getByRole('button', { name: 'npm package' }));
    expect(
      screen.getByText('Enter the storage plugin’s npm package, then load it.')
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Package'), ' @example/s3 ');
    await fireEvent.press(screen.getByRole('button', { name: 'Load plugin' }));

    // The plugin only supports audiobooks, so the media type falls back to them.
    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('Books');
    expect(screen.getByText('Media type: audiobook')).toBeOnTheScreen();
    expect(screen.getByLabelText('Package')).toHaveDisplayValue('@example/s3');
    expect(api.loadForms).toHaveBeenLastCalledWith({
      account,
      id: Option.none(),
      storagePluginId: 'npm:@example/s3',
    });
    await fireEvent.changeText(screen.getByLabelText('Bucket'), 'books');
    await fireEvent.press(screen.getByRole('button', { name: 'Save library' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith({ id: 7 });
    });
    expect(api.save).toHaveBeenCalledExactlyOnceWith({
      account,
      id: Option.none(),
      library: {
        name: 'Books',
        type: 'audiobook',
        storagePluginId: 'npm:@example/s3',
        storagePluginSettings: { bucket: 'books' },
      },
    });
  });

  it('keeps the plugin choice available while its settings fail to load, and retries', async () => {
    const id = Library.fields.id.make(3);
    api.loadForms.mockImplementationOnce(() =>
      Effect.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
    );
    await renderEditor({
      library: Option.some({
        id,
        name: Library.fields.name.make('Audiobooks'),
        type: Library.fields.type.make('audiobook'),
        storagePluginId: Library.fields.storagePluginId.make('npm:@example/s3'),
      }),
    });

    expect(
      await screen.findByText('Unable to load the plugin. Check its configuration and try again.')
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Package')).toHaveDisplayValue('@example/s3');
    expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('Audiobooks');
    expect(screen.getByLabelText('Bucket')).toHaveDisplayValue('media');
    expect(api.loadForms).toHaveBeenLastCalledWith({
      account,
      id: Option.some(id),
      storagePluginId: 'npm:@example/s3',
    });
    expect(Array.length(api.loadForms.mock.calls)).toBe(2);
  });
});
