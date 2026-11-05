import { RegistryContext } from '@effect/atom-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Array, Effect, String as EffectString, Option, Schema } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { PropsWithChildren } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { useCreateLibraryForm } from '#src/app/accounts/(selected)/server/libraries/create/index.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { SelectedAccountContext } from '#src/domains/accounts/scope.ts';
import { newRootRow } from '#src/domains/library/management.ts';

vi.mock('#src/runtime/index.ts', async () => {
  const { Effect: MockEffect, Layer, Schema: MockSchema } = await import('effect');
  const { Atom, Reactivity } = await import('effect/reactivity');
  const { FetchHttpClient } = await import('effect/http');
  const { ApiClientMap } = await import('#src/api-client.ts');
  const { AuthClientMap } = await import('#src/domains/accounts/auth-client/index.ts');
  const { AccountRepository } = await import('#src/domains/accounts/repository.ts');
  return {
    AppRuntime: Atom.runtime(
      ApiClientMap.layerNoDeps.pipe(
        Layer.provide([
          FetchHttpClient.layer,
          Reactivity.layer,
          AuthClientMap.layerNoDeps.pipe(
            Layer.provide(
              Layer.mock(AccountRepository, {
                list: MockEffect.succeed([]),
                getActiveKey: MockEffect.succeedNone,
                readAuthStorage: () =>
                  MockSchema.encodeEffect(MockSchema.fromJsonString(MockSchema.Unknown))({
                    'auth.session_token': { value: 'test', expires: null },
                  }).pipe(
                    MockEffect.orDie,
                    MockEffect.map((cookie) => ({ voel_cookie: cookie }))
                  ),
                writeAuthStorageItem: () => MockEffect.void,
                findByKey: () => MockEffect.succeedNone,
              })
            )
          ),
        ])
      )
    ),
  };
});
vi.mock('#src/components/form', async () => {
  const { AppRuntime } = await import('#src/runtime/index.ts');
  const { createEffectSchemaFormHook, fieldContext, formContext, useFieldContext, useSubmitState } =
    await import('#src/components/form/hooks.tsx');
  const TextField = ({ label }: { label: string }) => {
    const field = useFieldContext<string>();
    return (
      <TextInput
        accessibilityLabel={label}
        value={field.state.value}
        onChangeText={field.handleChange}
      />
    );
  };
  const SubmitButton = ({ children }: PropsWithChildren) => {
    const { form, canSubmit, isSubmitting, errorMessage } = useSubmitState();
    return (
      <>
        <Pressable
          role="button"
          disabled={!canSubmit || isSubmitting}
          onPress={() => {
            void form.handleSubmit();
          }}>
          {children}
        </Pressable>
        {Option.match(errorMessage, {
          onNone: () => null,
          onSome: (message) => <Text>{message}</Text>,
        })}
      </>
    );
  };
  return createEffectSchemaFormHook({
    runtime: AppRuntime,
    fieldContext,
    formContext,
    fieldComponents: { TextField },
    formComponents: { SubmitButton },
  });
});
vi.mock('expo-device', () => ({ deviceName: 'Test phone' }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `voel://${path}` }));
vi.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => void 0 }) }));

const account = AccountKey.make({
  serverUrl: AccountKey.fields.serverUrl.make('https://example.test'),
  userId: AccountKey.fields.userId.make('admin'),
});
const requests: Array<{ path: string; body: unknown }> = [];
const created = vi.fn();
const registry = AtomRegistry.make();
afterEach(() => {
  vi.restoreAllMocks();
  requests.length = 0;
  created.mockClear();
  registry.reset();
});

const Harness = () => {
  const controller = useCreateLibraryForm({ onSuccess: created });
  const { form } = controller;
  return (
    <form.AppForm>
      <Text>{controller.expanded}</Text>
      <Pressable
        role="button"
        onPress={() => {
          controller.handleExpand('library');
        }}>
        <Text>Edit details</Text>
      </Pressable>
      <Pressable
        role="button"
        onPress={() => {
          controller.handleExpand('roots');
        }}>
        <Text>Edit roots</Text>
      </Pressable>
      {controller.expanded === 'library' ? (
        <form.AppField name="name">
          {(field) => <field.TextField placeholder="" label="Name" />}
        </form.AppField>
      ) : null}
      {controller.expanded === 'settings'
        ? Array.map(controller.fields, (descriptor) => (
            <form.AppField key={descriptor.name} name={`values.${descriptor.name}`}>
              {(field) => <field.TextField placeholder="" label={descriptor.label} />}
            </form.AppField>
          ))
        : null}
      {controller.expanded === 'roots' ? (
        <form.Subscribe selector={(state) => state.values.roots}>
          {(rows) => (
            <>
              {Array.map(rows, (row, index) => (
                <View key={row.key}>
                  <form.AppField name={`roots[${index}].root`}>
                    {(field) => <field.TextField placeholder="" label={`Root ${index + 1}`} />}
                  </form.AppField>
                  <Pressable
                    role="button"
                    onPress={() => {
                      form.setFieldValue(
                        'roots',
                        Array.filter(rows, (_, i) => i !== index)
                      );
                    }}>
                    <Text>{`Remove root ${index + 1}`}</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                role="button"
                onPress={() => {
                  form.setFieldValue('roots', [...rows, newRootRow()]);
                }}>
                <Text>Add root</Text>
              </Pressable>
            </>
          )}
        </form.Subscribe>
      ) : null}
      <form.SubmitButton>
        <Text>{controller.primaryLabel}</Text>
      </form.SubmitButton>
    </form.AppForm>
  );
};

it('retains values across sections, reloads changed draft metadata, and only creates on the final action', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    let body: unknown = null;
    if (input instanceof Request) {
      body = await input.json();
    } else if (init?.body instanceof Uint8Array) {
      body = await Effect.runPromise(
        Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          new TextDecoder().decode(init.body)
        )
      );
    } else if (typeof init?.body === 'string') {
      body = await Effect.runPromise(
        Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(init.body)
      );
    }
    if (path === '/api/auth/get-session') {
      return Response.json(null);
    }
    requests.push({ path, body });
    if (EffectString.endsWith('/settings-form')(path)) {
      return Response.json([
        {
          _tag: 'TextField',
          name: 'bucket',
          label: 'Bucket',
          placeholder: '',
          initialValue: 'media',
        },
      ]);
    }
    if (path === '/api/libraries') {
      return Response.json({ id: 42 });
    }
    throw new Error(path);
  });
  await render(
    <RegistryContext.Provider value={registry}>
      <SelectedAccountContext.Provider value={account}>
        <Harness />
      </SelectedAccountContext.Provider>
    </RegistryContext.Provider>
  );
  await fireEvent.changeText(screen.getByLabelText('Name'), 'My books');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Bucket');
  expect(requests).toHaveLength(1);
  await fireEvent.changeText(screen.getByLabelText('Bucket'), 'audiobooks');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('roots');
  await fireEvent.press(screen.getByRole('button', { name: 'Add root' }));
  await fireEvent.changeText(screen.getByLabelText('Root 1'), '/media/books');
  await fireEvent.press(screen.getByRole('button', { name: 'Add root' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit details' }));
  await screen.findByLabelText('Name');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Bucket');
  expect(screen.getByLabelText('Bucket')).toHaveProp('value', 'audiobooks');
  expect(requests).toHaveLength(1);

  await fireEvent.press(screen.getByRole('button', { name: 'Edit details' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Renamed draft');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Bucket');
  expect(requests).toHaveLength(2);
  expect(requests[1]?.body).toMatchObject({ name: 'Renamed draft' });
  expect(screen.getByLabelText('Bucket')).toHaveProp('value', 'media');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Root 1');
  expect(screen.getByLabelText('Root 1')).toHaveProp('value', '/media/books');
  await fireEvent.changeText(screen.getByLabelText('Root 2'), '/media/archive');
  await fireEvent.press(screen.getByRole('button', { name: 'Remove root 1' }));
  expect(screen.getByLabelText('Root 1')).toHaveProp('value', '/media/archive');
  await fireEvent.press(screen.getByRole('button', { name: 'Create library' }));
  await waitFor(() => {
    expect(created).toHaveBeenCalledWith(42);
  });
  expect(requests).toHaveLength(3);
  expect(requests[2]).toMatchObject({
    path: '/api/libraries',
    body: {
      name: 'Renamed draft',
      storagePluginSettings: { bucket: 'media' },
      roots: [{ root: '/media/archive' }],
    },
  });
});
