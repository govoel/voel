import { RegistryContext } from '@effect/atom-react';
import { useField } from '@tanstack/react-form';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, String as EffectString, Option } from 'effect';
import type { Layer as EffectLayer } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import type { ApiClient as ApiClientService } from '#src/api-client.ts';
import { useLibraryForm } from '#src/components/library-editor/use-form.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { newSettingsEntry } from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';

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
  const { createEffectSchemaFormHook, fieldContext, formContext } =
    await import('#src/components/form/hooks.tsx');
  const { Fragment } = await import('react');
  return createEffectSchemaFormHook({
    runtime,
    fieldContext,
    formContext,
    fieldComponents: { TextField: Fragment, SecureField: Fragment },
    formComponents: { SubmitButton: Fragment },
  });
});
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
const plugin = 'npm:@fixture/storage@1.0.0';
const otherPlugin = 'npm:@fixture/storage@2.0.0';
const original = {
  id: Library.fields.id.make(7),
  name: Library.fields.name.make('Audiobooks'),
  type: Library.fields.type.make('audiobook'),
  storagePluginId: Library.json.fields.storagePluginId.make(plugin),
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
const loadSettings = vi.fn<() => Promise<Response>>();
const save = vi.fn<(payload: unknown) => Promise<Response>>();
const registries = new Set<AtomRegistry.AtomRegistry>();
const createSource = { _tag: 'Create' } as const;

const setup = async (source: LibraryEditorSource = createSource) => {
  const registry = AtomRegistry.make();
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
      ? loadSettings()
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

describe('library editor', () => {
  it('requires consent before loading an external plugin for each new library', async () => {
    const editor = await setup();
    await enterCustom(editor);
    await act(() => {
      editor.result.current.handleLoad();
    });
    expect(Option.isSome(editor.result.current.pending)).toBe(true);
    await act(async () => editor.result.current.form.handleSubmit());
    await act(() => {
      editor.result.current.handleCancelConsent();
    });
    expect(loadSettings).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await editor.unmount();
    const fresh = await setup();
    await enterCustom(fresh);
    await act(() => {
      fresh.result.current.handleLoad();
    });
    expect(Option.isSome(fresh.result.current.pending)).toBe(true);
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  it('loads the saved plugin without consent and keeps edited settings when a plugin change is cancelled', async () => {
    const editor = await setup({ _tag: 'Edit', library: original });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('listValues.roots', [
        newSettingsEntry({ value: '/media/edited' }),
      ]);
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    await act(() => {
      editor.result.current.handleLoad();
    });
    expect(Option.isSome(editor.result.current.pending)).toBe(true);
    await act(async () => editor.result.current.form.handleSubmit());
    expect(loadSettings).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    await act(() => {
      editor.result.current.handleCancelConsent();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePluginId: plugin,
        storagePluginSettings: { roots: ['/media/edited'] },
      })
    );
  });

  it('saves only the latest plugin settings when an older load finishes late', async () => {
    const delayed = await Effect.runPromise(Deferred.make<Response>());
    loadSettings.mockImplementationOnce(async () => Effect.runPromise(Deferred.await(delayed)));
    const editor = await setup();
    await enterCustom(editor);
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(loadSettings).toHaveBeenCalledTimes(1);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    loadSettings.mockImplementation(async () =>
      Response.json([
        {
          kind: 'TextField',
          name: 'folder',
          label: 'Folder',
          placeholder: '/media',
          purpose: 'text',
          initialValue: '/media/new',
        },
      ])
    );
    await act(() => {
      editor.result.current.handleLoad();
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
      storagePluginSettings: { folder: '/media/new' },
    });
  });

  it('can retry a failed settings load without asking for consent again', async () => {
    const editor = await setup();
    await enterCustom(editor);
    loadSettings.mockResolvedValueOnce(
      Response.json(
        { _tag: 'PluginLoadError', message: 'Failed to install or load plugin' },
        { status: 500 }
      )
    );
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.handleApprove();
    });
    await waitFor(() => {
      expect(AsyncResult.isFailure(editor.result.current.settings)).toBe(true);
    });
    await act(() => {
      editor.result.current.handleLoad();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ storagePluginSettings: { roots: ['/media/original'] } })
    );
  });

  it('requires reloading storage settings before saving changed library details', async () => {
    const editor = await setup({ _tag: 'Edit', library: original });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Renamed');
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).not.toHaveBeenCalled();
    await act(() => {
      editor.result.current.handleLoad();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('listValues.roots', [
        newSettingsEntry({ value: '/media/changed' }),
      ]);
    });
    await act(async () => editor.result.current.form.handleSubmit());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed',
        storagePluginSettings: { roots: ['/media/changed'] },
      })
    );
  });
});
