import { RegistryContext } from '@effect/atom-react';
import type { ModalBottomSheet, ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { StoragePluginSettingsForms } from '@govoel/plugins/storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Array, Deferred, Effect, Option, Result, Schema } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';
import type { Href } from 'expo-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { useEffect, useImperativeHandle } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@repo/spec-api/domains/auth/http.ts';
import { Library, LibraryNameConflictError } from '@repo/spec-api/domains/library/schema.ts';
import { PluginLoadError } from '@repo/spec-api/domains/plugins/schema.ts';
import { StoragePluginId } from '@repo/spec-api/domains/plugins/storage.ts';

import AndroidEditLibraryScreen from '#src/app/accounts/(selected)/server/libraries/[id]/edit/index.android.tsx';
import IosEditLibraryScreen from '#src/app/accounts/(selected)/server/libraries/[id]/edit/index.tsx';
import AndroidCreateLibraryScreen from '#src/app/accounts/(selected)/server/libraries/create/index.android.tsx';
import IosCreateLibraryScreen from '#src/app/accounts/(selected)/server/libraries/create/index.tsx';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import type * as Management from '#src/domains/library/management.ts';

const native = vi.hoisted(() => ({ hide: vi.fn<() => Promise<void>>() }));
const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  dismissTo: vi.fn(),
  back: vi.fn(),
  params: { id: '' },
}));
const api = vi.hoisted(() => ({
  load: vi.fn<
    (
      request: Parameters<typeof Management.libraryFormAtom>[0]
    ) => Effect.Effect<
      Atom.Success<ReturnType<typeof Management.libraryFormAtom>>,
      Atom.Failure<ReturnType<typeof Management.libraryFormAtom>>
    >
  >(),
  loadPlugin: vi.fn<typeof Management.loadStoragePlugin>(),
  create: vi.fn<typeof Management.createLibrary>(),
  update: vi.fn<typeof Management.updateLibrary>(),
}));

vi.mock('#src/runtime/index.ts', async () => {
  const { Atom, Reactivity } = await import('effect/reactivity');
  return { AppRuntime: Atom.runtime(Reactivity.layer) };
});
vi.mock('#src/domains/library/management.ts', async (importOriginal) => {
  const { Effect: effect } = await import('effect');
  const { Atom } = await import('effect/reactivity');
  const original = await importOriginal<typeof Management>();
  return {
    ...original,
    libraryFormAtom: Atom.family((request: Parameters<typeof original.libraryFormAtom>[0]) =>
      Atom.make(effect.suspend(() => api.load(request)))
    ),
    loadStoragePlugin: api.loadPlugin,
    createLibrary: api.create,
    updateLibrary: api.update,
  };
});
vi.mock('#src/components/form', async () => {
  const { AppRuntime: runtime } = await import('#src/runtime/index.ts');
  const {
    TextListFieldEntry,
    createEffectSchemaFormHook,
    fieldContext,
    formContext,
    useSubmitState,
    useTextFieldState,
    useTextListFieldState,
  } = await import('#src/components/form/hooks.tsx');
  const TextField = ({ label }: { readonly label: string }) => {
    const { field, isSubmitting } = useTextFieldState();
    return (
      <TextInput
        accessibilityLabel={label}
        editable={!isSubmitting}
        value={field.state.value}
        onChangeText={field.handleChange}
      />
    );
  };
  const TextListField = ({ label }: { readonly label: string }) => {
    const { entries, add, remove } = useTextListFieldState();
    return (
      <View>
        {Array.map(entries, (_, index) => (
          <View key={index}>
            <TextListFieldEntry index={index}>
              <TextField label={`${label} ${index + 1}`} />
            </TextListFieldEntry>
            <Pressable
              role="button"
              accessibilityLabel={`Remove ${label} ${index + 1}`}
              onPress={() => {
                remove({ indices: [index] });
              }}
            />
          </View>
        ))}
        <Pressable role="button" accessibilityLabel={`Add to ${label}`} onPress={add} />
      </View>
    );
  };
  const SubmitButton = ({
    children,
    disabled = false,
    group,
  }: PropsWithChildren<
    { readonly disabled?: boolean } & NonNullable<Parameters<typeof useSubmitState>[0]>
  >) => {
    const { submit, canSubmit, isSubmitting, errorMessage } = useSubmitState({ group });
    return (
      <>
        <Pressable
          role="button"
          disabled={!canSubmit || isSubmitting || disabled}
          onPress={() => void submit()}>
          {children}
        </Pressable>
        {isSubmitting ? <Text>Saving</Text> : null}
        {Option.match(errorMessage, {
          onNone: () => null,
          onSome: (message) => <Text>{message}</Text>,
        })}
      </>
    );
  };
  return createEffectSchemaFormHook({
    runtime,
    fieldContext,
    formContext,
    fieldComponents: { TextField, SecureField: TextField, TextListField },
    formComponents: { SubmitButton },
  });
});
vi.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));
vi.mock('expo-router', () => ({
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
  useRouter: () => navigation,
  useLocalSearchParams: () => navigation.params,
  useFocusEffect: (effect: () => void) => {
    useEffect(effect);
  },
  Redirect: ({ href }: { readonly href: Href }) => {
    useEffect(() => {
      navigation.replace(href);
    }, [href]);
    return null;
  },
}));
vi.mock('#src/components/form/layout', () => ({
  FormLayout: ({
    children,
    footer,
    sections,
    title,
  }: PropsWithChildren<{
    readonly footer: ReactNode;
    readonly sections?: ReactNode;
    readonly title?: string;
  }>) => (
    <View>
      <Text>{title}</Text>
      {children}
      {sections}
      {footer}
    </View>
  ),
}));
vi.mock('#src/components/list-state', () => ({
  ListState: (props: { readonly kind: string; readonly message?: string }) => (
    <Text>{props.message ?? props.kind}</Text>
  ),
}));
vi.mock('#src/components/text', () => ({ Text }));
vi.mock('#src/components/sheet', () => ({
  Sheet: ({
    children,
    onDismissed,
  }: {
    readonly children: (props: { readonly dismiss: () => void }) => ReactNode;
    readonly onDismissed: () => void;
  }) => <View>{children({ dismiss: onDismissed })}</View>,
}));
vi.mock('#src/components/invalid-link-screen', () => ({
  InvalidLinkScreen: () => <Text>This link is invalid.</Text>,
}));
vi.mock('#src/constants/material.ts', () => ({
  materialSeedColor: 'blue',
}));
vi.mock('@expo/ui', () => ({ Icon: () => null }));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: PropsWithChildren) => <View>{children}</View>,
  HStack: ({ children }: PropsWithChildren) => <View>{children}</View>,
  VStack: ({ children }: PropsWithChildren) => <View>{children}</View>,
  ProgressView: () => <Text>Loading</Text>,
  Section: ({ children, footer }: PropsWithChildren<{ readonly footer?: ReactNode }>) => (
    <View>
      {children}
      {footer}
    </View>
  ),
  Spacer: () => null,
  Button: ({
    children,
    modifiers = [],
    onPress,
  }: PropsWithChildren<{
    readonly modifiers?: ReadonlyArray<{ readonly disabled?: boolean }>;
    readonly onPress: () => void;
  }>) => (
    <Pressable
      role="button"
      disabled={Array.some(modifiers, (modifier) => modifier.disabled === true)}
      onPress={onPress}>
      {children}
    </Pressable>
  ),
  LabeledContent: ({ label, children }: PropsWithChildren<{ readonly label: string }>) => (
    <View>
      <Text>{label}</Text>
      {children}
    </View>
  ),
  Picker: ({
    label,
    selection,
    onSelectionChange,
    children,
  }: PropsWithChildren<{
    readonly label: string;
    readonly selection: string;
    readonly onSelectionChange: (selection: string) => void;
  }>) => (
    <View>
      <TextInput accessibilityLabel={label} value={selection} onChangeText={onSelectionChange} />
      {children}
    </View>
  ),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  buttonStyle: () => ({}),
  disabled: (disabled: boolean) => ({ disabled }),
  environment: () => ({}),
  font: () => ({}),
  foregroundStyle: () => ({}),
  frame: () => ({}),
  pickerStyle: () => ({}),
  tag: () => ({}),
  tint: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: PropsWithChildren) => <View>{children}</View>,
  ModalBottomSheet: ({
    children,
    ref,
  }: Pick<ComponentProps<typeof ModalBottomSheet>, 'children' | 'ref'>) => {
    useImperativeHandle(
      ref,
      () =>
        ({
          hide: native.hide,
          expand: async () => void 0,
          partialExpand: async () => void 0,
        }) satisfies ModalBottomSheetRef
    );
    return <View>{children}</View>;
  },
}));

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const libraryId = Library.fields.id.make(7);
const roots = ({ initialValue }: { readonly initialValue: ReadonlyArray<string> }) => [
  {
    kind: 'TextListField',
    name: 'roots',
    label: 'Directories',
    placeholder: '/path/to/media',
    purpose: 'text',
    initialValue,
  } as const,
];
const loadedPlugin = Effect.fnUntraced(function* ({
  storagePluginId,
  forms,
}: {
  readonly storagePluginId: typeof StoragePluginId.Encoded;
  readonly forms: typeof StoragePluginSettingsForms.Encoded;
}) {
  return {
    storagePluginId: yield* Schema.decodeEffect(StoragePluginId)(storagePluginId),
    forms: yield* StoragePluginSettingsForms.decodeEffect(forms),
  };
});
const loadedForm = Effect.fnUntraced(function* ({
  forms,
  storagePluginId = 'builtin:local',
  ...library
}: {
  readonly name: string;
  readonly type: typeof Library.json.fields.type.Encoded;
  readonly storagePluginId?: typeof StoragePluginId.Encoded;
  readonly forms: typeof StoragePluginSettingsForms.Encoded;
}) {
  const plugin = yield* loadedPlugin({ storagePluginId, forms });
  return { ...library, storagePluginId: plugin.storagePluginId, plugin: Result.succeed(plugin) };
});
const brokenPluginForm = Effect.fnUntraced(function* ({
  name,
  type,
  storagePluginId,
}: {
  readonly name: string;
  readonly type: typeof Library.json.fields.type.Encoded;
  readonly storagePluginId: typeof StoragePluginId.Encoded;
}) {
  return {
    name: Library.json.fields.name.make(name),
    type: Library.json.fields.type.make(type),
    storagePluginId: yield* Schema.decodeEffect(StoragePluginId)(storagePluginId),
    plugin: Result.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' })),
  };
});
const localForms = {
  audiobook: roots({ initialValue: [] }),
  movie: roots({ initialValue: [] }),
  show: roots({ initialValue: [] }),
};
const bucketForms = {
  movie: [
    {
      kind: 'TextField',
      name: 'bucket',
      label: 'Bucket',
      placeholder: 'media',
      purpose: 'text',
      initialValue: 'saved-bucket',
    } as const,
  ],
};
const npmPluginWarning =
  'Loading a plugin downloads it and runs its code on your server. Only use plugins you trust.';
const loadPlugin = 'Load plugin & edit settings';

const registries = new Set<AtomRegistry.AtomRegistry>();
const renderScreen = async ({ content }: { readonly content: Parameters<typeof render>[0] }) => {
  const registry = AtomRegistry.make();
  registries.add(registry);
  return render(content, {
    wrapper: ({ children }: PropsWithChildren) => (
      <RegistryContext.Provider value={registry}>
        <SelectedAccountContext.Provider value={account}>
          {children}
        </SelectedAccountContext.Provider>
      </RegistryContext.Provider>
    ),
  });
};
const submit = async ({ label }: { readonly label: string }) => {
  const button = screen.getByRole('button', { name: label });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  await fireEvent.press(button);
};

beforeEach(() => {
  native.hide.mockReset().mockResolvedValue();
  navigation.replace.mockClear();
  navigation.dismissTo.mockClear();
  navigation.params = { id: String(libraryId) };
  api.load.mockReset().mockReturnValue(loadedForm({ name: '', type: 'movie', forms: localForms }));
  api.loadPlugin.mockReset().mockImplementation(({ storagePluginId }) =>
    loadedPlugin({
      storagePluginId,
      forms: storagePluginId === 'builtin:local' ? localForms : bucketForms,
    })
  );
  api.create.mockReset().mockReturnValue(Effect.succeed({ id: libraryId }));
  api.update.mockReset().mockReturnValue(Effect.succeed({ id: libraryId }));
});
afterEach(() => {
  for (const registry of registries) {
    registry.dispose();
  }
  registries.clear();
});

describe.each([
  { platform: 'iOS', CreateLibraryScreen: IosCreateLibraryScreen },
  { platform: 'Android', CreateLibraryScreen: AndroidCreateLibraryScreen },
])('$platform library creation', ({ platform, CreateLibraryScreen }) => {
  it('submits the selected type’s settings without blank entries, then opens the library', async () => {
    const dismissed = await Effect.runPromise(Deferred.make<undefined>());
    native.hide.mockImplementation(async () => Effect.runPromise(Deferred.await(dismissed)));
    await renderScreen({ content: <CreateLibraryScreen /> });

    await fireEvent.changeText(await screen.findByLabelText('Name'), '  Films  ');
    await submit({ label: 'Storage settings' });
    await fireEvent.changeText(screen.getByLabelText('Directories 1'), '/media/old');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Directories' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Directories' }));
    await fireEvent.changeText(screen.getByLabelText('Directories 3'), '/media/films');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Directories 1' }));
    expect(screen.getByLabelText('Directories 1')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Directories 2')).toHaveDisplayValue('/media/films');
    await submit({ label: 'Done' });
    expect(screen.queryByLabelText('Directories 1')).toBeNull();

    await submit({ label: 'Create library' });
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledExactlyOnceWith({
        account,
        library: {
          name: 'Films',
          type: 'movie',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/media/films'] },
        },
      });
    });
    if (platform === 'Android') {
      await waitFor(() => {
        expect(native.hide).toHaveBeenCalled();
      });
      expect(navigation.replace).not.toHaveBeenCalled();
    }
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(dismissed, void 0));
    });
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith({
        pathname: '/accounts/server/libraries/[id]',
        params: { id: libraryId },
      });
    });
  });

  it('keeps settings per media type', async () => {
    await renderScreen({ content: <CreateLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Shows');
    await submit({ label: 'Storage settings' });
    await fireEvent.changeText(screen.getByLabelText('Directories 1'), '/media/movies');
    await fireEvent.changeText(screen.getByLabelText('Media type'), 'show');
    expect(screen.getByLabelText('Directories 1')).toHaveDisplayValue('');
    await fireEvent.changeText(screen.getByLabelText('Directories 1'), '/media/shows');
    await fireEvent.changeText(screen.getByLabelText('Media type'), 'movie');
    expect(screen.getByLabelText('Directories 1')).toHaveDisplayValue('/media/movies');
    await fireEvent.changeText(screen.getByLabelText('Media type'), 'show');

    await submit({ label: 'Create library' });
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledExactlyOnceWith({
        account,
        library: {
          name: 'Shows',
          type: 'show',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/media/shows'] },
        },
      });
    });
  });

  it('requires a name, and shows server rejections until the input changes', async () => {
    api.create.mockReturnValue(
      Effect.fail(LibraryNameConflictError.make({ libraryName: Library.fields.name.make('Films') }))
    );
    await renderScreen({ content: <CreateLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Name'), '   ');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create library' })).toBeDisabled();
    });
    expect(api.create).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Films');
    await submit({ label: 'Create library' });
    expect(
      await screen.findByText('A library with this name already exists. Choose another name.')
    ).toBeOnTheScreen();
    expect(native.hide).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    expect(
      screen.queryByText('A library with this name already exists. Choose another name.')
    ).toBeNull();
  });

  it('loads an npm plugin only when asked, and saves with its settings', async () => {
    await renderScreen({ content: <CreateLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Films');
    expect(screen.queryByText(npmPluginWarning)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    expect(screen.getByText(npmPluginWarning)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Storage settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create library' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Package'), '   ');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: loadPlugin })).toBeDisabled();
    });
    await fireEvent.changeText(screen.getByLabelText('Package'), ' voel-storage-s3 ');
    expect(api.loadPlugin).not.toHaveBeenCalled();
    const loading = await Effect.runPromise(Deferred.make<undefined>());
    api.loadPlugin.mockImplementationOnce(({ storagePluginId }) =>
      Deferred.await(loading).pipe(
        Effect.andThen(loadedPlugin({ storagePluginId, forms: bucketForms }))
      )
    );
    await submit({ label: loadPlugin });
    await waitFor(() => {
      expect(screen.getByLabelText('Package')).toBeDisabled();
    });
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByText('Loading')).toBeOnTheScreen();
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(loading, void 0));
    });
    expect(await screen.findByLabelText('Bucket')).toHaveDisplayValue('saved-bucket');
    expect(screen.getByLabelText('Package')).toBeEnabled();
    expect(api.loadPlugin).toHaveBeenCalledExactlyOnceWith({
      account,
      id: Option.none(),
      storagePluginId: 'npm:voel-storage-s3',
    });
    expect(screen.queryByRole('button', { name: loadPlugin })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-other');
    expect(screen.queryByLabelText('Bucket')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create library' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-s3');
    await fireEvent.changeText(screen.getByLabelText('Bucket'), 'films');
    expect(api.loadPlugin).toHaveBeenCalledOnce();

    await submit({ label: 'Create library' });
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledExactlyOnceWith({
        account,
        library: {
          name: 'Films',
          type: 'movie',
          storagePluginId: 'npm:voel-storage-s3',
          storagePluginSettings: { bucket: 'films' },
        },
      });
    });
  });

  it('explains, instead of opening settings, when a loaded plugin doesn’t support the type', async () => {
    await renderScreen({ content: <CreateLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Media type'), 'show');
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-s3');
    await submit({ label: loadPlugin });
    expect(
      await screen.findByText(
        '“voel-storage-s3” doesn’t support TV shows. Choose another media type.'
      )
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Bucket')).toBeNull();
    expect(screen.getByRole('button', { name: 'Storage settings' })).toBeDisabled();
  });

  it('loads local folders as soon as they’re chosen, starting their settings afresh', async () => {
    await renderScreen({ content: <CreateLibraryScreen /> });
    await submit({ label: 'Storage settings' });
    await fireEvent.changeText(await screen.findByLabelText('Directories 1'), '/media/films');
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'builtin:local');
    expect(screen.getByLabelText('Directories 1')).toHaveDisplayValue('/media/films');

    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-s3');
    await submit({ label: loadPlugin });
    await screen.findByLabelText('Bucket');
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'builtin:local');
    expect(await screen.findByLabelText('Directories 1')).toHaveDisplayValue('');
  });

  it('keeps the loaded plugin when another can’t be loaded, until the choice changes', async () => {
    api.loadPlugin.mockReturnValue(
      Effect.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
    );
    await renderScreen({ content: <CreateLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Films');
    await fireEvent.changeText(screen.getByLabelText('Provider'), 'npm');
    await fireEvent.changeText(screen.getByLabelText('Package'), 'not-a-plugin');
    await submit({ label: loadPlugin });
    expect(
      await screen.findByText(
        'Unable to install or load this plugin. Check the package name and try again.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: loadPlugin })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Bucket')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create library' })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByLabelText('Package')).toBeEnabled();
    });
    await fireEvent.changeText(screen.getByLabelText('Package'), 'another-plugin');
    await fireEvent.changeText(screen.getByLabelText('Package'), 'not-a-plugin');
    expect(
      screen.queryByText(
        'Unable to install or load this plugin. Check the package name and try again.'
      )
    ).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Provider'), 'builtin:local');
    await submit({ label: 'Storage settings' });
    expect(screen.getByLabelText('Directories 1')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create library' })).toBeEnabled();
    });
  });

  it('explains why the form can’t load', async () => {
    api.load.mockReturnValue(Effect.fail(ForbiddenError.make()));
    await renderScreen({ content: <CreateLibraryScreen /> });
    expect(
      await screen.findByText('Only server administrators can manage libraries.')
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});

describe.each([
  { platform: 'iOS', EditLibraryScreen: IosEditLibraryScreen },
  { platform: 'Android', EditLibraryScreen: AndroidEditLibraryScreen },
])('$platform library editing', ({ EditLibraryScreen }) => {
  it('starts from saved values and saves back to the library', async () => {
    api.load.mockReturnValue(
      loadedForm({
        name: 'Films',
        type: 'movie',
        forms: {
          audiobook: roots({ initialValue: ['/media/films'] }),
          movie: roots({ initialValue: ['/media/films'] }),
          show: roots({ initialValue: ['/media/films'] }),
        },
      })
    );
    await renderScreen({ content: <EditLibraryScreen /> });
    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('Films');
    await submit({ label: 'Storage settings' });
    expect(screen.getByLabelText('Directories 1')).toHaveDisplayValue('/media/films');
    expect(api.load).toHaveBeenCalledWith({ account, id: Option.some(libraryId) });

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Movies');
    await submit({ label: 'Save changes' });
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledExactlyOnceWith({
        account,
        id: libraryId,
        library: {
          name: 'Movies',
          type: 'movie',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/media/films'] },
        },
      });
    });
    await waitFor(() => {
      expect(navigation.dismissTo).toHaveBeenCalledExactlyOnceWith({
        pathname: '/accounts/server/libraries/[id]',
        params: { id: libraryId },
      });
    });
  });

  it('flags a saved media type the plugin no longer supports', async () => {
    api.load.mockReturnValue(
      loadedForm({
        name: 'Shows',
        type: 'show',
        storagePluginId: 'npm:@voel/storage@1.2.0',
        forms: bucketForms,
      })
    );
    await renderScreen({ content: <EditLibraryScreen /> });
    expect(
      await screen.findByText(
        '“@voel/storage@1.2.0” doesn’t support TV shows. Choose another media type.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Package')).toHaveDisplayValue('@voel/storage@1.2.0');
    expect(screen.getByText('Movies')).toBeOnTheScreen();
    expect(screen.getByText('TV shows')).toBeOnTheScreen();
    expect(screen.getByText('Audiobooks')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Storage settings' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(screen.queryByText('Saving')).toBeNull();
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });
    expect(api.update).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Media type'), 'movie');
    await submit({ label: 'Storage settings' });
    expect(screen.getByLabelText('Bucket')).toHaveDisplayValue('saved-bucket');
    await submit({ label: 'Save changes' });
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith({
        account,
        id: libraryId,
        library: {
          name: 'Shows',
          type: 'movie',
          storagePluginId: 'npm:@voel/storage@1.2.0',
          storagePluginSettings: { bucket: 'saved-bucket' },
        },
      });
    });
  });

  it('loads another plugin with the library’s saved settings', async () => {
    await renderScreen({ content: <EditLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Provider'), 'npm');
    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-s3');
    await submit({ label: loadPlugin });
    await screen.findByLabelText('Bucket');
    expect(api.loadPlugin).toHaveBeenCalledExactlyOnceWith({
      account,
      id: Option.some(libraryId),
      storagePluginId: 'npm:voel-storage-s3',
    });
  });

  it('lets a saved plugin that can’t be loaded be retried or replaced', async () => {
    api.load.mockReturnValue(
      brokenPluginForm({ name: 'Films', type: 'movie', storagePluginId: 'npm:voel-storage-s3' })
    );
    api.loadPlugin.mockReturnValueOnce(
      Effect.fail(PluginLoadError.make({ message: 'Failed to install or load plugin' }))
    );
    const pluginError =
      'Unable to install or load this plugin. Check the package name and try again.';
    await renderScreen({ content: <EditLibraryScreen /> });
    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('Films');
    expect(screen.getByLabelText('Package')).toHaveDisplayValue('voel-storage-s3');
    expect(screen.getByText(pluginError)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-other');
    expect(screen.queryByText(pluginError)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Package'), 'voel-storage-s3');
    expect(screen.getByText(pluginError)).toBeOnTheScreen();

    await submit({ label: loadPlugin });
    await waitFor(() => {
      expect(api.loadPlugin).toHaveBeenCalledExactlyOnceWith({
        account,
        id: Option.some(libraryId),
        storagePluginId: 'npm:voel-storage-s3',
      });
    });
    expect(await screen.findByText(pluginError)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Bucket')).toBeNull();
    await submit({ label: loadPlugin });
    expect(await screen.findByLabelText('Bucket')).toHaveDisplayValue('saved-bucket');
    expect(screen.queryByText(pluginError)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Provider'), 'builtin:local');
    expect(await screen.findByLabelText('Directories 1')).toHaveDisplayValue('');
    await fireEvent.changeText(screen.getByLabelText('Directories 1'), '/media/films');
    await submit({ label: 'Save changes' });
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledExactlyOnceWith({
        account,
        id: libraryId,
        library: {
          name: 'Films',
          type: 'movie',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/media/films'] },
        },
      });
    });
  });

  it('switches a saved plugin that can’t be loaded to local folders', async () => {
    api.load.mockReturnValue(
      brokenPluginForm({ name: 'Films', type: 'movie', storagePluginId: 'npm:voel-storage-s3' })
    );
    await renderScreen({ content: <EditLibraryScreen /> });
    await fireEvent.changeText(await screen.findByLabelText('Provider'), 'builtin:local');
    await submit({ label: 'Save changes' });
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledExactlyOnceWith({
        account,
        id: libraryId,
        library: {
          name: 'Films',
          type: 'movie',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: [] },
        },
      });
    });
    expect(
      screen.queryByText(
        'Unable to install or load this plugin. Check the package name and try again.'
      )
    ).toBeNull();
  });

  it('rejects links without a valid library ID', async () => {
    navigation.params = { id: 'nope' };
    await renderScreen({ content: <EditLibraryScreen /> });
    expect(screen.getByText('This link is invalid.')).toBeOnTheScreen();
    expect(api.load).not.toHaveBeenCalled();
  });
});
