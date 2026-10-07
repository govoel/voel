import { StoragePluginSettingsError, StoragePluginSettingsForm } from '@govoel/plugins/storage';
import type { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Exit, Layer, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { makeStoragePluginSettingsFormOptions } from '#src/components/storage-plugin-settings-form/adapter.ts';
import { useStoragePluginSettingsForm } from '#src/components/storage-plugin-settings-form/index.ts';

// Use the real form hook without loading SwiftUI/Compose controls in headless tests.
vi.mock('#src/components/form', async () => {
  const { createEffectSchemaFormHook, fieldContext, formContext } =
    await import('#src/components/form/hooks.tsx');
  return createEffectSchemaFormHook({
    fieldContext,
    formContext,
    fieldComponents: {},
    formComponents: {},
  });
});

const makeFields = async () =>
  Effect.runPromise(
    Schema.decodeEffect(StoragePluginSettingsForm)([
      {
        _tag: 'TextField',
        name: 'endpoint',
        label: 'Endpoint',
        placeholder: 'https://storage.example.com',
        purpose: 'url',
        initialValue: 'https://initial.example.com',
      },
      {
        _tag: 'TextField',
        name: 'prefix',
        label: 'Prefix',
        placeholder: 'Optional prefix',
        initialValue: '',
      },
    ])
  );

const runtime = Atom.runtime(Layer.empty);

describe('storage plugin settings adapter', () => {
  it('derives defaults and a branded JSON submission without semantic validation', async () => {
    const fields = await makeFields();
    const { schema, defaultValues } = makeStoragePluginSettingsFormOptions({ fields });
    expect(defaultValues).toEqual({ endpoint: 'https://initial.example.com', prefix: '' });
    const input = await Effect.runPromise(
      Schema.decodeEffect(schema)({ endpoint: 'not a URL', prefix: '  ' })
    );
    expectTypeOf(input).toEqualTypeOf<StoragePluginSettingsInput>();
    expect(input).toEqual({ endpoint: 'not a URL', prefix: '  ' });
  });

  it('requires declared strings and rejects undeclared fields', async () => {
    const fields = await makeFields();
    const { schema } = makeStoragePluginSettingsFormOptions({ fields });
    const decode = async (input: unknown) =>
      Effect.runPromiseExit(Schema.decodeUnknownEffect(schema)(input));
    expect(Exit.isFailure(await decode({ prefix: '' }))).toBe(true);
    expect(Exit.isFailure(await decode({ endpoint: 123, prefix: '' }))).toBe(true);
    expect(
      Exit.isFailure(await decode({ endpoint: '', prefix: '', password: 'not a form field' }))
    ).toBe(true);
  });

  it('treats an empty form as a strict JSON object', async () => {
    const { schema, defaultValues } = makeStoragePluginSettingsFormOptions({ fields: [] });
    expect(defaultValues).toEqual({});
    const decode = async (input: unknown) =>
      Effect.runPromiseExit(Schema.decodeUnknownEffect(schema)(input));
    expect(await decode({})).toEqual(Exit.succeed({}));
    expect(Exit.isFailure(await decode(void 0))).toBe(true);
    expect(Exit.isFailure(await decode({ extra: '' }))).toBe(true);
  });
});

describe('useStoragePluginSettingsForm', () => {
  it('submits empty settings to configure a no-settings plugin', async () => {
    const submit = vi.fn((_input: StoragePluginSettingsInput) => Effect.succeed('configured'));
    const mutation = runtime.fn(submit);
    const onSuccess = vi.fn();
    const { result } = await renderHook(() =>
      useStoragePluginSettingsForm({
        fields: [],
        mutation,
        onFailure: () => 'failed',
        onSuccess,
      })
    );
    await act(async () => {
      await result.current.form.handleSubmit();
    });
    expect(submit.mock.calls[0]?.[0]).toEqual({});
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ value: {}, result: 'configured' })
    );
  });

  it('preserves field metadata/order and dirty edits across descriptor refreshes until reset', async () => {
    const fields = await makeFields();
    const mutation = runtime.fn((_input: StoragePluginSettingsInput) => Effect.void);
    const { result, rerender } = await renderHook(
      ({ descriptors }: { readonly descriptors: StoragePluginSettingsForm }) =>
        useStoragePluginSettingsForm({
          fields: descriptors,
          mutation,
          onFailure: () => 'failed',
        }),
      { initialProps: { descriptors: fields } }
    );
    expect(result.current.fields).toEqual(fields);
    expect(result.current.form.state.isDirty).toBe(false);
    await act(async () => {
      result.current.form.setFieldValue('endpoint', 'draft');
    });
    expect(result.current.form.state.isDirty).toBe(true);

    const refreshed = fields.map((field) => ({ ...field, initialValue: 'refreshed' }));
    await rerender({ descriptors: refreshed });
    expect(result.current.form.state.values['endpoint']).toBe('draft');

    await act(async () => {
      result.current.form.reset();
    });
    expect(result.current.form.state.values).toEqual({
      endpoint: 'refreshed',
      prefix: 'refreshed',
    });
    expect(result.current.form.state.isDirty).toBe(false);
  });

  it('keeps drafts after plugin rejection and supports retry while exposing submission state', async () => {
    const fields = await makeFields();
    const gate = Deferred.makeUnsafe<boolean>();
    const onSuccess = vi.fn();
    const onFailure = vi.fn(({ error }: { error: StoragePluginSettingsError }) => error.message);
    let attempts = 0;
    const submit = vi.fn((_input: StoragePluginSettingsInput) => {
      attempts += 1;
      return attempts === 1
        ? Effect.fail(StoragePluginSettingsError.make({ message: 'Plugin rejected settings' }))
        : Deferred.await(gate).pipe(Effect.as('saved'));
    });
    const mutation = runtime.fn(submit);
    const { result } = await renderHook(() =>
      useStoragePluginSettingsForm({ fields, mutation, onSuccess, onFailure })
    );
    await act(async () => {
      result.current.form.setFieldValue('endpoint', 'plugin-specific location');
      await result.current.form.handleSubmit();
    });
    expect(onFailure.mock.calls[0]?.[0].error).toMatchObject({
      _tag: 'StoragePluginSettingsError',
      message: 'Plugin rejected settings',
    });
    expect(result.current.form.state.values['endpoint']).toBe('plugin-specific location');
    expect(result.current.form.state.isDirty).toBe(true);
    expect(result.current.form.state.canSubmit).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();

    let submission: Promise<void> = Promise.resolve();
    await act(async () => {
      submission = result.current.form.handleSubmit();
    });
    await waitFor(() => {
      expect(result.current.form.state.isSubmitting).toBe(true);
      expect(submit).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(gate, true));
      await submission;
    });
    expect(result.current.form.state.isSubmitting).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'saved',
        value: { endpoint: 'plugin-specific location', prefix: '' },
      })
    );
  });
});
