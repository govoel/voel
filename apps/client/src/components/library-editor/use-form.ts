import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { useSelector } from '@tanstack/react-form';
import { Effect, String as EffectString, Equal, Match, Option, Schema, Struct } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorMetadata,
  LibraryEditorSource,
  libraryFormDefaults,
  libraryFormSchema,
  libraryStorageSettingsAtom,
  requiresPluginConsent,
  saveLibrary,
  settingsDefaults,
  storageSettingsSchema,
} from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';

class StorageSettingsNotLoaded extends Schema.TaggedError<
  StorageSettingsNotLoaded,
  { readonly brand: unique symbol }
>('voel/components/library-editor/use-form/StorageSettingsNotLoaded')(
  'StorageSettingsNotLoaded',
  {}
) {}

const decodeMetadata = Schema.decodeUnknownOption(LibraryEditorMetadata);
const noSettings = Atom.make(
  AsyncResult.initial<Atom.Success<ReturnType<typeof libraryStorageSettingsAtom>>>()
);

export const useLibraryForm = ({
  source,
  onSuccess,
}: {
  readonly source: LibraryEditorSource;
  readonly onSuccess: (result: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  const [requested, setRequested] = useState<
    Option.Option<{
      readonly metadata: typeof LibraryEditorMetadata.Type;
      readonly previous: typeof libraryFormDefaults.storagePluginSettings;
    }>
  >(() =>
    LibraryEditorSource.$is('Edit')(source)
      ? Option.map(decodeMetadata(source.library), (metadata) => ({ metadata, previous: {} }))
      : Option.none()
  );
  const [pending, setPending] = useState<Option.Option<typeof LibraryEditorMetadata.Type>>(
    Option.none()
  );
  const query = Option.match(requested, {
    onNone: () => noSettings,
    onSome: ({ metadata }) =>
      libraryStorageSettingsAtom({
        account,
        id: LibraryEditorSource.$is('Edit')(source)
          ? Option.some(source.library.id)
          : Option.none(),
        request: metadata,
      }),
  });
  const settings = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const requestedMetadata = Option.map(requested, (snapshot) => snapshot.metadata);
  const current = (value: typeof LibraryEditorMetadata.Encoded) =>
    AsyncResult.isSuccess(settings) &&
    !settings.waiting &&
    Equal.equals(requestedMetadata, decodeMetadata(value));
  const defaultValues: typeof libraryFormDefaults = {
    ...libraryFormDefaults,
    name: LibraryEditorSource.$is('Edit')(source) ? source.library.name : '',
    type: LibraryEditorSource.$is('Edit')(source) ? source.library.type : 'audiobook',
    storagePluginId: LibraryEditorSource.$is('Edit')(source)
      ? source.library.storagePluginId
      : 'builtin:local',
  };
  const form = useAppForm({
    schema: libraryFormSchema,
    defaultValues,
    listeners: {
      onChange: ({ fieldApi }) => {
        if (
          fieldApi.name === 'name' ||
          fieldApi.name === 'type' ||
          fieldApi.name === 'storagePluginId'
        ) {
          setPending(Option.none());
        }
      },
    },
    onSubmit: ({ value }) =>
      Option.filter(
        AsyncResult.value(settings),
        (fields) =>
          current(value) && Schema.is(storageSettingsSchema(fields))(value.storagePluginSettings)
      ).pipe(
        Effect.fromOption,
        Effect.catchTag('NoSuchElementError', () => StorageSettingsNotLoaded.make({})),
        Effect.flatMap(() => saveLibrary({ account, source, values: value }))
      ),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('StorageSettingsNotLoaded', () => 'Load storage settings before saving.'),
        Match.orElse((failure) => libraryFailureMessage({ error: failure }))
      ),
    onSuccess: async ({ result }) => onSuccess(result),
  });
  const metadata = useSelector(
    form.store,
    (state) => Struct.pick(state.values, ['name', 'type', 'storagePluginId']),
    { compare: Equal.equals }
  );
  const [canSubmit, submitting] = useSelector(
    form.store,
    (state) => [state.canSubmit, state.isSubmitting] as const
  );
  const input = decodeMetadata(metadata);
  const storage = Option.flatMap(requested, (snapshot) =>
    Option.map(
      Option.filter(AsyncResult.value(settings), () => current(metadata)),
      (descriptors) => ({
        descriptors,
        key: snapshot.metadata.storagePluginId,
        defaultValue: settingsDefaults({ fields: descriptors, previous: snapshot.previous }),
        validators: {
          onChangeAsync: Schema.toStandardSchemaV1(storageSettingsSchema(descriptors)),
        },
      })
    )
  );
  const load = (request: typeof LibraryEditorMetadata.Type) => {
    // This snapshot seeds the next group's defaults; it is not a second live form store.
    const previous = Option.exists(
      requested,
      (snapshot) => snapshot.metadata.storagePluginId === request.storagePluginId
    )
      ? form.state.values.storagePluginSettings
      : {};
    for (const name of Struct.keys(form.state.fieldMeta)) {
      if (
        name === 'storagePluginSettings' ||
        EffectString.startsWith('storagePluginSettings.')(name)
      ) {
        form.resetField(name);
      }
    }
    form.setFieldValue('storagePluginSettings', {}, { dontUpdateMeta: true, dontValidate: true });
    if (Equal.equals(requestedMetadata, Option.some(request))) {
      refresh();
    }
    setRequested(Option.some({ metadata: request, previous }));
  };
  return {
    form,
    metadata,
    settings,
    storage,
    pending,
    submitting,
    ready: Option.isSome(storage) && canSubmit,
    canLoad:
      Option.isSome(input) &&
      (!settings.waiting || !Equal.equals(requestedMetadata, input)) &&
      !submitting,
    handleLoad: () => {
      const request = decodeMetadata(form.state.values);
      if (Option.isNone(request) || submitting) {
        return;
      }
      if (
        requiresPluginConsent({
          source,
          storagePluginId: request.value.storagePluginId,
          approved: Option.map(
            requestedMetadata,
            (requestMetadata) => requestMetadata.storagePluginId
          ),
        })
      ) {
        setPending(request);
      } else {
        load(request.value);
      }
    },
    handleApprove: () => {
      if (Option.isSome(pending)) {
        load(pending.value);
        setPending(Option.none());
      }
    },
    handleCancelConsent: () => {
      setPending(Option.none());
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      form.setFieldValue('storagePluginId', provider === 'local' ? 'builtin:local' : '');
      const request = decodeMetadata(form.state.values);
      if (provider === 'local' && Option.isSome(request)) {
        load(request.value);
      }
    },
  };
};
