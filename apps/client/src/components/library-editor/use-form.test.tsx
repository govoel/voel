import { RegistryContext } from '@effect/atom-react';
import { useField } from '@tanstack/react-form';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Array, Deferred, Effect, String as EffectString, Option } from 'effect';
import type { Layer as EffectLayer } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import { useState } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';

import type { ApiClient as ApiClientService } from '#src/api-client.ts';
import { StorageFields as AndroidStorageFields } from '#src/components/library-editor/storage-fields/index.android.tsx';
import { StorageFields as IOSStorageFields } from '#src/components/library-editor/storage-fields/index.ios.tsx';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { LibraryEditorMetadata, LibraryEditorSource } from '#src/domains/library/editor.ts';

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
  const TextField = ({ label }: { readonly label: string }) => {
    const { field, value } = useTextFieldState();
    return <TextInput accessibilityLabel={label} value={value} onChangeText={field.handleChange} />;
  };
  return createEffectSchemaFormHook({
    runtime,
    fieldContext,
    formContext,
    fieldComponents: { TextField, SecureField: Fragment },
    formComponents: { SubmitButton: Fragment },
  });
});
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('@expo/material-symbols/delete.xml', () => ({ default: 0 }));
vi.mock('@expo/ui/swift-ui', () => ({
  Section: View,
  Button: ({ children, onPress }: PropsWithChildren<{ readonly onPress: () => void }>) => (
    <Pressable role="button" onPress={onPress}>
      {children}
    </Pressable>
  ),
  List: {
    ForEach: ({
      data,
      children,
      onDelete,
    }: {
      readonly data: ReadonlyArray<number>;
      readonly children: (item: { readonly index: number }) => ReactElement;
      readonly onDelete?: (indices: Array<number>) => void;
    }) => (
      <View testID="storage-list" {...{ onDelete }}>
        {Array.map(data, (key, index) => (
          <View key={key}>{children({ index })}</View>
        ))}
      </View>
    ),
  },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ disabled: () => ({}) }));
vi.mock('@expo/ui/jetpack-compose', () => ({
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
  TextButton: ({ children, onClick }: PropsWithChildren<{ readonly onClick: () => void }>) => (
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
const plugin = Library.json.fields.storagePluginId.make('npm:@fixture/storage@1.0.0');
const otherPlugin = Library.json.fields.storagePluginId.make('npm:@fixture/storage@2.0.0');
const original = {
  id: Library.fields.id.make(7),
  name: Library.fields.name.make('Audiobooks'),
  type: Library.fields.type.make('audiobook'),
  storagePluginId: plugin,
};
const descriptors = [
  {
    kind: 'TextListField',
    name: 'roots',
    label: 'Directories',
    placeholder: '/media',
    purpose: 'text',
    initialValue: ['/media/original'],
  },
];
const loadSettings = vi.fn<(metadata: typeof LibraryEditorMetadata.Type) => Promise<Response>>();
const save = vi.fn<(payload: unknown) => Promise<Response>>();
const registries = new Set<AtomRegistry.AtomRegistry>();
const createSource = LibraryEditorSource.Create();
const editSource = LibraryEditorSource.Edit({ library: original });

const setup = async ({
  source = createSource,
  registry = AtomRegistry.make(),
}: {
  readonly source?: LibraryEditorSource;
  readonly registry?: AtomRegistry.AtomRegistry;
} = {}) => {
  registries.add(registry);
  const wrapper = ({ children }: PropsWithChildren) => (
    <RegistryContext.Provider value={registry}>
      <SelectedAccountContext.Provider value={account}>{children}</SelectedAccountContext.Provider>
    </RegistryContext.Provider>
  );
  return renderHook(
    () => {
      const editor = useLibraryForm({ source, onSuccess: () => void 0 });
      useField({ form: editor.form, name: 'name' });
      useField({ form: editor.form, name: 'type' });
      useField({ form: editor.form, name: 'storagePluginId' });
      return editor;
    },
    { wrapper }
  );
};

beforeEach(() => {
  loadSettings.mockReset().mockImplementation(async () => Response.json(descriptors));
  save.mockReset().mockImplementation(async () => Response.json({ id: 7 }));
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    return EffectString.endsWith('settings-form')(new URL(request.url).pathname)
      ? loadSettings(
          Option.getOrThrow(LibraryEditorMetadata.decodeUnknownOption(await request.json()))
        )
      : save(await request.json());
  });
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.unstubAllGlobals();
});

const enterCustom = async (editor: Awaited<ReturnType<typeof setup>>) => {
  await act(() => {
    editor.result.current.form.setFieldValue('name', 'Audiobooks');
    editor.result.current.selectProvider({ provider: 'custom' });
    editor.result.current.form.setFieldValue('storagePluginId', plugin);
  });
};

const StorageEditor = ({ StorageFields }: { readonly StorageFields: typeof IOSStorageFields }) => {
  const editor = useLibraryForm({ source: editSource, onSuccess: () => void 0 });
  const [storageOpen, setStorageOpen] = useState(false);
  return (
    <editor.form.AppForm>
      <editor.form.AppField name="name">
        {(field) => <field.TextField label="Name" placeholder="" />}
      </editor.form.AppField>
      <Pressable
        role="button"
        disabled={!editor.canOpenStorage}
        onPress={() => {
          editor.resetStorage();
          setStorageOpen(true);
        }}>
        <Text>Storage settings</Text>
      </Pressable>
      {storageOpen ? (
        <>
          <StorageFields form={editor.form} storage={editor.storage} />
          <Pressable
            role="button"
            onPress={() => {
              setStorageOpen(false);
            }}>
            <Text>Done</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable
        role="button"
        disabled={!editor.ready}
        onPress={() => void editor.form.handleSubmit()}>
        <Text>Save</Text>
      </Pressable>
    </editor.form.AppForm>
  );
};

describe('library editor', () => {
  it.each([
    { platform: 'iOS', StorageFields: IOSStorageFields },
    { platform: 'Android', StorageFields: AndroidStorageFields },
  ])(
    'preloads settings, saves subpage edits, and resets a new visit on $platform',
    async ({ platform, StorageFields }) => {
      const textField = {
        kind: 'TextField',
        name: 'folder',
        label: 'Folder',
        placeholder: '',
        purpose: 'text',
        initialValue: '/default',
      };
      loadSettings.mockResolvedValueOnce(
        Response.json([{ ...descriptors[0], initialValue: ['/same', '/same'] }, textField])
      );
      const registry = AtomRegistry.make();
      registries.add(registry);
      await render(
        <RegistryContext.Provider value={registry}>
          <SelectedAccountContext.Provider value={account}>
            <StorageEditor StorageFields={StorageFields} />
          </SelectedAccountContext.Provider>
        </RegistryContext.Provider>
      );
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      });
      expect(loadSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText('Directories')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Storage settings' }));
      const roots = await screen.findAllByLabelText('Directories');
      await fireEvent.changeText(Array.getUnsafe(roots, 1), '/kept');
      await (platform === 'iOS'
        ? fireEvent(screen.getByTestId('storage-list'), 'delete', [0])
        : fireEvent.press(screen.getByRole('button', { name: 'Remove Directories 1' })));
      await fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
      await fireEvent.changeText(
        Array.getUnsafe(screen.getAllByLabelText('Directories'), 1),
        '/new'
      );
      await fireEvent.changeText(screen.getByLabelText('Folder'), '/edited');
      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByLabelText('Directories')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(save).toHaveBeenCalledWith({
          name: original.name,
          type: original.type,
          storagePluginId: plugin,
          storagePluginSettings: { roots: ['/kept', '/new'], folder: '/edited' },
        });
      });
      await fireEvent.press(screen.getByRole('button', { name: 'Storage settings' }));
      const resetRoots = screen.getAllByLabelText('Directories');
      expect(resetRoots).toHaveLength(2);
      expect(Array.getUnsafe(resetRoots, 0)).toHaveProp('value', '/same');
      expect(Array.getUnsafe(resetRoots, 1)).toHaveProp('value', '/same');
      expect(screen.getByLabelText('Folder')).toHaveProp('value', '/default');
      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      loadSettings.mockResolvedValueOnce(
        Response.json([
          descriptors[0],
          textField,
          { ...textField, name: 'new', label: 'New location', initialValue: '/fresh' },
        ])
      );
      await fireEvent.changeText(screen.getByLabelText('Name'), 'Renamed');
      await waitFor(() => {
        expect(loadSettings).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      });
      await fireEvent.press(screen.getByRole('button', { name: 'Storage settings' }));
      await screen.findByLabelText('New location');
      const replacedRoots = screen.getAllByLabelText('Directories');
      expect(replacedRoots).toHaveLength(1);
      expect(Array.getUnsafe(replacedRoots, 0)).toHaveProp('value', '/media/original');
      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(save).toHaveBeenCalledWith({
          name: 'Renamed',
          type: original.type,
          storagePluginId: plugin,
          storagePluginSettings: { roots: ['/media/original'], folder: '/default', new: '/fresh' },
        });
      });
    }
  );

  it('preloads local settings without opening Storage', async () => {
    const editor = await setup();
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(loadSettings).toHaveBeenCalledTimes(1);
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Audiobooks');
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith({
      name: 'Audiobooks',
      type: 'audiobook',
      storagePluginId: 'builtin:local',
      storagePluginSettings: { roots: ['/media/original'] },
    });
  });

  it('requires consent for each new library even when descriptors are cached', async () => {
    const registry = AtomRegistry.make();
    const editor = await setup({ registry });
    await enterCustom(editor);
    expect(editor.result.current.needsConsent).toBe(true);
    expect(loadSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ storagePluginId: plugin })
    );
    await act(() => {
      editor.result.current.handleRequestConsent();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    const fresh = await setup({ registry });
    await enterCustom(fresh);
    await act(() => {
      fresh.result.current.handleRequestConsent();
    });
    await act(() => {
      fresh.result.current.handleCancelConsent();
    });
    await act(async () => fresh.result.current.form.handleSubmit());
    expect(fresh.result.current.form.state.values.storagePluginId).toBe(plugin);
    expect(fresh.result.current.ready).toBe(false);
    expect(
      Array.filter(loadSettings.mock.calls, ([metadata]) => metadata.storagePluginId === plugin)
    ).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('cancels consent for a changed plugin without changing the ID or loading it', async () => {
    const editor = await setup({ source: editSource });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    expect(editor.result.current.needsConsent).toBe(true);
    await act(() => {
      editor.result.current.handleRequestConsent();
    });
    await act(() => {
      editor.result.current.handleCancelConsent();
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(editor.result.current.form.state.values.storagePluginId).toBe(otherPlugin);
    expect(editor.result.current.pending).toEqual(Option.none());
    expect(editor.result.current.ready).toBe(false);
    expect(loadSettings).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('loads changed metadata in the background and uses exactly the returned settings', async () => {
    const editor = await setup({ source: editSource });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    loadSettings.mockResolvedValueOnce(
      Response.json([
        {
          kind: 'TextField',
          name: 'folder',
          label: 'Folder',
          placeholder: '',
          purpose: 'text',
          initialValue: '/fresh',
        },
        { ...descriptors[0], name: 'constructor', initialValue: ['/safe'] },
      ])
    );
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginSettings.roots', ['/edited']);
      editor.result.current.form.setFieldValue('type', 'movie');
    });
    await waitFor(() => {
      expect(loadSettings).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(editor.result.current.pending).toEqual(Option.none());
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith({
      name: original.name,
      type: 'movie',
      storagePluginId: plugin,
      storagePluginSettings: { folder: '/fresh', constructor: ['/safe'] },
    });
  });

  it('keeps form values independent when descriptors come from a shared cached query', async () => {
    const registry = AtomRegistry.make();
    const first = await setup({ source: editSource, registry });
    await waitFor(() => {
      expect(first.result.current.ready).toBe(true);
    });
    await act(() => {
      first.result.current.form.setFieldValue('storagePluginSettings.roots', ['/media/first']);
    });
    const second = await setup({ source: editSource, registry });
    await waitFor(() => {
      expect(second.result.current.ready).toBe(true);
    });
    await act(async () => first.result.current.form.handleSubmit());
    await act(async () => second.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ storagePluginSettings: { roots: ['/media/first'] } })
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ storagePluginSettings: { roots: ['/media/original'] } })
    );
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  it('ignores an older load after the plugin changes', async () => {
    const delayed = await Effect.runPromise(Deferred.make<Response>());
    loadSettings.mockImplementation(async ({ storagePluginId }) =>
      storagePluginId === plugin
        ? Effect.runPromise(Deferred.await(delayed))
        : Response.json(descriptors)
    );
    const editor = await setup();
    await enterCustom(editor);
    await act(() => {
      editor.result.current.handleRequestConsent();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(loadSettings).toHaveBeenCalledWith(
        expect.objectContaining({ storagePluginId: plugin })
      );
    });
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).not.toHaveBeenCalled();
    loadSettings.mockResolvedValueOnce(
      Response.json([
        {
          kind: 'TextField',
          name: 'folder',
          label: 'Folder',
          placeholder: '',
          purpose: 'text',
          initialValue: '/new',
        },
      ])
    );
    await act(() => {
      editor.result.current.handleRequestConsent();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(delayed, Response.json(descriptors)));
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith({
      name: 'Audiobooks',
      type: 'audiobook',
      storagePluginId: otherPlugin,
      storagePluginSettings: { folder: '/new' },
    });
  });

  it('retries failed settings loading without asking for consent again', async () => {
    loadSettings.mockImplementation(async ({ storagePluginId }) =>
      storagePluginId === plugin
        ? Response.json(PluginLoadError.make({ message: 'Failed to load plugin' }), { status: 500 })
        : Response.json(descriptors)
    );
    const editor = await setup();
    await enterCustom(editor);
    await act(() => {
      editor.result.current.handleRequestConsent();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(AsyncResult.isFailure(editor.result.current.settings)).toBe(true);
    });
    loadSettings.mockResolvedValueOnce(Response.json(descriptors));
    await act(() => {
      editor.result.current.handleRetry();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(editor.result.current.pending).toEqual(Option.none());
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ storagePluginSettings: { roots: ['/media/original'] } })
    );
  });
});
