import { RegistryContext } from '@effect/atom-react';
import {
  StoragePluginSettingsFieldName,
  StoragePluginSettingsForms,
} from '@govoel/plugins/storage';
import { useField } from '@tanstack/react-form';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { Array, String as EffectString, Option } from 'effect';
import type { Effect, Layer as EffectLayer } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { ComponentProps, PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';

import type { ApiClient as ApiClientService } from '#src/api-client.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { LibraryEditorSource } from '#src/domains/library/editor/schema.ts';
import { StorageSettings as AndroidStorageSettings } from '#src/domains/library/editor/storage-settings/index.android.tsx';
import { StorageSettings as IOSStorageSettings } from '#src/domains/library/editor/storage-settings/index.ios.tsx';
import { StorageState, useLibraryForm } from '#src/domains/library/editor/use-form.ts';

vi.mock('#src/runtime/index.ts', async () => {
  const { Context, Effect: effect, Layer, LayerMap } = await import('effect');
  const { Atom, Reactivity } = await import('effect/reactivity');
  const { FetchHttpClient } = await import('effect/http');
  const { HttpApiClient, HttpApiMiddleware } = await import('effect/http-api');
  const { Api } = await import('@repo/spec-api');
  const { AuthMiddleware } = await import('@repo/spec-api/domains/auth/http.ts');
  const { ApiClient, ApiClientMap } = await import('#src/api-client.ts');
  const makeClient = (
    account: AccountKey
  ): EffectLayer.Layer<ApiClientService, Effect.Error<ReturnType<typeof ApiClient.make>>> =>
    Layer.effect(
      ApiClient,
      HttpApiClient.make(Api, { baseUrl: account.serverUrl }).pipe(
        effect.provide([
          FetchHttpClient.layer,
          HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request)),
        ])
      )
    );
  const clients = LayerMap.make(makeClient).pipe(
    effect.map((map) => ({
      ...map,
      acquire: (account: AccountKey) =>
        map.contextEffect(account).pipe(effect.map(Context.get(ApiClient))),
    }))
  );
  return {
    AppRuntime: Atom.runtime(
      Layer.effect(ApiClientMap, clients).pipe(Layer.provideMerge(Reactivity.layer))
    ),
  };
});
vi.mock('#src/components/form', async () => {
  const { AppRuntime: runtime } = await import('#src/runtime/index.ts');
  const { createEffectSchemaFormHook, fieldContext, formContext, useTextFieldState } =
    await import('#src/components/form/hooks.tsx');
  const { Fragment } = await import('react');
  const TextField = ({
    label,
    labelVisibility = 'visible',
  }: ComponentProps<TextFieldComponent>) => {
    const { field } = useTextFieldState();
    return (
      <View>
        {labelVisibility === 'visible' ? <Text>{label}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={field.state.value}
          onChangeText={field.handleChange}
        />
      </View>
    );
  };
  return createEffectSchemaFormHook({
    runtime,
    fieldContext,
    formContext,
    fieldComponents: { TextField, SecureField: Fragment },
    formComponents: { SubmitButton: Fragment },
  });
});
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({
    children,
    sections,
    footer,
  }: PropsWithChildren<{ readonly sections?: ReactNode; readonly footer?: ReactNode }>) => (
    <View>
      {children}
      {sections}
      {footer}
    </View>
  ),
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/components/list-state', () => ({
  ListState: ({ message }: { readonly message: string }) => <Text>{message}</Text>,
}));
vi.mock('#src/constants/theme.ts', () => ({ Spacing: { two: 8 } }));
vi.mock('@expo/material-symbols/delete.xml', () => ({ default: 0 }));
vi.mock('@expo/ui/swift-ui', () => ({
  Section: ({ header, children }: PropsWithChildren<{ readonly header?: ReactNode }>) => (
    <View testID="storage-section">
      {header}
      {children}
    </View>
  ),
  Button: ({ children, onPress }: PropsWithChildren<{ readonly onPress: () => void }>) => (
    <Pressable role="button" onPress={onPress}>
      {children}
    </Pressable>
  ),
  List: {
    ForEach: ({
      data,
      keyExtractor,
      children,
      onDelete,
    }: {
      readonly data: ReadonlyArray<string>;
      readonly keyExtractor: (item: string, index: number) => string;
      readonly children: (info: { readonly item: string; readonly index: number }) => ReactElement;
      readonly onDelete?: (indices: Array<number>) => void;
    }) => (
      <View testID="storage-list" {...{ onDelete }}>
        {Array.map(data, (item, index) => (
          <View key={keyExtractor(item, index)}>{children({ item, index })}</View>
        ))}
      </View>
    ),
  },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  buttonStyle: () => ({}),
  disabled: () => ({}),
  frame: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Button: ({ children, onClick }: PropsWithChildren<{ readonly onClick: () => void }>) => (
    <Pressable role="button" onPress={onClick}>
      {children}
    </Pressable>
  ),
  Column: View,
  Row: View,
  Icon: ({ contentDescription }: { readonly contentDescription: string }) => (
    <Text>{contentDescription}</Text>
  ),
  IconButton: ({ children, onClick }: PropsWithChildren<{ readonly onClick: () => void }>) => (
    <Pressable role="button" onPress={onClick}>
      {children}
    </Pressable>
  ),
  OutlinedButton: ({ children, onClick }: PropsWithChildren<{ readonly onClick: () => void }>) => (
    <Pressable role="button" onPress={onClick}>
      {children}
    </Pressable>
  ),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({}),
  weight: () => ({}),
}));
vi.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://library.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const local = Library.jsonCreate.fields.storagePluginId.make('builtin:local');
const plugin = Library.jsonCreate.fields.storagePluginId.make('npm:@fixture/storage@1.0.0');
const otherPlugin = Library.jsonCreate.fields.storagePluginId.make('npm:@fixture/storage@2.0.0');
const roots = {
  kind: 'TextListField',
  name: StoragePluginSettingsFieldName.make('roots'),
  label: 'Directories',
  placeholder: '/media',
  purpose: 'text',
  initialValue: ['/media/original'],
} as const;
const folder = {
  kind: 'TextField',
  name: StoragePluginSettingsFieldName.make('folder'),
  label: 'Folder',
  placeholder: '',
  purpose: 'text',
  initialValue: '/default',
} as const;
const localForms = { audiobook: [roots], movie: [roots], show: [roots] };
const makeForms = (forms: Parameters<typeof StoragePluginSettingsForms.make>[0]) =>
  StoragePluginSettingsForms.make(forms);
const original = {
  id: Library.fields.id.make(7),
  name: Library.fields.name.make('Audiobooks'),
  type: Library.fields.type.make('audiobook'),
  storagePluginId: plugin,
};
const createSource = LibraryEditorSource.Create();
const editSource = LibraryEditorSource.Edit({ library: original });

const loadForms = vi.fn<(body: unknown) => Promise<Response>>();
const save = vi.fn<(body: unknown) => Promise<Response>>();
const registries = new Set<AtomRegistry.AtomRegistry>();

const Providers = ({ children }: PropsWithChildren) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  return (
    <RegistryContext.Provider value={registry}>
      <SelectedAccountContext.Provider value={account}>{children}</SelectedAccountContext.Provider>
    </RegistryContext.Provider>
  );
};

const setup = async ({
  source = createSource,
  storagePluginId = local,
  forms = localForms,
}: {
  readonly source?: LibraryEditorSource;
  readonly storagePluginId?: typeof local;
  readonly forms?: Parameters<typeof makeForms>[0];
} = {}) =>
  renderHook(
    () => {
      const editor = useLibraryForm({
        editor: { source, storage: { storagePluginId, forms: makeForms(forms) } },
        onSuccess: () => void 0,
      });
      // Mounted fields take part in validation, as they do on screen.
      useField({ form: editor.form, name: 'name' });
      useField({ form: editor.form, name: 'type' });
      useField({ form: editor.form, name: 'storagePluginId' });
      return editor;
    },
    { wrapper: Providers }
  );

const submit = async (editor: Awaited<ReturnType<typeof setup>>) => {
  await act(async () => editor.result.current.form.handleSubmit());
};

const settled = async (editor: Awaited<ReturnType<typeof setup>>) => {
  await waitFor(() => {
    expect(editor.result.current.plugin.loading).toBe(false);
  });
};

const load = async (editor: Awaited<ReturnType<typeof setup>>) => {
  await act(async () => {
    editor.result.current.plugin.load();
  });
  await settled(editor);
};

beforeEach(() => {
  loadForms.mockReset().mockImplementation(async () => Response.json(localForms));
  save.mockReset().mockImplementation(async () => Response.json({ id: 7 }));
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    const body: unknown = await request.json();
    return EffectString.endsWith('/settings-forms')(new URL(request.url).pathname)
      ? loadForms(body)
      : save(body);
  });
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.unstubAllGlobals();
});

describe('library editor form', () => {
  it('saves the preloaded settings without opening storage settings', async () => {
    const editor = await setup();
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Audiobooks');
    });
    await submit(editor);
    expect(loadForms).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({
      name: 'Audiobooks',
      type: 'audiobook',
      storagePluginId: 'builtin:local',
      storagePluginSettings: { roots: ['/media/original'] },
    });
  });

  it('keeps settings for each media type and blocks types the plugin lacks', async () => {
    const editor = await setup({ forms: { audiobook: [roots], movie: [folder] } });
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Media');
      editor.result.current.form.setFieldValue('storage.settings.audiobook.roots', ['/edited']);
      editor.result.current.form.setFieldValue('type', 'movie');
    });
    expect(editor.result.current.storage).toEqual(
      StorageState.Ready({ type: 'movie', fields: makeForms({ movie: [folder] }).movie ?? [] })
    );
    await act(() => {
      editor.result.current.form.setFieldValue('type', 'show');
    });
    expect(editor.result.current.storage).toEqual(StorageState.Unsupported({ type: 'show' }));
    await submit(editor);
    expect(save).not.toHaveBeenCalled();
    await act(() => {
      editor.result.current.form.setFieldValue('type', 'audiobook');
    });
    await waitFor(() => {
      expect(editor.result.current.form.state.canSubmit).toBe(true);
    });
    await submit(editor);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'audiobook', storagePluginSettings: { roots: ['/edited'] } })
    );
  });

  it('loads an entered plugin only when asked, after consent for a new npm plugin', async () => {
    const editor = await setup();
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Custom');
      editor.result.current.selectProvider({ provider: 'custom' });
    });
    expect(editor.result.current.provider).toBe('custom');
    expect(editor.result.current.storage).toEqual(StorageState.NotLoaded());
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', plugin);
    });
    expect(editor.result.current.plugin.consent).toEqual(Option.some(plugin));
    await submit(editor);
    expect(save).not.toHaveBeenCalled();
    expect(loadForms).not.toHaveBeenCalled();
    loadForms.mockResolvedValueOnce(Response.json({ audiobook: [folder] }));
    await load(editor);
    await waitFor(() => {
      expect(StorageState.$is('Ready')(editor.result.current.storage)).toBe(true);
    });
    expect(loadForms).toHaveBeenCalledWith({ storagePluginId: plugin });
    expect(editor.result.current.plugin.consent).toEqual(Option.none());
    await submit(editor);
    expect(save).toHaveBeenCalledWith({
      name: 'Custom',
      type: 'audiobook',
      storagePluginId: plugin,
      storagePluginSettings: { folder: '/default' },
    });
  });

  it('reloads the library’s saved plugin without consent, seeded with its settings', async () => {
    const editor = await setup({ source: editSource, storagePluginId: plugin });
    await act(async () => {
      editor.result.current.selectProvider({ provider: 'local' });
    });
    await settled(editor);
    expect(editor.result.current.form.state.values.storage.storagePluginId).toBe(local);
    expect(loadForms).toHaveBeenLastCalledWith({ id: 7, storagePluginId: local });
    await act(() => {
      editor.result.current.selectProvider({ provider: 'custom' });
      editor.result.current.form.setFieldValue('storagePluginId', plugin);
    });
    expect(editor.result.current.plugin.consent).toEqual(Option.none());
    await load(editor);
    await waitFor(() => {
      expect(editor.result.current.form.state.values.storage.storagePluginId).toBe(plugin);
    });
    expect(loadForms).toHaveBeenLastCalledWith({ id: 7, storagePluginId: plugin });
  });

  it('switches back to the loaded plugin without loading it again', async () => {
    const editor = await setup();
    await act(() => {
      editor.result.current.selectProvider({ provider: 'custom' });
    });
    await act(async () => {
      editor.result.current.selectProvider({ provider: 'local' });
    });
    await settled(editor);
    expect(StorageState.$is('Ready')(editor.result.current.storage)).toBe(true);
    expect(loadForms).not.toHaveBeenCalled();
  });

  it('shows a failed load and clears it once the plugin ID changes', async () => {
    loadForms.mockResolvedValueOnce(
      Response.json(PluginLoadError.make({ message: 'Failed to load plugin' }), { status: 500 })
    );
    const editor = await setup();
    await act(() => {
      editor.result.current.selectProvider({ provider: 'custom' });
      editor.result.current.form.setFieldValue('storagePluginId', plugin);
    });
    await load(editor);
    await waitFor(() => {
      expect(editor.result.current.plugin.error).toEqual(
        Option.some('Unable to load the plugin. Check its configuration and try again.')
      );
    });
    expect(editor.result.current.form.state.values.storage.storagePluginId).toBe(local);
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    expect(editor.result.current.plugin.error).toEqual(Option.none());
  });

  it('ignores a load that finishes after the plugin ID changed', async () => {
    const pending = Promise.withResolvers<Response>();
    loadForms.mockReturnValueOnce(pending.promise);
    const editor = await setup();
    await act(() => {
      editor.result.current.selectProvider({ provider: 'custom' });
      editor.result.current.form.setFieldValue('storagePluginId', plugin);
    });
    await act(async () => {
      editor.result.current.plugin.load();
    });
    // Changing the ID while the group still validates must not load the new ID instead.
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    await waitFor(() => {
      expect(loadForms).toHaveBeenCalledWith({ storagePluginId: plugin });
    });
    await act(() => {
      pending.resolve(Response.json({ audiobook: [folder] }));
    });
    await settled(editor);
    expect(editor.result.current.form.state.values.storage.storagePluginId).toBe(local);
  });
});

const SettingsSheet = ({
  StorageSettings,
  forms,
  onDone,
}: {
  readonly StorageSettings: typeof IOSStorageSettings;
  readonly forms: Parameters<typeof makeForms>[0];
  readonly onDone: () => void;
}) => {
  const editor = useLibraryForm({
    editor: { source: editSource, storage: { storagePluginId: plugin, forms: makeForms(forms) } },
    onSuccess: () => void 0,
  });
  return (
    <editor.form.AppForm>
      {StorageState.$is('Ready')(editor.storage) ? (
        <StorageSettings
          form={editor.form}
          type={editor.storage.type}
          fields={editor.storage.fields}
          onDone={onDone}
        />
      ) : null}
      <Pressable role="button" onPress={() => void editor.form.handleSubmit()}>
        <Text>Save</Text>
      </Pressable>
    </editor.form.AppForm>
  );
};

describe.each([
  { platform: 'iOS', StorageSettings: IOSStorageSettings },
  { platform: 'Android', StorageSettings: AndroidStorageSettings },
])('storage settings on $platform', ({ platform, StorageSettings }) => {
  it('edits lists and text fields in place and closes with Done', async () => {
    const onDone = vi.fn<() => void>();
    await render(
      <Providers>
        <SettingsSheet
          StorageSettings={StorageSettings}
          forms={{ audiobook: [{ ...roots, initialValue: ['/one', '/two'] }, folder] }}
          onDone={onDone}
        />
      </Providers>
    );
    const directories = screen.getAllByLabelText('Directories');
    expect(directories).toHaveLength(2);
    await fireEvent.changeText(Array.getUnsafe(directories, 1), '/kept');
    await (platform === 'iOS'
      ? fireEvent(screen.getByTestId('storage-list'), 'delete', [0])
      : fireEvent.press(screen.getByRole('button', { name: 'Remove Directories 1' })));
    await fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    await fireEvent.changeText(Array.getUnsafe(screen.getAllByLabelText('Directories'), 1), '/new');
    await fireEvent.changeText(screen.getByLabelText('Folder'), '/edited');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        name: original.name,
        type: original.type,
        storagePluginId: plugin,
        storagePluginSettings: { roots: ['/kept', '/new'], folder: '/edited' },
      });
    });
  });

  it('explains that a plugin needs no settings', async () => {
    await render(
      <Providers>
        <SettingsSheet
          StorageSettings={StorageSettings}
          forms={{ audiobook: [] }}
          onDone={vi.fn<() => void>()}
        />
      </Providers>
    );
    expect(screen.getByText('No settings are required for this plugin.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull();
  });

  it('labels each list once alongside its entries', async () => {
    const text = {
      ...folder,
      name: StoragePluginSettingsFieldName.make('server'),
      label: 'Server URL',
      purpose: 'url',
    } as const;
    await render(
      <Providers>
        <SettingsSheet
          StorageSettings={StorageSettings}
          forms={{
            audiobook: [
              text,
              {
                ...text,
                name: StoragePluginSettingsFieldName.make('displayName'),
                label: 'Display name',
                purpose: 'name',
              },
              roots,
              {
                ...text,
                name: StoragePluginSettingsFieldName.make('username'),
                label: 'Username',
                purpose: 'username',
              },
              {
                ...roots,
                name: StoragePluginSettingsFieldName.make('excluded'),
                label: 'Excluded folders',
                initialValue: [],
              },
            ],
          }}
          onDone={vi.fn<() => void>()}
        />
      </Providers>
    );
    expect(screen.getAllByText('Directories')).toHaveLength(1);
    expect(screen.getAllByText('Excluded folders')).toHaveLength(1);
    expect(screen.queryByLabelText('Excluded folders')).toBeNull();
    if (platform === 'iOS') {
      const sections = screen.getAllByTestId('storage-section');
      expect(sections).toHaveLength(4);
      expect(within(Array.getUnsafe(sections, 0)).getByLabelText('Display name')).toBeOnTheScreen();
      expect(within(Array.getUnsafe(sections, 1)).getByText('Directories')).toBeOnTheScreen();
      expect(within(Array.getUnsafe(sections, 2)).getByLabelText('Username')).toBeOnTheScreen();
    }
    await fireEvent.press(Array.getUnsafe(screen.getAllByRole('button', { name: 'Add entry' }), 1));
    expect(screen.getByLabelText('Excluded folders')).toHaveProp('value', '');
  });
});
