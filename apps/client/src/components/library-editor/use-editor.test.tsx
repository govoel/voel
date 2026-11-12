import { RegistryContext } from '@effect/atom-react';
import { useField } from '@tanstack/react-form';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, String as EffectString, Option } from 'effect';
import type { Layer as EffectLayer } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import type { ApiClient as ApiClientService } from '#src/api-client.ts';
import { useLibraryEditor } from '#src/components/library-editor/use-editor.ts';
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
const requests: Array<{ readonly path: string; readonly method: string; readonly body: unknown }> =
  [];
const respond =
  vi.fn<(request: { readonly path: string; readonly method: string }) => Promise<Response>>();
const registries = new Set<AtomRegistry.AtomRegistry>();
const createSource = { _tag: 'Create' } as const;

const setup = async (source: LibraryEditorSource = createSource) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  const onSuccess = vi.fn();
  const wrapper = ({ children }: PropsWithChildren) => (
    <RegistryContext.Provider value={registry}>
      <SelectedAccountContext.Provider value={account}>{children}</SelectedAccountContext.Provider>
    </RegistryContext.Provider>
  );
  const hook = await renderHook(
    () => {
      const editor = useLibraryEditor({ source, onSuccess });
      useField({ form: editor.form, name: 'name' });
      useField({ form: editor.form, name: 'type' });
      useField({ form: editor.form, name: 'storagePluginId' });
      return editor;
    },
    { wrapper }
  );
  return { ...hook, onSuccess };
};

beforeEach(() => {
  requests.length = 0;
  respond.mockReset();
  respond.mockImplementation(async ({ path }) =>
    EffectString.endsWith('settings-form')(path)
      ? Response.json(descriptors)
      : Response.json({ id: 7 })
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request =
        input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      const path = new URL(request.url).pathname;
      const body: unknown = request.body === null ? null : await request.json();
      const captured = { path, method: request.method, body };
      requests.push(captured);
      return respond(captured);
    })
  );
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
  vi.unstubAllGlobals();
});

const enterCustom = async (editor: Awaited<ReturnType<typeof setup>>, id = plugin) => {
  await act(() => {
    editor.result.current.form.setFieldValue('name', 'Audiobooks');
    editor.result.current.selectProvider({ provider: 'custom' });
    editor.result.current.form.setFieldValue('storagePluginId', id);
  });
};

describe('library editor', () => {
  it('does not fetch or submit external code while typing or before consent, including in a new creation flow', async () => {
    const editor = await setup();
    await enterCustom(editor);
    expect(requests).toEqual([]);
    await act(() => {
      editor.result.current.handleLoad();
    });
    expect(Option.isSome(editor.result.current.pending)).toBe(true);
    expect(requests).toEqual([]);
    await act(async () => editor.result.current.form.handleSubmit());
    expect(requests).toEqual([]);
    await act(() => {
      editor.result.current.cancelConsent();
    });
    expect(requests).toEqual([]);
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.approve();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(requests).toEqual([
      {
        path: '/api/libraries/plugins/storage/settings-form',
        method: 'POST',
        body: { name: 'Audiobooks', type: 'audiobook', storagePluginId: plugin },
      },
    ]);
    await act(() => {
      editor.result.current.handleLoad();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(Option.isNone(editor.result.current.pending)).toBe(true);
    await editor.unmount();
    const fresh = await setup();
    await enterCustom(fresh);
    await act(() => {
      fresh.result.current.handleLoad();
    });
    expect(Option.isSome(fresh.result.current.pending)).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it('loads the saved plugin without consent, asks for a different ID, and preserves edited settings on cancel', async () => {
    const editor = await setup({ _tag: 'Edit', library: original });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(Option.isNone(editor.result.current.pending)).toBe(true);
    expect(requests[0]?.body).toMatchObject({ id: original.id, storagePluginId: plugin });
    await act(() => {
      editor.result.current.form.setFieldValue('listValues.roots', [
        newSettingsEntry({ value: '/media/edited' }),
      ]);
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    expect(editor.result.current.ready).toBe(false);
    await act(() => {
      editor.result.current.handleLoad();
    });
    expect(requests).toHaveLength(1);
    expect(Option.isSome(editor.result.current.pending)).toBe(true);
    await act(() => {
      editor.result.current.cancelConsent();
    });
    expect(editor.result.current.values.storagePluginId).toBe(plugin);
    expect(editor.result.current.values.listValues['roots']?.[0]?.value).toBe('/media/edited');
    expect(editor.result.current.ready).toBe(true);
    await act(() => {
      editor.result.current.selectProvider({ provider: 'local' });
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', plugin);
    });
    await act(() => {
      editor.result.current.handleLoad();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(Option.isNone(editor.result.current.pending)).toBe(true);
    expect(requests).toHaveLength(3);
  });

  it('ignores late descriptors after a different approved selection and submits only the new fields', async () => {
    const delayed = await Effect.runPromise(Deferred.make<Response>());
    respond.mockImplementationOnce(async () => Effect.runPromise(Deferred.await(delayed)));
    const editor = await setup();
    await enterCustom(editor);
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.approve();
    });
    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('storagePluginId', otherPlugin);
    });
    respond.mockImplementation(async ({ path }) =>
      EffectString.endsWith('settings-form')(path)
        ? Response.json([
            {
              kind: 'TextField',
              name: 'folder',
              label: 'Folder',
              placeholder: '/media',
              purpose: 'text',
              initialValue: '/media/new',
            },
          ])
        : Response.json({ id: 7 })
    );
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.approve();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(delayed, Response.json(descriptors)));
    });
    expect(editor.result.current.values.textValues).toEqual({ folder: '/media/new' });
    expect(editor.result.current.values.listValues).toEqual({});
    await act(async () => editor.result.current.form.handleSubmit());
    expect(requests[2]).toEqual({
      path: '/api/libraries',
      method: 'POST',
      body: {
        name: 'Audiobooks',
        type: 'audiobook',
        storagePluginId: otherPlugin,
        storagePluginSettings: { folder: '/media/new' },
      },
    });
    expect(editor.onSuccess).toHaveBeenCalledWith({ id: 7 });
  });

  it('retries a failed approved load without asking again, and retains the draft when saving fails', async () => {
    const editor = await setup();
    await enterCustom(editor);
    respond.mockResolvedValueOnce(
      Response.json(
        { _tag: 'PluginLoadError', message: 'Failed to install or load plugin' },
        { status: 500 }
      )
    );
    await act(() => {
      editor.result.current.handleLoad();
    });
    await act(() => {
      editor.result.current.approve();
    });
    await waitFor(() => {
      expect(editor.result.current.status._tag).toBe('Failed');
    });
    await act(() => {
      editor.result.current.handleLoad();
    });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    expect(Option.isNone(editor.result.current.pending)).toBe(true);
    respond.mockResolvedValueOnce(
      Response.json(
        { _tag: 'LibraryNameConflictError', libraryName: 'Audiobooks' },
        { status: 409 }
      )
    );
    await act(async () => editor.result.current.form.handleSubmit());
    expect(editor.onSuccess).not.toHaveBeenCalled();
    expect(editor.result.current.values.listValues['roots']?.[0]?.value).toBe('/media/original');
    await act(async () => editor.result.current.form.handleSubmit());
    expect(editor.onSuccess).toHaveBeenCalledWith({ id: 7 });
  });

  it('saves updates with descriptor values rather than persisted JSON, and prevents stale metadata submission', async () => {
    const editor = await setup({ _tag: 'Edit', library: original });
    await waitFor(() => {
      expect(editor.result.current.ready).toBe(true);
    });
    await act(() => {
      editor.result.current.form.setFieldValue('name', 'Renamed');
    });
    expect(editor.result.current.ready).toBe(false);
    await act(async () => editor.result.current.form.handleSubmit());
    expect(requests).toHaveLength(1);
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
    expect(requests[2]).toEqual({
      path: '/api/libraries/7',
      method: 'PUT',
      body: {
        name: 'Renamed',
        type: 'audiobook',
        storagePluginId: plugin,
        storagePluginSettings: { roots: ['/media/changed'] },
      },
    });
  });
});
