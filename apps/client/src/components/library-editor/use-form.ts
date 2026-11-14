import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { Array, Effect, Equal, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorMetadata,
  LibraryEditorSource,
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

const noSettings = Atom.make(
  AsyncResult.initial<Atom.Success<ReturnType<typeof libraryStorageSettingsAtom>>>()
);

interface StorageSnapshot {
  readonly key: string;
  readonly metadata: typeof LibraryEditorMetadata.Type;
  readonly descriptors: typeof StoragePluginSettingsForm.Type;
  readonly values: ReturnType<typeof settingsDefaults>;
}

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
  const [approved, setApproved] = useState<
    Option.Option<typeof LibraryEditorMetadata.Type.storagePluginId>
  >(Option.none());
  const [pending, setPending] = useState<Option.Option<typeof LibraryEditorMetadata.Type>>(
    Option.none()
  );
  const [committed, setCommitted] = useState<Option.Option<StorageSnapshot>>(Option.none());
  const form = useAppForm({
    schema: LibraryEditorMetadata,
    defaultValues: LibraryEditorSource.$match(source, {
      Create: () =>
        ({
          name: '',
          type: 'audiobook',
          storagePluginId: 'builtin:local',
        }) satisfies typeof LibraryEditorMetadata.Encoded,
      Edit: ({ library }) => ({
        name: library.name,
        type: library.type,
        storagePluginId: library.storagePluginId,
      }),
    }),
    listeners: {
      onChange: () => {
        setPending(Option.none());
        setCommitted(Option.none());
      },
    },
    onSubmit: ({ value }) =>
      Effect.flatMap(
        current(value) && Option.isSome(storage)
          ? Effect.succeed(storage.value)
          : Effect.fail(StorageSettingsNotLoaded.make({})),
        (snapshot) =>
          Effect.flatMap(
            Schema.decodeEffect(storageSettingsSchema(snapshot.descriptors))(snapshot.values),
            (values) =>
              saveLibrary({
                account,
                source,
                values: {
                  ...value,
                  storagePluginSettings:
                    Library.jsonCreate.fields.storagePluginSettings.make(values),
                },
              })
          )
      ),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('StorageSettingsNotLoaded', () => 'Configure storage settings before saving.'),
        Match.orElse((failure) => libraryFailureMessage({ error: failure }))
      ),
    onSuccess: async ({ result }) => onSuccess(result),
  });
  const metadata = useSelector(form.store, (state) => state.values, { compare: Equal.equals });
  const [canSubmit, submitting] = useSelector(
    form.store,
    (state) => [state.canSubmit, state.isSubmitting] as const
  );
  const input: Option.Option<typeof LibraryEditorMetadata.Type> =
    LibraryEditorMetadata.decodeUnknownOption(metadata);
  const request = Option.filter(
    input,
    ({ storagePluginId }) => !requiresPluginConsent({ source, storagePluginId, approved })
  );
  const query = Option.match(request, {
    onNone: () => noSettings,
    onSome: (requestMetadata) =>
      libraryStorageSettingsAtom({
        account,
        id: LibraryEditorSource.$match(source, {
          Create: () => Option.none(),
          Edit: ({ library }) => Option.some(library.id),
        }),
        request: requestMetadata,
      }),
  });
  const settings = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const current = (value: typeof LibraryEditorMetadata.Encoded) =>
    AsyncResult.isSuccess(settings) &&
    !settings.waiting &&
    Option.isSome(request) &&
    Equal.equals(request, LibraryEditorMetadata.decodeUnknownOption(value));
  const storage: Option.Option<StorageSnapshot> = Option.flatMap(
    Option.filter(request, () => current(metadata)),
    (requestMetadata) =>
      Option.map(AsyncResult.value(settings), (descriptors) => ({
        key: Array.join(
          Array.map(
            [requestMetadata.name, requestMetadata.type, requestMetadata.storagePluginId],
            (part) => `${part.length}:${part}`
          ),
          ''
        ),
        metadata: requestMetadata,
        descriptors,
        // Loaded defaults are usable without opening the settings form.
        values: Option.match(
          Option.filter(
            committed,
            (snapshot) =>
              Equal.equals(snapshot.metadata, requestMetadata) &&
              snapshot.descriptors === descriptors
          ),
          {
            onNone: () => settingsDefaults({ fields: descriptors }),
            onSome: (snapshot) => snapshot.values,
          }
        ),
      }))
  );
  return {
    form,
    metadata,
    settings,
    storage,
    pending,
    submitting,
    ready: Option.isSome(storage) && canSubmit,
    canOpenStorage: Option.isSome(input) && !submitting,
    needsConsent: Option.isSome(input) && Option.isNone(request),
    handleRetry: refresh,
    commitStorage: ({
      storage: snapshot,
      values,
    }: {
      readonly storage: Option.Option.Value<typeof storage>;
      readonly values: ReturnType<typeof settingsDefaults>;
    }) =>
      Effect.andThen(
        current(form.state.values) &&
          Equal.equals(
            LibraryEditorMetadata.decodeUnknownOption(form.state.values),
            Option.some(snapshot.metadata)
          ) &&
          AsyncResult.isSuccess(settings) &&
          settings.value === snapshot.descriptors
          ? Effect.void
          : Effect.fail(StorageSettingsNotLoaded.make({})),
        () =>
          Effect.map(
            Schema.decodeEffect(storageSettingsSchema(snapshot.descriptors))(values),
            (validated) => {
              setCommitted(Option.some({ ...snapshot, values: validated }));
            }
          )
      ),
    handleRequestConsent: () => {
      if (Option.isSome(input) && !submitting) {
        setPending(input);
      }
    },
    handleApprove: () => {
      if (Option.isSome(pending)) {
        setApproved(Option.some(pending.value.storagePluginId));
        setPending(Option.none());
      }
    },
    handleCancelConsent: () => {
      setPending(Option.none());
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      form.setFieldValue('storagePluginId', provider === 'local' ? 'builtin:local' : '');
    },
  };
};
