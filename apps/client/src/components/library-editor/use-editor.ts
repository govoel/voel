import { useAtom } from '@effect/atom-react';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { Effect, Exit, Option, Schema } from 'effect';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorMetadata,
  LibraryEditorValues,
  fetchLibrarySettings,
  requiresPluginConsent,
  sameSettingsRequest,
  saveLibrary,
  settingsValues,
} from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const decodeMetadata = Schema.decodeUnknownOption(LibraryEditorMetadata);

interface LoadedSettings {
  readonly request: typeof LibraryEditorMetadata.Type;
  readonly fields: typeof StoragePluginSettingsForm.Type;
}

type SettingsStatus =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Failed'; readonly message: string };

const submitLibrary = Effect.fnUntraced(function* ({
  account,
  source,
  values,
  loaded,
  allowed,
}: {
  readonly account: Parameters<typeof saveLibrary>[0]['account'];
  readonly source: LibraryEditorSource;
  readonly values: typeof LibraryEditorValues.Type;
  readonly loaded: Option.Option<LoadedSettings>;
  readonly allowed: boolean;
}) {
  const settings = yield* Effect.fromOption(loaded);
  yield* Schema.decodeUnknownEffect(Schema.Literal(true))(
    allowed && sameSettingsRequest({ first: settings.request, second: values })
  );
  return yield* saveLibrary({ account, source, values, fields: settings.fields });
});

export const useLibraryEditor = ({
  source,
  onSuccess,
}: {
  readonly source: LibraryEditorSource;
  readonly onSuccess: (result: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  const origin = source;
  const [loaded, setLoaded] = useState<Option.Option<LoadedSettings>>(Option.none());
  const [status, setStatus] = useState<SettingsStatus>({ _tag: 'Idle' });
  const [pending, setPending] = useState<Option.Option<typeof LibraryEditorMetadata.Type>>(
    Option.none()
  );
  const approved = useRef<Option.Option<typeof LibraryEditorMetadata.Type.storagePluginId>>(
    Option.none()
  );
  const generation = useRef(0);
  const completed = useRef(false);
  const checkpoint = useRef<
    Option.Option<{
      readonly values: typeof LibraryEditorValues.Encoded;
      readonly loaded: typeof loaded;
    }>
  >(Option.none());
  const loadAtom = useMemo(
    () =>
      AppRuntime.fn((request: typeof LibraryEditorMetadata.Type) =>
        fetchLibrarySettings({ account, source: origin, request })
      ),
    [account, origin]
  );
  const [, runLoad] = useAtom(loadAtom, { mode: 'promiseExit' });
  const form = useAppForm({
    schema: LibraryEditorValues,
    defaultValues: {
      name: origin._tag === 'Edit' ? origin.library.name : '',
      type: origin._tag === 'Edit' ? origin.library.type : 'audiobook',
      storagePluginId: origin._tag === 'Edit' ? origin.library.storagePluginId : 'builtin:local',
      textValues: {},
      listValues: {},
    },
    listeners: {
      onChange: ({ fieldApi }) => {
        if (
          fieldApi.name === 'name' ||
          fieldApi.name === 'type' ||
          fieldApi.name === 'storagePluginId'
        ) {
          generation.current += 1;
          setStatus({ _tag: 'Idle' });
          setPending(Option.none());
        }
      },
    },
    onSubmit: ({ value }) =>
      submitLibrary({
        account,
        source: origin,
        values: value,
        loaded,
        allowed:
          status._tag === 'Idle' &&
          Option.isNone(pending) &&
          !requiresPluginConsent({
            source: origin,
            storagePluginId: value.storagePluginId,
            approved: approved.current,
          }),
      }),
    onFailure: ({ error }) =>
      error._tag === 'NoSuchElementError'
        ? 'Load storage settings before saving.'
        : libraryFailureMessage({ error }),
    onSuccess: async ({ result }) => {
      completed.current = true;
      await onSuccess(result);
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const request = decodeMetadata(values);
  const ready =
    Option.isSome(request) &&
    Option.isSome(loaded) &&
    sameSettingsRequest({ first: request.value, second: loaded.value.request });

  const startLoad = useCallback(
    async (input: typeof LibraryEditorMetadata.Type) => {
      generation.current += 1;
      const token = generation.current;
      setPending(Option.none());
      setStatus({ _tag: 'Loading' });
      const result = await runLoad(input);
      if (token !== generation.current) {
        return;
      }
      const current = decodeMetadata(form.state.values);
      if (Option.isNone(current) || !sameSettingsRequest({ first: input, second: current.value })) {
        return;
      }
      if (Exit.isFailure(result)) {
        const error = Exit.findErrorOption(result);
        setStatus({
          _tag: 'Failed',
          message: Option.match(error, {
            onNone: () => 'Unable to load storage settings. Try again.',
            onSome: (failure) => libraryFailureMessage({ error: failure }),
          }),
        });
        return;
      }
      const defaults = settingsValues({
        fields: result.value,
        previous:
          Option.isSome(loaded) && loaded.value.request.storagePluginId === input.storagePluginId
            ? Option.some(form.state.values)
            : Option.none(),
      });
      form.setFieldValue('textValues', defaults.textValues, { dontUpdateMeta: true });
      form.setFieldValue('listValues', defaults.listValues, { dontUpdateMeta: true });
      setLoaded(Option.some({ request: input, fields: result.value }));
      setStatus({ _tag: 'Idle' });
    },
    [runLoad, form, loaded]
  );

  const load = () => {
    const input = decodeMetadata(form.state.values);
    if (Option.isNone(input) || submitting) {
      return;
    }
    if (
      requiresPluginConsent({
        source: origin,
        storagePluginId: input.value.storagePluginId,
        approved: approved.current,
      })
    ) {
      setPending(input);
    } else {
      void startLoad(input.value);
    }
  };

  const loadInitial = useEffectEvent(() => {
    const input = decodeMetadata(form.state.values);
    if (
      Option.isSome(input) &&
      !requiresPluginConsent({
        source: origin,
        storagePluginId: input.value.storagePluginId,
        approved: approved.current,
      })
    ) {
      void startLoad(input.value);
    }
  });
  const invalidateRequests = useEffectEvent(() => {
    generation.current += 1;
  });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        loadInitial();
      }
      return void 0;
    });
    return () => {
      active = false;
      invalidateRequests();
    };
  }, []);

  return {
    form,
    values,
    origin,
    loaded,
    status,
    pending,
    submitting,
    completed,
    ready: ready && status._tag === 'Idle' && Option.isNone(pending),
    canEditStorage: Schema.is(LibraryEditorMetadata.fields.name)(values.name) && !submitting,
    canLoad: Option.isSome(request) && status._tag !== 'Loading' && !submitting,
    handleLoad: load,
    approve: () => {
      if (Option.isSome(pending)) {
        const current = decodeMetadata(form.state.values);
        if (
          Option.isSome(current) &&
          sameSettingsRequest({ first: pending.value, second: current.value })
        ) {
          approved.current = Option.some(pending.value.storagePluginId);
          void startLoad(pending.value);
        }
      }
    },
    cancelConsent: () => {
      if (Option.isNone(pending)) {
        return;
      }
      setPending(Option.none());
      if (Option.isSome(loaded)) {
        form.setFieldValue('storagePluginId', loaded.value.request.storagePluginId);
      }
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      form.setFieldValue('storagePluginId', provider === 'local' ? 'builtin:local' : '');
      if (provider === 'local') {
        const input = decodeMetadata(form.state.values);
        if (Option.isSome(input)) {
          void startLoad(input.value);
        }
      }
    },
    beginStorageEdit: () => {
      checkpoint.current = Option.some({ values: form.state.values, loaded });
    },
    acceptStorageEdit: () => {
      checkpoint.current = Option.none();
    },
    cancelStorageEdit: () => {
      if (Option.isSome(checkpoint.current)) {
        const previous = checkpoint.current.value;
        generation.current += 1;
        form.setFieldValue('storagePluginId', previous.values.storagePluginId, {
          dontUpdateMeta: true,
        });
        form.setFieldValue('textValues', previous.values.textValues, { dontUpdateMeta: true });
        form.setFieldValue('listValues', previous.values.listValues, { dontUpdateMeta: true });
        setLoaded(previous.loaded);
        setStatus({ _tag: 'Idle' });
        setPending(Option.none());
        checkpoint.current = Option.none();
      }
    },
  };
};

export type LibraryEditor = ReturnType<typeof useLibraryEditor>;
